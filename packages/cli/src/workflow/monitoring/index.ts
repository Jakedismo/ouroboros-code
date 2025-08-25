/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

// Core monitoring system
export {
  WorkflowMonitor,
  WorkflowStatus,
  StepStatus,
  WorkflowStep,
  StepExecutionResult,
  WorkflowDefinition,
  WorkflowExecutionState,
  WorkflowMonitorEvents,
  getWorkflowMonitor,
  initializeWorkflowMonitoring
} from './workflow-monitor.js';

// Progress tracking and visualization
export {
  ProgressTracker,
  ProgressFormat,
  ProgressUpdate,
  ProgressTrackerEvents,
  getProgressTracker,
  initializeProgressTracking
} from './progress-tracker.js';

// Command execution tracking
export {
  CommandExecutionTracker,
  CommandExecutionContext,
  CommandExecutionResult,
  CommandExecutionTrackerEvents,
  getCommandExecutionTracker,
  initializeCommandTracking,
  executeTrackedCommand
} from './command-execution-tracker.js';

/**
 * Initialize all workflow monitoring systems
 */
export async function initializeWorkflowMonitoringSystem(): Promise<{
  monitor: import('./workflow-monitor.js').WorkflowMonitor;
  progressTracker: import('./progress-tracker.js').ProgressTracker;
  commandTracker: import('./command-execution-tracker.js').CommandExecutionTracker;
}> {
  console.log('🚀 Initializing comprehensive workflow monitoring system...\n');
  
  // Import and initialize all monitoring components
  const { initializeWorkflowMonitoring } = await import('./workflow-monitor.js');
  const { initializeProgressTracking } = await import('./progress-tracker.js');
  const { initializeCommandTracking } = await import('./command-execution-tracker.js');
  
  const monitor = await initializeWorkflowMonitoring();
  const progressTracker = await initializeProgressTracking();
  const commandTracker = await initializeCommandTracking();
  
  console.log('\n✅ Workflow monitoring system fully initialized!');
  console.log('📊 Features available:');
  console.log('• Real-time workflow execution monitoring');
  console.log('• Step-by-step progress tracking with visualization');
  console.log('• Apple Control command execution tracking');
  console.log('• Performance metrics and alerts');
  console.log('• Milestone detection and reporting');
  console.log('• ASCII progress bars and emoji status indicators');
  console.log('• Comprehensive execution history and analytics\n');
  
  return {
    monitor,
    progressTracker,
    commandTracker
  };
}

/**
 * Cleanup all monitoring systems
 */
export async function cleanupWorkflowMonitoringSystem(): Promise<void> {
  try {
    const { getProgressTracker } = await import('./progress-tracker.js');
    const { getCommandExecutionTracker } = await import('./command-execution-tracker.js');
    
    const progressTracker = getProgressTracker();
    const commandTracker = getCommandExecutionTracker();
    
    progressTracker.cleanup();
    commandTracker.cleanup();
    
    console.log('🧹 Workflow monitoring system cleanup completed');
  } catch (error) {
    console.warn('⚠️  Error during workflow monitoring cleanup:', error);
  }
}