/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AnthropicFormatConverter } from '../anthropic/converter.js';
import { AnthropicToolAdapter } from '../anthropic/tool-adapter.js';

describe('Anthropic Provider Components', () => {
  describe('AnthropicFormatConverter', () => {
    let converter: AnthropicFormatConverter;

    beforeEach(() => {
      converter = new AnthropicFormatConverter();
    });

    describe('fromGeminiFormat', () => {
      it('should convert Gemini request to unified format', () => {
        const geminiRequest = {
          contents: [
            {
              role: 'user' as const,
              parts: [{ text: 'Hello, Claude!' }],
            },
          ],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 2000,
            topP: 0.95,
          },
        };

        const unifiedRequest = converter.fromGeminiFormat(geminiRequest);

        expect(unifiedRequest.messages).toHaveLength(1);
        expect(unifiedRequest.messages[0].role).toBe('user');
        expect(unifiedRequest.messages[0].content).toBe('Hello, Claude!');
        expect(unifiedRequest.temperature).toBe(0.8);
        expect(unifiedRequest.maxTokens).toBe(2000);
        expect(unifiedRequest.topP).toBe(0.95);
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
            parts: [{ text: 'You are Claude, an AI assistant.' }],
          },
        };

        const unifiedRequest = converter.fromGeminiFormat(geminiRequest);
        expect(unifiedRequest.systemInstruction).toBe(
          'You are Claude, an AI assistant.',
        );
      });

      it('should convert tools', () => {
        const geminiRequest = {
          contents: [
            {
              role: 'user' as const,
              parts: [{ text: 'Help me search' }],
            },
          ],
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'web_search',
                  description: 'Search the web for information',
                  parameters: {
                    type: 'object',
                    properties: {
                      query: { type: 'string', description: 'Search query' },
                      max_results: {
                        type: 'number',
                        description: 'Maximum results',
                      },
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
        expect(unifiedRequest.tools![0].name).toBe('web_search');
        expect(unifiedRequest.tools![0].description).toBe(
          'Search the web for information',
        );
        expect(unifiedRequest.tools![0].parameters.properties.query.type).toBe(
          'string',
        );
        expect(unifiedRequest.tools![0].parameters.required).toEqual(['query']);
      });
    });

    describe('toProviderFormat', () => {
      it('should convert unified request to Anthropic format', () => {
        const unifiedRequest = {
          messages: [
            {
              role: 'user' as const,
              content: 'Hello, Claude!',
            },
          ],
          temperature: 0.8,
          maxTokens: 2000,
          topP: 0.95,
        };

        const anthropicRequest = converter.toProviderFormat(unifiedRequest);

        expect(anthropicRequest.messages).toHaveLength(1);
        expect(anthropicRequest.messages[0].role).toBe('user');
        expect(anthropicRequest.messages[0].content).toBe('Hello, Claude!');
        expect(anthropicRequest.temperature).toBe(0.8);
        expect(anthropicRequest.max_tokens).toBe(2000);
        expect(anthropicRequest.top_p).toBe(0.95);
      });

      it('should add system instruction', () => {
        const unifiedRequest = {
          messages: [
            {
              role: 'user' as const,
              content: 'Hello',
            },
          ],
          systemInstruction: 'You are Claude, an AI assistant.',
        };

        const anthropicRequest = converter.toProviderFormat(unifiedRequest);

        expect(anthropicRequest.system).toBe(
          'You are Claude, an AI assistant.',
        );
        expect(anthropicRequest.messages).toHaveLength(1);
        expect(anthropicRequest.messages[0].role).toBe('user');
      });

      it('should convert tools', () => {
        const unifiedRequest = {
          messages: [
            {
              role: 'user' as const,
              content: 'Search for something',
            },
          ],
          tools: [
            {
              name: 'web_search',
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
        };

        const anthropicRequest = converter.toProviderFormat(unifiedRequest);

        expect(anthropicRequest.tools).toHaveLength(1);
        expect(anthropicRequest.tools![0].name).toBe('web_search');
        expect(anthropicRequest.tools![0].description).toBe('Search the web');
        expect(anthropicRequest.tools![0].input_schema.type).toBe('object');
        expect(
          anthropicRequest.tools![0].input_schema.properties.query.type,
        ).toBe('string');
        expect(anthropicRequest.tools![0].input_schema.required).toEqual([
          'query',
        ]);
      });

      it('should set streaming flag', () => {
        const unifiedRequest = {
          messages: [
            {
              role: 'user' as const,
              content: 'Hello',
            },
          ],
          stream: true,
        };

        const anthropicRequest = converter.toProviderFormat(unifiedRequest);
        expect(anthropicRequest.stream).toBe(true);
      });
    });

    describe('fromProviderResponse', () => {
      it('should convert Anthropic response to unified format', () => {
        const anthropicResponse = {
          id: 'msg_01ABC123',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Hello! How can I help you today?',
            },
          ],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: {
            input_tokens: 15,
            output_tokens: 25,
          },
        };

        const unifiedResponse =
          converter.fromProviderResponse(anthropicResponse);

        expect(unifiedResponse.content).toBe(
          'Hello! How can I help you today?',
        );
        expect(unifiedResponse.finishReason).toBe('stop');
        expect(unifiedResponse.usage?.totalTokenCount).toBe(40);
        expect(unifiedResponse.usage?.promptTokenCount).toBe(15);
        expect(unifiedResponse.usage?.candidatesTokenCount).toBe(25);
      });

      it('should convert tool use responses', () => {
        const anthropicResponse = {
          id: 'msg_01ABC123',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: "I'll search for that information.",
            },
            {
              type: 'tool_use',
              id: 'toolu_01XYZ789',
              name: 'web_search',
              input: {
                query: 'Claude AI capabilities',
                max_results: 5,
              },
            },
          ],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: 'tool_use',
          stop_sequence: null,
          usage: {
            input_tokens: 20,
            output_tokens: 35,
          },
        };

        const unifiedResponse =
          converter.fromProviderResponse(anthropicResponse);

        expect(unifiedResponse.content).toBe(
          "I'll search for that information.",
        );
        expect(unifiedResponse.functionCalls).toHaveLength(1);
        expect(unifiedResponse.functionCalls![0].name).toBe('web_search');
        expect(unifiedResponse.functionCalls![0].args.query).toBe(
          'Claude AI capabilities',
        );
        expect(unifiedResponse.functionCalls![0].args.max_results).toBe(5);
        expect(unifiedResponse.finishReason).toBe('tool_calls');
      });

      it('should handle max_tokens stop reason', () => {
        const anthropicResponse = {
          id: 'msg_01ABC123',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'This response was cut off due to...',
            },
          ],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: 'max_tokens',
          stop_sequence: null,
          usage: {
            input_tokens: 10,
            output_tokens: 4096,
          },
        };

        const unifiedResponse =
          converter.fromProviderResponse(anthropicResponse);
        expect(unifiedResponse.finishReason).toBe('length');
      });
    });

    describe('convertStreamEvent', () => {
      it('should convert message_start event', () => {
        const event = {
          type: 'message_start',
          message: {
            id: 'msg_01ABC123',
            type: 'message',
            role: 'assistant',
            content: [],
            model: 'claude-3-5-sonnet-20241022',
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 15, output_tokens: 0 },
          },
        };

        const unifiedResponse = converter.convertStreamEvent(event);
        expect(unifiedResponse.content).toBe('');
      });

      it('should convert content_block_delta event', () => {
        const event = {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'text_delta',
            text: 'Hello',
          },
        };

        const unifiedResponse = converter.convertStreamEvent(event);
        expect(unifiedResponse.content).toBe('Hello');
      });

      it('should convert tool_use content_block_start event', () => {
        const event = {
          type: 'content_block_start',
          index: 1,
          content_block: {
            type: 'tool_use',
            id: 'toolu_01XYZ789',
            name: 'web_search',
            input: {},
          },
        };

        const unifiedResponse = converter.convertStreamEvent(event);
        expect(unifiedResponse.functionCalls).toHaveLength(1);
        expect(unifiedResponse.functionCalls![0].name).toBe('web_search');
      });

      it('should convert message_delta finish reasons', () => {
        const event = {
          type: 'message_delta',
          delta: {
            stop_reason: 'tool_use',
          },
          usage: { output_tokens: 42 },
        };

        const unifiedResponse = converter.convertStreamEvent(event);
        expect(unifiedResponse.finishReason).toBe('tool_calls');
      });
    });

    describe('helper methods', () => {
      it('should create tool result content block', () => {
        const result = converter.createToolResult(
          'toolu_123',
          'Search completed',
          false,
        );

        expect(result.type).toBe('tool_result');
        expect(result.tool_use_id).toBe('toolu_123');
        expect(result.content).toBe('Search completed');
        expect(result.is_error).toBe(false);
      });

      it('should create error tool result', () => {
        const result = converter.createToolResult(
          'toolu_123',
          'Search failed',
          true,
        );

        expect(result.is_error).toBe(true);
        expect(result.content).toBe('Search failed');
      });

      it('should detect tool use in response', () => {
        const responseWithTools = {
          content: [
            { type: 'text', text: "I'll help you search." },
            { type: 'tool_use', id: 'toolu_123', name: 'search', input: {} },
          ],
        };

        const responseWithoutTools = {
          content: [{ type: 'text', text: 'Hello there!' }],
        };

        expect(converter.hasToolUse(responseWithTools)).toBe(true);
        expect(converter.hasToolUse(responseWithoutTools)).toBe(false);
      });

      it('should extract tool use blocks', () => {
        const response = {
          content: [
            { type: 'text', text: "I'll use tools." },
            {
              type: 'tool_use',
              id: 'toolu_123',
              name: 'search',
              input: { query: 'test' },
            },
            {
              type: 'tool_use',
              id: 'toolu_456',
              name: 'calculate',
              input: { expr: '2+2' },
            },
          ],
        };

        const toolUseBlocks = converter.extractToolUseBlocks(response);
        expect(toolUseBlocks).toHaveLength(2);
        expect(toolUseBlocks[0].id).toBe('toolu_123');
        expect(toolUseBlocks[1].id).toBe('toolu_456');
      });
    });
  });

  describe('AnthropicToolAdapter', () => {
    let adapter: AnthropicToolAdapter;

    beforeEach(() => {
      adapter = new AnthropicToolAdapter();
    });

    describe('toAnthropicTool', () => {
      it('should convert UnifiedTool to Anthropic format', () => {
        const unifiedTool: UnifiedTool = {
          name: 'web_search',
          description: 'Search the web for information',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              max_results: { type: 'number', description: 'Maximum results' },
            },
            required: ['query'],
          },
        };

        const anthropicTool = adapter.toAnthropicTool(unifiedTool);

        expect(anthropicTool.name).toBe('web_search');
        expect(anthropicTool.description).toBe(
          'Search the web for information',
        );
        expect(anthropicTool.input_schema.type).toBe('object');
        expect(anthropicTool.input_schema.properties.query.type).toBe('string');
        expect(anthropicTool.input_schema.required).toEqual(['query']);
      });
    });

    describe('fromAnthropicToolUse', () => {
      it('should convert Anthropic tool use to unified format', () => {
        const anthropicToolUse = {
          type: 'tool_use' as const,
          id: 'toolu_01XYZ789',
          name: 'web_search',
          input: {
            query: 'Claude AI capabilities',
            max_results: 5,
          },
        };

        const unifiedCall = adapter.fromAnthropicToolUse(anthropicToolUse);

        expect(unifiedCall.id).toBe('toolu_01XYZ789');
        expect(unifiedCall.name).toBe('web_search');
        expect(unifiedCall.arguments.query).toBe('Claude AI capabilities');
        expect(unifiedCall.arguments.max_results).toBe(5);
      });

      it('should handle empty input', () => {
        const anthropicToolUse = {
          type: 'tool_use' as const,
          id: 'toolu_123',
          name: 'ping',
          input: {},
        };

        const unifiedCall = adapter.fromAnthropicToolUse(anthropicToolUse);

        expect(unifiedCall.id).toBe('toolu_123');
        expect(unifiedCall.name).toBe('ping');
        expect(unifiedCall.arguments).toEqual({});
      });
    });

    describe('toAnthropicToolResult', () => {
      it('should convert unified result to Anthropic format', () => {
        const unifiedResult: UnifiedToolResult = {
          toolCallId: 'toolu_123',
          content: 'Search completed successfully',
          isError: false,
        };

        const anthropicResult = adapter.toAnthropicToolResult(unifiedResult);

        expect(anthropicResult.type).toBe('tool_result');
        expect(anthropicResult.tool_use_id).toBe('toolu_123');
        expect(anthropicResult.content).toBe('Search completed successfully');
        expect(anthropicResult.is_error).toBe(false);
      });

      it('should handle error results', () => {
        const unifiedResult: UnifiedToolResult = {
          toolCallId: 'toolu_123',
          content: 'Search failed',
          isError: true,
        };

        const anthropicResult = adapter.toAnthropicToolResult(unifiedResult);

        expect(anthropicResult.is_error).toBe(true);
        expect(anthropicResult.content).toBe('Search failed');
      });

      it('should handle object content', () => {
        const unifiedResult: UnifiedToolResult = {
          toolCallId: 'toolu_123',
          content: { results: ['item1', 'item2'], total: 2 },
          isError: false,
        };

        const anthropicResult = adapter.toAnthropicToolResult(unifiedResult);

        expect(anthropicResult.content).toBe(
          '{"results":["item1","item2"],"total":2}',
        );
      });
    });

    describe('validateToolUse', () => {
      it('should validate correct tool use format', () => {
        const validToolUse = {
          type: 'tool_use',
          id: 'toolu_123',
          name: 'search',
          input: { query: 'test' },
        };

        expect(adapter.validateToolUse(validToolUse)).toBe(true);
      });

      it('should reject invalid tool use formats', () => {
        const invalidToolUses = [
          null,
          undefined,
          {},
          { id: 'toolu_123' },
          { type: 'tool_use', id: 'toolu_123' },
          { type: 'invalid', id: 'toolu_123', name: 'test', input: {} },
          { type: 'tool_use', id: 123, name: 'test', input: {} },
        ];

        invalidToolUses.forEach((toolUse) => {
          expect(adapter.validateToolUse(toolUse)).toBe(false);
        });
      });
    });

    describe('formatToolsForRequest', () => {
      it('should format multiple tools for Anthropic request', () => {
        const unifiedTools: UnifiedTool[] = [
          {
            name: 'web_search',
            description: 'Search the web',
            parameters: {
              type: 'object',
              properties: { query: { type: 'string' } },
              required: ['query'],
            },
          },
          {
            name: 'calculator',
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
        expect(formatted.tools[0].name).toBe('web_search');
        expect(formatted.tools[1].name).toBe('calculator');
      });
    });

    describe('extractToolUsesFromResponse', () => {
      it('should extract tool uses from response', () => {
        const response = {
          content: [
            { type: 'text', text: "I'll search for that." },
            {
              type: 'tool_use',
              id: 'toolu_123',
              name: 'search',
              input: { query: 'test' },
            },
            {
              type: 'tool_use',
              id: 'toolu_456',
              name: 'calculate',
              input: { expr: '2+2' },
            },
          ],
        };

        const toolUses = adapter.extractToolUsesFromResponse(response);

        expect(toolUses).toHaveLength(2);
        expect(toolUses[0].id).toBe('toolu_123');
        expect(toolUses[1].id).toBe('toolu_456');
      });

      it('should return empty array for response without tool uses', () => {
        const response = {
          content: [{ type: 'text', text: 'Just a regular response.' }],
        };

        const toolUses = adapter.extractToolUsesFromResponse(response);
        expect(toolUses).toHaveLength(0);
      });

      it('should handle malformed response', () => {
        const responses = [
          {},
          { content: null },
          { content: 'string content' },
          null,
          undefined,
        ];

        responses.forEach((response) => {
          const toolUses = adapter.extractToolUsesFromResponse(response);
          expect(toolUses).toHaveLength(0);
        });
      });
    });

    describe('processStreamingToolUse', () => {
      it('should process streaming tool use events', () => {
        const events = [
          {
            type: 'content_block_start',
            content_block: {
              type: 'tool_use',
              id: 'toolu_123',
              name: 'search',
              input: { query: 'test' },
            },
          },
          {
            type: 'content_block_stop',
            content_block: {
              type: 'tool_use',
              id: 'toolu_123',
            },
          },
        ];

        const accumulatedUses = new Map();
        const completedUses = adapter.processStreamingToolUse(
          events,
          accumulatedUses,
        );

        expect(completedUses).toHaveLength(1);
        expect(completedUses[0].id).toBe('toolu_123');
        expect(completedUses[0].name).toBe('search');
        expect(accumulatedUses.size).toBe(0); // Should be cleared after completion
      });
    });

    describe('helper methods', () => {
      it('should create tool result', () => {
        const result = adapter.createToolResult('toolu_123', 'Success', false);

        expect(result.type).toBe('tool_result');
        expect(result.tool_use_id).toBe('toolu_123');
        expect(result.content).toBe('Success');
        expect(result.is_error).toBe(false);
      });

      it('should create error result', () => {
        const result = adapter.createErrorResult(
          'toolu_123',
          'Failed to execute',
        );

        expect(result.is_error).toBe(true);
        expect(result.content).toBe('Error: Failed to execute');
      });

      it('should check if response has tool uses', () => {
        const responseWithTools = {
          content: [
            { type: 'tool_use', id: 'toolu_123', name: 'test', input: {} },
          ],
        };

        const responseWithoutTools = {
          content: [{ type: 'text', text: 'Hello!' }],
        };

        expect(adapter.hasToolUses(responseWithTools)).toBe(true);
        expect(adapter.hasToolUses(responseWithoutTools)).toBe(false);
      });

      it('should get tool use statistics', () => {
        const response = {
          content: [
            { type: 'text', text: 'Using tools...' },
            { type: 'tool_use', id: 'toolu_1', name: 'search', input: {} },
            { type: 'tool_use', id: 'toolu_2', name: 'search', input: {} },
            { type: 'tool_use', id: 'toolu_3', name: 'calculate', input: {} },
            {
              type: 'tool_result',
              tool_use_id: 'toolu_1',
              content: 'ok',
              is_error: false,
            },
            {
              type: 'tool_result',
              tool_use_id: 'toolu_2',
              content: 'failed',
              is_error: true,
            },
          ],
        };

        const stats = adapter.getToolUseStats(response);

        expect(stats.count).toBe(3);
        expect(stats.tools).toEqual(['search', 'calculate']);
        expect(stats.hasErrors).toBe(true);
      });

      it('should validate tool use for execution', () => {
        const validToolUse = {
          type: 'tool_use',
          id: 'toolu_123',
          name: 'search',
          input: { query: 'test' },
        };

        const invalidToolUses = [
          { type: 'tool_use', id: '', name: 'search', input: {} },
          { type: 'tool_use', id: 'toolu_123', name: '', input: {} },
          { type: 'tool_use', id: 'toolu_123', name: 'search', input: null },
        ];

        expect(adapter.isValidToolUse(validToolUse)).toBe(true);
        invalidToolUses.forEach((toolUse) => {
          expect(adapter.isValidToolUse(toolUse)).toBe(false);
        });
      });

      it('should get tool use display name', () => {
        const toolUse = {
          type: 'tool_use' as const,
          id: 'toolu_123',
          name: 'search',
          input: { query: 'test', limit: 5 },
        };

        const displayName = adapter.getToolUseDisplayName(toolUse);
        expect(displayName).toContain('search');
        expect(displayName).toContain('query');
        expect(displayName).toContain('test');
      });
    });

    describe('conversation handling', () => {
      it('should convert tool uses to message format', () => {
        const toolUses = [
          {
            type: 'tool_use' as const,
            id: 'toolu_123',
            name: 'search',
            input: { query: 'test' },
          },
        ];

        const message = adapter.toolUseToMessage(
          toolUses,
          "I'll search for that.",
        );

        expect(message.role).toBe('assistant');
        expect(message.content).toHaveLength(2);
        expect(message.content[0].type).toBe('text');
        expect(message.content[1].type).toBe('tool_use');
      });

      it('should convert tool results to message format', () => {
        const results = [
          {
            type: 'tool_result' as const,
            tool_use_id: 'toolu_123',
            content: 'Search completed',
            is_error: false,
          },
        ];

        const message = adapter.toolResultsToMessage(results);

        expect(message.role).toBe('user');
        expect(message.content).toHaveLength(1);
        expect(message.content[0].type).toBe('tool_result');
        expect(message.content[0].tool_use_id).toBe('toolu_123');
      });

      it('should create tool execution conversation', () => {
        const originalMessage = { role: 'user', content: 'Search for AI news' };
        const toolUses = [
          {
            type: 'tool_use' as const,
            id: 'toolu_123',
            name: 'search',
            input: { query: 'AI news' },
          },
        ];
        const toolResults = [
          {
            type: 'tool_result' as const,
            tool_use_id: 'toolu_123',
            content: 'Found 5 articles',
            is_error: false,
          },
        ];

        const conversation = adapter.createToolExecutionConversation(
          originalMessage,
          toolUses,
          toolResults,
        );

        expect(conversation).toHaveLength(3);
        expect(conversation[0]).toBe(originalMessage);
        expect(conversation[1].role).toBe('assistant');
        expect(conversation[2].role).toBe('user');
      });
    });

    describe('confirmation handling', () => {
      it('should extract confirmation details', () => {
        const toolUse = {
          type: 'tool_use' as const,
          id: 'toolu_123',
          name: 'run_shell_command',
          input: { command: 'rm -rf /' },
        };

        const details = adapter.extractConfirmationDetails(toolUse);

        expect(details.toolName).toBe('run_shell_command');
        expect(details.arguments.command).toBe('rm -rf /');
        expect(details.requiresConfirmation).toBe(true);
        expect(details.displayName).toContain('run_shell_command');
      });

      it('should identify dangerous tools requiring confirmation', () => {
        const dangerousToolUse = {
          type: 'tool_use' as const,
          id: 'toolu_123',
          name: 'write_file',
          input: { path: '/etc/passwd', content: 'hacked' },
        };

        const safeToolUse = {
          type: 'tool_use' as const,
          id: 'toolu_456',
          name: 'read_file',
          input: { path: './readme.txt' },
        };

        const dangerousDetails =
          adapter.extractConfirmationDetails(dangerousToolUse);
        const safeDetails = adapter.extractConfirmationDetails(safeToolUse);

        expect(dangerousDetails.requiresConfirmation).toBe(true);
        expect(safeDetails.requiresConfirmation).toBe(false);
      });
    });
  });
});
