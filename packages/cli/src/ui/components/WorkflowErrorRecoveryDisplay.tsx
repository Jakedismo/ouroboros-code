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

// Placeholder types for error recovery system
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium', 
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum RecoveryStrategy {
  CONTINUE = 'continue',
  RETRY = 'retry',
  SKIP = 'skip',
  ROLLBACK = 'rollback',
  RESTART = 'restart',
  MANUAL = 'manual'
}

export interface ErrorAnalysis {
  errorId: string;
  workflowId: string;
  stepId: string;
  timestamp: Date;
  severity: ErrorSeverity;
  category: string;
  message: string;
  suggestedRecovery: RecoveryStrategy;
  automaticRecovery: boolean;
  estimatedRecoveryTime: number;
}

export interface RecoveryPlan {
  planId: string;
  workflowId: string;
  errorId: string;
  strategy: RecoveryStrategy;
  estimatedDuration: number;
  successProbability: number;
  riskAssessment: {
    dataLossRisk: number;
    systemStabilityRisk: number;
    timeRisk: number;
    overallRisk: number;
  };
}

export interface WorkflowErrorRecoveryDisplayProps {
  visible: boolean;
  workflowId?: string;
  compact?: boolean;
  onRecoverySelected?: (planId: string, strategy: RecoveryStrategy) => void;
  onDismiss?: () => void;
}

/**
 * TUI component for displaying workflow error recovery options
 * NOTE: This is currently a placeholder component that will be fully integrated 
 * with the workflow error handling system when workflow execution is implemented.
 */
export const WorkflowErrorRecoveryDisplay: React.FC<WorkflowErrorRecoveryDisplayProps> = ({
  visible,
  workflowId,
  compact = false,
  onRecoverySelected,
  onDismiss
}) => {
  const [selectedError, setSelectedError] = useState<number>(0);
  const [selectedStrategy, setSelectedStrategy] = useState<number>(0);
  const [showStrategies, setShowStrategies] = useState<boolean>(false);
  const { columns: terminalWidth } = useTerminalSize();
  const isNarrow = isNarrowWidth(terminalWidth);

  // Mock error data for placeholder
  const mockErrors: ErrorAnalysis[] = [
    {
      errorId: 'error_1',
      workflowId: 'workflow_1',
      stepId: 'step_build',
      timestamp: new Date(),
      severity: ErrorSeverity.HIGH,
      category: 'build',
      message: 'TypeScript compilation failed: Cannot find module',
      suggestedRecovery: RecoveryStrategy.RETRY,
      automaticRecovery: true,
      estimatedRecoveryTime: 30000
    },
    {
      errorId: 'error_2', 
      workflowId: 'workflow_1',
      stepId: 'step_test',
      timestamp: new Date(),
      severity: ErrorSeverity.MEDIUM,
      category: 'test',
      message: 'Test suite failed: 3 of 15 tests failing',
      suggestedRecovery: RecoveryStrategy.SKIP,
      automaticRecovery: false,
      estimatedRecoveryTime: 15000
    }
  ];

  const mockRecoveryPlans: RecoveryPlan[] = [
    {
      planId: 'plan_1',
      workflowId: 'workflow_1',
      errorId: 'error_1',
      strategy: RecoveryStrategy.RETRY,
      estimatedDuration: 45000,
      successProbability: 0.85,
      riskAssessment: {
        dataLossRisk: 0.1,
        systemStabilityRisk: 0.2,
        timeRisk: 0.3,
        overallRisk: 0.2
      }
    },
    {
      planId: 'plan_2',
      workflowId: 'workflow_1', 
      errorId: 'error_1',
      strategy: RecoveryStrategy.ROLLBACK,
      estimatedDuration: 120000,
      successProbability: 0.95,
      riskAssessment: {
        dataLossRisk: 0.0,
        systemStabilityRisk: 0.1,
        timeRisk: 0.6,
        overallRisk: 0.25
      }
    }
  ];

  // Handle keyboard input
  useInput((input, key) => {
    if (!visible) return;

    if (key.escape) {
      onDismiss?.();
      return;
    }

    if (showStrategies) {
      switch (input.toLowerCase()) {
        case 'j':
        case 's':
          if (key.downArrow || input === 'j') {
            setSelectedStrategy(prev => Math.min(prev + 1, mockRecoveryPlans.length - 1));
          }
          break;
        
        case 'k':
        case 'w':
          if (key.upArrow || input === 'k') {
            setSelectedStrategy(prev => Math.max(prev - 1, 0));
          }
          break;
        
        case 'e':
          const selectedPlan = mockRecoveryPlans[selectedStrategy];
          if (selectedPlan) {
            onRecoverySelected?.(selectedPlan.planId, selectedPlan.strategy);
          }
          break;
        
        case 'b':
          setShowStrategies(false);
          break;
      }
    } else {
      switch (input.toLowerCase()) {
        case 'j':
        case 's':
          if (key.downArrow || input === 'j') {
            setSelectedError(prev => Math.min(prev + 1, mockErrors.length - 1));
          }
          break;
        
        case 'k':
        case 'w':
          if (key.upArrow || input === 'k') {
            setSelectedError(prev => Math.max(prev - 1, 0));
          }
          break;
        
        case 'r':
          setShowStrategies(true);
          setSelectedStrategy(0);
          break;
        
        case 'a':
          // Auto-execute suggested recovery
          const error = mockErrors[selectedError];
          if (error?.automaticRecovery) {
            onRecoverySelected?.(`auto_${error.errorId}`, error.suggestedRecovery);
          }
          break;
      }
    }
  }, { isActive: visible });

  if (!visible || mockErrors.length === 0) {
    return null;
  }

  const getSeverityColor = (severity: ErrorSeverity): string => {
    switch (severity) {
      case ErrorSeverity.CRITICAL: return Colors.AccentRed;
      case ErrorSeverity.HIGH: return Colors.AccentYellow;
      case ErrorSeverity.MEDIUM: return Colors.AccentYellow;
      case ErrorSeverity.LOW: return Colors.AccentBlue;
      default: return Colors.Gray;
    }
  };

  const getSeverityIcon = (severity: ErrorSeverity): string => {
    switch (severity) {
      case ErrorSeverity.CRITICAL: return '🔥';
      case ErrorSeverity.HIGH: return '❌';
      case ErrorSeverity.MEDIUM: return '⚠️';
      case ErrorSeverity.LOW: return '💡';
      default: return '❓';
    }
  };

  const getStrategyIcon = (strategy: RecoveryStrategy): string => {
    switch (strategy) {
      case RecoveryStrategy.RETRY: return '🔄';
      case RecoveryStrategy.ROLLBACK: return '⏪';
      case RecoveryStrategy.SKIP: return '⏭️';
      case RecoveryStrategy.RESTART: return '🔃';
      case RecoveryStrategy.CONTINUE: return '▶️';
      case RecoveryStrategy.MANUAL: return '👤';
      default: return '🤖';
    }
  };

  const getRiskColor = (risk: number): string => {
    if (risk < 0.3) return Colors.AccentGreen;
    if (risk < 0.6) return Colors.AccentYellow;
    return Colors.AccentRed;
  };

  const renderErrorList = () => (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color={Colors.AccentRed} bold>
          🚨 Workflow Errors ({mockErrors.length})
        </Text>
      </Box>
      
      {mockErrors.map((error, index) => (
        <Box 
          key={error.errorId}
          flexDirection="column" 
          marginBottom={1}
          borderStyle={index === selectedError ? "round" : undefined}
          borderColor={index === selectedError ? Colors.AccentBlue : undefined}
          paddingX={1}
        >
          <Box justifyContent="space-between">
            <Text color={getSeverityColor(error.severity)}>
              {getSeverityIcon(error.severity)} [{error.severity.toUpperCase()}] {error.stepId}
            </Text>
            <Text color={Colors.Gray}>
              {error.timestamp.toLocaleTimeString()}
            </Text>
          </Box>
          
          <Text color={Colors.Foreground}>
            {error.message}
          </Text>
          
          <Box justifyContent="space-between" marginTop={1}>
            <Text color={Colors.AccentPurple}>
              {getStrategyIcon(error.suggestedRecovery)} Suggested: {error.suggestedRecovery}
            </Text>
            <Text color={error.automaticRecovery ? Colors.AccentGreen : Colors.AccentYellow}>
              {error.automaticRecovery ? '🤖 Auto' : '👤 Manual'} 
              • ~{Math.round(error.estimatedRecoveryTime / 1000)}s
            </Text>
          </Box>
          
          {index === selectedError && (
            <Box marginTop={1}>
              <Text color={Colors.AccentBlue}>
                Press R for recovery options • A for auto-recovery • ESC to close
              </Text>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );

  const renderRecoveryStrategies = () => {
    const currentError = mockErrors[selectedError];
    if (!currentError) return null;

    return (
      <Box flexDirection="column">
        <Box marginBottom={1} justifyContent="space-between">
          <Text color={Colors.AccentPurple} bold>
            🔧 Recovery Options for: {currentError.stepId}
          </Text>
          <Text color={Colors.Gray}>
            Press B to go back
          </Text>
        </Box>

        {mockRecoveryPlans.map((plan, index) => (
          <Box 
            key={plan.planId}
            flexDirection="column" 
            marginBottom={1}
            borderStyle={index === selectedStrategy ? "round" : undefined}
            borderColor={index === selectedStrategy ? Colors.AccentGreen : undefined}
            paddingX={1}
          >
            <Box justifyContent="space-between">
              <Text color={Colors.AccentGreen}>
                {getStrategyIcon(plan.strategy)} {plan.strategy.toUpperCase()}
              </Text>
              <Text color={Colors.AccentBlue}>
                Success: {(plan.successProbability * 100).toFixed(0)}%
              </Text>
            </Box>
            
            <Box flexDirection={isNarrow ? 'column' : 'row'} gap={2} marginTop={1}>
              <Box flexDirection="column">
                <Text color={Colors.Gray}>
                  Duration: ~{Math.round(plan.estimatedDuration / 1000)}s
                </Text>
                <Text color={getRiskColor(plan.riskAssessment.overallRisk)}>
                  Risk: {(plan.riskAssessment.overallRisk * 100).toFixed(0)}%
                </Text>
              </Box>
              
              {!isNarrow && (
                <Box flexDirection="column">
                  <Text color={Colors.Gray}>
                    Data Loss: {(plan.riskAssessment.dataLossRisk * 100).toFixed(0)}%
                  </Text>
                  <Text color={Colors.Gray}>
                    Stability: {(plan.riskAssessment.systemStabilityRisk * 100).toFixed(0)}%
                  </Text>
                </Box>
              )}
            </Box>
            
            {index === selectedStrategy && (
              <Box marginTop={1}>
                <Text color={Colors.AccentGreen}>
                  Press E to execute this recovery strategy
                </Text>
              </Box>
            )}
          </Box>
        ))}
        
        <Box marginTop={1} borderStyle="round" borderColor={Colors.Gray} paddingX={1}>
          <Text color={Colors.AccentBlue}>
            Navigate: ↑↓ or J/K • Execute: E • Back: B • Close: ESC
          </Text>
        </Box>
      </Box>
    );
  };

  const renderHeader = () => (
    <Box marginBottom={1} justifyContent="space-between">
      <Text color={Colors.AccentRed} bold>
        🛡️ Workflow Error Recovery System
      </Text>
      {workflowId && (
        <Text color={Colors.Gray}>
          Workflow: {workflowId}
        </Text>
      )}
    </Box>
  );

  const renderStats = () => {
    const criticalCount = mockErrors.filter(e => e.severity === ErrorSeverity.CRITICAL).length;
    const autoRecoverable = mockErrors.filter(e => e.automaticRecovery).length;
    
    return (
      <Box flexDirection={isNarrow ? 'column' : 'row'} marginBottom={1} gap={2}>
        <Text color={Colors.AccentRed}>
          🔥 Critical: {criticalCount}
        </Text>
        <Text color={Colors.AccentYellow}>
          ❌ High: {mockErrors.filter(e => e.severity === ErrorSeverity.HIGH).length}
        </Text>
        <Text color={Colors.AccentGreen}>
          🤖 Auto-recoverable: {autoRecoverable}
        </Text>
      </Box>
    );
  };

  if (compact) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color={Colors.AccentRed}>
          🚨 {mockErrors.length} error(s) • Press W for recovery options
        </Text>
      </Box>
    );
  }

  return (
    <Box 
      flexDirection="column" 
      paddingX={2} 
      paddingY={1}
      borderStyle="round" 
      borderColor={Colors.AccentRed}
      width={Math.min(terminalWidth - 4, 100)}
    >
      {renderHeader()}
      {renderStats()}
      
      {showStrategies ? renderRecoveryStrategies() : renderErrorList()}
      
      {mockErrors.length === 0 && (
        <Box justifyContent="center" marginTop={2}>
          <Text color={Colors.AccentGreen}>
            ✅ No workflow errors detected. System operating normally.
          </Text>
        </Box>
      )}
    </Box>
  );
};

/**
 * Mini error indicator for status bar
 */
export const WorkflowErrorIndicator: React.FC<{
  errorCount: number;
  criticalCount: number;
  onToggleDisplay?: () => void;
}> = ({ errorCount, criticalCount, onToggleDisplay }) => {
  useInput((input) => {
    if (input === 'e' && errorCount > 0) {
      onToggleDisplay?.();
    }
  });

  if (errorCount === 0) {
    return (
      <Text color={Colors.AccentGreen}>
        ✅ No errors
      </Text>
    );
  }

  const color = criticalCount > 0 ? Colors.AccentRed : Colors.AccentYellow;
  const icon = criticalCount > 0 ? '🔥' : '⚠️';

  return (
    <Box marginRight={2}>
      <Text color={color}>
        {icon} {errorCount} error(s)
        {criticalCount > 0 && ` (${criticalCount} critical)`}
      </Text>
      <Text color={Colors.Gray}> • Press E for recovery</Text>
    </Box>
  );
};