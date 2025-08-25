/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { EventEmitter } from 'events';
import { WorkflowStatus, StepStatus } from './workflow-monitor.js';
/**
 * Progress visualization format
 */
export declare enum ProgressFormat {
    ASCII_BAR = "ascii_bar",
    EMOJI_ICONS = "emoji_icons",
    TEXT_SUMMARY = "text_summary",
    DETAILED_REPORT = "detailed_report"
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
        progress: number;
    };
    overall: {
        percentage: number;
        stepsCompleted: number;
        stepsTotal: number;
        elapsedTime: number;
        estimatedTimeRemaining: number;
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
export declare class ProgressTracker extends EventEmitter {
    private monitor;
    private trackedWorkflows;
    private updateIntervals;
    private performanceThresholds;
    constructor();
    /**
     * Start tracking progress for a workflow
     */
    startTracking(workflowId: string, updateInterval?: number): void;
    /**
     * Stop tracking progress for a workflow
     */
    stopTracking(workflowId: string): void;
    /**
     * Get current progress for a workflow
     */
    getProgress(workflowId: string): ProgressUpdate | undefined;
    /**
     * Get progress for all tracked workflows
     */
    getAllProgress(): ProgressUpdate[];
    /**
     * Generate progress visualization
     */
    generateProgressVisualization(workflowId: string, format?: ProgressFormat): string;
    /**
     * Generate live progress dashboard for all workflows
     */
    generateProgressDashboard(): string;
    /**
     * Private: Setup monitor event listeners
     */
    private setupMonitorListeners;
    /**
     * Private: Update progress for a workflow
     */
    private updateProgress;
    /**
     * Private: Check for milestones
     */
    private checkMilestones;
    /**
     * Private: Check performance alerts
     */
    private checkPerformanceAlerts;
    /**
     * Private: Create ASCII progress bar
     */
    private createProgressBar;
    /**
     * Private: Get status emoji
     */
    private getStatusEmoji;
    /**
     * Private: Format time display
     */
    private formatTimeDisplay;
    /**
     * Private: Generate ASCII progress bar visualization
     */
    private generateAsciiProgressBar;
    /**
     * Private: Generate emoji progress visualization
     */
    private generateEmojiProgress;
    /**
     * Private: Generate text summary
     */
    private generateTextSummary;
    /**
     * Private: Generate detailed report
     */
    private generateDetailedReport;
    /**
     * Cleanup and stop all tracking
     */
    cleanup(): void;
}
/**
 * Get the global progress tracker instance
 */
export declare function getProgressTracker(): ProgressTracker;
/**
 * Initialize progress tracking
 */
export declare function initializeProgressTracking(): Promise<ProgressTracker>;
