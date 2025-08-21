/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { ToolConfirmationOutcome } from '../../tools/tools.js';
import { ResourcePoolFactory } from './resource-pools.js';
/**
 * Helper methods for the BuiltinToolManager to maintain clean separation of concerns
 */
export class BuiltinToolManagerHelpers {
    /**
     * Execute tool with resource pooling and error handling
     */
    static async executeToolOptimized(tool, toolCall, context, toolBehaviors, fileSystemBoundary, shellSecurity, webHandler) {
        let resourcePool = null;
        let resource = null;
        try {
            // Acquire appropriate resource if needed
            const resourceType = this.getResourceTypeForTool(toolCall.name);
            if (resourceType) {
                resourcePool = this.getResourcePool(resourceType);
                resource = await resourcePool.acquire(5000); // 5 second timeout
            }
            // Build tool invocation
            const invocation = tool.build(toolCall.parameters);
            // Handle confirmation flow if needed
            const confirmationDetails = await invocation.shouldConfirmExecute(context.signal);
            if (confirmationDetails) {
                const confirmed = await this.handleConfirmation(confirmationDetails, context);
                if (!confirmed) {
                    return {
                        toolCallId: toolCall.id,
                        content: 'Tool execution cancelled by user',
                        isError: false,
                    };
                }
            }
            // Execute with resource context
            const executionContext = { ...context, resource };
            const toolResult = await invocation.execute(context.signal, undefined, // updateOutput callback
            undefined, // terminalColumns
            undefined // terminalRows
            );
            return this.convertFromToolResult(toolCall.id, toolResult);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[BuiltinToolManagerHelpers] Tool execution failed:`, error);
            return {
                toolCallId: toolCall.id,
                content: `Tool execution failed: ${errorMessage}`,
                isError: true,
            };
        }
        finally {
            // Release resource back to pool
            if (resourcePool && resource) {
                resourcePool.release(resource);
            }
        }
    }
    /**
     * Validate tool security across all security components
     */
    static async validateToolSecurity(toolCall, context, toolBehaviors, fileSystemBoundary, shellSecurity, webHandler) {
        try {
            // Check if tool is allowed by configuration
            if (!toolBehaviors.isToolAllowed(toolCall.name)) {
                return {
                    allowed: false,
                    reason: `Tool ${toolCall.name} is disabled in configuration`,
                    riskLevel: 'HIGH',
                };
            }
            // Tool-specific security validation
            switch (this.getToolCategory(toolCall.name)) {
                case 'filesystem':
                    return await this.validateFileSystemTool(toolCall, fileSystemBoundary);
                case 'system':
                    if (toolCall.name === 'run_shell_command') {
                        return this.validateShellTool(toolCall, shellSecurity);
                    }
                    break;
                case 'web':
                    return this.validateWebTool(toolCall, webHandler);
            }
            // Default validation
            const toolConfig = toolBehaviors.getToolConfig(toolCall.name);
            return {
                allowed: true,
                riskLevel: toolConfig.securityLevel,
                requiresConfirmation: toolConfig.requiresConfirmation,
            };
        }
        catch (error) {
            console.error('[BuiltinToolManagerHelpers] Security validation failed:', error);
            return {
                allowed: false,
                reason: 'Security validation error',
                riskLevel: 'CRITICAL',
            };
        }
    }
    /**
     * Validate file system tool operations
     */
    static async validateFileSystemTool(toolCall, fileSystemBoundary) {
        const filePath = toolCall.parameters.file_path || toolCall.parameters.path;
        if (filePath && typeof filePath === 'string') {
            const validation = fileSystemBoundary.validatePath(filePath);
            if (!validation.valid) {
                return {
                    allowed: false,
                    reason: validation.reason,
                    riskLevel: 'HIGH',
                };
            }
            // Check if path should be ignored (like .git, node_modules)
            if (fileSystemBoundary.shouldIgnorePath(filePath)) {
                return {
                    allowed: false,
                    reason: 'Path is in ignore list (git ignore, system directories)',
                    riskLevel: 'MODERATE',
                };
            }
        }
        // Check for batch operations
        const filePaths = toolCall.parameters.file_paths || toolCall.parameters.paths;
        if (Array.isArray(filePaths)) {
            for (const path of filePaths) {
                if (typeof path === 'string') {
                    const validation = fileSystemBoundary.validatePath(path);
                    if (!validation.valid) {
                        return {
                            allowed: false,
                            reason: `Invalid path in batch operation: ${validation.reason}`,
                            riskLevel: 'HIGH',
                        };
                    }
                }
            }
        }
        return {
            allowed: true,
            riskLevel: 'SAFE',
        };
    }
    /**
     * Validate shell tool commands
     */
    static validateShellTool(toolCall, shellSecurity) {
        const command = toolCall.parameters.command;
        if (!command || typeof command !== 'string') {
            return {
                allowed: false,
                reason: 'Invalid or missing shell command',
                riskLevel: 'HIGH',
            };
        }
        const validation = shellSecurity.validateCommand(command);
        return {
            allowed: validation.allowed,
            reason: validation.reason,
            riskLevel: validation.securityLevel,
            requiresConfirmation: validation.securityLevel !== 'SAFE',
        };
    }
    /**
     * Validate web tool requests
     */
    static validateWebTool(toolCall, webHandler) {
        let urlsToValidate = [];
        // Extract URLs based on tool type
        if (toolCall.name === 'web_fetch') {
            const prompt = toolCall.parameters.prompt;
            if (typeof prompt === 'string') {
                const validation = webHandler.validatePromptUrls(prompt);
                urlsToValidate = validation.urls;
                if (!validation.overallAllowed) {
                    const blockedUrls = validation.validationResults
                        .filter(result => !result.allowed)
                        .map((result, index) => validation.urls[index]);
                    return {
                        allowed: false,
                        reason: `Blocked URLs detected: ${blockedUrls.join(', ')}`,
                        riskLevel: 'HIGH',
                    };
                }
                // Check if any URLs require confirmation
                const requiresConfirmation = validation.validationResults
                    .some(result => result.requiresConfirmation);
                return {
                    allowed: true,
                    riskLevel: validation.highestRiskLevel,
                    requiresConfirmation,
                };
            }
        }
        else if (toolCall.name === 'google_web_search') {
            // Web search is generally safe, but check for malicious queries
            const query = toolCall.parameters.query;
            if (typeof query === 'string') {
                // Basic validation for search queries
                const suspiciousPatterns = [/<script>/i, /javascript:/i, /data:/i];
                const hasSuspiciousContent = suspiciousPatterns.some(pattern => pattern.test(query));
                if (hasSuspiciousContent) {
                    return {
                        allowed: false,
                        reason: 'Suspicious patterns detected in search query',
                        riskLevel: 'MODERATE',
                    };
                }
            }
        }
        return {
            allowed: true,
            riskLevel: 'SAFE',
        };
    }
    /**
     * Handle tool confirmation flow
     */
    static async handleConfirmation(confirmationDetails, context) {
        if (!context.confirmationCallback) {
            // No confirmation callback provided, default to allowing
            console.warn('[BuiltinToolManagerHelpers] No confirmation callback provided, defaulting to allow');
            return true;
        }
        try {
            const outcome = await context.confirmationCallback({
                type: confirmationDetails.type,
                title: confirmationDetails.title || 'Confirm Tool Execution',
                message: this.formatConfirmationMessage(confirmationDetails),
                toolName: confirmationDetails.type === 'exec' ?
                    confirmationDetails.rootCommand || 'unknown' : 'unknown',
                riskLevel: 'MODERATE', // Default risk level
            });
            // Handle confirmation outcome
            if (outcome === 'proceed' || outcome === 'always') {
                if (confirmationDetails.onConfirm) {
                    await confirmationDetails.onConfirm(outcome === 'always' ? ToolConfirmationOutcome.ProceedAlways : ToolConfirmationOutcome.Proceed);
                }
                return true;
            }
            return false;
        }
        catch (error) {
            console.error('[BuiltinToolManagerHelpers] Confirmation failed:', error);
            return false; // Default to reject on error
        }
    }
    /**
     * Format confirmation message for user display
     */
    static formatConfirmationMessage(confirmationDetails) {
        switch (confirmationDetails.type) {
            case 'exec':
                const execDetails = confirmationDetails;
                return `Execute command: ${execDetails.command}`;
            case 'info':
                const infoDetails = confirmationDetails;
                if (infoDetails.urls && infoDetails.urls.length > 0) {
                    return `Fetch content from: ${infoDetails.urls.join(', ')}`;
                }
                return infoDetails.prompt || 'Execute tool operation';
            default:
                return 'Confirm tool execution';
        }
    }
    /**
     * Convert internal ToolResult to UnifiedToolResult
     */
    static convertFromToolResult(toolCallId, result) {
        return {
            toolCallId,
            content: result.llmContent || result.returnDisplay || '',
            isError: false, // ToolResult doesn't have explicit error field
            displayContent: result.returnDisplay,
            metadata: {
                executionTime: Date.now(), // Would need to track this properly
                fromCache: false,
            },
        };
    }
    /**
     * Create error result with consistent format
     */
    static createErrorResult(toolCallId, errorMessage) {
        return {
            toolCallId,
            content: errorMessage,
            isError: true,
            metadata: {
                executionTime: Date.now(),
                fromCache: false,
            },
        };
    }
    /**
     * Get resource type needed for a tool
     */
    static getResourceTypeForTool(toolName) {
        const resourceMap = {
            'web_fetch': 'http',
            'google_web_search': 'http',
            'read_file': 'files',
            'write_file': 'files',
            'edit_file': 'files',
            'read_many_files': 'files',
        };
        return resourceMap[toolName] || null;
    }
    /**
     * Get resource pool for a resource type
     */
    static getResourcePool(resourceType) {
        switch (resourceType) {
            case 'http':
                return ResourcePoolFactory.getHttpPool();
            case 'files':
                return ResourcePoolFactory.getFilePool();
            default:
                return null;
        }
    }
    /**
     * Get tool category for security validation
     */
    static getToolCategory(toolName) {
        const categoryMap = {
            'read_file': 'filesystem',
            'write_file': 'filesystem',
            'edit_file': 'filesystem',
            'ls': 'filesystem',
            'glob': 'filesystem',
            'grep': 'filesystem',
            'read_many_files': 'filesystem',
            'web_fetch': 'web',
            'google_web_search': 'web',
            'run_shell_command': 'system',
            'save_memory': 'system',
        };
        return categoryMap[toolName] || 'other';
    }
    /**
     * Check if tool results should be cached
     */
    static shouldCacheResult(toolName) {
        const cacheableTools = [
            'read_file',
            'web_fetch',
            'google_web_search',
            'ls',
            'glob',
            'grep',
        ];
        return cacheableTools.includes(toolName);
    }
    /**
     * Pre-warm commonly used tools for better initial performance
     */
    static async preWarmTools(builtinTools) {
        const commonTools = ['read_file', 'write_file', 'ls'];
        // Pre-create resource pools
        ResourcePoolFactory.getHttpPool();
        ResourcePoolFactory.getFilePool();
        console.debug(`[BuiltinToolManagerHelpers] Pre-warmed ${commonTools.length} common tools`);
    }
    /**
     * Record execution statistics
     */
    static recordExecution(toolName, executionTime, success, stats, performanceOptimizer) {
        // Update internal statistics
        if (success) {
            stats.successfulExecutions++;
        }
        // Update execution times (keep last 50)
        stats.lastExecutionTimes.push(executionTime);
        if (stats.lastExecutionTimes.length > 50) {
            stats.lastExecutionTimes.shift();
        }
        // Calculate average execution time
        stats.averageExecutionTime =
            stats.lastExecutionTimes.reduce((a, b) => a + b, 0) / stats.lastExecutionTimes.length;
        // Record in performance optimizer
        performanceOptimizer.recordExecution(toolName, executionTime, success);
    }
    /**
     * Convert Gemini schema to unified tool format
     */
    static convertToUnified(declaration, tool) {
        return {
            name: tool.name,
            description: tool.description,
            parameters: declaration.parameters || {
                type: 'object',
                properties: {},
                required: [],
            },
            metadata: {
                category: this.getToolCategory(tool.name),
                kind: tool.kind || 'other',
                displayName: tool.displayName,
            },
        };
    }
}
//# sourceMappingURL=builtin-tool-manager-helpers.js.map