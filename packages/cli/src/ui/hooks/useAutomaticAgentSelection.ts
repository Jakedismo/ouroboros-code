/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentPersona, Config } from '@ouroboros/ouroboros-code-core';
import type {
  AgentPersonaSummary,
  HistoryItemMultiAgentStatus,
  HistoryItemWithoutId,
  MultiAgentInteractiveState,
  MultiAgentSelectionDisplay,
} from '../types.js';
import { MessageType, ToolCallStatus } from '../types.js';

// ConversationOrchestrator will be dynamically imported in the hook

/**
 * Custom hook for integrating automatic agent selection into conversation flow
 */
interface SelectionExecutionPayload {
  totalAgents: number;
  durationMs: number;
  aggregateReasoning?: string;
  finalResponse?: string;
  timeline: Array<{
    wave: number;
    agents: AgentPersona[];
  }>;
  agentResults: Array<{
    agent: AgentPersona;
    analysis: string;
    solution: string;
    confidence: number;
    handoffAgentIds: string[];
    rawText?: string;
    liveThought?: string;
    status?: 'pending' | 'running' | 'complete';
    toolEvents: Array<{
      callId: string;
      toolName: string;
      arguments: Record<string, unknown>;
      outputText?: string;
      resultDisplay?: unknown;
      errorMessage?: string;
      errorType?: string;
      timestamp: number;
    }>;
  }>;
}

export interface SelectionFeedbackPayload {
  selectedAgents: AgentPersona[];
  reasoning: string;
  confidence: number;
  processingTime: number;
  status?: 'planning' | 'running' | 'complete';
  execution?: SelectionExecutionPayload;
}

export type SelectionStreamEvent =
  | {
      type: 'progress';
      message?: string;
      selectionPreview?: SelectionFeedbackPayload;
      toolEvent?: {
        agent: AgentPersona;
        event: {
          callId: string;
          toolName: string;
          arguments: Record<string, unknown>;
          outputText?: string;
          resultDisplay?: unknown;
          errorMessage?: string;
          errorType?: string;
          timestamp: number;
        };
      };
    }
  | {
      type: 'complete';
      message?: string;
      shouldProceed?: boolean;
      selectionFeedback?: SelectionFeedbackPayload;
      previousAgentState?: string[];
      showSelectionFeedback?: () => void;
      finalResponse?: string;
    };

type StreamToolEvent = NonNullable<
  Exclude<SelectionStreamEvent, { type: 'complete' }>['toolEvent']
>;

const toPersonaSummary = (agent: AgentPersona): AgentPersonaSummary => ({
  id: agent.id,
  name: agent.name,
  emoji: agent.emoji,
  description: agent.description,
  specialties: agent.specialties ?? [],
});

const buildSelectionDisplay = (
  selection: SelectionFeedbackPayload,
  status: 'planning' | 'running' | 'complete',
): MultiAgentSelectionDisplay => {
  const effectiveStatus = selection.status ?? status;
  const display: MultiAgentSelectionDisplay = {
    selectedAgents: selection.selectedAgents.map(toPersonaSummary),
    reasoning: selection.reasoning,
    confidence: selection.confidence,
    processingTime: selection.processingTime,
    status: effectiveStatus,
  };

  if (selection.execution) {
    const exec = selection.execution;
    display.execution = {
      totalAgents: exec.totalAgents,
      durationMs: exec.durationMs,
      aggregateReasoning: exec.aggregateReasoning,
      timeline: exec.timeline.map((entry) => ({
        wave: entry.wave,
        agents: entry.agents.map(toPersonaSummary),
      })),
      agentResults: exec.agentResults.map((result) => ({
        agent: toPersonaSummary(result.agent),
        analysis: result.analysis,
        solution: result.solution,
        confidence: result.confidence,
        handoffAgentIds: result.handoffAgentIds,
        rawText: result.rawText,
        liveThought: result.liveThought,
        status: result.status,
        tools: result.toolEvents.map((event) => {
          const output = stringifyResultDisplay(
            event.outputText,
            event.resultDisplay,
            event.errorMessage,
          );
          return {
            name: event.toolName,
            args: stringifyArgs(event.arguments),
            output,
            status: event.errorMessage ? ToolCallStatus.Error : ToolCallStatus.Success,
            error: event.errorMessage,
          };
        }),
      })),
    };
  }

  return display;
};

const stringifyArgs = (value: unknown): string => {
  try {
    const json = JSON.stringify(value, null, 2);
    return json.length > 120 ? `${json.slice(0, 117)}...` : json;
  } catch (_error) {
    return String(value);
  }
};

const stringifyResultDisplay = (
  outputText?: string,
  resultDisplay?: unknown,
  errorMessage?: string,
): string | undefined => {
  if (outputText && outputText.trim().length > 0) {
    return outputText;
  }
  if (errorMessage && errorMessage.trim().length > 0) {
    return errorMessage;
  }
  if (resultDisplay === undefined || resultDisplay === null) {
    return undefined;
  }
  if (typeof resultDisplay === 'string') {
    return resultDisplay;
  }
  try {
    return JSON.stringify(resultDisplay, null, 2);
  } catch (_error) {
    return String(resultDisplay);
  }
};

const buildToolGroupDisplay = (
  agent: AgentPersona,
  event: StreamToolEvent['event'],
): HistoryItemWithoutId => {
  const description = stringifyArgs(event.arguments);
  const resultDisplay = stringifyResultDisplay(
    event.outputText,
    event.resultDisplay,
    event.errorMessage,
  );
  const status = event.errorMessage ? ToolCallStatus.Error : ToolCallStatus.Success;

  return {
    type: 'tool_group',
    tools: [
      {
        callId: event.callId,
        name: event.toolName,
        description,
        resultDisplay,
        status,
        confirmationDetails: undefined,
        renderOutputAsMarkdown: true,
        agentId: agent.id,
        agentName: agent.name,
        agentEmoji: agent.emoji,
      },
    ],
  };
};

export const createMultiAgentHistoryItem = (
  selection: SelectionFeedbackPayload,
  status: 'planning' | 'running' | 'complete',
  interactive?: MultiAgentInteractiveState,
): Omit<HistoryItemMultiAgentStatus, 'id'> => {
  const effectiveStatus = selection.status ?? status;
  return {
    type: 'multi_agent_status',
    selection: buildSelectionDisplay(selection, effectiveStatus),
    interactive,
  };
};

export const useAutomaticAgentSelection = (
  config: Config,
  addItem: (item: HistoryItemWithoutId, timestamp: number) => void,
) => {
  const [orchestrator, setOrchestrator] = useState<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const seenToolCallIdsRef = useRef(new Set<string>());

  const emitToolEventMessage = useCallback(
    (payload: StreamToolEvent) => {
      if (seenToolCallIdsRef.current.has(payload.event.callId)) {
        return;
      }
      seenToolCallIdsRef.current.add(payload.event.callId);
      const historyItem = buildToolGroupDisplay(payload.agent, payload.event);
      addItem(historyItem, Date.now());
    },
    [addItem],
  );

  // Initialize the orchestrator
  useEffect(() => {
    if (isInitialized) {
      return;
    }

    let cancelled = false;

    const initOrchestrator = async () => {
      console.log('[DEBUG-AUTO-AGENT] Starting orchestrator initialization...');
      try {
        const { ConversationOrchestrator } = await import(
          '@ouroboros/ouroboros-code-core'
        );
        console.log(
          '[DEBUG-AUTO-AGENT] ConversationOrchestrator imported successfully',
        );

        const instance = ConversationOrchestrator.getInstance();
        console.log(
          '[DEBUG-AUTO-AGENT] ConversationOrchestrator instance retrieved',
        );
        console.log('[DEBUG-AUTO-AGENT] Initializing orchestrator with config...');
        await instance.initialize(config);
        if (cancelled) {
          return;
        }
        console.log('[DEBUG-AUTO-AGENT] Orchestrator initialized successfully');

        setOrchestrator(instance);
        setIsInitialized(true);
        console.log(
          '[AutoAgentSelection] Initialized with unified Agents runtime',
        );
      } catch (error) {
        if (cancelled) {
          return;
        }
        console.error(
          '[DEBUG-AUTO-AGENT] Failed to initialize ConversationOrchestrator:',
          error,
        );
        console.error('Failed to initialize ConversationOrchestrator:', error);
        console.warn(
          'ConversationOrchestrator not available, automatic agent selection disabled',
        );
      }
    };

    initOrchestrator();

    return () => {
      cancelled = true;
    };
  }, [config, isInitialized]);

  /**
   * Process a user prompt with streaming agent selection
   */
  const processPromptWithAutoSelectionStream = useCallback(
    async function* (userPrompt: string): AsyncGenerator<SelectionStreamEvent> {
      if (!orchestrator || !isInitialized) {
        yield { type: 'complete', shouldProceed: true };
        return;
      }

      try {
        seenToolCallIdsRef.current.clear();
        const selectionStream =
          orchestrator.processPromptWithAutoSelectionStream(userPrompt);

        for await (const event of selectionStream) {
          if (event.toolEvent) {
            emitToolEventMessage(event.toolEvent);
          }

          if (event.type === 'progress') {
            if (event.selectionPreview) {
              if (event.message) {
                addItem(
                  {
                    type: MessageType.INFO,
                    text: event.message,
                  },
                  Date.now(),
                );
              }
              yield {
                type: 'progress',
                selectionPreview: event.selectionPreview,
              };
              continue;
            }

            if (event.message) {
              // Show streaming progress messages immediately
              addItem(
                {
                  type: MessageType.INFO,
                  text: event.message,
                },
                Date.now(),
              );
              yield { type: 'progress' };
            }
          } else if (event.type === 'complete' && event.selectionFeedback) {
            // Create final selection feedback
            const selectionSnapshot = event.selectionFeedback;
            const showSelectionFeedback = () => {
              const status = selectionSnapshot.status ?? 'complete';
              addItem(
                createMultiAgentHistoryItem(selectionSnapshot, status),
                Date.now(),
              );
            };

            if (event.finalResponse) {
              addItem(
                {
                  type: MessageType.GEMINI,
                  text: event.finalResponse,
                },
                Date.now(),
              );
            }

            yield {
              type: 'complete',
              shouldProceed: event.shouldProceed ?? true,
              previousAgentState: event.previousAgentState,
              showSelectionFeedback,
              finalResponse: event.finalResponse,
            };
            return;
          } else if (event.type === 'complete') {
            yield {
              type: 'complete',
              shouldProceed: event.shouldProceed ?? true,
            };
            return;
          }
        }
      } catch (error) {
        console.error('Streaming agent selection failed:', error);
        yield { type: 'complete', shouldProceed: true };
      }
    },
    [orchestrator, isInitialized, addItem, emitToolEventMessage],
  );

  /**
   * Process a user prompt with potential automatic agent selection (legacy method)
   */
  const processPromptWithAutoSelection = useCallback(
    async (
      userPrompt: string,
    ): Promise<{
      shouldProceed: boolean;
      previousAgentState?: string[];
      showSelectionFeedback?: () => void;
      finalResponse?: string;
    }> => {
      if (!orchestrator || !isInitialized) {
        return { shouldProceed: true };
      }

      try {
        seenToolCallIdsRef.current.clear();
        const result = await orchestrator.processPromptWithAutoSelection(
          userPrompt,
          [],
        );

        if (result.finalResponse) {
          addItem(
            {
              type: MessageType.GEMINI,
              text: result.finalResponse,
            },
            Date.now(),
          );
        }

        if (result.selectionFeedback) {
          // Create a callback to show the selection feedback
          const selectionSnapshot = result.selectionFeedback;
          const showSelectionFeedback = () => {
            const status = selectionSnapshot.status ?? 'complete';
            addItem(
              createMultiAgentHistoryItem(selectionSnapshot, status),
              Date.now(),
            );
          };

          return {
            shouldProceed: result.shouldProceed ?? true,
            previousAgentState: result.previousAgentState,
            showSelectionFeedback,
            finalResponse: result.finalResponse,
          };
        }

        return {
          shouldProceed: result.shouldProceed ?? true,
          finalResponse: result.finalResponse,
        };
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
