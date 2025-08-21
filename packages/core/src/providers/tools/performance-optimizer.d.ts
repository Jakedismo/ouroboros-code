/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { UnifiedToolCall, UnifiedToolResult, ToolExecutionContext } from './unified-tool-interface.js';
/**
 * Performance metrics for tool execution
 */
export interface ToolPerformanceMetrics {
    /** Tool name */
    toolName: string;
    /** Average execution time in milliseconds */
    avgExecutionTime: number;
    /** Minimum execution time */
    minExecutionTime: number;
    /** Maximum execution time */
    maxExecutionTime: number;
    /** Total number of executions */
    totalExecutions: number;
    /** Success rate (0-1) */
    successRate: number;
    /** Cache hit rate (0-1) */
    cacheHitRate: number;
    /** Average memory usage in bytes */
    avgMemoryUsage: number;
    /** Last execution timestamp */
    lastExecution: Date;
    /** Performance trend ('improving' | 'stable' | 'degrading') */
    trend: 'improving' | 'stable' | 'degrading';
}
/**
 * Tool execution plan with optimization strategies
 */
export interface ToolExecutionPlan {
    /** Original tool calls */
    originalCalls: UnifiedToolCall[];
    /** Optimized execution groups */
    executionGroups: ToolExecutionGroup[];
    /** Estimated total execution time */
    estimatedDuration: number;
    /** Optimization strategies applied */
    optimizations: OptimizationStrategy[];
    /** Resource requirements */
    resourceRequirements: ResourceRequirements;
}
/**
 * Group of tools that can be executed together
 */
export interface ToolExecutionGroup {
    /** Tools in this group */
    tools: UnifiedToolCall[];
    /** Execution mode ('parallel' | 'sequential' | 'pipeline') */
    mode: 'parallel' | 'sequential' | 'pipeline';
    /** Priority (higher numbers execute first) */
    priority: number;
    /** Dependencies on other groups */
    dependencies: string[];
    /** Group identifier */
    groupId: string;
    /** Estimated execution time for this group */
    estimatedTime: number;
}
/**
 * Optimization strategies that can be applied
 */
export interface OptimizationStrategy {
    /** Strategy type */
    type: 'caching' | 'batching' | 'parallel' | 'pipeline' | 'preload' | 'lazy';
    /** Strategy name */
    name: string;
    /** Description of what this optimization does */
    description: string;
    /** Expected performance improvement (0-1) */
    expectedImprovement: number;
    /** Tools affected by this strategy */
    affectedTools: string[];
}
/**
 * Resource requirements for tool execution
 */
export interface ResourceRequirements {
    /** Memory requirement in bytes */
    memoryMB: number;
    /** CPU cores needed */
    cpuCores: number;
    /** Network bandwidth required */
    networkMbps: number;
    /** Disk I/O operations per second */
    diskIOPS: number;
    /** Concurrent connections needed */
    connections: number;
    /** Temporary storage required in MB */
    tempStorageMB: number;
}
/**
 * Cache entry with metadata
 */
export interface CacheEntry {
    /** Cached result */
    result: UnifiedToolResult;
    /** When this entry was created */
    timestamp: Date;
    /** Time to live in milliseconds */
    ttl: number;
    /** Number of times this entry has been accessed */
    accessCount: number;
    /** Last access timestamp */
    lastAccess: Date;
    /** Memory size of this entry in bytes */
    sizeBytes: number;
    /** Tags for cache invalidation */
    tags: string[];
}
/**
 * Resource pool for managing shared resources
 */
export interface ResourcePool<T> {
    /** Acquire a resource from the pool */
    acquire(timeoutMs?: number): Promise<T>;
    /** Release a resource back to the pool */
    release(resource: T): void;
    /** Get current pool statistics */
    getStats(): {
        total: number;
        available: number;
        inUse: number;
        pending: number;
    };
    /** Destroy the pool and clean up resources */
    destroy(): Promise<void>;
}
/**
 * Advanced performance optimizer for built-in tools execution.
 * Provides intelligent caching, parallel execution planning, resource management,
 * and performance monitoring for optimal tool execution across all providers.
 *
 * Features:
 * - Multi-level intelligent caching with LRU eviction
 * - Dependency-aware parallel execution planning
 * - Resource pooling and management
 * - Performance profiling and optimization
 * - Circuit breaker patterns for reliability
 * - Adaptive timeout management
 * - Memory-efficient streaming for large operations
 */
export declare class PerformanceOptimizer {
    private cache;
    private cacheAccessOrder;
    private readonly maxCacheSize;
    private readonly defaultTTL;
    private metrics;
    private executionHistory;
    private pools;
    private circuitBreakers;
    private readonly config;
    constructor(config?: Partial<PerformanceOptimizer['config']>);
    /**
     * Create an optimized execution plan for multiple tool calls
     */
    createExecutionPlan(toolCalls: UnifiedToolCall[], context: ToolExecutionContext): Promise<ToolExecutionPlan>;
    /**
     * Check if a result is cached
     */
    getCachedResult(toolCall: UnifiedToolCall, context: ToolExecutionContext): UnifiedToolResult | null;
    /**
     * Cache a tool execution result
     */
    cacheResult(toolCall: UnifiedToolCall, context: ToolExecutionContext, result: UnifiedToolResult, customTTL?: number): void;
    /**
     * Record tool execution metrics
     */
    recordExecution(toolName: string, executionTime: number, success: boolean, memoryUsage?: number): void;
    /**
     * Get performance metrics for a tool
     */
    getToolMetrics(toolName: string): ToolPerformanceMetrics | null;
    /**
     * Get all performance metrics
     */
    getAllMetrics(): Map<string, ToolPerformanceMetrics>;
    /**
     * Check if a tool's circuit breaker is open
     */
    isCircuitBreakerOpen(toolName: string): boolean;
    /**
     * Invalidate cache entries by tags
     */
    invalidateCache(tags: string[]): number;
    /**
     * Clear all cached results
     */
    clearCache(): void;
    /**
     * Get cache statistics
     */
    getCacheStats(): {
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
    getResourcePoolStats(): Map<string, any>;
    /**
     * Optimize tool execution order based on dependencies and performance
     */
    optimizeExecutionOrder(toolCalls: UnifiedToolCall[]): UnifiedToolCall[];
    /**
     * Estimate execution time for a tool call
     */
    estimateExecutionTime(toolCall: UnifiedToolCall): number;
    /**
     * Acquire a resource from a pool
     */
    acquireResource<T>(poolName: string, timeoutMs?: number): Promise<T>;
    /**
     * Release a resource back to a pool
     */
    releaseResource<T>(poolName: string, resource: T): void;
    /**
     * Destroy the optimizer and clean up resources
     */
    destroy(): Promise<void>;
    private analyzeToolCalls;
    private createExecutionGroups;
    private createGroupForTool;
    private identifyOptimizations;
    private calculateResourceRequirements;
    private getToolResourceRequirements;
    private estimateGroupsExecutionTime;
    private generateCacheKey;
    private getTTLForTool;
    private generateCacheTags;
    private estimateResultSize;
    private evictIfNecessary;
    private shouldEvictForMemory;
    private updateCacheAccessOrder;
    private removeCacheKeyFromAccessOrder;
    private updateCacheHitRate;
    private calculatePerformanceTrend;
    private updateCircuitBreaker;
    private analyzeDependencies;
    private getToolDependencies;
    private identifyIOIntensiveTools;
    private identifyCPUIntensiveTools;
    private identifyCacheableTools;
    private identifyParallelizableTools;
    private canGroupTogether;
    private getToolCategory;
    private determineExecutionMode;
    private calculateGroupPriority;
    private estimateGroupExecutionTime;
    private getDefaultExecutionTime;
    private initializeResourcePools;
    private createHttpPool;
    private createFilePool;
    private startBackgroundTasks;
    private cleanupExpiredCache;
    private rotateMetrics;
}
