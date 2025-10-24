/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { HistoryItem } from '../types.js';
import { UserMessage } from './messages/UserMessage.js';
import { UserShellMessage } from './messages/UserShellMessage.js';
import { GeminiMessage } from './messages/GeminiMessage.js';
import { InfoMessage } from './messages/InfoMessage.js';
import { ErrorMessage } from './messages/ErrorMessage.js';
import { ToolGroupMessageMemoized } from './messages/ToolGroupMessage.js';
import { GeminiMessageContent } from './messages/GeminiMessageContent.js';

import { MultiAgentStatusMessage } from './messages/MultiAgentStatusMessage.js';
import { Box } from 'ink';
import { AboutBox } from './AboutBox.js';
import { StatsDisplay } from './StatsDisplay.js';
import { ModelStatsDisplay } from './ModelStatsDisplay.js';
import { ToolStatsDisplay } from './ToolStatsDisplay.js';
import { SessionSummaryDisplay } from './SessionSummaryDisplay.js';
import type { Config } from '@ouroboros/ouroboros-code-core';
import { Help } from './Help.js';
import type { SlashCommand } from '../commands/types.js';

interface HistoryItemDisplayProps {
  item: HistoryItem;
  availableTerminalHeight?: number;
  terminalWidth: number;
  isPending: boolean;
  config: Config;
  isFocused?: boolean;
  commands?: readonly SlashCommand[];
}

const HistoryItemDisplayComponent: React.FC<HistoryItemDisplayProps> = ({
  item,
  availableTerminalHeight,
  terminalWidth,
  isPending,
  config,
  commands,
  isFocused = true,
}) => {
  return (
    <Box flexDirection="column" key={item.id}>
      {/* Render standard message types */}
      {item.type === 'user' && <UserMessage text={item.text} />}
      {item.type === 'user_shell' && <UserShellMessage text={item.text} />}
      {item.type === 'gemini' && (
        <GeminiMessage
          text={item.text}
          isPending={isPending}
          availableTerminalHeight={availableTerminalHeight}
          terminalWidth={terminalWidth}
        />
      )}
      {item.type === 'gemini_content' && (
        <GeminiMessageContent
          text={item.text}
          isPending={isPending}
          availableTerminalHeight={availableTerminalHeight}
          terminalWidth={terminalWidth}
        />
      )}
      {item.type === 'info' && <InfoMessage text={item.text} />}
      {item.type === 'multi_agent_status' && (
        <MultiAgentStatusMessage
          selection={item.selection}
          interactiveState={item.interactive}
          isPending={isPending}
        />
      )}
      {item.type === 'error' && <ErrorMessage text={item.text} />}
      {item.type === 'about' && (
        <AboutBox
          cliVersion={item.cliVersion}
          osVersion={item.osVersion}
          sandboxEnv={item.sandboxEnv}
          modelVersion={item.modelVersion}
          selectedAuthType={item.selectedAuthType}
          gcpProject={item.gcpProject}
          ideClient={item.ideClient}
        />
      )}
      {item.type === 'help' && commands && <Help commands={commands} />}
      {item.type === 'stats' && <StatsDisplay duration={item.duration} />}
      {item.type === 'model_stats' && <ModelStatsDisplay />}
      {item.type === 'tool_stats' && <ToolStatsDisplay />}
      {item.type === 'quit' && (
        <SessionSummaryDisplay duration={item.duration} />
      )}
      {item.type === 'tool_group' && (
        <ToolGroupMessageMemoized
          toolCalls={item.tools}
          groupId={item.id}
          availableTerminalHeight={availableTerminalHeight}
          terminalWidth={terminalWidth}
          config={config}
          isFocused={isFocused}
        />
      )}
    </Box>
  );
};

// Helper function to compare two HistoryItem objects for equality
function areHistoryItemsEqual(a: HistoryItem, b: HistoryItem): boolean {
  if (a.type !== b.type || a.id !== b.id) return false;

  switch (a.type) {
    case 'tool_group':
      if (b.type !== 'tool_group') return false;
      const aTools = a.tools;
      const bTools = b.tools;
      if (aTools.length !== bTools.length) return false;
      return aTools.every((aTool, index) => {
        const bTool = bTools[index];
        return (
          aTool.callId === bTool?.callId &&
          aTool.name === bTool?.name &&
          aTool.description === bTool?.description &&
          aTool.status === bTool?.status &&
          aTool.resultDisplay === bTool?.resultDisplay &&
          aTool.confirmationDetails === bTool?.confirmationDetails &&
          aTool.renderOutputAsMarkdown === bTool?.renderOutputAsMarkdown &&
          aTool.agentId === bTool?.agentId &&
          aTool.agentName === bTool?.agentName &&
          aTool.agentEmoji === bTool?.agentEmoji
        );
      });

    case 'user':
    case 'user_shell':
    case 'gemini':
    case 'gemini_content':
    case 'info':
    case 'error':
      return (a as any).text === (b as any).text;

    case 'about':
      if (b.type !== 'about') return false;
      return (
        a.cliVersion === b.cliVersion &&
        a.osVersion === b.osVersion &&
        a.sandboxEnv === b.sandboxEnv &&
        a.modelVersion === b.modelVersion &&
        a.selectedAuthType === b.selectedAuthType &&
        a.gcpProject === b.gcpProject &&
        a.ideClient === b.ideClient
      );

    case 'help':
      return b.type === 'help';

    case 'stats':
    case 'quit':
      if (a.type !== b.type) return false;
      return (a as any).duration === (b as any).duration;

    case 'model_stats':
    case 'tool_stats':
      return b.type === a.type;

    case 'compression':
      if (b.type !== 'compression') return false;
      return (
        a.compression.isPending === b.compression.isPending &&
        a.compression.originalTokenCount === b.compression.originalTokenCount &&
        a.compression.newTokenCount === b.compression.newTokenCount &&
        a.compression.compressionStatus === b.compression.compressionStatus
      );

    case 'multi_agent_status':
      // For simplicity, assume multi-agent status changes frequently
      return false;

    default:
      return false;
  }
}

export const HistoryItemDisplay = React.memo(
  HistoryItemDisplayComponent,
  (prev, next) => {
    // Compare relevant props to avoid unnecessary re-renders
    if (prev.isPending !== next.isPending) return false;
    if (prev.availableTerminalHeight !== next.availableTerminalHeight)
      return false;
    if (prev.terminalWidth !== next.terminalWidth) return false;
    if (prev.isFocused !== next.isFocused) return false;

    // Compare the item content, not reference
    const itemsEqual = areHistoryItemsEqual(prev.item, next.item);
    if (!itemsEqual) {
      console.log('[HistoryItemDisplay] Items not equal, re-rendering:', {
        prevType: prev.item.type,
        nextType: next.item.type,
        prevId: prev.item.id,
        nextId: next.item.id,
      });
    }
    return itemsEqual;
  },
);

export const HistoryItemDisplayMemoized = React.memo(HistoryItemDisplay);
