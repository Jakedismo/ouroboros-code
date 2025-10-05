/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { appEvents, AppEvent } from '../../utils/events.js';
import {
  Surface,
  SectionHeading,
  useDesignSystem,
} from '../design-system/index.js';

interface SidebarProps {
  model?: string;
  provider?: string;
  branchName?: string;
  interactive?: boolean;
  compact?: boolean;
}

type QuickAction = { label: string; raw: string };

const InfoRow = ({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) => {
  const design = useDesignSystem();
  return (
    <Box flexDirection="column" marginBottom={design.spacing.xs}>
      <Text color={design.colors.text.muted}>{label}</Text>
      <Text
        color={accent ? design.colors.text.accent : design.colors.text.primary}
        wrap="truncate"
      >
        {value}
      </Text>
    </Box>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({
  model,
  provider,
  branchName,
  interactive = false,
  compact = false,
}) => {
  const design = useDesignSystem();
  const actions: QuickAction[] = useMemo(
    () => [
      { label: '/agent list', raw: '/agent list' },
      { label: '/workflow status', raw: '/workflow status' },
      { label: '/mcp list', raw: '/mcp list' },
      { label: '/tools', raw: '/tools' },
      { label: '/settings', raw: '/settings' },
    ],
    [],
  );
  const [index, setIndex] = useState(0);

  useInput(
    (input, key) => {
      if (!interactive) {
        return;
      }
      if (key.escape) {
        appEvents.emit(AppEvent.SetFocusRegion, 'main');
        return;
      }
      if (key.upArrow) {
        setIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setIndex((i) => Math.min(actions.length - 1, i + 1));
        return;
      }
      if (key.return) {
        const action =
          actions[Math.max(0, Math.min(index, actions.length - 1))];
        appEvents.emit(AppEvent.ExecuteSlashCommand, action.raw);
        return;
      }
      const lowered = input.toLowerCase();
      if (lowered === 'a') {
        appEvents.emit(AppEvent.ExecuteSlashCommand, '/agent list');
      } else if (lowered === 'w') {
        appEvents.emit(AppEvent.ExecuteSlashCommand, '/workflow status');
      } else if (lowered === 'm') {
        appEvents.emit(AppEvent.ExecuteSlashCommand, '/mcp list');
      } else if (lowered === 't') {
        appEvents.emit(AppEvent.ExecuteSlashCommand, '/tools');
      } else if (lowered === 's') {
        appEvents.emit(AppEvent.ExecuteSlashCommand, '/settings');
      }
    },
    { isActive: interactive },
  );

  const hintColor = design.colors.text.muted;
  const selectedColor = design.colors.text.accent;

  return (
    <Surface
      variant="sunken"
      borderTone="accent"
      flexDirection="column"
      paddingY={design.spacing.sm}
      paddingX={design.spacing.sm}
      width="100%"
    >
      <SectionHeading icon="☰" text={compact ? 'Navigator' : 'Session Navigator'} />
      <Box flexDirection="column" marginTop={design.spacing.sm}>
        <InfoRow label="Provider" value={provider ?? '—'} accent />
        <InfoRow label="Model" value={model ?? 'Default'} />
        {branchName ? (
          <InfoRow
            label="Branch"
            value={branchName}
            accent={false}
          />
        ) : null}
      </Box>
      <Box marginTop={design.spacing.sm}>
        <Text color={design.colors.text.muted}>Quick actions</Text>
      </Box>
      <Box flexDirection="column" marginTop={design.spacing.xs}>
        {actions.map((action, i) => {
          const isSelected = interactive && i === index;
          return (
            <Box key={action.raw}>
              <Text
                color={isSelected ? selectedColor : design.colors.text.primary}
                bold={isSelected}
                wrap="truncate"
              >
                {isSelected ? '▶ ' : '  '}
                {action.label}
              </Text>
            </Box>
          );
        })}
      </Box>
      {interactive ? (
        <Box marginTop={design.spacing.sm}>
          <Text color={hintColor}>↑↓ navigate · ↵ run · Esc return</Text>
        </Box>
      ) : null}
    </Surface>
  );
};