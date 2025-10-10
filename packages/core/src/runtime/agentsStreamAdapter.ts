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
  const emittedCallIds = new Set<string>();
  const emittedCallFingerprints = new Set<string>();

  const buildFingerprint = (call: FunctionCall | undefined | null): string | undefined => {
    if (!call) {
      return undefined;
    }
    const name = call.name ?? 'unknown_tool';
    const normalizedArgs = normalizeArgsForFingerprint(call.args);
    const fingerprint = `${name}::${stableSerialize(normalizedArgs)}`;
    return fingerprint;
  };

  const emitToolCall = (call: FunctionCall | null | undefined) => {
    if (!call) return undefined;
    if (typeof call.id !== 'string' || call.id.length === 0) {
      // Skip provisional tool call fragments that do not have a stable call ID yet.
      // The model will emit the finalized functionCall with an id in the candidate list.
      return undefined;
    }
    const callId = call.id;
    const fingerprint = buildFingerprint(call);

    if (emittedCallIds.has(callId)) {
      return undefined;
    }

    if (fingerprint && emittedCallFingerprints.has(fingerprint)) {
      return undefined;
    }
    emittedCallIds.add(callId);
    if (fingerprint) {
      emittedCallFingerprints.add(fingerprint);
    }
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
            const metadata = typeof part === 'object' ? (part as Record<string, unknown>)['metadata'] : undefined;
            const raw =
              metadata && typeof metadata === 'object'
                ? ((metadata as Record<string, unknown>)['reasoningRaw'] as Record<string, unknown> | undefined)
                : undefined;
            yield {
              type: ServerConversationEventType.Thought,
              value: {
                subject: 'Reasoning',
                description,
                raw,
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

function stableSerialize(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys.map(
    (key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`,
  );
  return `{${entries.join(',')}}`;
}

function normalizeArgsForFingerprint(args: unknown): unknown {
  if (typeof args === 'string') {
    try {
      return normalizeArgsForFingerprint(JSON.parse(args));
    } catch (_error) {
      return args;
    }
  }
  if (Array.isArray(args)) {
    return args.map((entry) => normalizeArgsForFingerprint(entry));
  }
  if (args && typeof args === 'object') {
    const record = args as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(record)) {
      result[key] = normalizeArgsForFingerprint(record[key]);
    }
    return result;
  }
  return args;
}
