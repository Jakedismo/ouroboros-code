/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OpenAIFormatConverter } from '../openai/converter.js';
import { OpenAIToolAdapter } from '../openai/tool-adapter.js';

describe('OpenAI Provider Components', () => {
  describe('OpenAIFormatConverter', () => {
    let converter: OpenAIFormatConverter;

    beforeEach(() => {
      converter = new OpenAIFormatConverter();
    });

    describe('fromGeminiFormat', () => {
      it('should convert Gemini request to unified format', () => {
        const geminiRequest = {
          contents: [
            {
              role: 'user' as const,
              parts: [{ text: 'Hello, world!' }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1000,
            topP: 0.9,
          },
        };

        const unifiedRequest = converter.fromGeminiFormat(geminiRequest);

        expect(unifiedRequest.messages).toHaveLength(1);
        expect(unifiedRequest.messages[0].role).toBe('user');
        expect(unifiedRequest.messages[0].content).toBe('Hello, world!');
        expect(unifiedRequest.temperature).toBe(0.7);
        expect(unifiedRequest.maxTokens).toBe(1000);
        expect(unifiedRequest.topP).toBe(0.9);
      });

      it('should convert system instruction', () => {
        const geminiRequest = {
          contents: [
            {
              role: 'user' as const,
              parts: [{ text: 'Hello' }],
            },
          ],
          systemInstruction: {
            parts: [{ text: 'You are a helpful assistant.' }],
          },
        };

        const unifiedRequest = converter.fromGeminiFormat(geminiRequest);
        expect(unifiedRequest.systemInstruction).toBe(
          'You are a helpful assistant.',
        );
      });

      it('should convert tools', () => {
        const geminiRequest = {
          contents: [
            {
              role: 'user' as const,
              parts: [{ text: 'Hello' }],
            },
          ],
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'search',
                  description: 'Search the web',
                  parameters: {
                    type: 'object',
                    properties: {
                      query: { type: 'string', description: 'Search query' },
                    },
                    required: ['query'],
                  },
                },
              ],
            },
          ],
        };

        const unifiedRequest = converter.fromGeminiFormat(geminiRequest);

        expect(unifiedRequest.tools).toHaveLength(1);
        expect(unifiedRequest.tools![0].name).toBe('search');
        expect(unifiedRequest.tools![0].description).toBe('Search the web');
        expect(unifiedRequest.tools![0].parameters.properties.query.type).toBe(
          'string',
        );
      });
    });

    describe('toProviderFormat', () => {
      it('should convert unified request to OpenAI format', () => {
        const unifiedRequest = {
          messages: [
            {
              role: 'user' as const,
              content: 'Hello, world!',
            },
          ],
          temperature: 0.7,
          maxTokens: 1000,
          topP: 0.9,
        };

        const openaiRequest = converter.toProviderFormat(unifiedRequest);

        expect(openaiRequest.messages).toHaveLength(1);
        expect(openaiRequest.messages[0].role).toBe('user');
        expect(openaiRequest.messages[0].content).toBe('Hello, world!');
        expect(openaiRequest.temperature).toBe(0.7);
        expect(openaiRequest.max_tokens).toBe(1000);
        expect(openaiRequest.top_p).toBe(0.9);
      });

      it('should add system message', () => {
        const unifiedRequest = {
          messages: [
            {
              role: 'user' as const,
              content: 'Hello',
            },
          ],
          systemInstruction: 'You are a helpful assistant.',
        };

        const openaiRequest = converter.toProviderFormat(unifiedRequest);

        expect(openaiRequest.messages).toHaveLength(2);
        expect(openaiRequest.messages[0].role).toBe('system');
        expect(openaiRequest.messages[0].content).toBe(
          'You are a helpful assistant.',
        );
        expect(openaiRequest.messages[1].role).toBe('user');
      });

      it('should convert tools', () => {
        const unifiedRequest = {
          messages: [
            {
              role: 'user' as const,
              content: 'Hello',
            },
          ],
          tools: [
            {
              name: 'search',
              description: 'Search the web',
              parameters: {
                type: 'object' as const,
                properties: {
                  query: {
                    type: 'string' as const,
                    description: 'Search query',
                  },
                },
                required: ['query'],
              },
            },
          ],
          toolChoice: 'auto' as const,
        };

        const openaiRequest = converter.toProviderFormat(unifiedRequest);

        expect(openaiRequest.tools).toHaveLength(1);
        expect(openaiRequest.tools![0].type).toBe('function');
        expect(openaiRequest.tools![0].function.name).toBe('search');
        expect(openaiRequest.tool_choice).toBe('auto');
      });
    });

    describe('fromProviderResponse', () => {
      it('should convert OpenAI response to unified format', () => {
        const openaiResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Hello! How can I help you?',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30,
          },
        };

        const unifiedResponse = converter.fromProviderResponse(openaiResponse);

        expect(unifiedResponse.content).toBe('Hello! How can I help you?');
        expect(unifiedResponse.finishReason).toBe('stop');
        expect(unifiedResponse.usage?.totalTokenCount).toBe(30);
        expect(unifiedResponse.usage?.promptTokenCount).toBe(10);
        expect(unifiedResponse.usage?.candidatesTokenCount).toBe(20);
      });

      it('should convert tool calls', () => {
        const openaiResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    id: 'call_123',
                    type: 'function',
                    function: {
                      name: 'search',
                      arguments: '{"query": "OpenAI"}',
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        };

        const unifiedResponse = converter.fromProviderResponse(openaiResponse);

        expect(unifiedResponse.functionCalls).toHaveLength(1);
        expect(unifiedResponse.functionCalls![0].name).toBe('search');
        expect(unifiedResponse.functionCalls![0].args.query).toBe('OpenAI');
        expect(unifiedResponse.finishReason).toBe('tool_calls');
      });
    });
  });

  describe('OpenAIToolAdapter', () => {
    let adapter: OpenAIToolAdapter;

    beforeEach(() => {
      adapter = new OpenAIToolAdapter();
    });

    describe('toOpenAITool', () => {
      it('should convert UnifiedTool to OpenAI format', () => {
        const unifiedTool: UnifiedTool = {
          name: 'search',
          description: 'Search the web',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              limit: { type: 'number', description: 'Max results' },
            },
            required: ['query'],
          },
        };

        const openaiTool = adapter.toOpenAITool(unifiedTool);

        expect(openaiTool.type).toBe('function');
        expect(openaiTool.function.name).toBe('search');
        expect(openaiTool.function.description).toBe('Search the web');
        expect(openaiTool.function.parameters.properties.query.type).toBe(
          'string',
        );
        expect(openaiTool.function.parameters.required).toEqual(['query']);
      });
    });

    describe('fromOpenAIToolCall', () => {
      it('should convert OpenAI tool call to unified format', () => {
        const openaiToolCall = {
          id: 'call_123',
          type: 'function' as const,
          function: {
            name: 'search',
            arguments: '{"query": "OpenAI", "limit": 5}',
          },
        };

        const unifiedCall = adapter.fromOpenAIToolCall(openaiToolCall);

        expect(unifiedCall.id).toBe('call_123');
        expect(unifiedCall.name).toBe('search');
        expect(unifiedCall.arguments.query).toBe('OpenAI');
        expect(unifiedCall.arguments.limit).toBe(5);
      });

      it('should handle invalid JSON arguments', () => {
        const openaiToolCall = {
          id: 'call_123',
          type: 'function' as const,
          function: {
            name: 'search',
            arguments: 'invalid json',
          },
        };

        const unifiedCall = adapter.fromOpenAIToolCall(openaiToolCall);

        expect(unifiedCall.id).toBe('call_123');
        expect(unifiedCall.name).toBe('search');
        expect(unifiedCall.arguments).toEqual({});
      });
    });

    describe('toOpenAIToolResult', () => {
      it('should convert unified result to OpenAI format', () => {
        const unifiedResult: UnifiedToolResult = {
          toolCallId: 'call_123',
          content: 'Search results...',
          isError: false,
        };

        const openaiResult = adapter.toOpenAIToolResult(unifiedResult);

        expect(openaiResult.tool_call_id).toBe('call_123');
        expect(openaiResult.role).toBe('tool');
        expect(openaiResult.content).toBe('Search results...');
      });

      it('should handle error results', () => {
        const unifiedResult: UnifiedToolResult = {
          toolCallId: 'call_123',
          content: 'Operation failed',
          isError: true,
          error: 'Network timeout',
        };

        const openaiResult = adapter.toOpenAIToolResult(unifiedResult);

        expect(openaiResult.content).toContain('Error: Network timeout');
        expect(openaiResult.content).toContain('Operation failed');
      });

      it('should handle object content', () => {
        const unifiedResult: UnifiedToolResult = {
          toolCallId: 'call_123',
          content: { results: ['item1', 'item2'] },
          isError: false,
        };

        const openaiResult = adapter.toOpenAIToolResult(unifiedResult);

        expect(openaiResult.content).toBe('{"results":["item1","item2"]}');
      });
    });

    describe('validateToolCall', () => {
      it('should validate correct tool call format', () => {
        const validToolCall = {
          id: 'call_123',
          type: 'function',
          function: {
            name: 'search',
            arguments: '{}',
          },
        };

        expect(adapter.validateToolCall(validToolCall)).toBe(true);
      });

      it('should reject invalid tool call formats', () => {
        const invalidToolCalls = [
          null,
          undefined,
          {},
          { id: 'call_123' },
          { id: 'call_123', type: 'function' },
          {
            id: 'call_123',
            type: 'invalid',
            function: { name: 'test', arguments: '{}' },
          },
        ];

        invalidToolCalls.forEach((toolCall) => {
          expect(adapter.validateToolCall(toolCall)).toBe(false);
        });
      });
    });

    describe('formatToolsForRequest', () => {
      it('should format multiple tools for OpenAI request', () => {
        const unifiedTools: UnifiedTool[] = [
          {
            name: 'search',
            description: 'Search the web',
            parameters: {
              type: 'object',
              properties: { query: { type: 'string' } },
              required: ['query'],
            },
          },
          {
            name: 'calculate',
            description: 'Perform calculations',
            parameters: {
              type: 'object',
              properties: { expression: { type: 'string' } },
              required: ['expression'],
            },
          },
        ];

        const formatted = adapter.formatToolsForRequest(unifiedTools);

        expect(formatted.tools).toHaveLength(2);
        expect(formatted.tool_choice).toBe('auto');
        expect(formatted.tools[0].function.name).toBe('search');
        expect(formatted.tools[1].function.name).toBe('calculate');
      });
    });
  });
});
