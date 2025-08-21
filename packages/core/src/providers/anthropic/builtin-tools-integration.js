/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { ToolConfirmationOutcome } from '../../tools/tools.js';
import { BuiltinToolManager } from '../tools/builtin-tool-manager.js';
import { ToolBehaviorManager } from '../tools/tool-behaviors.js';
import { FileSystemBoundary } from '../tools/filesystem-boundary.js';
import { AnthropicToolAdapter } from './tool-adapter.js';
/**
 * Anthropic-specific integration for Gemini CLI's built-in tools.
 * This class provides a complete implementation for using all 11 built-in tools
 * with Anthropic's API, maintaining the same behavior, security, and confirmation flows
 * as the original Gemini implementation.
 *
 * Features:
 * - Full access to all built-in tools (file system, web, system)
 * - Consistent confirmation flows and security boundaries
 * - Error handling and validation
 * - Progress reporting and cancellation support
 * - Native Anthropic tool_use format support
 */
export class AnthropicBuiltinToolsIntegration {
    config;
    toolManager;
    adapter;
    behaviorManager;
    fileSystemBoundary;
    constructor(config) {
        this.config = config;
        this.toolManager = new BuiltinToolManager(config);
        this.adapter = new AnthropicToolAdapter();
        this.behaviorManager = new ToolBehaviorManager(config);
        this.fileSystemBoundary = new FileSystemBoundary(config);
    }
    /**
     * Initialize the tool integration system.
     * This sets up all the built-in tools and security boundaries.
     */
    async initialize() {
        // Initialize the built-in tool manager
        await this.toolManager.initialize();
        // Initialize file system boundary enforcement
        await this.fileSystemBoundary.initialize();
        console.debug('[Anthropic Integration] Initialized built-in tools integration');
    }
    /**
     * Get all built-in tools formatted for Anthropic API.
     * Returns tools in the format expected by Anthropic's tool use functionality.
     *
     * @returns Array of Anthropic-formatted tools
     */
    getProviderTools() {
        const unifiedTools = this.toolManager.getUnifiedTools();
        return this.adapter.batchToProviderFormat(unifiedTools);
    }
    /**
     * Execute tool use blocks from Anthropic response.
     * Handles multiple tool uses in sequence while maintaining proper confirmation flows.
     *
     * @param toolUseBlocks - Array of Anthropic tool use blocks
     * @param options - Execution options
     * @returns Array of Anthropic tool results
     */
    async executeToolCalls(toolUseBlocks, options = {}) {
        // Validate and convert tool use blocks
        const validatedUseBlocks = this.validateAndConvertToolUse(toolUseBlocks);
        if (validatedUseBlocks.length === 0) {
            return [];
        }
        const results = [];
        // Execute tools sequentially to maintain proper confirmation flow
        // (parallel execution could lead to confirmation conflicts)
        for (const toolUse of validatedUseBlocks) {
            try {
                const result = await this.executeSingleTool(toolUse, options);
                results.push(result);
            }
            catch (error) {
                console.error(`Error executing tool ${toolUse.name}:`, error);
                results.push(this.adapter.createErrorResult(toolUse.id, error instanceof Error ? error.message : String(error)));
            }
        }
        return results;
    }
    /**
     * Validate tool use blocks and convert them to proper format.
     *
     * @private
     */
    validateAndConvertToolUse(toolUseBlocks) {
        const validUseBlocks = [];
        for (const useBlock of toolUseBlocks) {
            if (this.adapter.isValidToolUse(useBlock)) {
                validUseBlocks.push(useBlock);
            }
            else {
                console.warn('Invalid Anthropic tool use format:', useBlock);
            }
        }
        return validUseBlocks;
    }
    /**
     * Execute a single tool use with full error handling and validation.
     *
     * @private
     */
    async executeSingleTool(toolUse, options) {
        const unifiedCall = this.adapter.fromProviderToolCall(toolUse);
        // Validate tool security
        const securityError = this.behaviorManager.validateToolSecurity(unifiedCall.name, unifiedCall.arguments);
        if (securityError) {
            return this.adapter.createErrorResult(toolUse.id, securityError);
        }
        // Create execution context
        const abortSignal = options.abortSignal || new AbortController().signal;
        const context = {
            config: this.config,
            signal: abortSignal, // Add signal property
            abortSignal: abortSignal,
            onProgress: options.onProgress,
            onConfirmation: options.onConfirmation
                ? async (request) => {
                    try {
                        const approved = await options.onConfirmation(request);
                        return approved
                            ? ToolConfirmationOutcome.ProceedOnce
                            : ToolConfirmationOutcome.Cancel;
                    }
                    catch (error) {
                        console.error('Confirmation handler error:', error);
                        return ToolConfirmationOutcome.Cancel;
                    }
                }
                : undefined,
        };
        // Execute the tool
        const result = await this.toolManager.executeTool(unifiedCall, context);
        // Convert result to Anthropic format
        return this.adapter.toProviderToolResult(result);
    }
    /**
     * Get information about available tools.
     * Useful for debugging and system introspection.
     *
     * @returns Tool information summary
     */
    getToolInfo() {
        const tools = this.getProviderTools();
        const toolNames = this.adapter.extractToolNames(tools);
        // Categorize tools by their behavior/type
        const toolsByCategory = {
            fileSystem: [],
            web: [],
            system: [],
            other: []
        };
        for (const name of toolNames) {
            const kind = this.behaviorManager.getToolKind(name);
            if (['read', 'edit', 'search'].includes(kind)) {
                toolsByCategory['fileSystem'].push(name);
            }
            else if (kind === 'fetch') {
                toolsByCategory['web'].push(name);
            }
            else if (['execute', 'think'].includes(kind)) {
                toolsByCategory['system'].push(name);
            }
            else {
                toolsByCategory['other'].push(name);
            }
        }
        return {
            totalTools: tools.length,
            toolNames,
            toolsByCategory,
        };
    }
    /**
     * Check if a specific tool is available.
     *
     * @param toolName - Name of the tool to check
     * @returns True if tool is available
     */
    hasTool(toolName) {
        return this.toolManager.hasTool(toolName);
    }
    /**
     * Get the behavior configuration for a specific tool.
     *
     * @param toolName - Name of the tool
     * @returns Tool configuration
     */
    getToolBehavior(toolName) {
        return this.behaviorManager.getToolConfig(toolName);
    }
    /**
     * Validate tool use before execution.
     * Provides early validation without executing the tool.
     *
     * @param toolCall - Tool call to validate
     * @returns Validation result
     */
    validateToolCall(toolCall) {
        // Convert UnifiedToolCall to AnthropicToolUse for adapter validation
        const toolUse = {
            id: toolCall.id,
            type: 'tool_use',
            name: toolCall.name,
            input: toolCall.arguments,
        };
        if (!this.adapter.isValidToolUse(toolUse)) {
            return {
                valid: false,
                error: 'Invalid tool use format'
            };
        }
        const warnings = [];
        // Check if tool exists
        if (!this.toolManager.hasTool(toolCall.name)) {
            return {
                valid: false,
                error: `Unknown tool: ${toolCall.name}`
            };
        }
        // Check security constraints
        const securityError = this.behaviorManager.validateToolSecurity(toolCall.name, toolCall.arguments);
        if (securityError) {
            return {
                valid: false,
                error: securityError
            };
        }
        // Check if tool is considered dangerous
        if (this.behaviorManager.isToolDestructive(toolCall.name)) {
            warnings.push('This tool performs destructive operations');
        }
        return {
            valid: true,
            warnings: warnings.length > 0 ? warnings : undefined,
        };
    }
    /**
     * Create a test tool use for debugging purposes.
     *
     * @param toolName - Name of the tool
     * @param input - Tool input parameters
     * @returns Anthropic tool use for testing
     */
    createTestToolUse(toolName, input = {}) {
        return {
            type: 'tool_use',
            id: `test_${Date.now()}`,
            name: toolName,
            input,
        };
    }
    /**
     * Execute a single tool use block from Anthropic.
     * Convenience method for single tool execution.
     *
     * @param toolUse - Anthropic tool use block
     * @param options - Execution options
     * @returns Anthropic tool result
     */
    async executeSingleToolUse(toolUse, options = {}) {
        try {
            return await this.executeSingleTool(toolUse, options);
        }
        catch (error) {
            console.error(`Error executing single tool ${toolUse.name}:`, error);
            return this.adapter.createErrorResult(toolUse.id, error instanceof Error ? error.message : String(error));
        }
    }
    /**
     * Batch validate multiple tool use blocks.
     *
     * @param toolUseBlocks - Array of tool use blocks
     * @returns Array of validation results
     */
    batchValidateToolUse(toolUseBlocks) {
        return toolUseBlocks.map(toolUse => ({
            toolUse,
            ...this.validateToolCall(toolUse)
        }));
    }
    /**
     * Get performance metrics about tool execution.
     *
     * @returns Basic performance information
     */
    getPerformanceInfo() {
        return {
            toolRegistry: !!this.toolManager.getToolRegistry(),
            fileSystemBoundary: true, // Always initialized
            totalBuiltinTools: this.toolManager.getToolNames().length,
            adapterType: 'anthropic',
        };
    }
    /**
     * Check if all tools are safe for automatic execution.
     * Useful for determining if confirmation flows can be bypassed.
     *
     * @param toolUseBlocks - Array of tool use blocks to check
     * @returns True if all tools are considered safe
     */
    areAllToolsSafe(toolUseBlocks) {
        return toolUseBlocks.every(toolUse => {
            const unifiedCall = this.adapter.fromProviderToolCall(toolUse);
            return this.behaviorManager.isToolSafe(unifiedCall.name);
        });
    }
    /**
     * Get timeout for tool execution batch.
     * Returns the maximum timeout needed for all tools in the batch.
     *
     * @param toolUseBlocks - Array of tool use blocks
     * @returns Maximum timeout in milliseconds
     */
    getBatchTimeout(toolUseBlocks) {
        let maxTimeout = 60000; // Default 60 seconds
        for (const toolUse of toolUseBlocks) {
            const unifiedCall = this.adapter.fromProviderToolCall(toolUse);
            const toolTimeout = this.behaviorManager.getToolTimeout(unifiedCall.name);
            maxTimeout = Math.max(maxTimeout, toolTimeout);
        }
        // Add buffer time for multiple tools
        return maxTimeout + (toolUseBlocks.length * 5000); // 5 seconds per additional tool
    }
}
//# sourceMappingURL=builtin-tools-integration.js.map