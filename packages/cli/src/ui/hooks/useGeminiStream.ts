/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type {
  Config,
  EditorType,
  AgentsClient,
  PartListUnion,
  ServerGeminiChatCompressedEvent,
  ServerGeminiContentEvent as ContentEvent,
  ServerGeminiFinishedEvent,
  ServerGeminiStreamEvent as GeminiEvent,
  ThoughtSummary,
  ToolCallRequestInfo,
  ToolCallResponseInfo,
  ToolCallConfirmationDetails,
  ToolExecutionMetadata,
  GeminiErrorEventValue,
} from '@ouroboros/ouroboros-code-core';
import { ToolConfirmationOutcome } from '@ouroboros/ouroboros-code-core';
import {
  GeminiEventType as ServerGeminiEventType,
  getErrorMessage,
  isNodeError,
  MessageSenderType,
  logUserPrompt,
  GitService,
  UnauthorizedError,
  UserPromptEvent,
  DEFAULT_GEMINI_FLASH_MODEL,
  logConversationFinishedEvent,
  ConversationFinishedEvent,
  ApprovalMode,
  parseAndFormatApiError,
} from '@ouroboros/ouroboros-code-core';
import type {
  GeminiFinishReason,
  GeminiPart,
  GeminiPartListUnion,
} from '../types/geminiCompat.js';
import {
  ensureAgentContentArray,
  type AgentContent,
  type AgentContentFragment,
} from '../types/agentContent.js';
import type {
  HistoryItem,
  HistoryItemWithoutId,
  HistoryItemToolGroup,
  SlashCommandProcessorResult,
  AgentPersonaSummary,
} from '../types.js';
import { StreamingState, MessageType, ToolCallStatus } from '../types.js';
import { isAtCommand, isSlashCommand } from '../utils/commandUtils.js';
import { useShellCommandProcessor } from './shellCommandProcessor.js';
import { handleAtCommand } from './atCommandProcessor.js';
import {
  useAutomaticAgentSelection,
  createMultiAgentHistoryItem,
  type SelectionStreamEvent,
  type SelectionFeedbackPayload,
} from './useAutomaticAgentSelection.js';
import { findLastSafeSplitPoint } from '../utils/markdownUtilities.js';
import { useStateAndRef } from './useStateAndRef.js';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';
import { useLogger } from './useLogger.js';
import type {
  TrackedToolCall,
  TrackedCompletedToolCall,
  TrackedCancelledToolCall,
} from './useReactToolScheduler.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  useReactToolScheduler,
  mapToDisplay as mapTrackedToolCallsToDisplay,
} from './useReactToolScheduler.js';
import { mapAgentsStreamToGeminiEvents } from '@ouroboros/ouroboros-code-core';
import { useSessionStats } from '../contexts/SessionContext.js';
import { useKeypress } from './useKeypress.js';
import type { LoadedSettings } from '../../config/settings.js';

const toGeminiContent = (
  content: AgentContent,
): GeminiPartListUnion => {
  const fragments = ensureAgentContentArray(content);
  const mapFragment = (
    fragment: AgentContentFragment,
  ): string | GeminiPart => {
    if (typeof fragment === 'string') {
      return fragment;
    }
    if ('text' in fragment && typeof fragment.text === 'string') {
      return { text: fragment.text };
    }
    return fragment as unknown as GeminiPart;
  };
  return fragments.length === 1
    ? mapFragment(fragments[0])
    : fragments.map(mapFragment);
};

enum StreamProcessingStatus {
  Completed,
  UserCancelled,
  Error,
}

/**
 * Manages the Gemini stream, including user input, command processing,
 * API interaction, and tool call lifecycle.
 */
export const useGeminiStream = (
  agentsClient: AgentsClient,
  history: HistoryItem[],
  addItem: UseHistoryManagerReturn['addItem'],
  updateItem: UseHistoryManagerReturn['updateItem'],
  config: Config,
  settings: LoadedSettings,
  onDebugMessage: (message: string) => void,
  handleSlashCommand: (
    cmd: string,
  ) => Promise<SlashCommandProcessorResult | false>,
  shellModeActive: boolean,
  getPreferredEditor: () => EditorType | undefined,
  onAuthError: () => void,
  performMemoryRefresh: () => Promise<void>,
  modelSwitchedFromQuotaError: boolean,
  setModelSwitchedFromQuotaError: React.Dispatch<React.SetStateAction<boolean>>,
  onEditorClose: () => void,
  onCancelSubmit: () => void,
) => {
  const [initError, setInitError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const turnCancelledRef = useRef(false);
  const [isResponding, setIsResponding] = useState<boolean>(false);
  const [thought, setThought] = useState<ThoughtSummary | null>(null);
  const [pendingHistoryItemRef, setPendingHistoryItem] =
    useStateAndRef<HistoryItemWithoutId | null>(null);
  const processedMemoryToolsRef = useRef<Set<string>>(new Set());
  const toolHistoryEntryRef = useRef(new Map<string, number>());
  const reasoningItemsRef = useRef<Array<{ text: string; raw?: Record<string, unknown> }>>([]);
  const { startNewPrompt, getPromptCount } = useSessionStats();
  const storage = config.storage;
  const logger = useLogger(storage);
  const gitService = useMemo(() => {
    if (!config.getProjectRoot()) {
      return;
    }
    return new GitService(config.getProjectRoot(), storage);
  }, [config, storage]);

  const [toolCalls, scheduleToolCalls, markToolsAsSubmitted] =
    useReactToolScheduler(
      async (completedToolCallsFromScheduler) => {
        if (completedToolCallsFromScheduler.length > 0) {
          await handleCompletedTools(
            completedToolCallsFromScheduler as TrackedToolCall[],
          );
        }
      },
      config,
      setPendingHistoryItem,
      getPreferredEditor,
      onEditorClose,
    );

  const pendingToolCallGroupDisplay = useMemo(
    () =>
      toolCalls.length ? mapTrackedToolCallsToDisplay(toolCalls) : undefined,
    [toolCalls],
  );

  useEffect(() => {
    return () => {
      if (multiAgentClearTimeoutRef.current) {
        clearTimeout(multiAgentClearTimeoutRef.current);
        multiAgentClearTimeoutRef.current = null;
      }
    };
  }, []);

  const MULTI_AGENT_PANEL_IDLE_CLEAR_MS = 15000;
  const multiAgentStatusActiveRef = useRef(false);
  const [multiAgentPanelActive, setMultiAgentPanelActive] = useState(false);
  const [multiAgentAgentIds, setMultiAgentAgentIds] = useState<string[]>([]);
  const [multiAgentFocusedId, setMultiAgentFocusedId] = useState<string | null>(null);
  const [multiAgentExpandedIds, setMultiAgentExpandedIds] = useState<string[]>([]);
  const [multiAgentPersonaLookup, setMultiAgentPersonaLookup] = useState<Record<string, AgentPersonaSummary>>({});
  const [activeSpecialistNames, setActiveSpecialistNames] = useState<string | null>(null);
  const multiAgentClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const multiAgentHistoryActiveRef = useRef(false);
  const multiAgentShowSelectionRef = useRef<(() => void) | undefined>(undefined);
  const multiAgentFinalHistoryAddedRef = useRef(false);
  const toolExecutionResolversRef = useRef(
    new Map<
      string,
      {
        resolve: (response: ToolCallResponseInfo) => void;
        metadata?: ToolExecutionMetadata;
      }
    >(),
  );
  const processedCompletionCallIdsRef = useRef(new Set<string>());

  const pendingToolApprovalsRef = useRef(new Map<string, ToolCallConfirmationDetails>());
  const [pendingApprovalIds, setPendingApprovalIds] = useState<string[]>([]);

  const registerPendingApproval = useCallback(
    (callId: string, details: ToolCallConfirmationDetails) => {
      pendingToolApprovalsRef.current.set(callId, details);
      setPendingApprovalIds((prev: string[]) =>
        prev.includes(callId) ? prev : [...prev, callId],
      );
    },
    [],
  );

  const clearPendingApproval = useCallback(
    (callId: string) => {
      const existed = pendingToolApprovalsRef.current.delete(callId);
      if (!existed) {
        return;
      }
      setPendingApprovalIds((prev: string[]) => prev.filter((id: string) => id !== callId));
      const pendingItem = pendingHistoryItemRef.current;
      if (
        pendingItem?.type === 'tool_group' &&
        pendingItem.tools.some((tool) => tool.callId === callId)
      ) {
        setPendingHistoryItem(null);
      }
    },
    [pendingHistoryItemRef, setPendingHistoryItem],
  );

  const clearMultiAgentStatus = useCallback(() => {
    if (multiAgentClearTimeoutRef.current) {
      clearTimeout(multiAgentClearTimeoutRef.current);
      multiAgentClearTimeoutRef.current = null;
    }
    if (multiAgentStatusActiveRef.current || multiAgentPanelActive) {
      setPendingHistoryItem(null);
      multiAgentStatusActiveRef.current = false;
      multiAgentHistoryActiveRef.current = false;
      multiAgentShowSelectionRef.current = undefined;
      multiAgentFinalHistoryAddedRef.current = false;
      setMultiAgentPanelActive(false);
      setMultiAgentAgentIds([]);
      setMultiAgentFocusedId(null);
      setMultiAgentExpandedIds([]);
      setMultiAgentPersonaLookup({});
      setActiveSpecialistNames(null);
    }
  }, [setPendingHistoryItem, multiAgentPanelActive]);

  const scheduleMultiAgentStatusClear = useCallback(
    (delayMs: number) => {
      if (multiAgentClearTimeoutRef.current) {
        clearTimeout(multiAgentClearTimeoutRef.current);
      }
      multiAgentClearTimeoutRef.current = setTimeout(() => {
        clearMultiAgentStatus();
        multiAgentClearTimeoutRef.current = null;
      }, delayMs);
    },
    [clearMultiAgentStatus],
  );

  const updateInteractiveState = useCallback(
    (focusedId: string | null, expandedIds: string[]) => {
      setPendingHistoryItem((current) => {
        if (!current || current.type !== 'multi_agent_status') {
          return current;
        }
        return {
          ...current,
          interactive: {
            focusedAgentId: focusedId ?? undefined,
            expandedAgentIds: expandedIds,
          },
        };
      });
    },
    [setPendingHistoryItem],
  );

  const {
    processPromptWithAutoSelection,
    processPromptWithAutoSelectionStream,
    restorePreviousAgentState,
    isAutoModeEnabled,
  } = useAutomaticAgentSelection(config, addItem);

  const activatePanelForSelection = useCallback(
    (selection: SelectionFeedbackPayload, status: 'planning' | 'running' | 'complete') => {
      const effectiveStatus = selection.status ?? status;
      if (multiAgentClearTimeoutRef.current) {
        clearTimeout(multiAgentClearTimeoutRef.current);
        multiAgentClearTimeoutRef.current = null;
      }
      const agentSummaries = selection.selectedAgents;
      const agentIds = agentSummaries.map((agent) => agent.id);
      setMultiAgentPersonaLookup((prev) => {
        const next = { ...prev };
        for (const agent of agentSummaries) {
          next[agent.id] = agent;
        }
        return next;
      });

      if (effectiveStatus === 'complete') {
        const summaryNames = agentSummaries.length
          ? agentSummaries.map((agent) => `${agent.emoji} ${agent.name}`).join(', ')
          : null;
        if (summaryNames) {
          setActiveSpecialistNames(summaryNames);
        } else {
          setActiveSpecialistNames(null);
        }
        multiAgentStatusActiveRef.current = false;
        setMultiAgentPanelActive(false);
        setMultiAgentAgentIds([]);
        setMultiAgentFocusedId(null);
        setMultiAgentExpandedIds([]);
        if (!multiAgentFinalHistoryAddedRef.current) {
          const finalItem = createMultiAgentHistoryItem(selection, effectiveStatus);
          addItem(finalItem, Date.now());
          multiAgentFinalHistoryAddedRef.current = true;
        }
        multiAgentHistoryActiveRef.current = multiAgentFinalHistoryAddedRef.current;
        multiAgentShowSelectionRef.current = undefined;
        setPendingHistoryItem(null);
        return;
      }

      setMultiAgentPanelActive(true);
      multiAgentStatusActiveRef.current = true;
      setMultiAgentAgentIds(agentIds);
      const nextFocus =
        agentIds.length === 0
          ? null
          : agentIds.includes(multiAgentFocusedId ?? '')
          ? multiAgentFocusedId
          : agentIds[0];
      const nextExpanded = multiAgentExpandedIds.filter((id) => agentIds.includes(id));
      setMultiAgentFocusedId(nextFocus);
      setMultiAgentExpandedIds(nextExpanded);
      if (nextFocus) {
        const persona = agentSummaries.find((agent) => agent.id === nextFocus);
        if (persona) {
          setActiveSpecialistNames(`${persona.emoji} ${persona.name}`);
        }
      } else if (agentSummaries.length > 0) {
        setActiveSpecialistNames(
          agentSummaries.map((agent) => `${agent.emoji} ${agent.name}`).join(', '),
        );
      }
      multiAgentHistoryActiveRef.current = true;
      setPendingHistoryItem(
        createMultiAgentHistoryItem(selection, effectiveStatus, {
          focusedAgentId: nextFocus ?? undefined,
          expandedAgentIds: nextExpanded,
        }),
      );
    },
    [
      addItem,
      createMultiAgentHistoryItem,
      isAutoModeEnabled,
      multiAgentExpandedIds,
      multiAgentFocusedId,
      setPendingHistoryItem,
    ],
  );

  const cycleAgentFocus = useCallback(
    (direction: number) => {
      if (!multiAgentPanelActive || multiAgentAgentIds.length === 0) return;
      if (multiAgentShowSelectionRef.current) {
        multiAgentShowSelectionRef.current();
        multiAgentShowSelectionRef.current = undefined;
      }
      const currentIndex = multiAgentFocusedId
        ? multiAgentAgentIds.indexOf(multiAgentFocusedId)
        : -1;
      const nextIndex =
        currentIndex === -1
          ? (direction > 0 ? 0 : multiAgentAgentIds.length - 1)
          : (currentIndex + direction + multiAgentAgentIds.length) % multiAgentAgentIds.length;
      const nextId = multiAgentAgentIds[nextIndex];
      setMultiAgentFocusedId(nextId);
      updateInteractiveState(nextId, multiAgentExpandedIds);
      const persona = multiAgentPersonaLookup[nextId];
      if (persona) {
        setActiveSpecialistNames(`${persona.emoji} ${persona.name}`);
      }
    },
    [
      multiAgentPanelActive,
      multiAgentAgentIds,
      multiAgentFocusedId,
      multiAgentExpandedIds,
      multiAgentPersonaLookup,
    ],
  );

  const toggleFocusedAgent = useCallback(() => {
    if (!multiAgentPanelActive || !multiAgentFocusedId) return;
    if (multiAgentShowSelectionRef.current) {
      multiAgentShowSelectionRef.current();
      multiAgentShowSelectionRef.current = undefined;
    }
    setMultiAgentExpandedIds((prev) => {
      const next = prev.includes(multiAgentFocusedId)
        ? prev.filter((id) => id !== multiAgentFocusedId)
        : [...prev, multiAgentFocusedId];
      updateInteractiveState(multiAgentFocusedId, next);
      return next;
    });
  }, [multiAgentPanelActive, multiAgentFocusedId, updateInteractiveState]);

  const collapseAgentPanels = useCallback(() => {
    if (!multiAgentPanelActive) return;
    if (multiAgentShowSelectionRef.current) {
      multiAgentShowSelectionRef.current();
      multiAgentShowSelectionRef.current = undefined;
    }
    if (multiAgentExpandedIds.length === 0) {
      clearMultiAgentStatus();
      return;
    }
    setMultiAgentExpandedIds([]);
    updateInteractiveState(multiAgentFocusedId, []);
  }, [
    multiAgentPanelActive,
    multiAgentExpandedIds,
    multiAgentFocusedId,
    updateInteractiveState,
    clearMultiAgentStatus,
  ]);


  const loopDetectedRef = useRef(false);

  const onExec = useCallback(async (done: Promise<void>) => {
    setIsResponding(true);
    await done;
    setIsResponding(false);
  }, []);
  const { handleShellCommand } = useShellCommandProcessor(
    addItem,
    setPendingHistoryItem,
    onExec,
    onDebugMessage,
    config,
    agentsClient,
  );

  const streamingState = useMemo(() => {
    if (pendingApprovalIds.length > 0) {
      return StreamingState.WaitingForConfirmation;
    }
    if (toolCalls.some((tc) => tc.status === 'awaiting_approval')) {
      return StreamingState.WaitingForConfirmation;
    }
    if (
      isResponding ||
      toolCalls.some(
        (tc) =>
          tc.status === 'executing' ||
          tc.status === 'scheduled' ||
          tc.status === 'validating' ||
          ((tc.status === 'success' ||
            tc.status === 'error' ||
            tc.status === 'cancelled') &&
            !(tc as TrackedCompletedToolCall | TrackedCancelledToolCall)
              .responseSubmittedToGemini),
      )
    ) {
      return StreamingState.Responding;
    }
    return StreamingState.Idle;
  }, [isResponding, pendingApprovalIds, toolCalls]);

  useEffect(() => {
    if (
      config.getApprovalMode() === ApprovalMode.YOLO &&
      streamingState === StreamingState.Idle
    ) {
      const lastUserMessageIndex = history.findLastIndex(
        (item: HistoryItem) => item.type === MessageType.USER,
      );

      const turnCount =
        lastUserMessageIndex === -1 ? 0 : history.length - lastUserMessageIndex;

      if (turnCount > 0) {
        logConversationFinishedEvent(
          config,
          new ConversationFinishedEvent(config.getApprovalMode(), turnCount),
        );
      }
    }
  }, [streamingState, config, history]);

  const cancelOngoingRequest = useCallback(() => {
    if (streamingState === StreamingState.WaitingForConfirmation) {
      const pendingIds = [...pendingApprovalIds];
      let handled = false;
      for (const callId of pendingIds) {
        const details = pendingToolApprovalsRef.current.get(callId);
        if (!details) {
          continue;
        }
        handled = true;
        void details.onConfirm(ToolConfirmationOutcome.Cancel);
      }
      if (handled) {
        return;
      }
    }
    if (streamingState !== StreamingState.Responding) {
      return;
    }
    if (turnCancelledRef.current) {
      return;
    }
    turnCancelledRef.current = true;
    abortControllerRef.current?.abort();
    if (pendingHistoryItemRef.current) {
      addItem(pendingHistoryItemRef.current, Date.now());
    }
    addItem(
      {
        type: MessageType.INFO,
        text: 'Request cancelled.',
      },
      Date.now(),
    );
    setPendingHistoryItem(null);
    onCancelSubmit();
    setIsResponding(false);
  }, [
    streamingState,
    pendingApprovalIds,
    addItem,
    setPendingHistoryItem,
    onCancelSubmit,
    pendingHistoryItemRef,
  ]);

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        cancelOngoingRequest();
      }
    },
    {
      isActive:
        streamingState === StreamingState.Responding ||
        streamingState === StreamingState.WaitingForConfirmation,
    },
  );

  useKeypress(
    (key) => {
      if (!multiAgentPanelActive) return;
      if (key.meta && key.ctrl && key.name === 'left') {
        cycleAgentFocus(-1);
      } else if (key.meta && key.ctrl && key.name === 'right') {
        cycleAgentFocus(1);
      } else if (key.name === 'return') {
        toggleFocusedAgent();
      } else if (key.name === 'escape') {
        collapseAgentPanels();
      }
    },
    { isActive: multiAgentPanelActive },
  );

  const executeToolCallBridge = useCallback(
    async (
      request: ToolCallRequestInfo,
      abortSignal: AbortSignal,
      metadata?: ToolExecutionMetadata,
    ): Promise<ToolCallResponseInfo> => {
      return new Promise<ToolCallResponseInfo>((resolve, reject) => {
        const abortHandler = () => {
          if (toolExecutionResolversRef.current.delete(request.callId)) {
            reject(new Error('Tool execution aborted'));
          }
        };
        abortSignal.addEventListener('abort', abortHandler, { once: true });

        toolExecutionResolversRef.current.set(request.callId, {
          resolve: (response) => {
            abortSignal.removeEventListener('abort', abortHandler);
            resolve(response);
          },
          metadata,
        });

        try {
          scheduleToolCalls(request, abortSignal);
        } catch (error) {
          abortSignal.removeEventListener('abort', abortHandler);
          toolExecutionResolversRef.current.delete(request.callId);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },
    [scheduleToolCalls],
  );

  useEffect(() => {
    config.setToolExecutionBridge(executeToolCallBridge);
    return () => {
      config.setToolExecutionBridge(undefined);
      toolExecutionResolversRef.current.clear();
    };
  }, [config, executeToolCallBridge]);

  const prepareQueryForGemini = useCallback(
    async (
      query: GeminiPartListUnion,
      userMessageTimestamp: number,
      abortSignal: AbortSignal,
      prompt_id: string,
    ): Promise<{
      queryToSend: GeminiPartListUnion | null;
      shouldProceed: boolean;
    }> => {
      if (turnCancelledRef.current) {
        return { queryToSend: null, shouldProceed: false };
      }
      if (typeof query === 'string' && query.trim().length === 0) {
        return { queryToSend: null, shouldProceed: false };
      }

      let localQueryToSendToGemini: GeminiPartListUnion | null = null;

      if (typeof query === 'string') {
        const trimmedQuery = query.trim();
        logUserPrompt(
          config,
          new UserPromptEvent(
            trimmedQuery.length,
            prompt_id,
            config.getContentGeneratorConfig()?.authType,
            trimmedQuery,
          ),
        );
        onDebugMessage(`User query: '${trimmedQuery}'`);
        await logger?.logMessage(MessageSenderType.USER, trimmedQuery);

        // Handle UI-only commands first
        const slashCommandResult = isSlashCommand(trimmedQuery)
          ? await handleSlashCommand(trimmedQuery)
          : false;

        if (slashCommandResult) {
          switch (slashCommandResult.type) {
            case 'schedule_tool': {
              const { toolName, toolArgs } = slashCommandResult;
              const toolCallRequest: ToolCallRequestInfo = {
                callId: `${toolName}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                name: toolName,
                args: toolArgs,
                isClientInitiated: true,
                prompt_id,
              };
              await scheduleToolCalls([toolCallRequest], abortSignal);
              return { queryToSend: null, shouldProceed: false };
            }
            case 'submit_prompt': {
              localQueryToSendToGemini = toGeminiContent(slashCommandResult.content);

              return {
                queryToSend: localQueryToSendToGemini,
                shouldProceed: true,
              };
            }
            case 'handled': {
              return { queryToSend: null, shouldProceed: false };
            }
            default: {
              const unreachable: never = slashCommandResult;
              throw new Error(
                `Unhandled slash command result type: ${unreachable}`,
              );
            }
          }
        }

        if (shellModeActive && handleShellCommand(trimmedQuery, abortSignal)) {
          return { queryToSend: null, shouldProceed: false };
        }

        // Handle @-commands (which might involve tool calls)
        if (isAtCommand(trimmedQuery)) {
          const atCommandResult = await handleAtCommand({
            query: trimmedQuery,
            config,
            addItem,
            onDebugMessage,
            messageId: userMessageTimestamp,
            signal: abortSignal,
          });

          // Add user's turn after @ command processing is done.
          addItem(
            { type: MessageType.USER, text: trimmedQuery },
            userMessageTimestamp,
          );

          if (!atCommandResult.shouldProceed || atCommandResult.processedQuery === null) {
            return { queryToSend: null, shouldProceed: false };
          }
          localQueryToSendToGemini = toGeminiContent(atCommandResult.processedQuery);
        } else {
          // Normal query for Gemini
          addItem(
            { type: MessageType.USER, text: trimmedQuery },
            userMessageTimestamp,
          );
          localQueryToSendToGemini = trimmedQuery;
        }
      } else {
        // It's a function response (GeminiPartListUnion that isn't a string)
        localQueryToSendToGemini = query;
      }

      if (localQueryToSendToGemini === null) {
        onDebugMessage(
          'Query processing resulted in null, not sending to Gemini.',
        );
        return { queryToSend: null, shouldProceed: false };
      }
      return { queryToSend: localQueryToSendToGemini, shouldProceed: true };
    },
    [
      config,
      addItem,
      onDebugMessage,
      handleShellCommand,
      handleSlashCommand,
      logger,
      shellModeActive,
      scheduleToolCalls,
    ],
  );

  // --- Stream Event Handlers ---

  const handleContentEvent = useCallback(
    (
      eventValue: ContentEvent['value'],
      currentGeminiMessageBuffer: string,
      userMessageTimestamp: number,
    ): string => {
      if (turnCancelledRef.current) {
        // Prevents additional output after a user initiated cancel.
        return '';
      }
      let newGeminiMessageBuffer = currentGeminiMessageBuffer + eventValue;
      if (
        pendingHistoryItemRef.current?.type !== 'gemini' &&
        pendingHistoryItemRef.current?.type !== 'gemini_content'
      ) {
        if (pendingHistoryItemRef.current) {
          addItem(pendingHistoryItemRef.current, userMessageTimestamp);
        }
        setPendingHistoryItem({ type: 'gemini', text: '' });
        newGeminiMessageBuffer = eventValue;
      }
      // Split large messages for better rendering performance. Ideally,
      // we should maximize the amount of output sent to <Static />.
      const splitPoint = findLastSafeSplitPoint(newGeminiMessageBuffer);
      if (splitPoint === newGeminiMessageBuffer.length) {
        // Update the existing message with accumulated content
        setPendingHistoryItem((item) => ({
          type: item?.type as 'gemini' | 'gemini_content',
          text: newGeminiMessageBuffer,
        }));
      } else {
        // This indicates that we need to split up this Gemini Message.
        // Splitting a message is primarily a performance consideration. There is a
        // <Static> component at the root of App.tsx which takes care of rendering
        // content statically or dynamically. Everything but the last message is
        // treated as static in order to prevent re-rendering an entire message history
        // multiple times per-second (as streaming occurs). Prior to this change you'd
        // see heavy flickering of the terminal. This ensures that larger messages get
        // broken up so that there are more "statically" rendered.
        const beforeText = newGeminiMessageBuffer.substring(0, splitPoint);
        const afterText = newGeminiMessageBuffer.substring(splitPoint);
        addItem(
          {
            type: pendingHistoryItemRef.current?.type as
              | 'gemini'
              | 'gemini_content',
            text: beforeText,
          },
          userMessageTimestamp,
        );
        setPendingHistoryItem({ type: 'gemini_content', text: afterText });
        newGeminiMessageBuffer = afterText;
      }
      return newGeminiMessageBuffer;
    },
    [addItem, pendingHistoryItemRef, setPendingHistoryItem],
  );

  const handleUserCancelledEvent = useCallback(
    (userMessageTimestamp: number) => {
      if (turnCancelledRef.current) {
        return;
      }
      if (pendingHistoryItemRef.current) {
        if (pendingHistoryItemRef.current.type === 'tool_group') {
          const updatedTools = pendingHistoryItemRef.current.tools.map(
            (tool) =>
              tool.status === ToolCallStatus.Pending ||
              tool.status === ToolCallStatus.Confirming ||
              tool.status === ToolCallStatus.Executing
                ? { ...tool, status: ToolCallStatus.Canceled }
                : tool,
          );
          const pendingItem: HistoryItemToolGroup = {
            ...pendingHistoryItemRef.current,
            tools: updatedTools,
          };
          addItem(pendingItem, userMessageTimestamp);
        } else {
          addItem(pendingHistoryItemRef.current, userMessageTimestamp);
        }
        setPendingHistoryItem(null);
      }
      addItem(
        { type: MessageType.INFO, text: 'User cancelled the request.' },
        userMessageTimestamp,
      );
      setIsResponding(false);
      setThought(null); // Reset thought when user cancels
    },
    [addItem, pendingHistoryItemRef, setPendingHistoryItem, setThought],
  );

  const handleErrorEvent = useCallback(
    (eventValue: GeminiErrorEventValue, userMessageTimestamp: number) => {
      if (pendingHistoryItemRef.current) {
        addItem(pendingHistoryItemRef.current, userMessageTimestamp);
        setPendingHistoryItem(null);
      }
      addItem(
        {
          type: MessageType.ERROR,
          text: parseAndFormatApiError(
            eventValue.error,
            config.getContentGeneratorConfig()?.authType,
            undefined,
            config.getModel(),
            DEFAULT_GEMINI_FLASH_MODEL,
          ),
        },
        userMessageTimestamp,
      );
      setThought(null); // Reset thought when there's an error
    },
    [addItem, pendingHistoryItemRef, setPendingHistoryItem, config, setThought],
  );

  const handleToolConfirmationEvent = useCallback(
    (eventValue: { request: ToolCallRequestInfo; details: ToolCallConfirmationDetails }) => {
      const { request, details } = eventValue;
      const callId = request.callId;
      const argsSummary = (() => {
        try {
          const serialized = JSON.stringify(request.args ?? {}, null, 2);
          return serialized.length > 0 ? serialized : '(no arguments)';
        } catch (_error) {
          return String(request.args ?? '');
        }
      })();

      const wrappedDetails: ToolCallConfirmationDetails = {
        ...details,
        onConfirm: async (outcome: ToolConfirmationOutcome) => {
          await details.onConfirm(outcome);
          clearPendingApproval(callId);
        },
      };

      registerPendingApproval(callId, wrappedDetails);
      setPendingHistoryItem({
        type: 'tool_group',
        tools: [
          {
            callId,
            name: request.name,
            description: argsSummary,
            resultDisplay: undefined,
            status: ToolCallStatus.Confirming,
            confirmationDetails: wrappedDetails,
          },
        ],
      });
    },
    [registerPendingApproval, clearPendingApproval, setPendingHistoryItem],
  );

  const handleCitationEvent = useCallback(
    (text: string, userMessageTimestamp: number) => {
      if (!settings?.merged?.ui?.showCitations) {
        return;
      }
      if (pendingHistoryItemRef.current) {
        addItem(pendingHistoryItemRef.current, userMessageTimestamp);
        setPendingHistoryItem(null);
      }
      addItem({ type: MessageType.INFO, text }, userMessageTimestamp);
    },
    [addItem, pendingHistoryItemRef, setPendingHistoryItem, settings],
  );

  const handleFinishedEvent = useCallback(
    (event: ServerGeminiFinishedEvent, userMessageTimestamp: number) => {
      const finishReason = (event.value ?? 'FINISH_REASON_UNSPECIFIED') as GeminiFinishReason | string;

      const finishReasonMessages: Record<GeminiFinishReason | string, string | undefined> = {
        FINISH_REASON_UNSPECIFIED: undefined,
        STOP: undefined,
        MAX_TOKENS: 'Response truncated due to token limits.',
        SAFETY: 'Response stopped due to safety reasons.',
        RECITATION: 'Response stopped due to recitation policy.',
        LANGUAGE: 'Response stopped due to unsupported language.',
        BLOCKLIST: 'Response stopped due to forbidden terms.',
        PROHIBITED_CONTENT: 'Response stopped due to prohibited content.',
        SPII: 'Response stopped due to sensitive personally identifiable information.',
        OTHER: 'Response stopped for other reasons.',
        MALFORMED_FUNCTION_CALL: 'Response stopped due to malformed function call.',
        IMAGE_SAFETY: 'Response stopped due to image safety violations.',
        UNEXPECTED_TOOL_CALL: 'Response stopped due to unexpected tool call.',
      };

      const finishReasonKey: GeminiFinishReason | string = finishReason;
      const message = finishReasonMessages[finishReasonKey];
      if (message) {
        addItem(
          {
            type: 'info',
            text: `⚠️  ${message}`,
          },
          userMessageTimestamp,
        );
      }
    },
    [addItem],
  );

  const handleChatCompressionEvent = useCallback(
    (eventValue: ServerGeminiChatCompressedEvent['value']) =>
      addItem(
        {
          type: 'info',
          text:
            `IMPORTANT: This conversation approached the input token limit for ${config.getModel()}. ` +
            `A compressed context will be sent for future messages (compressed from: ` +
            `${eventValue?.originalTokenCount ?? 'unknown'} to ` +
            `${eventValue?.newTokenCount ?? 'unknown'} tokens).`,
        },
        Date.now(),
      ),
    [addItem, config],
  );

  const handleMaxSessionTurnsEvent = useCallback(
    () =>
      addItem(
        {
          type: 'info',
          text:
            `The session has reached the maximum number of turns: ${config.getMaxSessionTurns()}. ` +
            `Please update this limit in your setting.json file.`,
        },
        Date.now(),
      ),
    [addItem, config],
  );

  const handleLoopDetectedEvent = useCallback(() => {
    addItem(
      {
        type: 'info',
        text: `A potential loop was detected. This can happen due to repetitive tool calls or other model behavior. The request has been halted.`,
      },
      Date.now(),
    );
  }, [addItem]);

  const processGeminiStreamEvents = useCallback(
    async (
      stream: AsyncIterable<GeminiEvent>,
      userMessageTimestamp: number,
      signal: AbortSignal,
    ): Promise<StreamProcessingStatus> => {
      console.log('[processGeminiStreamEvents] Starting to process stream...');
      let geminiMessageBuffer = '';
      const toolCallRequests: ToolCallRequestInfo[] = [];

      const flushAssistantResponse = async () => {
        if (toolCallRequests.length === 0 && !geminiMessageBuffer.trim()) {
          return false;
        }

        const assistantParts: Array<
          { text?: string; functionCall?: { id: string; name: string; args: Record<string, unknown> } }
        > = [];

        if (geminiMessageBuffer.trim()) {
          assistantParts.push({ text: geminiMessageBuffer });
        }

        if (toolCallRequests.length > 0) {
          console.log(
            '[useGeminiStream] Recording tool call(s) in history:',
            toolCallRequests.map((call) => call.name).join(', '),
          );
          toolCallRequests.forEach((toolCall) => {
            assistantParts.push({
              functionCall: {
                id: toolCall.callId,
                name: toolCall.name,
                args: toolCall.args,
              },
            });
          });
        }

        await agentsClient.addHistory({
          role: 'model',
          parts: assistantParts as any,
        });

        geminiMessageBuffer = '';
        toolCallRequests.length = 0;
        return true;
      };

      console.log('[processGeminiStreamEvents] About to iterate over stream...');
      for await (const event of stream) {
        console.log('[processGeminiStreamEvents] Received event type:', event.type);
        switch (event.type) {
          case ServerGeminiEventType.Thought:
            setThought(event.value);
            if (event.value && typeof event.value === 'object') {
              const description = event.value.description ?? '';
              if (typeof description === 'string' && description.trim().length > 0) {
                reasoningItemsRef.current.push({
                  text: description.trim(),
                  raw: event.value.raw,
                });
              }
            }
            break;
          case ServerGeminiEventType.Content:
            geminiMessageBuffer = handleContentEvent(
              event.value,
              geminiMessageBuffer,
              userMessageTimestamp,
            );
            break;
          case ServerGeminiEventType.ToolCallRequest:
            toolCallRequests.push(event.value);
            await flushAssistantResponse();
            clearPendingApproval(event.value.callId);
            if (event.value && !toolExecutionResolversRef.current.has(event.value.callId)) {
              console.log('[useGeminiStream] Scheduling tool call (resolver not registered yet)');
              scheduleToolCalls(event.value, signal);
            } else {
              console.log('[useGeminiStream] Tool execution already scheduled via bridge, skipping re-schedule');
            }
            break;
          case ServerGeminiEventType.UserCancelled:
            handleUserCancelledEvent(userMessageTimestamp);
            break;
          case ServerGeminiEventType.Error:
            handleErrorEvent(event.value, userMessageTimestamp);
            break;
          case ServerGeminiEventType.ChatCompressed:
            handleChatCompressionEvent(event.value);
            break;
          case ServerGeminiEventType.ToolCallConfirmation:
            handleToolConfirmationEvent(event.value);
            break;
          case ServerGeminiEventType.ToolCallResponse:
            // do nothing
            break;
          case ServerGeminiEventType.MaxSessionTurns:
            handleMaxSessionTurnsEvent();
            break;
          case ServerGeminiEventType.Finished:
            handleFinishedEvent(
              event as ServerGeminiFinishedEvent,
              userMessageTimestamp,
            );
            break;
          case ServerGeminiEventType.Citation:
            handleCitationEvent(event.value, userMessageTimestamp);
            break;
          case ServerGeminiEventType.LoopDetected:
            // handle later because we want to move pending history to history
            // before we add loop detected message to history
            loopDetectedRef.current = true;
            break;
          default: {
            // enforces exhaustive switch-case
            const unreachable: never = event;
            return unreachable;
          }
        }
      }
      
      console.log('[useGeminiStream] After processing stream - toolCallRequests:', toolCallRequests.length, 'buffer length:', geminiMessageBuffer.length);
      await flushAssistantResponse();
      return StreamProcessingStatus.Completed;
    },
    [
      handleContentEvent,
      handleUserCancelledEvent,
      handleErrorEvent,
      scheduleToolCalls,
      handleChatCompressionEvent,
      handleFinishedEvent,
      handleMaxSessionTurnsEvent,
      handleCitationEvent,
      agentsClient,
    ],
  );

  const submitQuery = useCallback(
    async (
      query: GeminiPartListUnion,
      options?: { isContinuation: boolean },
      prompt_id?: string,
    ) => {
      if (
        (streamingState === StreamingState.Responding ||
          streamingState === StreamingState.WaitingForConfirmation) &&
        !options?.isContinuation
      )
        return;

      const userMessageTimestamp = Date.now();

      if (!options?.isContinuation) {
        processedCompletionCallIdsRef.current.clear();
      }

      // Reset quota error flag when starting a new query (not a continuation)
      if (!options?.isContinuation) {
        setModelSwitchedFromQuotaError(false);
        config.setQuotaErrorOccurred(false);
        reasoningItemsRef.current = [];
        toolHistoryEntryRef.current.clear();
      }

      abortControllerRef.current = new AbortController();
      const abortSignal = abortControllerRef.current.signal;
      turnCancelledRef.current = false;

      if (!prompt_id) {
        prompt_id = config.getSessionId() + '########' + getPromptCount();
      }

      // Handle automatic agent selection for new queries (not continuations) with streaming
      let previousAgentState: string[] | undefined;
      let autoSelectionShouldProceed = true;

      const autoModeEnabled = isAutoModeEnabled();
      console.log('[DEBUG] isAutoModeEnabled():', autoModeEnabled, 'isContinuation:', !!options?.isContinuation);
      
      if (!options?.isContinuation && autoModeEnabled) {
        console.log('[DEBUG] Agent selection is enabled, starting selection process...');
        try {
          // Extract text from query parts for agent selection
          const queryText = Array.isArray(query) 
            ? query.map(part => typeof part === 'string' ? part : (part as any).text || '').join(' ')
            : typeof query === 'string' ? query : (query as any).text || '';
          
          console.log('[DEBUG] Extracted query text for agent selection:', queryText);
          activatePanelForSelection(
            {
              selectedAgents: [],
              reasoning: 'Analyzing prompt and scouting specialists...',
              confidence: 0,
              processingTime: 0,
            },
            'planning',
          );

          // Stream the agent selection process with progressive feedback
          const selectionStream = processPromptWithAutoSelectionStream(queryText);
          console.log('[DEBUG] Created selection stream, starting to process events...');
          
          for await (const event of selectionStream as AsyncGenerator<SelectionStreamEvent>) {
            console.log('[DEBUG] Selection stream event:', event.type);
            if (event.type === 'progress') {
              if (event.selectionPreview) {
                const previewStatus = event.selectionPreview.status ?? 'running';
                activatePanelForSelection(event.selectionPreview, previewStatus);
                continue;
              }
              // Progress messages are already shown by the stream
              continue;
            } else if (event.type === 'complete') {
              console.log('[DEBUG] Agent selection completed');
              if (event.selectionFeedback) {
                const feedbackStatus = event.selectionFeedback.status ?? 'complete';
                activatePanelForSelection(event.selectionFeedback, feedbackStatus);
                const names = event.selectionFeedback.selectedAgents
                  .map((agent) => `${agent.emoji} ${agent.name}`)
                  .join(', ');
                setActiveSpecialistNames(names);
              }
              if (event.showSelectionFeedback) {
                previousAgentState = event.previousAgentState;
                multiAgentShowSelectionRef.current = () => {
                  if (multiAgentFinalHistoryAddedRef.current) {
                    return;
                  }
                  event.showSelectionFeedback?.();
                  multiAgentFinalHistoryAddedRef.current = true;
                };
                console.log('[DEBUG] Captured selection feedback state');
              }
              if (!event.selectionFeedback) {
                clearMultiAgentStatus();
              }
              autoSelectionShouldProceed = event.shouldProceed ?? true;
              break;
            }
          }
          console.log('[DEBUG] Agent selection stream processing complete');
      } catch (error) {
        console.error('[DEBUG] Streaming agent selection failed:', error);
        // Continue with normal processing if agent selection fails
        clearMultiAgentStatus();
      }
    } else {
      console.log('[DEBUG] Skipping agent selection - isContinuation:', !!options?.isContinuation, 'isAutoModeEnabled:', isAutoModeEnabled());
    }

      if (!autoSelectionShouldProceed) {
        setIsResponding(false);
        if (previousAgentState) {
          restorePreviousAgentState(previousAgentState);
        }
        if (!isAutoModeEnabled()) {
          scheduleMultiAgentStatusClear(MULTI_AGENT_PANEL_IDLE_CLEAR_MS);
        }
        return;
      }

      console.log('[DEBUG] About to prepare query for Ouroboros...');
      const { queryToSend, shouldProceed } = await prepareQueryForGemini(
        query,
        userMessageTimestamp,
        abortSignal,
        prompt_id!,
      );
      
      console.log('[DEBUG] Query preparation complete - shouldProceed:', shouldProceed, 'queryToSend exists:', !!queryToSend);

      if (!shouldProceed || queryToSend === null) {
        console.log('[DEBUG] Stopping execution - shouldProceed:', shouldProceed, 'queryToSend:', queryToSend);
        
        // Critical fix: If this is a continuation but preparation failed, we need to restore proper state
        if (options?.isContinuation) {
          console.log('[DEBUG] Continuation failed during preparation - ensuring isResponding is false');
          setIsResponding(false);
          // Restore agent state if needed
          if (previousAgentState) {
            restorePreviousAgentState(previousAgentState);
          }
        }
        scheduleMultiAgentStatusClear(0);
        return;
      }
      
      console.log('[DEBUG] Proceeding with conversation...');

      if (!options?.isContinuation) {
        startNewPrompt();
        setThought(null); // Reset thought when starting a new prompt
      }

      setIsResponding(true);
      setInitError(null);

      try {
        console.log('[DEBUG] Starting LLM conversation phase...');
        console.log('[useGeminiStream] About to call sendMessageStream');
        
        // Show immediate thinking feedback for selected provider
        const currentProvider = config.getProvider();
        const providerEmojis = {
          gemini: '🧠',
          openai: '🤖', 
          anthropic: '🔮'
        };
        const providerNames = {
          gemini: 'Gemini',
          openai: 'OpenAI',
          anthropic: 'Anthropic'
        };
        const specialistSuffix = activeSpecialistNames
          ? ` orchestrating ${activeSpecialistNames}...`
          : ' is thinking deeply about your request...';
        addItem(
          {
            type: MessageType.INFO,
            text: `${providerEmojis[currentProvider] || '🤔'} **${
              providerNames[currentProvider] || config.getModel()
            }${specialistSuffix}**`,
          },
          userMessageTimestamp,
        );

        // Advanced thinking progress with timeout-based updates
        const thinkingProgressInterval = setInterval(() => {
          if (abortSignal.aborted) {
            clearInterval(thinkingProgressInterval);
            return;
          }
          
          const advancedMessages = [
            `💭 **Analyzing context and requirements...**`,
            `🔍 **Considering multiple solution approaches...**`, 
            `⚡ **Optimizing response quality...**`,
            `🎯 **Preparing comprehensive answer...**`
          ];
          
          const randomMessage = advancedMessages[Math.floor(Math.random() * advancedMessages.length)];
          addItem(
            {
              type: MessageType.INFO,
              text: randomMessage,
            },
            Date.now(),
          );
        }, 3000); // Show progress every 3 seconds during thinking
        
        console.log('[useGeminiStream] Creating stream...');
        const stream = await agentsClient.sendMessageStream(
          {
            message: queryToSend as PartListUnion,
            config: {
              abortSignal,
            },
          },
          prompt_id!,
        );
        console.log('[useGeminiStream] Stream created');

        // Clear the thinking progress once streaming is active
        clearInterval(thinkingProgressInterval);

        const mappedStream = mapAgentsStreamToGeminiEvents(stream, prompt_id!);

        console.log('[useGeminiStream] About to process stream events...');
        const processingStatus = await processGeminiStreamEvents(
          mappedStream,
          userMessageTimestamp,
          abortSignal,
        );
        console.log('[useGeminiStream] Stream processing completed with status:', processingStatus);

        if (processingStatus === StreamProcessingStatus.UserCancelled) {
          return;
        }

        if (pendingHistoryItemRef.current) {
          addItem(pendingHistoryItemRef.current, userMessageTimestamp);
          setPendingHistoryItem(null);
        }
        if (loopDetectedRef.current) {
          loopDetectedRef.current = false;
          handleLoopDetectedEvent();
        }

        // Agent selection feedback was already shown immediately after selection
      } catch (error: unknown) {
        clearMultiAgentStatus();
        if (error instanceof UnauthorizedError) {
          onAuthError();
        } else if (!isNodeError(error) || error.name !== 'AbortError') {
          addItem(
            {
              type: MessageType.ERROR,
              text: parseAndFormatApiError(
                getErrorMessage(error) || 'Unknown error',
                config.getContentGeneratorConfig()?.authType,
                undefined,
                config.getModel(),
                DEFAULT_GEMINI_FLASH_MODEL,
              ),
            },
            userMessageTimestamp,
          );
        }
      } finally {
        if (!isAutoModeEnabled()) {
          scheduleMultiAgentStatusClear(MULTI_AGENT_PANEL_IDLE_CLEAR_MS);
        }
        setIsResponding(false);
        
        // Restore previous agent state after conversation turn completes
        if (previousAgentState) {
          try {
            await restorePreviousAgentState(previousAgentState);
          } catch (error) {
            console.error('Failed to restore agent state:', error);
          }
        }
      }
    },
    [
      streamingState,
      setModelSwitchedFromQuotaError,
      prepareQueryForGemini,
      processGeminiStreamEvents,
      pendingHistoryItemRef,
      addItem,
      setPendingHistoryItem,
      setInitError,
      agentsClient,
      onAuthError,
      config,
      startNewPrompt,
      getPromptCount,
      handleLoopDetectedEvent,
      processPromptWithAutoSelection,
      restorePreviousAgentState,
      isAutoModeEnabled,
      clearMultiAgentStatus,
      scheduleMultiAgentStatusClear,
    ],
  );

  const handleCompletedTools = useCallback(
    async (completedToolCallsFromScheduler: TrackedToolCall[]) => {
      const dedupedCompletions = completedToolCallsFromScheduler.filter((call) => {
        if (processedCompletionCallIdsRef.current.has(call.request.callId)) {
          return false;
        }
        processedCompletionCallIdsRef.current.add(call.request.callId);
        return true;
      });

      if (dedupedCompletions.length === 0) {
        return;
      }

      const displayGroup = mapTrackedToolCallsToDisplay(
        dedupedCompletions as TrackedToolCall[],
      ) as HistoryItemToolGroup;
      const callKey = displayGroup.tools
        .map((tool) => tool.callId)
        .sort()
        .join('|');
      const timestamp = Date.now();

      if (toolHistoryEntryRef.current.has(callKey)) {
        const existingId = toolHistoryEntryRef.current.get(callKey)!;
        updateItem(existingId, (prev) => ({
          ...(prev as HistoryItemToolGroup),
          tools: displayGroup.tools,
        }));
      } else {
        const newId = addItem(displayGroup, timestamp);
        toolHistoryEntryRef.current.set(callKey, newId);
      }

      for (const completed of dedupedCompletions) {
        if ('response' in completed) {
          const resolver = toolExecutionResolversRef.current.get(
            completed.request.callId,
          );
          if (resolver) {
            toolExecutionResolversRef.current.delete(completed.request.callId);
            resolver.resolve(completed.response as ToolCallResponseInfo);
          }
        }
      }

      const completedAndReadyToSubmitTools = dedupedCompletions.filter(
          (
            tc: TrackedToolCall,
          ): tc is TrackedCompletedToolCall | TrackedCancelledToolCall => {
            const isTerminalState =
              tc.status === 'success' ||
              tc.status === 'error' ||
              tc.status === 'cancelled';

            if (isTerminalState) {
              const completedOrCancelledCall = tc as
                | TrackedCompletedToolCall
                | TrackedCancelledToolCall;
              return (
                completedOrCancelledCall.response?.responseParts !== undefined
              );
            }
            return false;
    },
    [
      addItem,
      config,
      multiAgentPanelActive,
      setPendingHistoryItem,
      startNewPrompt,
      streamingState,
    ],
  );

      // Finalize any client-initiated tools as soon as they are done.
      const clientTools = completedAndReadyToSubmitTools.filter(
        (t) => t.request.isClientInitiated,
      );
      if (clientTools.length > 0) {
        markToolsAsSubmitted(clientTools.map((t) => t.request.callId));
      }

      // Identify new, successful save_memory calls that we haven't processed yet.
      const newSuccessfulMemorySaves = completedAndReadyToSubmitTools.filter(
        (t) =>
          t.request.name === 'save_memory' &&
          t.status === 'success' &&
          !processedMemoryToolsRef.current.has(t.request.callId),
      );

      if (newSuccessfulMemorySaves.length > 0) {
        // Perform the refresh only if there are new ones.
        void performMemoryRefresh();
        // Mark them as processed so we don't do this again on the next render.
        newSuccessfulMemorySaves.forEach((t) =>
          processedMemoryToolsRef.current.add(t.request.callId),
        );
      }

      const geminiTools = completedAndReadyToSubmitTools.filter(
        (t) => !t.request.isClientInitiated,
      );

      if (geminiTools.length === 0) {
        return;
      }

      // If all the tools were cancelled, don't submit a response to Gemini.
      const allToolsCancelled = geminiTools.every(
        (tc) => tc.status === 'cancelled',
      );

      if (allToolsCancelled) {
        if (agentsClient) {
          // We need to manually add the function responses to the history
          // so the model knows the tools were cancelled.
          const combinedParts = geminiTools.flatMap(
            (toolCall) => toolCall.response.responseParts,
          );
          agentsClient.addHistory({
            role: 'user',
            parts: combinedParts,
          });
        }

        const callIdsToMarkAsSubmitted = geminiTools.map(
          (toolCall) => toolCall.request.callId,
        );
        markToolsAsSubmitted(callIdsToMarkAsSubmitted);
        reasoningItemsRef.current = [];
        return;
      }

      const reasoningParts: GeminiPart[] = reasoningItemsRef.current
        .filter((item) => typeof item.text === 'string' && item.text.trim().length > 0)
        .map((item) => {
          const part: GeminiPart = { thought: item.text.trim() } as GeminiPart;
          if (item.raw) {
            const currentMetadata = (part as Record<string, unknown>)['metadata'];
            const normalizedMetadata =
              currentMetadata && typeof currentMetadata === 'object'
                ? (currentMetadata as Record<string, unknown>)
                : {};
            (part as Record<string, unknown>)['metadata'] = {
              ...normalizedMetadata,
              reasoningRaw: item.raw,
            };
          }
          return part;
        });

      const responsesToSend: GeminiPart[] = [
        ...reasoningParts,
        ...geminiTools.flatMap((toolCall) => toolCall.response.responseParts),
      ];
      const callIdsToMarkAsSubmitted = geminiTools.map(
        (toolCall) => toolCall.request.callId,
      );

      const prompt_ids = geminiTools.map(
        (toolCall) => toolCall.request.prompt_id,
      );

      markToolsAsSubmitted(callIdsToMarkAsSubmitted);

      // Don't continue if model was switched due to quota error
      if (modelSwitchedFromQuotaError) {
        reasoningItemsRef.current = [];
        return;
      }

      // Provider-specific tool continuation handling:
      // All providers need external continuation when tools are executed by the UI layer
      // The Turn class internal continuation only works if the Turn class itself executes the tools
      const currentProvider = config.getProvider();
      console.log(`[DEBUG] Provider ${currentProvider} will use external tool continuation mechanism (UI-executed tools)`);
      
      // Note: We tried skipping external continuation for OpenAI/Anthropic, but that only works
      // if the Turn class executes the tools. Since the UI layer is executing tools,
      // we need the external continuation mechanism for all providers.

      // External continuation mechanism for all providers (when tools are executed by UI)
      try {
        console.log('[DEBUG] Submitting tool results as continuation with', responsesToSend.length, 'parts');
        
        // All providers use the same mechanism - send tool responses as continuation
        // The Turn class will handle them appropriately based on the provider
        const currentProvider = config.getProvider();
        console.log('[DEBUG] Sending tool responses as continuation for provider:', currentProvider);
        
        await submitQuery(
          responsesToSend,
          {
            isContinuation: true,
          },
          prompt_ids[0],
        );
        console.log('[DEBUG] Tool continuation submitted successfully');
        reasoningItemsRef.current = [];
      } catch (error) {
        console.error('[DEBUG] Failed to submit tool continuation:', error);
        // If continuation fails, ensure we reset the responding state
        setIsResponding(false);
        addItem(
          {
            type: MessageType.ERROR,
            text: `Tool continuation failed: ${error instanceof Error ? error.message : String(error)}`,
          },
          Date.now(),
        );
      }
    },
    [
      isResponding,
      submitQuery,
      markToolsAsSubmitted,
      agentsClient,
      performMemoryRefresh,
      modelSwitchedFromQuotaError,
    ],
  );

  const pendingHistoryItems = [
    pendingHistoryItemRef.current,
    pendingToolCallGroupDisplay,
  ].filter((i) => i !== undefined && i !== null);

  useEffect(() => {
    const saveRestorableToolCalls = async () => {
      if (!config.getCheckpointingEnabled()) {
        return;
      }
      const restorableToolCalls = toolCalls.filter(
        (toolCall) =>
          (toolCall.request.name === 'replace' ||
            toolCall.request.name === 'write_file') &&
          toolCall.status === 'awaiting_approval',
      );

      if (restorableToolCalls.length > 0) {
        const checkpointDir = storage.getProjectTempCheckpointsDir();

        if (!checkpointDir) {
          return;
        }

        try {
          await fs.mkdir(checkpointDir, { recursive: true });
        } catch (error) {
          if (!isNodeError(error) || error.code !== 'EEXIST') {
            onDebugMessage(
              `Failed to create checkpoint directory: ${getErrorMessage(error)}`,
            );
            return;
          }
        }

        for (const toolCall of restorableToolCalls) {
          const filePath = toolCall.request.args['file_path'] as string;
          if (!filePath) {
            onDebugMessage(
              `Skipping restorable tool call due to missing file_path: ${toolCall.request.name}`,
            );
            continue;
          }

          try {
            if (!gitService) {
              onDebugMessage(
                `Checkpointing is enabled but Git service is not available. Failed to create snapshot for ${filePath}. Ensure Git is installed and working properly.`,
              );
              continue;
            }

            let commitHash: string | undefined;
            try {
              commitHash = await gitService.createFileSnapshot(
                `Snapshot for ${toolCall.request.name}`,
              );
            } catch (error) {
              onDebugMessage(
                `Failed to create new snapshot: ${getErrorMessage(error)}. Attempting to use current commit.`,
              );
            }

            if (!commitHash) {
              commitHash = await gitService.getCurrentCommitHash();
            }

            if (!commitHash) {
              onDebugMessage(
                `Failed to create snapshot for ${filePath}. Checkpointing may not be working properly. Ensure Git is installed and the project directory is accessible.`,
              );
              continue;
            }

            const timestamp = new Date()
              .toISOString()
              .replace(/:/g, '-')
              .replace(/\./g, '_');
            const toolName = toolCall.request.name;
            const fileName = path.basename(filePath);
            const toolCallWithSnapshotFileName = `${timestamp}-${fileName}-${toolName}.json`;
            const clientHistory = await agentsClient?.getHistory();
            const toolCallWithSnapshotFilePath = path.join(
              checkpointDir,
              toolCallWithSnapshotFileName,
            );

            await fs.writeFile(
              toolCallWithSnapshotFilePath,
              JSON.stringify(
                {
                  history,
                  clientHistory,
                  toolCall: {
                    name: toolCall.request.name,
                    args: toolCall.request.args,
                  },
                  commitHash,
                  filePath,
                },
                null,
                2,
              ),
            );
          } catch (error) {
            onDebugMessage(
              `Failed to create checkpoint for ${filePath}: ${getErrorMessage(
                error,
              )}. This may indicate a problem with Git or file system permissions.`,
            );
          }
        }
      }
    };
    saveRestorableToolCalls();
  }, [
    toolCalls,
    config,
    onDebugMessage,
    gitService,
    history,
    agentsClient,
    storage,
  ]);

  return {
    streamingState,
    submitQuery,
    initError,
    pendingHistoryItems,
    thought,
    cancelOngoingRequest,
  };
};
