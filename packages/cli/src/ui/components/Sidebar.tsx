/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { appEvents, AppEvent } from '../../utils/events.js';
import {
  Surface,
  SectionHeading,
  useDesignSystem,
  TextInputField,
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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleActions = useMemo(() => {
    if (!normalizedQuery) {
      return actions;
    }
    return actions.filter((action) =>
      action.label.toLowerCase().includes(normalizedQuery),
    );
  }, [actions, normalizedQuery]);

  useEffect(() => {
    setIndex((current) => {
      if (visibleActions.length === 0) {
        return 0;
      }
      return Math.min(current, visibleActions.length - 1);
    });
  }, [visibleActions.length]);

  const executeAction = useCallback(
    (action: QuickAction | undefined, { viaSearch } = { viaSearch: false }) => {
      if (!action) {
        return;
      }
      appEvents.emit(AppEvent.ExecuteSlashCommand, action.raw);
      if (viaSearch) {
        setSearchFocused(false);
        setSearchQuery('');
      }
    },
    [],
  );

  const handleInput = useCallback(
    (input: string, key: any) => {
      if (!interactive) {
        return;
      }

      if (searchFocused) {
        if (key.escape) {
          setSearchFocused(false);
          setSearchQuery('');
        } else if (key.return) {
          executeAction(visibleActions[0], { viaSearch: true });
        }
        return;
      }

      if (key.escape) {
        appEvents.emit(AppEvent.SetFocusRegion, 'main');
        return;
      }

      if (input === '/' && !key.ctrl && !key.meta && !key.shift) {
        setSearchFocused(true);
        setIndex(0);
        return;
      }

      if (key.upArrow) {
        setIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setIndex((i) =>
          Math.max(0, Math.min(visibleActions.length - 1, i + 1)),
        );
        return;
      }
      if (key.return) {
        executeAction(visibleActions[index]);
        return;
      }
      const lowered = input.toLowerCase();
      if (lowered === 'a') {
        executeAction(actions.find((action) => action.raw === '/agent list'));
      } else if (lowered === 'w') {
        executeAction(actions.find((action) => action.raw === '/workflow status'));
      } else if (lowered === 'm') {
        executeAction(actions.find((action) => action.raw === '/mcp list'));
      } else if (lowered === 't') {
        executeAction(actions.find((action) => action.raw === '/tools'));
      } else if (lowered === 's') {
        executeAction(actions.find((action) => action.raw === '/settings'));
      }
    },
    [interactive, searchFocused, visibleActions, executeAction, actions],
  );

  useInput(handleInput, { isActive: interactive });

  const hintColor = design.colors.text.muted;
  const selectedColor = design.colors.text.accent;
  const noMatches = normalizedQuery.length > 0 && visibleActions.length === 0;
  const hintText = searchFocused
    ? 'Type to filter · ↵ run top match · Esc cancel'
    : '↑↓ navigate · ↵ run · / search · Esc return';

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
      {interactive ? (
        <Box marginTop={design.spacing.xs} flexDirection="column">
          <TextInputField
            label="Search actions"
            value={searchQuery}
            placeholder="Type to filter actions…"
            focus={searchFocused}
            onChange={(value) => {
              setSearchQuery(value);
              setIndex(0);
            }}
            onSubmit={(value) => {
              executeAction(visibleActions[0], { viaSearch: true });
            }}
            description={
              searchFocused
                ? 'Enter to run the top match · Esc to cancel search'
                : 'Press / to focus search and start filtering actions'
            }
          />
        </Box>
      ) : null}
      <Box flexDirection="column" marginTop={design.spacing.xs}>
        {noMatches ? (
          <Text color={design.colors.text.muted}>
            No quick actions match “{searchQuery}”.
          </Text>
        ) : (
          visibleActions.map((action, i) => {
            const isSelected = interactive && !searchFocused && i === index;
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
          })
        )}
      </Box>
      {interactive ? (
        <Box marginTop={design.spacing.sm}>
          <Text color={hintColor}>{hintText}</Text>
        </Box>
      ) : null}
    </Surface>
  );
};

export const MemoizedSidebar = React.memo(Sidebar);