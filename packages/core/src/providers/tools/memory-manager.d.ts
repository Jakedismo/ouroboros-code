/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { EventEmitter } from 'events';
/**
 * Memory configuration for tool execution environments.
 */
export interface MemoryConfig {
    /** Maximum memory usage per tool execution in MB */
    maxToolMemoryMB: number;
    /** Maximum concurrent tool executions to prevent memory exhaustion */
    maxConcurrentExecutions: number;
    /** Memory cleanup threshold as percentage of max heap */
    cleanupThresholdPercent: number;
    /** Interval for memory monitoring in milliseconds */
    monitoringIntervalMs: number;
    /** Maximum size for tool result caching in MB */
    resultCacheMaxMB: number;
    /** Maximum age for cached results in milliseconds */
    resultCacheMaxAgeMs: number;
    /** Enable aggressive cleanup on memory pressure */
    aggressiveCleanup: boolean;
}
/**
 * Memory usage statistics for monitoring.
 */
export interface MemoryStats {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    activeExecutions: number;
    cachedResults: number;
    cacheSize: number;
    lastCleanup: Date;
    cleanupCount: number;
    memoryPressure: 'low' | 'medium' | 'high' | 'critical';
}
/**
 * Tool execution context for memory tracking.
 */
export interface ToolExecutionMemoryContext {
    toolCallId: string;
    toolName: string;
    providerId: string;
    startMemory: number;
    currentMemory: number;
    maxMemory: number;
    allocatedObjects: Set<WeakRef<any>>;
    cleanupCallbacks: (() => void)[];
    startTime: Date;
    isActive: boolean;
}
/**
 * Default memory configuration values.
 */
export declare const DEFAULT_MEMORY_CONFIG: MemoryConfig;
/**
 * Memory manager for optimizing tool execution memory usage.
 * Provides memory monitoring, cleanup, caching, and pressure management.
 */
export declare class MemoryManager extends EventEmitter {
    private config;
    private activeContexts;
    private resultCache;
    private monitoringTimer;
    private memoryStats;
    private isShuttingDown;
    private cleanupInProgress;
    private lastGCTime;
    constructor(config?: Partial<MemoryConfig>);
    /**
     * Create a memory context for tool execution.
     * @param toolCallId Unique identifier for the tool call.
     * @param toolName Name of the tool being executed.
     * @param providerId Provider executing the tool.
     * @returns Memory context for tracking.
     */
    createExecutionContext(toolCallId: string, toolName: string, providerId: string): ToolExecutionMemoryContext;
    /**
     * Register an object for cleanup tracking within a context.
     * @param toolCallId Tool call ID.
     * @param object Object to track for cleanup.
     * @param cleanupCallback Optional cleanup callback.
     */
    registerObject(toolCallId: string, object: any, cleanupCallback?: () => void): void;
    /**
     * Complete tool execution and cleanup its memory context.
     * @param toolCallId Tool call ID.
     * @param result Optional result to cache.
     */
    completeExecution(toolCallId: string, result?: any): void;
    /**
     * Get cached result for a tool execution.
     * @param cacheKey Cache key for the result.
     * @returns Cached result if available.
     */
    getCachedResult(cacheKey: string): any | null;
    /**
     * Force cleanup of memory for a specific tool execution.
     * @param toolCallId Tool call ID to cleanup.
     */
    forceCleanup(toolCallId: string): void;
    /**
     * Perform global memory cleanup.
     * @param aggressive Whether to perform aggressive cleanup.
     */
    performCleanup(aggressive?: boolean): Promise<void>;
    /**
     * Get current memory usage statistics.
     * @returns Current memory statistics.
     */
    getMemoryStats(): MemoryStats;
    /**
     * Update memory configuration.
     * @param newConfig New configuration values.
     */
    updateConfig(newConfig: Partial<MemoryConfig>): void;
    /**
     * Shutdown the memory manager and cleanup all resources.
     */
    shutdown(): Promise<void>;
    /**
     * Initialize memory statistics.
     * @returns Initial memory statistics.
     */
    private initializeStats;
    /**
     * Start memory monitoring timer.
     */
    private startMemoryMonitoring;
    /**
     * Update internal memory statistics.
     */
    private updateMemoryStats;
    /**
     * Check memory pressure and trigger cleanup if needed.
     */
    private checkMemoryPressure;
    /**
     * Calculate memory pressure level.
     * @param heapUsed Current heap usage in MB.
     * @param heapTotal Total heap size in MB.
     * @returns Memory pressure level.
     */
    private calculateMemoryPressure;
    /**
     * Get current memory usage in MB.
     * @returns Current memory usage.
     */
    private getCurrentMemoryUsage;
    /**
     * Check if a result should be cached.
     * @param result Result to check.
     * @returns Whether the result should be cached.
     */
    private shouldCacheResult;
    /**
     * Cache a tool execution result.
     * @param toolCallId Tool call ID.
     * @param toolName Tool name.
     * @param result Result to cache.
     */
    private cacheResult;
    /**
     * Create cache key for a tool result.
     * @param toolCallId Tool call ID.
     * @param result Result object.
     * @returns Cache key.
     */
    private createCacheKey;
    /**
     * Simple hash function for cache keys.
     * @param str String to hash.
     * @returns Hash value.
     */
    private simpleHash;
    /**
     * Estimate object size in MB.
     * @param obj Object to estimate.
     * @returns Estimated size in MB.
     */
    private estimateObjectSize;
    /**
     * Calculate total cache size.
     * @returns Cache size in MB.
     */
    private calculateCacheSize;
    /**
     * Clean up result cache.
     * @param aggressive Whether to perform aggressive cleanup.
     */
    private cleanupResultCache;
    /**
     * Cleanup inactive execution contexts.
     */
    private cleanupInactiveContexts;
    /**
     * Cleanup weak references that are no longer valid.
     */
    private cleanupWeakReferences;
    /**
     * Force cleanup of oldest contexts to make room.
     * @param count Number of contexts to cleanup.
     */
    private forceCleanupOldestContexts;
    /**
     * Cleanup orphaned objects (aggressive cleanup only).
     */
    private cleanupOrphanedObjects;
    /**
     * Setup memory warning listeners.
     */
    private setupMemoryWarnings;
}
/**
 * Create a memory manager with provider-specific configuration.
 * @param providerId Provider identifier.
 * @param customConfig Optional custom configuration.
 * @returns Configured memory manager.
 */
export declare function createMemoryManager(providerId?: string, customConfig?: Partial<MemoryConfig>): MemoryManager;
/**
 * Memory pressure event for monitoring.
 */
export interface MemoryPressureEvent {
    level: 'low' | 'medium' | 'high' | 'critical';
    reason: string;
    activeExecutions: number;
    heapUsed?: number;
    heapTotal?: number;
}
/**
 * Execution completion event for tracking.
 */
export interface ExecutionCompletionEvent {
    toolCallId: string;
    toolName: string;
    providerId: string;
    memoryUsed: number;
    duration: number;
    maxMemory: number;
}
