/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { getWorkflowMonitor, WorkflowExecutionState, WorkflowStatus, StepStatus } from '../monitoring/workflow-monitor.js';

/**
 * Workflow state persistence format
 */
export interface PersistedWorkflowState {
  workflowId: string;
  sessionId?: string;
  projectPath?: string;
  gitCommitHash?: string;
  state: WorkflowExecutionState;
  checkpoints: WorkflowCheckpoint[];
  results: WorkflowResults;
  analytics: WorkflowAnalytics;
  metadata: {
    createdAt: Date;
    lastUpdated: Date;
    persistedAt: Date;
    version: string;
  };
}

/**
 * Workflow execution checkpoint
 */
export interface WorkflowCheckpoint {
  id: string;
  timestamp: Date;
  stepId: string;
  stepIndex: number;
  description: string;
  state: {
    status: WorkflowStatus;
    completedSteps: string[];
    failedSteps: string[];
    progress: {
      percentage: number;
      stepsCompleted: number;
      estimatedTimeRemaining: number;
    };
    performanceSnapshot: {
      averageStepTime: number;
      successRate: number;
      totalRetries: number;
    };
  };
  context: {
    environment: Record<string, any>;
    workingDirectory: string;
    openFiles: string[];
    lastCommand?: string;
  };
}

/**
 * Comprehensive workflow results
 */
export interface WorkflowResults {
  finalStatus: WorkflowStatus;
  executionSummary: {
    totalDuration: number;
    stepsExecuted: number;
    stepsSuccessful: number;
    stepsFailed: number;
    stepsSkipped: number;
    retryCount: number;
  };
  stepResults: Map<string, {
    result: any;
    output: string;
    error?: string;
    executionTime: number;
    retryAttempts: number;
    performanceMetrics?: Record<string, number>;
  }>;
  outputArtifacts: {
    id: string;
    type: 'file' | 'data' | 'log' | 'report';
    path?: string;
    content?: string;
    size: number;
    createdAt: Date;
  }[];
  errorAnalysis: {
    errorCount: number;
    criticalErrors: string[];
    recoverableErrors: string[];
    errorPatterns: Map<string, number>;
    rootCauses: string[];
  };
}

/**
 * Workflow execution analytics
 */
export interface WorkflowAnalytics {
  performance: {
    averageStepExecutionTime: number;
    slowestStep: { stepId: string; duration: number };
    fastestStep: { stepId: string; duration: number };
    throughput: number; // steps per minute
    efficiency: number; // 0-1 ratio of actual vs estimated time
  };
  reliability: {
    overallSuccessRate: number;
    stepReliability: Map<string, number>;
    errorFrequency: Map<string, number>;
    recoveryRate: number; // successful retries / total retries
  };
  resource: {
    peakMemoryUsage: number;
    averageMemoryUsage: number;
    cpuUtilization: number;
    diskIO: number;
    networkRequests: number;
  };
  trends: {
    executionTimeHistory: number[];
    successRateHistory: number[];
    errorRateHistory: number[];
    lastAnalyzed: Date;
  };
}

/**
 * Workflow state management events
 */
export interface WorkflowStateManagerEvents {
  'state-persisted': (workflowId: string, path: string) => void;
  'state-restored': (workflowId: string, state: PersistedWorkflowState) => void;
  'checkpoint-created': (workflowId: string, checkpoint: WorkflowCheckpoint) => void;
  'analytics-updated': (workflowId: string, analytics: WorkflowAnalytics) => void;
  'results-finalized': (workflowId: string, results: WorkflowResults) => void;
  'state-cleanup': (cleanedCount: number) => void;
}

/**
 * Comprehensive workflow state management system
 */
export class WorkflowStateManager extends EventEmitter {
  private monitor = getWorkflowMonitor();
  private stateDirectory: string;
  private checkpointInterval: number = 30000; // 30 seconds
  private activeWorkflowStates = new Map<string, PersistedWorkflowState>();
  private checkpointIntervals = new Map<string, NodeJS.Timeout>();
  private isInitialized = false;

  constructor() {
    super();
    this.stateDirectory = join(homedir(), '.ouroboros-code', 'workflow-states');
    this.setupMonitorListeners();
  }

  /**
   * Initialize workflow state management
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await fs.mkdir(this.stateDirectory, { recursive: true });
      console.log('🗄️  Workflow state directory initialized');
      
      this.isInitialized = true;
      console.log('📊 Workflow state management system initialized');
    } catch (error) {
      throw new Error(`Failed to initialize workflow state manager: ${error}`);
    }
  }

  /**
   * Start comprehensive state tracking for a workflow
   */
  async startStateTracking(
    workflowId: string,
    sessionId?: string,
    projectPath?: string,
    gitCommitHash?: string
  ): Promise<void> {
    const executionState = this.monitor.getWorkflowState(workflowId);
    if (!executionState) {
      throw new Error(`Workflow ${workflowId} not found for state tracking`);
    }

    const persistedState: PersistedWorkflowState = {
      workflowId,
      sessionId,
      projectPath,
      gitCommitHash,
      state: executionState,
      checkpoints: [],
      results: this.initializeResults(),
      analytics: this.initializeAnalytics(),
      metadata: {
        createdAt: new Date(),
        lastUpdated: new Date(),
        persistedAt: new Date(),
        version: '1.0.0'
      }
    };

    this.activeWorkflowStates.set(workflowId, persistedState);
    
    // Start automatic checkpointing
    await this.startAutomaticCheckpointing(workflowId);
    
    // Initial state persistence
    await this.persistWorkflowState(workflowId);
    
    console.log(`📊 Started comprehensive state tracking for workflow: ${executionState.definition.name}`);
  }

  /**
   * Stop state tracking and finalize results
   */
  async stopStateTracking(workflowId: string): Promise<void> {
    const persistedState = this.activeWorkflowStates.get(workflowId);
    if (!persistedState) {
      return;
    }

    // Stop automatic checkpointing
    const interval = this.checkpointIntervals.get(workflowId);
    if (interval) {
      clearInterval(interval);
      this.checkpointIntervals.delete(workflowId);
    }

    // Finalize results and analytics
    await this.finalizeWorkflowResults(workflowId);
    await this.updateWorkflowAnalytics(workflowId);

    // Final state persistence
    await this.persistWorkflowState(workflowId);

    console.log(`📊 Stopped state tracking for workflow: ${workflowId}`);
  }

  /**
   * Create manual workflow checkpoint
   */
  async createWorkflowCheckpoint(workflowId: string, description: string): Promise<WorkflowCheckpoint> {
    const persistedState = this.activeWorkflowStates.get(workflowId);
    if (!persistedState) {
      throw new Error(`Workflow ${workflowId} not being tracked`);
    }

    const executionState = this.monitor.getWorkflowState(workflowId);
    if (!executionState) {
      throw new Error(`Workflow ${workflowId} execution state not found`);
    }

    const checkpoint: WorkflowCheckpoint = {
      id: `checkpoint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      stepId: executionState.definition.steps[executionState.currentStepIndex]?.id || 'unknown',
      stepIndex: executionState.currentStepIndex,
      description,
      state: {
        status: executionState.status,
        completedSteps: [...executionState.completedSteps],
        failedSteps: [...executionState.failedSteps],
        progress: { 
          percentage: executionState.progress.percentage,
          stepsCompleted: executionState.progress.stepsCompleted,
          estimatedTimeRemaining: executionState.progress.estimatedTimeRemaining
        },
        performanceSnapshot: { ...executionState.performanceMetrics }
      },
      context: {
        environment: { ...process.env },
        workingDirectory: process.cwd(),
        openFiles: [], // Could be enhanced to track actual open files
        lastCommand: undefined // Could be enhanced to track last executed command
      }
    };

    persistedState.checkpoints.push(checkpoint);
    persistedState.metadata.lastUpdated = new Date();

    await this.persistWorkflowState(workflowId);
    this.emit('checkpoint-created', workflowId, checkpoint);

    console.log(`📍 Created checkpoint for workflow ${workflowId}: ${description}`);
    return checkpoint;
  }

  /**
   * Restore workflow from checkpoint
   */
  async restoreFromCheckpoint(workflowId: string, checkpointId: string): Promise<boolean> {
    const persistedState = await this.loadWorkflowState(workflowId);
    if (!persistedState) {
      console.warn(`⚠️  Workflow state ${workflowId} not found for restoration`);
      return false;
    }

    const checkpoint = persistedState.checkpoints.find(cp => cp.id === checkpointId);
    if (!checkpoint) {
      console.warn(`⚠️  Checkpoint ${checkpointId} not found for workflow ${workflowId}`);
      return false;
    }

    try {
      // Restore the workflow state from checkpoint
      const executionState = this.monitor.getWorkflowState(workflowId);
      if (executionState) {
        // Update execution state with checkpoint data
        executionState.status = checkpoint.state.status;
        executionState.completedSteps = [...checkpoint.state.completedSteps];
        executionState.failedSteps = [...checkpoint.state.failedSteps];
        executionState.currentStepIndex = checkpoint.stepIndex;
        executionState.progress = { 
          percentage: checkpoint.state.progress.percentage,
          stepsCompleted: checkpoint.state.progress.stepsCompleted,
          stepsTotal: executionState.definition.steps.length,
          estimatedTimeRemaining: checkpoint.state.progress.estimatedTimeRemaining
        };
        executionState.performanceMetrics = { ...checkpoint.state.performanceSnapshot };

        console.log(`✅ Restored workflow ${workflowId} from checkpoint: ${checkpoint.description}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error(`❌ Failed to restore workflow ${workflowId} from checkpoint:`, error);
      return false;
    }
  }

  /**
   * Get comprehensive workflow results
   */
  getWorkflowResults(workflowId: string): WorkflowResults | undefined {
    const persistedState = this.activeWorkflowStates.get(workflowId);
    return persistedState?.results;
  }

  /**
   * Get workflow analytics
   */
  getWorkflowAnalytics(workflowId: string): WorkflowAnalytics | undefined {
    const persistedState = this.activeWorkflowStates.get(workflowId);
    return persistedState?.analytics;
  }

  /**
   * Get workflow state summary
   */
  getWorkflowStateSummary(workflowId: string): any {
    const persistedState = this.activeWorkflowStates.get(workflowId);
    if (!persistedState) {
      return null;
    }

    const executionState = persistedState.state;
    return {
      workflowId,
      name: executionState.definition.name,
      status: executionState.status,
      progress: executionState.progress.percentage,
      stepsCompleted: executionState.completedSteps.length,
      stepsTotal: executionState.definition.steps.length,
      checkpoints: persistedState.checkpoints.length,
      duration: executionState.totalExecutionTime,
      errorCount: persistedState.results.errorAnalysis.errorCount,
      successRate: persistedState.analytics.reliability.overallSuccessRate,
      lastUpdated: persistedState.metadata.lastUpdated
    };
  }

  /**
   * Get all tracked workflow summaries
   */
  getAllWorkflowSummaries(): any[] {
    return Array.from(this.activeWorkflowStates.keys())
      .map(workflowId => this.getWorkflowStateSummary(workflowId))
      .filter(summary => summary !== null);
  }

  /**
   * Search for workflows by criteria
   */
  async searchWorkflows(criteria: {
    sessionId?: string;
    projectPath?: string;
    status?: WorkflowStatus;
    timeRange?: { from: Date; to: Date };
    hasErrors?: boolean;
  }): Promise<PersistedWorkflowState[]> {
    const results: PersistedWorkflowState[] = [];
    
    try {
      const files = await fs.readdir(this.stateDirectory);
      const workflowFiles = files.filter(f => f.endsWith('.json'));

      for (const file of workflowFiles) {
        try {
          const content = await fs.readFile(join(this.stateDirectory, file), 'utf-8');
          const state: PersistedWorkflowState = JSON.parse(content);
          
          // Apply criteria filters
          if (criteria.sessionId && state.sessionId !== criteria.sessionId) continue;
          if (criteria.projectPath && state.projectPath !== criteria.projectPath) continue;
          if (criteria.status && state.state.status !== criteria.status) continue;
          if (criteria.hasErrors !== undefined) {
            const hasErrors = state.results.errorAnalysis.errorCount > 0;
            if (hasErrors !== criteria.hasErrors) continue;
          }
          if (criteria.timeRange) {
            const createdAt = new Date(state.metadata.createdAt);
            if (createdAt < criteria.timeRange.from || createdAt > criteria.timeRange.to) continue;
          }

          results.push(state);
        } catch (parseError) {
          console.warn(`⚠️  Failed to parse workflow state file ${file}:`, parseError);
        }
      }
    } catch (error) {
      console.error('❌ Error searching workflows:', error);
    }

    return results.sort((a, b) => 
      new Date(b.metadata.createdAt).getTime() - new Date(a.metadata.createdAt).getTime()
    );
  }

  /**
   * Generate comprehensive state report
   */
  async generateStateReport(): Promise<string> {
    const allWorkflows = this.getAllWorkflowSummaries();
    const activeWorkflows = allWorkflows.filter(w => w.status === WorkflowStatus.RUNNING);
    const completedWorkflows = allWorkflows.filter(w => w.status === WorkflowStatus.COMPLETED);
    const failedWorkflows = allWorkflows.filter(w => w.status === WorkflowStatus.FAILED);

    let report = `📊 WORKFLOW STATE MANAGEMENT REPORT\n`;
    report += `═══════════════════════════════════════════════════════════════════════════════\n\n`;
    
    report += `📈 OVERVIEW:\n`;
    report += `• Total Workflows: ${allWorkflows.length}\n`;
    report += `• Active: ${activeWorkflows.length}\n`;
    report += `• Completed: ${completedWorkflows.length}\n`;
    report += `• Failed: ${failedWorkflows.length}\n`;
    report += `• Success Rate: ${allWorkflows.length > 0 ? ((completedWorkflows.length / allWorkflows.length) * 100).toFixed(1) : 0}%\n\n`;

    if (activeWorkflows.length > 0) {
      report += `🔄 ACTIVE WORKFLOWS:\n`;
      activeWorkflows.forEach(workflow => {
        report += `• ${workflow.name}: ${workflow.progress}% complete\n`;
        report += `  Steps: ${workflow.stepsCompleted}/${workflow.stepsTotal}\n`;
        report += `  Checkpoints: ${workflow.checkpoints}\n`;
        report += `  Errors: ${workflow.errorCount}\n\n`;
      });
    }

    if (completedWorkflows.length > 0) {
      const avgDuration = completedWorkflows.reduce((sum, w) => sum + w.duration, 0) / completedWorkflows.length;
      report += `✅ PERFORMANCE ANALYSIS:\n`;
      report += `• Average Duration: ${(avgDuration / 1000).toFixed(1)}s\n`;
      report += `• Average Success Rate: ${(completedWorkflows.reduce((sum, w) => sum + w.successRate, 0) / completedWorkflows.length * 100).toFixed(1)}%\n\n`;
    }

    return report;
  }

  /**
   * Cleanup old workflow states
   */
  async cleanupOldStates(olderThanDays: number = 30): Promise<void> {
    try {
      const cutoffDate = new Date(Date.now() - (olderThanDays * 24 * 60 * 60 * 1000));
      const files = await fs.readdir(this.stateDirectory);
      let cleanedCount = 0;

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        try {
          const filePath = join(this.stateDirectory, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const state: PersistedWorkflowState = JSON.parse(content);
          
          const createdAt = new Date(state.metadata.createdAt);
          if (createdAt < cutoffDate && 
              state.state.status !== WorkflowStatus.RUNNING &&
              state.state.status !== WorkflowStatus.PAUSED) {
            
            await fs.unlink(filePath);
            cleanedCount++;
            console.log(`🧹 Cleaned up old workflow state: ${state.workflowId}`);
          }
        } catch (parseError) {
          console.warn(`⚠️  Failed to parse workflow state file ${file} during cleanup:`, parseError);
        }
      }

      this.emit('state-cleanup', cleanedCount);
      console.log(`🧹 Cleaned up ${cleanedCount} old workflow states`);
    } catch (error) {
      console.error('❌ Error during state cleanup:', error);
    }
  }

  /**
   * Private: Setup monitor event listeners
   */
  private setupMonitorListeners(): void {
    this.monitor.on('workflow-started', (state) => {
      // Auto-start state tracking for new workflows
      this.startStateTracking(state.workflowId).catch(error => {
        console.warn(`⚠️  Failed to start state tracking for ${state.workflowId}:`, error);
      });
    });

    this.monitor.on('step-completed', (stepId, result, state) => {
      this.updateWorkflowState(state.workflowId, state);
    });

    this.monitor.on('step-failed', (stepId, result, state) => {
      this.updateWorkflowState(state.workflowId, state);
    });

    this.monitor.on('workflow-completed', (state) => {
      this.stopStateTracking(state.workflowId);
    });

    this.monitor.on('workflow-failed', (state) => {
      this.stopStateTracking(state.workflowId);
    });
  }

  /**
   * Private: Update workflow state
   */
  private async updateWorkflowState(workflowId: string, executionState: WorkflowExecutionState): Promise<void> {
    const persistedState = this.activeWorkflowStates.get(workflowId);
    if (!persistedState) return;

    // Update the persisted state
    persistedState.state = executionState;
    persistedState.metadata.lastUpdated = new Date();

    // Update analytics
    await this.updateWorkflowAnalytics(workflowId);

    // Persist periodically (not on every update for performance)
    if (Date.now() % 5000 === 0) { // Every ~5 seconds
      await this.persistWorkflowState(workflowId);
    }
  }

  /**
   * Private: Start automatic checkpointing
   */
  private async startAutomaticCheckpointing(workflowId: string): Promise<void> {
    const interval = setInterval(async () => {
      try {
        const persistedState = this.activeWorkflowStates.get(workflowId);
        if (!persistedState || 
            persistedState.state.status === WorkflowStatus.COMPLETED ||
            persistedState.state.status === WorkflowStatus.FAILED) {
          clearInterval(interval);
          this.checkpointIntervals.delete(workflowId);
          return;
        }

        await this.createWorkflowCheckpoint(workflowId, 'Auto checkpoint');
      } catch (error) {
        console.warn(`⚠️  Failed to create auto checkpoint for ${workflowId}:`, error);
      }
    }, this.checkpointInterval);

    this.checkpointIntervals.set(workflowId, interval);
  }

  /**
   * Private: Persist workflow state to disk
   */
  private async persistWorkflowState(workflowId: string): Promise<void> {
    const persistedState = this.activeWorkflowStates.get(workflowId);
    if (!persistedState) return;

    try {
      persistedState.metadata.persistedAt = new Date();
      const filePath = join(this.stateDirectory, `${workflowId}.json`);
      
      await fs.writeFile(
        filePath,
        JSON.stringify(persistedState, null, 2),
        'utf-8'
      );

      this.emit('state-persisted', workflowId, filePath);
    } catch (error) {
      console.error(`❌ Failed to persist workflow state ${workflowId}:`, error);
    }
  }

  /**
   * Private: Load workflow state from disk
   */
  private async loadWorkflowState(workflowId: string): Promise<PersistedWorkflowState | null> {
    try {
      const filePath = join(this.stateDirectory, `${workflowId}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      const state: PersistedWorkflowState = JSON.parse(content);
      
      this.emit('state-restored', workflowId, state);
      return state;
    } catch (error) {
      return null;
    }
  }

  /**
   * Private: Initialize results structure
   */
  private initializeResults(): WorkflowResults {
    return {
      finalStatus: WorkflowStatus.PLANNED,
      executionSummary: {
        totalDuration: 0,
        stepsExecuted: 0,
        stepsSuccessful: 0,
        stepsFailed: 0,
        stepsSkipped: 0,
        retryCount: 0
      },
      stepResults: new Map(),
      outputArtifacts: [],
      errorAnalysis: {
        errorCount: 0,
        criticalErrors: [],
        recoverableErrors: [],
        errorPatterns: new Map(),
        rootCauses: []
      }
    };
  }

  /**
   * Private: Initialize analytics structure
   */
  private initializeAnalytics(): WorkflowAnalytics {
    return {
      performance: {
        averageStepExecutionTime: 0,
        slowestStep: { stepId: '', duration: 0 },
        fastestStep: { stepId: '', duration: Infinity },
        throughput: 0,
        efficiency: 1.0
      },
      reliability: {
        overallSuccessRate: 1.0,
        stepReliability: new Map(),
        errorFrequency: new Map(),
        recoveryRate: 1.0
      },
      resource: {
        peakMemoryUsage: 0,
        averageMemoryUsage: 0,
        cpuUtilization: 0,
        diskIO: 0,
        networkRequests: 0
      },
      trends: {
        executionTimeHistory: [],
        successRateHistory: [],
        errorRateHistory: [],
        lastAnalyzed: new Date()
      }
    };
  }

  /**
   * Private: Finalize workflow results
   */
  private async finalizeWorkflowResults(workflowId: string): Promise<void> {
    const persistedState = this.activeWorkflowStates.get(workflowId);
    if (!persistedState) return;

    const executionState = persistedState.state;
    
    // Finalize execution summary
    persistedState.results.finalStatus = executionState.status;
    persistedState.results.executionSummary = {
      totalDuration: executionState.totalExecutionTime,
      stepsExecuted: executionState.completedSteps.length + executionState.failedSteps.length,
      stepsSuccessful: executionState.completedSteps.length,
      stepsFailed: executionState.failedSteps.length,
      stepsSkipped: executionState.definition.steps.length - (executionState.completedSteps.length + executionState.failedSteps.length),
      retryCount: executionState.performanceMetrics.totalRetries
    };

    // Process step results
    for (const [stepId, result] of executionState.stepResults) {
      persistedState.results.stepResults.set(stepId, {
        result: result,
        output: result.output || '',
        error: result.error,
        executionTime: result.executionTime,
        retryAttempts: result.retryAttempt,
        performanceMetrics: result.performanceMetrics
      });
    }

    // Analyze errors
    const errorCount = executionState.failedSteps.length;
    const criticalErrors = Array.from(executionState.stepResults.values())
      .filter(result => result.status === StepStatus.FAILED && result.error)
      .map(result => result.error!)
      .filter(error => error.toLowerCase().includes('critical') || error.toLowerCase().includes('fatal'));

    persistedState.results.errorAnalysis = {
      errorCount,
      criticalErrors,
      recoverableErrors: Array.from(executionState.stepResults.values())
        .filter(result => result.status === StepStatus.FAILED && result.error && !criticalErrors.includes(result.error))
        .map(result => result.error!),
      errorPatterns: new Map(),
      rootCauses: []
    };

    this.emit('results-finalized', workflowId, persistedState.results);
  }

  /**
   * Private: Update workflow analytics
   */
  private async updateWorkflowAnalytics(workflowId: string): Promise<void> {
    const persistedState = this.activeWorkflowStates.get(workflowId);
    if (!persistedState) return;

    const executionState = persistedState.state;
    const analytics = persistedState.analytics;

    // Update performance metrics
    const stepResults = Array.from(executionState.stepResults.values());
    const completedResults = stepResults.filter(r => r.status === StepStatus.COMPLETED);
    
    if (completedResults.length > 0) {
      const totalTime = completedResults.reduce((sum, r) => sum + r.executionTime, 0);
      analytics.performance.averageStepExecutionTime = totalTime / completedResults.length;
      
      const slowest = completedResults.reduce((max, r) => 
        r.executionTime > max.executionTime ? r : max);
      analytics.performance.slowestStep = { stepId: slowest.stepId, duration: slowest.executionTime };
      
      const fastest = completedResults.reduce((min, r) => 
        r.executionTime < min.executionTime ? r : min);
      analytics.performance.fastestStep = { stepId: fastest.stepId, duration: fastest.executionTime };
      
      const elapsedTime = (Date.now() - executionState.startTime.getTime()) / 1000 / 60; // minutes
      analytics.performance.throughput = completedResults.length / Math.max(elapsedTime, 0.1);
    }

    // Update reliability metrics
    const totalSteps = stepResults.length;
    if (totalSteps > 0) {
      analytics.reliability.overallSuccessRate = completedResults.length / totalSteps;
    }

    // Update resource usage (simplified - could be enhanced with actual monitoring)
    const memUsage = process.memoryUsage();
    analytics.resource.peakMemoryUsage = Math.max(analytics.resource.peakMemoryUsage, memUsage.heapUsed);
    analytics.resource.averageMemoryUsage = (analytics.resource.averageMemoryUsage + memUsage.heapUsed) / 2;

    // Update trends
    analytics.trends.executionTimeHistory.push(executionState.totalExecutionTime);
    analytics.trends.successRateHistory.push(analytics.reliability.overallSuccessRate);
    analytics.trends.errorRateHistory.push(executionState.failedSteps.length / Math.max(totalSteps, 1));
    analytics.trends.lastAnalyzed = new Date();

    // Keep only last 100 trend points
    if (analytics.trends.executionTimeHistory.length > 100) {
      analytics.trends.executionTimeHistory = analytics.trends.executionTimeHistory.slice(-100);
      analytics.trends.successRateHistory = analytics.trends.successRateHistory.slice(-100);
      analytics.trends.errorRateHistory = analytics.trends.errorRateHistory.slice(-100);
    }

    this.emit('analytics-updated', workflowId, analytics);
  }
}

/**
 * Global workflow state manager instance
 */
let globalWorkflowStateManager: WorkflowStateManager | null = null;

/**
 * Get the global workflow state manager instance
 */
export function getWorkflowStateManager(): WorkflowStateManager {
  if (!globalWorkflowStateManager) {
    globalWorkflowStateManager = new WorkflowStateManager();
  }
  return globalWorkflowStateManager;
}

/**
 * Initialize workflow state management
 */
export async function initializeWorkflowStateManagement(): Promise<WorkflowStateManager> {
  const manager = getWorkflowStateManager();
  await manager.initialize();
  console.log('📊 Comprehensive workflow state management system initialized');
  return manager;
}