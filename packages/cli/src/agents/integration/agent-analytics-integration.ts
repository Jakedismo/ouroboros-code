/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { 
  recordToolCallMetrics,
  recordTokenUsageMetrics,
  recordApiResponseMetrics,
  recordApiErrorMetrics,
  getMeter,
  initializeMetrics
} from '../../../core/src/telemetry/metrics.js';
import { Config } from '../../../core/src/config/config.js';
import { getAgentManager } from './agent-manager.js';
import { getSessionAgentIntegration } from './session-agent-integration.js';
import { AgentConfig, AgentPerformanceMetrics } from '../registry/agent-storage.js';
import { 
  metrics,
  Attributes,
  ValueType,
  Meter,
  Counter,
  Histogram,
  Gauge
} from '@opentelemetry/api';

/**
 * Agent-specific telemetry constants
 */
export const METRIC_AGENT_ACTIVATION_COUNT = 'ouroboros.agent.activation.count';
export const METRIC_AGENT_EXECUTION_COUNT = 'ouroboros.agent.execution.count';
export const METRIC_AGENT_EXECUTION_LATENCY = 'ouroboros.agent.execution.latency';
export const METRIC_AGENT_SUCCESS_RATE = 'ouroboros.agent.success.rate';
export const METRIC_AGENT_WORKFLOW_COUNT = 'ouroboros.agent.workflow.count';
export const METRIC_AGENT_SESSION_DURATION = 'ouroboros.agent.session.duration';
export const METRIC_AGENT_RESOURCE_EFFICIENCY = 'ouroboros.agent.resource.efficiency';
export const METRIC_AGENT_ADAPTABILITY_SCORE = 'ouroboros.agent.adaptability.score';
export const METRIC_AGENT_SWITCH_COUNT = 'ouroboros.agent.switch.count';
export const METRIC_AGENT_TOOL_USAGE = 'ouroboros.agent.tool.usage';
export const METRIC_AGENT_TOKEN_EFFICIENCY = 'ouroboros.agent.token.efficiency';

/**
 * Agent analytics events
 */
export interface AgentAnalyticsEvents {
  'metrics-recorded': (agentId: string, metricType: string, value: number, attributes: Record<string, any>) => void;
  'performance-alert': (agentId: string, metric: string, value: number, threshold: number) => void;
  'analytics-aggregated': (summary: AgentAnalyticsSummary) => void;
  'agent-benchmark-completed': (agentId: string, benchmarkResults: AgentBenchmarkResults) => void;
}

/**
 * Agent analytics summary
 */
export interface AgentAnalyticsSummary {
  timeRange: { start: Date; end: Date };
  totalAgents: number;
  activeAgents: number;
  totalActivations: number;
  totalExecutions: number;
  overallSuccessRate: number;
  averageResponseTime: number;
  topPerformingAgents: Array<{
    agentId: string;
    agentName: string;
    score: number;
    metrics: AgentPerformanceMetrics;
  }>;
  resourceEfficiency: number;
  tokenEfficiency: number;
  workflowCompletionRate: number;
  sessionInsights: {
    averageSessionDuration: number;
    averageAgentSwitches: number;
    mostUsedAgent: string;
    sessionProductivity: number;
  };
}

/**
 * Agent benchmark results
 */
export interface AgentBenchmarkResults {
  agentId: string;
  testSuite: string;
  timestamp: Date;
  overallScore: number; // 0-100
  categories: {
    accuracy: number;
    speed: number;
    resourceUsage: number;
    adaptability: number;
    toolUsage: number;
  };
  detailedMetrics: {
    responseTimeP50: number;
    responseTimeP95: number;
    tokenEfficiency: number;
    toolCallSuccess: number;
    workflowSuccess: number;
    errorRate: number;
  };
  comparisonBaseline?: {
    agentId: string;
    scoreDifference: number;
    betterCategories: string[];
    worseCategories: string[];
  };
}

/**
 * Agent performance thresholds for alerting
 */
export interface AgentPerformanceThresholds {
  successRateMin: number; // 0.0 - 1.0
  averageResponseTimeMax: number; // milliseconds
  resourceEfficiencyMin: number; // 0.0 - 1.0
  tokenEfficiencyMin: number; // tokens per successful operation
  errorRateMax: number; // 0.0 - 1.0
  workflowFailureRateMax: number; // 0.0 - 1.0
}

/**
 * Agent analytics integration system
 * 
 * Connects agent performance metrics with the core Ouroboros telemetry system,
 * providing comprehensive analytics, performance monitoring, and optimization insights.
 */
export class AgentAnalyticsIntegration extends EventEmitter {
  private config: Config;
  private agentManager = getAgentManager();
  private sessionIntegration = getSessionAgentIntegration();
  
  // OpenTelemetry metrics
  private meter: Meter | undefined;
  private agentActivationCounter: Counter | undefined;
  private agentExecutionCounter: Counter | undefined;
  private agentExecutionLatencyHistogram: Histogram | undefined;
  private agentSuccessRateGauge: Gauge | undefined;
  private agentWorkflowCounter: Counter | undefined;
  private agentSessionDurationHistogram: Histogram | undefined;
  private agentResourceEfficiencyGauge: Gauge | undefined;
  private agentAdaptabilityGauge: Gauge | undefined;
  private agentSwitchCounter: Counter | undefined;
  private agentToolUsageCounter: Counter | undefined;
  private agentTokenEfficiencyGauge: Gauge | undefined;

  // Analytics data
  private metricsBuffer = new Map<string, AgentPerformanceMetrics>();
  private benchmarkHistory = new Map<string, AgentBenchmarkResults[]>();
  private performanceAlerts = new Map<string, { timestamp: Date; metric: string; value: number }[]>();
  
  // Configuration
  private performanceThresholds: AgentPerformanceThresholds = {
    successRateMin: 0.8,
    averageResponseTimeMax: 5000, // 5 seconds
    resourceEfficiencyMin: 0.7,
    tokenEfficiencyMin: 0.5,
    errorRateMax: 0.2,
    workflowFailureRateMax: 0.15,
  };

  private isInitialized = false;
  private analyticsInterval: NodeJS.Timeout | null = null;

  constructor(config: Config, thresholds?: Partial<AgentPerformanceThresholds>) {
    super();
    this.config = config;
    if (thresholds) {
      this.performanceThresholds = { ...this.performanceThresholds, ...thresholds };
    }
  }

  /**
   * Initialize agent analytics integration
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    console.log('📊 Initializing agent analytics integration...');
    
    // Initialize core telemetry metrics
    initializeMetrics(this.config);
    
    // Setup OpenTelemetry meters and metrics
    this.setupMetrics();
    
    // Setup integration listeners
    this.setupIntegrationListeners();
    
    // Start periodic analytics aggregation
    this.startAnalyticsAggregation();

    this.isInitialized = true;
    console.log('✅ Agent analytics integration initialized');
  }

  /**
   * Record agent activation metric
   */
  recordAgentActivation(
    agentId: string,
    agentName: string,
    agentCategory: string,
    reason: string = 'user-requested'
  ): void {
    if (!this.agentActivationCounter) return;

    const attributes: Attributes = {
      'agent.id': agentId,
      'agent.name': agentName,
      'agent.category': agentCategory,
      'activation.reason': reason,
      'session.id': this.config.getSessionId(),
    };

    this.agentActivationCounter.add(1, attributes);
    this.emit('metrics-recorded', agentId, 'activation', 1, attributes);

    console.debug(`📊 Recorded agent activation: ${agentName} (${reason})`);
  }

  /**
   * Record agent execution metrics
   */
  recordAgentExecution(
    agentId: string,
    agentName: string,
    executionType: 'workflow' | 'command' | 'conversation',
    duration: number,
    success: boolean,
    tokenCount?: number,
    toolCount?: number,
    metadata?: Record<string, any>
  ): void {
    if (!this.agentExecutionCounter || !this.agentExecutionLatencyHistogram) return;

    const attributes: Attributes = {
      'agent.id': agentId,
      'agent.name': agentName,
      'execution.type': executionType,
      'execution.success': success,
      'session.id': this.config.getSessionId(),
      ...metadata,
    };

    // Record execution count
    this.agentExecutionCounter.add(1, attributes);
    
    // Record latency
    this.agentExecutionLatencyHistogram.record(duration, {
      'agent.id': agentId,
      'agent.name': agentName,
      'execution.type': executionType,
    });

    // Record token usage if provided
    if (tokenCount && this.agentTokenEfficiencyGauge) {
      const efficiency = success ? tokenCount / Math.max(duration, 1) : 0;
      this.agentTokenEfficiencyGauge.record(efficiency, {
        'agent.id': agentId,
        'agent.name': agentName,
      });
    }

    // Record tool usage if provided
    if (toolCount && this.agentToolUsageCounter) {
      this.agentToolUsageCounter.add(toolCount, {
        'agent.id': agentId,
        'agent.name': agentName,
        'execution.type': executionType,
      });
    }

    this.emit('metrics-recorded', agentId, 'execution', 1, attributes);
    console.debug(`📊 Recorded agent execution: ${agentName} (${duration}ms, ${success ? 'success' : 'failure'})`);
  }

  /**
   * Record workflow completion metrics
   */
  recordWorkflowCompletion(
    agentId: string,
    agentName: string,
    workflowId: string,
    success: boolean,
    stepCount: number,
    duration: number
  ): void {
    if (!this.agentWorkflowCounter) return;

    const attributes: Attributes = {
      'agent.id': agentId,
      'agent.name': agentName,
      'workflow.id': workflowId,
      'workflow.success': success,
      'workflow.steps': stepCount,
      'session.id': this.config.getSessionId(),
    };

    this.agentWorkflowCounter.add(1, attributes);
    this.emit('metrics-recorded', agentId, 'workflow', 1, attributes);

    console.debug(`📊 Recorded workflow completion: ${agentName} - ${workflowId} (${success ? 'success' : 'failure'})`);
  }

  /**
   * Update agent performance metrics
   */
  updateAgentPerformanceMetrics(agentId: string, agentName: string, metrics: AgentPerformanceMetrics): void {
    // Store metrics in buffer
    this.metricsBuffer.set(agentId, metrics);

    // Update OpenTelemetry gauges
    if (this.agentSuccessRateGauge) {
      this.agentSuccessRateGauge.record(metrics.successRate, {
        'agent.id': agentId,
        'agent.name': agentName,
      });
    }

    if (this.agentResourceEfficiencyGauge) {
      this.agentResourceEfficiencyGauge.record(metrics.resourceEfficiency, {
        'agent.id': agentId,
        'agent.name': agentName,
      });
    }

    if (this.agentAdaptabilityGauge) {
      this.agentAdaptabilityGauge.record(metrics.adaptabilityScore, {
        'agent.id': agentId,
        'agent.name': agentName,
      });
    }

    // Check performance thresholds
    this.checkPerformanceThresholds(agentId, agentName, metrics);

    this.emit('metrics-recorded', agentId, 'performance-update', 1, { metrics });
    console.debug(`📊 Updated performance metrics for agent: ${agentName}`);
  }

  /**
   * Record agent switch event
   */
  recordAgentSwitch(
    fromAgentId: string,
    toAgentId: string,
    reason: string,
    sessionDuration: number
  ): void {
    if (!this.agentSwitchCounter || !this.agentSessionDurationHistogram) return;

    const attributes: Attributes = {
      'from_agent.id': fromAgentId,
      'to_agent.id': toAgentId,
      'switch.reason': reason,
      'session.id': this.config.getSessionId(),
    };

    this.agentSwitchCounter.add(1, attributes);
    this.agentSessionDurationHistogram.record(sessionDuration, {
      'agent.id': fromAgentId,
    });

    this.emit('metrics-recorded', toAgentId, 'switch', 1, attributes);
    console.debug(`📊 Recorded agent switch: ${fromAgentId} → ${toAgentId} (${reason})`);
  }

  /**
   * Run agent performance benchmark
   */
  async runAgentBenchmark(
    agentId: string,
    testSuite: string = 'standard',
    comparisonAgentId?: string
  ): Promise<AgentBenchmarkResults> {
    console.log(`🔬 Running benchmark for agent: ${agentId}`);
    
    const agent = await this.agentManager.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found for benchmarking`);
    }

    // Get current performance metrics
    const metrics = this.metricsBuffer.get(agentId) || this.getDefaultMetrics();

    // Calculate benchmark scores (simplified implementation)
    const benchmarkResults: AgentBenchmarkResults = {
      agentId,
      testSuite,
      timestamp: new Date(),
      overallScore: this.calculateOverallScore(metrics),
      categories: {
        accuracy: metrics.successRate * 100,
        speed: this.calculateSpeedScore(metrics.averageResponseTime),
        resourceUsage: metrics.resourceEfficiency * 100,
        adaptability: metrics.adaptabilityScore * 100,
        toolUsage: this.calculateToolUsageScore(metrics),
      },
      detailedMetrics: {
        responseTimeP50: metrics.averageResponseTime * 0.8,
        responseTimeP95: metrics.averageResponseTime * 1.5,
        tokenEfficiency: metrics.totalTokensUsed / Math.max(metrics.totalExecutions, 1),
        toolCallSuccess: metrics.totalToolsCalled / Math.max(metrics.totalExecutions, 1),
        workflowSuccess: metrics.workflowsCompleted / Math.max(metrics.workflowsCompleted + metrics.workflowsFailed, 1),
        errorRate: 1 - metrics.successRate,
      },
    };

    // Add comparison if requested
    if (comparisonAgentId) {
      benchmarkResults.comparisonBaseline = await this.generateBenchmarkComparison(
        benchmarkResults,
        comparisonAgentId
      );
    }

    // Store benchmark results
    if (!this.benchmarkHistory.has(agentId)) {
      this.benchmarkHistory.set(agentId, []);
    }
    this.benchmarkHistory.get(agentId)!.push(benchmarkResults);

    // Keep only last 10 benchmark results
    const history = this.benchmarkHistory.get(agentId)!;
    if (history.length > 10) {
      this.benchmarkHistory.set(agentId, history.slice(-10));
    }

    this.emit('agent-benchmark-completed', agentId, benchmarkResults);
    console.log(`✅ Benchmark completed for agent: ${agent.name} (Score: ${benchmarkResults.overallScore})`);

    return benchmarkResults;
  }

  /**
   * Generate analytics summary
   */
  async generateAnalyticsSummary(timeRangeHours: number = 24): Promise<AgentAnalyticsSummary> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - (timeRangeHours * 60 * 60 * 1000));

    console.debug(`📊 Generating analytics summary for last ${timeRangeHours} hours`);

    // Get session statistics
    const sessionStats = this.sessionIntegration.getAgentUsageStatistics();
    
    // Calculate aggregate metrics
    const allMetrics = Array.from(this.metricsBuffer.values());
    const totalExecutions = allMetrics.reduce((sum, m) => sum + m.totalExecutions, 0);
    const overallSuccessRate = allMetrics.length > 0 
      ? allMetrics.reduce((sum, m) => sum + m.successRate, 0) / allMetrics.length
      : 0;
    const averageResponseTime = allMetrics.length > 0
      ? allMetrics.reduce((sum, m) => sum + m.averageResponseTime, 0) / allMetrics.length
      : 0;

    // Find top performing agents
    const topPerformingAgents = allMetrics
      .map((metrics, index) => {
        const agentId = Array.from(this.metricsBuffer.keys())[index];
        return {
          agentId,
          agentName: `Agent_${agentId.substring(0, 8)}`, // Simplified
          score: metrics.successRate * metrics.resourceEfficiency * metrics.adaptabilityScore,
          metrics,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const summary: AgentAnalyticsSummary = {
      timeRange: { start: startTime, end: endTime },
      totalAgents: this.metricsBuffer.size,
      activeAgents: sessionStats.totalAgents,
      totalActivations: sessionStats.totalAgents, // Simplified
      totalExecutions,
      overallSuccessRate,
      averageResponseTime,
      topPerformingAgents,
      resourceEfficiency: allMetrics.length > 0
        ? allMetrics.reduce((sum, m) => sum + m.resourceEfficiency, 0) / allMetrics.length
        : 0,
      tokenEfficiency: allMetrics.length > 0
        ? allMetrics.reduce((sum, m) => sum + (m.totalTokensUsed / Math.max(m.totalExecutions, 1)), 0) / allMetrics.length
        : 0,
      workflowCompletionRate: allMetrics.length > 0
        ? allMetrics.reduce((sum, m) => sum + (m.workflowsCompleted / Math.max(m.workflowsCompleted + m.workflowsFailed, 1)), 0) / allMetrics.length
        : 0,
      sessionInsights: {
        averageSessionDuration: sessionStats.averageSessionTime,
        averageAgentSwitches: sessionStats.agentSwitches,
        mostUsedAgent: sessionStats.dominantAgent || 'none',
        sessionProductivity: overallSuccessRate * 0.7 + (sessionStats.averageSessionTime / 3600000) * 0.3, // hours
      },
    };

    this.emit('analytics-aggregated', summary);
    return summary;
  }

  /**
   * Get agent benchmark history
   */
  getBenchmarkHistory(agentId: string): AgentBenchmarkResults[] {
    return this.benchmarkHistory.get(agentId) || [];
  }

  /**
   * Get performance alerts for agent
   */
  getPerformanceAlerts(agentId: string): Array<{ timestamp: Date; metric: string; value: number }> {
    return this.performanceAlerts.get(agentId) || [];
  }

  /**
   * Update performance thresholds
   */
  updatePerformanceThresholds(thresholds: Partial<AgentPerformanceThresholds>): void {
    this.performanceThresholds = { ...this.performanceThresholds, ...thresholds };
    console.debug('📊 Updated agent performance thresholds');
  }

  /**
   * Clean up analytics integration
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up agent analytics integration...');
    
    if (this.analyticsInterval) {
      clearInterval(this.analyticsInterval);
      this.analyticsInterval = null;
    }

    this.metricsBuffer.clear();
    this.benchmarkHistory.clear();
    this.performanceAlerts.clear();
    
    console.log('✅ Agent analytics integration cleanup completed');
  }

  // Private implementation methods

  /**
   * Setup OpenTelemetry metrics
   */
  private setupMetrics(): void {
    this.meter = getMeter();
    if (!this.meter) {
      console.warn('⚠️  OpenTelemetry meter not available - agent metrics will not be recorded');
      return;
    }

    // Create counters
    this.agentActivationCounter = this.meter.createCounter(METRIC_AGENT_ACTIVATION_COUNT, {
      description: 'Count of agent activations',
      valueType: ValueType.INT,
    });

    this.agentExecutionCounter = this.meter.createCounter(METRIC_AGENT_EXECUTION_COUNT, {
      description: 'Count of agent executions',
      valueType: ValueType.INT,
    });

    this.agentWorkflowCounter = this.meter.createCounter(METRIC_AGENT_WORKFLOW_COUNT, {
      description: 'Count of agent workflow executions',
      valueType: ValueType.INT,
    });

    this.agentSwitchCounter = this.meter.createCounter(METRIC_AGENT_SWITCH_COUNT, {
      description: 'Count of agent switches',
      valueType: ValueType.INT,
    });

    this.agentToolUsageCounter = this.meter.createCounter(METRIC_AGENT_TOOL_USAGE, {
      description: 'Count of tool usage by agents',
      valueType: ValueType.INT,
    });

    // Create histograms
    this.agentExecutionLatencyHistogram = this.meter.createHistogram(METRIC_AGENT_EXECUTION_LATENCY, {
      description: 'Agent execution latency in milliseconds',
      unit: 'ms',
      valueType: ValueType.DOUBLE,
    });

    this.agentSessionDurationHistogram = this.meter.createHistogram(METRIC_AGENT_SESSION_DURATION, {
      description: 'Agent session duration in milliseconds',
      unit: 'ms',
      valueType: ValueType.DOUBLE,
    });

    // Create gauges
    this.agentSuccessRateGauge = this.meter.createGauge(METRIC_AGENT_SUCCESS_RATE, {
      description: 'Agent success rate (0.0 to 1.0)',
      valueType: ValueType.DOUBLE,
    });

    this.agentResourceEfficiencyGauge = this.meter.createGauge(METRIC_AGENT_RESOURCE_EFFICIENCY, {
      description: 'Agent resource efficiency score (0.0 to 1.0)',
      valueType: ValueType.DOUBLE,
    });

    this.agentAdaptabilityGauge = this.meter.createGauge(METRIC_AGENT_ADAPTABILITY_SCORE, {
      description: 'Agent adaptability score (0.0 to 1.0)',
      valueType: ValueType.DOUBLE,
    });

    this.agentTokenEfficiencyGauge = this.meter.createGauge(METRIC_AGENT_TOKEN_EFFICIENCY, {
      description: 'Agent token efficiency score',
      valueType: ValueType.DOUBLE,
    });

    console.debug('📊 Agent analytics OpenTelemetry metrics setup completed');
  }

  /**
   * Setup integration event listeners
   */
  private setupIntegrationListeners(): void {
    // Listen to session-agent integration events
    this.sessionIntegration.on('agent-activated-in-session', (sessionId, agentId, agentConfig) => {
      this.recordAgentActivation(agentId, agentConfig.name, agentConfig.category, 'session-activation');
    });

    this.sessionIntegration.on('agent-performance-updated', (sessionId, agentId, metrics) => {
      // Assuming we can get the agent name from the agent ID
      this.updateAgentPerformanceMetrics(agentId, `Agent_${agentId.substring(0, 8)}`, metrics);
    });

    // Listen to agent manager events
    this.agentManager.onAgentActivation(async (event, agent, error) => {
      if (event === 'after-activation' && agent) {
        this.recordAgentActivation(agent.id, agent.name, agent.category, 'direct-activation');
      }
    });
  }

  /**
   * Start periodic analytics aggregation
   */
  private startAnalyticsAggregation(): void {
    // Run analytics aggregation every 15 minutes
    this.analyticsInterval = setInterval(async () => {
      try {
        const summary = await this.generateAnalyticsSummary();
        console.debug(`📊 Analytics summary: ${summary.totalExecutions} executions, ${(summary.overallSuccessRate * 100).toFixed(1)}% success rate`);
      } catch (error) {
        console.error('❌ Error during analytics aggregation:', error);
      }
    }, 15 * 60 * 1000); // 15 minutes
  }

  /**
   * Check performance thresholds and emit alerts
   */
  private checkPerformanceThresholds(agentId: string, agentName: string, metrics: AgentPerformanceMetrics): void {
    const alerts: Array<{ metric: string; value: number; threshold: number }> = [];

    if (metrics.successRate < this.performanceThresholds.successRateMin) {
      alerts.push({ metric: 'success_rate', value: metrics.successRate, threshold: this.performanceThresholds.successRateMin });
    }

    if (metrics.averageResponseTime > this.performanceThresholds.averageResponseTimeMax) {
      alerts.push({ metric: 'response_time', value: metrics.averageResponseTime, threshold: this.performanceThresholds.averageResponseTimeMax });
    }

    if (metrics.resourceEfficiency < this.performanceThresholds.resourceEfficiencyMin) {
      alerts.push({ metric: 'resource_efficiency', value: metrics.resourceEfficiency, threshold: this.performanceThresholds.resourceEfficiencyMin });
    }

    const errorRate = 1 - metrics.successRate;
    if (errorRate > this.performanceThresholds.errorRateMax) {
      alerts.push({ metric: 'error_rate', value: errorRate, threshold: this.performanceThresholds.errorRateMax });
    }

    // Record alerts
    for (const alert of alerts) {
      if (!this.performanceAlerts.has(agentId)) {
        this.performanceAlerts.set(agentId, []);
      }
      
      const agentAlerts = this.performanceAlerts.get(agentId)!;
      agentAlerts.push({ timestamp: new Date(), metric: alert.metric, value: alert.value });
      
      // Keep only last 20 alerts per agent
      if (agentAlerts.length > 20) {
        this.performanceAlerts.set(agentId, agentAlerts.slice(-20));
      }

      this.emit('performance-alert', agentId, alert.metric, alert.value, alert.threshold);
      console.warn(`⚠️  Performance alert for agent ${agentName}: ${alert.metric} = ${alert.value} (threshold: ${alert.threshold})`);
    }
  }

  /**
   * Calculate overall benchmark score
   */
  private calculateOverallScore(metrics: AgentPerformanceMetrics): number {
    return Math.round(
      (metrics.successRate * 40) + // 40% weight on success rate
      (metrics.resourceEfficiency * 30) + // 30% weight on resource efficiency
      (metrics.adaptabilityScore * 20) + // 20% weight on adaptability
      (this.calculateSpeedScore(metrics.averageResponseTime) / 100 * 10) // 10% weight on speed
    );
  }

  /**
   * Calculate speed score (0-100)
   */
  private calculateSpeedScore(averageResponseTime: number): number {
    // Score decreases as response time increases
    // Perfect score (100) for <= 1000ms, 0 score for >= 10000ms
    const maxTime = 10000; // 10 seconds
    const minTime = 1000;  // 1 second
    
    if (averageResponseTime <= minTime) return 100;
    if (averageResponseTime >= maxTime) return 0;
    
    return Math.round(100 * (1 - (averageResponseTime - minTime) / (maxTime - minTime)));
  }

  /**
   * Calculate tool usage score
   */
  private calculateToolUsageScore(metrics: AgentPerformanceMetrics): number {
    if (metrics.totalExecutions === 0) return 0;
    
    const toolsPerExecution = metrics.totalToolsCalled / metrics.totalExecutions;
    // Score based on efficient tool usage (1-3 tools per execution is optimal)
    if (toolsPerExecution >= 1 && toolsPerExecution <= 3) return 100;
    if (toolsPerExecution < 1) return toolsPerExecution * 100;
    return Math.max(0, 100 - ((toolsPerExecution - 3) * 20));
  }

  /**
   * Generate benchmark comparison
   */
  private async generateBenchmarkComparison(
    results: AgentBenchmarkResults,
    comparisonAgentId: string
  ): Promise<AgentBenchmarkResults['comparisonBaseline']> {
    const comparisonHistory = this.benchmarkHistory.get(comparisonAgentId);
    if (!comparisonHistory || comparisonHistory.length === 0) {
      return undefined;
    }

    const latestComparison = comparisonHistory[comparisonHistory.length - 1];
    const scoreDifference = results.overallScore - latestComparison.overallScore;

    const betterCategories: string[] = [];
    const worseCategories: string[] = [];

    for (const [category, score] of Object.entries(results.categories)) {
      const comparisonScore = latestComparison.categories[category as keyof typeof latestComparison.categories];
      if (score > comparisonScore) {
        betterCategories.push(category);
      } else if (score < comparisonScore) {
        worseCategories.push(category);
      }
    }

    return {
      agentId: comparisonAgentId,
      scoreDifference,
      betterCategories,
      worseCategories,
    };
  }

  /**
   * Get default metrics for new agents
   */
  private getDefaultMetrics(): AgentPerformanceMetrics {
    return {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      successRate: 1.0,
      averageResponseTime: 1000,
      totalTokensUsed: 0,
      totalToolsCalled: 0,
      workflowsCompleted: 0,
      workflowsFailed: 0,
      resourceEfficiency: 1.0,
      adaptabilityScore: 1.0,
    };
  }
}

/**
 * Global agent analytics integration instance
 */
let globalAgentAnalyticsIntegration: AgentAnalyticsIntegration | null = null;

/**
 * Get or create the global agent analytics integration instance
 */
export function getAgentAnalyticsIntegration(): AgentAnalyticsIntegration {
  if (!globalAgentAnalyticsIntegration) {
    throw new Error('AgentAnalyticsIntegration must be initialized first');
  }
  return globalAgentAnalyticsIntegration;
}

/**
 * Initialize the global agent analytics integration
 */
export async function initializeAgentAnalyticsIntegration(
  config: Config,
  thresholds?: Partial<AgentPerformanceThresholds>
): Promise<AgentAnalyticsIntegration> {
  if (globalAgentAnalyticsIntegration) {
    await globalAgentAnalyticsIntegration.cleanup();
  }
  
  globalAgentAnalyticsIntegration = new AgentAnalyticsIntegration(config, thresholds);
  await globalAgentAnalyticsIntegration.initialize();
  console.log('📊 Global agent analytics integration initialized');
  
  return globalAgentAnalyticsIntegration;
}