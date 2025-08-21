/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { ToolExecutionPlan, ToolPerformanceMetrics } from './performance-optimizer.js';
import { UnifiedToolCall, UnifiedToolResult, ToolExecutionContext } from './unified-tool-interface.js';
import { BuiltinToolManager } from './builtin-tool-manager.js';
/**
 * Execution result with performance information
 */
export interface CoordinatedExecutionResult {
    /** Individual tool results */
    results: Map<string, UnifiedToolResult>;
    /** Overall execution success */
    success: boolean;
    /** Total execution time in milliseconds */
    totalTime: number;
    /** Execution plan that was used */
    plan: ToolExecutionPlan;
    /** Performance metrics for this execution */
    metrics: {
        cacheHits: number;
        totalTools: number;
        parallelGroups: number;
        resourceUtilization: number;
        optimizationsApplied: string[];
    };
    /** Any errors that occurred */
    errors: Array<{
        toolId: string;
        toolName: string;
        error: string;
    }>;
}
/**
 * Tool execution status information
 */
export interface ExecutionStatus {
    /** Current phase of execution */
    phase: 'planning' | 'executing' | 'completed' | 'failed';
    /** Number of completed tools */
    completed: number;
    /** Total number of tools */
    total: number;
    /** Currently executing tools */
    executing: string[];
    /** Estimated time remaining in milliseconds */
    estimatedRemaining: number;
    /** Progress percentage (0-100) */
    progress: number;
}
/**
 * Execution options for tool coordination
 */
export interface ExecutionOptions {
    /** Maximum parallel executions (overrides config) */
    maxParallel?: number;
    /** Force sequential execution */
    forceSequential?: boolean;
    /** Disable caching for this execution */
    disableCache?: boolean;
    /** Enable detailed profiling */
    enableProfiling?: boolean;
    /** Custom timeout for entire execution */
    timeoutMs?: number;
    /** Fail fast on first error */
    failFast?: boolean;
    /** Progress callback */
    onProgress?: (status: ExecutionStatus) => void;
    /** Resource limits */
    resourceLimits?: {
        memoryMB?: number;
        cpuCores?: number;
        diskIOPS?: number;
    };
}
/**
 * Advanced tool execution coordinator that orchestrates optimal execution
 * of multiple tools using intelligent planning, caching, and resource management.
 *
 * Features:
 * - Intelligent execution planning with dependency analysis
 * - Adaptive parallel execution with resource management
 * - Performance-optimized caching and result sharing
 * - Real-time progress monitoring and metrics
 * - Circuit breaker patterns for reliability
 * - Resource pooling and efficient cleanup
 * - Advanced error handling and recovery strategies
 */
export declare class ToolExecutionCoordinator {
    private optimizer;
    private toolManager;
    private activeExecutions;
    constructor(toolManager: BuiltinToolManager, optimizerConfig?: unknown);
    /**
     * Execute multiple tools with intelligent coordination and optimization
     */
    executeTools(toolCalls: UnifiedToolCall[], context: ToolExecutionContext, options?: ExecutionOptions): Promise<CoordinatedExecutionResult>;
    /**
     * Execute a single tool with optimization
     */
    executeSingleTool(toolCall: UnifiedToolCall, context: ToolExecutionContext, options?: ExecutionOptions): Promise<UnifiedToolResult>;
    /**
     * Get performance metrics for all tools
     */
    getPerformanceMetrics(): Map<string, ToolPerformanceMetrics>;
    /**
     * Get cache statistics
     */
    getCacheStatistics(): {
        size: number;
        maxSize: number;
        hitRate: number;
        totalMemoryMB: number;
        oldestEntry: Date | null;
        newestEntry: Date | null;
    };
    /**
     * Get resource pool statistics
     */
    getResourceStatistics(): Map<string, any>;
    /**
     * Clear performance cache
     */
    clearCache(): void;
    /**
     * Invalidate cache by tags
     */
    invalidateCache(tags: string[]): number;
    /**
     * Get current execution status for active executions
     */
    getExecutionStatus(): Map<string, ExecutionStatus>;
    /**
     * Cancel an active execution
     */
    cancelExecution(executionId: string): Promise<boolean>;
    /**
     * Optimize tool execution order
     */
    optimizeToolOrder(toolCalls: UnifiedToolCall[]): UnifiedToolCall[];
    /**
     * Estimate execution time for tools
     */
    estimateExecutionTime(toolCalls: UnifiedToolCall[]): number;
    /**
     * Destroy coordinator and clean up resources
     */
    destroy(): Promise<void>;
    private createOptimizedPlan;
    private executePlan;
    private executeGroup;
    private executeParallel;
    private executePipeline;
    private executeSingleToolWithOptimizations;
    private convertToSequential;
    private limitParallelism;
    private adaptToolForPipeline;
    private calculateResourceUtilization;
    private estimateRemainingTime;
    private estimateMemoryUsage;
    private generateExecutionId;
}
