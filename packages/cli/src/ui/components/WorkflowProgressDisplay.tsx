/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';

export enum ProgressFormat {
  SIMPLE = 'simple',
  DETAILED = 'detailed',
  BARS = 'bars',
  SPINNER = 'spinner',
}

interface WorkflowProgressDisplayProps {
  visible: boolean;
  maxWorkflows?: number;
  autoHideDelay?: number;
  format?: ProgressFormat;
  compact?: boolean;
}

interface WorkflowProgressContext {
  visible: boolean;
  format: ProgressFormat;
  compact: boolean;
  maxWorkflows: number;
  autoHideDelay: number;
  showProgress: () => void;
  hideProgress: () => void;
  toggleVisibility: () => void;
  setProgressFormat: (format: ProgressFormat) => void;
  toggleCompactMode: () => void;
}

const WorkflowProgressContext = React.createContext<WorkflowProgressContext>({
  visible: false,
  format: ProgressFormat.DETAILED,
  compact: false,
  maxWorkflows: 10,
  autoHideDelay: 3000,
  showProgress: () => {},
  hideProgress: () => {},
  toggleVisibility: () => {},
  setProgressFormat: () => {},
  toggleCompactMode: () => {},
});

export const useWorkflowProgressDisplay = () => {
  const context = React.useContext(WorkflowProgressContext);
  if (!context) {
    throw new Error('useWorkflowProgressDisplay must be used within WorkflowProgressProvider');
  }
  return context;
};

export const WorkflowProgressProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [visible, setVisible] = useState(false);
  const [format, setFormat] = useState(ProgressFormat.DETAILED);
  const [compact, setCompact] = useState(false);
  const [maxWorkflows] = useState(10);
  const [autoHideDelay] = useState(3000);

  const showProgress = useCallback(() => setVisible(true), []);
  const hideProgress = useCallback(() => setVisible(false), []);
  const toggleVisibility = useCallback(() => setVisible(v => !v), []);
  const setProgressFormat = useCallback((f: ProgressFormat) => setFormat(f), []);
  const toggleCompactMode = useCallback(() => setCompact(c => !c), []);

  const value: WorkflowProgressContext = {
    visible,
    format,
    compact,
    maxWorkflows,
    autoHideDelay,
    showProgress,
    hideProgress,
    toggleVisibility,
    setProgressFormat,
    toggleCompactMode,
  };

  return (
    <WorkflowProgressContext.Provider value={value}>
      {children}
    </WorkflowProgressContext.Provider>
  );
};

export const WorkflowProgressDisplay: React.FC<WorkflowProgressDisplayProps> = ({
  visible,
  maxWorkflows = 10,
  autoHideDelay = 3000,
  format = ProgressFormat.DETAILED,
  compact = false,
}) => {
  const [spinner, setSpinner] = useState(0);
  const spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

  useEffect(() => {
    if (!visible || format !== ProgressFormat.SPINNER) return;
    
    const interval = setInterval(() => {
      setSpinner(s => (s + 1) % spinnerChars.length);
    }, 200);

    return () => clearInterval(interval);
  }, [visible, format, spinnerChars.length]);

  if (!visible) return null;

  const renderSimple = () => (
    <Box flexDirection="column">
      <Text color={Colors.AccentBlue}>
        📊 Workflow Progress System Ready
      </Text>
      <Text color={Colors.Gray}>
        No active workflows. System monitoring enabled.
      </Text>
    </Box>
  );

  const renderDetailed = () => (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column" borderStyle="round" borderColor={Colors.Gray} padding={1}>
        <Text color={Colors.AccentPurple} bold>
          🔄 Workflow Status
        </Text>
        <Text color={Colors.Foreground}>
          • Max Concurrent Workflows: {maxWorkflows}
        </Text>
        <Text color={Colors.Foreground}>
          • Auto-hide Delay: {autoHideDelay}ms
        </Text>
        <Text color={Colors.Foreground}>
          • Display Mode: {compact ? 'Compact' : 'Full'}
        </Text>
        <Box marginTop={1}>
          <Text color={Colors.Gray}>
            Waiting for workflow execution to begin...
          </Text>
        </Box>
      </Box>
    </Box>
  );

  const renderBars = () => (
    <Box flexDirection="column">
      <Text color={Colors.AccentGreen}>
        ▓▓▓▓▓▓▓▓▓▓ 100% - System Ready
      </Text>
      <Text color={Colors.Gray}>
        ░░░░░░░░░░ 0% - No workflows active
      </Text>
    </Box>
  );

  const renderSpinner = () => (
    <Box>
      <Text color={Colors.AccentCyan}>
        {spinnerChars[spinner]} Monitoring workflows...
      </Text>
    </Box>
  );

  const renderContent = () => {
    switch (format) {
      case ProgressFormat.SIMPLE:
        return renderSimple();
      case ProgressFormat.DETAILED:
        return renderDetailed();
      case ProgressFormat.BARS:
        return renderBars();
      case ProgressFormat.SPINNER:
        return renderSpinner();
      default:
        return renderDetailed();
    }
  };

  if (compact) {
    return (
      <Box>
        <Text color={Colors.AccentBlue}>
          📊 {format === ProgressFormat.SPINNER ? spinnerChars[spinner] : '•'} Workflow Ready
        </Text>
      </Box>
    );
  }

  return renderContent();
};