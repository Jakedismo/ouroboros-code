/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import { Colors } from '../colors.js';
import { AgentConfig } from '../../agents/registry/agent-storage.js';

// AgentInfo type (subset of AgentConfig for list display)
export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  category: 'built-in' | 'custom';
  author?: string;
  version?: string;
  lastUsed?: string;
  isActive?: boolean;
}
import { AgentPreviewPanel } from './AgentPreviewPanel.js';

/**
 * Agent activation TUI props
 */
export interface AgentActivationTUIProps {
  agents: AgentInfo[];
  currentAgentId?: string;
  onActivate: (agentId: string) => Promise<void>;
  onCancel: () => void;
  onPreview?: (agentId: string) => void;
}

/**
 * Interactive agent activation interface
 */
export const AgentActivationTUI: React.FC<AgentActivationTUIProps> = ({
  agents,
  currentAgentId,
  onActivate,
  onCancel,
  onPreview
}) => {
  const [selectedAgentId, setSelectedAgentId] = useState<string>(currentAgentId || agents[0]?.id || '');
  const [previewAgent, setPreviewAgent] = useState<AgentConfig | null>(null);
  const [isActivating, setIsActivating] = useState(false);
  const [activationStatus, setActivationStatus] = useState<string>('');
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Get full agent config for preview
  const loadPreview = useCallback(async (agentId: string) => {
    // In a real implementation, this would load from AgentManager
    const agent = agents.find(a => a.id === agentId);
    if (agent) {
      setPreviewAgent({
        ...agent,
        systemPrompt: agent.description, // Placeholder
        tools: [],
        behaviors: {},
        examples: []
      } as any);
      onPreview?.(agentId);
    }
  }, [agents, onPreview]);

  // Load preview when selection changes
  useEffect(() => {
    if (selectedAgentId) {
      loadPreview(selectedAgentId);
    }
  }, [selectedAgentId, loadPreview]);

  // Handle keyboard input
  useInput(useCallback((input, key) => {
    if (key.escape || (input === 'q' && !showConfirmation)) {
      onCancel();
      return;
    }

    if (showConfirmation) {
      if (input === 'y' || input === 'Y') {
        handleActivation();
      } else if (input === 'n' || input === 'N' || key.escape) {
        setShowConfirmation(false);
      }
      return;
    }

    if (key.return || input === ' ') {
      if (selectedAgentId === currentAgentId) {
        setActivationStatus('This agent is already active');
      } else {
        setShowConfirmation(true);
      }
      return;
    }

    // Navigation with j/k or arrow keys
    const currentIndex = agents.findIndex(a => a.id === selectedAgentId);
    if ((key.upArrow || input === 'k') && currentIndex > 0) {
      setSelectedAgentId(agents[currentIndex - 1].id);
    } else if ((key.downArrow || input === 'j') && currentIndex < agents.length - 1) {
      setSelectedAgentId(agents[currentIndex + 1].id);
    }

    // Quick jump by number
    const num = parseInt(input);
    if (!isNaN(num) && num >= 1 && num <= agents.length) {
      setSelectedAgentId(agents[num - 1].id);
    }

    // Quick actions
    if (input === 'a' || input === 'A') {
      if (selectedAgentId !== currentAgentId) {
        setShowConfirmation(true);
      }
    }

    if (input === 'p' || input === 'P') {
      // Toggle preview panel size
      // This would be implemented with state management
    }

    if (input === '?') {
      // Show help - would display keyboard shortcuts
    }
  }, [selectedAgentId, currentAgentId, agents, showConfirmation, onCancel]));

  const handleActivation = async () => {
    setIsActivating(true);
    setShowConfirmation(false);
    setActivationStatus('Activating...');

    try {
      await onActivate(selectedAgentId);
      setActivationStatus('Agent activated successfully!');
      setTimeout(() => {
        onCancel(); // Close the TUI after successful activation
      }, 1500);
    } catch (error: any) {
      setActivationStatus(`Activation failed: ${error.message}`);
      setIsActivating(false);
    }
  };

  const getAgentIcon = (agent: AgentInfo) => {
    if (agent.id === currentAgentId) return '[*]';
    if (agent.category === 'built-in') return '[B]';
    return '[C]';
  };

  const getAgentColor = (agent: AgentInfo) => {
    if (agent.id === currentAgentId) return Colors.AccentGreen;
    if (agent.id === selectedAgentId) return Colors.AccentCyan;
    if (agent.category === 'built-in') return Colors.AccentBlue;
    return Colors.Foreground;
  };

  return (
    <Box flexDirection="column" width="100%">
      {/* Header */}
      <Box marginBottom={1} paddingX={1}>
        <Text color={Colors.AccentCyan} bold>
          Agent Activation Interface
        </Text>
      </Box>

      {/* Main content area */}
      <Box flexDirection="row" height={20}>
        {/* Agent list */}
        <Box flexDirection="column" width="40%" marginRight={1}>
          <Box borderStyle="single" paddingX={1}>
            <Text color={Colors.Gray}>Agent List</Text>
          </Box>
          
          <Box flexDirection="column" borderStyle="single" paddingX={1} height={18}>
            {agents.map((agent, index) => (
              <Box key={agent.id} marginY={0}>
                <Text
                  color={getAgentColor(agent)}
                  bold={agent.id === selectedAgentId}
                >
                  {getAgentIcon(agent)} {index + 1}. {agent.name}
                  {agent.id === currentAgentId && (
                    <Text color={Colors.AccentGreen}> (active)</Text>
                  )}
                </Text>
              </Box>
            ))}
          </Box>
        </Box>

        {/* Preview panel */}
        <Box width="60%">
          {previewAgent && (
            <AgentPreviewPanel
              agent={previewAgent}
              visible={true}
              compact={true}
              showFullSystemPrompt={false}
              showUsageStats={true}
            />
          )}
        </Box>
      </Box>

      {/* Confirmation dialog */}
      {showConfirmation && (
        <Box
          borderStyle="double"
          borderColor={Colors.AccentYellow}
          paddingX={2}
          paddingY={1}
          marginTop={1}
        >
          <Text color={Colors.AccentYellow}>
            Activate agent "{agents.find(a => a.id === selectedAgentId)?.name}"? (Y/N)
          </Text>
        </Box>
      )}

      {/* Status message */}
      {activationStatus && (
        <Box marginTop={1} paddingX={1}>
          <Text color={isActivating ? Colors.AccentYellow : Colors.AccentGreen}>
            {activationStatus}
          </Text>
        </Box>
      )}

      {/* Footer with instructions */}
      <Box marginTop={1} paddingX={1} borderStyle="single" borderColor={Colors.Gray}>
        <Text color={Colors.Gray}>
          Navigate: ↑↓/JK | Select: Enter/Space | Activate: A | Cancel: ESC/Q | Help: ?
        </Text>
      </Box>
    </Box>
  );
};

/**
 * Quick agent switcher component (compact version)
 */
export const QuickAgentSwitcher: React.FC<{
  agents: AgentInfo[];
  currentAgentId?: string;
  onSwitch: (agentId: string) => void;
}> = ({ agents, currentAgentId, onSwitch }) => {
  const items = agents.map(agent => ({
    label: `${agent.name} ${agent.id === currentAgentId ? '(active)' : ''}`,
    value: agent.id
  }));

  return (
    <Box flexDirection="column">
      <Text color={Colors.AccentCyan} bold>Quick Agent Switch</Text>
      <Box marginTop={1}>
        <SelectInput
          items={items}
          onSelect={(item) => onSwitch(item.value)}
        />
      </Box>
    </Box>
  );
};

/**
 * Agent comparison view
 */
export const AgentComparisonView: React.FC<{
  agent1: AgentConfig;
  agent2: AgentConfig;
  onSelectAgent: (agentId: string) => void;
}> = ({ agent1, agent2, onSelectAgent }) => {
  const [selectedSide, setSelectedSide] = useState<'left' | 'right'>('left');

  useInput((input, key) => {
    if (key.leftArrow || input === 'h') {
      setSelectedSide('left');
    } else if (key.rightArrow || input === 'l') {
      setSelectedSide('right');
    } else if (key.return || input === ' ') {
      onSelectAgent(selectedSide === 'left' ? agent1.id : agent2.id);
    }
  });

  return (
    <Box flexDirection="row" width="100%">
      {/* Agent 1 */}
      <Box
        width="50%"
        borderStyle={selectedSide === 'left' ? 'double' : 'single'}
        borderColor={selectedSide === 'left' ? Colors.AccentCyan : Colors.Gray}
        paddingX={1}
      >
        <Box flexDirection="column">
          <Text color={Colors.AccentCyan} bold>{agent1.name}</Text>
          <Text color={Colors.Gray}>{agent1.category}</Text>
          <Box marginTop={1}>
            <Text>{agent1.description}</Text>
          </Box>
          <Box marginTop={1}>
            <Text color={Colors.AccentBlue}>Tools: {agent1.toolConfiguration?.enabledTools?.length || 0}</Text>
          </Box>
          <Box>
            <Text color={Colors.AccentGreen}>
              Rating: {'N/A'}
            </Text>
          </Box>
        </Box>
      </Box>

      {/* Divider */}
      <Box width={1} marginX={1}>
        <Text color={Colors.Gray}>│</Text>
      </Box>

      {/* Agent 2 */}
      <Box
        width="50%"
        borderStyle={selectedSide === 'right' ? 'double' : 'single'}
        borderColor={selectedSide === 'right' ? Colors.AccentCyan : Colors.Gray}
        paddingX={1}
      >
        <Box flexDirection="column">
          <Text color={Colors.AccentCyan} bold>{agent2.name}</Text>
          <Text color={Colors.Gray}>{agent2.category}</Text>
          <Box marginTop={1}>
            <Text>{agent2.description}</Text>
          </Box>
          <Box marginTop={1}>
            <Text color={Colors.AccentBlue}>Tools: {agent2.toolConfiguration?.enabledTools?.length || 0}</Text>
          </Box>
          <Box>
            <Text color={Colors.AccentGreen}>
              Rating: {'N/A'}
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};