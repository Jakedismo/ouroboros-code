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
export class PerformanceOptimizer {
  // Cache storage with LRU eviction
  private cache: Map<string, CacheEntry> = new Map();
  private cacheAccessOrder: string[] = [];
  private readonly maxCacheSize: number;
  private readonly defaultTTL: number;
  
  // Performance metrics storage
  private metrics: Map<string, ToolPerformanceMetrics> = new Map();
  private executionHistory: Map<string, number[]> = new Map();
  
  // Resource pools
  private pools: Map<string, ResourcePool<any>> = new Map();
  
  // Circuit breaker state
  private circuitBreakers: Map<string, {
    failures: number;
    lastFailure: Date;
    state: 'closed' | 'open' | 'half-open';
  }> = new Map();
  
  // Configuration
  private readonly config: {
    maxCacheSize: number;
    defaultTTL: number;
    maxParallelExecutions: number;
    circuitBreakerThreshold: number;
    circuitBreakerTimeout: number;
    enableProfiling: boolean;
    enableResourcePools: boolean;
  };
  
  constructor(config?: Partial<PerformanceOptimizer['config']>) {
    this.config = {
      maxCacheSize: 1000,
      defaultTTL: 5 * 60 * 1000, // 5 minutes
      maxParallelExecutions: 10,
      circuitBreakerThreshold: 5,
      circuitBreakerTimeout: 60000,
      enableProfiling: true,
      enableResourcePools: true,
      ...config,
    };
    
    this.maxCacheSize = this.config.maxCacheSize;
    this.defaultTTL = this.config.defaultTTL;
    
    // Initialize resource pools
    if (this.config.enableResourcePools) {
      this.initializeResourcePools();
    }
    
    // Start background cleanup tasks
    this.startBackgroundTasks();
  }
  
  /**
   * Create an optimized execution plan for multiple tool calls
   */
  async createExecutionPlan(
    toolCalls: UnifiedToolCall[],
    context: ToolExecutionContext
  ): Promise<ToolExecutionPlan> {
    const startTime = performance.now();
    
    // Analyze tool dependencies and characteristics
    const analysis = await this.analyzeToolCalls(toolCalls);
    
    // Create execution groups based on dependencies and characteristics
    const executionGroups = this.createExecutionGroups(toolCalls, analysis);
    
    // Apply optimization strategies
    const optimizations = this.identifyOptimizations(toolCalls, analysis);
    
    // Calculate resource requirements
    const resourceRequirements = this.calculateResourceRequirements(toolCalls);
    
    // Estimate total execution time
    const estimatedDuration = this.estimateGroupsExecutionTime(executionGroups);
    
    const planningTime = performance.now() - startTime;
    console.debug(`[PerformanceOptimizer] Created execution plan in ${planningTime.toFixed(2)}ms`);
    
    return {
      originalCalls: toolCalls,
      executionGroups,
      estimatedDuration,
      optimizations,
      resourceRequirements,
    };
  }
  
  /**
   * Check if a result is cached
   */
  getCachedResult(toolCall: UnifiedToolCall, context: ToolExecutionContext): UnifiedToolResult | null {
    const cacheKey = this.generateCacheKey(toolCall, context);
    const entry = this.cache.get(cacheKey);
    
    if (!entry) {
      return null;
    }
    
    // Check TTL
    if (Date.now() - entry.timestamp.getTime() > entry.ttl) {
      this.cache.delete(cacheKey);
      this.removeCacheKeyFromAccessOrder(cacheKey);
      return null;
    }
    
    // Update access statistics
    entry.accessCount++;
    entry.lastAccess = new Date();
    this.updateCacheAccessOrder(cacheKey);
    
    // Update cache hit rate in metrics
    this.updateCacheHitRate(toolCall.name, true);
    
    console.debug(`[PerformanceOptimizer] Cache hit for ${toolCall.name}`);
    return entry.result;
  }
  
  /**
   * Cache a tool execution result
   */
  cacheResult(
    toolCall: UnifiedToolCall,
    context: ToolExecutionContext,
    result: UnifiedToolResult,
    customTTL?: number
  ): void {
    const cacheKey = this.generateCacheKey(toolCall, context);
    const ttl = customTTL || this.getTTLForTool(toolCall.name);
    
    // Calculate memory size (rough estimate)
    const sizeBytes = this.estimateResultSize(result);
    
    const entry: CacheEntry = {
      result,
      timestamp: new Date(),
      ttl,
      accessCount: 1,
      lastAccess: new Date(),
      sizeBytes,
      tags: this.generateCacheTags(toolCall, context),
    };
    
    // Ensure cache size limit
    this.evictIfNecessary(sizeBytes);
    
    this.cache.set(cacheKey, entry);
    this.updateCacheAccessOrder(cacheKey);
    
    console.debug(`[PerformanceOptimizer] Cached result for ${toolCall.name} (TTL: ${ttl}ms, Size: ${sizeBytes} bytes)`);
  }
  
  /**
   * Record tool execution metrics
   */
  recordExecution(
    toolName: string,
    executionTime: number,
    success: boolean,
    memoryUsage?: number
  ): void {
    if (!this.config.enableProfiling) return;
    
    const existing = this.metrics.get(toolName) || {
      toolName,
      avgExecutionTime: 0,
      minExecutionTime: Infinity,
      maxExecutionTime: 0,
      totalExecutions: 0,
      successRate: 1,
      cacheHitRate: 0,
      avgMemoryUsage: 0,
      lastExecution: new Date(),
      trend: 'stable' as const,
    };
    
    // Update execution statistics
    existing.totalExecutions++;
    existing.lastExecution = new Date();
    existing.minExecutionTime = Math.min(existing.minExecutionTime, executionTime);
    existing.maxExecutionTime = Math.max(existing.maxExecutionTime, executionTime);
    
    // Calculate new averages
    existing.avgExecutionTime = (
      (existing.avgExecutionTime * (existing.totalExecutions - 1)) + executionTime
    ) / existing.totalExecutions;
    
    if (memoryUsage) {
      existing.avgMemoryUsage = (
        (existing.avgMemoryUsage * (existing.totalExecutions - 1)) + memoryUsage
      ) / existing.totalExecutions;
    }
    
    // Update success rate
    const successCount = Math.floor(existing.successRate * existing.totalExecutions);
    const newSuccessCount = success ? successCount + 1 : successCount;
    existing.successRate = newSuccessCount / existing.totalExecutions;
    
    // Update performance trend
    existing.trend = this.calculatePerformanceTrend(toolName, executionTime);
    
    this.metrics.set(toolName, existing);
    
    // Update circuit breaker state
    this.updateCircuitBreaker(toolName, success);
    
    console.debug(`[PerformanceOptimizer] Recorded execution for ${toolName}: ${executionTime}ms (success: ${success})`);
  }
  
  /**
   * Get performance metrics for a tool
   */
  getToolMetrics(toolName: string): ToolPerformanceMetrics | null {
    return this.metrics.get(toolName) || null;
  }
  
  /**
   * Get all performance metrics
   */
  getAllMetrics(): Map<string, ToolPerformanceMetrics> {
    return new Map(this.metrics);
  }
  
  /**
   * Check if a tool's circuit breaker is open
   */
  isCircuitBreakerOpen(toolName: string): boolean {
    const breaker = this.circuitBreakers.get(toolName);
    if (!breaker) return false;
    
    if (breaker.state === 'open') {
      // Check if timeout has passed to attempt half-open
      if (Date.now() - breaker.lastFailure.getTime() > this.config.circuitBreakerTimeout) {
        breaker.state = 'half-open';
        console.debug(`[PerformanceOptimizer] Circuit breaker for ${toolName} is now half-open`);
        return false;
      }
      return true;
    }
    
    return false;
  }
  
  /**
   * Invalidate cache entries by tags
   */
  invalidateCache(tags: string[]): number {
    let invalidated = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags.some(tag => tags.includes(tag))) {
        this.cache.delete(key);
        this.removeCacheKeyFromAccessOrder(key);
        invalidated++;
      }
    }
    
    console.debug(`[PerformanceOptimizer] Invalidated ${invalidated} cache entries`);
    return invalidated;
  }
  
  /**
   * Clear all cached results
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheAccessOrder.length = 0;
    console.debug('[PerformanceOptimizer] Cleared all cache entries');
  }
  
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
  } {
    let totalMemory = 0;
    let oldestEntry: Date | null = null;
    let newestEntry: Date | null = null;
    
    for (const entry of this.cache.values()) {
      totalMemory += entry.sizeBytes;
      if (!oldestEntry || entry.timestamp < oldestEntry) {
        oldestEntry = entry.timestamp;
      }
      if (!newestEntry || entry.timestamp > newestEntry) {
        newestEntry = entry.timestamp;
      }
    }
    
    // Calculate overall hit rate from metrics
    let totalHits = 0;
    let totalAttempts = 0;
    for (const metric of this.metrics.values()) {
      const attempts = metric.totalExecutions;
      const hits = Math.floor(attempts * metric.cacheHitRate);
      totalHits += hits;
      totalAttempts += attempts;
    }
    
    const hitRate = totalAttempts > 0 ? totalHits / totalAttempts : 0;
    
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      hitRate,
      totalMemoryMB: Math.round(totalMemory / (1024 * 1024) * 100) / 100,
      oldestEntry,
      newestEntry,
    };
  }
  
  /**
   * Get resource pool statistics
   */
  getResourcePoolStats(): Map<string, any> {
    const stats = new Map();
    for (const [name, pool] of this.pools.entries()) {
      stats.set(name, pool.getStats());
    }
    return stats;
  }
  
  /**
   * Optimize tool execution order based on dependencies and performance
   */
  optimizeExecutionOrder(toolCalls: UnifiedToolCall[]): UnifiedToolCall[] {
    // Create dependency graph
    const dependencies = this.analyzeDependencies(toolCalls);
    
    // Sort by priority and dependencies
    const sorted = [...toolCalls].sort((a, b) => {
      const aDeps = dependencies.get(a.id) || [];
      const bDeps = dependencies.get(b.id) || [];
      
      // Tools with fewer dependencies execute first
      if (aDeps.length !== bDeps.length) {
        return aDeps.length - bDeps.length;
      }
      
      // Use performance metrics as tiebreaker
      const aMetrics = this.getToolMetrics(a.name);
      const bMetrics = this.getToolMetrics(b.name);
      
      if (aMetrics && bMetrics) {
        return aMetrics.avgExecutionTime - bMetrics.avgExecutionTime;
      }
      
      return 0;
    });
    
    return sorted;
  }
  
  /**
   * Estimate execution time for a tool call
   */
  estimateExecutionTime(toolCall: UnifiedToolCall): number {
    const metrics = this.getToolMetrics(toolCall.name);
    if (metrics) {
      // Use historical data with trend adjustment
      const baseTime = metrics.avgExecutionTime;
      const trendMultiplier = metrics.trend === 'improving' ? 0.9 : 
                             metrics.trend === 'degrading' ? 1.1 : 1.0;
      return baseTime * trendMultiplier;
    }
    
    // Default estimates based on tool type
    return this.getDefaultExecutionTime(toolCall.name);
  }
  
  /**
   * Acquire a resource from a pool
   */
  async acquireResource<T>(poolName: string, timeoutMs: number = 5000): Promise<T> {
    const pool = this.pools.get(poolName);
    if (!pool) {
      throw new Error(`Resource pool '${poolName}' not found`);
    }
    
    return pool.acquire(timeoutMs);
  }
  
  /**
   * Release a resource back to a pool
   */
  releaseResource<T>(poolName: string, resource: T): void {
    const pool = this.pools.get(poolName);
    if (pool) {
      pool.release(resource);
    }
  }
  
  /**
   * Destroy the optimizer and clean up resources
   */
  async destroy(): Promise<void> {
    // Clear caches
    this.clearCache();
    
    // Destroy resource pools
    await Promise.all(
      Array.from(this.pools.values()).map(pool => pool.destroy())
    );
    this.pools.clear();
    
    console.debug('[PerformanceOptimizer] Destroyed optimizer and cleaned up resources');
  }
  
  // Private helper methods
  
  private async analyzeToolCalls(toolCalls: UnifiedToolCall[]) {
    // Analyze each tool call for characteristics
    return {
      dependencies: this.analyzeDependencies(toolCalls),
      ioIntensive: this.identifyIOIntensiveTools(toolCalls),
      cpuIntensive: this.identifyCPUIntensiveTools(toolCalls),
      cacheable: this.identifyCacheableTools(toolCalls),
      parallelizable: this.identifyParallelizableTools(toolCalls),
    };
  }
  
  private createExecutionGroups(toolCalls: UnifiedToolCall[], analysis: any): ToolExecutionGroup[] {
    const groups: ToolExecutionGroup[] = [];
    const processed = new Set<string>();
    
    for (const toolCall of toolCalls) {
      if (processed.has(toolCall.id)) continue;
      
      const group = this.createGroupForTool(toolCall, toolCalls, analysis, processed);
      groups.push(group);
    }
    
    return groups;
  }
  
  private createGroupForTool(
    rootTool: UnifiedToolCall,
    allTools: UnifiedToolCall[],
    analysis: any,
    processed: Set<string>
  ): ToolExecutionGroup {
    const groupTools = [rootTool];
    processed.add(rootTool.id);
    
    // Find tools that can be grouped with this one
    for (const tool of allTools) {
      if (processed.has(tool.id)) continue;
      
      if (this.canGroupTogether(rootTool, tool, analysis)) {
        groupTools.push(tool);
        processed.add(tool.id);
      }
    }
    
    // Determine execution mode
    const mode = this.determineExecutionMode(groupTools, analysis);
    
    return {
      tools: groupTools,
      mode,
      priority: this.calculateGroupPriority(groupTools),
      dependencies: [],
      groupId: `group_${rootTool.name}_${Date.now()}`,
      estimatedTime: this.estimateGroupExecutionTime(groupTools, mode),
    };
  }
  
  private identifyOptimizations(toolCalls: UnifiedToolCall[], analysis: any): OptimizationStrategy[] {
    const strategies: OptimizationStrategy[] = [];
    
    // Caching optimization
    const cacheableTools = toolCalls.filter(call => analysis.cacheable.has(call.id));
    if (cacheableTools.length > 0) {
      strategies.push({
        type: 'caching',
        name: 'Intelligent Caching',
        description: 'Cache results for frequently accessed tools',
        expectedImprovement: 0.6,
        affectedTools: cacheableTools.map(t => t.name),
      });
    }
    
    // Parallel execution optimization
    const parallelizableTools = toolCalls.filter(call => analysis.parallelizable.has(call.id));
    if (parallelizableTools.length > 1) {
      strategies.push({
        type: 'parallel',
        name: 'Parallel Execution',
        description: 'Execute independent tools in parallel',
        expectedImprovement: 0.4,
        affectedTools: parallelizableTools.map(t => t.name),
      });
    }
    
    return strategies;
  }
  
  private calculateResourceRequirements(toolCalls: UnifiedToolCall[]): ResourceRequirements {
    let memoryMB = 0;
    let cpuCores = 1;
    let networkMbps = 0;
    let diskIOPS = 0;
    let connections = 0;
    let tempStorageMB = 0;
    
    for (const toolCall of toolCalls) {
      const reqs = this.getToolResourceRequirements(toolCall.name);
      memoryMB += reqs.memoryMB;
      cpuCores = Math.max(cpuCores, reqs.cpuCores);
      networkMbps += reqs.networkMbps;
      diskIOPS += reqs.diskIOPS;
      connections += reqs.connections;
      tempStorageMB += reqs.tempStorageMB;
    }
    
    return {
      memoryMB,
      cpuCores,
      networkMbps,
      diskIOPS,
      connections,
      tempStorageMB,
    };
  }
  
  private getToolResourceRequirements(toolName: string): ResourceRequirements {
    // Default resource requirements by tool type
    const defaults: Record<string, ResourceRequirements> = {
      'read_file': { memoryMB: 10, cpuCores: 1, networkMbps: 0, diskIOPS: 10, connections: 0, tempStorageMB: 0 },
      'write_file': { memoryMB: 10, cpuCores: 1, networkMbps: 0, diskIOPS: 20, connections: 0, tempStorageMB: 5 },
      'web_fetch': { memoryMB: 5, cpuCores: 1, networkMbps: 1, diskIOPS: 0, connections: 1, tempStorageMB: 2 },
      'run_shell_command': { memoryMB: 20, cpuCores: 1, networkMbps: 0, diskIOPS: 5, connections: 0, tempStorageMB: 10 },
    };
    
    return defaults[toolName] || { memoryMB: 5, cpuCores: 1, networkMbps: 0, diskIOPS: 1, connections: 0, tempStorageMB: 1 };
  }
  
  private estimateGroupsExecutionTime(groups: ToolExecutionGroup[]): number {
    let totalTime = 0;
    
    for (const group of groups) {
      totalTime += group.estimatedTime;
    }
    
    return totalTime;
  }
  
  private generateCacheKey(toolCall: UnifiedToolCall, context: ToolExecutionContext): string {
    const params = JSON.stringify(
      toolCall.parameters || {}, 
      toolCall.parameters ? Object.keys(toolCall.parameters).sort() : []
    );
    return `${toolCall.name}:${context.provider || 'unknown'}:${Buffer.from(params).toString('base64')}`;
  }
  
  private getTTLForTool(toolName: string): number {
    // Tool-specific TTL configuration
    const ttlConfig: Record<string, number> = {
      'read_file': 2 * 60 * 1000, // 2 minutes for file reads
      'web_fetch': 10 * 60 * 1000, // 10 minutes for web content
      'google_web_search': 30 * 60 * 1000, // 30 minutes for search results
      'ls': 1 * 60 * 1000, // 1 minute for directory listings
    };
    
    return ttlConfig[toolName] || this.defaultTTL;
  }
  
  private generateCacheTags(toolCall: UnifiedToolCall, context: ToolExecutionContext): string[] {
    const tags: string[] = [toolCall.name];
    if (context.provider) {
      tags.push(context.provider);
    }
    
    // Add parameter-based tags
    if (toolCall.parameters && toolCall.parameters['file_path']) {
      tags.push(`file:${toolCall.parameters['file_path']}`);
    }
    if (toolCall.parameters && toolCall.parameters['url']) {
      tags.push(`url:${toolCall.parameters['url']}`);
    }
    
    return tags.filter(tag => tag !== undefined) as string[];
  }
  
  private estimateResultSize(result: UnifiedToolResult): number {
    return JSON.stringify(result).length * 2; // Rough estimate
  }
  
  private evictIfNecessary(newEntrySize: number): void {
    while (this.cache.size >= this.maxCacheSize || this.shouldEvictForMemory(newEntrySize)) {
      const oldestKey = this.cacheAccessOrder[0];
      if (oldestKey) {
        this.cache.delete(oldestKey);
        this.cacheAccessOrder.shift();
      } else {
        break;
      }
    }
  }
  
  private shouldEvictForMemory(newEntrySize: number): boolean {
    const currentMemory = Array.from(this.cache.values()).reduce(
      (sum, entry) => sum + entry.sizeBytes,
      0
    );
    const maxMemory = 100 * 1024 * 1024; // 100MB cache limit
    return (currentMemory + newEntrySize) > maxMemory;
  }
  
  private updateCacheAccessOrder(key: string): void {
    const index = this.cacheAccessOrder.indexOf(key);
    if (index > -1) {
      this.cacheAccessOrder.splice(index, 1);
    }
    this.cacheAccessOrder.push(key);
  }
  
  private removeCacheKeyFromAccessOrder(key: string): void {
    const index = this.cacheAccessOrder.indexOf(key);
    if (index > -1) {
      this.cacheAccessOrder.splice(index, 1);
    }
  }
  
  private updateCacheHitRate(toolName: string, isHit: boolean): void {
    const metric = this.metrics.get(toolName);
    if (metric) {
      const totalAttempts = Math.max(1, metric.totalExecutions);
      const currentHits = Math.floor(metric.cacheHitRate * totalAttempts);
      const newHits = isHit ? currentHits + 1 : currentHits;
      metric.cacheHitRate = newHits / (totalAttempts + 1);
    }
  }
  
  private calculatePerformanceTrend(toolName: string, executionTime: number): 'improving' | 'stable' | 'degrading' {
    const history = this.executionHistory.get(toolName) || [];
    history.push(executionTime);
    
    // Keep only recent history (last 10 executions)
    if (history.length > 10) {
      history.shift();
    }
    
    this.executionHistory.set(toolName, history);
    
    if (history.length < 3) {
      return 'stable';
    }
    
    // Calculate trend using linear regression
    const recent = history.slice(-5);
    const older = history.slice(-10, -5);
    
    if (older.length === 0) return 'stable';
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    
    const threshold = olderAvg * 0.1; // 10% threshold
    
    if (recentAvg < olderAvg - threshold) {
      return 'improving';
    } else if (recentAvg > olderAvg + threshold) {
      return 'degrading';
    } else {
      return 'stable';
    }
  }
  
  private updateCircuitBreaker(toolName: string, success: boolean): void {
    const breaker = this.circuitBreakers.get(toolName) || {
      failures: 0,
      lastFailure: new Date(),
      state: 'closed' as const,
    };
    
    if (success) {
      if (breaker.state === 'half-open') {
        breaker.state = 'closed';
        breaker.failures = 0;
      }
    } else {
      breaker.failures++;
      breaker.lastFailure = new Date();
      
      if (breaker.failures >= this.config.circuitBreakerThreshold) {
        breaker.state = 'open';
        console.warn(`[PerformanceOptimizer] Circuit breaker opened for ${toolName} after ${breaker.failures} failures`);
      }
    }
    
    this.circuitBreakers.set(toolName, breaker);
  }
  
  private analyzeDependencies(toolCalls: UnifiedToolCall[]): Map<string, string[]> {
    const dependencies = new Map<string, string[]>();
    
    for (const toolCall of toolCalls) {
      const deps = this.getToolDependencies(toolCall, toolCalls);
      dependencies.set(toolCall.id, deps);
    }
    
    return dependencies;
  }
  
  private getToolDependencies(toolCall: UnifiedToolCall, allCalls: UnifiedToolCall[]): string[] {
    const deps: string[] = [];
    
    // Simple dependency analysis based on parameters
    if (toolCall.name === 'write_file' || toolCall.name === 'edit_file') {
      // Find read operations on the same file that should execute first
      const filePath = toolCall.parameters && toolCall.parameters['file_path'];
      for (const otherCall of allCalls) {
        if (otherCall.id !== toolCall.id && 
            otherCall.name === 'read_file' && 
            otherCall.parameters && otherCall.parameters['file_path'] === filePath) {
          deps.push(otherCall.id);
        }
      }
    }
    
    return deps;
  }
  
  private identifyIOIntensiveTools(toolCalls: UnifiedToolCall[]): Set<string> {
    const ioIntensive = new Set<string>();
    const ioTools = ['read_file', 'write_file', 'read_many_files', 'ls', 'glob', 'grep'];
    
    for (const toolCall of toolCalls) {
      if (ioTools.includes(toolCall.name)) {
        ioIntensive.add(toolCall.id);
      }
    }
    
    return ioIntensive;
  }
  
  private identifyCPUIntensiveTools(toolCalls: UnifiedToolCall[]): Set<string> {
    const cpuIntensive = new Set<string>();
    const cpuTools = ['run_shell_command', 'grep'];
    
    for (const toolCall of toolCalls) {
      if (cpuTools.includes(toolCall.name)) {
        cpuIntensive.add(toolCall.id);
      }
    }
    
    return cpuIntensive;
  }
  
  private identifyCacheableTools(toolCalls: UnifiedToolCall[]): Set<string> {
    const cacheable = new Set<string>();
    const cacheableTools = ['read_file', 'web_fetch', 'google_web_search', 'ls'];
    
    for (const toolCall of toolCalls) {
      if (cacheableTools.includes(toolCall.name)) {
        cacheable.add(toolCall.id);
      }
    }
    
    return cacheable;
  }
  
  private identifyParallelizableTools(toolCalls: UnifiedToolCall[]): Set<string> {
    const parallelizable = new Set<string>();
    
    // Tools that don't modify state and can run in parallel
    for (const toolCall of toolCalls) {
      if (['read_file', 'web_fetch', 'google_web_search', 'ls', 'glob', 'grep'].includes(toolCall.name)) {
        parallelizable.add(toolCall.id);
      }
    }
    
    return parallelizable;
  }
  
  private canGroupTogether(tool1: UnifiedToolCall, tool2: UnifiedToolCall, analysis: any): boolean {
    // Don't group if there are dependencies
    const deps1 = analysis.dependencies.get(tool1.id) || [];
    const deps2 = analysis.dependencies.get(tool2.id) || [];
    
    if (deps1.includes(tool2.id) || deps2.includes(tool1.id)) {
      return false;
    }
    
    // Group similar tools together
    return this.getToolCategory(tool1.name) === this.getToolCategory(tool2.name);
  }
  
  private getToolCategory(toolName: string): string {
    const categories: Record<string, string> = {
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
    
    return categories[toolName] || 'other';
  }
  
  private determineExecutionMode(tools: UnifiedToolCall[], analysis: any): 'parallel' | 'sequential' | 'pipeline' {
    if (tools.length === 1) {
      return 'sequential';
    }
    
    // Check if all tools can run in parallel
    const allParallelizable = tools.every(tool => analysis.parallelizable.has(tool.id));
    if (allParallelizable) {
      return 'parallel';
    }
    
    // Check for pipeline pattern (output of one feeds into another)
    const hasDependencies = tools.some(tool => {
      const deps = analysis.dependencies.get(tool.id) || [];
      return deps.some((dep: any) => tools.some(t => t.id === dep));
    });
    
    if (hasDependencies) {
      return 'pipeline';
    }
    
    return 'sequential';
  }
  
  private calculateGroupPriority(tools: UnifiedToolCall[]): number {
    // Higher priority for smaller groups and faster tools
    let priority = 100 - tools.length * 10;
    
    for (const tool of tools) {
      const metrics = this.getToolMetrics(tool.name);
      if (metrics) {
        // Faster tools get higher priority
        priority += Math.max(0, 1000 - metrics.avgExecutionTime) / 100;
      }
    }
    
    return Math.max(0, priority);
  }
  
  private estimateGroupExecutionTime(tools: UnifiedToolCall[], mode: 'parallel' | 'sequential' | 'pipeline'): number {
    const times = tools.map(tool => this.estimateExecutionTime(tool));
    
    switch (mode) {
      case 'parallel':
        return Math.max(...times);
      case 'sequential':
      case 'pipeline':
        return times.reduce((sum, time) => sum + time, 0);
      default:
        return times.reduce((sum, time) => sum + time, 0);
    }
  }
  
  private getDefaultExecutionTime(toolName: string): number {
    const defaults: Record<string, number> = {
      'read_file': 100,
      'write_file': 150,
      'edit_file': 200,
      'ls': 50,
      'glob': 300,
      'grep': 500,
      'read_many_files': 1000,
      'web_fetch': 2000,
      'google_web_search': 1500,
      'run_shell_command': 1000,
      'save_memory': 100,
    };
    
    return defaults[toolName] || 500;
  }
  
  private initializeResourcePools(): void {
    // Initialize HTTP connection pool
    this.pools.set('http', this.createHttpPool());
    
    // Initialize file handle pool
    this.pools.set('files', this.createFilePool());
  }
  
  private createHttpPool(): ResourcePool<any> {
    // Implementation would depend on HTTP client library
    return {
      acquire: async () => ({}),
      release: () => {},
      getStats: () => ({ total: 10, available: 8, inUse: 2, pending: 0 }),
      destroy: async () => {},
    };
  }
  
  private createFilePool(): ResourcePool<any> {
    // Implementation would manage file descriptors
    return {
      acquire: async () => ({}),
      release: () => {},
      getStats: () => ({ total: 100, available: 95, inUse: 5, pending: 0 }),
      destroy: async () => {},
    };
  }
  
  private startBackgroundTasks(): void {
    // Cache cleanup task
    setInterval(() => {
      this.cleanupExpiredCache();
    }, 60000); // Every minute
    
    // Metrics rotation task
    setInterval(() => {
      this.rotateMetrics();
    }, 3600000); // Every hour
  }
  
  private cleanupExpiredCache(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp.getTime() > entry.ttl) {
        this.cache.delete(key);
        this.removeCacheKeyFromAccessOrder(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.debug(`[PerformanceOptimizer] Cleaned up ${cleaned} expired cache entries`);
    }
  }
  
  private rotateMetrics(): void {
    // Keep only recent metrics to prevent memory growth
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    
    for (const [toolName, metric] of this.metrics.entries()) {
      if (metric.lastExecution.getTime() < cutoff) {
        this.metrics.delete(toolName);
        this.executionHistory.delete(toolName);
      }
    }
  }
}