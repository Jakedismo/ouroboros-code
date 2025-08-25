/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { getWorkflowMonitor, WorkflowMonitor, StepStatus } from './workflow-monitor.js';

/**
 * Apple Control command execution context
 */
export interface CommandExecutionContext {
  workflowId?: string; // Optional workflow ID if this command is part of a workflow
  stepId?: string; // Optional step ID if this command is part of a workflow step
  command: string; // e.g., "notes:create"
  parameters: Record<string, any>;
  timestamp: Date;
  userInput?: string; // Original user input that triggered this command
  executionMode: 'standalone' | 'workflow'; // Whether this is a standalone command or part of a workflow
}

/**
 * Command execution result
 */
export interface CommandExecutionResult {
  context: CommandExecutionContext;
  success: boolean;
  output: string;
  error?: string;
  executionTime: number; // milliseconds
  timestamp: Date;
  performanceMetrics?: {
    appleScriptExecutionTime?: number;
    memoryUsage?: number;
    cpuTime?: number;
  };
}

/**
 * Command execution tracker events
 */
export interface CommandExecutionTrackerEvents {
  'command-started': (context: CommandExecutionContext) => void;
  'command-completed': (result: CommandExecutionResult) => void;
  'command-failed': (result: CommandExecutionResult) => void;
  'workflow-command-executed': (workflowId: string, stepId: string, result: CommandExecutionResult) => void;
}

/**
 * Tracks Apple Control command execution and integrates with workflow monitoring
 */
export class CommandExecutionTracker extends EventEmitter {
  private monitor: WorkflowMonitor;
  private activeCommands = new Map<string, { context: CommandExecutionContext; startTime: Date }>();
  private executionHistory: CommandExecutionResult[] = [];
  private maxHistorySize = 1000;

  constructor() {
    super();
    this.monitor = getWorkflowMonitor();
    
    // Note: ProgressTracker integration will be added in future TUI implementation
  }

  /**
   * Track the start of an Apple Control command execution
   */
  trackCommandStart(context: CommandExecutionContext): void {
    const executionId = this.generateExecutionId(context);
    
    this.activeCommands.set(executionId, {
      context,
      startTime: new Date()
    });

    console.log(`🔄 Command started: ${context.command}`);
    if (context.workflowId && context.stepId) {
      console.log(`   📊 Workflow: ${context.workflowId}, Step: ${context.stepId}`);
      
      // Notify workflow monitor that step execution started
      this.monitor.startStepExecution(context.workflowId, context.stepId);
    }

    this.emit('command-started', context);
  }

  /**
   * Track the completion of an Apple Control command execution
   */
  trackCommandCompletion(
    context: CommandExecutionContext,
    success: boolean,
    output: string,
    error?: string,
    performanceMetrics?: any
  ): void {
    const executionId = this.generateExecutionId(context);
    const activeCommand = this.activeCommands.get(executionId);
    
    if (!activeCommand) {
      console.warn(`⚠️  No active command found for execution ID: ${executionId}`);
      return;
    }

    const endTime = new Date();
    const executionTime = endTime.getTime() - activeCommand.startTime.getTime();

    const result: CommandExecutionResult = {
      context,
      success,
      output,
      error,
      executionTime,
      timestamp: endTime,
      performanceMetrics
    };

    // Remove from active commands
    this.activeCommands.delete(executionId);

    // Add to history
    this.addToHistory(result);

    // Log completion
    if (success) {
      console.log(`✅ Command completed: ${context.command} (${executionTime}ms)`);
      this.emit('command-completed', result);
    } else {
      console.log(`❌ Command failed: ${context.command} (${executionTime}ms)`);
      if (error) {
        console.log(`   Error: ${error}`);
      }
      this.emit('command-failed', result);
    }

    // If this is part of a workflow, update workflow monitoring
    if (context.workflowId && context.stepId) {
      this.updateWorkflowStep(result);
      this.emit('workflow-command-executed', context.workflowId, context.stepId, result);
    }
  }

  /**
   * Get execution statistics
   */
  getExecutionStats(): any {
    const recent = this.executionHistory.slice(-100); // Last 100 executions
    const successful = recent.filter(r => r.success);
    const failed = recent.filter(r => !r.success);

    const totalExecutionTime = recent.reduce((sum, r) => sum + r.executionTime, 0);
    const averageExecutionTime = recent.length > 0 ? totalExecutionTime / recent.length : 0;

    // Group by command type
    const commandStats = new Map<string, { count: number; successCount: number; avgTime: number }>();
    
    recent.forEach(result => {
      const command = result.context.command;
      const existing = commandStats.get(command) || { count: 0, successCount: 0, avgTime: 0 };
      
      existing.count++;
      if (result.success) existing.successCount++;
      existing.avgTime = ((existing.avgTime * (existing.count - 1)) + result.executionTime) / existing.count;
      
      commandStats.set(command, existing);
    });

    return {
      total: recent.length,
      successful: successful.length,
      failed: failed.length,
      successRate: recent.length > 0 ? successful.length / recent.length : 0,
      averageExecutionTime,
      activeCommands: this.activeCommands.size,
      commandBreakdown: Object.fromEntries(commandStats.entries()),
      recentActivity: recent.slice(-10).map(r => ({
        command: r.context.command,
        success: r.success,
        executionTime: r.executionTime,
        timestamp: r.timestamp
      }))
    };
  }

  /**
   * Get active command executions
   */
  getActiveCommands(): Array<{ context: CommandExecutionContext; elapsedTime: number }> {
    const now = new Date();
    return Array.from(this.activeCommands.values()).map(active => ({
      context: active.context,
      elapsedTime: now.getTime() - active.startTime.getTime()
    }));
  }

  /**
   * Get recent command execution history
   */
  getExecutionHistory(limit: number = 50): CommandExecutionResult[] {
    return this.executionHistory
      .slice(-limit)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Generate execution report
   */
  generateExecutionReport(): string {
    const stats = this.getExecutionStats();
    
    let report = `🔧 COMMAND EXECUTION REPORT\n`;
    report += `═══════════════════════════════════\n\n`;
    
    report += `📊 OVERVIEW:\n`;
    report += `• Total Commands: ${stats.total}\n`;
    report += `• Successful: ${stats.successful}\n`;
    report += `• Failed: ${stats.failed}\n`;
    report += `• Success Rate: ${(stats.successRate * 100).toFixed(1)}%\n`;
    report += `• Average Execution Time: ${stats.averageExecutionTime.toFixed(0)}ms\n`;
    report += `• Active Commands: ${stats.activeCommands}\n\n`;
    
    if (Object.keys(stats.commandBreakdown).length > 0) {
      report += `📈 COMMAND BREAKDOWN:\n`;
      Object.entries(stats.commandBreakdown).forEach(([command, data]: [string, any]) => {
        const successRate = (data.successCount / data.count * 100).toFixed(0);
        report += `• ${command}: ${data.count} exec, ${successRate}% success, ${data.avgTime.toFixed(0)}ms avg\n`;
      });
      report += `\n`;
    }
    
    if (stats.recentActivity.length > 0) {
      report += `🕒 RECENT ACTIVITY:\n`;
      stats.recentActivity.forEach((activity: any) => {
        const status = activity.success ? '✅' : '❌';
        const time = new Date(activity.timestamp).toLocaleTimeString();
        report += `• ${status} ${activity.command} (${activity.executionTime}ms) at ${time}\n`;
      });
    }
    
    return report;
  }

  /**
   * Create workflow execution context for Apple Control commands
   */
  createWorkflowContext(
    workflowId: string,
    stepId: string,
    command: string,
    parameters: Record<string, any>,
    userInput?: string
  ): CommandExecutionContext {
    return {
      workflowId,
      stepId,
      command,
      parameters,
      timestamp: new Date(),
      userInput,
      executionMode: 'workflow'
    };
  }

  /**
   * Create standalone execution context for Apple Control commands
   */
  createStandaloneContext(
    command: string,
    parameters: Record<string, any>,
    userInput?: string
  ): CommandExecutionContext {
    return {
      command,
      parameters,
      timestamp: new Date(),
      userInput,
      executionMode: 'standalone'
    };
  }

  /**
   * Clear execution history
   */
  clearHistory(): void {
    this.executionHistory = [];
    console.log('🧹 Command execution history cleared');
  }

  /**
   * Private: Generate unique execution ID
   */
  private generateExecutionId(context: CommandExecutionContext): string {
    const timestamp = Date.now();
    const workflowPart = context.workflowId ? `${context.workflowId}-${context.stepId}` : 'standalone';
    return `${workflowPart}-${context.command}-${timestamp}`;
  }

  /**
   * Private: Add result to history with size management
   */
  private addToHistory(result: CommandExecutionResult): void {
    this.executionHistory.push(result);
    
    // Trim history if it exceeds max size
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory = this.executionHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Private: Update workflow step with execution result
   */
  private updateWorkflowStep(result: CommandExecutionResult): void {
    if (!result.context.workflowId || !result.context.stepId) return;

    const stepResult = {
      status: result.success ? StepStatus.COMPLETED : StepStatus.FAILED,
      startTime: new Date(result.timestamp.getTime() - result.executionTime),
      endTime: result.timestamp,
      executionTime: result.executionTime,
      output: result.output,
      error: result.error,
      retryAttempt: 0, // TODO: Implement retry logic
      performanceMetrics: result.performanceMetrics
    };

    this.monitor.completeStepExecution(
      result.context.workflowId,
      result.context.stepId,
      stepResult
    );
  }

  /**
   * Cleanup tracker
   */
  cleanup(): void {
    this.activeCommands.clear();
    console.log('🧹 Command execution tracker cleanup completed');
  }
}

/**
 * Global command execution tracker instance
 */
let globalCommandTracker: CommandExecutionTracker | null = null;

/**
 * Get the global command execution tracker instance
 */
export function getCommandExecutionTracker(): CommandExecutionTracker {
  if (!globalCommandTracker) {
    globalCommandTracker = new CommandExecutionTracker();
  }
  return globalCommandTracker;
}

/**
 * Initialize command execution tracking
 */
export async function initializeCommandTracking(): Promise<CommandExecutionTracker> {
  const tracker = getCommandExecutionTracker();
  
  // Setup event logging
  tracker.on('command-completed', (result) => {
    if (result.context.executionMode === 'workflow') {
      console.log(`📊 Workflow command completed: ${result.context.command}`);
    }
  });

  tracker.on('command-failed', (result) => {
    console.log(`⚠️  Command failed: ${result.context.command} - ${result.error}`);
  });

  tracker.on('workflow-command-executed', (workflowId, stepId, result) => {
    console.log(`🔗 Workflow step executed: ${stepId} in workflow ${workflowId}`);
  });

  console.log('🔧 Command execution tracking initialized');
  return tracker;
}

/**
 * Helper function to wrap Apple Control command execution with tracking
 */
export async function executeTrackedCommand<T>(
  context: CommandExecutionContext,
  commandFunction: () => Promise<T>
): Promise<T> {
  const tracker = getCommandExecutionTracker();
  
  // Start tracking
  tracker.trackCommandStart(context);
  
  const startTime = Date.now();
  let result: T;
  let error: Error | undefined;
  
  try {
    result = await commandFunction();
    
    // Track successful completion
    tracker.trackCommandCompletion(
      context,
      true,
      typeof result === 'string' ? result : JSON.stringify(result),
      undefined,
      { executionTime: Date.now() - startTime }
    );
    
    return result;
    
  } catch (err) {
    error = err instanceof Error ? err : new Error(String(err));
    
    // Track failed completion
    tracker.trackCommandCompletion(
      context,
      false,
      '',
      error.message,
      { executionTime: Date.now() - startTime }
    );
    
    throw error;
  }
}