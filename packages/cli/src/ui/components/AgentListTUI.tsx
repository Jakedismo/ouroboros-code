/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { isNarrowWidth } from '../utils/isNarrowWidth.js';

/**
 * Agent configuration interface (matches registry)
 */
export interface AgentConfig {
  id: string;
  name: string;
  version: string;
  category: 'built-in' | 'custom';
  description: string;
  author: string;
  created: string;
  modified: string;
  systemPrompt: string;
  capabilities?: {
    tools: {
      fileOperations: boolean;
      shellCommands: boolean;
      webResearch: boolean;
      appleControl: boolean;
      emailCalendar: boolean;
      dockerManagement: boolean;
    };
    specialBehaviors: string[];
  };
  toolConfiguration?: {
    enabledTools: string[];
    customToolOptions: Record<string, any>;
  };
  metadata?: {
    usageCount: number;
    lastUsed: string | null;
    effectiveness: number;
    userRating: number;
  };
}

/**
 * Agent list display modes
 */
export enum AgentListMode {
  LIST = 'list',           // Simple list view
  GRID = 'grid',           // Grid layout with cards
  DETAIL = 'detail',       // Detailed single view
  COMPARISON = 'comparison' // Side-by-side comparison
}

/**
 * Filter and sort options
 */
export interface AgentFilterOptions {
  category?: 'built-in' | 'custom' | 'all';
  hasCapability?: string;
  searchTerm?: string;
  sortBy?: 'name' | 'usage' | 'rating' | 'recent';
  sortDirection?: 'asc' | 'desc';
}

/**
 * Props for AgentListTUI component
 */
export interface AgentListTUIProps {
  visible: boolean;
  agents: AgentConfig[];
  selectedAgentId?: string;
  mode?: AgentListMode;
  allowSelection?: boolean;
  allowMultiSelect?: boolean;
  showPreview?: boolean;
  onAgentSelect?: (agent: AgentConfig) => void;
  onAgentActivate?: (agent: AgentConfig) => void;
  onAgentEdit?: (agent: AgentConfig) => void;
  onAgentDelete?: (agent: AgentConfig) => void;
  onModeChange?: (mode: AgentListMode) => void;
  onFilterChange?: (filters: AgentFilterOptions) => void;
  onDismiss?: () => void;
}

/**
 * Interactive TUI component for browsing and selecting agents
 */
export const AgentListTUI: React.FC<AgentListTUIProps> = ({
  visible,
  agents = [],
  selectedAgentId,
  mode = AgentListMode.LIST,
  allowSelection = true,
  allowMultiSelect = false,
  showPreview = true,
  onAgentSelect,
  onAgentActivate,
  onAgentEdit,
  onAgentDelete,
  onModeChange,
  onFilterChange,
  onDismiss
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [currentMode, setCurrentMode] = useState<AgentListMode>(mode);
  const [filters, setFilters] = useState<AgentFilterOptions>({
    category: 'all',
    sortBy: 'name',
    sortDirection: 'asc'
  });
  const [searchMode, setSearchMode] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());

  const { columns: terminalWidth, rows: terminalHeight } = useTerminalSize();
  const isNarrow = isNarrowWidth(terminalWidth);

  // Filter and sort agents based on current filters
  const filteredAgents = React.useMemo(() => {
    let filtered = [...agents];

    // Category filter
    if (filters.category && filters.category !== 'all') {
      filtered = filtered.filter(agent => agent.category === filters.category);
    }

    // Search term filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(agent => 
        agent.name.toLowerCase().includes(term) ||
        agent.description.toLowerCase().includes(term) ||
        agent.author.toLowerCase().includes(term) ||
        agent.id.toLowerCase().includes(term)
      );
    }

    // Capability filter
    if (filters.hasCapability) {
      filtered = filtered.filter(agent => {
        if (!agent.capabilities) return false;
        const capability = filters.hasCapability as keyof typeof agent.capabilities.tools;
        return agent.capabilities.tools[capability] === true;
      });
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (filters.sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'usage':
          comparison = (a.metadata?.usageCount || 0) - (b.metadata?.usageCount || 0);
          break;
        case 'rating':
          comparison = (a.metadata?.userRating || 0) - (b.metadata?.userRating || 0);
          break;
        case 'recent':
          const aDate = new Date(a.metadata?.lastUsed || a.modified).getTime();
          const bDate = new Date(b.metadata?.lastUsed || b.modified).getTime();
          comparison = aDate - bDate;
          break;
        default:
          comparison = a.name.localeCompare(b.name);
      }

      return filters.sortDirection === 'desc' ? -comparison : comparison;
    });

    return filtered;
  }, [agents, filters, searchTerm]);

  // Handle keyboard input
  useInput((input, key) => {
    if (!visible) return;

    // Handle search mode
    if (searchMode) {
      if (key.escape) {
        setSearchMode(false);
        setSearchTerm('');
        return;
      }
      if (key.return) {
        setSearchMode(false);
        return;
      }
      if (key.backspace) {
        setSearchTerm(prev => prev.slice(0, -1));
        return;
      }
      if (input && input.length === 1) {
        setSearchTerm(prev => prev + input);
        return;
      }
      return;
    }

    // Handle normal mode
    if (key.escape) {
      onDismiss?.();
      return;
    }

    switch (input.toLowerCase()) {
      case 'j':
        if (key.downArrow || input === 'j') {
          setSelectedIndex(prev => Math.min(prev + 1, filteredAgents.length - 1));
        }
        break;
      
      case 'k':
        if (key.upArrow || input === 'k') {
          setSelectedIndex(prev => Math.max(prev - 1, 0));
        }
        break;
      
      case 'g':
        setSelectedIndex(0);
        break;
      
      case 'G':
        setSelectedIndex(filteredAgents.length - 1);
        break;
      
      case '/':
        setSearchMode(true);
        setSearchTerm('');
        break;
      
      case 'c':
        // Toggle category filter
        const categories: Array<'all' | 'built-in' | 'custom'> = ['all', 'built-in', 'custom'];
        const currentIndex = categories.indexOf(filters.category || 'all');
        const nextCategory = categories[(currentIndex + 1) % categories.length];
        const newFilters = { ...filters, category: nextCategory };
        setFilters(newFilters);
        onFilterChange?.(newFilters);
        break;
      
      case 's':
        // Toggle sort options
        const sortOptions: Array<'name' | 'usage' | 'rating' | 'recent'> = ['name', 'usage', 'rating', 'recent'];
        const currentSortIndex = sortOptions.indexOf(filters.sortBy || 'name');
        const nextSort = sortOptions[(currentSortIndex + 1) % sortOptions.length];
        const newSortFilters = { ...filters, sortBy: nextSort };
        setFilters(newSortFilters);
        onFilterChange?.(newSortFilters);
        break;
      
      case 'r':
        // Reverse sort direction
        const newDirectionFilters = { 
          ...filters, 
          sortDirection: filters.sortDirection === 'asc' ? ('desc' as const) : ('asc' as const)
        };
        setFilters(newDirectionFilters);
        onFilterChange?.(newDirectionFilters);
        break;
      
      case 'm':
        // Toggle display mode
        const modes = Object.values(AgentListMode);
        const currentModeIndex = modes.indexOf(currentMode);
        const nextMode = modes[(currentModeIndex + 1) % modes.length];
        setCurrentMode(nextMode);
        onModeChange?.(nextMode);
        break;
      
      case ' ':
        // Toggle selection for multi-select
        if (allowMultiSelect && filteredAgents[selectedIndex]) {
          const agentId = filteredAgents[selectedIndex].id;
          setSelectedAgents(prev => {
            const newSet = new Set(prev);
            if (newSet.has(agentId)) {
              newSet.delete(agentId);
            } else {
              newSet.add(agentId);
            }
            return newSet;
          });
        }
        break;
      
      case 'enter':
        if (key.return && filteredAgents[selectedIndex]) {
          const selectedAgent = filteredAgents[selectedIndex];
          if (allowSelection) {
            onAgentSelect?.(selectedAgent);
          }
          onAgentActivate?.(selectedAgent);
        }
        break;
      
      case 'e':
        if (filteredAgents[selectedIndex]) {
          onAgentEdit?.(filteredAgents[selectedIndex]);
        }
        break;
      
      case 'd':
        if (filteredAgents[selectedIndex]) {
          onAgentDelete?.(filteredAgents[selectedIndex]);
        }
        break;
    }
  }, { isActive: visible });

  // Update selected index when filtered agents change
  useEffect(() => {
    if (selectedIndex >= filteredAgents.length) {
      setSelectedIndex(Math.max(0, filteredAgents.length - 1));
    }
  }, [filteredAgents.length, selectedIndex]);

  if (!visible) {
    return null;
  }

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

  const renderAgentCard = (agent: AgentConfig, index: number, isSelected: boolean): React.ReactNode => {
    const isMultiSelected = selectedAgents.has(agent.id);
    const isCurrentAgent = agent.id === selectedAgentId;
    
    return (
      <Box
        key={agent.id}
        flexDirection="column"
        marginY={currentMode === AgentListMode.GRID ? 0 : 1}
        marginX={currentMode === AgentListMode.GRID ? 1 : 0}
        paddingX={1}
        paddingY={currentMode === AgentListMode.LIST ? 0 : 1}
        borderStyle={isSelected ? "double" : "round"}
        borderColor={
          isSelected ? Colors.AccentGreen :
          isCurrentAgent ? Colors.AccentBlue :
          isMultiSelected ? Colors.AccentPurple :
          Colors.Gray
        }
        width={currentMode === AgentListMode.GRID ? Math.floor((terminalWidth - 6) / 2) : undefined}
      >
        {/* Header with name and status */}
        <Box justifyContent="space-between">
          <Text color={getCategoryColor(agent.category)} bold>
            {isMultiSelected && '✓ '}
            {isCurrentAgent && '⚡ '}
            {agent.name}
          </Text>
          <Box>
            <Text color={Colors.Gray}>v{agent.version}</Text>
            {agent.metadata?.userRating && (
              <Box marginLeft={1}><Text color={Colors.AccentYellow}>
                {'★'.repeat(Math.round(agent.metadata.userRating))}
              </Text></Box>
            )}
          </Box>
        </Box>

        {/* Description */}
        <Text color={Colors.Foreground} wrap="wrap">
          {agent.description}
        </Text>

        {/* Capabilities (if showing details) */}
        {(currentMode === AgentListMode.DETAIL || showPreview) && agent.capabilities && (
          <Box marginTop={1} flexDirection="column">
            <Text color={Colors.AccentPurple} bold>🛠️ Capabilities:</Text>
            <Box flexWrap="wrap">
              {Object.entries(agent.capabilities.tools)
                .filter(([_, enabled]) => enabled)
                .map(([capability, _]) => (
                  <Box key={capability} marginRight={1}><Text color={Colors.AccentBlue}>
                    {getCapabilityIcon(capability)} {capability}
                  </Text></Box>
                ))
              }
            </Box>
            {agent.capabilities.specialBehaviors.length > 0 && (
              <Box marginTop={1}><Text color={Colors.AccentGreen}>
                🎯 Special: {agent.capabilities.specialBehaviors.join(', ')}
              </Text></Box>
            )}
          </Box>
        )}

        {/* Metadata */}
        {currentMode === AgentListMode.DETAIL && agent.metadata && (
          <Box marginTop={1} flexDirection="column">
            <Text color={Colors.Gray}>
              📊 Used {agent.metadata.usageCount} times
              {agent.metadata.lastUsed && ` • Last: ${new Date(agent.metadata.lastUsed).toLocaleDateString()}`}
            </Text>
            <Text color={Colors.Gray}>
              👤 {agent.author} • Created: {new Date(agent.created).toLocaleDateString()}
            </Text>
          </Box>
        )}

        {/* Selection indicator */}
        {isSelected && (
          <Box marginTop={1}>
            <Text color={Colors.AccentGreen}>
              {allowSelection ? '▶ Press ENTER to activate • E to edit • D to delete' : '▶ Press ENTER to view details'}
            </Text>
          </Box>
        )}
      </Box>
    );
  };

  const renderHeader = (): React.ReactNode => (
    <Box marginBottom={1} justifyContent="space-between">
      <Text color={Colors.AccentBlue} bold>
        🤖 Agent Registry ({filteredAgents.length}/{agents.length})
      </Text>
      <Text color={Colors.Gray}>
        Mode: {currentMode} • Sort: {filters.sortBy} {filters.sortDirection === 'desc' ? '↓' : '↑'}
      </Text>
    </Box>
  );

  const renderFilters = (): React.ReactNode => (
    <Box marginBottom={1} justifyContent="space-between">
      <Box>
        <Text color={Colors.AccentPurple}>
          📂 Category: {filters.category || 'all'}
        </Text>
        {searchTerm && (
          <Box marginLeft={2}><Text color={Colors.AccentYellow}>
            🔍 Search: "{searchTerm}"
          </Text></Box>
        )}
      </Box>
      <Text color={Colors.Gray}>
        {filteredAgents.length > 0 ? `${selectedIndex + 1}/${filteredAgents.length}` : 'No matches'}
      </Text>
    </Box>
  );

  const renderSearchBar = (): React.ReactNode => {
    if (!searchMode) return null;
    
    return (
      <Box marginBottom={1} borderStyle="round" borderColor={Colors.AccentYellow} paddingX={1}>
        <Text color={Colors.AccentYellow}>🔍 Search: </Text>
        <Text color={Colors.Foreground}>{searchTerm}</Text>
        <Text color={Colors.AccentYellow}>▊</Text>
        <Box marginLeft={2}><Text color={Colors.Gray}>(ESC to cancel)</Text></Box>
      </Box>
    );
  };

  const renderAgentList = (): React.ReactNode => {
    if (filteredAgents.length === 0) {
      return (
        <Box justifyContent="center" marginTop={2}>
          <Text color={Colors.Gray}>
            {searchTerm || filters.category !== 'all' ? 
              '🔍 No agents match your current filters' : 
              '📭 No agents available'
            }
          </Text>
        </Box>
      );
    }

    const visibleAgents = currentMode === AgentListMode.DETAIL 
      ? [filteredAgents[selectedIndex]] 
      : filteredAgents;

    const containerHeight = terminalHeight - 8; // Reserve space for header, filters, and controls
    const startIndex = currentMode === AgentListMode.DETAIL ? 0 : Math.max(0, selectedIndex - Math.floor(containerHeight / 3));
    const endIndex = currentMode === AgentListMode.DETAIL ? 1 : Math.min(visibleAgents.length, startIndex + containerHeight);
    
    return (
      <Box flexDirection="column" height={containerHeight}>
        {visibleAgents.slice(startIndex, endIndex).map((agent, index) => {
          const actualIndex = currentMode === AgentListMode.DETAIL ? selectedIndex : startIndex + index;
          return renderAgentCard(agent, actualIndex, actualIndex === selectedIndex);
        })}
      </Box>
    );
  };

  const renderControls = (): React.ReactNode => (
    <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor={Colors.Gray} paddingX={1}>
      <Text color={Colors.AccentGreen} bold>🎮 Controls:</Text>
      <Box flexDirection={isNarrow ? 'column' : 'row'} gap={2}>
        <Box flexDirection="column">
          <Text color={Colors.Gray}>• <Text color={Colors.Foreground}>↑↓/J/K</Text> Navigate</Text>
          <Text color={Colors.Gray}>• <Text color={Colors.Foreground}>ENTER</Text> {allowSelection ? 'Activate' : 'View'}</Text>
          <Text color={Colors.Gray}>• <Text color={Colors.Foreground}>/</Text> Search</Text>
          <Text color={Colors.Gray}>• <Text color={Colors.Foreground}>ESC</Text> Close</Text>
        </Box>
        <Box flexDirection="column">
          <Text color={Colors.Gray}>• <Text color={Colors.Foreground}>C</Text> Category filter</Text>
          <Text color={Colors.Gray}>• <Text color={Colors.Foreground}>S</Text> Sort by</Text>
          <Text color={Colors.Gray}>• <Text color={Colors.Foreground}>R</Text> Reverse sort</Text>
          <Text color={Colors.Gray}>• <Text color={Colors.Foreground}>M</Text> Display mode</Text>
        </Box>
        {allowSelection && (
          <Box flexDirection="column">
            <Text color={Colors.Gray}>• <Text color={Colors.Foreground}>E</Text> Edit agent</Text>
            <Text color={Colors.Gray}>• <Text color={Colors.Foreground}>D</Text> Delete agent</Text>
            {allowMultiSelect && (
              <Text color={Colors.Gray}>• <Text color={Colors.Foreground}>SPACE</Text> Multi-select</Text>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );

  return (
    <Box 
      width={terminalWidth} 
      height={terminalHeight}
      flexDirection="column" 
      paddingX={2}
      borderStyle="double" 
      borderColor={Colors.AccentBlue}
    >
      {renderHeader()}
      {renderFilters()}
      {renderSearchBar()}
      {renderAgentList()}
      {renderControls()}
    </Box>
  );
};

/**
 * Hook for managing agent list TUI state
 */
export const useAgentListTUI = () => {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<AgentListMode>(AgentListMode.LIST);
  const [filters, setFilters] = useState<AgentFilterOptions>({
    category: 'all',
    sortBy: 'name',
    sortDirection: 'asc'
  });

  const showAgentList = () => setVisible(true);
  const hideAgentList = () => setVisible(false);
  const toggleAgentList = () => setVisible(prev => !prev);

  return {
    visible,
    mode,
    filters,
    showAgentList,
    hideAgentList,
    toggleAgentList,
    setMode,
    setFilters
  };
};