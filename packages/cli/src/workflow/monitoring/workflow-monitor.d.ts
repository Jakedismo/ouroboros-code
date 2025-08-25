/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { EventEmitter } from 'events';
/**
 * Workflow execution status
 */
export declare enum WorkflowStatus {
    PLANNED = "planned",
    RUNNING = "running",
    PAUSED = "paused",
    COMPLETED = "completed",
    FAILED = "failed",
    CANCELLED = "cancelled"
}
/**
 * Individual workflow step status
 */
export declare enum StepStatus {
    PENDING = "pending",
    RUNNING = "running",
    COMPLETED = "completed",
    FAILED = "failed",
    SKIPPED = "skipped"
}
/**
 * Workflow step definition
 */
export interface WorkflowStep {
    id: string;
    name: string;
    description: string;
    command: string;
    parameters: Record<string, any>;
    estimatedDuration: number;
    dependencies?: string[];
    parallel?: boolean;
    retryCount?: number;
    timeout?: number;
}
/**
 * Workflow step execution result
 */
export interface StepExecutionResult {
    stepId: string;
    status: StepStatus;
    startTime: Date;
    endTime?: Date;
    executionTime: number;
    output?: string;
    error?: string;
    retryAttempt: number;
    performanceMetrics?: {
        cpuUsage?: number;
        memoryUsage?: number;
        networkRequests?: number;
    };
}
/**
 * Complete workflow definition
 */
export interface WorkflowDefinition {
    id: string;
    name: string;
    description: string;
    version: string;
    created: Date;
    steps: WorkflowStep[];
    metadata: {
        userRequest: string;
        estimatedTotalDuration: number;
        requiredPermissions: string[];
        category: 'email' | 'notes' | 'calendar' | 'terminal' | 'docker' | 'system' | 'mixed';
        complexity: 'simple' | 'moderate' | 'complex';
        executionMode: 'sequential' | 'parallel' | 'conditional';
    };
    asciiDiagram?: string;
}
/**
 * Workflow execution state
 */
export interface WorkflowExecutionState {
    workflowId: string;
    definition: WorkflowDefinition;
    status: WorkflowStatus;
    startTime: Date;
    endTime?: Date;
    totalExecutionTime: number;
    currentStepIndex: number;
    completedSteps: string[];
    failedSteps: string[];
    stepResults: Map<string, StepExecutionResult>;
    progress: {
        percentage: number;
        stepsCompleted: number;
        stepsTotal: number;
        estimatedTimeRemaining: number;
    };
    errorSummary?: {
        totalErrors: number;
        criticalErrors: string[];
        recoverableErrors: string[];
    };
    performanceMetrics: {
        averageStepTime: number;
        totalRetries: number;
        successRate: number;
    };
}
/**
 * Workflow monitor events
 */
export interface WorkflowMonitorEvents {
    'workflow-started': (executionState: WorkflowExecutionState) => void;
    'workflow-completed': (executionState: WorkflowExecutionState) => void;
    'workflow-failed': (executionState: WorkflowExecutionState, error: string) => void;
    'workflow-paused': (executionState: WorkflowExecutionState) => void;
    'workflow-cancelled': (executionState: WorkflowExecutionState) => void;
    'step-started': (stepId: string, executionState: WorkflowExecutionState) => void;
    'step-completed': (stepId: string, result: StepExecutionResult, executionState: WorkflowExecutionState) => void;
    'step-failed': (stepId: string, result: StepExecutionResult, executionState: WorkflowExecutionState) => void;
    'progress-updated': (executionState: WorkflowExecutionState) => void;
    'error-occurred': (error: string, stepId: string, executionState: WorkflowExecutionState) => void;
}
/**
 * Comprehensive workflow execution monitoring system
 */
export declare class WorkflowMonitor extends EventEmitter {
    private activeWorkflows;
    private executionHistory;
    private performanceMetrics;
    private monitoringEnabled;
    constructor();
    /**
     * Start monitoring a new workflow
     */
    startWorkflowMonitoring(definition: WorkflowDefinition): Promise<WorkflowExecutionState>;
    /**
     * Update workflow status
     */
    updateWorkflowStatus(workflowId: string, status: WorkflowStatus): void;
    /**
     * Start monitoring a workflow step
     */
    startStepExecution(workflowId: string, stepId: string): void;
    /**
     * Record step execution completion
     */
    completeStepExecution(workflowId: string, stepId: string, result: Omit<StepExecutionResult, 'stepId'>): void;
    /**
     * Get current workflow execution state
     */
    getWorkflowState(workflowId: string): WorkflowExecutionState | undefined;
    /**
     * Get all active workflows
     */
    getActiveWorkflows(): WorkflowExecutionState[];
    /**
     * Get workflow execution history
     */
    getExecutionHistory(limit?: number): WorkflowExecutionState[];
    /**
     * Get comprehensive monitoring statistics
     */
    getMonitoringStats(): any;
    /**
     * Pause workflow monitoring
     */
    pauseWorkflowMonitoring(workflowId: string): void;
    /**
     * Cancel workflow monitoring
     */
    cancelWorkflowMonitoring(workflowId: string): void;
    /**
     * Enable/disable monitoring
     */
    setMonitoringEnabled(enabled: boolean): void;
    /**
     * Private: Update workflow progress
     */
    private updateProgress;
    /**
     * Private: Update performance metrics
     */
    private updatePerformanceMetrics;
    /**
     * Private: Setup performance tracking
     */
    private setupPerformanceTracking;
    /**
     * Generate monitoring report
     */
    generateMonitoringReport(): string;
}
/**
 * Get the global workflow monitor instance
 */
export declare function getWorkflowMonitor(): WorkflowMonitor;
/**
 * Initialize workflow monitoring
 */
export declare function initializeWorkflowMonitoring(): Promise<WorkflowMonitor>;
