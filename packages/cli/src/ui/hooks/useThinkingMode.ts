/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';

interface ThinkingModeState {
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

interface ThinkingEvent {
  content: string;
  isComplete: boolean;
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

export const useThinkingMode = () => {
  const [thinkingState, setThinkingState] = useState<ThinkingModeState>({
    isThinking: false,
  });

  const handleThinkingEvent = useCallback((event: ThinkingEvent) => {
    setThinkingState({
      isThinking: !event.isComplete,
      thinkingContent: event.content,
      provider: event.provider,
      metadata: event.metadata,
    });
  }, []);

  const clearThinking = useCallback(() => {
    setThinkingState({
      isThinking: false,
    });
  }, []);

  const startThinking = useCallback((provider?: string) => {
    setThinkingState({
      isThinking: true,
      provider,
    });
  }, []);

  return {
    thinkingState,
    handleThinkingEvent,
    clearThinking,
    startThinking,
  };
};