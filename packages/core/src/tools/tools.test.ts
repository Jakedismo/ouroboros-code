/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  DeclarativeTool,
  Kind,
  type ToolInvocation,
  type ToolResult,
  type DeclarativeToolOptions,
} from './tools.js';
import type { JsonSchema } from '../runtime/agentsTypes.js';

class StubTool extends DeclarativeTool<Record<string, unknown>, ToolResult> {
  constructor(schema: JsonSchema | undefined, options?: DeclarativeToolOptions) {
    super('stub', 'Stub', 'Test tool', Kind.Other, schema, true, false, options);
  }

  build(params: Record<string, unknown>): ToolInvocation<Record<string, unknown>, ToolResult> {
    return {
      params,
      getDescription: () => 'stub',
      toolLocations: () => [],
      shouldConfirmExecute: async () => false,
      execute: async () => ({ llmContent: '', returnDisplay: '' }),
    };
  }
}

describe('DeclarativeTool schema normalization', () => {
  const baseSchema: JsonSchema = {
    type: 'object',
    properties: {
      value: { type: 'string' },
      nested: {
        type: 'object',
        properties: {
          flag: { type: 'boolean' },
        },
      },
    },
    required: ['value'],
  };

  it('enforces additionalProperties when strict', () => {
    const tool = new StubTool(baseSchema);
    const schema = tool.schema.parametersJsonSchema as JsonSchema;

    expect(schema?.additionalProperties).toBe(false);
    const nested = schema?.properties?.['nested'] as JsonSchema | undefined;
    expect(nested?.additionalProperties).toBe(false);
    // Original schema should remain unchanged
    expect(baseSchema).not.toHaveProperty('additionalProperties');
  });

  it('keeps schema open when strictParameters is false', () => {
    const tool = new StubTool(baseSchema, { strictParameters: false });
    const schema = tool.schema.parametersJsonSchema as JsonSchema;

    expect(schema).toEqual(baseSchema);
  });
});
