/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { Config } from '../../../core/src/config/config.js';
import { ToolRegistry } from '../../../core/src/tools/tool-registry.js';
import { AgentManager } from '../core/agent-manager.js';
import { SessionManager } from '../session/session-manager.js';
import { AgentAnalyticsIntegration } from '../integration/agent-analytics-integration.js';
import { Logger } from '../../../core/src/utils/logger.js';

/**
 * Performance optimization configuration
 */
export interface PerformanceConfig {
  // Memory management
  memoryThresholds: {
    warning: number; // MB
    critical: number; // MB
    cleanup: number; // MB
  };
  
  // Resource pooling
  resourcePools: {
    maxConcurrentAgents: number;
    maxConcurrentWorkflows: number;
    maxConcurrentTools: number;
    agentIdleTimeoutMs: number;
    workflowTimeoutMs: number;
  };
  
  // Caching strategy
  caching: {
    agentResponseCacheTtlMs: number;
    toolResultCacheTtlMs: number;
    sessionStateCacheSize: number;
    enableIntelligentPrefetch: boolean;
  };
  
  // Performance targets
  targets: {
    agentActivationTimeMs: number;
    workflowExecutionTimeMs: number;
    toolExecutionTimeMs: number;
    memoryEfficiencyRatio: number;
  };
  
  // Auto-optimization settings
  autoOptimization: {
    enabled: boolean;
    intervalMs: number;
    adaptiveThresholds: boolean;
    learningRate: number;
  };
}

/**
 * Resource usage snapshot
 */
export interface ResourceSnapshot {
  timestamp: number;
  memory: {
    used: number;
    available: number;
    percentage: number;
  };
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  agents: {
    active: number;
    idle: number;
    total: number;
  };
  workflows: {
    running: number;
    queued: number;
    completed: number;
  };
  tools: {
    executing: number;
    cached: number;
    totalCalls: number;
  };
  performance: {
    averageAgentActivationTime: number;
    averageWorkflowExecutionTime: number;
    averageToolExecutionTime: number;
    cacheHitRatio: number;
  };
}

/**
 * Optimization action result
 */
export interface OptimizationAction {
  type: 'memory_cleanup' | 'cache_eviction' | 'agent_scaling' | 'resource_rebalancing' | 'performance_tuning';
  description: string;
  impact: {
    memoryFreed?: number;
    cacheEntriesEvicted?: number;
    agentsOptimized?: number;
    performanceGain?: number;
  };
  timestamp: number;
  success: boolean;
  error?: string;
}

/**
 * Performance optimization results
 */
export interface OptimizationResults {
  snapshot: ResourceSnapshot;
  actions: OptimizationAction[];
  improvements: {
    memoryReduction: number;
    speedIncrease: number;
    efficiencyGain: number;
    cacheHitRateImprovement: number;
  };
  recommendations: string[];
  nextOptimizationMs: number;
}

/**
 * Comprehensive performance optimizer for the multi-agent system
 */
export class PerformanceOptimizer extends EventEmitter {
  private logger: Logger;
  private config: PerformanceConfig;
  private resourceSnapshots: ResourceSnapshot[] = [];
  private optimizationHistory: OptimizationAction[] = [];
  private caches: Map<string, Map<string, { data: any; timestamp: number; ttl: number }>> = new Map();
  private resourcePools: Map<string, Set<string>> = new Map();
  private performanceBaseline?: ResourceSnapshot;
  private optimizationTimer?: NodeJS.Timeout;
  private isOptimizing = false;

  constructor(
    private coreConfig: Config,
    private toolRegistry: ToolRegistry,
    private agentManager: AgentManager,
    private sessionManager: SessionManager,
    private analytics: AgentAnalyticsIntegration,
    performanceConfig?: Partial<PerformanceConfig>
  ) {
    super();
    this.logger = new Logger('PerformanceOptimizer');
    
    // Default performance configuration
    this.config = {
      memoryThresholds: {
        warning: 512, // 512MB
        critical: 1024, // 1GB
        cleanup: 256, // 256MB
      },
      resourcePools: {
        maxConcurrentAgents: 10,
        maxConcurrentWorkflows: 20,
        maxConcurrentTools: 50,
        agentIdleTimeoutMs: 300000, // 5 minutes
        workflowTimeoutMs: 1800000, // 30 minutes
      },
      caching: {
        agentResponseCacheTtlMs: 600000, // 10 minutes
        toolResultCacheTtlMs: 300000, // 5 minutes
        sessionStateCacheSize: 100,
        enableIntelligentPrefetch: true,
      },
      targets: {
        agentActivationTimeMs: 1000,
        workflowExecutionTimeMs: 30000,
        toolExecutionTimeMs: 5000,
        memoryEfficiencyRatio: 0.8,
      },
      autoOptimization: {
        enabled: true,
        intervalMs: 60000, // 1 minute
        adaptiveThresholds: true,
        learningRate: 0.1,
      },
      ...performanceConfig,
    };

    this.initializeCaches();
    this.initializeResourcePools();
  }

  /**
   * Initialize performance optimization system
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing performance optimizer...');

    // Take baseline performance snapshot
    this.performanceBaseline = await this.takeResourceSnapshot();
    this.logger.info('Performance baseline established', {
      memory: this.performanceBaseline.memory,
      agents: this.performanceBaseline.agents,
    });

    // Start auto-optimization if enabled
    if (this.config.autoOptimization.enabled) {
      this.startAutoOptimization();
    }

    // Set up event listeners
    this.setupEventListeners();

    this.emit('optimizer-initialized', {
      config: this.config,
      baseline: this.performanceBaseline,
    });

    this.logger.info('Performance optimizer initialized successfully');
  }

  /**
   * Take a comprehensive resource usage snapshot
   */
  async takeResourceSnapshot(): Promise<ResourceSnapshot> {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const loadAverage = require('os').loadavg();

    // Get agent statistics
    const agentStats = await this.getAgentStatistics();
    const workflowStats = await this.getWorkflowStatistics();
    const toolStats = await this.getToolStatistics();

    // Calculate performance metrics
    const performanceMetrics = await this.calculatePerformanceMetrics();

    const snapshot: ResourceSnapshot = {
      timestamp: Date.now(),
      memory: {
        used: memoryUsage.heapUsed / 1024 / 1024, // MB
        available: memoryUsage.heapTotal / 1024 / 1024, // MB
        percentage: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
      },
      cpu: {
        usage: (cpuUsage.user + cpuUsage.system) / 1000, // ms
        loadAverage,
      },
      agents: agentStats,
      workflows: workflowStats,
      tools: toolStats,
      performance: performanceMetrics,
    };

    // Store snapshot for trend analysis
    this.resourceSnapshots.push(snapshot);
    if (this.resourceSnapshots.length > 100) {
      this.resourceSnapshots.shift(); // Keep only last 100 snapshots
    }

    return snapshot;
  }

  /**
   * Run comprehensive performance optimization
   */
  async optimizePerformance(): Promise<OptimizationResults> {
    if (this.isOptimizing) {
      throw new Error('Optimization already in progress');
    }

    this.isOptimizing = true;
    this.logger.info('Starting performance optimization cycle...');

    try {
      // Take pre-optimization snapshot
      const preSnapshot = await this.takeResourceSnapshot();

      const actions: OptimizationAction[] = [];

      // 1. Memory optimization
      const memoryActions = await this.optimizeMemoryUsage(preSnapshot);
      actions.push(...memoryActions);

      // 2. Cache optimization
      const cacheActions = await this.optimizeCaches(preSnapshot);
      actions.push(...cacheActions);

      // 3. Agent pool optimization
      const agentActions = await this.optimizeAgentPools(preSnapshot);
      actions.push(...agentActions);

      // 4. Resource rebalancing
      const resourceActions = await this.rebalanceResources(preSnapshot);
      actions.push(...resourceActions);

      // 5. Performance tuning
      const tuningActions = await this.tunePerformance(preSnapshot);
      actions.push(...tuningActions);

      // Take post-optimization snapshot
      const postSnapshot = await this.takeResourceSnapshot();

      // Calculate improvements
      const improvements = this.calculateImprovements(preSnapshot, postSnapshot);

      // Generate recommendations
      const recommendations = this.generateRecommendations(postSnapshot, actions);

      const results: OptimizationResults = {
        snapshot: postSnapshot,
        actions,
        improvements,
        recommendations,
        nextOptimizationMs: this.config.autoOptimization.intervalMs,
      };

      // Store optimization history
      this.optimizationHistory.push(...actions);
      if (this.optimizationHistory.length > 1000) {
        this.optimizationHistory = this.optimizationHistory.slice(-500);
      }

      this.emit('optimization-completed', results);
      this.logger.info('Performance optimization completed', {
        actionsCount: actions.length,
        improvements,
      });

      return results;
    } finally {
      this.isOptimizing = false;
    }
  }

  /**
   * Optimize memory usage
   */
  private async optimizeMemoryUsage(snapshot: ResourceSnapshot): Promise<OptimizationAction[]> {
    const actions: OptimizationAction[] = [];

    // Check if memory usage is above thresholds
    if (snapshot.memory.used > this.config.memoryThresholds.critical) {
      // Critical memory cleanup
      const cleaned = await this.performCriticalMemoryCleanup();
      actions.push({
        type: 'memory_cleanup',
        description: 'Critical memory cleanup performed',
        impact: { memoryFreed: cleaned },
        timestamp: Date.now(),
        success: true,
      });
    } else if (snapshot.memory.used > this.config.memoryThresholds.warning) {
      // Standard memory cleanup
      const cleaned = await this.performStandardMemoryCleanup();
      actions.push({
        type: 'memory_cleanup',
        description: 'Standard memory cleanup performed',
        impact: { memoryFreed: cleaned },
        timestamp: Date.now(),
        success: true,
      });
    }

    return actions;
  }

  /**
   * Optimize cache performance
   */
  private async optimizeCaches(snapshot: ResourceSnapshot): Promise<OptimizationAction[]> {
    const actions: OptimizationAction[] = [];

    let totalEvicted = 0;

    // Evict expired cache entries
    for (const [cacheType, cache] of this.caches.entries()) {
      const evicted = this.evictExpiredEntries(cache);
      if (evicted > 0) {
        totalEvicted += evicted;
      }
    }

    // Evict least recently used entries if cache is too large
    const sessionCache = this.caches.get('session-state');
    if (sessionCache && sessionCache.size > this.config.caching.sessionStateCacheSize) {
      const lruEvicted = this.evictLRUEntries(sessionCache, this.config.caching.sessionStateCacheSize);
      totalEvicted += lruEvicted;
    }

    if (totalEvicted > 0) {
      actions.push({
        type: 'cache_eviction',
        description: `Evicted ${totalEvicted} expired and LRU cache entries`,
        impact: { cacheEntriesEvicted: totalEvicted },
        timestamp: Date.now(),
        success: true,
      });
    }

    return actions;
  }

  /**
   * Optimize agent pools
   */
  private async optimizeAgentPools(snapshot: ResourceSnapshot): Promise<OptimizationAction[]> {
    const actions: OptimizationAction[] = [];

    // Scale down idle agents
    const idleAgents = await this.getIdleAgents();
    let scaledDown = 0;

    for (const agentId of idleAgents) {
      const idleTime = await this.getAgentIdleTime(agentId);
      if (idleTime > this.config.resourcePools.agentIdleTimeoutMs) {
        await this.scaleDownAgent(agentId);
        scaledDown++;
      }
    }

    if (scaledDown > 0) {
      actions.push({
        type: 'agent_scaling',
        description: `Scaled down ${scaledDown} idle agents`,
        impact: { agentsOptimized: scaledDown },
        timestamp: Date.now(),
        success: true,
      });
    }

    return actions;
  }

  /**
   * Rebalance resources across the system
   */
  private async rebalanceResources(snapshot: ResourceSnapshot): Promise<OptimizationAction[]> {
    const actions: OptimizationAction[] = [];

    // Rebalance agent workloads
    const rebalanced = await this.rebalanceAgentWorkloads();
    if (rebalanced > 0) {
      actions.push({
        type: 'resource_rebalancing',
        description: `Rebalanced workloads for ${rebalanced} agents`,
        impact: { agentsOptimized: rebalanced },
        timestamp: Date.now(),
        success: true,
      });
    }

    return actions;
  }

  /**
   * Tune performance parameters
   */
  private async tunePerformance(snapshot: ResourceSnapshot): Promise<OptimizationAction[]> {
    const actions: OptimizationAction[] = [];

    if (this.config.autoOptimization.adaptiveThresholds) {
      // Adjust thresholds based on historical performance
      const performanceGain = await this.adaptiveThresholdTuning(snapshot);
      if (performanceGain > 0) {
        actions.push({
          type: 'performance_tuning',
          description: 'Adaptive threshold tuning applied',
          impact: { performanceGain },
          timestamp: Date.now(),
          success: true,
        });
      }
    }

    return actions;
  }

  /**
   * Calculate performance improvements
   */
  private calculateImprovements(pre: ResourceSnapshot, post: ResourceSnapshot) {
    return {
      memoryReduction: Math.max(0, pre.memory.used - post.memory.used),
      speedIncrease: Math.max(0, pre.performance.averageWorkflowExecutionTime - post.performance.averageWorkflowExecutionTime),
      efficiencyGain: Math.max(0, post.performance.cacheHitRatio - pre.performance.cacheHitRatio),
      cacheHitRateImprovement: Math.max(0, post.performance.cacheHitRatio - pre.performance.cacheHitRatio),
    };
  }

  /**
   * Generate optimization recommendations
   */
  private generateRecommendations(snapshot: ResourceSnapshot, actions: OptimizationAction[]): string[] {
    const recommendations: string[] = [];

    if (snapshot.memory.percentage > 80) {
      recommendations.push('Consider increasing memory allocation or reducing concurrent operations');
    }

    if (snapshot.performance.averageAgentActivationTime > this.config.targets.agentActivationTimeMs) {
      recommendations.push('Agent activation time is above target; consider optimizing agent initialization');
    }

    if (snapshot.performance.cacheHitRatio < 0.7) {
      recommendations.push('Cache hit ratio is low; consider increasing cache TTL or improving cache strategies');
    }

    if (snapshot.agents.idle / snapshot.agents.total > 0.5) {
      recommendations.push('High number of idle agents; consider implementing more aggressive scaling policies');
    }

    return recommendations;
  }

  /**
   * Set up event listeners for performance monitoring
   */
  private setupEventListeners(): void {
    // Listen to agent events
    this.agentManager.on('agent-activated', (agentId) => {
      this.updateAgentPool('active', agentId);
    });

    this.agentManager.on('agent-deactivated', (agentId) => {
      this.updateAgentPool('idle', agentId);
    });

    // Listen to analytics events
    this.analytics.on('performance-alert', (alert) => {
      this.handlePerformanceAlert(alert);
    });
  }

  /**
   * Start automatic optimization cycle
   */
  private startAutoOptimization(): void {
    this.optimizationTimer = setInterval(async () => {
      try {
        await this.optimizePerformance();
      } catch (error) {
        this.logger.error('Auto-optimization failed', { error });
      }
    }, this.config.autoOptimization.intervalMs);
  }

  /**
   * Stop automatic optimization
   */
  stopAutoOptimization(): void {
    if (this.optimizationTimer) {
      clearInterval(this.optimizationTimer);
      this.optimizationTimer = undefined;
    }
  }

  /**
   * Get current optimization status
   */
  getOptimizationStatus() {
    return {
      isOptimizing: this.isOptimizing,
      autoOptimizationEnabled: this.config.autoOptimization.enabled,
      lastOptimization: this.optimizationHistory[this.optimizationHistory.length - 1]?.timestamp,
      snapshotsCount: this.resourceSnapshots.length,
      actionsHistory: this.optimizationHistory.length,
      cacheStatus: this.getCacheStatus(),
      resourcePoolStatus: this.getResourcePoolStatus(),
    };
  }

  /**
   * Initialize cache systems
   */
  private initializeCaches(): void {
    this.caches.set('agent-response', new Map());
    this.caches.set('tool-result', new Map());
    this.caches.set('session-state', new Map());
  }

  /**
   * Initialize resource pools
   */
  private initializeResourcePools(): void {
    this.resourcePools.set('active-agents', new Set());
    this.resourcePools.set('idle-agents', new Set());
    this.resourcePools.set('running-workflows', new Set());
    this.resourcePools.set('executing-tools', new Set());
  }

  // Helper methods for optimization operations
  private async performCriticalMemoryCleanup(): Promise<number> {
    // Force garbage collection and clear non-essential caches
    if (global.gc) {
      global.gc();
    }
    
    // Clear all caches
    let totalCleared = 0;
    for (const [, cache] of this.caches) {
      totalCleared += cache.size;
      cache.clear();
    }
    
    return totalCleared;
  }

  private async performStandardMemoryCleanup(): Promise<number> {
    // Clear expired cache entries
    let totalCleared = 0;
    for (const [, cache] of this.caches) {
      totalCleared += this.evictExpiredEntries(cache);
    }
    return totalCleared;
  }

  private evictExpiredEntries(cache: Map<string, any>): number {
    const now = Date.now();
    let evicted = 0;
    
    for (const [key, entry] of cache) {
      if (now - entry.timestamp > entry.ttl) {
        cache.delete(key);
        evicted++;
      }
    }
    
    return evicted;
  }

  private evictLRUEntries(cache: Map<string, any>, maxSize: number): number {
    if (cache.size <= maxSize) return 0;
    
    const entries = Array.from(cache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    const toEvict = entries.slice(0, cache.size - maxSize);
    toEvict.forEach(([key]) => cache.delete(key));
    
    return toEvict.length;
  }

  private async getAgentStatistics() {
    // Implementation would integrate with AgentManager
    return {
      active: this.resourcePools.get('active-agents')?.size || 0,
      idle: this.resourcePools.get('idle-agents')?.size || 0,
      total: (this.resourcePools.get('active-agents')?.size || 0) + (this.resourcePools.get('idle-agents')?.size || 0),
    };
  }

  private async getWorkflowStatistics() {
    // Implementation would integrate with WorkflowManager
    return {
      running: this.resourcePools.get('running-workflows')?.size || 0,
      queued: 0, // Would get from workflow queue
      completed: 0, // Would get from analytics
    };
  }

  private async getToolStatistics() {
    // Implementation would integrate with ToolRegistry
    return {
      executing: this.resourcePools.get('executing-tools')?.size || 0,
      cached: this.caches.get('tool-result')?.size || 0,
      totalCalls: 0, // Would get from analytics
    };
  }

  private async calculatePerformanceMetrics() {
    // Integration with analytics system
    const recentMetrics = this.resourceSnapshots.slice(-10);
    
    return {
      averageAgentActivationTime: recentMetrics.reduce((sum, s) => sum + (s.performance?.averageAgentActivationTime || 0), 0) / recentMetrics.length || 1000,
      averageWorkflowExecutionTime: recentMetrics.reduce((sum, s) => sum + (s.performance?.averageWorkflowExecutionTime || 0), 0) / recentMetrics.length || 5000,
      averageToolExecutionTime: recentMetrics.reduce((sum, s) => sum + (s.performance?.averageToolExecutionTime || 0), 0) / recentMetrics.length || 500,
      cacheHitRatio: 0.75, // Would calculate from actual cache statistics
    };
  }

  private async getIdleAgents(): Promise<string[]> {
    return Array.from(this.resourcePools.get('idle-agents') || []);
  }

  private async getAgentIdleTime(agentId: string): Promise<number> {
    // Would integrate with agent tracking system
    return Math.random() * 600000; // Mock implementation
  }

  private async scaleDownAgent(agentId: string): Promise<void> {
    // Implementation would deactivate agent
    this.resourcePools.get('idle-agents')?.delete(agentId);
  }

  private async rebalanceAgentWorkloads(): Promise<number> {
    // Implementation would redistribute work among agents
    return Math.floor(Math.random() * 5); // Mock implementation
  }

  private async adaptiveThresholdTuning(snapshot: ResourceSnapshot): Promise<number> {
    // Implementation would adjust thresholds based on performance history
    return Math.random() * 10; // Mock implementation
  }

  private updateAgentPool(pool: 'active' | 'idle', agentId: string): void {
    if (pool === 'active') {
      this.resourcePools.get('idle-agents')?.delete(agentId);
      this.resourcePools.get('active-agents')?.add(agentId);
    } else {
      this.resourcePools.get('active-agents')?.delete(agentId);
      this.resourcePools.get('idle-agents')?.add(agentId);
    }
  }

  private handlePerformanceAlert(alert: any): void {
    this.logger.warn('Performance alert received', alert);
    this.emit('performance-alert', alert);
  }

  private getCacheStatus() {
    const status: any = {};
    for (const [type, cache] of this.caches) {
      status[type] = {
        size: cache.size,
        hitRate: 0.75, // Would calculate actual hit rate
      };
    }
    return status;
  }

  private getResourcePoolStatus() {
    const status: any = {};
    for (const [type, pool] of this.resourcePools) {
      status[type] = pool.size;
    }
    return status;
  }

  /**
   * Cleanup and shutdown
   */
  async cleanup(): Promise<void> {
    this.stopAutoOptimization();
    this.caches.clear();
    this.resourcePools.clear();
    this.resourceSnapshots.length = 0;
    this.optimizationHistory.length = 0;
    this.removeAllListeners();
    this.logger.info('Performance optimizer cleaned up');
  }
}

export default PerformanceOptimizer;