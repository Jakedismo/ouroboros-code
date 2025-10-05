/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content, Part } from './genaiCompat.js';
import type { UnifiedAgentMessage } from './types.js';

const ROLE_MAP: Record<string, UnifiedAgentMessage['role']> = {
  user: 'user',
  model: 'assistant',
  system: 'system',
  function: 'tool',
  tool: 'tool',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function extractThought(part: Part): string | null {
  if (!isRecord(part)) {
    return null;
  }

  const directThought = part['thought'];
  if (typeof directThought === 'string' && directThought.trim().length > 0) {
    return directThought.trim();
  }

  const maybeFunctionCall = part['functionCall'];
  if (isRecord(maybeFunctionCall)) {
    const callThought = maybeFunctionCall['thought'];
    if (typeof callThought === 'string' && callThought.trim().length > 0) {
      return callThought.trim();
    }
  }

  return null;
}

/**
 * Extract function response data, preserving structured JSON when possible
 * Returns tuple: [displayText, structuredData]
 */
function extractFunctionResponseData(functionResponse: unknown): [string | null, unknown | null] {
  if (!isRecord(functionResponse)) {
    return [null, null];
  }

  const response = functionResponse['response'];

  // If response is already a string, use it directly
  if (typeof response === 'string' && response.trim().length > 0) {
    return [response.trim(), null];
  }

  // If response is structured data
  if (isRecord(response)) {
    const output = response['output'];
    if (typeof output === 'string' && output.trim().length > 0) {
      // Preserve the full response structure in metadata
      return [output.trim(), response];
    }

    const errorText = response['error'];
    if (typeof errorText === 'string' && errorText.trim().length > 0) {
      return [errorText.trim(), response];
    }

    const content = response['content'];
    if (Array.isArray(content)) {
      const rendered = content
        .map((entry) => {
          if (typeof entry === 'string') {
            return entry.trim();
          }
          if (isRecord(entry) && typeof entry['text'] === 'string') {
            return (entry['text'] as string).trim();
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');
      if (rendered.trim().length > 0) {
        // Preserve structured content array
        return [rendered.trim(), response];
      }
    }

    // Return structured response with JSON.stringify fallback for display
    try {
      const displayText = JSON.stringify(response, null, 2);
      return [displayText, response]; // Preserve structure!
    } catch (_error) {
      return [null, response];
    }
  }

  // Last resort: stringify the entire functionResponse
  try {
    const displayText = JSON.stringify(functionResponse, null, 2);
    return [displayText, functionResponse]; // Preserve structure!
  } catch (_error) {
    return [null, null];
  }
}

/**
 * Extract text and structured data from parts
 * Returns tuple: [text, structuredToolData]
 */
function extractFromParts(parts: Part[] | undefined): [string, Record<string, unknown> | null] {
  if (!Array.isArray(parts) || parts.length === 0) {
    return ['', null];
  }

  const textSegments: string[] = [];
  let structuredToolData: Record<string, unknown> | null = null;

  for (const part of parts) {
    if (!part) {
      continue;
    }

    if (typeof part === 'string') {
      const normalized = part.trim();
      if (normalized.length > 0) {
        textSegments.push(normalized);
      }
      continue;
    }

    const record = part as Record<string, unknown>;

    const text = record['text'];
    if (typeof text === 'string' && text.trim().length > 0) {
      textSegments.push(text.trim());
      continue;
    }

    const thought = extractThought(record as Part);
    if (thought) {
      textSegments.push(thought);
      continue;
    }

    // Extract function response with structured data preservation
    const [displayText, structuredData] = extractFunctionResponseData(record['functionResponse']);
    if (displayText) {
      textSegments.push(displayText);
      // Store structured data if available (GAP #1 FIX: Preserve typed payloads!)
      if (structuredData && !structuredToolData) {
        structuredToolData = { toolResponse: structuredData };
      }
    }
  }

  return [textSegments.join('\n').trim(), structuredToolData];
}

export function convertContentToUnifiedMessage(
  content: Content,
): UnifiedAgentMessage | null {
  const roleKey = typeof content.role === 'string' ? content.role : 'user';
  const role = ROLE_MAP[roleKey] ?? 'user';

  const metadata: Record<string, unknown> = {};
  let toolCallId: string | undefined;

  if (Array.isArray(content.parts)) {
    for (const part of content.parts) {
      if (!part || typeof part !== 'object') {
        continue;
      }
      const functionResponse = (part as Record<string, unknown>)['functionResponse'];
      if (isRecord(functionResponse)) {
        metadata['functionResponse'] = functionResponse;
        const callId = functionResponse['callId'] ?? functionResponse['id'];
        if (typeof callId === 'string' && callId.length > 0) {
          toolCallId = callId;
        }
        break;
      }
    }
  }

  // Extract text AND structured data (GAP #1 FIX!)
  const [text, structuredToolData] = extractFromParts(content.parts as Part[] | undefined);
  if (!text) {
    return null;
  }

  // Preserve structured tool data in metadata for downstream planning
  if (structuredToolData) {
    Object.assign(metadata, structuredToolData);
  }

  const message: UnifiedAgentMessage = {
    role,
    content: text,
  };

  if (toolCallId) {
    message.toolCallId = toolCallId;
  }
  if (Object.keys(metadata).length > 0) {
    message.metadata = metadata;
  }

  return message;
}

export function convertContentHistoryToUnifiedMessages(
  history: Content[],
): UnifiedAgentMessage[] {
  const messages: UnifiedAgentMessage[] = [];
  for (const entry of history) {
    const converted = convertContentToUnifiedMessage(entry);
    if (converted) {
      messages.push(converted);
    }
  }
  return messages;
}
