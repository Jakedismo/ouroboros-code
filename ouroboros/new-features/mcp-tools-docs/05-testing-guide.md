# MCP Tools Testing Guide

This document provides comprehensive testing strategies and patterns for validating MCP tool integrations across all providers.

## Testing Strategy Overview

The MCP tools testing approach follows a layered strategy:

```
┌─────────────────────────────────────────┐
│         End-to-End Tests               │ ← Full user workflows
│         (Cross-worktree)               │
├─────────────────────────────────────────┤
│         Integration Tests              │ ← Provider + MCP + Tools
│         (Per provider)                 │
├─────────────────────────────────────────┤
│         Unit Tests                     │ ← Individual components
│         (Tool adapters, managers)      │
├─────────────────────────────────────────┤
│         Format Validation Tests        │ ← Data integrity
│         (Conversion accuracy)          │
└─────────────────────────────────────────┘
```

## 1. Foundation Testing (This Worktree)

### Tool Adapter Tests

Create comprehensive tests for each tool adapter at:

- `packages/core/src/providers/openai/__tests__/tool-adapter.test.ts`
- `packages/core/src/providers/anthropic/__tests__/tool-adapter.test.ts`
- `packages/core/src/providers/gemini/__tests__/tool-adapter.test.ts`

#### Example: OpenAI Tool Adapter Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { OpenAIToolAdapter } from '../tool-adapter.js';
import {
  UnifiedTool,
  UnifiedToolCall,
  UnifiedToolResult,
} from '../../tools/unified-tool-interface.js';

describe('OpenAIToolAdapter', () => {
  let adapter: OpenAIToolAdapter;
  let sampleUnifiedTool: UnifiedTool;

  beforeEach(() => {
    adapter = new OpenAIToolAdapter();
    sampleUnifiedTool = {
      name: 'test_function',
      description: 'A test function',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          limit: { type: 'number', description: 'Result limit' },
        },
        required: ['query'],
      },
    };
  });

  describe('toProviderFormat', () => {
    it('should convert unified tool to OpenAI format', () => {
      const result = adapter.toProviderFormat(sampleUnifiedTool);

      expect(result).toEqual({
        type: 'function',
        function: {
          name: 'test_function',
          description: 'A test function',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              limit: { type: 'number', description: 'Result limit' },
            },
            required: ['query'],
          },
        },
      });
    });

    it('should handle complex nested schemas', () => {
      const complexTool: UnifiedTool = {
        name: 'complex_function',
        description: 'Complex function with nested parameters',
        parameters: {
          type: 'object',
          properties: {
            config: {
              type: 'object',
              properties: {
                settings: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      key: { type: 'string' },
                      value: { type: 'string' },
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
        result.function.parameters.properties.config.properties.settings.items,
      ).toBeDefined();
    });

    it('should throw ToolConversionError for invalid tool', () => {
      const invalidTool = {
        name: '',
        description: '',
        parameters: null,
      } as any;
      expect(() => adapter.toProviderFormat(invalidTool)).toThrow(
        'ToolConversionError',
      );
    });
  });

  describe('fromProviderToolCall', () => {
    it('should convert OpenAI tool call to unified format', () => {
      const openaiCall = {
        id: 'call_123',
        type: 'function',
        function: {
          name: 'test_function',
          arguments: '{"query":"test","limit":10}',
        },
      };

      const result = adapter.fromProviderToolCall(openaiCall);
      expect(result).toEqual({
        id: 'call_123',
        name: 'test_function',
        arguments: { query: 'test', limit: 10 },
      });
    });

    it('should handle malformed JSON arguments', () => {
      const openaiCall = {
        id: 'call_123',
        type: 'function',
        function: {
          name: 'test_function',
          arguments: '{"query":"test"', // Malformed JSON
        },
      };

      expect(() => adapter.fromProviderToolCall(openaiCall)).toThrow();
    });
  });

  describe('toProviderToolResult', () => {
    it('should convert unified result to OpenAI format', () => {
      const unifiedResult: UnifiedToolResult = {
        toolCallId: 'call_123',
        content: 'Test result',
        isError: false,
      };

      const result = adapter.toProviderToolResult(unifiedResult);
      expect(result).toEqual({
        tool_call_id: 'call_123',
        role: 'tool',
        content: 'Test result',
      });
    });

    it('should handle error results', () => {
      const errorResult: UnifiedToolResult = {
        toolCallId: 'call_123',
        content: 'Error occurred',
        isError: true,
        error: 'Tool execution failed',
      };

      const result = adapter.toProviderToolResult(errorResult);
      expect(result.content).toContain('Error occurred');
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
                    id: 'call_123',
                    type: 'function',
                    function: { name: 'test_function' },
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
                    function: { arguments: '"test"}' },
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

      const completeCalls = adapter.getCompleteToolCalls(accumulated);
      expect(completeCalls).toHaveLength(1);
      expect(completeCalls[0].function.arguments).toBe('{"query":"test"}');
    });
  });

  describe('formatToolsForRequest', () => {
    it('should format tools for OpenAI API request', () => {
      const tools = [sampleUnifiedTool];
      const result = adapter.formatToolsForRequest(tools);

      expect(result.tools).toHaveLength(1);
      expect(result.tool_choice).toBe('auto');
    });

    it('should handle empty tools array', () => {
      const result = adapter.formatToolsForRequest([]);
      expect(result.tools).toHaveLength(0);
      expect(result.tool_choice).toBeUndefined();
    });
  });
});
```

### MCP Tool Manager Tests

Test the core MCP integration at `packages/core/src/providers/tools/__tests__/mcp-tool-manager.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MCPToolManager } from '../mcp-tool-manager.js';
import { UnifiedTool, UnifiedToolCall } from '../unified-tool-interface.js';

describe('MCPToolManager', () => {
  let manager: MCPToolManager;
  let mockConfigInstance: any;

  beforeEach(() => {
    mockConfigInstance = {
      getMCPServerConfigs: vi.fn().mockReturnValue({}),
      getToolExecutionSettings: vi.fn().mockReturnValue({
        maxConcurrentTools: 3,
        timeoutMs: 30000,
        confirmationMode: 'smart',
      }),
    };
    manager = new MCPToolManager(mockConfigInstance);
  });

  describe('initialize', () => {
    it('should initialize without errors', async () => {
      await expect(manager.initialize()).resolves.not.toThrow();
    });

    it('should connect to configured MCP servers', async () => {
      mockConfigInstance.getMCPServerConfigs.mockReturnValue({
        'test-server': {
          command: 'node',
          args: ['test-server.js'],
        },
      });

      // Mock MCP connection
      vi.spyOn(manager as any, 'connectToMCPServer').mockResolvedValue({
        listTools: vi.fn().mockResolvedValue([
          {
            name: 'test_tool',
            description: 'Test tool',
            inputSchema: {
              type: 'object',
              properties: { input: { type: 'string' } },
            },
          },
        ]),
      });

      await manager.initialize();
      expect(manager.getUnifiedTools()).toHaveLength(1);
    });
  });

  describe('getUnifiedTools', () => {
    it('should return empty array when no tools available', () => {
      expect(manager.getUnifiedTools()).toHaveLength(0);
    });

    it('should convert MCP tools to unified format', async () => {
      // Setup mock MCP tools
      const mockTools = [
        {
          name: 'search',
          description: 'Search the web',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
            },
            required: ['query'],
          },
        },
      ];

      // Mock the internal tools list
      (manager as any).tools = mockTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      }));

      const unifiedTools = manager.getUnifiedTools();
      expect(unifiedTools).toHaveLength(1);
      expect(unifiedTools[0].name).toBe('search');
      expect(unifiedTools[0].parameters.properties.query).toBeDefined();
    });
  });

  describe('executeTool', () => {
    it('should execute tool and return unified result', async () => {
      const toolCall: UnifiedToolCall = {
        id: 'call_123',
        name: 'test_tool',
        arguments: { input: 'test' },
      };

      // Mock MCP server execution
      const mockClient = {
        callTool: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Tool result' }],
        }),
      };

      (manager as any).clients = { 'test-server': mockClient };
      (manager as any).toolToServer = { test_tool: 'test-server' };

      const result = await manager.executeTool(toolCall);

      expect(result.toolCallId).toBe('call_123');
      expect(result.content).toBe('Tool result');
      expect(result.isError).toBe(false);
    });

    it('should handle tool execution errors', async () => {
      const toolCall: UnifiedToolCall = {
        id: 'call_123',
        name: 'failing_tool',
        arguments: {},
      };

      const mockClient = {
        callTool: vi.fn().mockRejectedValue(new Error('Tool failed')),
      };

      (manager as any).clients = { 'test-server': mockClient };
      (manager as any).toolToServer = { failing_tool: 'test-server' };

      const result = await manager.executeTool(toolCall);

      expect(result.isError).toBe(true);
      expect(result.error).toContain('Tool failed');
    });
  });
});
```

### Tool Execution Orchestrator Tests

Test parallel execution at `packages/core/src/providers/tools/__tests__/tool-execution-flow.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolExecutionOrchestrator } from '../tool-execution-flow.js';
import {
  UnifiedToolCall,
  UnifiedToolResult,
} from '../unified-tool-interface.js';

describe('ToolExecutionOrchestrator', () => {
  let orchestrator: ToolExecutionOrchestrator;
  let mockMCPManager: any;
  let mockContext: any;

  beforeEach(() => {
    mockMCPManager = {
      executeTool: vi.fn(),
      confirmToolExecution: vi.fn().mockResolvedValue(true),
    };

    mockContext = {
      config: {},
      abortSignal: new AbortController().signal,
      providerId: 'test',
      maxConcurrentTools: 3,
      timeoutMs: 30000,
      onProgress: vi.fn(),
      onConfirmation: vi.fn().mockResolvedValue('proceed_once'),
    };

    orchestrator = new ToolExecutionOrchestrator(mockMCPManager, mockContext);
  });

  describe('executeToolCallsInParallel', () => {
    it('should execute multiple tools in parallel', async () => {
      const toolCalls: UnifiedToolCall[] = [
        { id: 'call_1', name: 'tool_1', arguments: {} },
        { id: 'call_2', name: 'tool_2', arguments: {} },
        { id: 'call_3', name: 'tool_3', arguments: {} },
      ];

      const expectedResults: UnifiedToolResult[] = toolCalls.map((call, i) => ({
        toolCallId: call.id,
        toolName: call.name,
        content: `Result ${i + 1}`,
        isError: false,
      }));

      mockMCPManager.executeTool
        .mockResolvedValueOnce(expectedResults[0])
        .mockResolvedValueOnce(expectedResults[1])
        .mockResolvedValueOnce(expectedResults[2]);

      const result = await orchestrator.executeToolCallsInParallel(toolCalls);

      expect(result.results).toHaveLength(3);
      expect(result.successful).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should respect concurrency limits', async () => {
      const toolCalls: UnifiedToolCall[] = Array.from(
        { length: 10 },
        (_, i) => ({
          id: `call_${i}`,
          name: `tool_${i}`,
          arguments: {},
        }),
      );

      let concurrentExecutions = 0;
      let maxConcurrentSeen = 0;

      mockMCPManager.executeTool.mockImplementation(
        async (call: UnifiedToolCall) => {
          concurrentExecutions++;
          maxConcurrentSeen = Math.max(maxConcurrentSeen, concurrentExecutions);

          // Simulate some async work
          await new Promise((resolve) => setTimeout(resolve, 50));

          concurrentExecutions--;
          return {
            toolCallId: call.id,
            content: 'result',
            isError: false,
          };
        },
      );

      await orchestrator.executeToolCallsInParallel(toolCalls);

      expect(maxConcurrentSeen).toBeLessThanOrEqual(
        mockContext.maxConcurrentTools,
      );
    });

    it('should handle partial failures', async () => {
      const toolCalls: UnifiedToolCall[] = [
        { id: 'call_1', name: 'tool_1', arguments: {} },
        { id: 'call_2', name: 'failing_tool', arguments: {} },
        { id: 'call_3', name: 'tool_3', arguments: {} },
      ];

      mockMCPManager.executeTool
        .mockResolvedValueOnce({
          toolCallId: 'call_1',
          content: 'Success',
          isError: false,
        })
        .mockResolvedValueOnce({
          toolCallId: 'call_2',
          content: 'Error',
          isError: true,
          error: 'Failed',
        })
        .mockResolvedValueOnce({
          toolCallId: 'call_3',
          content: 'Success',
          isError: false,
        });

      const result = await orchestrator.executeToolCallsInParallel(toolCalls, {
        failFast: false,
      });

      expect(result.results).toHaveLength(3);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(1);
    });

    it('should abort on signal', async () => {
      const abortController = new AbortController();
      const abortContext = {
        ...mockContext,
        abortSignal: abortController.signal,
      };
      const abortOrchestrator = new ToolExecutionOrchestrator(
        mockMCPManager,
        abortContext,
      );

      const toolCalls: UnifiedToolCall[] = [
        { id: 'call_1', name: 'slow_tool', arguments: {} },
      ];

      mockMCPManager.executeTool.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return { toolCallId: 'call_1', content: 'result', isError: false };
      });

      // Abort after 100ms
      setTimeout(() => abortController.abort(), 100);

      const result =
        await abortOrchestrator.executeToolCallsInParallel(toolCalls);

      expect(result.aborted).toBe(true);
    });
  });
});
```

## 2. Provider Integration Tests

### Provider-Specific Integration Tests

Create integration tests for each provider at:

- `packages/core/src/providers/openai/__tests__/provider-with-tools.integration.test.ts`
- `packages/core/src/providers/anthropic/__tests__/provider-with-tools.integration.test.ts`
- `packages/core/src/providers/gemini/__tests__/provider-with-tools.integration.test.ts`

#### Example: OpenAI Provider Integration Test

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { OpenAIProviderWithMCP } from '../provider-with-tools.js';
import { MCPTestServer } from '../../../test-utils/mcp-test-server.js';

describe('OpenAI Provider MCP Integration', () => {
  let provider: OpenAIProviderWithMCP;
  let mcpServer: MCPTestServer;

  beforeAll(async () => {
    // Start test MCP server
    mcpServer = new MCPTestServer();
    await mcpServer.start();

    // Create provider with test configuration
    provider = new OpenAIProviderWithMCP({
      apiKey: process.env.OPENAI_API_KEY || 'test-key',
      model: 'gpt-4',
      configInstance: {
        getMCPServerConfigs: () => ({
          'test-server': mcpServer.getConnectionConfig(),
        }),
        getToolExecutionSettings: () => ({
          maxConcurrentTools: 2,
          timeoutMs: 30000,
          confirmationMode: 'never',
        }),
      },
    });

    await provider.initialize();
  });

  afterAll(async () => {
    await mcpServer.stop();
  });

  it('should discover tools from MCP server', async () => {
    const tools = provider.getAvailableTools();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.some((t) => t.name === 'test_calculator')).toBe(true);
  });

  it('should execute tools via MCP', async () => {
    const request = {
      prompt: 'Calculate 2 + 3',
      history: [],
    };

    // Mock OpenAI response with tool call
    const mockResponse = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_123',
                type: 'function',
                function: {
                  name: 'test_calculator',
                  arguments: '{"operation":"add","a":2,"b":3}',
                },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    };

    vi.spyOn(provider.client.chat.completions, 'create').mockResolvedValueOnce(
      mockResponse,
    );

    const response = await provider.generateContent(request, 'test-prompt-id');

    // Should have made tool call and received result
    expect(response.candidates).toHaveLength(1);
    expect(response.candidates[0].content.parts[0].text).toContain('5');
  });

  it('should handle streaming with tools', async () => {
    const request = {
      prompt: 'Calculate 10 * 5',
      history: [],
    };

    const responseStream = provider.generateContentStream(
      request,
      'test-prompt-id',
    );
    const responses = [];

    for await (const response of responseStream) {
      responses.push(response);
    }

    // Should have streamed tool execution and final response
    expect(responses.length).toBeGreaterThan(1);
    const finalResponse = responses[responses.length - 1];
    expect(finalResponse.candidates[0].content.parts[0].text).toContain('50');
  });

  it('should handle tool errors gracefully', async () => {
    const request = {
      prompt: 'Perform an invalid operation',
      history: [],
    };

    const mockResponse = {
      choices: [
        {
          message: {
            role: 'assistant',
            tool_calls: [
              {
                id: 'call_error',
                type: 'function',
                function: {
                  name: 'invalid_tool',
                  arguments: '{}',
                },
              },
            ],
          },
        },
      ],
    };

    vi.spyOn(provider.client.chat.completions, 'create').mockResolvedValueOnce(
      mockResponse,
    );

    const response = await provider.generateContent(request, 'test-prompt-id');

    // Should have handled error and continued conversation
    expect(response.candidates).toHaveLength(1);
    // Response should indicate tool error was handled
  });
});
```

## 3. Cross-Provider Compatibility Tests

Test that the unified interface works consistently across all providers:

```typescript
// packages/core/src/providers/tools/__tests__/cross-provider-compatibility.test.ts

import { describe, it, expect } from 'vitest';
import { OpenAIToolAdapter } from '../openai/tool-adapter.js';
import { AnthropicToolAdapter } from '../anthropic/tool-adapter.js';
import { GeminiToolAdapter } from '../gemini/tool-adapter.js';
import { UnifiedTool } from './unified-tool-interface.js';

describe('Cross-Provider Compatibility', () => {
  const sampleTool: UnifiedTool = {
    name: 'weather_lookup',
    description: 'Look up weather information',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'Location to check' },
        units: {
          type: 'string',
          enum: ['celsius', 'fahrenheit'],
          description: 'Temperature units',
        },
      },
      required: ['location'],
    },
  };

  const adapters = [
    { name: 'OpenAI', adapter: new OpenAIToolAdapter() },
    { name: 'Anthropic', adapter: new AnthropicToolAdapter() },
    { name: 'Gemini', adapter: new GeminiToolAdapter() },
  ];

  describe('tool conversion consistency', () => {
    adapters.forEach(({ name, adapter }) => {
      it(`should convert unified tool to ${name} format and back`, () => {
        // Convert to provider format
        const providerFormat = adapter.toProviderFormat(sampleTool);
        expect(providerFormat).toBeDefined();

        // Verify essential properties are preserved
        if (name === 'OpenAI') {
          expect(providerFormat.function.name).toBe(sampleTool.name);
          expect(providerFormat.function.description).toBe(
            sampleTool.description,
          );
        } else if (name === 'Anthropic') {
          expect(providerFormat.name).toBe(sampleTool.name);
          expect(providerFormat.description).toBe(sampleTool.description);
        } else if (name === 'Gemini') {
          expect(providerFormat.name).toBe(sampleTool.name);
          expect(providerFormat.description).toBe(sampleTool.description);
        }
      });
    });
  });

  describe('parameter schema handling', () => {
    adapters.forEach(({ name, adapter }) => {
      it(`should handle complex schemas in ${name}`, () => {
        const complexTool: UnifiedTool = {
          name: 'complex_tool',
          description: 'Tool with complex parameters',
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
                      },
                    },
                  },
                },
              },
            },
          },
        };

        expect(() => adapter.toProviderFormat(complexTool)).not.toThrow();
      });
    });
  });
});
```

## 4. Format Validation Tests

Test the format validation system:

```typescript
// packages/core/src/providers/tools/__tests__/format-validation.test.ts

import { describe, it, expect } from 'vitest';
import { ToolFormatValidator } from '../format-validation.js';
import { OpenAIToolAdapter } from '../openai/tool-adapter.js';

describe('ToolFormatValidator', () => {
  describe('validateUnifiedTool', () => {
    it('should validate correct unified tool', () => {
      const tool = {
        name: 'valid_tool',
        description: 'A valid tool',
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string' },
          },
        },
      };

      const context = ToolFormatValidator.createContext('test');
      const result = ToolFormatValidator.validateUnifiedTool(tool, context);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should catch invalid tool schemas', () => {
      const invalidTool = {
        name: '', // Invalid: empty name
        description: 123, // Invalid: non-string description
        parameters: null, // Invalid: null parameters
      } as any;

      const context = ToolFormatValidator.createContext('test');
      const result = ToolFormatValidator.validateUnifiedTool(
        invalidTool,
        context,
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('provider-specific validation', () => {
    it('should validate OpenAI-specific constraints', () => {
      const tool = {
        name: 'a'.repeat(65), // Too long for OpenAI
        description: 'Valid description',
        parameters: { type: 'object', properties: {} },
      };

      const context = ToolFormatValidator.createContext('openai', {
        strict: true,
      });
      const result = ToolFormatValidator.validateUnifiedTool(tool, context);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('64 characters'))).toBe(true);
    });

    it('should validate Anthropic-specific constraints', () => {
      const tool = {
        name: '123invalid', // Can't start with number for Anthropic
        description: 'Valid description',
        parameters: { type: 'object', properties: {} },
      };

      const context = ToolFormatValidator.createContext('anthropic', {
        strict: true,
      });
      const result = ToolFormatValidator.validateUnifiedTool(tool, context);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('start with a letter'))).toBe(
        true,
      );
    });
  });

  describe('validateConversion', () => {
    it('should validate successful conversions', () => {
      const tool = {
        name: 'test_tool',
        description: 'Test tool',
        parameters: {
          type: 'object',
          properties: { input: { type: 'string' } },
        },
      };

      const adapter = new OpenAIToolAdapter();
      const context = ToolFormatValidator.createContext('openai');
      const result = ToolFormatValidator.validateConversion(
        tool,
        adapter,
        context,
      );

      expect(result.isValid).toBe(true);
    });
  });
});
```

## 5. End-to-End Test Utilities

Create utilities for comprehensive testing:

```typescript
// packages/test-utils/src/mcp-test-server.ts

export class MCPTestServer {
  private server: any;
  private port: number;

  constructor(port: number = 0) {
    this.port = port;
  }

  async start(): Promise<void> {
    // Implementation for starting a test MCP server
    // with predefined tools for testing
  }

  async stop(): Promise<void> {
    // Stop the test server
  }

  getConnectionConfig() {
    return {
      command: 'node',
      args: ['test-mcp-server.js'],
      env: {
        MCP_TEST_PORT: this.port.toString(),
      },
    };
  }

  // Predefined test tools
  getTestTools() {
    return [
      {
        name: 'test_calculator',
        description: 'Perform basic math operations',
        inputSchema: {
          type: 'object',
          properties: {
            operation: {
              type: 'string',
              enum: ['add', 'subtract', 'multiply', 'divide'],
            },
            a: { type: 'number' },
            b: { type: 'number' },
          },
          required: ['operation', 'a', 'b'],
        },
      },
      {
        name: 'test_echo',
        description: 'Echo back the input',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
          required: ['message'],
        },
      },
    ];
  }
}
```

## 6. Performance and Load Testing

```typescript
// packages/core/src/providers/tools/__tests__/performance.test.ts

import { describe, it, expect } from 'vitest';
import { ToolExecutionOrchestrator } from '../tool-execution-flow.js';

describe('Tool Execution Performance', () => {
  it('should handle high concurrency efficiently', async () => {
    const startTime = Date.now();

    // Create 100 tool calls
    const toolCalls = Array.from({ length: 100 }, (_, i) => ({
      id: `call_${i}`,
      name: 'fast_tool',
      arguments: { index: i },
    }));

    const mockManager = {
      executeTool: vi.fn().mockImplementation(async (call) => {
        await new Promise((resolve) => setTimeout(resolve, 10)); // 10ms delay
        return {
          toolCallId: call.id,
          content: `Result for ${call.arguments.index}`,
          isError: false,
        };
      }),
    };

    const context = {
      maxConcurrentTools: 10,
      timeoutMs: 5000,
      // ... other context
    };

    const orchestrator = new ToolExecutionOrchestrator(mockManager, context);
    const result = await orchestrator.executeToolCallsInParallel(toolCalls);

    const duration = Date.now() - startTime;

    expect(result.successful).toBe(100);
    expect(duration).toBeLessThan(2000); // Should complete in under 2 seconds
  });

  it('should not consume excessive memory', async () => {
    const initialMemory = process.memoryUsage().heapUsed;

    // Execute many tool calls
    const toolCalls = Array.from({ length: 1000 }, (_, i) => ({
      id: `call_${i}`,
      name: 'memory_test_tool',
      arguments: { data: 'x'.repeat(1000) }, // 1KB per call
    }));

    // Execute and wait for completion
    const result = await orchestrator.executeToolCallsInParallel(toolCalls);

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;

    // Memory increase should be reasonable (less than 100MB for 1000 calls)
    expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
  });
});
```

## 7. Test Configuration

### Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    setupFiles: ['./test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/test-utils/**',
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
  },
});
```

### Test Setup

```typescript
// test-setup.ts
import { vi } from 'vitest';

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.MCP_TEST_MODE = 'true';

// Global test utilities
global.createMockConfig = (overrides = {}) => ({
  getMCPServerConfigs: () => ({}),
  getToolExecutionSettings: () => ({
    maxConcurrentTools: 3,
    timeoutMs: 30000,
    confirmationMode: 'never',
  }),
  ...overrides,
});

// Setup console mocking to reduce noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: console.error, // Keep errors for debugging
};
```

## 8. CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/mcp-tools-test.yml
name: MCP Tools Testing

on:
  push:
    branches: [main, feature/mcp-tools-integration]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18.x, 20.x]

    steps:
      - uses: actions/checkout@v3

      - name: Use Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:unit

      - name: Run integration tests
        run: npm run test:integration
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}

      - name: Run format validation tests
        run: npm run test:validation

      - name: Generate coverage report
        run: npm run test:coverage

      - name: Upload coverage reports
        uses: codecov/codecov-action@v3
```

## 9. Testing Checklist

### Foundation Tests (This Worktree)

- [ ] Tool adapter unit tests for each provider
- [ ] MCP tool manager functionality tests
- [ ] Tool execution orchestrator tests
- [ ] Error handling system tests
- [ ] Format validation tests
- [ ] Cross-provider compatibility tests
- [ ] Performance and load tests

### Integration Tests (Provider Worktrees)

- [ ] Provider-specific tool execution tests
- [ ] Streaming tool call tests
- [ ] Error scenario handling tests
- [ ] Configuration integration tests
- [ ] Real MCP server integration tests

### End-to-End Tests

- [ ] Full user workflow tests
- [ ] Cross-worktree integration tests
- [ ] CLI functionality tests
- [ ] Performance benchmarks

### Quality Gates

- [ ] Code coverage above 80%
- [ ] All providers pass identical test suite
- [ ] Performance benchmarks meet targets
- [ ] Memory usage within acceptable limits
- [ ] Error handling gracefully degrades

---

**Status**: Testing Infrastructure Complete 🧪 | Ready for Validation ✅
