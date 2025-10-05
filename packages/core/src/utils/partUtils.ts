/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentContent, AgentContentFragment, AgentMessage } from '../runtime/agentsTypes.js';

type LegacyPart = {
  text?: string;
  thought?: string;
  inlineData?: { mimeType?: string; [key: string]: unknown };
  fileData?: unknown;
  functionCall?: { name?: string; [key: string]: unknown };
  functionResponse?: { name?: string; [key: string]: unknown };
  videoMetadata?: unknown;
  codeExecutionResult?: unknown;
  executableCode?: unknown;
  [key: string]: unknown;
};

type LegacyCandidate = {
  content?: {
    parts?: Array<AgentContentFragment | LegacyPart | string>;
  };
};

type LegacyResponse = {
  candidates?: LegacyCandidate[];
};

type PartLike = AgentContentFragment | LegacyPart | string;

type ContentLike = AgentContent | AgentContentFragment[] | PartLike | PartLike[];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isLegacyPart = (value: unknown): value is LegacyPart =>
  isObject(value);

const isAgentMessage = (value: unknown): value is AgentMessage =>
  isObject(value) &&
  Array.isArray((value as { parts?: unknown }).parts) &&
  typeof (value as { role?: unknown }).role === 'string';

const flattenContent = (value: ContentLike): AgentContentFragment[] => {
  if (Array.isArray(value)) {
    const flattened: AgentContentFragment[] = [];
    for (const item of value) {
      flattened.push(...flattenContent(item as ContentLike));
    }
    return flattened;
  }
  return [value as AgentContentFragment];
};

const extractThought = (fragment: Record<string, unknown>): string | undefined => {
  const directThought = fragment['thought'];
  if (typeof directThought === 'string' && directThought.trim().length > 0) {
    return directThought;
  }

  const functionCall = fragment['functionCall'];
  if (functionCall && typeof functionCall === 'object') {
    const callThought = (functionCall as { thought?: unknown }).thought;
    if (typeof callThought === 'string' && callThought.trim().length > 0) {
      return callThought;
    }
  }

  return undefined;
};

const extractText = (fragment: AgentContentFragment | LegacyPart | string): string | undefined => {
  if (typeof fragment === 'string') {
    return fragment;
  }
  if (isLegacyPart(fragment) && typeof fragment.text === 'string') {
    return fragment.text;
  }
  if (isObject(fragment)) {
    const textual = (fragment as { text?: unknown }).text;
    if (typeof textual === 'string') {
      return textual;
    }

    const thought = extractThought(fragment as Record<string, unknown>);
    if (thought) {
      return thought;
    }
  }
  return undefined;
};

const describeNonTextPart = (fragment: LegacyPart): string | undefined => {
  if (fragment.videoMetadata !== undefined) {
    return '[Video Metadata]';
  }
  if (fragment.thought !== undefined) {
    return `[Thought: ${fragment.thought}]`;
  }
  if (fragment.codeExecutionResult !== undefined) {
    return '[Code Execution Result]';
  }
  if (fragment.executableCode !== undefined) {
    return '[Executable Code]';
  }
  if (fragment.fileData !== undefined) {
    return '[File Data]';
  }
  if (fragment.functionCall !== undefined) {
    return `[Function Call: ${fragment.functionCall?.name ?? 'anonymous'}]`;
  }
  if (fragment.functionResponse !== undefined) {
    return `[Function Response: ${fragment.functionResponse?.name ?? 'anonymous'}]`;
  }
  if (fragment.inlineData !== undefined) {
    return `<${fragment.inlineData?.mimeType ?? 'inline-data'}>`;
  }
  return undefined;
};

/**
 * Converts a content fragment (or collection of fragments) into a string.
 * If verbose is true, includes summary representations of non-text parts.
 */
export function partToString(
  value: ContentLike,
  options?: { verbose?: boolean },
): string {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((part) => partToString(part, options)).join('');
  }

  if (isLegacyPart(value)) {
    if (options?.verbose) {
      const thoughtDescription = extractThought(value as Record<string, unknown>);
      if (thoughtDescription) {
        return `[Thought: ${thoughtDescription}]`;
      }
    }

    const text = extractText(value);
    if (text !== undefined) {
      return text;
    }
    if (options?.verbose) {
      const description = describeNonTextPart(value);
      if (description) {
        return description;
      }
    }
    return '';
  }

  if (options?.verbose && isObject(value)) {
    const thought = extractThought(value as Record<string, unknown>);
    if (thought) {
      return `[Thought: ${thought}]`;
    }
  }

  const text = extractText(value);
  if (text !== undefined) {
    return text;
  }

  if (options?.verbose && isLegacyPart(value)) {
    const description = describeNonTextPart(value);
    if (description) {
      return description;
    }
  }

  return '';
}

const getMessageText = (message: AgentMessage): string | null => {
  const text = message.parts
    .map((fragment) => extractText(fragment))
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join('');
  return text.length > 0 ? text : null;
};

const getLegacyResponseText = (response: LegacyResponse): string | null => {
  const candidate = response.candidates?.[0];
  if (!candidate?.content?.parts?.length) {
    return null;
  }
  const text = candidate.content.parts
    .map((fragment) => partToString(fragment))
    .filter(Boolean)
    .join('');
  return text.length > 0 ? text : null;
};

/**
 * Attempts to extract contiguous text from a response-like payload. Supports
 * both the legacy @google/genai response format and the new agent message
 * structure.
 */
export function getResponseText(response: unknown): string | null {
  if (!response) {
    return null;
  }

  if (isAgentMessage(response)) {
    return getMessageText(response);
  }

  if (isObject(response) && 'message' in response && isAgentMessage((response as { message?: unknown }).message)) {
    return getMessageText((response as { message: AgentMessage }).message);
  }

  if (isObject(response) && 'candidates' in response) {
    return getLegacyResponseText(response as LegacyResponse);
  }

  return null;
}

/**
 * Asynchronously maps over the textual parts in a content payload, applying a
 * transformation function to each snippet.
 */
export async function flatMapTextParts(
  parts: ContentLike,
  transform: (text: string) => Promise<AgentContentFragment[]>,
): Promise<AgentContentFragment[]> {
  const flattened = flattenContent(parts);
  const result: AgentContentFragment[] = [];

  for (const fragment of flattened) {
    const text = extractText(fragment);
    if (text !== undefined) {
      const transformed = await transform(text);
      result.push(...transformed);
    } else {
      result.push(fragment);
    }
  }

  return result;
}

/**
 * Appends a string of text to the last textual fragment in the prompt, or adds
 * a new fragment if the existing tail is non-textual.
 */
export function appendToLastTextPart(
  prompt: AgentContentFragment[],
  textToAppend: string,
  separator = '\n\n',
): AgentContentFragment[] {
  if (!textToAppend) {
    return prompt;
  }

  if (prompt.length === 0) {
    return [{ text: textToAppend } as AgentContentFragment];
  }

  const newPrompt = [...prompt];
  const lastPart = newPrompt[newPrompt.length - 1];

  if (typeof lastPart === 'string') {
    newPrompt[newPrompt.length - 1] = `${lastPart}${separator}${textToAppend}`;
    return newPrompt;
  }

  if (isLegacyPart(lastPart) && typeof lastPart.text === 'string') {
    newPrompt[newPrompt.length - 1] = {
      ...lastPart,
      text: `${lastPart.text}${separator}${textToAppend}`,
    };
    return newPrompt;
  }

  if (isObject(lastPart) && typeof (lastPart as { text?: unknown }).text === 'string') {
    const currentText = (lastPart as { text: string }).text;
    newPrompt[newPrompt.length - 1] = {
      ...(lastPart as Record<string, unknown>),
      text: `${currentText}${separator}${textToAppend}`,
    } as AgentContentFragment;
    return newPrompt;
  }

  newPrompt.push({ text: textToAppend } as AgentContentFragment);
  return newPrompt;
}
