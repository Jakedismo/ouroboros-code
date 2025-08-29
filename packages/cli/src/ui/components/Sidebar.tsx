/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { appEvents, AppEvent } from '../../utils/events.js';

interface SidebarProps {
  visible: boolean;
  model?: string;
  provider?: string;
  branchName?: string;
  interactive?: boolean;
  compact?: boolean;
}

type QuickAction = { label: string; raw: string };

export const Sidebar: React.FC<SidebarProps> = ({
  visible,
  model,
  provider,
  branchName,
  interactive = false,
  compact = false,
}) => {
  if (!visible) return null;
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
      if (!interactive) return;
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
      if (input.toLowerCase() === 'a')
        appEvents.emit(AppEvent.ExecuteSlashCommand, '/agent list');
      if (input.toLowerCase() === 'w')
        appEvents.emit(AppEvent.ExecuteSlashCommand, '/workflow status');
      if (input.toLowerCase() === 'm')
        appEvents.emit(AppEvent.ExecuteSlashCommand, '/mcp list');
      if (input.toLowerCase() === 't')
        appEvents.emit(AppEvent.ExecuteSlashCommand, '/tools');
      if (input.toLowerCase() === 's')
        appEvents.emit(AppEvent.ExecuteSlashCommand, '/settings');
    },
    { isActive: interactive },
  );

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={Colors.Gray} width="100%">
      <Box paddingX={1}>
        <Text color={Colors.Primary} bold>
          ☰ SIDEBAR
        </Text>
      </Box>
      <Box paddingX={1} marginTop={1}>
        <Box flexDirection="column">
          <Text color={Colors.Gray} dimColor>
            Model:
          </Text>
          <Text color={Colors.White} wrap="truncate">
            {model || 'Default'}
          </Text>
        </Box>
      </Box>
      {provider && (
        <Box paddingX={1} marginTop={1}>
          <Box flexDirection="column">
            <Text color={Colors.Gray} dimColor>
              Provider:
            </Text>
            <Text color={Colors.Primary}>{provider}</Text>
          </Box>
        </Box>
      )}
      {branchName && (
        <Box paddingX={1} marginTop={1}>
          <Box flexDirection="column">
            <Text color={Colors.Gray} dimColor>
              Branch:
            </Text>
            <Text color={Colors.Warning} wrap="truncate">
              {branchName}
            </Text>
          </Box>
        </Box>
      )}
      <Box paddingX={1} marginTop={1}>
        <Text color={Colors.Gray} dimColor>
          Quick Actions:
        </Text>
      </Box>
      <Box flexDirection="column" paddingX={1}>
        {actions.map((action, i) => (
          <Box key={action.raw} marginTop={i === 0 ? 0 : 0}>
            <Text
              color={
                interactive && i === index ? Colors.Primary : Colors.White
              }
              dimColor={!interactive}
              bold={interactive && i === index}
            >
              {interactive && i === index ? '▶ ' : '  '}
              {action.label}
            </Text>
          </Box>
        ))}
      </Box>
      {interactive && (
        <Box paddingX={1} marginTop={1}>
          <Text color={Colors.Gray} dimColor>
            ↑↓ Navigate · ↵ Execute · Esc Back
          </Text>
        </Box>
      )}
    </Box>
  );
};