/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from 'react';
import {
  ProgressFormat,
  getProgressTracker,
  ProgressTracker,
  ProgressUpdate,
} from '../../workflow/monitoring/progress-tracker.js';
import { WorkflowStatus } from '../../workflow/monitoring/workflow-monitor.js';

/**
 * Workflow progress context state
 */
export interface WorkflowProgressState {
  // Display settings
  visible: boolean;
  format: ProgressFormat;
  compact: boolean;
  maxWorkflows: number;
  autoHideDelay: number;

  // Current progress data
  activeWorkflows: Map<string, ProgressUpdate>;
  completedWorkflowsCount: number;
  totalWorkflowsCount: number;

  // Statistics
  averageCompletionTime: number;
  overallSuccessRate: number;
  currentErrorCount: number;
}

/**
 * Workflow progress context actions
 */
export interface WorkflowProgressActions {
  // Display control
  showProgress: () => void;
  hideProgress: () => void;
  toggleVisibility: () => void;
  setProgressFormat: (format: ProgressFormat) => void;
  toggleCompactMode: () => void;
  setMaxWorkflows: (max: number) => void;
  setAutoHideDelay: (delay: number) => void;

  // Progress tracking control
  startTrackingWorkflow: (workflowId: string, updateInterval?: number) => void;
  stopTrackingWorkflow: (workflowId: string) => void;
  clearCompletedWorkflows: () => void;

  // Dashboard generation
  generateDashboard: () => string;
  generateWorkflowVisualization: (
    workflowId: string,
    format?: ProgressFormat,
  ) => string;
}

/**
 * Combined workflow progress context
 */
export type WorkflowProgressContextType = WorkflowProgressState &
  WorkflowProgressActions;

const WorkflowProgressContext = createContext<
  WorkflowProgressContextType | undefined
>(undefined);

/**
 * Default state values
 */
const defaultState: WorkflowProgressState = {
  visible: false,
  format: ProgressFormat.ASCII_BAR,
  compact: false,
  maxWorkflows: 5,
  autoHideDelay: 5000,
  activeWorkflows: new Map(),
  completedWorkflowsCount: 0,
  totalWorkflowsCount: 0,
  averageCompletionTime: 0,
  overallSuccessRate: 1.0,
  currentErrorCount: 0,
};

/**
 * Workflow progress context provider
 */
export const WorkflowProgressProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [state, setState] = useState<WorkflowProgressState>(defaultState);
  const [progressTracker, setProgressTracker] =
    useState<ProgressTracker | null>(null);

  // Initialize progress tracker
  useEffect(() => {
    const tracker = getProgressTracker();
    setProgressTracker(tracker);

    // Set up event listeners
    const handleProgressUpdate = (update: ProgressUpdate) => {
      setState((prevState) => {
        const newActiveWorkflows = new Map(prevState.activeWorkflows);

        // Update active workflows
        if (
          update.status === WorkflowStatus.RUNNING ||
          update.status === WorkflowStatus.PAUSED
        ) {
          newActiveWorkflows.set(update.workflowId, update);
        } else {
          // Remove from active if completed/failed/cancelled
          newActiveWorkflows.delete(update.workflowId);
        }

        // Calculate statistics
        const allUpdates = Array.from(newActiveWorkflows.values());
        const completedCount =
          update.status === WorkflowStatus.COMPLETED
            ? prevState.completedWorkflowsCount + 1
            : prevState.completedWorkflowsCount;

        const totalCount =
          prevState.totalWorkflowsCount +
          (prevState.activeWorkflows.has(update.workflowId) ? 0 : 1);

        const totalErrors = allUpdates.reduce(
          (sum, u) => sum + u.performance.errorCount,
          0,
        );
        const avgSuccessRate =
          allUpdates.length > 0
            ? allUpdates.reduce(
                (sum, u) => sum + u.performance.successRate,
                0,
              ) / allUpdates.length
            : 1.0;

        const avgCompletionTime =
          allUpdates.length > 0
            ? allUpdates.reduce((sum, u) => sum + u.overall.elapsedTime, 0) /
              allUpdates.length
            : 0;

        return {
          ...prevState,
          activeWorkflows: newActiveWorkflows,
          completedWorkflowsCount: completedCount,
          totalWorkflowsCount: totalCount,
          currentErrorCount: totalErrors,
          overallSuccessRate: avgSuccessRate,
          averageCompletionTime: avgCompletionTime,
        };
      });
    };

    tracker.on('progress-update', handleProgressUpdate);

    return () => {
      tracker.removeListener('progress-update', handleProgressUpdate);
    };
  }, []);

  // Display control actions
  const showProgress = useCallback(() => {
    setState((prev) => ({ ...prev, visible: true }));
  }, []);

  const hideProgress = useCallback(() => {
    setState((prev) => ({ ...prev, visible: false }));
  }, []);

  const toggleVisibility = useCallback(() => {
    setState((prev) => ({ ...prev, visible: !prev.visible }));
  }, []);

  const setProgressFormat = useCallback((format: ProgressFormat) => {
    setState((prev) => ({ ...prev, format }));
  }, []);

  const toggleCompactMode = useCallback(() => {
    setState((prev) => ({ ...prev, compact: !prev.compact }));
  }, []);

  const setMaxWorkflows = useCallback((maxWorkflows: number) => {
    setState((prev) => ({ ...prev, maxWorkflows: Math.max(1, maxWorkflows) }));
  }, []);

  const setAutoHideDelay = useCallback((autoHideDelay: number) => {
    setState((prev) => ({
      ...prev,
      autoHideDelay: Math.max(0, autoHideDelay),
    }));
  }, []);

  // Progress tracking control actions
  const startTrackingWorkflow = useCallback(
    (workflowId: string, updateInterval = 1000) => {
      if (progressTracker) {
        progressTracker.startTracking(workflowId, updateInterval);
      }
    },
    [progressTracker],
  );

  const stopTrackingWorkflow = useCallback(
    (workflowId: string) => {
      if (progressTracker) {
        progressTracker.stopTracking(workflowId);
      }
    },
    [progressTracker],
  );

  const clearCompletedWorkflows = useCallback(() => {
    setState((prev) => ({
      ...prev,
      activeWorkflows: new Map(),
      completedWorkflowsCount: 0,
      totalWorkflowsCount: 0,
      currentErrorCount: 0,
    }));
  }, []);

  // Dashboard generation actions
  const generateDashboard = useCallback((): string => {
    if (!progressTracker) return 'Progress tracker not initialized';
    return progressTracker.generateProgressDashboard();
  }, [progressTracker]);

  const generateWorkflowVisualization = useCallback(
    (workflowId: string, format?: ProgressFormat): string => {
      if (!progressTracker) return 'Progress tracker not initialized';
      return progressTracker.generateProgressVisualization(
        workflowId,
        format || state.format,
      );
    },
    [progressTracker, state.format],
  );

  // Create context value
  const contextValue: WorkflowProgressContextType = {
    ...state,
    showProgress,
    hideProgress,
    toggleVisibility,
    setProgressFormat,
    toggleCompactMode,
    setMaxWorkflows,
    setAutoHideDelay,
    startTrackingWorkflow,
    stopTrackingWorkflow,
    clearCompletedWorkflows,
    generateDashboard,
    generateWorkflowVisualization,
  };

  return (
    <WorkflowProgressContext.Provider value={contextValue}>
      {children}
    </WorkflowProgressContext.Provider>
  );
};

/**
 * Hook to use workflow progress context
 */
export const useWorkflowProgress = (): WorkflowProgressContextType => {
  const context = useContext(WorkflowProgressContext);
  if (!context) {
    throw new Error(
      'useWorkflowProgress must be used within a WorkflowProgressProvider',
    );
  }
  return context;
};

/**
 * Hook for workflow progress display components
 */
export const useWorkflowProgressDisplay = () => {
  const {
    visible,
    format,
    compact,
    maxWorkflows,
    autoHideDelay,
    activeWorkflows,
    toggleVisibility,
    showProgress,
    hideProgress,
    setProgressFormat,
    toggleCompactMode,
  } = useWorkflowProgress();

  return {
    visible,
    format,
    compact,
    maxWorkflows,
    autoHideDelay,
    activeWorkflows,
    toggleVisibility,
    showProgress,
    hideProgress,
    setProgressFormat,
    toggleCompactMode,
  };
};

/**
 * Hook for workflow progress statistics
 */
export const useWorkflowProgressStats = () => {
  const {
    completedWorkflowsCount,
    totalWorkflowsCount,
    averageCompletionTime,
    overallSuccessRate,
    currentErrorCount,
    activeWorkflows,
  } = useWorkflowProgress();

  const activeWorkflowsCount = activeWorkflows.size;
  const completionRate =
    totalWorkflowsCount > 0 ? completedWorkflowsCount / totalWorkflowsCount : 0;

  return {
    activeWorkflowsCount,
    completedWorkflowsCount,
    totalWorkflowsCount,
    completionRate,
    averageCompletionTime,
    overallSuccessRate,
    currentErrorCount,
  };
};

/**
 * Hook for workflow progress control
 */
export const useWorkflowProgressControl = () => {
  const {
    startTrackingWorkflow,
    stopTrackingWorkflow,
    clearCompletedWorkflows,
    generateDashboard,
    generateWorkflowVisualization,
  } = useWorkflowProgress();

  return {
    startTrackingWorkflow,
    stopTrackingWorkflow,
    clearCompletedWorkflows,
    generateDashboard,
    generateWorkflowVisualization,
  };
};
