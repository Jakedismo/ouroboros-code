/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { getSessionManager } from './session-manager.js';
import { getWorkflowMonitor } from '../workflow/monitoring/workflow-monitor.js';
import { getCommandExecutionTracker } from '../workflow/monitoring/command-execution-tracker.js';
import { getProgressTracker } from '../workflow/monitoring/progress-tracker.js';
import { WorkflowStatus } from '../workflow/monitoring/workflow-monitor.js';
import { OuroborosSession } from './types.js';

/**
 * Integration events between session management and workflow systems
 */
export interface WorkflowSessionEvents {
  'workflow-session-started': (sessionId: string, workflowId: string) => void;
  'workflow-session-completed': (sessionId: string, workflowId: string, success: boolean) => void;
  'session-workflow-restored': (sessionId: string, restoredWorkflows: string[]) => void;
  'command-session-tracked': (sessionId: string, commandId: string) => void;
}

/**
 * Integration layer between session management and workflow monitoring
 */
export class WorkflowSessionIntegration extends EventEmitter {
  private sessionManager = getSessionManager();
  private workflowMonitor = getWorkflowMonitor();
  private commandTracker = getCommandExecutionTracker();
  private progressTracker = getProgressTracker();
  private isInitialized = false;

  /**
   * Initialize the integration system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Setup workflow monitor listeners
    this.setupWorkflowListeners();
    
    // Setup command tracker listeners
    this.setupCommandListeners();
    
    // Setup progress tracker listeners
    this.setupProgressListeners();
    
    // Setup session manager listeners
    this.setupSessionListeners();

    this.isInitialized = true;
    console.log('🔗 Workflow-Session integration initialized');
  }

  /**
   * Start workflow within session context
   */
  async startWorkflowInSession(workflowDefinition: any): Promise<string> {
    const session = this.sessionManager.getCurrentSession();
    if (!session) {
      throw new Error('No active session - start a session first');
    }

    // Generate workflow ID
    const workflowId = `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create workflow state for session tracking
    const workflowState = {
      workflowId,
      definition: workflowDefinition,
      status: WorkflowStatus.RUNNING,
      startTime: new Date(),
      totalExecutionTime: 0,
      currentStepIndex: 0,
      completedSteps: [],
      failedSteps: [],
      progress: {
        percentage: 0,
        stepsCompleted: 0,
        stepsTotal: workflowDefinition.steps.length,
        estimatedTimeRemaining: 0
      },
      stepResults: new Map(),
      performanceMetrics: {
        averageStepTime: 0,
        totalRetries: 0,
        successRate: 1.0
      }
    };

    // Update session with active workflow
    session.activeWorkflows.push(workflowState);

    // Record workflow milestone in session
    this.sessionManager.recordWorkflowMilestone(workflowId, 'workflow_started');
    
    // Emit integration event
    this.emit('workflow-session-started', session.id, workflowId);

    console.log(`🔄 Started workflow ${workflowId} in session ${session.id.substring(0, 8)}`);
    return workflowId;
  }

  /**
   * Execute command within session context
   */
  async executeCommandInSession(commandType: string, args: any): Promise<any> {
    const session = this.sessionManager.getCurrentSession();
    if (!session) {
      throw new Error('No active session - start a session first');
    }

    // Record command activity
    this.sessionManager.recordCommand();

    // Generate command ID for tracking
    const commandId = `command_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Execute the actual command (this would be handled by the command system)
      const result = await this.executeCommand(commandType, args);
      
      // Update session statistics
      session.statistics.commandsExecuted++;
      session.lastActive = new Date();

      // Add to command history
      session.commandHistory.push({
        context: {
          command: commandType,
          parameters: args,
          timestamp: new Date(),
          executionMode: 'standalone'
        },
        success: true,
        output: JSON.stringify(result),
        executionTime: 1000, // Default execution time
        timestamp: new Date()
      });

      // Emit integration event
      this.emit('command-session-tracked', session.id, commandId);

      return result;

    } catch (error) {
      // Update session error statistics
      session.statistics.errorsEncountered++;

      // Add to command history
      session.commandHistory.push({
        context: {
          command: commandType,
          parameters: args,
          timestamp: new Date(),
          executionMode: 'standalone'
        },
        success: false,
        output: '',
        error: (error as Error).message,
        executionTime: 1000, // Default execution time
        timestamp: new Date()
      });

      // Record error for recovery checkpointing
      this.sessionManager.recordError(error as Error, `Command: ${commandType}`);

      throw error;
    }
  }

  /**
   * Restore workflows from recovered session
   */
  async restoreWorkflowsFromSession(session: OuroborosSession): Promise<void> {
    const restoredWorkflows: string[] = [];

    for (const workflowState of session.activeWorkflows) {
      try {
        // Validate workflow can still be restored
        if (await this.validateWorkflowRestoration(workflowState)) {
          // Resume progress tracking (simplified)
          this.progressTracker.startTracking(workflowState.workflowId);
          
          restoredWorkflows.push(workflowState.workflowId);
          
          console.log(`✅ Restored workflow: ${workflowState.workflowId}`);
        } else {
          // Move to failed workflows
          session.failedWorkflows.push({
            workflowId: workflowState.workflowId,
            error: 'Workflow restoration failed - environment changed',
            timestamp: new Date()
          });
          
          console.log(`⚠️  Could not restore workflow: ${workflowState.workflowId}`);
        }
      } catch (error) {
        console.error(`❌ Error restoring workflow ${workflowState.workflowId}:`, error);
        
        session.failedWorkflows.push({
          workflowId: workflowState.workflowId,
          error: (error as Error).message,
          timestamp: new Date()
        });
      }
    }

    // Update session active workflows to only include successfully restored ones
    session.activeWorkflows = session.activeWorkflows.filter(w => 
      restoredWorkflows.includes(w.workflowId)
    );

    if (restoredWorkflows.length > 0) {
      this.emit('session-workflow-restored', session.id, restoredWorkflows);
      console.log(`🔄 Restored ${restoredWorkflows.length} workflows in session ${session.id.substring(0, 8)}`);
    }
  }

  /**
   * Sync session state with current workflow and command state
   */
  async syncSessionState(): Promise<void> {
    const session = this.sessionManager.getCurrentSession();
    if (!session) {
      return;
    }

    // Update workflow states
    for (const workflowState of session.activeWorkflows) {
      const currentState = this.workflowMonitor.getWorkflowState(workflowState.workflowId);
      if (currentState) {
        // Update workflow state in session
        Object.assign(workflowState, currentState);
        
        // Check if workflow completed or failed
        if (currentState.status === WorkflowStatus.COMPLETED) {
          this.moveWorkflowToCompleted(session, workflowState.workflowId);
        } else if (currentState.status === WorkflowStatus.FAILED) {
          this.moveWorkflowToFailed(session, workflowState.workflowId, 'Workflow execution failed');
        }
      }
    }

    // Command history is already maintained in session.commandHistory
    // Keep only last 50 commands to manage memory
    if (session.commandHistory.length > 50) {
      session.commandHistory = session.commandHistory.slice(-50);
    }

    // Update session statistics
    this.updateSessionStatistics(session);

    console.log(`🔄 Synced session state: ${session.activeWorkflows.length} active workflows`);
  }

  /**
   * Get session workflow summary
   */
  getSessionWorkflowSummary(): {
    activeWorkflows: number;
    completedWorkflows: number;
    failedWorkflows: number;
    totalCommands: number;
    recentCommands: number;
    sessionUptime: number;
  } {
    const session = this.sessionManager.getCurrentSession();
    if (!session) {
      return {
        activeWorkflows: 0,
        completedWorkflows: 0,
        failedWorkflows: 0,
        totalCommands: 0,
        recentCommands: 0,
        sessionUptime: 0
      };
    }

    const sessionUptime = Date.now() - session.created.getTime();
    const recentCommands = session.commandHistory.slice(-10).length;

    return {
      activeWorkflows: session.activeWorkflows.length,
      completedWorkflows: session.completedWorkflows.length,
      failedWorkflows: session.failedWorkflows.length,
      totalCommands: session.statistics.commandsExecuted,
      recentCommands,
      sessionUptime
    };
  }

  /**
   * Private: Setup workflow monitor listeners
   */
  private setupWorkflowListeners(): void {
    this.workflowMonitor.on('workflow-started', (state) => {
      this.sessionManager.recordWorkflowMilestone(state.workflowId, 'started');
    });

    this.workflowMonitor.on('workflow-completed', (state) => {
      const session = this.sessionManager.getCurrentSession();
      if (session) {
        this.moveWorkflowToCompleted(session, state.workflowId);
        this.sessionManager.recordWorkflowMilestone(state.workflowId, 'completed');
        this.emit('workflow-session-completed', session.id, state.workflowId, true);
      }
    });

    this.workflowMonitor.on('workflow-failed', (state) => {
      const session = this.sessionManager.getCurrentSession();
      if (session) {
        this.moveWorkflowToFailed(session, state.workflowId, 'Workflow execution failed');
        this.sessionManager.recordWorkflowMilestone(state.workflowId, 'failed');
        this.emit('workflow-session-completed', session.id, state.workflowId, false);
      }
    });

    this.workflowMonitor.on('step-started', (stepId, state) => {
      this.sessionManager.recordActivity();
    });

    this.workflowMonitor.on('step-completed', (stepId, result, state) => {
      this.sessionManager.recordActivity();
    });

    this.workflowMonitor.on('step-failed', (stepId, result, state) => {
      this.sessionManager.recordActivity();
      if (result.error) {
        this.sessionManager.recordError(result.error, `Step: ${stepId}`);
      }
    });
  }

  /**
   * Private: Setup command tracker listeners
   */
  private setupCommandListeners(): void {
    this.commandTracker.on('command-started', (commandId, command) => {
      this.sessionManager.recordCommand();
    });

    this.commandTracker.on('command-completed', (commandId, result) => {
      this.sessionManager.recordActivity();
    });

    this.commandTracker.on('command-failed', (commandId, error) => {
      this.sessionManager.recordError(error, `Command: ${commandId}`);
    });
  }

  /**
   * Private: Setup progress tracker listeners
   */
  private setupProgressListeners(): void {
    this.progressTracker.on('milestone-reached', (workflowId, milestone) => {
      this.sessionManager.recordWorkflowMilestone(workflowId, milestone);
    });

    this.progressTracker.on('performance-alert', (workflowId, metric, value, threshold) => {
      console.log(`⚠️  Performance alert in session: ${metric} = ${value} (threshold: ${threshold})`);
    });
  }

  /**
   * Private: Setup session manager listeners
   */
  private setupSessionListeners(): void {
    this.sessionManager.on('session-created', (session) => {
      console.log(`🔗 Session-workflow integration active for session: ${session.id.substring(0, 8)}`);
    });

    this.sessionManager.on('session-restored', (session) => {
      // Restore workflows if they exist
      if (session.activeWorkflows.length > 0) {
        this.restoreWorkflowsFromSession(session);
      }
    });

    this.sessionManager.on('session-ended', (session) => {
      // Clean up any active workflows (simplified)
      console.log(`🔗 Cleaned up ${session.activeWorkflows.length} workflows for ended session: ${session.id.substring(0, 8)}`);
    });
  }

  /**
   * Private: Move workflow from active to completed
   */
  private moveWorkflowToCompleted(session: OuroborosSession, workflowId: string): void {
    const activeIndex = session.activeWorkflows.findIndex(w => w.workflowId === workflowId);
    if (activeIndex !== -1) {
      session.activeWorkflows.splice(activeIndex, 1);
      if (!session.completedWorkflows.includes(workflowId)) {
        session.completedWorkflows.push(workflowId);
        session.statistics.workflowsCompleted++;
      }
    }
  }

  /**
   * Private: Move workflow from active to failed
   */
  private moveWorkflowToFailed(session: OuroborosSession, workflowId: string, error: string): void {
    const activeIndex = session.activeWorkflows.findIndex(w => w.workflowId === workflowId);
    if (activeIndex !== -1) {
      session.activeWorkflows.splice(activeIndex, 1);
      
      const existingFailedIndex = session.failedWorkflows.findIndex(f => f.workflowId === workflowId);
      if (existingFailedIndex === -1) {
        session.failedWorkflows.push({
          workflowId,
          error,
          timestamp: new Date()
        });
      }
    }
  }

  /**
   * Private: Update session statistics
   */
  private updateSessionStatistics(session: OuroborosSession): void {
    const commandHistory = session.commandHistory;
    
    if (commandHistory.length > 0) {
      // Calculate average command time for completed commands
      const completedCommands = commandHistory.filter(cmd => cmd.success);
      if (completedCommands.length > 0) {
        const totalTime = completedCommands.reduce((sum, cmd) => {
          const duration = cmd.executionTime || 1000; // Use actual execution time
          return sum + duration;
        }, 0);
        session.statistics.averageCommandTime = totalTime / completedCommands.length;
      }
    }

    // Update productivity score based on success rates
    const totalWorkflows = session.completedWorkflows.length + session.failedWorkflows.length;
    if (totalWorkflows > 0) {
      const successRate = session.completedWorkflows.length / totalWorkflows;
      const errorRate = session.statistics.errorsEncountered / Math.max(session.statistics.commandsExecuted, 1);
      session.statistics.productivityScore = Math.max(0, successRate - (errorRate * 0.5));
    }

    // Update session duration
    session.totalDuration = Date.now() - session.created.getTime();
  }

  /**
   * Private: Validate workflow restoration
   */
  private async validateWorkflowRestoration(workflowState: any): Promise<boolean> {
    try {
      // Check if workflow definition is still valid
      if (!workflowState.definition || !workflowState.definition.steps) {
        return false;
      }

      // Check if required tools/commands are still available
      if (workflowState.definition.steps) {
        for (const step of workflowState.definition.steps) {
          if (step.type === 'apple-control' && !this.isAppleControlAvailable()) {
            return false;
          }
        }
      }

      // Check if the workflow wasn't already completed or failed
      if (workflowState.status === WorkflowStatus.COMPLETED || workflowState.status === WorkflowStatus.FAILED) {
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error validating workflow restoration:', error);
      return false;
    }
  }

  /**
   * Private: Check if Apple Control is available
   */
  private isAppleControlAvailable(): boolean {
    // Simple check for macOS platform
    return process.platform === 'darwin';
  }

  /**
   * Private: Execute command (placeholder for actual command execution)
   */
  private async executeCommand(commandType: string, args: any): Promise<any> {
    // This would interface with the actual command execution system
    // For now, just return a mock result
    return {
      type: commandType,
      args,
      success: true,
      timestamp: new Date()
    };
  }
}

/**
 * Global workflow-session integration instance
 */
let globalWorkflowSessionIntegration: WorkflowSessionIntegration | null = null;

/**
 * Get the global workflow-session integration instance
 */
export function getWorkflowSessionIntegration(): WorkflowSessionIntegration {
  if (!globalWorkflowSessionIntegration) {
    globalWorkflowSessionIntegration = new WorkflowSessionIntegration();
  }
  return globalWorkflowSessionIntegration;
}

/**
 * Initialize workflow-session integration
 */
export async function initializeWorkflowSessionIntegration(): Promise<WorkflowSessionIntegration> {
  const integration = getWorkflowSessionIntegration();
  await integration.initialize();
  console.log('🔗 Workflow-Session integration system initialized');
  return integration;
}