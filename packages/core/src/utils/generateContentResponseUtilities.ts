/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentContentFragment, AgentMessage, AgentFunctionCall } from '../runtime/agentsTypes.js';
import { getResponseText, partToString } from './partUtils.js';


const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isAgentMessage = (value: unknown): value is AgentMessage =>
  isObject(value) && Array.isArray((value as { parts?: unknown }).parts);

const toAgentFragment = (value: unknown): AgentContentFragment => value as AgentContentFragment;

const extractFragments = (value: unknown): AgentContentFragment[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractFragments(item));
  }
  if (isAgentMessage(value)) {
    return [...value.parts];
  }
  if (isObject(value)) {
    if ('message' in value) {
      return extractFragments((value as { message: unknown }).message);
    }
    if ('content' in value && isObject((value as { content: unknown }).content)) {
      const content = (value as { content: { parts?: unknown } }).content;
      if (Array.isArray(content.parts)) {
        return extractFragments(content.parts);
      }
    }
    if ('parts' in value && Array.isArray((value as { parts: unknown[] }).parts)) {
      return extractFragments((value as { parts: unknown[] }).parts);
    }
    if ('candidates' in value && Array.isArray((value as { candidates: unknown[] }).candidates)) {
      const { candidates } = value as { candidates: unknown[] };
      for (const candidate of candidates) {
        const fragments = extractFragments(candidate);
        if (fragments.length > 0) {
          return fragments;
        }
      }
      return [];
    }
  }
  return [toAgentFragment(value)];
};

const extractResponseFragments = (response: unknown): AgentContentFragment[] => {
  if (!response) return [];
  if (isAgentMessage(response)) {
    return [...response.parts];
  }
  if (isObject(response) && 'message' in response) {
    return extractResponseFragments((response as { message: unknown }).message);
  }
  return extractFragments(response);
};

const extractFunctionCall = (fragment: unknown): AgentFunctionCall | undefined => {
  if (!isObject(fragment)) {
    return undefined;
  }

  if ('functionCall' in fragment && isObject((fragment as { functionCall?: unknown }).functionCall)) {
    const call = (fragment as { functionCall: Record<string, unknown> }).functionCall;
    const rawName = call['name'];
    const rawArgs = call['args'];
    const normalized: AgentFunctionCall = {
      ...call,
      name: typeof rawName === 'string' ? rawName : undefined,
      args: isObject(rawArgs) ? (rawArgs as Record<string, unknown>) : undefined,
    };
    return normalized;
  }

  if ('name' in fragment && typeof (fragment as { name?: unknown }).name === 'string') {
    const record = fragment as Record<string, unknown>;
    const rawArgs = record['args'];
    const normalized: AgentFunctionCall = {
      ...record,
      name: record['name'] as string,
      args: isObject(rawArgs) ? (rawArgs as Record<string, unknown>) : undefined,
    };
    return normalized;
  }

  return undefined;
};

const collectFunctionCalls = (fragments: AgentContentFragment[]): AgentFunctionCall[] => {
  const result: AgentFunctionCall[] = [];
  for (const fragment of fragments) {
    const call = extractFunctionCall(fragment);
    if (call) {
      result.push(call);
    }
  }
  return result;
};

export function getResponseTextFromParts(
  parts: unknown[],
): string | undefined {
  const fragments = extractFragments(parts);
  const text = partToString(fragments);
  return text.length > 0 ? text : undefined;
}

export function getFunctionCalls(
  response: unknown,
): AgentFunctionCall[] | undefined {
  const fragments = extractResponseFragments(response);
  const calls = collectFunctionCalls(fragments);
  return calls.length > 0 ? calls : undefined;
}

export function getFunctionCallsFromParts(
  parts: unknown[],
): AgentFunctionCall[] | undefined {
  const fragments = extractFragments(parts);
  const calls = collectFunctionCalls(fragments);
  return calls.length > 0 ? calls : undefined;
}

export function getFunctionCallsAsJson(
  response: unknown,
): string | undefined {
  const functionCalls = getFunctionCalls(response);
  if (!functionCalls) {
    return undefined;
  }
  return JSON.stringify(functionCalls, null, 2);
}

export function getFunctionCallsFromPartsAsJson(
  parts: unknown[],
): string | undefined {
  const functionCalls = getFunctionCallsFromParts(parts);
  if (!functionCalls) {
    return undefined;
  }
  return JSON.stringify(functionCalls, null, 2);
}

export function getStructuredResponse(
  response: unknown,
): string | undefined {
  const textContent = getResponseText(response);
  const functionCallsJson = getFunctionCallsAsJson(response);

  if (textContent && functionCallsJson) {
    return `${textContent}\n${functionCallsJson}`;
  }
  if (textContent) {
    return textContent;
  }
  if (functionCallsJson) {
    return functionCallsJson;
  }
  return undefined;
}

export function getStructuredResponseFromParts(
  parts: unknown[],
): string | undefined {
  const textContent = getResponseTextFromParts(parts);
  const functionCallsJson = getFunctionCallsFromPartsAsJson(parts);

  if (textContent && functionCallsJson) {
    return `${textContent}\n${functionCallsJson}`;
  }
  if (textContent) {
    return textContent;
  }
  if (functionCallsJson) {
    return functionCallsJson;
  }
  return undefined;
}
