/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';

interface ThinkingStatusBarProps {
  isThinking: boolean;
  thinkingContent?: string;
  provider?: string;
  metadata?: {
    thinkingTime?: number;
    effortLevel?: string;
    tokenCount?: number;
    modelType?: string;
    usedThinking?: boolean;
    summaryMode?: boolean;
  };
}

export const ThinkingStatusBar: React.FC<ThinkingStatusBarProps> = ({
  isThinking,
  thinkingContent,
  provider,
  metadata,
}) => {
  if (!isThinking) {
    return null;
  }

  // Create animated thinking dots
  const dots = '⋯';
  const statusText = thinkingContent 
    ? thinkingContent.length > 60 
      ? `${thinkingContent.substring(0, 57)}...` 
      : thinkingContent
    : 'Thinking';

  return (
    <Box
      borderStyle="single"
      borderColor={theme.text.accent}
      paddingX={1}
      marginTop={1}
      marginBottom={0}
    >
      <Box flexDirection="row" alignItems="center" width="100%">
        <Text color={theme.text.accent}>🧠</Text>
        <Text color={theme.text.secondary}> {statusText} </Text>
        <Text color={theme.text.accent}>{dots}</Text>
        {provider && (
          <Text color={theme.text.secondary} dimColor>
            {' '}[{provider}]
          </Text>
        )}
        {metadata?.effortLevel && (
          <Text color={theme.text.secondary} dimColor>
            {' '}({metadata.effortLevel})
          </Text>
        )}
      </Box>
    </Box>
  );
};