/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { getWorkflowMonitor, WorkflowMonitor, WorkflowExecutionState, WorkflowStatus, StepStatus } from './workflow-monitor.js';

/**
 * Progress visualization format
 */
export enum ProgressFormat {
  ASCII_BAR = 'ascii_bar',
  EMOJI_ICONS = 'emoji_icons', 
  TEXT_SUMMARY = 'text_summary',
  DETAILED_REPORT = 'detailed_report'
}

/**
 * Real-time progress update
 */
export interface ProgressUpdate {
  workflowId: string;
  workflowName: string;
  timestamp: Date;
  status: WorkflowStatus;
  currentStep?: {
    id: string;
    name: string;
    status: StepStatus;
    progress: number; // 0-100
  };
  overall: {
    percentage: number; // 0-100
    stepsCompleted: number;
    stepsTotal: number;
    elapsedTime: number; // milliseconds
    estimatedTimeRemaining: number; // milliseconds
  };
  performance: {
    averageStepTime: number;
    successRate: number;
    errorCount: number;
  };
  visualization: {
    progressBar: string;
    statusEmoji: string;
    timeDisplay: string;
  };
}

/**
 * Progress tracker events
 */
export interface ProgressTrackerEvents {
  'progress-update': (update: ProgressUpdate) => void;
  'milestone-reached': (workflowId: string, milestone: string, update: ProgressUpdate) => void;
  'performance-alert': (workflowId: string, metric: string, value: number, threshold: number) => void;
  'visualization-update': (workflowId: string, format: ProgressFormat, content: string) => void;
}

/**
 * Real-time workflow progress tracking and visualization
 */
export class ProgressTracker extends EventEmitter {
  private monitor: WorkflowMonitor;
  private trackedWorkflows = new Map<string, ProgressUpdate>();
  private updateIntervals = new Map<string, NodeJS.Timeout>();
  private performanceThresholds = {
    slowStepTime: 30000, // 30 seconds
    lowSuccessRate: 0.8, // 80%
    highErrorRate: 0.2 // 20%
  };

  constructor() {
    super();
    this.monitor = getWorkflowMonitor();
    this.setupMonitorListeners();
  }

  /**
   * Start tracking progress for a workflow
   */
  startTracking(workflowId: string, updateInterval: number = 1000): void {
    const executionState = this.monitor.getWorkflowState(workflowId);
    if (!executionState) {
      console.warn(`⚠️  Cannot track workflow ${workflowId}: not found`);
      return;
    }

    // Initial progress update
    this.updateProgress(executionState);

    // Setup periodic updates for running workflows
    if (executionState.status === WorkflowStatus.RUNNING) {
      const interval = setInterval(() => {
        const currentState = this.monitor.getWorkflowState(workflowId);
        if (currentState) {
          this.updateProgress(currentState);
          
          // Stop tracking if workflow completed
          if (currentState.status === WorkflowStatus.COMPLETED || 
              currentState.status === WorkflowStatus.FAILED ||
              currentState.status === WorkflowStatus.CANCELLED) {
            this.stopTracking(workflowId);
          }
        } else {
          this.stopTracking(workflowId);
        }
      }, updateInterval);

      this.updateIntervals.set(workflowId, interval);
    }

    console.log(`📊 Started tracking progress for workflow: ${executionState.definition.name}`);
  }

  /**
   * Stop tracking progress for a workflow
   */
  stopTracking(workflowId: string): void {
    const interval = this.updateIntervals.get(workflowId);
    if (interval) {
      clearInterval(interval);
      this.updateIntervals.delete(workflowId);
    }

    const update = this.trackedWorkflows.get(workflowId);
    if (update) {
      console.log(`📊 Stopped tracking progress for workflow: ${update.workflowName}`);
    }

    this.trackedWorkflows.delete(workflowId);
  }

  /**
   * Get current progress for a workflow
   */
  getProgress(workflowId: string): ProgressUpdate | undefined {
    return this.trackedWorkflows.get(workflowId);
  }

  /**
   * Get progress for all tracked workflows
   */
  getAllProgress(): ProgressUpdate[] {
    return Array.from(this.trackedWorkflows.values());
  }

  /**
   * Generate progress visualization
   */
  generateProgressVisualization(workflowId: string, format: ProgressFormat = ProgressFormat.ASCII_BAR): string {
    const update = this.trackedWorkflows.get(workflowId);
    if (!update) {
      return `⚠️  No progress data available for workflow ${workflowId}`;
    }

    switch (format) {
      case ProgressFormat.ASCII_BAR:
        return this.generateAsciiProgressBar(update);
      
      case ProgressFormat.EMOJI_ICONS:
        return this.generateEmojiProgress(update);
      
      case ProgressFormat.TEXT_SUMMARY:
        return this.generateTextSummary(update);
      
      case ProgressFormat.DETAILED_REPORT:
        return this.generateDetailedReport(update);
      
      default:
        return this.generateAsciiProgressBar(update);
    }
  }

  /**
   * Generate live progress dashboard for all workflows
   */
  generateProgressDashboard(): string {
    const allProgress = this.getAllProgress();
    
    if (allProgress.length === 0) {
      return `📊 WORKFLOW PROGRESS DASHBOARD\n═══════════════════════════════\n\n🔍 No active workflows being tracked`;
    }

    let dashboard = `📊 WORKFLOW PROGRESS DASHBOARD\n`;
    dashboard += `═══════════════════════════════════════════════════════════════════════════════\n\n`;

    allProgress.forEach((update, index) => {
      dashboard += `[${index + 1}] ${update.workflowName} ${update.visualization.statusEmoji}\n`;
      dashboard += `${update.visualization.progressBar}\n`;
      dashboard += `${update.overall.stepsCompleted}/${update.overall.stepsTotal} steps • `;
      dashboard += `${update.visualization.timeDisplay} • `;
      dashboard += `Success: ${(update.performance.successRate * 100).toFixed(0)}%\n`;
      
      if (update.currentStep) {
        dashboard += `🔄 Current: ${update.currentStep.name}\n`;
      }
      
      dashboard += `\n`;
    });

    return dashboard;
  }

  /**
   * Private: Setup monitor event listeners
   */
  private setupMonitorListeners(): void {
    this.monitor.on('workflow-started', (state) => {
      this.startTracking(state.workflowId);
    });

    this.monitor.on('step-started', (stepId, state) => {
      this.updateProgress(state);
    });

    this.monitor.on('step-completed', (stepId, result, state) => {
      this.updateProgress(state);
      this.checkMilestones(state);
      this.checkPerformanceAlerts(state);
    });

    this.monitor.on('step-failed', (stepId, result, state) => {
      this.updateProgress(state);
      this.checkPerformanceAlerts(state);
    });

    this.monitor.on('progress-updated', (state) => {
      this.updateProgress(state);
    });

    this.monitor.on('workflow-completed', (state) => {
      this.updateProgress(state);
      this.checkMilestones(state, 'completed');
    });

    this.monitor.on('workflow-failed', (state) => {
      this.updateProgress(state);
    });
  }

  /**
   * Private: Update progress for a workflow
   */
  private updateProgress(executionState: WorkflowExecutionState): void {
    const elapsedTime = executionState.endTime ? 
      executionState.endTime.getTime() - executionState.startTime.getTime() :
      Date.now() - executionState.startTime.getTime();

    // Find current step
    let currentStep;
    if (executionState.status === WorkflowStatus.RUNNING) {
      const currentStepIndex = executionState.currentStepIndex;
      const step = executionState.definition.steps[currentStepIndex];
      if (step) {
        const stepResult = executionState.stepResults.get(step.id);
        currentStep = {
          id: step.id,
          name: step.name,
          status: stepResult?.status || StepStatus.PENDING,
          progress: stepResult?.status === StepStatus.COMPLETED ? 100 : 
                   stepResult?.status === StepStatus.RUNNING ? 50 : 0
        };
      }
    }

    const errorCount = executionState.failedSteps.length;

    const update: ProgressUpdate = {
      workflowId: executionState.workflowId,
      workflowName: executionState.definition.name,
      timestamp: new Date(),
      status: executionState.status,
      currentStep,
      overall: {
        percentage: executionState.progress.percentage,
        stepsCompleted: executionState.progress.stepsCompleted,
        stepsTotal: executionState.progress.stepsTotal,
        elapsedTime,
        estimatedTimeRemaining: executionState.progress.estimatedTimeRemaining
      },
      performance: {
        averageStepTime: executionState.performanceMetrics.averageStepTime,
        successRate: executionState.performanceMetrics.successRate,
        errorCount
      },
      visualization: {
        progressBar: this.createProgressBar(executionState.progress.percentage),
        statusEmoji: this.getStatusEmoji(executionState.status),
        timeDisplay: this.formatTimeDisplay(elapsedTime, executionState.progress.estimatedTimeRemaining)
      }
    };

    this.trackedWorkflows.set(executionState.workflowId, update);
    this.emit('progress-update', update);
  }

  /**
   * Private: Check for milestones
   */
  private checkMilestones(executionState: WorkflowExecutionState, milestone?: string): void {
    const update = this.trackedWorkflows.get(executionState.workflowId);
    if (!update) return;

    // Check percentage milestones
    if (milestone !== 'completed') {
      const percentage = update.overall.percentage;
      if (percentage === 25 || percentage === 50 || percentage === 75) {
        this.emit('milestone-reached', executionState.workflowId, `${percentage}% complete`, update);
      }
    }

    // Check completion milestone
    if (milestone === 'completed') {
      this.emit('milestone-reached', executionState.workflowId, 'workflow completed', update);
    }
  }

  /**
   * Private: Check performance alerts
   */
  private checkPerformanceAlerts(executionState: WorkflowExecutionState): void {
    const update = this.trackedWorkflows.get(executionState.workflowId);
    if (!update) return;

    // Slow step time alert
    if (update.performance.averageStepTime > this.performanceThresholds.slowStepTime) {
      this.emit('performance-alert', 
        executionState.workflowId, 
        'slow_step_time', 
        update.performance.averageStepTime, 
        this.performanceThresholds.slowStepTime
      );
    }

    // Low success rate alert
    if (update.performance.successRate < this.performanceThresholds.lowSuccessRate) {
      this.emit('performance-alert', 
        executionState.workflowId, 
        'low_success_rate', 
        update.performance.successRate, 
        this.performanceThresholds.lowSuccessRate
      );
    }

    // High error rate alert
    const errorRate = update.performance.errorCount / update.overall.stepsTotal;
    if (errorRate > this.performanceThresholds.highErrorRate) {
      this.emit('performance-alert', 
        executionState.workflowId, 
        'high_error_rate', 
        errorRate, 
        this.performanceThresholds.highErrorRate
      );
    }
  }

  /**
   * Private: Create ASCII progress bar
   */
  private createProgressBar(percentage: number, width: number = 40): string {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `[${bar}] ${percentage.toFixed(0)}%`;
  }

  /**
   * Private: Get status emoji
   */
  private getStatusEmoji(status: WorkflowStatus): string {
    switch (status) {
      case WorkflowStatus.PLANNED: return '📋';
      case WorkflowStatus.RUNNING: return '🔄';
      case WorkflowStatus.PAUSED: return '⏸️';
      case WorkflowStatus.COMPLETED: return '✅';
      case WorkflowStatus.FAILED: return '❌';
      case WorkflowStatus.CANCELLED: return '🚫';
      default: return '❓';
    }
  }

  /**
   * Private: Format time display
   */
  private formatTimeDisplay(elapsedMs: number, remainingMs: number): string {
    const elapsed = Math.round(elapsedMs / 1000);
    const remaining = Math.round(remainingMs / 1000);
    
    const formatSeconds = (seconds: number) => {
      if (seconds < 60) return `${seconds}s`;
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${minutes}m ${secs}s`;
    };

    return `${formatSeconds(elapsed)} elapsed, ${formatSeconds(remaining)} remaining`;
  }

  /**
   * Private: Generate ASCII progress bar visualization
   */
  private generateAsciiProgressBar(update: ProgressUpdate): string {
    let visualization = `🎯 ${update.workflowName}\n`;
    visualization += `${update.visualization.progressBar}\n`;
    visualization += `${update.visualization.timeDisplay}\n`;
    
    if (update.currentStep) {
      visualization += `🔄 Current: ${update.currentStep.name}\n`;
    }
    
    return visualization;
  }

  /**
   * Private: Generate emoji progress visualization
   */
  private generateEmojiProgress(update: ProgressUpdate): string {
    const totalSteps = update.overall.stepsTotal;
    const completedSteps = update.overall.stepsCompleted;
    
    let stepIcons = '';
    for (let i = 0; i < totalSteps; i++) {
      if (i < completedSteps) {
        stepIcons += '✅ ';
      } else if (i === completedSteps && update.status === WorkflowStatus.RUNNING) {
        stepIcons += '🔄 ';
      } else {
        stepIcons += '⭕ ';
      }
    }
    
    return `${update.visualization.statusEmoji} ${update.workflowName}\n${stepIcons}\n${update.visualization.timeDisplay}`;
  }

  /**
   * Private: Generate text summary
   */
  private generateTextSummary(update: ProgressUpdate): string {
    return `${update.workflowName}: ${update.overall.percentage}% complete (${update.overall.stepsCompleted}/${update.overall.stepsTotal} steps)`;
  }

  /**
   * Private: Generate detailed report
   */
  private generateDetailedReport(update: ProgressUpdate): string {
    let report = `📊 WORKFLOW PROGRESS REPORT\n`;
    report += `═══════════════════════════════════\n\n`;
    report += `🎯 Workflow: ${update.workflowName}\n`;
    report += `📈 Status: ${update.status.toUpperCase()} ${update.visualization.statusEmoji}\n`;
    report += `📊 Progress: ${update.overall.percentage}% complete\n`;
    report += `📝 Steps: ${update.overall.stepsCompleted}/${update.overall.stepsTotal}\n`;
    report += `⏱️  ${update.visualization.timeDisplay}\n\n`;
    
    if (update.currentStep) {
      report += `🔄 CURRENT STEP:\n`;
      report += `   ${update.currentStep.name}\n`;
      report += `   Status: ${update.currentStep.status}\n\n`;
    }
    
    report += `📈 PERFORMANCE METRICS:\n`;
    report += `   Average Step Time: ${(update.performance.averageStepTime / 1000).toFixed(1)}s\n`;
    report += `   Success Rate: ${(update.performance.successRate * 100).toFixed(1)}%\n`;
    report += `   Error Count: ${update.performance.errorCount}\n`;
    
    return report;
  }

  /**
   * Cleanup and stop all tracking
   */
  cleanup(): void {
    // Clear all intervals
    for (const [_workflowId, interval] of this.updateIntervals) {
      clearInterval(interval);
    }
    this.updateIntervals.clear();
    this.trackedWorkflows.clear();
    
    console.log('📊 Progress tracker cleanup completed');
  }
}

/**
 * Global progress tracker instance
 */
let globalProgressTracker: ProgressTracker | null = null;

/**
 * Get the global progress tracker instance
 */
export function getProgressTracker(): ProgressTracker {
  if (!globalProgressTracker) {
    globalProgressTracker = new ProgressTracker();
  }
  return globalProgressTracker;
}

/**
 * Initialize progress tracking
 */
export async function initializeProgressTracking(): Promise<ProgressTracker> {
  const tracker = getProgressTracker();
  
  // Setup event logging
  tracker.on('progress-update', (update) => {
    if (update.status === WorkflowStatus.RUNNING) {
      console.log(`📊 ${update.workflowName}: ${update.overall.percentage}% complete`);
    }
  });

  tracker.on('milestone-reached', (_workflowId, milestone, update) => {
    console.log(`🎯 Milestone reached: ${update.workflowName} - ${milestone}`);
  });

  tracker.on('performance-alert', (_workflowId, metric, value, threshold) => {
    console.log(`⚠️  Performance alert: ${metric} = ${value} (threshold: ${threshold})`);
  });

  console.log('📊 Progress tracking system initialized');
  return tracker;
}