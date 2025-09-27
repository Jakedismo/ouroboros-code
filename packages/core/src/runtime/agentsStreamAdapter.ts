/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ConversationEventType as ServerConversationEventType,
  type ToolCallRequestInfo,
  type ServerGeminiStreamEvent,
} from '../core/turn.js';
import { getErrorMessage } from '../utils/errors.js';
import type {
  GenerateContentResponse,
  FunctionCall,
  FinishReason,
  Part,
} from './genaiCompat.js';

/**
 * Converts an Agents client streaming iterator into the legacy Gemini stream
 * event format consumed by existing runtimes.
 */
export async function* mapAgentsStreamToGeminiEvents(
  stream: AsyncGenerator<GenerateContentResponse>,
  promptId: string,
): AsyncGenerator<ServerGeminiStreamEvent> {
  let lastFinishReason: FinishReason | undefined;
  let toolCallCounter = 0;
  const emittedCallIds = new Set<string>();

  const emitToolCall = (call: FunctionCall | null | undefined) => {
    if (!call) return undefined;
    const callId = call.id ?? `${call.name ?? 'tool'}-${Date.now()}-${toolCallCounter++}`;
    if (emittedCallIds.has(callId)) {
      return undefined;
    }
    emittedCallIds.add(callId);
    const requestInfo: ToolCallRequestInfo = {
      callId,
      name: call.name ?? 'unknown_tool',
      args: (call.args ?? {}) as Record<string, unknown>,
      isClientInitiated: false,
      prompt_id: promptId,
    };
    return {
      type: ServerConversationEventType.ToolCallRequest,
      value: requestInfo,
    } as ServerGeminiStreamEvent;
  };

  try {
    for await (const chunk of stream) {
      const candidate = chunk.candidates?.[0];
      if (!candidate) {
        continue;
      }

      const parts = Array.isArray(candidate.content?.parts)
        ? (candidate.content?.parts as Part[])
        : [];

      for (const part of parts) {
        if (typeof part.text === 'string' && part.text.length > 0) {
          yield {
            type: ServerConversationEventType.Content,
            value: part.text,
          } as ServerGeminiStreamEvent;
        }

        if (part.thought) {
          const description =
            typeof part.thought === 'string'
              ? part.thought
              : part.thought === true
              ? 'Reasoning in progress'
              : '';
          if (description) {
            yield {
              type: ServerConversationEventType.Thought,
              value: {
                subject: 'Reasoning',
                description,
              },
            } as ServerGeminiStreamEvent;
          }
        }

        const toolCallEvent = emitToolCall(part.functionCall as FunctionCall | undefined);
        if (toolCallEvent) {
          yield toolCallEvent;
        }
      }

      const candidateFunctionCalls = (candidate.functionCalls ?? []) as FunctionCall[];
      for (const call of candidateFunctionCalls) {
        const toolCallEvent = emitToolCall(call);
        if (toolCallEvent) {
          yield toolCallEvent;
        }
      }

      if (candidate.finishReason) {
        lastFinishReason = candidate.finishReason as FinishReason;
      }
    }

    yield {
      type: ServerConversationEventType.Finished,
      value: lastFinishReason ?? ('STOP' as FinishReason),
    } as ServerGeminiStreamEvent;
  } catch (error) {
    yield {
      type: ServerConversationEventType.Error,
      value: {
        error: {
          message: getErrorMessage(error),
        },
      },
    } as ServerGeminiStreamEvent;
  }
}
