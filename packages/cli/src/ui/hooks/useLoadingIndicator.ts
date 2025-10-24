/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { StreamingState } from '../types.js';
import { usePhraseCycler } from './usePhraseCycler.js';
import type { TrackedToolCall } from './useReactToolScheduler.js';

export const useLoadingIndicator = (streamingState: StreamingState, toolCalls: TrackedToolCall[]) => {
  const hasActiveToolCalls = toolCalls.some(
    (tc) =>
      tc.status === 'executing' ||
      tc.status === 'scheduled' ||
      tc.status === 'validating',
  );
  const isPhraseCyclingActive = streamingState === StreamingState.Responding && !hasActiveToolCalls;
  const isWaiting = streamingState === StreamingState.WaitingForConfirmation;
  const currentLoadingPhrase = usePhraseCycler(
    isPhraseCyclingActive,
    isWaiting,
  );

  return {
    currentLoadingPhrase,
  };
};
