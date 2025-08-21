/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { ToolRegistry } from '../../tools/tool-registry.js';
import { Config } from '../../config/config.js';
import { AnyDeclarativeTool } from '../../tools/tools.js';
import { UnifiedTool, UnifiedToolCall, UnifiedToolResult, ToolExecutionContext } from './unified-tool-interface.js';
import { ToolPerformanceMetrics } from './performance-optimizer.js';
import { ExecutionOptions } from './tool-execution-coordinator.js';
import { FileSystemBoundary } from './filesystem-boundary.js';
import { ShellToolSecurity } from './shell-tool-security.js';
import { MemoryToolHandler } from './memory-tool-handler.js';
import { WebToolsHandler } from './web-tools-handler.js';
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
export declare class BuiltinToolManager {
    private toolRegistry?;
    private builtinTools;
    private config;
    private performanceOptimizer;
    private executionCoordinator;
    private toolBehaviors;
    private fileSystemBoundary;
    private shellSecurity;
    private memoryHandler;
    private webHandler;
    private executionStats;
    constructor(config: Config, toolRegistry?: ToolRegistry);
    /**
     * Initialize and discover all built-in tools with performance optimization setup.
     * This populates the internal tool registry, extracts built-in tools, and
     * initializes all performance and security components.
     */
    initialize(): Promise<void>;
    /**
     * Get all built-in tools as unified tools for provider conversion.
     * These tools can then be converted to provider-specific formats.
     *
     * @returns Array of unified tool definitions
     */
    getUnifiedTools(): UnifiedTool[];
    /**
     * Execute a built-in tool with stellar performance optimization.
     * Features intelligent caching, security validation, resource management,
     * and comprehensive error handling with circuit breaker patterns.
     *
     * @param toolCall - The unified tool call to execute
     * @param context - Execution context with configuration and callbacks
     * @returns Unified tool result with performance metrics
     */
    executeTool(toolCall: UnifiedToolCall, context: ToolExecutionContext): Promise<UnifiedToolResult>;
    /**
     * Execute multiple tools with intelligent coordination and optimization.
     * Uses advanced execution planning, parallel processing, and resource management.
     *
     * @param toolCalls - Array of tool calls to execute
     * @param context - Execution context
     * @param options - Execution options for optimization
     * @returns Map of results by tool call ID
     */
    executeMultipleTools(toolCalls: UnifiedToolCall[], context: ToolExecutionContext, options?: ExecutionOptions): Promise<Map<string, UnifiedToolResult>>;
    /**
     * Get comprehensive performance metrics for all tools.
     */
    getPerformanceMetrics(): {
        overall: typeof this.executionStats;
        byTool: Map<string, ToolPerformanceMetrics>;
        cache: unknown;
        resourcePools: unknown;
    };
    /**
     * Get available tools with category information and performance stats.
     */
    getAvailableTools(): Promise<Array<UnifiedTool & {
        category: string;
        performance?: ToolPerformanceMetrics;
    }>>;
    /**
     * Get tool statistics and usage information.
     */
    getToolStatistics(): {
        totalToolsAvailable: number;
        toolsByCategory: Record<string, number>;
        executionStats: typeof this.executionStats;
        topPerformingTools: Array<{
            name: string;
            avgTime: number;
            successRate: number;
        }>;
    };
    /**
     * Clear performance caches and reset statistics.
     */
    clearPerformanceCache(): void;
    /**
     * Invalidate cache entries by tags (e.g., after file modifications).
     */
    invalidateCache(tags: string[]): number;
    /**
     * Get specialized tool handlers for advanced operations.
     */
    getSpecializedHandlers(): {
        memory: MemoryToolHandler;
        web: WebToolsHandler;
        shell: ShellToolSecurity;
        filesystem: FileSystemBoundary;
    };
    /**
     * Optimize tool execution order based on dependencies and performance.
     */
    optimizeToolOrder(toolCalls: UnifiedToolCall[]): UnifiedToolCall[];
    /**
     * Estimate execution time for a set of tools.
     */
    estimateExecutionTime(toolCalls: UnifiedToolCall[]): number;
    /**
     * Clean up resources and shut down performance components.
     */
    destroy(): Promise<void>;
    private executeToolOptimized;
    /**
     * Validate tool security using comprehensive security components.
     */
    private validateToolSecurity;
    /**
     * Check if tool results should be cached based on tool characteristics.
     */
    private shouldCacheResult;
    /**
     * Record execution statistics and performance metrics.
     */
    private recordExecution;
    /**
     * Pre-warm commonly used tools for better initial performance.
     */
    private preWarmTools;
    /**
     * Create a standardized error result.
     */
    private createErrorResult;
    /**
     * Get tool category for classification.
     */
    private getToolCategory;
    /**
     * Legacy execution method - kept for backward compatibility.
     */
    private legacyExecuteToolOptimized;
    /**
     * Handle tool confirmation with provider-agnostic interface.
     * Converts the existing confirmation system to work across all providers.
     *
     * @private
     */
    private handleConfirmation;
    /**
     * Build a provider-agnostic confirmation request from tool-specific details.
     *
     * @private
     */
    private buildConfirmationRequest;
    /**
     * Get display name for the tool from confirmation details.
     *
     * @private
     */
    private getToolDisplayName;
    /**
     * Determine the action type from confirmation details.
     *
     * @private
     */
    private getConfirmationAction;
    /**
     * Format confirmation details based on tool type.
     *
     * @private
     */
    private formatConfirmationDetails;
    /**
     * Get available confirmation options based on tool type.
     *
     * @private
     */
    private getConfirmationOptions;
    /**
     * Convert a Gemini function declaration to unified tool format.
     *
     * @private
     */
    private convertToUnified;
    /**
     * Get the underlying tool registry (for advanced use cases).
     *
     * @returns The initialized tool registry
     */
    getToolRegistry(): ToolRegistry | undefined;
    /**
     * Get a specific built-in tool by name.
     *
     * @param name - Tool name
     * @returns The tool instance or undefined
     */
    getTool(name: string): AnyDeclarativeTool | undefined;
    /**
     * Get all built-in tool names.
     *
     * @returns Array of tool names
     */
    getToolNames(): string[];
    /**
     * Check if a tool is available.
     *
     * @param name - Tool name
     * @returns True if tool exists
     */
    hasTool(name: string): boolean;
}
