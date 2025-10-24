/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ThoughtSummary } from '@ouroboros/ouroboros-code-core';
import React from 'react';
import { Text, Box } from 'ink';
import { Colors } from '../colors.js';
import { GeminiRespondingSpinner } from './GeminiRespondingSpinner.js';
import { formatDuration } from '../utils/formatters.js';
// import { useTerminalSize } from '../hooks/useTerminalSize.js';
// import { isNarrowWidth } from '../utils/isNarrowWidth.js';
import { useTimer } from '../hooks/useTimer.js';
import { StreamingState } from '../types.js';

interface LoadingIndicatorProps {
  currentLoadingPhrase?: string;
  streamingState: StreamingState;
  rightContent?: React.ReactNode;
  thought?: ThoughtSummary | null;
}

export const LoadingIndicator = React.memo<LoadingIndicatorProps>(({
  currentLoadingPhrase,
  streamingState,
  rightContent,
  thought,
}) => {
  // Removed unused terminalWidth
  // Removed unused isNarrow

  // Use internal timer that only runs when streaming
  const elapsedTime = useTimer(
    streamingState === StreamingState.Responding || streamingState === StreamingState.WaitingForConfirmation,
    streamingState // Use streamingState as reset key
  );

  if (streamingState === StreamingState.Idle) {
    return null;
  }

  const primaryText = thought?.subject || currentLoadingPhrase;

  const cancelAndTimerContent =
    streamingState !== StreamingState.WaitingForConfirmation
      ? `(esc to cancel, ${elapsedTime < 60 ? `${elapsedTime}s` : formatDuration(elapsedTime * 1000)})`
      : null;

  return (
    <Box paddingLeft={0}>
      <Box width="100%" flexDirection="row" alignItems="center">
        <Box marginRight={1}>
          <GeminiRespondingSpinner
            nonRespondingDisplay={
              streamingState === StreamingState.WaitingForConfirmation
                ? '⠏'
                : ''
            }
          />
        </Box>
        {primaryText && (
          <Text color={Colors.AccentPurple}>{primaryText}</Text>
        )}
        {cancelAndTimerContent && (
          <Text color={Colors.Gray}> {cancelAndTimerContent}</Text>
        )}
        <Box flexGrow={1}>{/* Spacer */}</Box>
        {rightContent && <Box>{rightContent}</Box>}
      </Box>
    </Box>
  );
});
