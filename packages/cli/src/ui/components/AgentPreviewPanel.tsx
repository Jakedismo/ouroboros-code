/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { isNarrowWidth } from '../utils/isNarrowWidth.js';
import { AgentConfig } from './AgentListTUI.js';

/**
 * Props for AgentPreviewPanel component
 */
export interface AgentPreviewPanelProps {
  agent: AgentConfig | null;
  visible: boolean;
  width?: number;
  showFullSystemPrompt?: boolean;
  showUsageStats?: boolean;
  compact?: boolean;
}

/**
 * Detailed preview panel for displaying agent information
 */
export const AgentPreviewPanel: React.FC<AgentPreviewPanelProps> = ({
  agent,
  visible,
  width = 50,
  showFullSystemPrompt = false,
  showUsageStats = true,
  compact = false
}) => {
  if (!visible || !agent) {
    return null;
  }

  const isNarrow = isNarrowWidth(width);
  
  const getCategoryColor = (category: string): string => {
    switch (category) {
      case 'built-in': return Colors.AccentBlue;
      case 'custom': return Colors.AccentPurple;
      default: return Colors.Gray;
    }
  };

  const getCapabilityIcon = (capability: string): string => {
    const icons: Record<string, string> = {
      fileOperations: '📁',
      shellCommands: '💻',
      webResearch: '🔍',
      appleControl: '🍎',
      emailCalendar: '📧',
      dockerManagement: '🐳'
    };
    return icons[capability] || '🔧';
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString();
  };

  const truncateText = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const renderHeader = () => (
    <Box flexDirection="column" marginBottom={1}>
      <Box justifyContent="space-between">
        <Text color={getCategoryColor(agent.category)} bold>
          🤖 {agent.name}
        </Text>
        <Text color={Colors.Gray}>
          v{agent.version}
        </Text>
      </Box>
      
      <Box justifyContent="space-between">
        <Text color={Colors.AccentPurple}>
          {agent.category}
        </Text>
        {agent.metadata?.userRating && (
          <Text color={Colors.AccentYellow}>
            {'★'.repeat(Math.round(agent.metadata.userRating))}
            {' '}
            ({agent.metadata.userRating.toFixed(1)})
          </Text>
        )}
      </Box>
    </Box>
  );

  const renderDescription = () => (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={Colors.AccentBlue} bold>📝 Description:</Text>
      <Text color={Colors.Foreground} wrap="wrap">
        {agent.description}
      </Text>
    </Box>
  );

  const renderAuthorInfo = () => (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={Colors.AccentGreen} bold>👤 Author Information:</Text>
      <Text color={Colors.Gray}>Author: {agent.author}</Text>
      <Text color={Colors.Gray}>Created: {formatDate(agent.created)}</Text>
      <Text color={Colors.Gray}>Modified: {formatDate(agent.modified)}</Text>
    </Box>
  );

  const renderCapabilities = () => {
    if (!agent.capabilities) return null;

    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text color={Colors.AccentPurple} bold>🛠️ Capabilities:</Text>
        
        {/* Tool capabilities */}
        <Box flexDirection="column" marginLeft={2}>
          <Text color={Colors.AccentBlue} bold>Tools:</Text>
          <Box flexWrap="wrap" marginLeft={1}>
            {Object.entries(agent.capabilities.tools)
              .filter(([_, enabled]) => enabled)
              .map(([capability, _]) => (
                <Box key={capability} marginRight={2}>
                  <Text color={Colors.AccentGreen}>
                    {getCapabilityIcon(capability)} {capability}
                  </Text>
                </Box>
              ))
            }
          </Box>
        </Box>

        {/* Special behaviors */}
        {agent.capabilities.specialBehaviors.length > 0 && (
          <Box flexDirection="column" marginLeft={2} marginTop={1}>
            <Text color={Colors.AccentBlue} bold>Special Behaviors:</Text>
            <Box flexDirection="column" marginLeft={1}>
              {agent.capabilities.specialBehaviors.map((behavior, index) => (
                <Text key={index} color={Colors.AccentYellow}>
                  • {behavior}
                </Text>
              ))}
            </Box>
          </Box>
        )}
      </Box>
    );
  };

  const renderToolConfiguration = () => {
    if (!agent.toolConfiguration || !agent.toolConfiguration.enabledTools.length) {
      return null;
    }

    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text color={Colors.AccentPurple} bold>⚙️ Tool Configuration:</Text>
        <Box flexDirection="column" marginLeft={2}>
          <Text color={Colors.Gray}>
            Enabled Tools ({agent.toolConfiguration.enabledTools.length}):
          </Text>
          <Box flexWrap="wrap" marginLeft={1}>
            {agent.toolConfiguration.enabledTools.slice(0, isNarrow ? 5 : 10).map((tool, index) => (
              <Box key={index} marginRight={1}><Text color={Colors.AccentBlue}>
                • {tool}
              </Text></Box>
            ))}
            {agent.toolConfiguration.enabledTools.length > (isNarrow ? 5 : 10) && (
              <Text color={Colors.Gray}>
                ... and {agent.toolConfiguration.enabledTools.length - (isNarrow ? 5 : 10)} more
              </Text>
            )}
          </Box>
        </Box>
      </Box>
    );
  };

  const renderUsageStats = () => {
    if (!showUsageStats || !agent.metadata) return null;

    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text color={Colors.AccentGreen} bold>📊 Usage Statistics:</Text>
        <Box flexDirection="column" marginLeft={2}>
          <Text color={Colors.Gray}>
            Usage Count: {agent.metadata.usageCount}
          </Text>
          {agent.metadata.lastUsed && (
            <Text color={Colors.Gray}>
              Last Used: {formatDate(agent.metadata.lastUsed)}
            </Text>
          )}
          <Text color={Colors.Gray}>
            Effectiveness: {(agent.metadata.effectiveness * 100).toFixed(1)}%
          </Text>
          <Text color={Colors.AccentYellow}>
            User Rating: {'★'.repeat(Math.round(agent.metadata.userRating))} 
            {' '}({agent.metadata.userRating.toFixed(1)}/5)
          </Text>
        </Box>
      </Box>
    );
  };

  const renderSystemPrompt = () => {
    const promptPreview = showFullSystemPrompt 
      ? agent.systemPrompt 
      : truncateText(agent.systemPrompt, compact ? 200 : 500);

    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text color={Colors.AccentRed} bold>
          📋 System Prompt {!showFullSystemPrompt && '(Preview):'}
        </Text>
        <Box 
          flexDirection="column" 
          marginLeft={2} 
          borderStyle="round" 
          borderColor={Colors.Gray}
          paddingX={1}
          height={compact ? 8 : 15}
        >
          <Text color={Colors.Foreground} wrap="wrap">
            {promptPreview}
          </Text>
          {!showFullSystemPrompt && agent.systemPrompt.length > (compact ? 200 : 500) && (
            <Text color={Colors.Gray} italic>
              ... ({agent.systemPrompt.length - (compact ? 200 : 500)} more characters)
            </Text>
          )}
        </Box>
      </Box>
    );
  };

  const renderActions = () => (
    <Box flexDirection="column" marginTop={1}>
      <Text color={Colors.AccentBlue} bold>⚡ Available Actions:</Text>
      <Box flexDirection="column" marginLeft={2}>
        <Text color={Colors.AccentGreen}>• ENTER - Activate this agent</Text>
        <Text color={Colors.AccentYellow}>• E - Edit agent configuration</Text>
        <Text color={Colors.AccentRed}>• D - Delete agent (custom only)</Text>
        <Text color={Colors.AccentPurple}>• C - Copy agent configuration</Text>
      </Box>
    </Box>
  );

  return (
    <Box
      width={width}
      flexDirection="column"
      borderStyle="round"
      borderColor={Colors.AccentBlue}
      paddingX={1}
      paddingY={1}
    >
      {renderHeader()}
      {renderDescription()}
      {renderAuthorInfo()}
      {renderCapabilities()}
      {renderToolConfiguration()}
      {renderUsageStats()}
      {renderSystemPrompt()}
      {!compact && renderActions()}
    </Box>
  );
};

/**
 * Compact agent card for grid layouts
 */
export const AgentCard: React.FC<{
  agent: AgentConfig;
  selected?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  width?: number;
}> = ({
  agent,
  selected = false,
  onClick,
  onDoubleClick,
  width = 30
}) => {
  const getCategoryColor = (category: string): string => {
    switch (category) {
      case 'built-in': return Colors.AccentBlue;
      case 'custom': return Colors.AccentPurple;
      default: return Colors.Gray;
    }
  };

  return (
    <Box
      width={width}
      flexDirection="column"
      borderStyle={selected ? "double" : "round"}
      borderColor={selected ? Colors.AccentGreen : Colors.Gray}
      paddingX={1}
      paddingY={1}
      marginBottom={1}
    >
      {/* Header */}
      <Box justifyContent="space-between">
        <Text color={getCategoryColor(agent.category)} bold>
          🤖 {agent.name}
        </Text>
        <Text color={Colors.Gray}>
          v{agent.version}
        </Text>
      </Box>

      {/* Description */}
      <Text color={Colors.Foreground} wrap="wrap">
        {agent.description.length > 100 
          ? agent.description.substring(0, 100) + '...' 
          : agent.description}
      </Text>

      {/* Stats */}
      <Box justifyContent="space-between" marginTop={1}>
        <Text color={Colors.Gray}>
          {agent.category}
        </Text>
        {agent.metadata && (
          <Box>
            <Text color={Colors.AccentYellow}>
              {'★'.repeat(Math.round(agent.metadata.userRating))}
            </Text>
            <Box marginLeft={1}><Text color={Colors.Gray}>
              ({agent.metadata.usageCount})
            </Text></Box>
          </Box>
        )}
      </Box>

      {/* Capabilities summary */}
      {agent.capabilities && (
        <Box marginTop={1}>
          <Text color={Colors.AccentBlue}>
            🛠️ {Object.values(agent.capabilities.tools).filter(Boolean).length} tools
          </Text>
          {agent.capabilities.specialBehaviors.length > 0 && (
            <Box marginLeft={1}><Text color={Colors.AccentGreen}>
              🎯 {agent.capabilities.specialBehaviors.length} behaviors
            </Text></Box>
          )}
        </Box>
      )}

      {/* Selection indicator */}
      {selected && (
        <Box marginTop={1}>
          <Text color={Colors.AccentGreen}>
            ▶ Selected
          </Text>
        </Box>
      )}
    </Box>
  );
};