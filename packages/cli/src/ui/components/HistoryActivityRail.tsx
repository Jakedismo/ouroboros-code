/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useCallback } from 'react';
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
        label: (item as any).type,
        summary: truncate((item as any).text, 64),
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

export const HistoryActivityRail: React.FC<HistoryActivityRailProps> = React.memo(({
  history,
  pendingItems = [],
  maxItems = 5,
  isCompact = false,
}) => {
  const design = useDesignSystem();

  // Create stable keys for items to prevent unnecessary re-renders
  const getStableKey = useCallback((item: HistoryItemWithoutId | HistoryItem, index: number, isPending: boolean): string => {
    const prefix = isPending ? 'pending' : 'history';
    if (item.type === 'tool_group') {
      const callIds = item.tools.map((tool) => tool.callId ?? tool.name ?? 'tool');
      const unique = Array.from(new Set(callIds)).sort();
      return `${prefix}-tool-${unique.join('|')}-${index}`;
    }
    if (item.type === 'multi_agent_status') {
      const agentIds = item.selection.selectedAgents.map((agent) => agent.id).join(',');
      return `${prefix}-multi-${agentIds}-${index}`;
    }
    if ('text' in item && typeof item.text === 'string') {
      const textHash = item.text.slice(0, 20).replace(/\s+/g, '_');
      return `${prefix}-${item.type}-${textHash}-${index}`;
    }
    return `${prefix}-${item.type}-${index}`;
  }, []);

  // Memoize descriptor creation to prevent expensive recalculations
  const descriptors = useMemo(() => {
    const pendingDescriptors = pendingItems.slice(0, 2).map((item, index) => {
      const base = describeItem(item);
      const detail = base.summary ? `${base.label}: ${base.summary}` : base.label;
      return {
        ...base,
        icon: '⏳',
        label: 'Pending',
        summary: truncate(`Awaiting ${detail}`, 64),
        tone: 'info' as ActivityTone,
        key: getStableKey(item, index, true),
      };
    });

    const historyDescriptors = history
      .slice(-maxItems)
      .reverse()
      .map((item, index) => ({
        ...describeItem(item),
        key: getStableKey(item, index, false),
      }));

    // Ensure we show both pending and history items when possible
    const combined = [...pendingDescriptors, ...historyDescriptors];
    // If we have both pending and history items, ensure at least one of each is shown
    if (pendingDescriptors.length > 0 && historyDescriptors.length > 0 && maxItems >= 2) {
      const pendingToShow = Math.min(pendingDescriptors.length, Math.ceil(maxItems / 2));
      const historyToShow = Math.min(historyDescriptors.length, maxItems - pendingToShow);
      return [...pendingDescriptors.slice(0, pendingToShow), ...historyDescriptors.slice(0, historyToShow)];
    }
    return combined.slice(0, maxItems);
  }, [history, pendingItems, maxItems, getStableKey]);

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
            key={descriptor.key}
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
});
