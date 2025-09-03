/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import type { Config } from '@ouroboros/ouroboros-code-core';
import type { HistoryItemWithoutId } from '../types.js';
import { MessageType } from '../types.js';

// ConversationOrchestrator will be dynamically imported in the hook

/**
 * Custom hook for integrating automatic agent selection into conversation flow
 */
export const useAutomaticAgentSelection = (
  config: Config,
  addItem: (item: HistoryItemWithoutId, timestamp: number) => void,
) => {
  const [orchestrator, setOrchestrator] = useState<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize the orchestrator
  useEffect(() => {
    const initOrchestrator = async () => {
      try {
        // Check if GeminiClient is initialized first
        const geminiClient = config.getGeminiClient();
        if (!geminiClient) {
          console.log('[AutoAgentSelection] GeminiClient not ready yet, waiting...');
          return;
        }
        
        // Dynamically import ConversationOrchestrator
        const { ConversationOrchestrator } = await import('@ouroboros/ouroboros-code-core/dist/src/agents/conversationOrchestrator.js');
        
        const instance = ConversationOrchestrator.getInstance();
        
        // Initialize with the SAME Config that regular chat uses
        // This ensures both systems use the exact same ContentGenerator
        await instance.initialize(config);
        setOrchestrator(instance);
        setIsInitialized(true);
        console.log('[AutoAgentSelection] Initialized with same ContentGenerator as regular chat');
      } catch (error) {
        console.error('Failed to initialize ConversationOrchestrator:', error);
        console.warn('ConversationOrchestrator not available, automatic agent selection disabled');
      }
    };

    // Try to initialize immediately
    initOrchestrator();
    
    // Also set up a retry mechanism in case the client isn't ready yet
    const retryInterval = setInterval(() => {
      if (!isInitialized && config.getGeminiClient()) {
        initOrchestrator();
        clearInterval(retryInterval);
      }
    }, 1000); // Check every second
    
    return () => clearInterval(retryInterval);
  }, [config, isInitialized]);

  /**
   * Process a user prompt with streaming agent selection
   */
  const processPromptWithAutoSelectionStream = useCallback(
    async function* (userPrompt: string): AsyncGenerator<{
      type: 'progress' | 'complete';
      message?: string;
      shouldProceed?: boolean;
      previousAgentState?: string[];
      showSelectionFeedback?: () => void;
    }> {
      if (!orchestrator || !isInitialized) {
        yield { type: 'complete', shouldProceed: true };
        return;
      }

      try {
        const selectionStream = orchestrator.processPromptWithAutoSelectionStream(userPrompt);
        
        for await (const event of selectionStream) {
          if (event.type === 'progress' && event.message) {
            // Show streaming progress messages immediately
            addItem(
              {
                type: MessageType.INFO,
                text: event.message,
              },
              Date.now(),
            );
            yield { type: 'progress' };
          } else if (event.type === 'complete' && event.selectionFeedback) {
            // Create final selection feedback
            const showSelectionFeedback = () => {
              const feedbackMessage = orchestrator.generateSelectionFeedback(event.selectionFeedback);
              addItem(
                {
                  type: MessageType.INFO,
                  text: feedbackMessage.text,
                },
                Date.now(),
              );
            };

            yield {
              type: 'complete',
              shouldProceed: event.shouldProceed || true,
              previousAgentState: event.previousAgentState,
              showSelectionFeedback,
            };
            return;
          } else if (event.type === 'complete') {
            yield {
              type: 'complete',
              shouldProceed: event.shouldProceed || true,
            };
            return;
          }
        }
      } catch (error) {
        console.error('Streaming agent selection failed:', error);
        yield { type: 'complete', shouldProceed: true };
      }
    },
    [orchestrator, isInitialized, addItem],
  );

  /**
   * Process a user prompt with potential automatic agent selection (legacy method)
   */
  const processPromptWithAutoSelection = useCallback(
    async (userPrompt: string): Promise<{
      shouldProceed: boolean;
      previousAgentState?: string[];
      showSelectionFeedback?: () => void;
    }> => {
      if (!orchestrator || !isInitialized) {
        return { shouldProceed: true };
      }

      try {
        const result = await orchestrator.processPromptWithAutoSelection(userPrompt, []);
        
        if (result.selectionFeedback) {
          // Create a callback to show the selection feedback
          const showSelectionFeedback = () => {
            const feedbackMessage = orchestrator.generateSelectionFeedback(result.selectionFeedback);
            addItem(
              {
                type: MessageType.INFO,
                text: feedbackMessage.text,
              },
              Date.now(),
            );
          };

          return {
            shouldProceed: result.shouldProceed,
            previousAgentState: result.previousAgentState,
            showSelectionFeedback,
          };
        }

        return { shouldProceed: result.shouldProceed };
      } catch (error) {
        console.error('Automatic agent selection failed:', error);
        return { shouldProceed: true };
      }
    },
    [orchestrator, isInitialized, addItem],
  );

  /**
   * Restore previous agent state after conversation
   */
  const restorePreviousAgentState = useCallback(
    async (previousAgentState?: string[]) => {
      if (!orchestrator || !previousAgentState) return;

      try {
        await orchestrator.restorePreviousAgentState(previousAgentState);
      } catch (error) {
        console.error('Failed to restore previous agent state:', error);
      }
    },
    [orchestrator],
  );

  /**
   * Check if automatic selection is enabled
   */
  const isAutoModeEnabled = useCallback(() => {
    return orchestrator?.isAutoModeEnabled() ?? false;
  }, [orchestrator]);

  return {
    processPromptWithAutoSelection,
    processPromptWithAutoSelectionStream,
    restorePreviousAgentState,
    isAutoModeEnabled,
    isInitialized,
  };
};