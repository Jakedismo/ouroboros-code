/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';

/**
 * Workflow step interface
 */
export interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  type: 'action' | 'decision' | 'parallel' | 'loop' | 'condition';
  dependencies?: string[];
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  estimatedTime?: number;
  tools?: string[];
  conditions?: string;
  outputs?: string[];
}

/**
 * Workflow plan interface
 */
export interface WorkflowPlan {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  createdAt: Date;
  estimatedDuration?: number;
  tags?: string[];
}

/**
 * Workflow planning TUI props
 */
export interface WorkflowPlanningTUIProps {
  initialPlan?: WorkflowPlan;
  onSave: (plan: WorkflowPlan) => void;
  onExecute: (plan: WorkflowPlan) => void;
  onCancel: () => void;
  availableTools?: string[];
}

/**
 * Interactive workflow planning and visualization component
 */
export const WorkflowPlanningTUI: React.FC<WorkflowPlanningTUIProps> = ({
  initialPlan,
  onSave,
  onExecute,
  onCancel,
  availableTools = []
}) => {
  const [plan, setPlan] = useState<WorkflowPlan>(initialPlan || {
    id: `workflow-${Date.now()}`,
    name: 'New Workflow',
    description: '',
    steps: [],
    createdAt: new Date()
  });

  const [selectedStepIndex, setSelectedStepIndex] = useState(0);
  const [editMode, setEditMode] = useState<'view' | 'edit' | 'add'>('view');
  const [showDiagram, setShowDiagram] = useState(true);
  const [showHelp, setShowHelp] = useState(false);

  // Handle keyboard input
  useInput(useCallback((input, key) => {
    if (key.escape) {
      if (editMode !== 'view') {
        setEditMode('view');
      } else {
        onCancel();
      }
      return;
    }

    if (showHelp) {
      if (input === '?' || key.escape) {
        setShowHelp(false);
      }
      return;
    }

    // Navigation
    if (editMode === 'view') {
      if ((key.upArrow || input === 'k') && selectedStepIndex > 0) {
        setSelectedStepIndex(selectedStepIndex - 1);
      } else if ((key.downArrow || input === 'j') && selectedStepIndex < plan.steps.length - 1) {
        setSelectedStepIndex(selectedStepIndex + 1);
      }

      // Actions
      if (input === 'a' || input === 'A') {
        setEditMode('add');
      } else if (input === 'e' || input === 'E') {
        if (plan.steps.length > 0) {
          setEditMode('edit');
        }
      } else if (input === 'd' || input === 'D') {
        if (plan.steps.length > 0) {
          // Delete selected step
          const newSteps = plan.steps.filter((_, index) => index !== selectedStepIndex);
          setPlan({ ...plan, steps: newSteps });
          if (selectedStepIndex >= newSteps.length && selectedStepIndex > 0) {
            setSelectedStepIndex(selectedStepIndex - 1);
          }
        }
      } else if (input === 's' || input === 'S') {
        onSave(plan);
      } else if (input === 'x' || input === 'X') {
        if (plan.steps.length > 0) {
          onExecute(plan);
        }
      } else if (input === 'v' || input === 'V') {
        setShowDiagram(!showDiagram);
      } else if (input === '?') {
        setShowHelp(true);
      }

      // Quick step type selection
      const num = parseInt(input);
      if (!isNaN(num) && num >= 1 && num <= 5) {
        const types: WorkflowStep['type'][] = ['action', 'decision', 'parallel', 'loop', 'condition'];
        addNewStep(types[num - 1]);
      }
    }
  }, [editMode, selectedStepIndex, plan, showHelp, showDiagram, onCancel, onSave, onExecute]));

  const addNewStep = (type: WorkflowStep['type']) => {
    const newStep: WorkflowStep = {
      id: `step-${Date.now()}`,
      name: `New ${type} step`,
      description: '',
      type,
      status: 'pending'
    };
    setPlan({ ...plan, steps: [...plan.steps, newStep] });
    setSelectedStepIndex(plan.steps.length);
  };

  const renderWorkflowDiagram = () => {
    if (!showDiagram || plan.steps.length === 0) return null;

    const diagram: string[] = [];
    diagram.push('┌─────────────────────────────────────┐');
    diagram.push('│         WORKFLOW DIAGRAM            │');
    diagram.push('└─────────────────────────────────────┘');
    diagram.push('');

    plan.steps.forEach((step, index) => {
      const isSelected = index === selectedStepIndex;
      const prefix = isSelected ? '▶' : ' ';
      const symbol = getStepSymbol(step.type);
      const status = getStatusSymbol(step.status);
      
      // Draw connections
      if (index > 0) {
        diagram.push('    │');
        diagram.push('    ▼');
      }
      
      // Draw step box
      const box = [
        `  ┌${'─'.repeat(35)}┐`,
        `  │ ${symbol} ${step.name.substring(0, 28).padEnd(28)} ${status} │`,
        `  └${'─'.repeat(35)}┘`
      ];
      
      if (isSelected) {
        box.forEach(line => diagram.push(prefix + line));
      } else {
        box.forEach(line => diagram.push(' ' + line));
      }
      
      // Show dependencies
      if (step.dependencies && step.dependencies.length > 0) {
        diagram.push(`     └─ Depends on: ${step.dependencies.join(', ')}`);
      }
    });

    return diagram.join('\n');
  };

  const getStepSymbol = (type: WorkflowStep['type']) => {
    switch (type) {
      case 'action': return '⚡';
      case 'decision': return '◆';
      case 'parallel': return '⫸';
      case 'loop': return '↻';
      case 'condition': return '?';
      default: return '•';
    }
  };

  const getStatusSymbol = (status?: WorkflowStep['status']) => {
    switch (status) {
      case 'completed': return '✓';
      case 'running': return '⟳';
      case 'failed': return '✗';
      case 'skipped': return '⊘';
      default: return '○';
    }
  };

  return (
    <Box flexDirection="column" width="100%">
      {/* Header */}
      <Box borderStyle="double" borderColor={Colors.AccentCyan} paddingX={1}>
        <Text color={Colors.AccentCyan} bold>
          Workflow Planning Interface - {plan.name}
        </Text>
      </Box>

      {/* Main content area */}
      <Box flexDirection="row" marginTop={1}>
        {/* Step list */}
        <Box flexDirection="column" width="40%" marginRight={2}>
          <Box borderStyle="single" paddingX={1}>
            <Text color={Colors.Gray}>Workflow Steps</Text>
          </Box>
          
          <Box flexDirection="column" borderStyle="single" paddingX={1} minHeight={15}>
            {plan.steps.length === 0 ? (
              <Text color={Colors.Gray}>No steps yet. Press 'A' to add.</Text>
            ) : (
              plan.steps.map((step, index) => (
                <Box key={step.id}>
                  <Text
                    color={index === selectedStepIndex ? Colors.AccentCyan : Colors.Foreground}
                    bold={index === selectedStepIndex}
                  >
                    {index === selectedStepIndex ? '▶' : ' '} {index + 1}. {getStepSymbol(step.type)} {step.name}
                  </Text>
                </Box>
              ))
            )}
          </Box>

          {/* Step details */}
          {plan.steps[selectedStepIndex] && (
            <Box flexDirection="column" borderStyle="single" paddingX={1} marginTop={1}>
              <Text color={Colors.AccentBlue} bold>Step Details</Text>
              <Text>Type: {plan.steps[selectedStepIndex].type}</Text>
              <Text>Status: {plan.steps[selectedStepIndex].status || 'pending'}</Text>
              {plan.steps[selectedStepIndex].description && (
                <Text>Description: {plan.steps[selectedStepIndex].description}</Text>
              )}
              {plan.steps[selectedStepIndex].tools && plan.steps[selectedStepIndex].tools!.length > 0 && (
                <Text>Tools: {plan.steps[selectedStepIndex].tools!.join(', ')}</Text>
              )}
              {plan.steps[selectedStepIndex].estimatedTime && (
                <Text>Est. Time: {plan.steps[selectedStepIndex].estimatedTime}s</Text>
              )}
            </Box>
          )}
        </Box>

        {/* Workflow diagram */}
        <Box width="60%">
          <Box borderStyle="single" paddingX={1}>
            <Text color={Colors.Gray}>Workflow Visualization</Text>
          </Box>
          <Box borderStyle="single" paddingX={1} minHeight={20}>
            <Text>{renderWorkflowDiagram() || 'No workflow to display'}</Text>
          </Box>
        </Box>
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
            Navigation: ↑↓/JK | Add Step: A | Edit: E | Delete: D{'\n'}
            Save: S | Execute: X | Toggle Diagram: V | Help: ? | Cancel: ESC{'\n'}
            Quick Add: 1-Action 2-Decision 3-Parallel 4-Loop 5-Condition
          </Text>
        </Box>
      )}

      {/* Status bar */}
      <Box marginTop={1} paddingX={1} borderStyle="single" borderColor={Colors.Gray}>
        <Text color={Colors.Gray}>
          Mode: {editMode} | Steps: {plan.steps.length} | 
          {editMode === 'view' ? ' Press ? for help' : ' Press ESC to return'}
        </Text>
      </Box>
    </Box>
  );
};

/**
 * ASCII workflow diagram generator
 */
export class WorkflowDiagramGenerator {
  /**
   * Generate ASCII diagram from workflow plan
   */
  static generate(plan: WorkflowPlan): string {
    const lines: string[] = [];
    
    // Header
    lines.push('╔════════════════════════════════════════════════════════════════════╗');
    lines.push(`║ WORKFLOW: ${plan.name.padEnd(56)} ║`);
    lines.push('╠════════════════════════════════════════════════════════════════════╣');
    
    if (plan.description) {
      lines.push(`║ ${plan.description.substring(0, 66).padEnd(66)} ║`);
      lines.push('╟────────────────────────────────────────────────────────────────────╢');
    }

    // Steps
    plan.steps.forEach((step, index) => {
      const symbol = this.getStepSymbol(step.type);
      const connector = index === 0 ? '┌─' : index === plan.steps.length - 1 ? '└─' : '├─';
      
      lines.push(`║ ${connector}─[${symbol}] ${step.name.padEnd(56)} ║`);
      
      if (step.type === 'parallel' && index < plan.steps.length - 1) {
        lines.push('║     ├──────────────┬──────────────┬──────────────┐                ║');
        lines.push('║     ▼              ▼              ▼              ▼                ║');
      } else if (step.type === 'decision') {
        lines.push('║     ├─[YES]────────────────────▶                                  ║');
        lines.push('║     └─[NO]─────────────────────▶                                  ║');
      } else if (step.type === 'loop') {
        lines.push('║     ↻─────────────────────────┐                                   ║');
        lines.push('║     └─────────────────────────┘                                   ║');
      } else if (index < plan.steps.length - 1) {
        lines.push('║     │                                                              ║');
        lines.push('║     ▼                                                              ║');
      }
    });

    // Footer
    lines.push('╟────────────────────────────────────────────────────────────────────╢');
    lines.push(`║ Total Steps: ${plan.steps.length} | Est. Duration: ${plan.estimatedDuration || 'N/A'} min`.padEnd(69) + '║');
    lines.push('╚════════════════════════════════════════════════════════════════════╝');

    return lines.join('\n');
  }

  private static getStepSymbol(type: WorkflowStep['type']): string {
    switch (type) {
      case 'action': return 'ACTION';
      case 'decision': return 'DECIDE';
      case 'parallel': return 'PARALLEL';
      case 'loop': return 'LOOP';
      case 'condition': return 'IF';
      default: return 'STEP';
    }
  }
}

/**
 * Workflow template library
 */
export const WorkflowTemplates = {
  fileProcessing: {
    name: 'File Processing Workflow',
    description: 'Process multiple files with validation and error handling',
    steps: [
      { id: '1', name: 'Validate Input Files', type: 'action' as const, description: 'Check file existence and format' },
      { id: '2', name: 'File Type Check', type: 'decision' as const, description: 'Determine processing path based on file type' },
      { id: '3', name: 'Process Files', type: 'parallel' as const, description: 'Process multiple files in parallel' },
      { id: '4', name: 'Validate Results', type: 'action' as const, description: 'Check processing results' },
      { id: '5', name: 'Generate Report', type: 'action' as const, description: 'Create summary report' }
    ]
  },
  
  deployment: {
    name: 'Deployment Workflow',
    description: 'Automated deployment with testing and rollback',
    steps: [
      { id: '1', name: 'Run Tests', type: 'action' as const, description: 'Execute test suite' },
      { id: '2', name: 'Tests Passed?', type: 'decision' as const, description: 'Check test results' },
      { id: '3', name: 'Build Application', type: 'action' as const, description: 'Compile and package' },
      { id: '4', name: 'Deploy to Staging', type: 'action' as const, description: 'Deploy to staging environment' },
      { id: '5', name: 'Run Smoke Tests', type: 'action' as const, description: 'Verify staging deployment' },
      { id: '6', name: 'Deploy to Production', type: 'action' as const, description: 'Deploy to production' },
      { id: '7', name: 'Monitor Metrics', type: 'loop' as const, description: 'Monitor for 5 minutes' }
    ]
  },
  
  dataSync: {
    name: 'Data Synchronization',
    description: 'Sync data between multiple sources',
    steps: [
      { id: '1', name: 'Connect to Sources', type: 'parallel' as const, description: 'Connect to all data sources' },
      { id: '2', name: 'Fetch Changes', type: 'action' as const, description: 'Get changed records' },
      { id: '3', name: 'Has Changes?', type: 'condition' as const, description: 'Check if changes exist' },
      { id: '4', name: 'Transform Data', type: 'action' as const, description: 'Apply transformations' },
      { id: '5', name: 'Apply Changes', type: 'parallel' as const, description: 'Update all targets' },
      { id: '6', name: 'Verify Sync', type: 'action' as const, description: 'Validate synchronization' }
    ]
  }
};