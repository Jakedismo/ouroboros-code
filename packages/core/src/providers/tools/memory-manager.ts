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
 * Cached tool result with memory tracking.
 */
interface CachedToolResult {
  toolCallId: string;
  toolName: string;
  result: any;
  size: number;
  timestamp: Date;
  accessCount: number;
  lastAccessed: Date;
}

/**
 * Memory pressure levels and thresholds.
 */
const MEMORY_PRESSURE_THRESHOLDS = {
  low: 0.5, // < 50% of max heap
  medium: 0.7, // 50-70% of max heap
  high: 0.85, // 70-85% of max heap
  critical: 0.95, // > 85% of max heap
} as const;

/**
 * Default memory configuration values.
 */
export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  maxToolMemoryMB: 256, // 256MB per tool
  maxConcurrentExecutions: 10, // Max 10 concurrent executions
  cleanupThresholdPercent: 70, // Cleanup at 70% memory usage
  monitoringIntervalMs: 5000, // Check every 5 seconds
  resultCacheMaxMB: 128, // 128MB for result cache
  resultCacheMaxAgeMs: 300000, // 5 minutes cache retention
  aggressiveCleanup: false, // Conservative cleanup by default
};

/**
 * Memory manager for optimizing tool execution memory usage.
 * Provides memory monitoring, cleanup, caching, and pressure management.
 */
export class MemoryManager extends EventEmitter {
  private config: MemoryConfig;
  private activeContexts = new Map<string, ToolExecutionMemoryContext>();
  private resultCache = new Map<string, CachedToolResult>();
  private monitoringTimer: NodeJS.Timeout | null = null;
  private memoryStats: MemoryStats;
  private isShuttingDown = false;
  private cleanupInProgress = false;
  private lastGCTime = Date.now();

  constructor(config: Partial<MemoryConfig> = {}) {
    super();
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };
    this.memoryStats = this.initializeStats();
    this.startMemoryMonitoring();

    // Set up process memory warning listeners
    this.setupMemoryWarnings();
  }

  /**
   * Create a memory context for tool execution.
   * @param toolCallId Unique identifier for the tool call.
   * @param toolName Name of the tool being executed.
   * @param providerId Provider executing the tool.
   * @returns Memory context for tracking.
   */
  createExecutionContext(
    toolCallId: string,
    toolName: string,
    providerId: string,
  ): ToolExecutionMemoryContext {
    // Check if we're at the concurrent execution limit
    if (this.activeContexts.size >= this.config.maxConcurrentExecutions) {
      this.emit('memory_pressure', {
        level: 'high',
        reason: 'max_concurrent_executions',
        activeExecutions: this.activeContexts.size,
      });

      // Force cleanup of oldest contexts if needed
      this.forceCleanupOldestContexts(1);
    }

    const currentMemory = this.getCurrentMemoryUsage();
    const context: ToolExecutionMemoryContext = {
      toolCallId,
      toolName,
      providerId,
      startMemory: currentMemory,
      currentMemory,
      maxMemory: currentMemory,
      allocatedObjects: new Set(),
      cleanupCallbacks: [],
      startTime: new Date(),
      isActive: true,
    };

    this.activeContexts.set(toolCallId, context);
    this.emit('context_created', {
      toolCallId,
      toolName,
      providerId,
      memory: currentMemory,
    });

    return context;
  }

  /**
   * Register an object for cleanup tracking within a context.
   * @param toolCallId Tool call ID.
   * @param object Object to track for cleanup.
   * @param cleanupCallback Optional cleanup callback.
   */
  registerObject(
    toolCallId: string,
    object: any,
    cleanupCallback?: () => void,
  ): void {
    const context = this.activeContexts.get(toolCallId);
    if (!context) {
      console.warn(`No memory context found for tool call: ${toolCallId}`);
      return;
    }

    // Add weak reference to track the object
    context.allocatedObjects.add(new WeakRef(object));

    // Add cleanup callback if provided
    if (cleanupCallback) {
      context.cleanupCallbacks.push(cleanupCallback);
    }

    // Update memory tracking
    context.currentMemory = this.getCurrentMemoryUsage();
    context.maxMemory = Math.max(context.maxMemory, context.currentMemory);
  }

  /**
   * Complete tool execution and cleanup its memory context.
   * @param toolCallId Tool call ID.
   * @param result Optional result to cache.
   */
  completeExecution(toolCallId: string, result?: any): void {
    const context = this.activeContexts.get(toolCallId);
    if (!context) {
      return;
    }

    try {
      // Cache result if provided and within size limits
      if (result && this.shouldCacheResult(result)) {
        this.cacheResult(toolCallId, context.toolName, result);
      }

      // Execute cleanup callbacks
      for (const cleanup of context.cleanupCallbacks) {
        try {
          cleanup();
        } catch (error) {
          console.warn(`Cleanup callback error for ${toolCallId}:`, error);
        }
      }

      // Calculate memory usage for this execution
      const memoryUsed = context.maxMemory - context.startMemory;
      const duration = Date.now() - context.startTime.getTime();

      this.emit('execution_completed', {
        toolCallId,
        toolName: context.toolName,
        providerId: context.providerId,
        memoryUsed,
        duration,
        maxMemory: context.maxMemory,
      });

      // Mark context as inactive
      context.isActive = false;
    } finally {
      // Remove from active contexts
      this.activeContexts.delete(toolCallId);

      // Trigger cleanup if memory pressure is high
      this.checkMemoryPressure();
    }
  }

  /**
   * Get cached result for a tool execution.
   * @param cacheKey Cache key for the result.
   * @returns Cached result if available.
   */
  getCachedResult(cacheKey: string): any | null {
    const cached = this.resultCache.get(cacheKey);
    if (!cached) {
      return null;
    }

    // Check if cache entry is expired
    if (
      Date.now() - cached.timestamp.getTime() >
      this.config.resultCacheMaxAgeMs
    ) {
      this.resultCache.delete(cacheKey);
      return null;
    }

    // Update access tracking
    cached.accessCount++;
    cached.lastAccessed = new Date();

    this.emit('cache_hit', { cacheKey, toolName: cached.toolName });
    return cached.result;
  }

  /**
   * Force cleanup of memory for a specific tool execution.
   * @param toolCallId Tool call ID to cleanup.
   */
  forceCleanup(toolCallId: string): void {
    const context = this.activeContexts.get(toolCallId);
    if (!context) {
      return;
    }

    console.warn(`Force cleaning up memory context for tool: ${toolCallId}`);

    // Execute all cleanup callbacks
    for (const cleanup of context.cleanupCallbacks) {
      try {
        cleanup();
      } catch (error) {
        console.warn(`Force cleanup callback error for ${toolCallId}:`, error);
      }
    }

    // Clear object references
    context.allocatedObjects.clear();
    context.cleanupCallbacks.length = 0;
    context.isActive = false;

    // Remove from active contexts
    this.activeContexts.delete(toolCallId);

    this.emit('force_cleanup', { toolCallId, toolName: context.toolName });
  }

  /**
   * Perform global memory cleanup.
   * @param aggressive Whether to perform aggressive cleanup.
   */
  async performCleanup(aggressive: boolean = false): Promise<void> {
    if (this.cleanupInProgress) {
      return;
    }

    this.cleanupInProgress = true;

    try {
      console.log(
        `Starting ${aggressive ? 'aggressive' : 'standard'} memory cleanup...`,
      );
      const startTime = Date.now();
      const startMemory = this.getCurrentMemoryUsage();

      // 1. Clean up expired cache entries
      await this.cleanupResultCache(aggressive);

      // 2. Force cleanup of inactive contexts
      await this.cleanupInactiveContexts();

      // 3. Clear weak references that are no longer valid
      await this.cleanupWeakReferences();

      // 4. Force garbage collection if available and aggressive
      if (aggressive && global.gc) {
        global.gc();
        this.lastGCTime = Date.now();
      }

      // 5. Clean up orphaned objects
      if (aggressive) {
        await this.cleanupOrphanedObjects();
      }

      const endTime = Date.now();
      const endMemory = this.getCurrentMemoryUsage();
      const memoryFreed = Math.max(0, startMemory - endMemory);

      this.memoryStats.lastCleanup = new Date();
      this.memoryStats.cleanupCount++;

      this.emit('cleanup_completed', {
        aggressive,
        duration: endTime - startTime,
        memoryFreed,
        startMemory,
        endMemory,
      });

      console.log(
        `Memory cleanup completed: ${memoryFreed}MB freed in ${endTime - startTime}ms`,
      );
    } finally {
      this.cleanupInProgress = false;
    }
  }

  /**
   * Get current memory usage statistics.
   * @returns Current memory statistics.
   */
  getMemoryStats(): MemoryStats {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / (1024 * 1024);
    const heapTotalMB = memUsage.heapTotal / (1024 * 1024);

    this.memoryStats = {
      heapUsed: heapUsedMB,
      heapTotal: heapTotalMB,
      external: memUsage.external / (1024 * 1024),
      rss: memUsage.rss / (1024 * 1024),
      activeExecutions: this.activeContexts.size,
      cachedResults: this.resultCache.size,
      cacheSize: this.calculateCacheSize(),
      lastCleanup: this.memoryStats.lastCleanup,
      cleanupCount: this.memoryStats.cleanupCount,
      memoryPressure: this.calculateMemoryPressure(heapUsedMB, heapTotalMB),
    };

    return { ...this.memoryStats };
  }

  /**
   * Update memory configuration.
   * @param newConfig New configuration values.
   */
  updateConfig(newConfig: Partial<MemoryConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.emit('config_updated', this.config);
  }

  /**
   * Shutdown the memory manager and cleanup all resources.
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    console.log('Shutting down memory manager...');

    // Stop monitoring
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }

    // Force cleanup of all active contexts
    const activeContextIds = Array.from(this.activeContexts.keys());
    for (const contextId of activeContextIds) {
      this.forceCleanup(contextId);
    }

    // Perform final aggressive cleanup
    await this.performCleanup(true);

    // Clear all caches
    this.resultCache.clear();
    this.activeContexts.clear();

    console.log('Memory manager shutdown completed');
  }

  /**
   * Initialize memory statistics.
   * @returns Initial memory statistics.
   */
  private initializeStats(): MemoryStats {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: memUsage.heapUsed / (1024 * 1024),
      heapTotal: memUsage.heapTotal / (1024 * 1024),
      external: memUsage.external / (1024 * 1024),
      rss: memUsage.rss / (1024 * 1024),
      activeExecutions: 0,
      cachedResults: 0,
      cacheSize: 0,
      lastCleanup: new Date(),
      cleanupCount: 0,
      memoryPressure: 'low',
    };
  }

  /**
   * Start memory monitoring timer.
   */
  private startMemoryMonitoring(): void {
    this.monitoringTimer = setInterval(() => {
      if (this.isShuttingDown) {
        return;
      }

      this.updateMemoryStats();
      this.checkMemoryPressure();
    }, this.config.monitoringIntervalMs);
  }

  /**
   * Update internal memory statistics.
   */
  private updateMemoryStats(): void {
    this.getMemoryStats(); // This updates this.memoryStats
  }

  /**
   * Check memory pressure and trigger cleanup if needed.
   */
  private checkMemoryPressure(): void {
    const stats = this.getMemoryStats();

    if (stats.memoryPressure === 'critical') {
      console.warn(
        'Critical memory pressure detected, performing aggressive cleanup...',
      );
      this.performCleanup(true);
    } else if (stats.memoryPressure === 'high' && !this.cleanupInProgress) {
      console.warn(
        'High memory pressure detected, performing standard cleanup...',
      );
      this.performCleanup(false);
    }
  }

  /**
   * Calculate memory pressure level.
   * @param heapUsed Current heap usage in MB.
   * @param heapTotal Total heap size in MB.
   * @returns Memory pressure level.
   */
  private calculateMemoryPressure(
    heapUsed: number,
    heapTotal: number,
  ): MemoryStats['memoryPressure'] {
    const usage = heapUsed / heapTotal;

    if (usage > MEMORY_PRESSURE_THRESHOLDS.critical) return 'critical';
    if (usage > MEMORY_PRESSURE_THRESHOLDS.high) return 'high';
    if (usage > MEMORY_PRESSURE_THRESHOLDS.medium) return 'medium';
    return 'low';
  }

  /**
   * Get current memory usage in MB.
   * @returns Current memory usage.
   */
  private getCurrentMemoryUsage(): number {
    return process.memoryUsage().heapUsed / (1024 * 1024);
  }

  /**
   * Check if a result should be cached.
   * @param result Result to check.
   * @returns Whether the result should be cached.
   */
  private shouldCacheResult(result: any): boolean {
    const resultSize = this.estimateObjectSize(result);
    const currentCacheSize = this.calculateCacheSize();

    return (
      resultSize < this.config.maxToolMemoryMB && // Don't cache huge results
      currentCacheSize + resultSize < this.config.resultCacheMaxMB && // Cache size limit
      typeof result === 'object' &&
      result !== null // Only cache objects
    );
  }

  /**
   * Cache a tool execution result.
   * @param toolCallId Tool call ID.
   * @param toolName Tool name.
   * @param result Result to cache.
   */
  private cacheResult(toolCallId: string, toolName: string, result: any): void {
    const size = this.estimateObjectSize(result);
    const cacheEntry: CachedToolResult = {
      toolCallId,
      toolName,
      result,
      size,
      timestamp: new Date(),
      accessCount: 0,
      lastAccessed: new Date(),
    };

    this.resultCache.set(this.createCacheKey(toolCallId, result), cacheEntry);
    this.emit('result_cached', { toolCallId, toolName, size });
  }

  /**
   * Create cache key for a tool result.
   * @param toolCallId Tool call ID.
   * @param result Result object.
   * @returns Cache key.
   */
  private createCacheKey(toolCallId: string, result: any): string {
    // Create a simple hash of the result for cache key
    const resultHash = this.simpleHash(JSON.stringify(result));
    return `${toolCallId}_${resultHash}`;
  }

  /**
   * Simple hash function for cache keys.
   * @param str String to hash.
   * @returns Hash value.
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Estimate object size in MB.
   * @param obj Object to estimate.
   * @returns Estimated size in MB.
   */
  private estimateObjectSize(obj: any): number {
    const jsonString = JSON.stringify(obj);
    return new TextEncoder().encode(jsonString).length / (1024 * 1024);
  }

  /**
   * Calculate total cache size.
   * @returns Cache size in MB.
   */
  private calculateCacheSize(): number {
    let totalSize = 0;
    for (const entry of this.resultCache.values()) {
      totalSize += entry.size;
    }
    return totalSize;
  }

  /**
   * Clean up result cache.
   * @param aggressive Whether to perform aggressive cleanup.
   */
  private async cleanupResultCache(aggressive: boolean): Promise<void> {
    const now = Date.now();
    const expiredKeys: string[] = [];
    const lowUsageKeys: string[] = [];

    for (const [key, entry] of this.resultCache.entries()) {
      const age = now - entry.timestamp.getTime();

      // Remove expired entries
      if (age > this.config.resultCacheMaxAgeMs) {
        expiredKeys.push(key);
      }
      // In aggressive mode, also remove low-usage entries
      else if (
        aggressive &&
        entry.accessCount === 0 &&
        age > this.config.resultCacheMaxAgeMs / 2
      ) {
        lowUsageKeys.push(key);
      }
    }

    // Remove expired entries
    for (const key of expiredKeys) {
      this.resultCache.delete(key);
    }

    // Remove low-usage entries if aggressive
    for (const key of lowUsageKeys) {
      this.resultCache.delete(key);
    }

    if (expiredKeys.length > 0 || lowUsageKeys.length > 0) {
      this.emit('cache_cleanup', {
        expiredEntries: expiredKeys.length,
        lowUsageEntries: lowUsageKeys.length,
        aggressive,
      });
    }
  }

  /**
   * Cleanup inactive execution contexts.
   */
  private async cleanupInactiveContexts(): Promise<void> {
    const inactiveContexts: string[] = [];

    for (const [id, context] of this.activeContexts.entries()) {
      if (!context.isActive) {
        inactiveContexts.push(id);
      }
    }

    for (const id of inactiveContexts) {
      this.forceCleanup(id);
    }
  }

  /**
   * Cleanup weak references that are no longer valid.
   */
  private async cleanupWeakReferences(): Promise<void> {
    let totalCleaned = 0;

    for (const context of this.activeContexts.values()) {
      const validRefs = new Set<WeakRef<any>>();

      for (const weakRef of context.allocatedObjects) {
        if (weakRef.deref() !== undefined) {
          validRefs.add(weakRef);
        } else {
          totalCleaned++;
        }
      }

      context.allocatedObjects = validRefs;
    }

    if (totalCleaned > 0) {
      this.emit('weak_refs_cleaned', { count: totalCleaned });
    }
  }

  /**
   * Force cleanup of oldest contexts to make room.
   * @param count Number of contexts to cleanup.
   */
  private forceCleanupOldestContexts(count: number): void {
    const contexts = Array.from(this.activeContexts.entries())
      .sort(([, a], [, b]) => a.startTime.getTime() - b.startTime.getTime())
      .slice(0, count);

    for (const [id] of contexts) {
      this.forceCleanup(id);
    }
  }

  /**
   * Cleanup orphaned objects (aggressive cleanup only).
   */
  private async cleanupOrphanedObjects(): Promise<void> {
    // This is a placeholder for more aggressive cleanup
    // Could implement object pool cleanup, buffer cleanup, etc.

    // Force finalization if available
    if (global.gc && Date.now() - this.lastGCTime > 30000) {
      // Only every 30 seconds
      global.gc();
      this.lastGCTime = Date.now();
    }
  }

  /**
   * Setup memory warning listeners.
   */
  private setupMemoryWarnings(): void {
    // Listen for process memory warnings
    process.on('warning', (warning) => {
      if (
        warning.name === 'MaxListenersExceededWarning' ||
        warning.message.includes('memory')
      ) {
        console.warn('Process memory warning:', warning.message);
        this.emit('memory_warning', { warning: warning.message });

        // Trigger immediate cleanup
        this.performCleanup(true);
      }
    });

    // Listen for uncaught exceptions that might indicate memory issues
    process.on('uncaughtException', (error) => {
      if (
        error.message.includes('out of memory') ||
        error.message.includes('heap')
      ) {
        console.error('Memory-related uncaught exception:', error.message);
        this.emit('memory_error', { error: error.message });

        // Emergency cleanup
        this.performCleanup(true);
      }
    });
  }
}

/**
 * Create a memory manager with provider-specific configuration.
 * @param providerId Provider identifier.
 * @param customConfig Optional custom configuration.
 * @returns Configured memory manager.
 */
export function createMemoryManager(
  providerId?: string,
  customConfig?: Partial<MemoryConfig>,
): MemoryManager {
  // Provider-specific memory configurations
  const providerConfigs: Record<string, Partial<MemoryConfig>> = {
    openai: {
      maxToolMemoryMB: 512, // OpenAI can handle larger payloads
      maxConcurrentExecutions: 8,
      resultCacheMaxMB: 256,
    },
    anthropic: {
      maxToolMemoryMB: 1024, // Anthropic handles large context windows well
      maxConcurrentExecutions: 6,
      resultCacheMaxMB: 512,
      resultCacheMaxAgeMs: 600000, // 10 minutes for Claude's complex responses
    },
    gemini: {
      maxToolMemoryMB: 256, // Conservative for Gemini
      maxConcurrentExecutions: 12,
      resultCacheMaxMB: 128,
    },
  };

  const providerConfig = providerId ? providerConfigs[providerId] || {} : {};
  const finalConfig = { ...providerConfig, ...customConfig };

  return new MemoryManager(finalConfig);
}

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
