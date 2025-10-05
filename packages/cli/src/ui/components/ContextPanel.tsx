/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { ApprovalMode, type MCPServerConfig } from '@ouroboros/ouroboros-code-core';
import { ContextSummaryDisplay } from './ContextSummaryDisplay.js';
import {
  Surface,
  SectionHeading,
  useDesignSystem,
} from '../design-system/index.js';

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
  const design = useDesignSystem();
  const contextColor = design.colors.text.accent;
  return (
    <Surface
      variant="sunken"
      borderTone="accent"
      flexDirection="column"
      width="100%"
      paddingY={design.spacing.sm}
      paddingX={design.spacing.sm}
    >
      <SectionHeading icon="📚" text={compact ? 'Context' : 'Workspace Context'} />
      <Box marginTop={design.spacing.sm} flexDirection="column">
        <Text color={design.colors.text.muted} wrap="truncate-end">
          Provider:{' '}
          <Text color={contextColor}>{provider ?? '—'}</Text>
        </Text>
        <Text color={design.colors.text.muted} wrap="truncate-end">
          Model:{' '}
          <Text color={contextColor}>
            {model ? (model.length > 22 ? `${model.slice(0, 21)}…` : model) : '—'}
          </Text>
        </Text>
      </Box>
      <Box marginTop={compact ? design.spacing.xs : design.spacing.sm}>
        <ContextSummaryDisplay
          ideContext={undefined}
          geminiMdFileCount={geminiMdFileCount}
          contextFileNames={contextFileNames}
          mcpServers={mcpServers as Record<string, MCPServerConfig> | undefined}
          blockedMcpServers={
            blockedMcpServers as Array<{ name: string; extensionName: string }> | undefined
          }
          showToolDescriptions={false}
        />
      </Box>
      <Box marginTop={design.spacing.sm}>
        <Text color={design.colors.text.muted} wrap="truncate-end">
          Approval:{' '}
          <Text color={contextColor}>{approvalMode}</Text>
        </Text>
      </Box>
    </Surface>
  );
};