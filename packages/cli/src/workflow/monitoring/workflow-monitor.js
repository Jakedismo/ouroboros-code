/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { EventEmitter } from 'events';
/**
 * Workflow execution status
 */
export var WorkflowStatus;
(function (WorkflowStatus) {
    WorkflowStatus["PLANNED"] = "planned";
    WorkflowStatus["RUNNING"] = "running";
    WorkflowStatus["PAUSED"] = "paused";
    WorkflowStatus["COMPLETED"] = "completed";
    WorkflowStatus["FAILED"] = "failed";
    WorkflowStatus["CANCELLED"] = "cancelled";
})(WorkflowStatus || (WorkflowStatus = {}));
/**
 * Individual workflow step status
 */
export var StepStatus;
(function (StepStatus) {
    StepStatus["PENDING"] = "pending";
    StepStatus["RUNNING"] = "running";
    StepStatus["COMPLETED"] = "completed";
    StepStatus["FAILED"] = "failed";
    StepStatus["SKIPPED"] = "skipped";
})(StepStatus || (StepStatus = {}));
/**
 * Comprehensive workflow execution monitoring system
 */
export class WorkflowMonitor extends EventEmitter {
    activeWorkflows = new Map();
    executionHistory = new Map();
    performanceMetrics = new Map();
    monitoringEnabled = true;
    constructor() {
        super();
        this.setupPerformanceTracking();
    }
    /**
     * Start monitoring a new workflow
     */
    async startWorkflowMonitoring(definition) {
        const executionState = {
            workflowId: definition.id,
            definition,
            status: WorkflowStatus.PLANNED,
            startTime: new Date(),
            totalExecutionTime: 0,
            currentStepIndex: 0,
            completedSteps: [],
            failedSteps: [],
            stepResults: new Map(),
            progress: {
                percentage: 0,
                stepsCompleted: 0,
                stepsTotal: definition.steps.length,
                estimatedTimeRemaining: definition.metadata.estimatedTotalDuration
            },
            performanceMetrics: {
                averageStepTime: 0,
                totalRetries: 0,
                successRate: 1.0
            }
        };
        this.activeWorkflows.set(definition.id, executionState);
        console.log(`📊 Workflow Monitor: Started monitoring workflow "${definition.name}"`);
        console.log(`📈 Steps: ${definition.steps.length}, Estimated duration: ${definition.metadata.estimatedTotalDuration}ms`);
        this.emit('workflow-started', executionState);
        return executionState;
    }
    /**
     * Update workflow status
     */
    updateWorkflowStatus(workflowId, status) {
        const executionState = this.activeWorkflows.get(workflowId);
        if (!executionState) {
            console.warn(`⚠️  Workflow ${workflowId} not found for status update`);
            return;
        }
        executionState.status = status;
        if (status === WorkflowStatus.COMPLETED) {
            executionState.endTime = new Date();
            executionState.totalExecutionTime = executionState.endTime.getTime() - executionState.startTime.getTime();
            executionState.progress.percentage = 100;
            executionState.progress.estimatedTimeRemaining = 0;
            // Move to history
            this.executionHistory.set(workflowId, executionState);
            this.activeWorkflows.delete(workflowId);
            console.log(`✅ Workflow "${executionState.definition.name}" completed in ${executionState.totalExecutionTime}ms`);
            this.emit('workflow-completed', executionState);
        }
        else if (status === WorkflowStatus.FAILED) {
            executionState.endTime = new Date();
            executionState.totalExecutionTime = executionState.endTime.getTime() - executionState.startTime.getTime();
            // Move to history
            this.executionHistory.set(workflowId, executionState);
            this.activeWorkflows.delete(workflowId);
            console.log(`❌ Workflow "${executionState.definition.name}" failed after ${executionState.totalExecutionTime}ms`);
            this.emit('workflow-failed', executionState, 'Workflow execution failed');
        }
        else if (status === WorkflowStatus.RUNNING) {
            console.log(`🔄 Workflow "${executionState.definition.name}" is now running`);
        }
        else if (status === WorkflowStatus.PAUSED) {
            console.log(`⏸️  Workflow "${executionState.definition.name}" paused`);
            this.emit('workflow-paused', executionState);
        }
        else if (status === WorkflowStatus.CANCELLED) {
            executionState.endTime = new Date();
            executionState.totalExecutionTime = executionState.endTime.getTime() - executionState.startTime.getTime();
            // Move to history
            this.executionHistory.set(workflowId, executionState);
            this.activeWorkflows.delete(workflowId);
            console.log(`🚫 Workflow "${executionState.definition.name}" cancelled`);
            this.emit('workflow-cancelled', executionState);
        }
        this.updateProgress(workflowId);
    }
    /**
     * Start monitoring a workflow step
     */
    startStepExecution(workflowId, stepId) {
        const executionState = this.activeWorkflows.get(workflowId);
        if (!executionState) {
            console.warn(`⚠️  Workflow ${workflowId} not found for step start`);
            return;
        }
        const step = executionState.definition.steps.find(s => s.id === stepId);
        if (!step) {
            console.warn(`⚠️  Step ${stepId} not found in workflow ${workflowId}`);
            return;
        }
        console.log(`🔄 Step started: ${step.name} (${stepId})`);
        console.log(`📝 Command: ${step.command}`);
        this.emit('step-started', stepId, executionState);
        this.updateProgress(workflowId);
    }
    /**
     * Record step execution completion
     */
    completeStepExecution(workflowId, stepId, result) {
        const executionState = this.activeWorkflows.get(workflowId);
        if (!executionState) {
            console.warn(`⚠️  Workflow ${workflowId} not found for step completion`);
            return;
        }
        const stepResult = {
            stepId,
            ...result
        };
        executionState.stepResults.set(stepId, stepResult);
        if (result.status === StepStatus.COMPLETED) {
            executionState.completedSteps.push(stepId);
            executionState.currentStepIndex++;
            console.log(`✅ Step completed: ${stepId} (${result.executionTime}ms)`);
            if (result.output) {
                console.log(`📄 Output: ${result.output.substring(0, 100)}${result.output.length > 100 ? '...' : ''}`);
            }
            this.emit('step-completed', stepId, stepResult, executionState);
        }
        else if (result.status === StepStatus.FAILED) {
            executionState.failedSteps.push(stepId);
            console.log(`❌ Step failed: ${stepId} (${result.executionTime}ms)`);
            if (result.error) {
                console.log(`🔴 Error: ${result.error}`);
            }
            this.emit('step-failed', stepId, stepResult, executionState);
            this.emit('error-occurred', result.error || 'Unknown error', stepId, executionState);
        }
        // Update performance metrics
        this.updatePerformanceMetrics(executionState);
        this.updateProgress(workflowId);
    }
    /**
     * Get current workflow execution state
     */
    getWorkflowState(workflowId) {
        return this.activeWorkflows.get(workflowId) || this.executionHistory.get(workflowId);
    }
    /**
     * Get all active workflows
     */
    getActiveWorkflows() {
        return Array.from(this.activeWorkflows.values());
    }
    /**
     * Get workflow execution history
     */
    getExecutionHistory(limit = 50) {
        return Array.from(this.executionHistory.values())
            .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
            .slice(0, limit);
    }
    /**
     * Get comprehensive monitoring statistics
     */
    getMonitoringStats() {
        const activeCount = this.activeWorkflows.size;
        const historyCount = this.executionHistory.size;
        const completedWorkflows = Array.from(this.executionHistory.values())
            .filter(w => w.status === WorkflowStatus.COMPLETED);
        const failedWorkflows = Array.from(this.executionHistory.values())
            .filter(w => w.status === WorkflowStatus.FAILED);
        const totalExecutionTime = completedWorkflows.reduce((sum, w) => sum + w.totalExecutionTime, 0);
        const averageExecutionTime = completedWorkflows.length > 0 ? totalExecutionTime / completedWorkflows.length : 0;
        return {
            active: activeCount,
            completed: completedWorkflows.length,
            failed: failedWorkflows.length,
            total: historyCount,
            successRate: historyCount > 0 ? completedWorkflows.length / historyCount : 0,
            averageExecutionTime,
            monitoring: {
                enabled: this.monitoringEnabled,
                uptime: process.uptime(),
                memoryUsage: process.memoryUsage()
            }
        };
    }
    /**
     * Pause workflow monitoring
     */
    pauseWorkflowMonitoring(workflowId) {
        this.updateWorkflowStatus(workflowId, WorkflowStatus.PAUSED);
    }
    /**
     * Cancel workflow monitoring
     */
    cancelWorkflowMonitoring(workflowId) {
        this.updateWorkflowStatus(workflowId, WorkflowStatus.CANCELLED);
    }
    /**
     * Enable/disable monitoring
     */
    setMonitoringEnabled(enabled) {
        this.monitoringEnabled = enabled;
        console.log(`📊 Workflow monitoring ${enabled ? 'enabled' : 'disabled'}`);
    }
    /**
     * Private: Update workflow progress
     */
    updateProgress(workflowId) {
        const executionState = this.activeWorkflows.get(workflowId);
        if (!executionState)
            return;
        const totalSteps = executionState.definition.steps.length;
        const completedSteps = executionState.completedSteps.length;
        executionState.progress.percentage = Math.round((completedSteps / totalSteps) * 100);
        executionState.progress.stepsCompleted = completedSteps;
        // Estimate remaining time based on completed steps
        if (completedSteps > 0) {
            const elapsedTime = Date.now() - executionState.startTime.getTime();
            const averageTimePerStep = elapsedTime / completedSteps;
            const remainingSteps = totalSteps - completedSteps;
            executionState.progress.estimatedTimeRemaining = Math.round(remainingSteps * averageTimePerStep);
        }
        this.emit('progress-updated', executionState);
    }
    /**
     * Private: Update performance metrics
     */
    updatePerformanceMetrics(executionState) {
        const completedSteps = Array.from(executionState.stepResults.values())
            .filter(result => result.status === StepStatus.COMPLETED);
        const failedSteps = Array.from(executionState.stepResults.values())
            .filter(result => result.status === StepStatus.FAILED);
        const totalRetries = Array.from(executionState.stepResults.values())
            .reduce((sum, result) => sum + result.retryAttempt, 0);
        const totalExecutionTime = completedSteps.reduce((sum, result) => sum + result.executionTime, 0);
        const averageStepTime = completedSteps.length > 0 ? totalExecutionTime / completedSteps.length : 0;
        const totalSteps = completedSteps.length + failedSteps.length;
        const successRate = totalSteps > 0 ? completedSteps.length / totalSteps : 1.0;
        executionState.performanceMetrics = {
            averageStepTime,
            totalRetries,
            successRate
        };
    }
    /**
     * Private: Setup performance tracking
     */
    setupPerformanceTracking() {
        // Monitor system performance every 5 seconds
        const performanceInterval = setInterval(() => {
            if (!this.monitoringEnabled)
                return;
            const stats = {
                timestamp: new Date(),
                memoryUsage: process.memoryUsage(),
                cpuUsage: process.cpuUsage(),
                activeWorkflows: this.activeWorkflows.size,
                uptime: process.uptime()
            };
            this.performanceMetrics.set(`perf-${Date.now()}`, stats);
            // Keep only last 100 performance measurements
            if (this.performanceMetrics.size > 100) {
                const oldestKey = this.performanceMetrics.keys().next().value;
                if (oldestKey !== undefined) {
                    this.performanceMetrics.delete(oldestKey);
                }
            }
        }, 5000);
        // Cleanup on process exit
        process.on('exit', () => {
            clearInterval(performanceInterval);
        });
    }
    /**
     * Generate monitoring report
     */
    generateMonitoringReport() {
        const stats = this.getMonitoringStats();
        const active = this.getActiveWorkflows();
        let report = `📊 WORKFLOW MONITORING REPORT\n`;
        report += `═══════════════════════════════════\n\n`;
        report += `📈 OVERVIEW:\n`;
        report += `• Active Workflows: ${stats.active}\n`;
        report += `• Completed: ${stats.completed}\n`;
        report += `• Failed: ${stats.failed}\n`;
        report += `• Success Rate: ${(stats.successRate * 100).toFixed(1)}%\n`;
        report += `• Average Execution Time: ${(stats.averageExecutionTime / 1000).toFixed(1)}s\n\n`;
        if (active.length > 0) {
            report += `🔄 ACTIVE WORKFLOWS:\n`;
            active.forEach(workflow => {
                report += `• ${workflow.definition.name}: ${workflow.progress.percentage}% complete\n`;
                report += `  Steps: ${workflow.progress.stepsCompleted}/${workflow.progress.stepsTotal}\n`;
                report += `  Estimated remaining: ${(workflow.progress.estimatedTimeRemaining / 1000).toFixed(1)}s\n\n`;
            });
        }
        return report;
    }
}
/**
 * Global workflow monitor instance
 */
let globalWorkflowMonitor = null;
/**
 * Get the global workflow monitor instance
 */
export function getWorkflowMonitor() {
    if (!globalWorkflowMonitor) {
        globalWorkflowMonitor = new WorkflowMonitor();
    }
    return globalWorkflowMonitor;
}
/**
 * Initialize workflow monitoring
 */
export async function initializeWorkflowMonitoring() {
    const monitor = getWorkflowMonitor();
    // Setup event logging
    monitor.on('workflow-started', (state) => {
        console.log(`🚀 Workflow started: ${state.definition.name}`);
    });
    monitor.on('workflow-completed', (state) => {
        console.log(`✅ Workflow completed: ${state.definition.name} (${state.totalExecutionTime}ms)`);
    });
    monitor.on('workflow-failed', (state, error) => {
        console.log(`❌ Workflow failed: ${state.definition.name} - ${error}`);
    });
    monitor.on('progress-updated', (state) => {
        console.log(`📊 Progress: ${state.definition.name} - ${state.progress.percentage}% complete`);
    });
    console.log('📊 Workflow monitoring system initialized');
    return monitor;
}
//# sourceMappingURL=workflow-monitor.js.map