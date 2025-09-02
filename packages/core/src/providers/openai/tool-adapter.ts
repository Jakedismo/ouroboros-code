/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Normalized tool interface that abstracts away provider-specific formats
 */
export interface NormalizedTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * OpenAI-specific tool format
 */
export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Converts various tool formats to normalized format
 */
export function normalizeTools(tools: unknown[]): NormalizedTool[] {
  if (!Array.isArray(tools)) {
    return [];
  }

  const normalized: NormalizedTool[] = [];

  for (const tool of tools) {
    if (!tool || typeof tool !== 'object') {
      continue;
    }

    const toolObj = tool as Record<string, unknown>;

    // Handle Gemini format with functionDeclarations
    if ('functionDeclarations' in toolObj && Array.isArray(toolObj['functionDeclarations'])) {
      for (const func of toolObj['functionDeclarations']) {
        if (func && typeof func === 'object') {
          const funcObj = func as Record<string, unknown>;
          if (typeof funcObj['name'] === 'string' && typeof funcObj['description'] === 'string') {
            normalized.push({
              name: funcObj['name'],
              description: funcObj['description'],
              parameters: (funcObj['parametersJsonSchema'] as Record<string, unknown>) || 
                         (funcObj['parameters'] as Record<string, unknown>) || 
                         {}
            });
          }
        }
      }
    }
    // Handle direct tool format
    else if ('name' in toolObj && 'description' in toolObj) {
      if (typeof toolObj['name'] === 'string' && typeof toolObj['description'] === 'string') {
        normalized.push({
          name: toolObj['name'],
          description: toolObj['description'],
          parameters: (toolObj['parameters'] as Record<string, unknown>) || {}
        });
      }
    }
    // Handle OpenAI format (for consistency/future compatibility)
    else if ('type' in toolObj && toolObj['type'] === 'function' && 'function' in toolObj) {
      const func = toolObj['function'] as Record<string, unknown>;
      if (typeof func['name'] === 'string' && typeof func['description'] === 'string') {
        normalized.push({
          name: func['name'],
          description: func['description'],
          parameters: (func['parameters'] as Record<string, unknown>) || {}
        });
      }
    }
  }

  return normalized;
}

/**
 * Converts normalized tools to OpenAI format
 */
export function toOpenAITools(normalizedTools: NormalizedTool[]): OpenAITool[] {
  return normalizedTools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

/**
 * One-step conversion from any format to OpenAI format
 */
export function convertToOpenAITools(tools: unknown[]): OpenAITool[] {
  const normalized = normalizeTools(tools);
  return toOpenAITools(normalized);
}