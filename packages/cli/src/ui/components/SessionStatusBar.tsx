/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { Surface, useDesignSystem } from '../design-system/index.js';
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

function toneToColor(tone: Tone, palette: ReturnType<typeof useDesignSystem>['colors']): string {
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

function describeStreamingState(state: StreamingState): { label: string; tone: Tone } {
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

export const SessionStatusBar: React.FC<SessionStatusBarProps> = ({
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
  const streamDescriptor = describeStreamingState(streamingState);
  const segments: Segment[] = [
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
  ];

  return (
    <Surface
      width="100%"
      flexDirection={isCompact ? 'column' : 'row'}
      variant="sunken"
      paddingY={isCompact ? 0 : 0}
      marginBottom={1}
    >
      {segments.map((segment, index) => (
        <Box
          key={`${segment.label}-${index}`}
          marginRight={
            !isCompact && index < segments.length - 1
              ? design.spacing.sm
              : design.spacing.none
          }
          marginBottom={isCompact && index < segments.length - 1 ? 1 : 0}
        >
          <Text color={design.colors.text.muted}>{segment.label}:</Text>
          <Text> </Text>
          <Text color={toneToColor(segment.tone, design.colors)}>
            {segment.value}
          </Text>
        </Box>
      ))}
    </Surface>
  );
};
