/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { getWorkflowStateManager, WorkflowResults, WorkflowAnalytics, PersistedWorkflowState } from './workflow-state-manager.js';
import { WorkflowStatus } from '../monitoring/workflow-monitor.js';

/**
 * Analysis insight types
 */
export enum InsightType {
  PERFORMANCE = 'performance',
  RELIABILITY = 'reliability',
  EFFICIENCY = 'efficiency',
  ERROR_PATTERN = 'error_pattern',
  OPTIMIZATION = 'optimization',
  TREND = 'trend'
}

/**
 * Analysis insight
 */
export interface WorkflowInsight {
  id: string;
  type: InsightType;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  data: Record<string, any>;
  recommendations: string[];
  affectedWorkflows: string[];
  confidence: number; // 0-1
  timestamp: Date;
}

/**
 * Comparative analysis result
 */
export interface WorkflowComparison {
  baselineWorkflow: string;
  comparedWorkflows: string[];
  metrics: {
    performance: {
      executionTimeDifference: number; // percentage
      throughputDifference: number;
      efficiencyDifference: number;
    };
    reliability: {
      successRateDifference: number;
      errorRateDifference: number;
    };
  };
  insights: WorkflowInsight[];
  recommendation: string;
}

/**
 * Trend analysis result
 */
export interface TrendAnalysis {
  period: { from: Date; to: Date };
  workflowCount: number;
  trends: {
    executionTime: {
      direction: 'improving' | 'degrading' | 'stable';
      changeRate: number; // percentage per time unit
      significance: number; // 0-1
    };
    successRate: {
      direction: 'improving' | 'degrading' | 'stable';
      changeRate: number;
      significance: number;
    };
    throughput: {
      direction: 'improving' | 'degrading' | 'stable';
      changeRate: number;
      significance: number;
    };
  };
  predictions: {
    nextPeriodPerformance: number;
    recommendedOptimizations: string[];
  };
}

/**
 * Performance bottleneck identification
 */
export interface PerformanceBottleneck {
  stepId: string;
  stepName: string;
  avgExecutionTime: number;
  impact: number; // percentage of total workflow time
  frequency: number; // how often this step is a bottleneck
  recommendations: string[];
}

/**
 * Workflow results analyzer events
 */
export interface WorkflowResultsAnalyzerEvents {
  'insight-discovered': (insight: WorkflowInsight) => void;
  'analysis-completed': (workflowId: string, insights: WorkflowInsight[]) => void;
  'trend-detected': (trend: TrendAnalysis) => void;
  'bottleneck-identified': (bottleneck: PerformanceBottleneck) => void;
}

/**
 * Comprehensive workflow results analysis system
 */
export class WorkflowResultsAnalyzer extends EventEmitter {
  private stateManager = getWorkflowStateManager();
  private analysisHistory = new Map<string, WorkflowInsight[]>();
  private trendCache = new Map<string, TrendAnalysis>();

  constructor() {
    super();
    this.setupStateManagerListeners();
  }

  /**
   * Analyze workflow results and generate insights
   */
  async analyzeWorkflowResults(workflowId: string): Promise<WorkflowInsight[]> {
    const results = this.stateManager.getWorkflowResults(workflowId);
    const analytics = this.stateManager.getWorkflowAnalytics(workflowId);
    
    if (!results || !analytics) {
      console.warn(`⚠️  No results or analytics found for workflow ${workflowId}`);
      return [];
    }

    const insights: WorkflowInsight[] = [];

    // Performance analysis
    insights.push(...this.analyzePerformance(workflowId, results, analytics));
    
    // Reliability analysis
    insights.push(...this.analyzeReliability(workflowId, results, analytics));
    
    // Efficiency analysis
    insights.push(...this.analyzeEfficiency(workflowId, results, analytics));
    
    // Error pattern analysis
    insights.push(...this.analyzeErrorPatterns(workflowId, results));
    
    // Optimization recommendations
    insights.push(...this.generateOptimizationInsights(workflowId, results, analytics));

    // Cache insights
    this.analysisHistory.set(workflowId, insights);
    
    this.emit('analysis-completed', workflowId, insights);
    return insights;
  }

  /**
   * Compare workflows for performance analysis
   */
  async compareWorkflows(baselineWorkflowId: string, compareWorkflowIds: string[]): Promise<WorkflowComparison> {
    const baselineResults = this.stateManager.getWorkflowResults(baselineWorkflowId);
    const baselineAnalytics = this.stateManager.getWorkflowAnalytics(baselineWorkflowId);
    
    if (!baselineResults || !baselineAnalytics) {
      throw new Error(`Baseline workflow ${baselineWorkflowId} not found or incomplete`);
    }

    const comparisons = await Promise.all(
      compareWorkflowIds.map(async (workflowId) => {
        const results = this.stateManager.getWorkflowResults(workflowId);
        const analytics = this.stateManager.getWorkflowAnalytics(workflowId);
        
        if (!results || !analytics) {
          console.warn(`⚠️  Skipping comparison for workflow ${workflowId} - incomplete data`);
          return null;
        }

        return { workflowId, results, analytics };
      })
    );

    const validComparisons = comparisons.filter(c => c !== null);
    
    const comparison: WorkflowComparison = {
      baselineWorkflow: baselineWorkflowId,
      comparedWorkflows: validComparisons.map(c => c!.workflowId),
      metrics: {
        performance: {
          executionTimeDifference: this.calculateAverageDifference(
            baselineResults.executionSummary.totalDuration,
            validComparisons.map(c => c!.results.executionSummary.totalDuration)
          ),
          throughputDifference: this.calculateAverageDifference(
            baselineAnalytics.performance.throughput,
            validComparisons.map(c => c!.analytics.performance.throughput)
          ),
          efficiencyDifference: this.calculateAverageDifference(
            baselineAnalytics.performance.efficiency,
            validComparisons.map(c => c!.analytics.performance.efficiency)
          )
        },
        reliability: {
          successRateDifference: this.calculateAverageDifference(
            baselineAnalytics.reliability.overallSuccessRate,
            validComparisons.map(c => c!.analytics.reliability.overallSuccessRate)
          ),
          errorRateDifference: this.calculateAverageDifference(
            baselineResults.errorAnalysis.errorCount / baselineResults.executionSummary.stepsExecuted,
            validComparisons.map(c => c!.results.errorAnalysis.errorCount / c!.results.executionSummary.stepsExecuted)
          )
        }
      },
      insights: this.generateComparisonInsights(baselineWorkflowId, validComparisons),
      recommendation: this.generateComparisonRecommendation(baselineWorkflowId, validComparisons)
    };

    return comparison;
  }

  /**
   * Analyze trends across multiple workflows
   */
  async analyzeTrends(timeRange: { from: Date; to: Date }): Promise<TrendAnalysis> {
    const workflows = await this.stateManager.searchWorkflows({ timeRange });
    
    if (workflows.length < 2) {
      throw new Error('Insufficient data for trend analysis (minimum 2 workflows required)');
    }

    const executionTimes = workflows.map(w => w.state.totalExecutionTime);
    const successRates = workflows.map(w => w.analytics.reliability.overallSuccessRate);
    const throughputs = workflows.map(w => w.analytics.performance.throughput);

    const analysis: TrendAnalysis = {
      period: timeRange,
      workflowCount: workflows.length,
      trends: {
        executionTime: this.analyzeTrendDirection(executionTimes, 'lower_is_better'),
        successRate: this.analyzeTrendDirection(successRates, 'higher_is_better'),
        throughput: this.analyzeTrendDirection(throughputs, 'higher_is_better')
      },
      predictions: {
        nextPeriodPerformance: this.predictNextPeriodPerformance(workflows),
        recommendedOptimizations: this.generateTrendBasedRecommendations(workflows)
      }
    };

    const cacheKey = `${timeRange.from.getTime()}-${timeRange.to.getTime()}`;
    this.trendCache.set(cacheKey, analysis);
    
    this.emit('trend-detected', analysis);
    return analysis;
  }

  /**
   * Identify performance bottlenecks across workflows
   */
  async identifyBottlenecks(workflowIds?: string[]): Promise<PerformanceBottleneck[]> {
    let workflows: PersistedWorkflowState[];
    
    if (workflowIds) {
      workflows = [];
      for (const workflowId of workflowIds) {
        const summary = this.stateManager.getWorkflowStateSummary(workflowId);
        if (summary) {
          // Would need to load full state - simplified here
          const mockState = { 
            workflowId,
            state: { 
              definition: { steps: [] },
              totalExecutionTime: 0
            },
            results: { stepResults: new Map() },
            analytics: { performance: {} },
            checkpoints: [],
            metadata: {
              createdAt: new Date(),
              lastUpdated: new Date(),
              persistedAt: new Date(),
              version: '1.0.0'
            }
          } as any as PersistedWorkflowState;
          workflows.push(mockState);
        }
      }
    } else {
      workflows = await this.stateManager.searchWorkflows({});
    }

    const stepPerformanceMap = new Map<string, {
      executions: number;
      totalTime: number;
      failures: number;
      bottleneckFrequency: number;
    }>();

    // Analyze step performance across all workflows
    workflows.forEach(workflow => {
      const stepResults = workflow.results.stepResults;
      const totalWorkflowTime = workflow.state.totalExecutionTime;
      
      for (const [stepId, result] of stepResults) {
        if (!stepPerformanceMap.has(stepId)) {
          stepPerformanceMap.set(stepId, {
            executions: 0,
            totalTime: 0,
            failures: 0,
            bottleneckFrequency: 0
          });
        }
        
        const stepData = stepPerformanceMap.get(stepId)!;
        stepData.executions++;
        stepData.totalTime += result.executionTime;
        
        if (result.error) {
          stepData.failures++;
        }
        
        // Check if this step is a bottleneck (takes >20% of total workflow time)
        const stepImpact = (result.executionTime / totalWorkflowTime) * 100;
        if (stepImpact > 20) {
          stepData.bottleneckFrequency++;
        }
      }
    });

    // Generate bottleneck analysis
    const bottlenecks: PerformanceBottleneck[] = [];
    
    for (const [stepId, data] of stepPerformanceMap) {
      const avgExecutionTime = data.totalTime / data.executions;
      const bottleneckFrequency = data.bottleneckFrequency / data.executions;
      
      // Consider it a bottleneck if it's frequently slow or has high impact
      if (bottleneckFrequency > 0.3 || avgExecutionTime > 30000) { // 30 seconds threshold
        const bottleneck: PerformanceBottleneck = {
          stepId,
          stepName: stepId, // Could be enhanced to get actual step names
          avgExecutionTime,
          impact: bottleneckFrequency * 100,
          frequency: bottleneckFrequency,
          recommendations: this.generateBottleneckRecommendations(stepId, data)
        };
        
        bottlenecks.push(bottleneck);
        this.emit('bottleneck-identified', bottleneck);
      }
    }

    return bottlenecks.sort((a, b) => b.impact - a.impact);
  }

  /**
   * Generate comprehensive analysis report
   */
  async generateAnalysisReport(workflowIds?: string[]): Promise<string> {
    const targetWorkflows = workflowIds || 
      this.stateManager.getAllWorkflowSummaries().map(s => s.workflowId);

    let report = `📊 COMPREHENSIVE WORKFLOW ANALYSIS REPORT\n`;
    report += `═══════════════════════════════════════════════════════════════════════════════\n\n`;

    // Overall statistics
    const allSummaries = this.stateManager.getAllWorkflowSummaries();
    const completedWorkflows = allSummaries.filter(w => w.status === WorkflowStatus.COMPLETED);
    const failedWorkflows = allSummaries.filter(w => w.status === WorkflowStatus.FAILED);
    
    report += `📈 OVERVIEW:\n`;
    report += `• Total Workflows Analyzed: ${allSummaries.length}\n`;
    report += `• Completed Successfully: ${completedWorkflows.length}\n`;
    report += `• Failed: ${failedWorkflows.length}\n`;
    report += `• Overall Success Rate: ${((completedWorkflows.length / allSummaries.length) * 100).toFixed(1)}%\n\n`;

    // Performance insights
    const performanceInsights = new Map<InsightType, WorkflowInsight[]>();
    for (const workflowId of targetWorkflows) {
      const insights = await this.analyzeWorkflowResults(workflowId);
      insights.forEach(insight => {
        if (!performanceInsights.has(insight.type)) {
          performanceInsights.set(insight.type, []);
        }
        performanceInsights.get(insight.type)!.push(insight);
      });
    }

    // Bottleneck analysis
    const bottlenecks = await this.identifyBottlenecks(targetWorkflows);
    if (bottlenecks.length > 0) {
      report += `🚫 TOP PERFORMANCE BOTTLENECKS:\n`;
      bottlenecks.slice(0, 5).forEach((bottleneck, index) => {
        report += `${index + 1}. ${bottleneck.stepName}\n`;
        report += `   Impact: ${bottleneck.impact.toFixed(1)}% • Avg Time: ${(bottleneck.avgExecutionTime / 1000).toFixed(1)}s\n`;
        report += `   Frequency: ${(bottleneck.frequency * 100).toFixed(1)}%\n\n`;
      });
    }

    // Key insights by type
    for (const [type, insights] of performanceInsights) {
      if (insights.length === 0) continue;
      
      report += `${this.getInsightTypeIcon(type)} ${type.toUpperCase()} INSIGHTS:\n`;
      
      const criticalInsights = insights.filter(i => i.severity === 'critical');
      const warningInsights = insights.filter(i => i.severity === 'warning');
      
      if (criticalInsights.length > 0) {
        report += `   🔴 Critical: ${criticalInsights.length}\n`;
        criticalInsights.slice(0, 3).forEach(insight => {
          report += `      • ${insight.title}\n`;
        });
      }
      
      if (warningInsights.length > 0) {
        report += `   🟡 Warnings: ${warningInsights.length}\n`;
        warningInsights.slice(0, 2).forEach(insight => {
          report += `      • ${insight.title}\n`;
        });
      }
      
      report += `\n`;
    }

    // Top recommendations
    const allRecommendations = Array.from(performanceInsights.values())
      .flat()
      .flatMap(insight => insight.recommendations)
      .reduce((acc, rec) => {
        acc.set(rec, (acc.get(rec) || 0) + 1);
        return acc;
      }, new Map<string, number>());

    const topRecommendations = Array.from(allRecommendations.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);

    if (topRecommendations.length > 0) {
      report += `💡 TOP RECOMMENDATIONS:\n`;
      topRecommendations.forEach(([recommendation, frequency], index) => {
        report += `${index + 1}. ${recommendation} (${frequency} workflows)\n`;
      });
      report += `\n`;
    }

    return report;
  }

  /**
   * Private: Analyze performance aspects
   */
  private analyzePerformance(workflowId: string, results: WorkflowResults, analytics: WorkflowAnalytics): WorkflowInsight[] {
    const insights: WorkflowInsight[] = [];

    // Slow execution insight
    if (analytics.performance.averageStepExecutionTime > 30000) { // 30 seconds
      insights.push({
        id: `perf-slow-${workflowId}-${Date.now()}`,
        type: InsightType.PERFORMANCE,
        severity: 'warning',
        title: 'Slow Step Execution Detected',
        description: `Average step execution time of ${(analytics.performance.averageStepExecutionTime / 1000).toFixed(1)}s exceeds recommended threshold`,
        data: {
          averageStepTime: analytics.performance.averageStepExecutionTime,
          slowestStep: analytics.performance.slowestStep,
          threshold: 30000
        },
        recommendations: [
          'Optimize slow steps by breaking them into smaller operations',
          'Consider parallel execution where possible',
          'Check for resource contention or blocking operations'
        ],
        affectedWorkflows: [workflowId],
        confidence: 0.8,
        timestamp: new Date()
      });
    }

    // Low throughput insight
    if (analytics.performance.throughput < 1.0) { // Less than 1 step per minute
      insights.push({
        id: `perf-throughput-${workflowId}-${Date.now()}`,
        type: InsightType.PERFORMANCE,
        severity: 'warning',
        title: 'Low Workflow Throughput',
        description: `Throughput of ${analytics.performance.throughput.toFixed(2)} steps/min is below optimal range`,
        data: {
          currentThroughput: analytics.performance.throughput,
          recommendedMinimum: 1.0
        },
        recommendations: [
          'Analyze step dependencies for parallelization opportunities',
          'Reduce unnecessary wait times or polling intervals',
          'Optimize resource-intensive operations'
        ],
        affectedWorkflows: [workflowId],
        confidence: 0.7,
        timestamp: new Date()
      });
    }

    return insights;
  }

  /**
   * Private: Analyze reliability aspects
   */
  private analyzeReliability(workflowId: string, results: WorkflowResults, analytics: WorkflowAnalytics): WorkflowInsight[] {
    const insights: WorkflowInsight[] = [];

    // Low success rate insight
    if (analytics.reliability.overallSuccessRate < 0.9) {
      insights.push({
        id: `rel-success-${workflowId}-${Date.now()}`,
        type: InsightType.RELIABILITY,
        severity: analytics.reliability.overallSuccessRate < 0.7 ? 'critical' : 'warning',
        title: 'Low Success Rate Detected',
        description: `Success rate of ${(analytics.reliability.overallSuccessRate * 100).toFixed(1)}% indicates reliability issues`,
        data: {
          successRate: analytics.reliability.overallSuccessRate,
          errorCount: results.errorAnalysis.errorCount,
          stepReliability: Object.fromEntries(analytics.reliability.stepReliability)
        },
        recommendations: [
          'Implement better error handling and retry mechanisms',
          'Add validation checks before critical steps',
          'Review and fix frequently failing steps'
        ],
        affectedWorkflows: [workflowId],
        confidence: 0.9,
        timestamp: new Date()
      });
    }

    return insights;
  }

  /**
   * Private: Analyze efficiency aspects
   */
  private analyzeEfficiency(workflowId: string, results: WorkflowResults, analytics: WorkflowAnalytics): WorkflowInsight[] {
    const insights: WorkflowInsight[] = [];

    // Low efficiency insight
    if (analytics.performance.efficiency < 0.8) {
      insights.push({
        id: `eff-low-${workflowId}-${Date.now()}`,
        type: InsightType.EFFICIENCY,
        severity: 'warning',
        title: 'Low Execution Efficiency',
        description: `Efficiency ratio of ${(analytics.performance.efficiency * 100).toFixed(1)}% indicates significant overhead`,
        data: {
          efficiency: analytics.performance.efficiency,
          estimatedTime: 0, // Could be calculated from workflow definition
          actualTime: results.executionSummary.totalDuration
        },
        recommendations: [
          'Identify and eliminate unnecessary delays',
          'Optimize step sequencing and dependencies',
          'Review resource allocation and utilization'
        ],
        affectedWorkflows: [workflowId],
        confidence: 0.6,
        timestamp: new Date()
      });
    }

    return insights;
  }

  /**
   * Private: Analyze error patterns
   */
  private analyzeErrorPatterns(workflowId: string, results: WorkflowResults): WorkflowInsight[] {
    const insights: WorkflowInsight[] = [];

    if (results.errorAnalysis.criticalErrors.length > 0) {
      insights.push({
        id: `err-critical-${workflowId}-${Date.now()}`,
        type: InsightType.ERROR_PATTERN,
        severity: 'critical',
        title: 'Critical Errors Detected',
        description: `${results.errorAnalysis.criticalErrors.length} critical errors found that require immediate attention`,
        data: {
          criticalErrors: results.errorAnalysis.criticalErrors,
          errorPatterns: Object.fromEntries(results.errorAnalysis.errorPatterns)
        },
        recommendations: [
          'Address critical errors immediately to prevent workflow failures',
          'Implement error monitoring and alerting',
          'Add comprehensive error recovery mechanisms'
        ],
        affectedWorkflows: [workflowId],
        confidence: 1.0,
        timestamp: new Date()
      });
    }

    return insights;
  }

  /**
   * Private: Generate optimization insights
   */
  private generateOptimizationInsights(workflowId: string, results: WorkflowResults, analytics: WorkflowAnalytics): WorkflowInsight[] {
    const insights: WorkflowInsight[] = [];

    // Step parallelization opportunity
    if (results.executionSummary.stepsExecuted > 3) {
      insights.push({
        id: `opt-parallel-${workflowId}-${Date.now()}`,
        type: InsightType.OPTIMIZATION,
        severity: 'info',
        title: 'Parallelization Opportunity',
        description: 'Workflow contains multiple steps that could potentially be executed in parallel',
        data: {
          totalSteps: results.executionSummary.stepsExecuted,
          sequentialTime: results.executionSummary.totalDuration,
          potentialSavings: results.executionSummary.totalDuration * 0.3 // Estimated 30% savings
        },
        recommendations: [
          'Analyze step dependencies to identify parallel execution opportunities',
          'Implement concurrent step execution where safe',
          'Consider workflow restructuring for better parallelism'
        ],
        affectedWorkflows: [workflowId],
        confidence: 0.5,
        timestamp: new Date()
      });
    }

    return insights;
  }

  /**
   * Private: Setup state manager event listeners
   */
  private setupStateManagerListeners(): void {
    this.stateManager.on('results-finalized', (workflowId, results) => {
      // Automatically analyze results when finalized
      this.analyzeWorkflowResults(workflowId).catch(error => {
        console.warn(`⚠️  Failed to analyze workflow results for ${workflowId}:`, error);
      });
    });
  }

  /**
   * Private: Calculate average difference between baseline and comparisons
   */
  private calculateAverageDifference(baseline: number, values: number[]): number {
    if (values.length === 0) return 0;
    const average = values.reduce((sum, val) => sum + val, 0) / values.length;
    return ((average - baseline) / baseline) * 100;
  }

  /**
   * Private: Generate comparison insights
   */
  private generateComparisonInsights(baselineWorkflowId: string, comparisons: any[]): WorkflowInsight[] {
    // Simplified implementation - could be much more sophisticated
    return [];
  }

  /**
   * Private: Generate comparison recommendation
   */
  private generateComparisonRecommendation(baselineWorkflowId: string, comparisons: any[]): string {
    return 'Based on the comparison, consider adopting best practices from higher-performing workflows';
  }

  /**
   * Private: Analyze trend direction
   */
  private analyzeTrendDirection(values: number[], preference: 'higher_is_better' | 'lower_is_better'): {
    direction: 'improving' | 'degrading' | 'stable';
    changeRate: number;
    significance: number;
  } {
    if (values.length < 2) {
      return { direction: 'stable', changeRate: 0, significance: 0 };
    }

    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
    
    const changeRate = ((secondAvg - firstAvg) / firstAvg) * 100;
    const significance = Math.min(Math.abs(changeRate) / 10, 1); // Simple significance calculation
    
    let direction: 'improving' | 'degrading' | 'stable' = 'stable';
    if (Math.abs(changeRate) > 5) { // 5% threshold
      if (preference === 'higher_is_better') {
        direction = changeRate > 0 ? 'improving' : 'degrading';
      } else {
        direction = changeRate < 0 ? 'improving' : 'degrading';
      }
    }

    return { direction, changeRate, significance };
  }

  /**
   * Private: Predict next period performance
   */
  private predictNextPeriodPerformance(workflows: PersistedWorkflowState[]): number {
    // Simplified linear prediction
    const successRates = workflows.map(w => w.analytics.reliability.overallSuccessRate);
    if (successRates.length < 2) return successRates[0] || 1.0;
    
    const trend = this.analyzeTrendDirection(successRates, 'higher_is_better');
    const lastValue = successRates[successRates.length - 1];
    
    return Math.max(0, Math.min(1, lastValue + (trend.changeRate / 100)));
  }

  /**
   * Private: Generate trend-based recommendations
   */
  private generateTrendBasedRecommendations(workflows: PersistedWorkflowState[]): string[] {
    return [
      'Continue monitoring performance trends',
      'Implement automated performance alerts',
      'Consider A/B testing for workflow optimizations'
    ];
  }

  /**
   * Private: Generate bottleneck recommendations
   */
  private generateBottleneckRecommendations(stepId: string, data: any): string[] {
    const recommendations = [];
    
    if (data.failures > data.executions * 0.1) {
      recommendations.push('Improve error handling and retry logic');
    }
    
    if (data.totalTime / data.executions > 60000) {
      recommendations.push('Optimize step implementation for better performance');
    }
    
    recommendations.push('Consider breaking this step into smaller, parallel operations');
    
    return recommendations;
  }

  /**
   * Private: Get insight type icon
   */
  private getInsightTypeIcon(type: InsightType): string {
    switch (type) {
      case InsightType.PERFORMANCE: return '⚡';
      case InsightType.RELIABILITY: return '🔒';
      case InsightType.EFFICIENCY: return '📈';
      case InsightType.ERROR_PATTERN: return '🚨';
      case InsightType.OPTIMIZATION: return '🔧';
      case InsightType.TREND: return '📊';
      default: return '💡';
    }
  }
}

/**
 * Global workflow results analyzer instance
 */
let globalWorkflowResultsAnalyzer: WorkflowResultsAnalyzer | null = null;

/**
 * Get the global workflow results analyzer instance
 */
export function getWorkflowResultsAnalyzer(): WorkflowResultsAnalyzer {
  if (!globalWorkflowResultsAnalyzer) {
    globalWorkflowResultsAnalyzer = new WorkflowResultsAnalyzer();
  }
  return globalWorkflowResultsAnalyzer;
}

/**
 * Initialize workflow results analysis
 */
export async function initializeWorkflowResultsAnalysis(): Promise<WorkflowResultsAnalyzer> {
  const analyzer = getWorkflowResultsAnalyzer();
  console.log('📊 Workflow results analysis system initialized');
  return analyzer;
}