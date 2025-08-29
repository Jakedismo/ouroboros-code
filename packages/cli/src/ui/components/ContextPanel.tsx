/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { ApprovalMode } from '@ouroboros/ouroboros-code-core';
import { ContextSummaryDisplay } from './ContextSummaryDisplay.js';

interface ContextPanelProps {
  model?: string;
  provider?: string;
  geminiMdFileCount: number;
  contextFileNames: string[];
  approvalMode: ApprovalMode;
  mcpServers?: Record<string, unknown>;
  blockedMcpServers?: Record<string, unknown>;
  compact?: boolean;
}

export const ContextPanel: React.FC<ContextPanelProps> = ({
  model,
  provider,
  geminiMdFileCount,
  contextFileNames,
  approvalMode,
  mcpServers,
  blockedMcpServers,
  compact = false,
}) => {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={Colors.Gray} width="100%">
      <Box paddingX={1}>
        <Text color={Colors.AccentBlue} bold>
          📚 Context
        </Text>
      </Box>
      <Box paddingX={1}>
        <Text wrap="truncate-end">
          Provider: <Text color={Colors.AccentPurple}>{provider || '—'}</Text>
        </Text>
      </Box>
      <Box paddingX={1}>
        <Text wrap="truncate-end">
          Model:{' '}
          <Text color={Colors.AccentPurple}>
            {model ? (model.length > 18 ? model.substring(0, 18) + '...' : model) : '—'}
          </Text>
        </Text>
      </Box>
      <Box padding={compact ? 0 : 1}>
        <ContextSummaryDisplay
          ideContext={undefined}
          geminiMdFileCount={geminiMdFileCount}
          contextFileNames={contextFileNames}
          mcpServers={mcpServers}
          blockedMcpServers={blockedMcpServers}
          showToolDescriptions={false}
        />
      </Box>
      <Box paddingX={1}>
        <Text wrap="truncate-end">
          Approval: <Text color={Colors.AccentPurple}>{approvalMode}</Text>
        </Text>
      </Box>
    </Box>
  );
};