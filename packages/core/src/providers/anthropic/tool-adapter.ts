/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { normalizeTools, type NormalizedTool } from '../openai/tool-adapter.js';

/**
 * Anthropic-specific tool format
 */
export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
}

/**
 * Converts normalized tools to Anthropic format
 */
export function toAnthropicTools(normalizedTools: NormalizedTool[]): AnthropicTool[] {
  return normalizedTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: 'object' as const,
      ...tool.parameters,
    },
  }));
}

/**
 * One-step conversion from any format to Anthropic format
 */
export function convertToAnthropicTools(tools: unknown[]): AnthropicTool[] {
  const normalized = normalizeTools(tools);
  return toAnthropicTools(normalized);
}