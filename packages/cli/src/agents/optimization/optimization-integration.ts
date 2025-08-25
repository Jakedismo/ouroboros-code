/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { Config } from '../../../core/src/config/config.js';
import { ToolRegistry } from '../../../core/src/tools/tool-registry.js';
import { AgentManager } from '../core/agent-manager.js';
import { WorkflowManager } from '../workflow/workflow-manager.js';
import { SessionManager } from '../session/session-manager.js';
import { AgentAnalyticsIntegration } from '../integration/agent-analytics-integration.js';
import { PerformanceOptimizer, PerformanceConfig, OptimizationResults } from './performance-optimizer.js';
import { ResourceManager, ResourceConstraints, ResourceAllocationStrategy, ResourceStatistics } from './resource-manager.js';
import { Logger } from '../../../core/src/utils/logger.js';

/**
 * Optimization integration configuration
 */
export interface OptimizationIntegrationConfig {
  performanceConfig?: Partial<PerformanceConfig>;
  resourceConstraints?: Partial<ResourceConstraints>;
  resourceAllocationStrategy?: ResourceAllocationStrategy;
  coordinationStrategy: 'reactive' | 'predictive' | 'hybrid';
  optimizationIntervalMs: number;
  alertThresholds: {
    memoryUsagePercent: number;
    cpuUsagePercent: number;
    resourceContentionCount: number;
    performanceDegradationPercent: number;
  };
  adaptiveLearning: {
    enabled: boolean;
    learningRate: number;
    memorySize: number;
  };
}

/**
 * System optimization status
 */
export interface SystemOptimizationStatus {
  timestamp: number;
  performanceOptimizer: {
    isRunning: boolean;
    lastOptimization: number;
    autoOptimizationEnabled: boolean;
    snapshotsCount: number;
  };
  resourceManager: {
    activeAllocations: number;
    queuedRequests: number;
    allocationStrategy: ResourceAllocationStrategy;
    utilizationEfficiency: number;
  };
  overallHealth: {
    score: number; // 0-100
    status: 'excellent' | 'good' | 'warning' | 'critical';
    bottlenecks: string[];
    recommendations: string[];
  };
  coordination: {
    strategy: 'reactive' | 'predictive' | 'hybrid';
    decisionsCount: number;
    successRate: number;
    averageResponseTime: number;
  };
}

/**
 * Optimization decision context
 */
export interface OptimizationDecision {
  decisionId: string;
  timestamp: number;
  trigger: 'performance_alert' | 'resource_contention' | 'scheduled_optimization' | 'predictive_signal';
  context: {
    performanceSnapshot?: any;
    resourceStatistics?: ResourceStatistics;
    systemLoad?: any;
    predictedTrends?: any;
  };
  actions: OptimizationAction[];
  expectedImpact: {
    performanceImprovement: number;
    resourceEfficiencyGain: number;
    riskScore: number;
  };
  executionResult?: {
    success: boolean;
    actualImpact: any;
    executionTimeMs: number;
    errors?: string[];
  };
}

/**
 * Optimization action types
 */
export interface OptimizationAction {
  actionId: string;
  type: 'scale_resources' | 'reallocate_resources' | 'optimize_performance' | 'adjust_strategy' | 'cleanup_resources';
  description: string;
  parameters: Record<string, any>;
  priority: number;
  estimatedImpact: {
    performance: number;
    resources: number;
    risk: number;
  };
}

/**
 * Comprehensive optimization integration system
 */
export class OptimizationIntegration extends EventEmitter {
  private logger: Logger;
  private config: OptimizationIntegrationConfig;
  private performanceOptimizer: PerformanceOptimizer;
  private resourceManager: ResourceManager;
  private optimizationHistory: OptimizationDecision[] = [];
  private coordinationTimer?: NodeJS.Timeout;
  private isCoordinating = false;
  private decisionCounter = 0;
  private learningData: Map<string, any[]> = new Map();

  constructor(
    private coreConfig: Config,
    private toolRegistry: ToolRegistry,
    private agentManager: AgentManager,
    private workflowManager: WorkflowManager,
    private sessionManager: SessionManager,
    private analytics: AgentAnalyticsIntegration,
    config?: Partial<OptimizationIntegrationConfig>
  ) {
    super();
    this.logger = new Logger('OptimizationIntegration');

    // Default optimization integration configuration
    this.config = {
      coordinationStrategy: 'hybrid',
      optimizationIntervalMs: 120000, // 2 minutes
      alertThresholds: {
        memoryUsagePercent: 80,
        cpuUsagePercent: 85,
        resourceContentionCount: 5,
        performanceDegradationPercent: 20,
      },
      adaptiveLearning: {
        enabled: true,
        learningRate: 0.15,
        memorySize: 500,
      },
      ...config,
    };

    // Initialize performance optimizer
    this.performanceOptimizer = new PerformanceOptimizer(
      coreConfig,
      toolRegistry,
      agentManager,
      sessionManager,
      analytics,
      this.config.performanceConfig
    );

    // Initialize resource manager
    this.resourceManager = new ResourceManager(
      coreConfig,
      toolRegistry,
      agentManager,
      workflowManager,
      sessionManager,
      this.config.resourceConstraints,
      this.config.resourceAllocationStrategy || 'adaptive'
    );
  }

  /**
   * Initialize optimization integration system
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing optimization integration...');

    // Initialize performance optimizer
    await this.performanceOptimizer.initialize();

    // Initialize resource manager
    await this.resourceManager.initialize();

    // Start coordination system
    this.startOptimizationCoordination();

    // Set up event listeners
    this.setupEventListeners();

    this.emit('optimization-integration-initialized', {
      config: this.config,
      performanceOptimizerInitialized: true,
      resourceManagerInitialized: true,
    });

    this.logger.info('Optimization integration initialized successfully');
  }

  /**
   * Get comprehensive system optimization status
   */
  async getSystemOptimizationStatus(): Promise<SystemOptimizationStatus> {
    const timestamp = Date.now();

    // Get performance optimizer status
    const performanceStatus = this.performanceOptimizer.getOptimizationStatus();

    // Get resource manager statistics
    const resourceStats = this.resourceManager.getResourceStatistics();

    // Calculate overall health score
    const overallHealth = this.calculateOverallHealth(performanceStatus, resourceStats);

    // Get coordination statistics
    const coordinationStats = this.getCoordinationStatistics();

    const status: SystemOptimizationStatus = {
      timestamp,
      performanceOptimizer: {
        isRunning: performanceStatus.isOptimizing,
        lastOptimization: performanceStatus.lastOptimization || 0,
        autoOptimizationEnabled: performanceStatus.autoOptimizationEnabled,
        snapshotsCount: performanceStatus.snapshotsCount,
      },
      resourceManager: {
        activeAllocations: resourceStats.activeAllocations,
        queuedRequests: resourceStats.contentionCount,
        allocationStrategy: this.config.resourceAllocationStrategy || 'adaptive',
        utilizationEfficiency: resourceStats.allocationEfficiency,
      },
      overallHealth,
      coordination: coordinationStats,
    };

    return status;
  }

  /**
   * Execute coordinated optimization
   */
  async executeCoordinatedOptimization(trigger: string, context?: any): Promise<OptimizationDecision> {
    if (this.isCoordinating) {
      throw new Error('Optimization coordination already in progress');
    }

    this.isCoordinating = true;
    this.logger.info('Starting coordinated optimization', { trigger });

    try {
      const decisionId = `opt_decision_${++this.decisionCounter}`;
      const timestamp = Date.now();

      // Gather optimization context
      const optimizationContext = await this.gatherOptimizationContext(context);

      // Make optimization decisions based on strategy
      const actions = await this.makeOptimizationDecisions(optimizationContext, trigger);

      // Create optimization decision record
      const decision: OptimizationDecision = {
        decisionId,
        timestamp,
        trigger: trigger as any,
        context: optimizationContext,
        actions,
        expectedImpact: this.calculateExpectedImpact(actions),
      };

      // Execute optimization actions
      const executionResult = await this.executeOptimizationActions(actions);
      decision.executionResult = executionResult;

      // Store decision for learning
      this.optimizationHistory.push(decision);
      if (this.optimizationHistory.length > 1000) {
        this.optimizationHistory.shift();
      }

      // Update adaptive learning if enabled
      if (this.config.adaptiveLearning.enabled) {
        this.updateLearningData(decision);
      }

      this.emit('coordinated-optimization-completed', decision);
      this.logger.info('Coordinated optimization completed', {
        decisionId,
        actionsCount: actions.length,
        success: executionResult.success,
      });

      return decision;
    } finally {
      this.isCoordinating = false;
    }
  }

  /**
   * Get optimization recommendations
   */
  async getOptimizationRecommendations(): Promise<string[]> {
    const recommendations: string[] = [];

    // Get performance optimizer recommendations
    const performanceStatus = this.performanceOptimizer.getOptimizationStatus();
    if (performanceStatus.snapshotsCount > 10) {
      // recommendations.push(...await this.performanceOptimizer.getRecommendations());
    }

    // Get resource manager recommendations
    const resourceRecommendations = this.resourceManager.getOptimizationRecommendations();
    recommendations.push(...resourceRecommendations);

    // Add coordination-specific recommendations
    const coordinationRecommendations = this.getCoordinationRecommendations();
    recommendations.push(...coordinationRecommendations);

    return [...new Set(recommendations)]; // Remove duplicates
  }

  /**
   * Update optimization configuration
   */
  async updateConfiguration(newConfig: Partial<OptimizationIntegrationConfig>): Promise<void> {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };

    // Update resource allocation strategy if changed
    if (newConfig.resourceAllocationStrategy && 
        newConfig.resourceAllocationStrategy !== oldConfig.resourceAllocationStrategy) {
      this.resourceManager.setAllocationStrategy(newConfig.resourceAllocationStrategy);
    }

    // Restart coordination if interval changed
    if (newConfig.optimizationIntervalMs && 
        newConfig.optimizationIntervalMs !== oldConfig.optimizationIntervalMs) {
      this.stopOptimizationCoordination();
      this.startOptimizationCoordination();
    }

    this.emit('configuration-updated', { oldConfig, newConfig: this.config });
    this.logger.info('Optimization configuration updated', { changes: newConfig });
  }

  /**
   * Gather comprehensive optimization context
   */
  private async gatherOptimizationContext(additionalContext?: any): Promise<any> {
    // Get performance snapshot
    const performanceSnapshot = await this.performanceOptimizer.takeResourceSnapshot();

    // Get resource statistics
    const resourceStatistics = this.resourceManager.getResourceStatistics();

    // Get system load information
    const systemLoad = {
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      uptime: process.uptime(),
    };

    // Calculate predictive trends if using predictive strategy
    let predictedTrends;
    if (this.config.coordinationStrategy === 'predictive' || 
        this.config.coordinationStrategy === 'hybrid') {
      predictedTrends = this.calculatePredictiveTrends();
    }

    return {
      performanceSnapshot,
      resourceStatistics,
      systemLoad,
      predictedTrends,
      timestamp: Date.now(),
      ...additionalContext,
    };
  }

  /**
   * Make optimization decisions based on strategy
   */
  private async makeOptimizationDecisions(context: any, trigger: string): Promise<OptimizationAction[]> {
    const actions: OptimizationAction[] = [];

    // Performance-based decisions
    if (context.performanceSnapshot) {
      const performanceActions = this.makePerformanceDecisions(context.performanceSnapshot);
      actions.push(...performanceActions);
    }

    // Resource-based decisions
    if (context.resourceStatistics) {
      const resourceActions = this.makeResourceDecisions(context.resourceStatistics);
      actions.push(...resourceActions);
    }

    // Predictive decisions (for predictive/hybrid strategies)
    if (context.predictedTrends && 
        (this.config.coordinationStrategy === 'predictive' || 
         this.config.coordinationStrategy === 'hybrid')) {
      const predictiveActions = this.makePredictiveDecisions(context.predictedTrends);
      actions.push(...predictiveActions);
    }

    // Sort actions by priority
    actions.sort((a, b) => b.priority - a.priority);

    return actions;
  }

  /**
   * Execute optimization actions
   */
  private async executeOptimizationActions(actions: OptimizationAction[]): Promise<any> {
    const startTime = Date.now();
    const results: any[] = [];
    const errors: string[] = [];

    for (const action of actions) {
      try {
        this.logger.debug('Executing optimization action', { action });
        const result = await this.executeAction(action);
        results.push({ actionId: action.actionId, result, success: true });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Action ${action.actionId}: ${errorMessage}`);
        results.push({ actionId: action.actionId, error: errorMessage, success: false });
      }
    }

    const executionTimeMs = Date.now() - startTime;
    const success = errors.length === 0;

    return {
      success,
      results,
      executionTimeMs,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Execute individual optimization action
   */
  private async executeAction(action: OptimizationAction): Promise<any> {
    switch (action.type) {
      case 'scale_resources':
        return await this.executeScaleResourcesAction(action);
      case 'reallocate_resources':
        return await this.executeReallocateResourcesAction(action);
      case 'optimize_performance':
        return await this.executeOptimizePerformanceAction(action);
      case 'adjust_strategy':
        return await this.executeAdjustStrategyAction(action);
      case 'cleanup_resources':
        return await this.executeCleanupResourcesAction(action);
      default:
        throw new Error(`Unknown optimization action type: ${action.type}`);
    }
  }

  /**
   * Start optimization coordination
   */
  private startOptimizationCoordination(): void {
    this.coordinationTimer = setInterval(async () => {
      try {
        // Check if optimization is needed
        const shouldOptimize = await this.shouldTriggerOptimization();
        if (shouldOptimize.trigger) {
          await this.executeCoordinatedOptimization('scheduled_optimization', shouldOptimize.context);
        }
      } catch (error) {
        this.logger.error('Optimization coordination error', { error });
      }
    }, this.config.optimizationIntervalMs);
  }

  /**
   * Stop optimization coordination
   */
  private stopOptimizationCoordination(): void {
    if (this.coordinationTimer) {
      clearInterval(this.coordinationTimer);
      this.coordinationTimer = undefined;
    }
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // Performance optimizer events
    this.performanceOptimizer.on('performance-alert', (alert) => {
      this.handlePerformanceAlert(alert);
    });

    this.performanceOptimizer.on('optimization-completed', (results: OptimizationResults) => {
      this.emit('performance-optimization-completed', results);
    });

    // Resource manager events
    this.resourceManager.on('resource-contention', (contention) => {
      this.handleResourceContention(contention);
    });

    this.resourceManager.on('resource-allocation-failed', (failure) => {
      this.handleResourceAllocationFailure(failure);
    });

    // Analytics events
    this.analytics.on('performance-degradation', (degradation) => {
      this.handlePerformanceDegradation(degradation);
    });
  }

  // Helper methods for decision making
  private makePerformanceDecisions(snapshot: any): OptimizationAction[] {
    const actions: OptimizationAction[] = [];

    if (snapshot.memory.percentage > this.config.alertThresholds.memoryUsagePercent) {
      actions.push({
        actionId: `perf_action_${Date.now()}`,
        type: 'optimize_performance',
        description: 'Optimize memory usage due to high utilization',
        parameters: { target: 'memory', threshold: snapshot.memory.percentage },
        priority: 8,
        estimatedImpact: { performance: 0.3, resources: 0.4, risk: 0.1 },
      });
    }

    return actions;
  }

  private makeResourceDecisions(stats: ResourceStatistics): OptimizationAction[] {
    const actions: OptimizationAction[] = [];

    if (stats.contentionCount > this.config.alertThresholds.resourceContentionCount) {
      actions.push({
        actionId: `resource_action_${Date.now()}`,
        type: 'reallocate_resources',
        description: 'Reallocate resources due to high contention',
        parameters: { contentionCount: stats.contentionCount },
        priority: 7,
        estimatedImpact: { performance: 0.2, resources: 0.5, risk: 0.2 },
      });
    }

    return actions;
  }

  private makePredictiveDecisions(trends: any): OptimizationAction[] {
    const actions: OptimizationAction[] = [];

    // Implementation would analyze trends and make predictive optimization decisions
    // This is a placeholder for sophisticated predictive optimization logic

    return actions;
  }

  // Helper methods for optimization logic
  private calculateOverallHealth(performanceStatus: any, resourceStats: ResourceStatistics): any {
    // Calculate health score based on multiple factors
    let score = 100;
    const bottlenecks: string[] = [];
    const recommendations: string[] = [];

    // Memory health
    if (resourceStats.resourceUtilization.memory.percentage > 90) {
      score -= 20;
      bottlenecks.push('High memory usage');
      recommendations.push('Consider reducing memory allocations or increasing memory limits');
    }

    // CPU health
    if (resourceStats.resourceUtilization.cpu.percentage > 90) {
      score -= 15;
      bottlenecks.push('High CPU usage');
      recommendations.push('Consider reducing concurrent operations');
    }

    // Resource contention
    if (resourceStats.contentionCount > 10) {
      score -= 10;
      bottlenecks.push('Resource contention');
      recommendations.push('Optimize resource allocation strategy');
    }

    // Allocation efficiency
    if (resourceStats.allocationEfficiency < 0.7) {
      score -= 8;
      bottlenecks.push('Low allocation efficiency');
      recommendations.push('Review allocation patterns and durations');
    }

    const status = score >= 90 ? 'excellent' : score >= 75 ? 'good' : score >= 60 ? 'warning' : 'critical';

    return {
      score: Math.max(0, score),
      status,
      bottlenecks,
      recommendations,
    };
  }

  private getCoordinationStatistics() {
    const recentDecisions = this.optimizationHistory.slice(-50);
    const successfulDecisions = recentDecisions.filter(d => d.executionResult?.success);
    
    return {
      strategy: this.config.coordinationStrategy,
      decisionsCount: this.optimizationHistory.length,
      successRate: recentDecisions.length > 0 ? successfulDecisions.length / recentDecisions.length : 1,
      averageResponseTime: recentDecisions.reduce((sum, d) => 
        sum + (d.executionResult?.executionTimeMs || 0), 0) / (recentDecisions.length || 1),
    };
  }

  private getCoordinationRecommendations(): string[] {
    const recommendations: string[] = [];

    const coordinationStats = this.getCoordinationStatistics();
    
    if (coordinationStats.successRate < 0.8) {
      recommendations.push('Coordination success rate is low; consider reviewing optimization strategies');
    }

    if (coordinationStats.averageResponseTime > 10000) {
      recommendations.push('Coordination response time is high; consider optimizing decision-making process');
    }

    return recommendations;
  }

  private calculateExpectedImpact(actions: OptimizationAction[]): any {
    const totalPerformance = actions.reduce((sum, action) => 
      sum + action.estimatedImpact.performance, 0);
    const totalResources = actions.reduce((sum, action) => 
      sum + action.estimatedImpact.resources, 0);
    const maxRisk = Math.max(...actions.map(action => action.estimatedImpact.risk), 0);

    return {
      performanceImprovement: totalPerformance,
      resourceEfficiencyGain: totalResources,
      riskScore: maxRisk,
    };
  }

  private calculatePredictiveTrends(): any {
    // Placeholder for predictive trend analysis
    return {
      memoryTrend: 'stable',
      cpuTrend: 'increasing',
      contentionTrend: 'decreasing',
    };
  }

  private async shouldTriggerOptimization(): Promise<{ trigger: boolean; context?: any }> {
    const resourceStats = this.resourceManager.getResourceStatistics();
    
    // Check alert thresholds
    if (resourceStats.resourceUtilization.memory.percentage > this.config.alertThresholds.memoryUsagePercent ||
        resourceStats.resourceUtilization.cpu.percentage > this.config.alertThresholds.cpuUsagePercent ||
        resourceStats.contentionCount > this.config.alertThresholds.resourceContentionCount) {
      return { 
        trigger: true, 
        context: { thresholdTriggered: true, resourceStats }
      };
    }

    return { trigger: false };
  }

  private updateLearningData(decision: OptimizationDecision): void {
    const learningKey = decision.trigger;
    if (!this.learningData.has(learningKey)) {
      this.learningData.set(learningKey, []);
    }

    const data = this.learningData.get(learningKey)!;
    data.push({
      decision,
      outcome: decision.executionResult,
      timestamp: decision.timestamp,
    });

    // Keep only recent learning data
    if (data.length > this.config.adaptiveLearning.memorySize) {
      data.shift();
    }
  }

  // Event handlers
  private async handlePerformanceAlert(alert: any): Promise<void> {
    this.logger.warn('Performance alert received', alert);
    if (!this.isCoordinating) {
      await this.executeCoordinatedOptimization('performance_alert', alert);
    }
  }

  private async handleResourceContention(contention: any): Promise<void> {
    this.logger.warn('Resource contention detected', contention);
    if (!this.isCoordinating) {
      await this.executeCoordinatedOptimization('resource_contention', contention);
    }
  }

  private async handleResourceAllocationFailure(failure: any): Promise<void> {
    this.logger.error('Resource allocation failure', failure);
    this.emit('resource-allocation-failure', failure);
  }

  private async handlePerformanceDegradation(degradation: any): Promise<void> {
    this.logger.warn('Performance degradation detected', degradation);
    if (!this.isCoordinating) {
      await this.executeCoordinatedOptimization('performance_alert', degradation);
    }
  }

  // Action execution methods
  private async executeScaleResourcesAction(action: OptimizationAction): Promise<any> {
    // Implementation would scale resources based on action parameters
    return { scaled: true, parameters: action.parameters };
  }

  private async executeReallocateResourcesAction(action: OptimizationAction): Promise<any> {
    // Implementation would reallocate resources
    return { reallocated: true, parameters: action.parameters };
  }

  private async executeOptimizePerformanceAction(action: OptimizationAction): Promise<any> {
    const result = await this.performanceOptimizer.optimizePerformance();
    return { optimized: true, result };
  }

  private async executeAdjustStrategyAction(action: OptimizationAction): Promise<any> {
    // Implementation would adjust optimization strategies
    return { adjusted: true, parameters: action.parameters };
  }

  private async executeCleanupResourcesAction(action: OptimizationAction): Promise<any> {
    // Implementation would perform resource cleanup
    return { cleaned: true, parameters: action.parameters };
  }

  /**
   * Get optimization history
   */
  getOptimizationHistory(limit?: number): OptimizationDecision[] {
    return limit ? this.optimizationHistory.slice(-limit) : [...this.optimizationHistory];
  }

  /**
   * Cleanup and shutdown
   */
  async cleanup(): Promise<void> {
    this.stopOptimizationCoordination();
    
    await this.performanceOptimizer.cleanup();
    await this.resourceManager.cleanup();
    
    this.optimizationHistory.length = 0;
    this.learningData.clear();
    this.removeAllListeners();

    this.logger.info('Optimization integration cleaned up');
  }
}

export default OptimizationIntegration;