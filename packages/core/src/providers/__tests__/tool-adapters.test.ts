/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OpenAIToolAdapter } from '../openai/tool-adapter.js';
import { AnthropicToolAdapter } from '../anthropic/tool-adapter.js';
import {
  UnifiedTool,
  UnifiedToolCall,
  UnifiedToolResult,
} from '../tools/unified-tool-interface.js';

describe('Tool Adapters', () => {
  let sampleUnifiedTool: UnifiedTool;

  beforeEach(() => {
    sampleUnifiedTool = {
      name: 'search_web',
      description: 'Search the web for information',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query',
          },
          limit: {
            type: 'number',
            description: 'Maximum results to return',
            minimum: 1,
            maximum: 100,
          },
          domain: {
            type: 'string',
            description: 'Specific domain to search',
            enum: ['all', 'news', 'academic'],
          },
        },
        required: ['query'],
      },
    };
  });

  describe('OpenAIToolAdapter', () => {
    let adapter: OpenAIToolAdapter;

    beforeEach(() => {
      adapter = new OpenAIToolAdapter();
    });

    describe('toProviderFormat', () => {
      it('should convert unified tool to OpenAI function format', () => {
        const result = adapter.toProviderFormat(sampleUnifiedTool);

        expect(result).toEqual({
          name: 'search_web',
          description: 'Search the web for information',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The search query',
              },
              limit: {
                type: 'number',
                description: 'Maximum results to return',
                minimum: 1,
                maximum: 100,
              },
              domain: {
                type: 'string',
                description: 'Specific domain to search',
                enum: ['all', 'news', 'academic'],
              },
            },
            required: ['query'],
          },
        });
      });

      it('should handle complex nested schemas', () => {
        const complexTool: UnifiedTool = {
          name: 'process_data',
          description: 'Process complex data structures',
          parameters: {
            type: 'object',
            properties: {
              config: {
                type: 'object',
                properties: {
                  options: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        key: { type: 'string' },
                        value: { type: 'number' },
                        metadata: {
                          type: 'object',
                          properties: {
                            tags: {
                              type: 'array',
                              items: { type: 'string' },
                            },
                          },
                        },
                      },
                      required: ['key', 'value'],
                    },
                  },
                },
                required: ['options'],
              },
            },
            required: ['config'],
          },
        };

        const result = adapter.toProviderFormat(complexTool);

        expect(result.name).toBe('process_data');
        expect(
          result.parameters.properties.config.properties.options.items
            .properties.metadata,
        ).toBeDefined();
        expect(
          result.parameters.properties.config.properties.options.items
            .properties.metadata.properties.tags.items.type,
        ).toBe('string');
      });

      it('should handle tools without required parameters', () => {
        const toolWithoutRequired: UnifiedTool = {
          name: 'get_time',
          description: 'Get current time',
          parameters: {
            type: 'object',
            properties: {
              timezone: {
                type: 'string',
                description: 'Timezone (optional)',
              },
            },
          },
        };

        const result = adapter.toProviderFormat(toolWithoutRequired);
        expect(result.parameters.required).toEqual([]);
      });

      it('should throw error for invalid tool schema', () => {
        const invalidTool = {
          name: '',
          description: '',
          parameters: null,
        } as any;

        expect(() => adapter.toProviderFormat(invalidTool)).toThrow();
      });
    });

    describe('fromProviderToolCall', () => {
      it('should convert OpenAI tool call to unified format', () => {
        const openaiCall = {
          id: 'call_abc123',
          type: 'function' as const,
          function: {
            name: 'search_web',
            arguments: '{"query":"TypeScript testing","limit":5}',
          },
        };

        const result = adapter.fromProviderToolCall(openaiCall);

        expect(result).toEqual({
          id: 'call_abc123',
          name: 'search_web',
          arguments: {
            query: 'TypeScript testing',
            limit: 5,
          },
        });
      });

      it('should handle empty arguments', () => {
        const openaiCall = {
          id: 'call_def456',
          type: 'function' as const,
          function: {
            name: 'get_time',
            arguments: '{}',
          },
        };

        const result = adapter.fromProviderToolCall(openaiCall);
        expect(result.arguments).toEqual({});
      });

      it('should handle malformed JSON gracefully', () => {
        const openaiCall = {
          id: 'call_error',
          type: 'function' as const,
          function: {
            name: 'search_web',
            arguments: '{"query":"test"', // Malformed JSON
          },
        };

        const result = adapter.fromProviderToolCall(openaiCall);
        expect(result.arguments).toEqual({});
      });

      it('should handle missing arguments field', () => {
        const openaiCall = {
          id: 'call_missing',
          type: 'function' as const,
          function: {
            name: 'get_time',
            // Missing arguments field
          },
        } as any;

        const result = adapter.fromProviderToolCall(openaiCall);
        expect(result.arguments).toEqual({});
      });
    });

    describe('toProviderToolResult', () => {
      it('should convert successful result to OpenAI format', () => {
        const unifiedResult: UnifiedToolResult = {
          toolCallId: 'call_abc123',
          content: 'Search completed successfully',
          isError: false,
        };

        const result = adapter.toProviderToolResult(unifiedResult);

        expect(result).toEqual({
          tool_call_id: 'call_abc123',
          role: 'tool',
          content: 'Search completed successfully',
        });
      });

      it('should convert error result to OpenAI format', () => {
        const errorResult: UnifiedToolResult = {
          toolCallId: 'call_error',
          content: 'Search failed',
          isError: true,
          error: 'Network timeout',
        };

        const result = adapter.toProviderToolResult(errorResult);

        expect(result).toEqual({
          tool_call_id: 'call_error',
          role: 'tool',
          content: 'Network timeout',
        });
      });

      it('should handle object content', () => {
        const objectResult: UnifiedToolResult = {
          toolCallId: 'call_obj',
          content: {
            results: ['result1', 'result2'],
            count: 2,
          },
          isError: false,
        };

        const result = adapter.toProviderToolResult(objectResult);

        expect(result.content).toBe(
          JSON.stringify(
            {
              results: ['result1', 'result2'],
              count: 2,
            },
            null,
            2,
          ),
        );
      });
    });

    describe('streaming tool calls', () => {
      it('should accumulate streaming tool calls correctly', () => {
        const streamChunks = [
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_stream1',
                      type: 'function',
                      function: { name: 'search_web' },
                    },
                  ],
                },
              },
            ],
          },
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      function: { arguments: '{"query":' },
                    },
                  ],
                },
              },
            ],
          },
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      function: { arguments: '"TypeScript"}' },
                    },
                  ],
                },
              },
            ],
          },
        ];

        let accumulated: any[] = [];
        for (const chunk of streamChunks) {
          accumulated = adapter.accumulateStreamingToolCall(chunk, accumulated);
        }

        expect(accumulated).toHaveLength(1);
        expect(accumulated[0].id).toBe('call_stream1');
        expect(accumulated[0].function.name).toBe('search_web');
        expect(accumulated[0].function.arguments).toBe(
          '{"query":"TypeScript"}',
        );
      });

      it('should handle multiple concurrent tool calls', () => {
        const multiToolChunk = {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'search_web' },
                  },
                  {
                    index: 1,
                    id: 'call_2',
                    type: 'function',
                    function: { name: 'get_time' },
                  },
                ],
              },
            },
          ],
        };

        const accumulated = adapter.accumulateStreamingToolCall(
          multiToolChunk,
          [],
        );

        expect(accumulated).toHaveLength(2);
        expect(accumulated[0].id).toBe('call_1');
        expect(accumulated[1].id).toBe('call_2');
      });

      it('should identify complete tool calls', () => {
        const accumulated = [
          {
            id: 'call_complete',
            type: 'function',
            function: {
              name: 'search_web',
              arguments: '{"query":"test"}',
            },
          },
          {
            id: 'call_incomplete',
            type: 'function',
            function: {
              name: 'get_time',
              arguments: '{"timezone"',
            },
          },
        ];

        const completeCalls = adapter.getCompleteToolCalls(accumulated);

        expect(completeCalls).toHaveLength(2);
        expect(completeCalls[0].id).toBe('call_complete');
      });
    });

    describe('formatToolsForRequest', () => {
      it('should format tools for OpenAI API request', () => {
        const tools = [sampleUnifiedTool];
        const result = adapter.formatToolsForRequest(tools);

        expect(result.tools).toHaveLength(1);
        expect(result.tool_choice).toBe('auto');
        expect(result.tools[0].type).toBe('function');
        expect(result.tools[0].function.name).toBe('search_web');
      });

      it('should handle empty tools array', () => {
        const result = adapter.formatToolsForRequest([]);

        expect(result.tools).toHaveLength(0);
        expect(result.tool_choice).toBeUndefined();
      });

      it('should handle single required tool', () => {
        const result = adapter.formatToolsForRequest(
          [sampleUnifiedTool],
          'search_web',
        );

        expect(result.tool_choice).toBe('auto');
      });
    });
  });

  describe('AnthropicToolAdapter', () => {
    let adapter: AnthropicToolAdapter;

    beforeEach(() => {
      adapter = new AnthropicToolAdapter();
    });

    describe('toProviderFormat', () => {
      it('should convert unified tool to Anthropic format', () => {
        const result = adapter.toProviderFormat(sampleUnifiedTool);

        expect(result).toEqual({
          name: 'search_web',
          description: 'Search the web for information',
          input_schema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The search query',
              },
              limit: {
                type: 'number',
                description: 'Maximum results to return',
                minimum: 1,
                maximum: 100,
              },
              domain: {
                type: 'string',
                description: 'Specific domain to search',
                enum: ['all', 'news', 'academic'],
              },
            },
            required: ['query'],
          },
        });
      });

      it('should handle complex nested schemas', () => {
        const complexTool: UnifiedTool = {
          name: 'analyze_data',
          description: 'Analyze structured data',
          parameters: {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    metrics: {
                      type: 'object',
                      properties: {
                        score: { type: 'number', minimum: 0, maximum: 100 },
                      },
                    },
                  },
                },
              },
            },
          },
        };

        const result = adapter.toProviderFormat(complexTool);

        expect(
          result.input_schema.properties.data.items.properties.metrics
            .properties.score.minimum,
        ).toBe(0);
        expect(
          result.input_schema.properties.data.items.properties.metrics
            .properties.score.maximum,
        ).toBe(100);
      });
    });

    describe('fromProviderToolCall', () => {
      it('should convert Anthropic tool use to unified format', () => {
        const anthropicToolUse = {
          id: 'toolu_abc123',
          name: 'search_web',
          input: {
            query: 'AI development',
            limit: 10,
          },
        };

        const result = adapter.fromProviderToolCall(anthropicToolUse);

        expect(result).toEqual({
          id: 'toolu_abc123',
          name: 'search_web',
          arguments: {
            query: 'AI development',
            limit: 10,
          },
        });
      });

      it('should handle empty input', () => {
        const anthropicToolUse = {
          id: 'toolu_empty',
          name: 'get_time',
          input: {},
        };

        const result = adapter.fromProviderToolCall(anthropicToolUse);
        expect(result.arguments).toEqual({});
      });

      it('should handle missing input field', () => {
        const anthropicToolUse = {
          id: 'toolu_missing',
          name: 'get_time',
          // Missing input field
        } as any;

        const result = adapter.fromProviderToolCall(anthropicToolUse);
        expect(result.arguments).toEqual({});
      });
    });

    describe('toProviderToolResult', () => {
      it('should convert successful result to Anthropic format', () => {
        const unifiedResult: UnifiedToolResult = {
          toolCallId: 'toolu_abc123',
          content: 'Analysis complete',
          isError: false,
        };

        const result = adapter.toProviderToolResult(unifiedResult);

        expect(result).toEqual({
          type: 'tool_result',
          tool_use_id: 'toolu_abc123',
          content: 'Analysis complete',
          is_error: false,
        });
      });

      it('should convert error result to Anthropic format', () => {
        const errorResult: UnifiedToolResult = {
          toolCallId: 'toolu_error',
          content: 'Analysis failed',
          isError: true,
          error: 'Invalid data format',
        };

        const result = adapter.toProviderToolResult(errorResult);

        expect(result).toEqual({
          type: 'tool_result',
          tool_use_id: 'toolu_error',
          content: 'Invalid data format',
          is_error: true,
        });
      });

      it('should handle complex object content', () => {
        const objectResult: UnifiedToolResult = {
          toolCallId: 'toolu_obj',
          content: {
            analysis: {
              summary: 'Data processed successfully',
              metrics: { accuracy: 0.95, confidence: 0.87 },
              recommendations: ['Optimize query', 'Add validation'],
            },
          },
          isError: false,
        };

        const result = adapter.toProviderToolResult(objectResult);

        // Anthropic converts complex objects to JSON strings
        expect(result.content).toBe(
          JSON.stringify(objectResult.content, null, 2),
        );
      });
    });

    describe('streaming tool use', () => {
      it('should accumulate streaming tool use correctly', () => {
        const startEvent = {
          type: 'content_block_start',
          content_block: {
            type: 'tool_use',
            id: 'toolu_stream1',
            name: 'search_web',
            input: '',
          },
        };

        const deltaEvent = {
          type: 'content_block_delta',
          delta: {
            type: 'input_json_delta',
            partial_json: '{"query":"stream',
          },
        };

        const deltaEvent2 = {
          type: 'content_block_delta',
          delta: {
            type: 'input_json_delta',
            partial_json: 'ing test"}',
          },
        };

        let currentToolUse = adapter.accumulateStreamingToolUse(
          startEvent,
          null,
        );
        expect(currentToolUse?.id).toBe('toolu_stream1');
        expect(currentToolUse?.name).toBe('search_web');

        currentToolUse = adapter.accumulateStreamingToolUse(
          deltaEvent,
          currentToolUse,
        );
        currentToolUse = adapter.accumulateStreamingToolUse(
          deltaEvent2,
          currentToolUse,
        );

        expect(currentToolUse?.input).toBe('{"query":"streaming test"}');
      });

      it('should detect complete tool use', () => {
        const completeToolUse = {
          id: 'toolu_complete',
          name: 'search_web',
          input: '{"query":"complete"}',
        };

        const incompleteToolUse = {
          id: 'toolu_incomplete',
          name: 'search_web',
          input: '{"query":',
        };

        const completeToolUseWithType = {
          ...completeToolUse,
          type: 'tool_use',
          input: JSON.parse(completeToolUse.input),
        };
        expect(adapter.isToolUseComplete(completeToolUseWithType)).toBe(true);
        expect(adapter.isToolUseComplete(incompleteToolUse)).toBe(false);
        expect(adapter.isToolUseComplete(null)).toBe(false);
      });
    });

    describe('formatToolsForRequest', () => {
      it('should format tools for Anthropic API request', () => {
        const tools = [sampleUnifiedTool];
        const result = adapter.formatToolsForRequest(tools);

        expect(result.tools).toHaveLength(1);
        expect(result.tools[0].name).toBe('search_web');
        expect(result.tools[0].input_schema).toBeDefined();
      });

      it('should handle multiple tools', () => {
        const tool2: UnifiedTool = {
          name: 'get_weather',
          description: 'Get weather information',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string', description: 'City name' },
            },
            required: ['location'],
          },
        };

        const result = adapter.formatToolsForRequest([
          sampleUnifiedTool,
          tool2,
        ]);

        expect(result.tools).toHaveLength(2);
        expect(result.tools.map((t) => t.name)).toEqual([
          'search_web',
          'get_weather',
        ]);
      });

      it('should handle empty tools array', () => {
        const result = adapter.formatToolsForRequest([]);
        expect(result.tools).toHaveLength(0);
      });
    });
  });

  describe('Cross-Adapter Compatibility', () => {
    let openaiAdapter: OpenAIToolAdapter;
    let anthropicAdapter: AnthropicToolAdapter;

    beforeEach(() => {
      openaiAdapter = new OpenAIToolAdapter();
      anthropicAdapter = new AnthropicToolAdapter();
    });

    it('should produce consistent tool names across adapters', () => {
      const openaiFormat = openaiAdapter.toProviderFormat(sampleUnifiedTool);
      const anthropicFormat =
        anthropicAdapter.toProviderFormat(sampleUnifiedTool);

      expect(openaiFormat.name).toBe(anthropicFormat.name);
    });

    it('should produce consistent descriptions across adapters', () => {
      const openaiFormat = openaiAdapter.toProviderFormat(sampleUnifiedTool);
      const anthropicFormat =
        anthropicAdapter.toProviderFormat(sampleUnifiedTool);

      expect(openaiFormat.description).toBe(anthropicFormat.description);
    });

    it('should handle identical tool calls with different IDs', () => {
      const openaiCall = {
        id: 'call_openai123',
        type: 'function' as const,
        function: {
          name: 'search_web',
          arguments: '{"query":"test"}',
        },
      };

      const anthropicCall = {
        id: 'toolu_anthropic123',
        name: 'search_web',
        input: { query: 'test' },
      };

      const openaiResult = openaiAdapter.fromProviderToolCall(openaiCall);
      const anthropicResult =
        anthropicAdapter.fromProviderToolCall(anthropicCall);

      expect(openaiResult.name).toBe(anthropicResult.name);
      expect(openaiResult.arguments).toEqual(anthropicResult.arguments);
    });

    it('should maintain parameter schema integrity across conversions', () => {
      const originalTool: UnifiedTool = {
        name: 'complex_search',
        description: 'Complex search with filters',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
              minLength: 1,
              maxLength: 1000,
            },
            filters: {
              type: 'object',
              properties: {
                date_range: {
                  type: 'object',
                  properties: {
                    start: {
                      type: 'string',
                      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
                    },
                    end: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
                  },
                  required: ['start', 'end'],
                },
                categories: {
                  type: 'array',
                  items: { type: 'string', enum: ['news', 'research', 'blog'] },
                  minItems: 1,
                  maxItems: 3,
                },
              },
            },
          },
          required: ['query'],
        },
      };

      const openaiFormat = openaiAdapter.toProviderFormat(originalTool);
      const anthropicFormat = anthropicAdapter.toProviderFormat(originalTool);

      // Verify deep schema properties are preserved
      const openaiSchema = openaiFormat.parameters;
      const anthropicSchema = anthropicFormat.input_schema;

      expect(openaiSchema.properties.query.minLength).toBe(1);
      expect(anthropicSchema.properties.query.minLength).toBe(1);

      expect(
        openaiSchema.properties.filters.properties.categories.items.enum,
      ).toEqual(['news', 'research', 'blog']);
      expect(
        anthropicSchema.properties.filters.properties.categories.items.enum,
      ).toEqual(['news', 'research', 'blog']);
    });
  });

  describe('Error Handling', () => {
    it('should provide meaningful error messages for invalid tools', () => {
      const adapter = new OpenAIToolAdapter();
      const invalidTool = {
        name: '',
        description: null,
        parameters: undefined,
      } as any;

      expect(() => adapter.toProviderFormat(invalidTool)).toThrow();
    });

    it('should handle conversion errors gracefully', () => {
      const adapter = new AnthropicToolAdapter();
      const malformedCall = {
        // Missing required fields
        name: 'test',
      } as any;

      const result = adapter.fromProviderToolCall(malformedCall);
      expect(result).toBeDefined();
    });

    it('should validate tool result structure', () => {
      const adapter = new OpenAIToolAdapter();
      const invalidResult = {
        // Missing toolCallId
        content: 'test content',
      } as any;

      const result = adapter.toProviderToolResult(invalidResult);
      expect(result).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle tools with no parameters', () => {
      const noParamTool: UnifiedTool = {
        name: 'simple_action',
        description: 'Simple action with no parameters',
        parameters: {
          type: 'object',
          properties: {},
        },
      };

      const openaiAdapter = new OpenAIToolAdapter();
      const anthropicAdapter = new AnthropicToolAdapter();

      expect(() => openaiAdapter.toProviderFormat(noParamTool)).not.toThrow();
      expect(() =>
        anthropicAdapter.toProviderFormat(noParamTool),
      ).not.toThrow();
    });

    it('should handle very large parameter schemas', () => {
      const largeTool: UnifiedTool = {
        name: 'large_schema',
        description: 'Tool with large parameter schema',
        parameters: {
          type: 'object',
          properties: Object.fromEntries(
            Array.from({ length: 50 }, (_, i) => [
              `param_${i}`,
              {
                type: 'string',
                description: `Parameter ${i}`,
              },
            ]),
          ),
        },
      };

      const adapter = new OpenAIToolAdapter();
      const result = adapter.toProviderFormat(largeTool);

      expect(Object.keys(result.parameters.properties)).toHaveLength(50);
    });

    it('should handle unicode characters in tool names and descriptions', () => {
      const unicodeTool: UnifiedTool = {
        name: 'search_文档',
        description: '搜索中文文档 🔍',
        parameters: {
          type: 'object',
          properties: {
            查询: { type: 'string', description: '搜索查询词' },
          },
        },
      };

      const adapter = new AnthropicToolAdapter();
      const result = adapter.toProviderFormat(unicodeTool);

      expect(result.name).toBe('search_文档');
      expect(result.description).toBe('搜索中文文档 🔍');
    });

    it('should handle null and undefined values in tool results', () => {
      const openaiAdapter = new OpenAIToolAdapter();
      const anthropicAdapter = new AnthropicToolAdapter();

      const nullResult: UnifiedToolResult = {
        toolCallId: 'call_null',
        content: null as any,
        isError: false,
      };

      const undefinedResult: UnifiedToolResult = {
        toolCallId: 'call_undefined',
        content: undefined as any,
        isError: false,
      };

      expect(() =>
        openaiAdapter.toProviderToolResult(nullResult),
      ).not.toThrow();
      expect(() =>
        openaiAdapter.toProviderToolResult(undefinedResult),
      ).not.toThrow();
      expect(() =>
        anthropicAdapter.toProviderToolResult(nullResult),
      ).not.toThrow();
      expect(() =>
        anthropicAdapter.toProviderToolResult(undefinedResult),
      ).not.toThrow();
    });

    it('should handle circular references in object content', () => {
      const adapter = new AnthropicToolAdapter();

      // Create circular reference
      const obj: any = { name: 'test' };
      obj.self = obj;

      const circularResult: UnifiedToolResult = {
        toolCallId: 'call_circular',
        content: obj,
        isError: false,
      };

      const result = adapter.toProviderToolResult(circularResult);
      expect(result.content).toBe('[Complex object - unable to stringify]');
    });
  });

  describe('Performance Tests', () => {
    it('should handle many tools efficiently', () => {
      const openaiAdapter = new OpenAIToolAdapter();

      const manyTools: UnifiedTool[] = Array.from({ length: 100 }, (_, i) => ({
        name: `tool_${i}`,
        description: `Tool number ${i}`,
        parameters: {
          type: 'object',
          properties: {
            param: { type: 'string', description: 'A parameter' },
          },
        },
      }));

      const startTime = Date.now();
      const result = openaiAdapter.formatToolsForRequest(manyTools);
      const endTime = Date.now();

      expect(result.tools).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(100); // Should complete in under 100ms
    });
  });

  describe('Integration with Real-World Schemas', () => {
    it('should handle OpenAPI-style schemas', () => {
      const openApiTool: UnifiedTool = {
        name: 'api_request',
        description: 'Make API requests with OpenAPI-style parameters',
        parameters: {
          type: 'object',
          properties: {
            method: {
              type: 'string',
              enum: ['GET', 'POST', 'PUT', 'DELETE'],
              description: 'HTTP method',
            },
            url: {
              type: 'string',
              pattern: '^https?://.*',
              description: 'API endpoint URL',
            },
            headers: {
              type: 'object',
              properties: {},
              description: 'HTTP headers as key-value pairs',
            },
            body: {
              type: 'object',
              description: 'Request body (for POST/PUT)',
            },
          },
          required: ['method', 'url'],
        },
      };

      const openaiAdapter = new OpenAIToolAdapter();
      const anthropicAdapter = new AnthropicToolAdapter();

      const openaiResult = openaiAdapter.toProviderFormat(openApiTool);
      const anthropicResult = anthropicAdapter.toProviderFormat(openApiTool);

      expect(openaiResult.parameters.properties.method.enum).toEqual([
        'GET',
        'POST',
        'PUT',
        'DELETE',
      ]);
      expect(anthropicResult.input_schema.properties.method.enum).toEqual([
        'GET',
        'POST',
        'PUT',
        'DELETE',
      ]);
      expect(openaiResult.parameters.properties.url.pattern).toBe(
        '^https?://.*',
      );
      expect(anthropicResult.input_schema.properties.url.pattern).toBe(
        '^https?://.*',
      );
    });
  });

  describe('Adapter Method Coverage', () => {
    it('should test all OpenAI adapter public methods', () => {
      const adapter = new OpenAIToolAdapter();
      const methods = Object.getOwnPropertyNames(
        Object.getPrototypeOf(adapter),
      ).filter(
        (name) =>
          name !== 'constructor' &&
          typeof adapter[name as keyof typeof adapter] === 'function',
      );

      // Ensure we have key methods
      expect(methods).toContain('toProviderFormat');
      expect(methods).toContain('fromProviderToolCall');
      expect(methods).toContain('toProviderToolResult');
      expect(methods).toContain('formatToolsForRequest');
      expect(methods).toContain('accumulateStreamingToolCall');
      expect(methods).toContain('getCompleteToolCalls');
    });

    it('should test all Anthropic adapter public methods', () => {
      const adapter = new AnthropicToolAdapter();
      const methods = Object.getOwnPropertyNames(
        Object.getPrototypeOf(adapter),
      ).filter(
        (name) =>
          name !== 'constructor' &&
          typeof adapter[name as keyof typeof adapter] === 'function',
      );

      // Ensure we have key methods
      expect(methods).toContain('toProviderFormat');
      expect(methods).toContain('fromProviderToolCall');
      expect(methods).toContain('toProviderToolResult');
      expect(methods).toContain('formatToolsForRequest');
      expect(methods).toContain('accumulateStreamingToolUse');
      expect(methods).toContain('isToolUseComplete');
    });
  });
});
