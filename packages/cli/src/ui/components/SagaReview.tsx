/**
 * @license
 * Copyright 2025 Ouroboros
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';

export interface SagaReviewProps {
  files: string;
  diff: string;
  onAccept: () => Promise<void> | void;
  onDiscard: () => Promise<void> | void;
  onExit?: () => void;
}

export const SagaReview: React.FC<SagaReviewProps> = ({ files, diff, onAccept, onDiscard, onExit }) => {
  const { exit } = useApp();
  const [status, setStatus] = useState<string>('');

  useInput(async (input, key) => {
    if (key.escape || input === 'q') {
      onExit?.();
      exit();
    }
    if (input === 'a') {
      setStatus('Accepting...');
      await onAccept();
      setStatus('Accepted. Press q to quit.');
    }
    if (input === 'x') {
      setStatus('Discarding...');
      await onDiscard();
      setStatus('Discarded. Press q to quit.');
    }
  });

  useEffect(() => {
    setStatus('Press a=accept, x=discard, q=quit');
  }, []);

  return (
    <Box flexDirection="column">
      <Text>CodePress — Review Changes</Text>
      <Text>────────────────────────────────────────</Text>
      <Text>{files || '(no changed files)'}</Text>
      <Text>────────────────────────────────────────</Text>
      <Text>{diff || '(no diff)'}</Text>
      <Text>────────────────────────────────────────</Text>
      <Text color="green">{status}</Text>
    </Box>
  );
};

