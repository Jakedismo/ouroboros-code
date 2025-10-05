/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import {
  Surface,
  SectionHeading,
  useDesignSystem,
} from '../design-system/index.js';
import type { HistoryItem, HistoryItemWithoutId } from '../types.js';

interface HistoryActivityRailProps {
  readonly history: readonly HistoryItem[];
  readonly pendingItems?: readonly HistoryItemWithoutId[];
  readonly maxItems?: number;
  readonly isCompact?: boolean;
}

type ActivityTone =
  | 'accent'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'muted';

interface ActivityDescriptor {
  readonly icon: string;
  readonly label: string;
  readonly summary?: string;
  readonly tone: ActivityTone;
}

const truncate = (input: string | undefined, maxLength: number): string | undefined => {
  if (!input) {
    return undefined;
  }
  const normalized = input.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
};

const summarizeToolGroup = (item: HistoryItemWithoutId & { type: 'tool_group' }): string => {
  if (!item.tools.length) {
    return 'No tools invoked';
  }
  const names = item.tools.map((tool) => tool.name);
  const preview = names.slice(0, 3).join(', ');
  return names.length > 3 ? `${preview}, …` : preview;
};

const summarizeMultiAgent = (
  item: HistoryItemWithoutId & { type: 'multi_agent_status' },
): string => {
  const statusLabel = item.selection.status;
  const agents = item.selection.selectedAgents;
  const agentPreview = agents
    .slice(0, 2)
    .map((agent) => agent.name)
    .join(', ');
  if (!agentPreview) {
    return statusLabel;
  }
  return agents.length > 2
    ? `${statusLabel} · ${agentPreview}, …`
    : `${statusLabel} · ${agentPreview}`;
};

const describeItem = (item: HistoryItemWithoutId): ActivityDescriptor => {
  switch (item.type) {
    case 'user':
    case 'user_shell':
      return {
        icon: '🙋',
        label: 'User',
        summary: truncate(item.text, 64),
        tone: 'accent',
      };
    case 'gemini':
    case 'gemini_content':
      return {
        icon: '🤖',
        label: 'Gemini',
        summary: truncate(item.text, 64),
        tone: 'info',
      };
    case 'tool_group':
      return {
        icon: '🛠️',
        label: 'Tools',
        summary: summarizeToolGroup(item),
        tone: 'info',
      };
    case 'info':
      return {
        icon: 'ℹ️',
        label: 'Info',
        summary: truncate(item.text, 64),
        tone: 'muted',
      };
    case 'error':
      return {
        icon: '⚠️',
        label: 'Error',
        summary: truncate(item.text, 64),
        tone: 'danger',
      };
    case 'multi_agent_status':
      return {
        icon: '🤝',
        label: 'Agents',
        summary: summarizeMultiAgent(item),
        tone: 'accent',
      };
    case 'stats':
    case 'model_stats':
    case 'tool_stats':
      return {
        icon: '📊',
        label: 'Stats',
        summary: truncate(item.text, 64),
        tone: 'muted',
      };
    case 'compression':
      return {
        icon: '🗜️',
        label: 'Compression',
        summary: item.compression.isPending
          ? 'Pending compression'
          : 'Compression complete',
        tone: item.compression.isPending ? 'info' : 'muted',
      };
    case 'help':
      return {
        icon: '❓',
        label: 'Help',
        summary: item.timestamp.toLocaleTimeString(),
        tone: 'muted',
      };
    case 'about':
      return {
        icon: '🧭',
        label: 'About',
        summary: item.cliVersion,
        tone: 'muted',
      };
    case 'quit':
      return {
        icon: '🏁',
        label: 'Session',
        summary: item.duration,
        tone: 'muted',
      };
    default:
      return {
        icon: '…',
        label: item.type,
        summary: truncate(item.text, 64),
        tone: 'muted',
      };
  }
};

const toneToColor = (
  tone: ActivityTone,
  design: ReturnType<typeof useDesignSystem>,
): string => {
  switch (tone) {
    case 'accent':
      return design.colors.text.accent;
    case 'info':
      return design.colors.status.info;
    case 'success':
      return design.colors.status.success;
    case 'warning':
      return design.colors.status.warning;
    case 'danger':
      return design.colors.status.error;
    case 'muted':
    default:
      return design.colors.text.secondary;
  }
};

export const HistoryActivityRail: React.FC<HistoryActivityRailProps> = ({
  history,
  pendingItems = [],
  maxItems = 5,
  isCompact = false,
}) => {
  const design = useDesignSystem();
  const pendingDescriptors = pendingItems.slice(0, 2).map((item) => {
    const base = describeItem(item);
    const detail = base.summary ? `${base.label}: ${base.summary}` : base.label;
    return {
      icon: '⏳',
      label: 'Pending',
      summary: truncate(`Awaiting ${detail}`, 64),
      tone: 'info' as ActivityTone,
    };
  });

  const historyDescriptors = history
    .slice(-maxItems)
    .reverse()
    .map((item) => describeItem(item));

  const descriptors = [...pendingDescriptors, ...historyDescriptors].slice(
    0,
    maxItems,
  );

  if (!descriptors.length) {
    return null;
  }

  return (
    <Surface
      variant="base"
      borderTone="accent"
      flexDirection="column"
      width="100%"
      marginBottom={1}
    >
      <SectionHeading icon="🗂" text="Recent Activity" />
      <Box
        flexDirection={isCompact ? 'column' : 'row'}
        flexWrap="wrap"
        marginTop={1}
      >
        {descriptors.map((descriptor, index) => (
          <Box
            key={`${descriptor.label}-${index}`}
            flexDirection="column"
            flexGrow={1}
            marginRight={
              !isCompact && index < descriptors.length - 1
                ? design.spacing.md
                : design.spacing.none
            }
            marginBottom={design.spacing.xs}
            width={isCompact ? undefined : 28}
          >
            <Text color={toneToColor(descriptor.tone, design)}>
              {descriptor.icon} {descriptor.label}
            </Text>
            {descriptor.summary && (
              <Text color={design.colors.text.muted} wrap="truncate">
                {descriptor.summary}
              </Text>
            )}
          </Box>
        ))}
      </Box>
    </Surface>
  );
};
