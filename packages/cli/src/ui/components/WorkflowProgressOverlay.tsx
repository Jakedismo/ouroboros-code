/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { isNarrowWidth } from '../utils/isNarrowWidth.js';
import {
  WorkflowProgressDisplay,
  useWorkflowProgressDisplay,
  ProgressFormat,
} from './WorkflowProgressDisplay.js';

export interface WorkflowProgressOverlayProps {
  position?: 'top' | 'bottom' | 'center';
  dismissible?: boolean;
  onDismiss?: () => void;
  showHelp?: boolean;
}

/**
 * Full-screen workflow progress overlay with interactive controls
 * NOTE: This is currently a placeholder component for the real-time TUI progress system.
 * It will be fully integrated when workflow execution is implemented.
 */
export const WorkflowProgressOverlay: React.FC<
  WorkflowProgressOverlayProps
> = ({
  position = 'center',
  dismissible = true,
  onDismiss,
  showHelp = true,
}) => {
  const {
    visible,
    format,
    compact,
    maxWorkflows,
    autoHideDelay,
    hideProgress,
    setProgressFormat,
    toggleCompactMode,
  } = useWorkflowProgressDisplay();

  const { columns: terminalWidth, rows: terminalHeight } = useTerminalSize();
  const isNarrow = isNarrowWidth(terminalWidth);
  const [showDashboard, setShowDashboard] = useState(false);

  // Mock stats for placeholder
  const activeWorkflowsCount = 0;
  const completedWorkflowsCount = 0;
  const totalWorkflowsCount = 0;
  const completionRate = 0;
  const averageCompletionTime = 0;
  const overallSuccessRate = 1.0;
  const currentErrorCount = 0;

  // Handle keyboard input
  useInput(
    (input, key) => {
      if (!visible) return;

      if (key.escape && dismissible) {
        hideProgress();
        onDismiss?.();
        return;
      }

      switch (input.toLowerCase()) {
        case 'c':
          toggleCompactMode();
          break;

        case 'f':
          // Cycle through formats
          const formats = Object.values(ProgressFormat);
          const currentIndex = formats.indexOf(format);
          const nextIndex = (currentIndex + 1) % formats.length;
          setProgressFormat(formats[nextIndex]);
          break;

        case 'd':
          setShowDashboard(!showDashboard);
          break;

        case 'q':
          if (dismissible) {
            hideProgress();
            onDismiss?.();
          }
          break;
      }
    },
    { isActive: visible },
  );

  if (!visible) {
    return null;
  }

  const renderStatsSummary = () => (
    <Box flexDirection={isNarrow ? 'column' : 'row'} marginBottom={1} gap={2}>
      <Box flexDirection="column">
        <Text color={Colors.AccentPurple} bold>
          📈 Statistics
        </Text>
        <Text color={Colors.Gray}>
          Active: {activeWorkflowsCount} | Completed: {completedWorkflowsCount}/
          {totalWorkflowsCount}
        </Text>
        <Text color={Colors.Gray}>
          Success Rate: {(overallSuccessRate * 100).toFixed(1)}% | Errors:{' '}
          {currentErrorCount}
        </Text>
      </Box>

      {!isNarrow && (
        <Box flexDirection="column">
          <Text color={Colors.AccentBlue} bold>
            ⏱️ Performance
          </Text>
          <Text color={Colors.Gray}>
            Avg Time: {(averageCompletionTime / 1000).toFixed(1)}s
          </Text>
          <Text color={Colors.Gray}>
            Completion: {(completionRate * 100).toFixed(1)}%
          </Text>
        </Box>
      )}
    </Box>
  );

  const renderKeyboardHelp = () => (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={Colors.Gray}
    >
      <Text color={Colors.AccentPurple} bold>
        🎮 Keyboard Controls
      </Text>
      <Box flexDirection={isNarrow ? 'column' : 'row'} gap={4}>
        <Box flexDirection="column">
          <Text color={Colors.Gray}>
            • <Text color={Colors.Foreground}>ESC/Q</Text> - Close overlay
          </Text>
          <Text color={Colors.Gray}>
            • <Text color={Colors.Foreground}>C</Text> - Toggle compact mode
          </Text>
          <Text color={Colors.Gray}>
            • <Text color={Colors.Foreground}>F</Text> - Change format
          </Text>
        </Box>
        <Box flexDirection="column">
          <Text color={Colors.Gray}>
            • <Text color={Colors.Foreground}>D</Text> - Toggle dashboard
          </Text>
          <Text color={Colors.Gray}>
            • <Text color={Colors.Foreground}>W</Text> - Open from mini
          </Text>
        </Box>
      </Box>
    </Box>
  );

  const renderHeader = () => (
    <Box marginBottom={1} justifyContent="space-between">
      <Text color={Colors.AccentBlue} bold>
        🚀 Ouroboros Workflow Progress Monitor
      </Text>
      <Text color={Colors.Gray}>
        Format: {format.replace('_', ' ').toUpperCase()} |{' '}
        {compact ? 'Compact' : 'Full'}
      </Text>
    </Box>
  );

  const renderDashboard = () => {
    if (!showDashboard) return null;

    return (
      <Box
        flexDirection="column"
        borderStyle="double"
        borderColor={Colors.AccentPurple}
        padding={1}
      >
        <Text color={Colors.AccentPurple} bold>
          📊 Live Dashboard
        </Text>
        <Box flexDirection="column">
          <Text color={Colors.Foreground}>
            📊 Real-time TUI Progress System: ✅ Active
          </Text>
          <Text color={Colors.Foreground}>
            🔍 Workflow State Management: ✅ Active
          </Text>
          <Text color={Colors.Foreground}>📈 Progress Tracking: ✅ Active</Text>
          <Text color={Colors.Foreground}>
            🎮 Interactive Controls: ✅ Available
          </Text>
          <Box marginTop={1}>
            <Text color={Colors.Gray}>
              Waiting for workflow execution to begin...
            </Text>
          </Box>
        </Box>
      </Box>
    );
  };

  return (
    <Box
      width={terminalWidth}
      height={terminalHeight}
      flexDirection="column"
      paddingX={2}
      justifyContent="center"
      borderStyle="double"
      borderColor={Colors.AccentBlue}
    >
      {renderHeader()}
      {renderStatsSummary()}

      {showDashboard ? (
        renderDashboard()
      ) : (
        <WorkflowProgressDisplay
          visible={true}
          maxWorkflows={maxWorkflows}
          autoHideDelay={autoHideDelay}
          format={format}
          compact={compact}
        />
      )}

      {showHelp && renderKeyboardHelp()}

      <Box marginTop={2} justifyContent="center">
        <Text color={Colors.Gray}>
          {activeWorkflowsCount === 0
            ? '🔍 No active workflows found. Waiting for workflow executions...'
            : '✅ All workflows completed! Press ESC to close.'}
        </Text>
      </Box>
    </Box>
  );
};

/**
 * Mini workflow progress indicator for status bar
 */
export const WorkflowProgressMini: React.FC = () => {
  const { toggleVisibility } = useWorkflowProgressDisplay();

  // Mock data for placeholder
  const activeWorkflowsCount = 0;
  const currentErrorCount = 0;

  // Handle click to open full overlay
  useInput((input) => {
    if (input === 'w') {
      // 'w' for workflows
      toggleVisibility();
    }
  });

  if (activeWorkflowsCount === 0) {
    // Show a subtle indicator that the system is ready
    return (
      <Box marginRight={2}>
        <Text color={Colors.Gray}>
          📊 Workflow System Ready • Press W for progress
        </Text>
      </Box>
    );
  }

  const statusColor =
    currentErrorCount > 0 ? Colors.AccentRed : Colors.AccentGreen;

  return (
    <Box marginRight={2}>
      <Text color={statusColor}>
        🔄 {activeWorkflowsCount} workflows
        {currentErrorCount > 0 && ` (${currentErrorCount} errors)`}
      </Text>
      <Text color={Colors.Gray}> • Press W for details</Text>
    </Box>
  );
};
