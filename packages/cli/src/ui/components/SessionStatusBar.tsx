/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FC } from 'react';
import { memo, useMemo } from 'react';
import { Box, Text } from 'ink';
import { useDesignSystem } from '../design-system/index.js';
import { StreamingState } from '../types.js';

type Tone =
  | 'default'
  | 'accent'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'muted';

interface SessionStatusBarProps {
  streamingState: StreamingState;
  queueLength: number;
  pendingToolCount: number;
  activeToolNames: string[];
  totalHistoryItems: number;
  model: string;
  isTrustedWorkspace: boolean;
  userTierLabel: string;
  shellModeActive: boolean;
  isCompact: boolean;
}

interface Segment {
  label: string;
  value: string;
  tone: Tone;
}

function toneToColor(
  tone: Tone,
  palette: ReturnType<typeof useDesignSystem>['colors'],
): string {
  switch (tone) {
    case 'accent':
      return palette.text.accent;
    case 'info':
      return palette.status.info;
    case 'success':
      return palette.status.success;
    case 'warning':
      return palette.status.warning;
    case 'danger':
      return palette.status.error;
    case 'muted':
      return palette.text.secondary;
    case 'default':
    default:
      return palette.text.primary;
  }
}

function describeStreamingState(state: StreamingState): {
  label: string;
  tone: Tone;
} {
  switch (state) {
    case StreamingState.Responding:
      return { label: 'Responding', tone: 'accent' };
    case StreamingState.WaitingForConfirmation:
      return { label: 'Waiting for confirmation', tone: 'warning' };
    case StreamingState.Idle:
    default:
      return { label: 'Idle', tone: 'muted' };
  }
}

function formatToolSummary(
  pendingToolCount: number,
  activeToolNames: string[],
): string {
  if (pendingToolCount === 0) {
    return 'Idle';
  }

  const visibleTools = activeToolNames.slice(0, 2);
  const suffix =
    visibleTools.length > 0
      ? ` (${visibleTools.join(', ')}${
          activeToolNames.length > visibleTools.length ? '…' : ''
        })`
      : '';
  return `${pendingToolCount} running${suffix}`;
}

const formatModeLabel = (mode: string): string => {
  switch (mode) {
    case 'light':
      return 'Light';
    case 'monochrome':
      return 'Mono';
    case 'dark':
    default:
      return 'Dark';
  }
};

const SessionStatusBarComponent: FC<SessionStatusBarProps> = ({
  streamingState,
  queueLength,
  pendingToolCount,
  activeToolNames,
  totalHistoryItems,
  model,
  isTrustedWorkspace,
  userTierLabel,
  shellModeActive,
  isCompact,
}) => {
  const design = useDesignSystem();
  const streamDescriptor = useMemo(
    () => describeStreamingState(streamingState),
    [streamingState],
  );
  const segments: Segment[] = useMemo(
    () => [
      {
        label: 'Theme',
        value: `${design.meta.themeName} · ${formatModeLabel(design.mode)}`,
        tone: 'accent',
      },
      {
        label: 'Model',
        value: model,
        tone: 'info',
      },
      {
        label: 'Stream',
        value: streamDescriptor.label,
        tone: streamDescriptor.tone,
      },
      {
        label: 'Queue',
        value: queueLength > 0 ? `${queueLength} pending` : 'Empty',
        tone: queueLength > 0 ? 'warning' : 'muted',
      },
      {
        label: 'Tools',
        value: formatToolSummary(pendingToolCount, activeToolNames),
        tone: pendingToolCount > 0 ? 'info' : 'muted',
      },
      {
        label: 'History',
        value: `${totalHistoryItems}`,
        tone: 'muted',
      },
      {
        label: 'Tier',
        value: userTierLabel,
        tone:
          userTierLabel.toLowerCase().includes('standard') ||
          userTierLabel.toLowerCase().includes('legacy')
            ? 'success'
            : 'muted',
      },
      {
        label: 'Workspace',
        value: isTrustedWorkspace ? 'Trusted' : 'Untrusted',
        tone: isTrustedWorkspace ? 'success' : 'warning',
      },
      {
        label: 'Shell',
        value: shellModeActive ? 'On' : 'Off',
        tone: shellModeActive ? 'warning' : 'muted',
      },
    ],
    [
      design.meta.themeName,
      design.mode,
      model,
      streamDescriptor.label,
      streamDescriptor.tone,
      queueLength,
      pendingToolCount,
      activeToolNames,
      totalHistoryItems,
      userTierLabel,
      isTrustedWorkspace,
      shellModeActive,
    ],
  );

  const separator = '  ';
  if (!isCompact) {
    return (
      <Box
        width="100%"
        flexDirection="row"
        alignItems="center"
        marginBottom={1}
      >
        {segments.map((segment, index) => (
          <Box key={`${segment.label}-${index}`} flexDirection="row">
            <Text color={design.colors.text.muted}>
              {segment.label}
              {': '}
            </Text>
            <Text color={toneToColor(segment.tone, design.colors)}>
              {segment.value}
            </Text>
            {index < segments.length - 1 ? <Text>{separator}</Text> : null}
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <Box width="100%" flexDirection="column" marginBottom={1}>
      {segments.map((segment, index) => (
        <Box key={`${segment.label}-${index}`} flexDirection="row">
          <Text color={design.colors.text.muted}>
            {segment.label}
            {': '}
          </Text>
          <Text color={toneToColor(segment.tone, design.colors)}>
            {segment.value}
          </Text>
        </Box>
      ))}
    </Box>
  );
};

export const SessionStatusBar = memo(
  SessionStatusBarComponent,
  (prev, next) => {
    // Convert arrays to strings for reliable comparison (without mutating)
    const prevActiveToolsStr = [...prev.activeToolNames].sort().join(',');
    const nextActiveToolsStr = [...next.activeToolNames].sort().join(',');
    const propsEqual =
      prev.streamingState === next.streamingState &&
      prev.queueLength === next.queueLength &&
      prev.pendingToolCount === next.pendingToolCount &&
      prevActiveToolsStr === nextActiveToolsStr &&
      prev.totalHistoryItems === next.totalHistoryItems &&
      prev.model === next.model &&
      prev.isTrustedWorkspace === next.isTrustedWorkspace &&
      prev.userTierLabel === next.userTierLabel &&
      prev.shellModeActive === next.shellModeActive &&
      prev.isCompact === next.isCompact;
    if (!propsEqual) {
      console.log('[SessionStatusBar] Props changed, re-rendering:', {
        streamingState: prev.streamingState !== next.streamingState,
        queueLength: prev.queueLength !== next.queueLength,
        pendingToolCount: prev.pendingToolCount !== next.pendingToolCount,
        activeTools: prevActiveToolsStr !== nextActiveToolsStr,
        totalHistoryItems: prev.totalHistoryItems !== next.totalHistoryItems,
        model: prev.model !== next.model,
      });
    }
    return propsEqual;
  },
);
