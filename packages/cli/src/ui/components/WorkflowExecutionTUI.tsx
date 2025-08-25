/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
// Spinner component would be imported from ink-spinner when available
// For now, using a simple text replacement
const Spinner = ({ type }: { type?: string }) => <Text>⟳</Text>;
import { Colors } from '../colors.js';
import { WorkflowStep, WorkflowPlan } from './WorkflowPlanningTUI.js';

/**
 * Execution metrics
 */
export interface ExecutionMetrics {
  startTime: Date;
  endTime?: Date;
  duration?: number;
  stepsCompleted: number;
  stepsFailed: number;
  stepsSkipped: number;
  totalSteps: number;
  currentStepIndex: number;
  estimatedTimeRemaining?: number;
  throughput?: number;
}

/**
 * Step execution details
 */
export interface StepExecution {
  stepId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  output?: string;
  error?: string;
  progress?: number;
  logs?: string[];
}

/**
 * Workflow execution state
 */
export interface WorkflowExecution {
  id: string;
  plan: WorkflowPlan;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  metrics: ExecutionMetrics;
  stepExecutions: Map<string, StepExecution>;
  currentStep?: WorkflowStep;
  logs: string[];
}

/**
 * Workflow execution TUI props
 */
export interface WorkflowExecutionTUIProps {
  execution: WorkflowExecution;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  onRetry?: (stepId: string) => void;
  onSkip?: (stepId: string) => void;
  showLogs?: boolean;
  compactMode?: boolean;
}

/**
 * Real-time workflow execution monitoring component
 */
export const WorkflowExecutionTUI: React.FC<WorkflowExecutionTUIProps> = ({
  execution,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onSkip,
  showLogs = true,
  compactMode = false
}) => {
  const [selectedTab, setSelectedTab] = useState<'progress' | 'logs' | 'metrics'>('progress');
  const [isPaused, setIsPaused] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  // Handle keyboard input
  useInput(useCallback((input, key) => {
    if (key.escape) {
      onCancel?.();
      return;
    }

    if (showHelp) {
      if (input === '?' || key.escape) {
        setShowHelp(false);
      }
      return;
    }

    // Tab navigation
    if (input === '1') setSelectedTab('progress');
    if (input === '2') setSelectedTab('logs');
    if (input === '3') setSelectedTab('metrics');

    // Controls
    if (input === 'p' || input === 'P') {
      if (isPaused) {
        onResume?.();
        setIsPaused(false);
      } else {
        onPause?.();
        setIsPaused(true);
      }
    }

    if (input === 'c' || input === 'C') {
      onCancel?.();
    }

    if (input === 'r' || input === 'R') {
      if (execution.currentStep) {
        onRetry?.(execution.currentStep.id);
      }
    }

    if (input === 's' || input === 'S') {
      if (execution.currentStep) {
        onSkip?.(execution.currentStep.id);
      }
    }

    if (input === 'a' || input === 'A') {
      setAutoScroll(!autoScroll);
    }

    if (input === '?') {
      setShowHelp(true);
    }
  }, [selectedTab, isPaused, autoScroll, showHelp, execution.currentStep, onPause, onResume, onCancel, onRetry, onSkip]));

  const renderProgressBar = (progress: number, width: number = 30) => {
    const filled = Math.floor((progress / 100) * width);
    const empty = width - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${progress}%`;
  };

  const renderStepStatus = (step: WorkflowStep) => {
    const stepExec = execution.stepExecutions.get(step.id);
    if (!stepExec) return '○ Pending';

    switch (stepExec.status) {
      case 'running':
        return <Text color={Colors.AccentYellow}><Spinner type="dots" /> Running</Text>;
      case 'completed':
        return <Text color={Colors.AccentGreen}>✓ Completed</Text>;
      case 'failed':
        return <Text color={Colors.AccentRed}>✗ Failed</Text>;
      case 'skipped':
        return <Text color={Colors.Gray}>⊘ Skipped</Text>;
      default:
        return <Text color={Colors.Gray}>○ Pending</Text>;
    }
  };

  const renderProgressTab = () => {
    const progress = Math.floor((execution.metrics.stepsCompleted / execution.metrics.totalSteps) * 100);

    return (
      <Box flexDirection="column">
        {/* Overall progress */}
        <Box marginBottom={1}>
          <Text color={Colors.AccentCyan} bold>Overall Progress: </Text>
          <Text>{renderProgressBar(progress, 40)}</Text>
        </Box>

        {/* Steps progress */}
        <Box flexDirection="column" borderStyle="single" paddingX={1}>
          <Text color={Colors.Gray}>Step Execution Status</Text>
        </Box>
        <Box flexDirection="column" borderStyle="single" paddingX={1} minHeight={12}>
          {execution.plan.steps.map((step, index) => {
            const isCurrent = execution.currentStep?.id === step.id;
            return (
              <Box key={step.id} marginY={0}>
                <Text color={isCurrent ? Colors.AccentCyan : Colors.Foreground}>
                  {isCurrent ? '▶' : ' '} {index + 1}. {step.name}
                </Text>
                <Box marginLeft={4}>
                  {renderStepStatus(step)}
                </Box>
              </Box>
            );
          })}
        </Box>

        {/* Current step details */}
        {execution.currentStep && (
          <Box flexDirection="column" borderStyle="single" paddingX={1} marginTop={1}>
            <Text color={Colors.AccentBlue} bold>Current Step</Text>
            <Text>Name: {execution.currentStep.name}</Text>
            <Text>Type: {execution.currentStep.type}</Text>
            {execution.stepExecutions.get(execution.currentStep.id)?.progress && (
              <Text>
                Progress: {renderProgressBar(
                  execution.stepExecutions.get(execution.currentStep.id)!.progress!,
                  20
                )}
              </Text>
            )}
          </Box>
        )}
      </Box>
    );
  };

  const renderLogsTab = () => {
    const recentLogs = autoScroll ? execution.logs.slice(-15) : execution.logs;

    return (
      <Box flexDirection="column">
        <Box borderStyle="single" paddingX={1}>
          <Text color={Colors.Gray}>
            Execution Logs {autoScroll ? '(Auto-scroll ON)' : '(Auto-scroll OFF)'}
          </Text>
        </Box>
        <Box
          flexDirection="column"
          borderStyle="single"
          paddingX={1}
          height={18}
        >
          {recentLogs.length === 0 ? (
            <Text color={Colors.Gray}>No logs yet...</Text>
          ) : (
            recentLogs.map((log, index) => (
              <Text key={index} color={Colors.Foreground}>
                {log}
              </Text>
            ))
          )}
        </Box>
      </Box>
    );
  };

  const renderMetricsTab = () => {
    const { metrics } = execution;
    const duration = metrics.duration || 
      (metrics.startTime ? (Date.now() - metrics.startTime.getTime()) / 1000 : 0);

    return (
      <Box flexDirection="column">
        <Box borderStyle="single" paddingX={1}>
          <Text color={Colors.Gray}>Execution Metrics</Text>
        </Box>
        <Box flexDirection="column" borderStyle="single" paddingX={1} minHeight={18}>
          <Text color={Colors.AccentBlue} bold>Performance Metrics</Text>
          <Text>Start Time: {metrics.startTime.toLocaleTimeString()}</Text>
          <Text>Duration: {duration.toFixed(1)}s</Text>
          <Text>Throughput: {metrics.throughput?.toFixed(2) || '0'} steps/min</Text>
          <Text> </Text>
          
          <Text color={Colors.AccentBlue} bold>Step Statistics</Text>
          <Text color={Colors.AccentGreen}>Completed: {metrics.stepsCompleted}/{metrics.totalSteps}</Text>
          <Text color={Colors.AccentRed}>Failed: {metrics.stepsFailed}</Text>
          <Text color={Colors.Gray}>Skipped: {metrics.stepsSkipped}</Text>
          <Text> </Text>
          
          <Text color={Colors.AccentBlue} bold>Estimates</Text>
          <Text>Progress: {Math.floor((metrics.stepsCompleted / metrics.totalSteps) * 100)}%</Text>
          <Text>Est. Time Remaining: {
            metrics.estimatedTimeRemaining 
              ? `${Math.ceil(metrics.estimatedTimeRemaining / 60)} min`
              : 'Calculating...'
          }</Text>
          
          {execution.status === 'completed' && (
            <Box marginTop={1}>
              <Text color={Colors.AccentGreen} bold>✓ Workflow Completed Successfully</Text>
            </Box>
          )}
          
          {execution.status === 'failed' && (
            <Box marginTop={1}>
              <Text color={Colors.AccentRed} bold>✗ Workflow Failed</Text>
            </Box>
          )}
        </Box>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" width="100%">
      {/* Header */}
      <Box borderStyle="double" borderColor={Colors.AccentCyan} paddingX={1}>
        <Text color={Colors.AccentCyan} bold>
          Workflow Execution Monitor - {execution.plan.name}
        </Text>
        <Box marginLeft={2}>
          <Text color={
            execution.status === 'running' ? Colors.AccentYellow :
            execution.status === 'completed' ? Colors.AccentGreen :
            execution.status === 'failed' ? Colors.AccentRed :
            Colors.Gray
          }>
            [{execution.status.toUpperCase()}]
          </Text>
        </Box>
      </Box>

      {/* Tab bar */}
      <Box marginTop={1} marginBottom={1}>
        <Box marginRight={2}>
          <Text
            color={selectedTab === 'progress' ? Colors.AccentCyan : Colors.Gray}
            bold={selectedTab === 'progress'}
          >
            [1] Progress
          </Text>
        </Box>
        <Box marginRight={2}>
          <Text
            color={selectedTab === 'logs' ? Colors.AccentCyan : Colors.Gray}
            bold={selectedTab === 'logs'}
          >
            [2] Logs
          </Text>
        </Box>
        <Box>
          <Text
            color={selectedTab === 'metrics' ? Colors.AccentCyan : Colors.Gray}
            bold={selectedTab === 'metrics'}
          >
            [3] Metrics
          </Text>
        </Box>
      </Box>

      {/* Tab content */}
      <Box minHeight={20}>
        {selectedTab === 'progress' && renderProgressTab()}
        {selectedTab === 'logs' && renderLogsTab()}
        {selectedTab === 'metrics' && renderMetricsTab()}
      </Box>

      {/* Help panel */}
      {showHelp && (
        <Box
          borderStyle="double"
          borderColor={Colors.AccentYellow}
          paddingX={2}
          paddingY={1}
          marginTop={1}
        >
          <Text color={Colors.AccentYellow} bold>Keyboard Shortcuts:</Text>
          <Text>
            Tabs: 1-Progress 2-Logs 3-Metrics{'\n'}
            Controls: P-Pause/Resume C-Cancel R-Retry S-Skip{'\n'}
            Options: A-Toggle Auto-scroll ?-Help ESC-Exit
          </Text>
        </Box>
      )}

      {/* Control bar */}
      <Box marginTop={1} paddingX={1} borderStyle="single" borderColor={Colors.Gray}>
        <Text color={Colors.Gray}>
          {isPaused ? '[PAUSED]' : '[RUNNING]'} | 
          Steps: {execution.metrics.stepsCompleted}/{execution.metrics.totalSteps} | 
          Press ? for help | ESC to exit
        </Text>
      </Box>
    </Box>
  );
};

/**
 * Compact execution progress widget
 */
export const CompactExecutionProgress: React.FC<{
  execution: WorkflowExecution;
}> = ({ execution }) => {
  const progress = Math.floor(
    (execution.metrics.stepsCompleted / execution.metrics.totalSteps) * 100
  );

  return (
    <Box borderStyle="single" paddingX={1}>
      <Text color={Colors.AccentCyan}>{execution.plan.name}: </Text>
      <Text color={
        execution.status === 'running' ? Colors.AccentYellow :
        execution.status === 'completed' ? Colors.AccentGreen :
        execution.status === 'failed' ? Colors.AccentRed :
        Colors.Gray
      }>
        {execution.status === 'running' && <Spinner type="dots" />}
        {execution.status !== 'running' && execution.status}
      </Text>
      <Text> [{progress}%]</Text>
    </Box>
  );
};

/**
 * Multi-workflow execution dashboard
 */
export const WorkflowDashboard: React.FC<{
  executions: WorkflowExecution[];
  onSelectExecution: (id: string) => void;
}> = ({ executions, onSelectExecution }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (key.upArrow && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    } else if (key.downArrow && selectedIndex < executions.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    } else if (key.return) {
      onSelectExecution(executions[selectedIndex].id);
    }
  });

  const running = executions.filter(e => e.status === 'running').length;
  const completed = executions.filter(e => e.status === 'completed').length;
  const failed = executions.filter(e => e.status === 'failed').length;

  return (
    <Box flexDirection="column">
      {/* Summary */}
      <Box borderStyle="double" paddingX={1} marginBottom={1}>
        <Text color={Colors.AccentCyan} bold>Workflow Dashboard</Text>
        <Box marginLeft={2}>
          <Text color={Colors.AccentYellow}>Running: {running}</Text>
          <Text> | </Text>
          <Text color={Colors.AccentGreen}>Completed: {completed}</Text>
          <Text> | </Text>
          <Text color={Colors.AccentRed}>Failed: {failed}</Text>
        </Box>
      </Box>

      {/* Execution list */}
      <Box flexDirection="column">
        {executions.map((exec, index) => (
          <Box key={exec.id} marginY={0}>
            <Text color={index === selectedIndex ? Colors.AccentCyan : Colors.Foreground}>
              {index === selectedIndex ? '▶' : ' '}
            </Text>
            <CompactExecutionProgress execution={exec} />
          </Box>
        ))}
      </Box>
    </Box>
  );
};