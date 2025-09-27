/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../../colors.js';
import type {
  AgentPersonaSummary,
  MultiAgentSelectionDisplay,
  MultiAgentInteractiveState,
  MultiAgentToolEventDisplay,
} from '../../types.js';
import { ToolCallStatus } from '../../types.js';

interface MultiAgentStatusMessageProps {
  selection: MultiAgentSelectionDisplay;
  interactiveState?: MultiAgentInteractiveState;
  isPending?: boolean;
}

const formatDuration = (ms: number): string => {
  if (!Number.isFinite(ms)) return '—';
  if (ms >= 1000) {
    const seconds = ms / 1000;
    return `${seconds >= 10 ? Math.round(seconds) : seconds.toFixed(1)}s`;
  }
  return `${Math.max(0, Math.round(ms))}ms`;
};

const formatConfidence = (value: number): string => {
  if (!Number.isFinite(value)) return '—';
  return `${Math.round(Math.min(Math.max(value, 0), 1) * 100)}%`;
};

const truncateText = (text: string, maxLength = 160): string => {
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
};

const summarizeSpecialties = (specialties: string[]): string => {
  if (!specialties?.length) return '';
  const trimmed = specialties.slice(0, 3).join(', ');
  return specialties.length > 3 ? `${trimmed}, …` : trimmed;
};

interface AgentCardData {
  id: string;
  emoji: string;
  name: string;
  confidence: number;
  analysis?: string;
  solution?: string;
  handoffNames: string[];
  specialties: string[];
  tools: MultiAgentToolEventDisplay[];
  liveThought?: string;
  status?: 'pending' | 'planning' | 'running' | 'complete';
}

const buildAgentCards = (selection: MultiAgentSelectionDisplay): AgentCardData[] => {
  const personaLookup = new Map<string, AgentPersonaSummary>();
  selection.selectedAgents.forEach((persona) => personaLookup.set(persona.id, persona));
  const results = selection.execution?.agentResults ?? [];

  if (results.length === 0) {
    return selection.selectedAgents.map((persona) => ({
      id: persona.id,
      emoji: persona.emoji,
      name: persona.name,
      confidence: selection.confidence,
      analysis: undefined,
      solution: undefined,
      handoffNames: [],
      specialties: persona.specialties ?? [],
      tools: [],
      liveThought: undefined,
      status: selection.status,
    }));
  }

  return results.map((result) => {
    personaLookup.set(result.agent.id, {
      id: result.agent.id,
      name: result.agent.name,
      emoji: result.agent.emoji,
      description: result.agent.description,
      specialties: result.agent.specialties ?? [],
    });
    const handoffNames = result.handoffAgentIds
      .map((id) => personaLookup.get(id))
      .filter((persona): persona is AgentPersonaSummary => Boolean(persona))
      .map((persona) => `${persona.emoji} ${persona.name}`);

    return {
      id: result.agent.id,
      emoji: result.agent.emoji,
      name: result.agent.name,
      confidence: result.confidence,
      analysis: result.analysis,
      solution: result.solution,
      handoffNames,
      specialties:
        personaLookup.get(result.agent.id)?.specialties ?? result.agent.specialties ?? [],
      tools: result.tools ?? [],
      liveThought: result.liveThought,
      status: result.status,
    };
  });
};

const renderToolList = (tools: MultiAgentToolEventDisplay[], isExpanded: boolean) => {
  if (!tools.length) return null;
  const visibleTools = isExpanded ? tools : tools.slice(-1);
  return (
    <Box flexDirection="column" marginTop={0}>
      <Text wrap="wrap" color={Colors.Comment}>{`   🛠 Tools (${tools.length}):`}</Text>
      {visibleTools.map((tool, index) => {
        const statusIcon = tool.status === ToolCallStatus.Error ? '⚠' : '•';
        const description = `${statusIcon} ${tool.name}(${truncateText(tool.args, 80)})`;
        const suffix = tool.output
          ? ` → ${truncateText(tool.output, 160)}`
          : tool.error
          ? ` → ${truncateText(tool.error, 160)}`
          : '';
        return (
          <Text
            key={`${tool.name}-${index}`}
            wrap="wrap"
            color={tool.status === ToolCallStatus.Error ? Colors.AccentRed : Colors.Comment}
          >
            {`      ${description}${suffix}`}
          </Text>
        );
      })}
      {!isExpanded && tools.length > 1 && (
        <Text wrap="wrap" color={Colors.Comment}>         … {tools.length - 1} more tool{tools.length - 1 === 1 ? '' : 's'}</Text>
      )}
    </Box>
  );
};

const AgentCard: React.FC<{
  card: AgentCardData;
  isFocused: boolean;
  isExpanded: boolean;
  interactive: boolean;
}> = ({ card, isFocused, isExpanded, interactive }) => {
  const borderColor = isFocused ? Colors.AccentCyan : Colors.Comment;
  const headerColor = isFocused ? Colors.AccentCyan : Colors.AccentGreen;
  const expansionHint = interactive
    ? isExpanded
      ? 'Press Enter to collapse'
      : 'Press Enter for tools'
    : undefined;
  const status = card.status ?? (interactive ? 'running' : 'complete');
  const trimmedAnalysis = card.analysis?.trim();
  const trimmedSolution = card.solution?.trim();
  const trimmedThought = card.liveThought?.trim();
  const showThinking = trimmedThought && (status !== 'complete' || !trimmedAnalysis);

  return (
    <Box
      flexDirection="column"
      borderStyle={isFocused ? 'double' : 'round'}
      borderColor={borderColor}
      paddingX={1}
      paddingY={0}
      marginTop={1}
    >
      <Text wrap="wrap" color={headerColor}>
        {`${card.emoji} ${card.name}`} ({formatConfidence(card.confidence)})
      </Text>
      {status !== 'complete' && (
        <Text wrap="wrap" color={Colors.Comment}>{`   Status: ${status}`}</Text>
      )}
      {trimmedAnalysis && (
        <Text wrap="wrap">{`   🧠 ${truncateText(trimmedAnalysis, 200)}`}</Text>
      )}
      {showThinking && trimmedThought && (
        <Text wrap="wrap" color={Colors.Comment}>{`   🌀 ${truncateText(trimmedThought, 200)}`}</Text>
      )}
      {trimmedSolution && (
        <Text wrap="wrap">{`   ✓ ${truncateText(trimmedSolution, 200)}`}</Text>
      )}
      {card.specialties.length > 0 && (
        <Text wrap="wrap" color={Colors.Comment}>
          {`   • ${summarizeSpecialties(card.specialties)}`}
        </Text>
      )}
      {card.handoffNames.length > 0 && (
        <Text wrap="wrap" color={Colors.Comment}>
          {`   ↪ Handoff: ${card.handoffNames.join(', ')}`}
        </Text>
      )}
      {renderToolList(card.tools, isExpanded || !interactive)}
      {interactive && expansionHint && (
        <Text wrap="wrap" color={Colors.Comment}>{`   ${expansionHint}`}</Text>
      )}
    </Box>
  );
};

export const MultiAgentStatusMessage: React.FC<MultiAgentStatusMessageProps> = ({
  selection,
  interactiveState,
  isPending,
}) => {
  const cards = buildAgentCards(selection);
  const interactive = Boolean(isPending && interactiveState);
  const focusedAgentId = interactive
    ? interactiveState?.focusedAgentId ?? (cards[0]?.id ?? null)
    : null;
  const expandedSet = new Set(
    interactive
      ? interactiveState?.expandedAgentIds ?? []
      : cards.map((card) => card.id),
  );

  const statusLabel = (() => {
    switch (selection.status) {
      case 'planning':
        return 'Multi-Agent Planning';
      case 'running':
        return 'Multi-Agent Orchestration In Progress';
      case 'complete':
      default:
        return 'Multi-Agent Orchestration Complete';
    }
  })();

  const statusEmoji = (() => {
    switch (selection.status) {
      case 'planning':
        return '🧭';
      case 'running':
        return '⚙️';
      case 'complete':
      default:
        return '🤝';
    }
  })();

  const teamSize =
    selection.execution?.totalAgents ?? selection.selectedAgents.length ?? cards.length;
  const orchestrationDuration = selection.execution
    ? formatDuration(selection.execution.durationMs)
    : formatDuration(selection.processingTime);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={Colors.AccentCyan}
      paddingX={1}
      paddingY={0}
      marginTop={1}
    >
      <Text color={Colors.AccentCyan}>
        {statusEmoji} {statusLabel}
      </Text>

      <Box marginTop={1} flexDirection="column">
        <Text wrap="wrap">Team Size: {teamSize}</Text>
        <Text wrap="wrap">Confidence: {formatConfidence(selection.confidence)}</Text>
        <Text wrap="wrap">Duration: {orchestrationDuration}</Text>
        {selection.status !== 'complete' && (
          <Text wrap="wrap" color={Colors.Comment}>
            Awaiting specialist outputs…
          </Text>
        )}
      </Box>

      {selection.execution?.aggregateReasoning && (
        <Box marginTop={1} flexDirection="column">
          <Text color={Colors.AccentBlue}>Orchestrator Synthesis</Text>
          {selection.execution.aggregateReasoning.split(/\r?\n/).map((line, index) => (
            <Text key={index} wrap="wrap" color={Colors.Comment}>
              {line.trim() || '—'}
            </Text>
          ))}
        </Box>
      )}

      {selection.reasoning && (
        <Box marginTop={1} flexDirection="column">
          <Text color={Colors.AccentBlue}>Dispatcher Notes</Text>
          {selection.reasoning.split(/\r?\n/).map((line, index) => (
            <Text key={index} wrap="wrap">
              {line.trim() || '—'}
            </Text>
          ))}
        </Box>
      )}

      {selection.execution?.timeline.length ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={Colors.AccentBlue}>Execution Waves</Text>
          {selection.execution.timeline.map((entry) => (
            <Text key={entry.wave} wrap="wrap">
              {`  ${entry.wave}. ${entry.agents
                .map((persona) => `${persona.emoji} ${persona.name}`)
                .join(', ')}`}
            </Text>
          ))}
        </Box>
      ) : null}

      <Box marginTop={1} flexDirection="column">
        {cards.length === 0 && (
          <Text wrap="wrap" color={Colors.Comment}>
            Scouting specialists…
          </Text>
        )}
        {cards.map((card) => (
          <AgentCard
            key={card.id}
            card={card}
            interactive={interactive}
            isFocused={interactive && focusedAgentId === card.id}
            isExpanded={expandedSet.has(card.id)}
          />
        ))}
      </Box>

      <Box marginTop={1}>
        <Text color={Colors.Comment}>
          {interactive
            ? '⌘⌃←/→ focus agent · Enter toggle details · Esc collapse all'
            : selection.status === 'complete'
            ? 'Multi-agent response synthesized by the Ouroboros orchestrator.'
            : 'Specialists coordinating via the Ouroboros orchestrator.'}
        </Text>
      </Box>
    </Box>
  );
};
