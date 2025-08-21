/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { ToolConfirmationOutcome } from '../../tools/tools.js';
import { PerformanceOptimizer } from './performance-optimizer.js';
import { ToolExecutionCoordinator } from './tool-execution-coordinator.js';
import { ResourcePoolFactory } from './resource-pools.js';
import { ToolBehaviorManager } from './tool-behaviors.js';
import { FileSystemBoundary } from './filesystem-boundary.js';
import { ShellToolSecurity } from './shell-tool-security.js';
import { MemoryToolHandler } from './memory-tool-handler.js';
import { WebToolsHandler } from './web-tools-handler.js';
import { BuiltinToolManagerHelpers } from './builtin-tool-manager-helpers.js';
/**
 * Enhanced core manager for built-in tools with advanced performance optimization,
 * intelligent caching, resource management, and comprehensive security.
 *
 * Provides provider-agnostic access to Gemini CLI's built-in tool suite across
 * OpenAI, Anthropic, and Gemini providers with stellar performance characteristics.
 *
 * Features:
 * - Intelligent execution planning and optimization
 * - Multi-level caching with automatic invalidation
 * - Resource pooling and efficient cleanup
 * - Performance monitoring and metrics
 * - Circuit breaker patterns for reliability
 * - Advanced security validation and boundaries
 * - Parallel execution with dependency management
 */
export class BuiltinToolManager {
    toolRegistry;
    builtinTools = new Map();
    config;
    // Performance optimization components
    performanceOptimizer;
    executionCoordinator;
    // Security and validation components
    toolBehaviors;
    fileSystemBoundary;
    shellSecurity;
    memoryHandler;
    webHandler;
    // Performance tracking
    executionStats = {
        totalExecutions: 0,
        successfulExecutions: 0,
        cacheHits: 0,
        averageExecutionTime: 0,
        lastExecutionTimes: [],
    };
    constructor(config, toolRegistry) {
        this.config = config;
        this.toolRegistry = toolRegistry;
        // Initialize performance optimization components
        this.performanceOptimizer = new PerformanceOptimizer({
            maxCacheSize: 500,
            defaultTTL: 5 * 60 * 1000, // 5 minutes
            maxParallelExecutions: 8,
            enableProfiling: true,
            enableResourcePools: true,
        });
        // Initialize security and validation components
        this.toolBehaviors = new ToolBehaviorManager(config);
        this.fileSystemBoundary = new FileSystemBoundary(config);
        this.shellSecurity = new ShellToolSecurity(config);
        this.memoryHandler = new MemoryToolHandler(config);
        this.webHandler = new WebToolsHandler(config);
        // Initialize execution coordinator
        this.executionCoordinator = new ToolExecutionCoordinator(this, {
            maxCacheSize: 500,
            enableProfiling: true,
            maxParallelExecutions: 8,
        });
    }
    /**
     * Initialize and discover all built-in tools with performance optimization setup.
     * This populates the internal tool registry, extracts built-in tools, and
     * initializes all performance and security components.
     */
    async initialize() {
        // Create and populate tool registry if not provided
        if (!this.toolRegistry) {
            this.toolRegistry = await this.config.createToolRegistry();
        }
        // Get all registered tools
        const allTools = this.toolRegistry.getAllTools();
        // Filter and store built-in tools (non-MCP tools don't have ':' in their names)
        for (const tool of allTools) {
            if (!tool.name.includes(':')) { // MCP tools have server:tool format
                this.builtinTools.set(tool.name, tool);
            }
        }
        // Initialize specialized handlers
        await this.memoryHandler.initialize();
        console.debug(`[BuiltinToolManager] Initialized ${this.builtinTools.size} built-in tools with performance optimization`);
        // Pre-warm commonly used tools
        await this.preWarmTools();
    }
    /**
     * Get all built-in tools as unified tools for provider conversion.
     * These tools can then be converted to provider-specific formats.
     *
     * @returns Array of unified tool definitions
     */
    getUnifiedTools() {
        const unifiedTools = [];
        for (const tool of this.builtinTools.values()) {
            const declaration = tool.schema;
            unifiedTools.push(this.convertToUnified(declaration, tool));
        }
        return unifiedTools;
    }
    /**
     * Execute a built-in tool with stellar performance optimization.
     * Features intelligent caching, security validation, resource management,
     * and comprehensive error handling with circuit breaker patterns.
     *
     * @param toolCall - The unified tool call to execute
     * @param context - Execution context with configuration and callbacks
     * @returns Unified tool result with performance metrics
     */
    async executeTool(toolCall, context) {
        const startTime = performance.now();
        this.executionStats.totalExecutions++;
        try {
            // Check if circuit breaker is open for this tool
            if (this.performanceOptimizer.isCircuitBreakerOpen(toolCall.name)) {
                return this.createErrorResult(toolCall.id, `Tool ${toolCall.name} is temporarily unavailable (circuit breaker open)`);
            }
            // Try cache first
            const cachedResult = this.performanceOptimizer.getCachedResult(toolCall, context);
            if (cachedResult) {
                this.executionStats.cacheHits++;
                console.debug(`[BuiltinToolManager] Cache hit for ${toolCall.name}`);
                return { ...cachedResult, fromCache: true };
            }
            // Validate tool exists
            const tool = this.builtinTools.get(toolCall.name);
            if (!tool) {
                return this.createErrorResult(toolCall.id, `Built-in tool ${toolCall.name} not found`);
            }
            // Perform security validation
            const securityValidation = await this.validateToolSecurity(toolCall, context);
            if (!securityValidation.allowed) {
                return this.createErrorResult(toolCall.id, `Security validation failed: ${securityValidation.reason}`);
            }
            // Execute tool with optimization
            const result = await this.executeToolOptimized(tool, toolCall, context);
            // Record performance metrics
            const executionTime = performance.now() - startTime;
            this.recordExecution(toolCall.name, executionTime, result.isError !== true);
            // Cache successful results
            if (result.isError !== true && this.shouldCacheResult(toolCall.name)) {
                this.performanceOptimizer.cacheResult(toolCall, context, result);
            }
            return result;
        }
        catch (error) {
            const executionTime = performance.now() - startTime;
            this.recordExecution(toolCall.name, executionTime, false);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[BuiltinToolManager] Tool execution failed for ${toolCall.name}:`, error);
            return this.createErrorResult(toolCall.id, errorMessage);
        }
    }
    /**
     * Execute multiple tools with intelligent coordination and optimization.
     * Uses advanced execution planning, parallel processing, and resource management.
     *
     * @param toolCalls - Array of tool calls to execute
     * @param context - Execution context
     * @param options - Execution options for optimization
     * @returns Map of results by tool call ID
     */
    async executeMultipleTools(toolCalls, context, options = {}) {
        console.debug(`[BuiltinToolManager] Executing ${toolCalls.length} tools with coordination`);
        const result = await this.executionCoordinator.executeTools(toolCalls, context, options);
        // Update aggregate statistics
        this.executionStats.totalExecutions += toolCalls.length;
        this.executionStats.successfulExecutions += Array.from(result.results.values())
            .filter(r => r.isError !== true).length;
        this.executionStats.cacheHits += result.metrics.cacheHits;
        return result.results;
    }
    /**
     * Get comprehensive performance metrics for all tools.
     */
    getPerformanceMetrics() {
        return {
            overall: { ...this.executionStats },
            byTool: this.performanceOptimizer.getAllMetrics(),
            cache: this.performanceOptimizer.getCacheStats(),
            resourcePools: this.performanceOptimizer.getResourcePoolStats(),
        };
    }
    /**
     * Get available tools with category information and performance stats.
     */
    async getAvailableTools() {
        const tools = this.getUnifiedTools();
        return tools.map(tool => ({
            ...tool,
            category: this.getToolCategory(tool.name),
            performance: this.performanceOptimizer.getToolMetrics(tool.name) || undefined,
        }));
    }
    /**
     * Get tool statistics and usage information.
     */
    getToolStatistics() {
        const tools = this.getUnifiedTools();
        const toolsByCategory = {};
        // Count tools by category
        for (const tool of tools) {
            const category = this.getToolCategory(tool.name);
            toolsByCategory[category] = (toolsByCategory[category] || 0) + 1;
        }
        // Get top performing tools
        const allMetrics = this.performanceOptimizer.getAllMetrics();
        const topPerformingTools = Array.from(allMetrics.entries())
            .map(([name, metrics]) => ({
            name,
            avgTime: metrics.avgExecutionTime,
            successRate: metrics.successRate,
        }))
            .sort((a, b) => (b.successRate - a.successRate) || (a.avgTime - b.avgTime))
            .slice(0, 10);
        return {
            totalToolsAvailable: tools.length,
            toolsByCategory,
            executionStats: { ...this.executionStats },
            topPerformingTools,
        };
    }
    /**
     * Clear performance caches and reset statistics.
     */
    clearPerformanceCache() {
        this.performanceOptimizer.clearCache();
        this.executionStats = {
            totalExecutions: 0,
            successfulExecutions: 0,
            cacheHits: 0,
            averageExecutionTime: 0,
            lastExecutionTimes: [],
        };
        console.debug('[BuiltinToolManager] Performance cache cleared');
    }
    /**
     * Invalidate cache entries by tags (e.g., after file modifications).
     */
    invalidateCache(tags) {
        const invalidated = this.performanceOptimizer.invalidateCache(tags);
        console.debug(`[BuiltinToolManager] Invalidated ${invalidated} cache entries for tags: ${tags.join(', ')}`);
        return invalidated;
    }
    /**
     * Get specialized tool handlers for advanced operations.
     */
    getSpecializedHandlers() {
        return {
            memory: this.memoryHandler,
            web: this.webHandler,
            shell: this.shellSecurity,
            filesystem: this.fileSystemBoundary,
        };
    }
    /**
     * Optimize tool execution order based on dependencies and performance.
     */
    optimizeToolOrder(toolCalls) {
        return this.performanceOptimizer.optimizeExecutionOrder(toolCalls);
    }
    /**
     * Estimate execution time for a set of tools.
     */
    estimateExecutionTime(toolCalls) {
        return toolCalls.reduce((total, call) => total + this.performanceOptimizer.estimateExecutionTime(call), 0);
    }
    /**
     * Clean up resources and shut down performance components.
     */
    async destroy() {
        await this.executionCoordinator.destroy();
        await this.performanceOptimizer.destroy();
        await ResourcePoolFactory.destroyAll();
        console.debug('[BuiltinToolManager] Destroyed and cleaned up all resources');
    }
    // Private helper methods
    async executeToolOptimized(tool, toolCall, context) {
        return await BuiltinToolManagerHelpers.executeToolOptimized(tool, toolCall, context, this.toolBehaviors, this.fileSystemBoundary, this.shellSecurity, this.webHandler);
    }
    /**
     * Validate tool security using comprehensive security components.
     */
    async validateToolSecurity(toolCall, context) {
        return await BuiltinToolManagerHelpers.validateToolSecurity(toolCall, context, this.toolBehaviors, this.fileSystemBoundary, this.shellSecurity, this.webHandler);
    }
    /**
     * Check if tool results should be cached based on tool characteristics.
     */
    shouldCacheResult(toolName) {
        return BuiltinToolManagerHelpers.shouldCacheResult(toolName);
    }
    /**
     * Record execution statistics and performance metrics.
     */
    recordExecution(toolName, executionTime, success) {
        BuiltinToolManagerHelpers.recordExecution(toolName, executionTime, success, this.executionStats, this.performanceOptimizer);
    }
    /**
     * Pre-warm commonly used tools for better initial performance.
     */
    async preWarmTools() {
        await BuiltinToolManagerHelpers.preWarmTools(this.builtinTools);
    }
    /**
     * Create a standardized error result.
     */
    createErrorResult(toolCallId, errorMessage) {
        return BuiltinToolManagerHelpers.createErrorResult(toolCallId, errorMessage);
    }
    /**
     * Get tool category for classification.
     */
    getToolCategory(toolName) {
        return BuiltinToolManagerHelpers.getToolCategory(toolName);
    }
    /**
     * Legacy execution method - kept for backward compatibility.
     */
    async legacyExecuteToolOptimized(tool, toolCall, context) {
        try {
            // Validate and build tool invocation using the existing pattern
            const invocation = tool.build(toolCall.parameters);
            // Handle confirmation if needed - this preserves the original confirmation flows
            const confirmationDetails = await invocation.shouldConfirmExecute(context.signal);
            if (confirmationDetails) {
                const outcome = await this.handleConfirmation(confirmationDetails, context);
                if (outcome === ToolConfirmationOutcome.Cancel) {
                    return {
                        toolCallId: toolCall.id,
                        content: 'Tool execution cancelled by user',
                        isError: false,
                    };
                }
                // Apply confirmation outcome to invocation
                if (confirmationDetails.onConfirm) {
                    await confirmationDetails.onConfirm(outcome);
                }
            }
            // Execute the tool with progress callback
            const result = await invocation.execute(context.signal, context.onProgress);
            return {
                toolCallId: toolCall.id,
                content: result.llmContent,
                display: result.returnDisplay,
                isError: result.error !== undefined,
                error: result.error,
                summary: result.summary,
            };
        }
        catch (error) {
            console.error(`Error executing built-in tool ${toolCall.name}:`, error);
            return {
                toolCallId: toolCall.id,
                content: `Error: ${error.message}`,
                isError: true,
                error: {
                    message: error.message,
                    type: 'EXECUTION_ERROR',
                },
            };
        }
    }
    /**
     * Handle tool confirmation with provider-agnostic interface.
     * Converts the existing confirmation system to work across all providers.
     *
     * @private
     */
    async handleConfirmation(details, context) {
        if (!context.onConfirmation) {
            // Auto-approve if no confirmation handler
            return ToolConfirmationOutcome.ProceedOnce;
        }
        // Convert confirmation details to provider-agnostic format
        const confirmationRequest = this.buildConfirmationRequest(details);
        const outcome = await context.onConfirmation(confirmationRequest);
        return outcome;
    }
    /**
     * Build a provider-agnostic confirmation request from tool-specific details.
     *
     * @private
     */
    buildConfirmationRequest(details) {
        const baseRequest = {
            toolName: this.getToolDisplayName(details),
            description: details.title,
            action: this.getConfirmationAction(details),
            details: this.formatConfirmationDetails(details),
            options: this.getConfirmationOptions(details),
        };
        return baseRequest;
    }
    /**
     * Get display name for the tool from confirmation details.
     *
     * @private
     */
    getToolDisplayName(details) {
        if (details.type === 'mcp') {
            return details.toolDisplayName || details.toolName;
        }
        // For other tool types, try to determine the tool name
        // This is a best-effort approach since the confirmation details don't always include tool name
        return 'Tool';
    }
    /**
     * Determine the action type from confirmation details.
     *
     * @private
     */
    getConfirmationAction(details) {
        switch (details.type) {
            case 'edit':
                return 'modify_file';
            case 'exec':
                return 'execute_command';
            case 'info':
                return details.urls ? 'fetch_url' : 'save_memory';
            case 'mcp':
                return 'execute_mcp_tool';
            default:
                return 'execute_tool';
        }
    }
    /**
     * Format confirmation details based on tool type.
     *
     * @private
     */
    formatConfirmationDetails(details) {
        switch (details.type) {
            case 'edit':
                return {
                    file: details.filePath,
                    fileName: details.fileName,
                    diff: details.fileDiff,
                    isModifying: details.isModifying,
                };
            case 'exec':
                return {
                    command: details.command,
                    rootCommand: details.rootCommand,
                };
            case 'info':
                return {
                    prompt: details.prompt,
                    urls: details.urls,
                };
            case 'mcp':
                return {
                    serverName: details.serverName,
                    toolName: details.toolName,
                };
            default:
                return {};
        }
    }
    /**
     * Get available confirmation options based on tool type.
     *
     * @private
     */
    getConfirmationOptions(details) {
        const options = ['proceed_once', 'cancel'];
        // Add specific options based on tool type
        if (details.type === 'edit') {
            options.push('modify_with_editor');
        }
        // Add "proceed always" options where appropriate
        if (details.type === 'exec' || details.type === 'mcp') {
            options.push('proceed_always');
        }
        return options;
    }
    /**
     * Convert a Gemini function declaration to unified tool format.
     *
     * @private
     */
    convertToUnified(declaration, tool) {
        return BuiltinToolManagerHelpers.convertToUnified(declaration, tool);
    }
    /**
     * Get the underlying tool registry (for advanced use cases).
     *
     * @returns The initialized tool registry
     */
    getToolRegistry() {
        return this.toolRegistry;
    }
    /**
     * Get a specific built-in tool by name.
     *
     * @param name - Tool name
     * @returns The tool instance or undefined
     */
    getTool(name) {
        return this.builtinTools.get(name);
    }
    /**
     * Get all built-in tool names.
     *
     * @returns Array of tool names
     */
    getToolNames() {
        return Array.from(this.builtinTools.keys());
    }
    /**
     * Check if a tool is available.
     *
     * @param name - Tool name
     * @returns True if tool exists
     */
    hasTool(name) {
        return this.builtinTools.has(name);
    }
}
//# sourceMappingURL=builtin-tool-manager.js.map