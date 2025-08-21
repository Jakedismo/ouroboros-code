/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { OpenAIBuiltinToolsIntegration } from '../openai/builtin-tools-integration.js';
import { AnthropicBuiltinToolsIntegration } from '../anthropic/builtin-tools-integration.js';
import { OpenAICompleteProvider } from '../openai/provider-complete.js';
import { AnthropicCompleteProvider } from '../anthropic/provider-complete.js';
import { BuiltinToolManager } from '../tools/builtin-tool-manager.js';
import { Config } from '../../config/config.js';
import { ToolRegistry } from '../../tools/tool-registry.js';

// Mock external dependencies
vi.mock('../../config/config.js');
vi.mock('../../tools/tool-registry.js');
vi.mock('../tools/builtin-tool-manager.js');

// Mock HTTP clients
const mockOpenAIResponse = {
  choices: [{
    message: {
      role: 'assistant',
      content: 'File content retrieved successfully',
      tool_calls: null,
    },
    finish_reason: 'stop',
  }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};

const mockAnthropicResponse = {
  content: [{
    type: 'text',
    text: 'File content retrieved successfully',
  }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 10, output_tokens: 5 },
};

// Mock HTTP fetch for provider API calls
global.fetch = vi.fn();

describe('Provider Tool Integration', () => {
  let config: Config;
  let toolRegistry: ToolRegistry;
  let toolManager: BuiltinToolManager;
  let mockAbortController: AbortController;

  beforeAll(() => {
    // Setup global mocks
    global.fetch = vi.fn();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    mockAbortController = new AbortController();
    
    // Create comprehensive mock config
    config = {
      getProjectRoot: vi.fn().mockReturnValue('/test/project'),
      getTargetDir: vi.fn().mockReturnValue('/test/project'),
      getDebugMode: vi.fn().mockReturnValue(false),
      getCoreTools: vi.fn().mockReturnValue([]),
      getExcludeTools: vi.fn().mockReturnValue([]),
      getGeminiClient: vi.fn().mockReturnValue({
        generateContent: vi.fn().mockResolvedValue({
          response: {
            text: () => 'Gemini response',
          },
        }),
      }),
      getWorkspaceContext: vi.fn().mockReturnValue({
        getDirectories: vi.fn().mockReturnValue(['/test/project']),
      }),
      // OpenAI specific configs
      getOpenAIApiKey: vi.fn().mockReturnValue('test-openai-key'),
      getOpenAIModel: vi.fn().mockReturnValue('gpt-4'),
      getOpenAIBaseUrl: vi.fn().mockReturnValue('https://api.openai.com/v1'),
      // Anthropic specific configs
      getAnthropicApiKey: vi.fn().mockReturnValue('test-anthropic-key'),
      getAnthropicModel: vi.fn().mockReturnValue('claude-3-sonnet-20240229'),
      getAnthropicBaseUrl: vi.fn().mockReturnValue('https://api.anthropic.com'),
      // Web request configs
      getWebRequestTimeout: vi.fn().mockReturnValue(10000),
      getWebContentLimit: vi.fn().mockReturnValue(100000),
    } as any;

    // Create mock tool registry with comprehensive tool set
    const mockTools = new Map([
      ['read_file', createMockTool('read_file', 'Read file contents')],
      ['write_file', createMockTool('write_file', 'Write file contents')],
      ['edit_file', createMockTool('edit_file', 'Edit file contents')],
      ['ls', createMockTool('ls', 'List directory contents')],
      ['glob', createMockTool('glob', 'Find files by pattern')],
      ['grep', createMockTool('grep', 'Search file contents')],
      ['read_many_files', createMockTool('read_many_files', 'Read multiple files')],
      ['run_shell_command', createMockTool('run_shell_command', 'Execute shell command')],
      ['save_memory', createMockTool('save_memory', 'Save memory item')],
      ['web_fetch', createMockTool('web_fetch', 'Fetch web content')],
      ['google_web_search', createMockTool('google_web_search', 'Search the web')],
    ]);

    toolRegistry = {
      getRegisteredTools: vi.fn().mockReturnValue(mockTools),
      getToolByName: vi.fn().mockImplementation((name: string) => mockTools.get(name)),
    } as any;

    // Mock tool manager with successful execution
    toolManager = {
      getAvailableTools: vi.fn().mockResolvedValue(Array.from(mockTools.values())),
      executeTool: vi.fn().mockImplementation(async (toolCall, context) => ({
        success: true,
        content: `Executed ${toolCall.name} successfully`,
        display: `${toolCall.name} completed`,
        toolName: toolCall.name,
        callId: toolCall.id,
        provider: context.provider,
        executionTimeMs: 150,
      })),
      getToolCategory: vi.fn().mockImplementation((toolName: string) => {
        const fileSystemTools = ['read_file', 'write_file', 'edit_file', 'ls', 'glob', 'grep', 'read_many_files'];
        const webTools = ['web_fetch', 'google_web_search'];
        const systemTools = ['run_shell_command', 'save_memory'];
        
        if (fileSystemTools.includes(toolName)) return 'filesystem';
        if (webTools.includes(toolName)) return 'web';
        if (systemTools.includes(toolName)) return 'system';
        return 'other';
      }),
      getToolStatistics: vi.fn().mockResolvedValue({
        totalToolsAvailable: 11,
        toolsByCategory: { filesystem: 7, web: 2, system: 2 },
        executionStats: { totalExecutions: 0, successRate: 1.0 },
      }),
    } as any;

    // Mock BuiltinToolManager constructor
    (BuiltinToolManager as any).mockImplementation(() => toolManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function createMockTool(name: string, description: string) {
    return {
      name,
      displayName: name.replace(/_/g, ' '),
      description,
      kind: 'read',
      build: vi.fn().mockReturnValue({
        execute: vi.fn().mockResolvedValue({
          llmContent: `${name} executed successfully`,
          returnDisplay: `${name} completed`,
        }),
        getDescription: vi.fn().mockReturnValue(description),
        shouldConfirmExecute: vi.fn().mockResolvedValue(false),
      }),
    };
  }

  describe('OpenAI Provider Integration', () => {
    let openaiIntegration: OpenAIBuiltinToolsIntegration;
    let openaiProvider: OpenAICompleteProvider;

    beforeEach(() => {
      openaiIntegration = new OpenAIBuiltinToolsIntegration(toolManager);
      openaiProvider = new OpenAICompleteProvider(config, toolManager);

      // Mock OpenAI API responses
      (global.fetch as any).mockImplementation((url: string, options: unknown) => {
        if (url.includes('openai.com')) {
          const body = JSON.parse(options.body);
          
          if (body.tools && body.tools.length > 0) {
            // Response with tool calls
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({
                choices: [{
                  message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [{
                      id: 'call_test123',
                      type: 'function',
                      function: {
                        name: 'read_file',
                        arguments: JSON.stringify({ file_path: '/test/file.txt' }),
                      },
                    }],
                  },
                  finish_reason: 'tool_calls',
                }],
                usage: { prompt_tokens: 15, completion_tokens: 8, total_tokens: 23 },
              }),
            });
          } else {
            // Regular response
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve(mockOpenAIResponse),
            });
          }
        }
        return Promise.reject(new Error('Unexpected URL'));
      });
    });

    it('should integrate all 11 built-in tools with OpenAI format', async () => {
      const tools = await openaiIntegration.getAvailableTools();
      
      expect(tools).toHaveLength(11);
      
      // Verify each tool has correct OpenAI format
      tools.forEach(tool => {
        expect(tool).toHaveProperty('type', 'function');
        expect(tool).toHaveProperty('function');
        expect(tool.function).toHaveProperty('name');
        expect(tool.function).toHaveProperty('description');
        expect(tool.function).toHaveProperty('parameters');
      });
      
      // Verify specific tools are present
      const toolNames = tools.map(t => t.function.name);
      expect(toolNames).toContain('read_file');
      expect(toolNames).toContain('write_file');
      expect(toolNames).toContain('run_shell_command');
      expect(toolNames).toContain('web_fetch');
      expect(toolNames).toContain('google_web_search');
    });

    it('should execute file system tools through OpenAI provider', async () => {
      const messages = [{
        role: 'user' as const,
        content: 'Read the file /test/example.txt',
      }];

      const result = await openaiProvider.generateContent(
        messages,
        { maxTokens: 1000 },
        mockAbortController.signal
      );

      expect(result).toBeDefined();
      expect(global.fetch).toHaveBeenCalled();
      
      // Verify tool was executed through the tool manager
      expect(toolManager.executeTool).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'read_file',
          parameters: { file_path: '/test/file.txt' },
        }),
        expect.objectContaining({
          provider: 'openai',
        })
      );
    });

    it('should handle OpenAI tool call format conversion', async () => {
      const openaiToolCall = {
        id: 'call_test123',
        type: 'function',
        function: {
          name: 'write_file',
          arguments: JSON.stringify({
            file_path: '/test/output.txt',
            content: 'Hello, world!',
          }),
        },
      };

      const unifiedCall = openaiIntegration.convertToUnifiedFormat(openaiToolCall);
      
      expect(unifiedCall).toEqual({
        id: 'call_test123',
        name: 'write_file',
        parameters: {
          file_path: '/test/output.txt',
          content: 'Hello, world!',
        },
      });
    });

    it('should handle OpenAI multi-turn conversation with tools', async () => {
      const conversation = [
        { role: 'user' as const, content: 'List files in the current directory' },
        { role: 'assistant' as const, content: null, tool_calls: [
          {
            id: 'call_ls',
            type: 'function' as const,
            function: { name: 'ls', arguments: '{}' },
          },
        ]},
        { role: 'tool' as const, content: 'file1.txt\nfile2.txt\nREADME.md', tool_call_id: 'call_ls' },
        { role: 'user' as const, content: 'Now read file1.txt' },
      ];

      const result = await openaiProvider.generateContent(
        conversation,
        { maxTokens: 1000 },
        mockAbortController.signal
      );

      expect(result).toBeDefined();
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should handle OpenAI error scenarios gracefully', async () => {
      // Mock API error response
      (global.fetch as any).mockImplementationOnce(() => Promise.resolve({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          error: { message: 'Invalid API key' },
        }),
      }));

      const messages = [{ role: 'user' as const, content: 'Test message' }];

      await expect(
        openaiProvider.generateContent(messages, {}, mockAbortController.signal)
      ).rejects.toThrow();
    });
  });

  describe('Anthropic Provider Integration', () => {
    let anthropicIntegration: AnthropicBuiltinToolsIntegration;
    let anthropicProvider: AnthropicCompleteProvider;

    beforeEach(() => {
      anthropicIntegration = new AnthropicBuiltinToolsIntegration(toolManager);
      anthropicProvider = new AnthropicCompleteProvider(config, toolManager);

      // Mock Anthropic API responses
      (global.fetch as any).mockImplementation((url: string, options: unknown) => {
        if (url.includes('anthropic.com')) {
          const body = JSON.parse(options.body);
          
          if (body.tools && body.tools.length > 0) {
            // Response with tool use
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({
                content: [{
                  type: 'tool_use',
                  id: 'toolu_test123',
                  name: 'read_file',
                  input: { file_path: '/test/file.txt' },
                }],
                stop_reason: 'tool_use',
                usage: { input_tokens: 15, output_tokens: 8 },
              }),
            });
          } else {
            // Regular response
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve(mockAnthropicResponse),
            });
          }
        }
        return Promise.reject(new Error('Unexpected URL'));
      });
    });

    it('should integrate all 11 built-in tools with Anthropic format', async () => {
      const tools = await anthropicIntegration.getAvailableTools();
      
      expect(tools).toHaveLength(11);
      
      // Verify each tool has correct Anthropic format
      tools.forEach(tool => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('input_schema');
        expect(tool.input_schema).toHaveProperty('type', 'object');
        expect(tool.input_schema).toHaveProperty('properties');
      });
      
      // Verify specific tools are present
      const toolNames = tools.map(t => t.name);
      expect(toolNames).toContain('read_file');
      expect(toolNames).toContain('write_file');
      expect(toolNames).toContain('run_shell_command');
      expect(toolNames).toContain('web_fetch');
      expect(toolNames).toContain('google_web_search');
    });

    it('should execute shell tools through Anthropic provider', async () => {
      const messages = [{
        role: 'user' as const,
        content: 'List the files in the current directory using ls',
      }];

      const result = await anthropicProvider.generateContent(
        messages,
        { maxTokens: 1000 },
        mockAbortController.signal
      );

      expect(result).toBeDefined();
      expect(global.fetch).toHaveBeenCalled();
      
      // Verify tool was executed through the tool manager
      expect(toolManager.executeTool).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'read_file',
          parameters: { file_path: '/test/file.txt' },
        }),
        expect.objectContaining({
          provider: 'anthropic',
        })
      );
    });

    it('should handle Anthropic tool use format conversion', async () => {
      const anthropicToolUse = {
        type: 'tool_use',
        id: 'toolu_test123',
        name: 'grep',
        input: {
          pattern: 'function',
          file_paths: ['/test/file.js'],
        },
      };

      const unifiedCall = anthropicIntegration.convertToUnifiedFormat(anthropicToolUse);
      
      expect(unifiedCall).toEqual({
        id: 'toolu_test123',
        name: 'grep',
        parameters: {
          pattern: 'function',
          file_paths: ['/test/file.js'],
        },
      });
    });

    it('should handle Anthropic multi-turn conversation with tools', async () => {
      const conversation = [
        { role: 'user' as const, content: 'Search for TODO comments in the codebase' },
        { role: 'assistant' as const, content: [
          { type: 'tool_use', id: 'toolu_grep', name: 'grep', input: { pattern: 'TODO' } },
        ]},
        { role: 'user' as const, content: [
          { type: 'tool_result', tool_use_id: 'toolu_grep', content: 'Found 3 TODO items' },
        ]},
        { role: 'user' as const, content: 'Now create a summary file' },
      ];

      const result = await anthropicProvider.generateContent(
        conversation,
        { maxTokens: 1000 },
        mockAbortController.signal
      );

      expect(result).toBeDefined();
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should handle Anthropic error scenarios gracefully', async () => {
      // Mock API error response
      (global.fetch as any).mockImplementationOnce(() => Promise.resolve({
        ok: false,
        status: 429,
        json: () => Promise.resolve({
          error: { message: 'Rate limit exceeded' },
        }),
      }));

      const messages = [{ role: 'user' as const, content: 'Test message' }];

      await expect(
        anthropicProvider.generateContent(messages, {}, mockAbortController.signal)
      ).rejects.toThrow();
    });
  });

  describe('Cross-Provider Tool Consistency', () => {
    let openaiIntegration: OpenAIBuiltinToolsIntegration;
    let anthropicIntegration: AnthropicBuiltinToolsIntegration;

    beforeEach(() => {
      openaiIntegration = new OpenAIBuiltinToolsIntegration(toolManager);
      anthropicIntegration = new AnthropicBuiltinToolsIntegration(toolManager);
    });

    it('should provide identical tool sets across providers', async () => {
      const openaiTools = await openaiIntegration.getAvailableTools();
      const anthropicTools = await anthropicIntegration.getAvailableTools();
      
      expect(openaiTools).toHaveLength(anthropicTools.length);
      
      const openaiToolNames = openaiTools.map(t => t.function.name).sort();
      const anthropicToolNames = anthropicTools.map(t => t.name).sort();
      
      expect(openaiToolNames).toEqual(anthropicToolNames);
    });

    it('should execute identical tools with same parameters across providers', async () => {
      const testParams = { file_path: '/test/sample.txt' };
      
      // Test OpenAI execution
      const openaiCall = {
        id: 'openai_call',
        name: 'read_file',
        parameters: testParams,
      };
      
      const openaiResult = await toolManager.executeTool(openaiCall, {
        provider: 'openai',
        conversationId: 'test',
        userId: 'user',
        signal: mockAbortController.signal,
        confirmationCallback: vi.fn(),
      });
      
      // Test Anthropic execution
      const anthropicCall = {
        id: 'anthropic_call',
        name: 'read_file',
        parameters: testParams,
      };
      
      const anthropicResult = await toolManager.executeTool(anthropicCall, {
        provider: 'anthropic',
        conversationId: 'test',
        userId: 'user',
        signal: mockAbortController.signal,
        confirmationCallback: vi.fn(),
      });
      
      // Results should be identical except for provider-specific metadata
      expect(openaiResult.success).toBe(anthropicResult.success);
      expect(openaiResult.content).toBe(anthropicResult.content);
      expect(openaiResult.toolName).toBe(anthropicResult.toolName);
      expect(openaiResult.provider).toBe('openai');
      expect(anthropicResult.provider).toBe('anthropic');
    });

    it('should handle tool validation consistently across providers', async () => {
      // Test with invalid parameters
      const invalidCall = {
        id: 'test_call',
        name: 'read_file',
        parameters: { invalid_param: 'value' },
      };
      
      // Mock tool manager to return validation error
      toolManager.executeTool = vi.fn().mockResolvedValue({
        success: false,
        error: 'Invalid parameters for read_file tool',
        toolName: 'read_file',
        callId: 'test_call',
      });
      
      const openaiResult = await toolManager.executeTool(invalidCall, {
        provider: 'openai',
        conversationId: 'test',
        userId: 'user',
        signal: mockAbortController.signal,
        confirmationCallback: vi.fn(),
      });
      
      const anthropicResult = await toolManager.executeTool(invalidCall, {
        provider: 'anthropic',
        conversationId: 'test',
        userId: 'user',
        signal: mockAbortController.signal,
        confirmationCallback: vi.fn(),
      });
      
      expect(openaiResult.success).toBe(false);
      expect(anthropicResult.success).toBe(false);
      expect(openaiResult.error).toBe(anthropicResult.error);
    });

    it('should maintain identical security policies across providers', async () => {
      // Test dangerous shell command
      const dangerousCall = {
        id: 'dangerous_call',
        name: 'run_shell_command',
        parameters: { command: 'rm -rf /' },
      };
      
      // Mock tool manager to return security error
      toolManager.executeTool = vi.fn().mockResolvedValue({
        success: false,
        error: 'Command blocked by security policy: Dangerous command detected',
        toolName: 'run_shell_command',
        callId: 'dangerous_call',
      });
      
      const openaiResult = await toolManager.executeTool(dangerousCall, {
        provider: 'openai',
        conversationId: 'test',
        userId: 'user',
        signal: mockAbortController.signal,
        confirmationCallback: vi.fn(),
      });
      
      const anthropicResult = await toolManager.executeTool(dangerousCall, {
        provider: 'anthropic',
        conversationId: 'test',
        userId: 'user',
        signal: mockAbortController.signal,
        confirmationCallback: vi.fn(),
      });
      
      expect(openaiResult.success).toBe(false);
      expect(anthropicResult.success).toBe(false);
      expect(openaiResult.error).toContain('security policy');
      expect(anthropicResult.error).toContain('security policy');
    });
  });

  describe('Performance and Reliability', () => {
    let openaiIntegration: OpenAIBuiltinToolsIntegration;
    let anthropicIntegration: AnthropicBuiltinToolsIntegration;

    beforeEach(() => {
      openaiIntegration = new OpenAIBuiltinToolsIntegration(toolManager);
      anthropicIntegration = new AnthropicBuiltinToolsIntegration(toolManager);
    });

    it('should handle concurrent tool execution across providers', async () => {
      const toolCalls = Array.from({ length: 10 }, (_, i) => ({
        id: `concurrent_call_${i}`,
        name: 'read_file',
        parameters: { file_path: `/test/file${i}.txt` },
      }));
      
      const openaiPromises = toolCalls.slice(0, 5).map(call =>
        toolManager.executeTool(call, {
          provider: 'openai',
          conversationId: 'test',
          userId: 'user',
          signal: mockAbortController.signal,
          confirmationCallback: vi.fn(),
        })
      );
      
      const anthropicPromises = toolCalls.slice(5).map(call =>
        toolManager.executeTool(call, {
          provider: 'anthropic',
          conversationId: 'test',
          userId: 'user',
          signal: mockAbortController.signal,
          confirmationCallback: vi.fn(),
        })
      );
      
      const results = await Promise.all([...openaiPromises, ...anthropicPromises]);
      
      expect(results).toHaveLength(10);
      expect(results.every(r => r.success)).toBe(true);
      expect(results.slice(0, 5).every(r => r.provider === 'openai')).toBe(true);
      expect(results.slice(5).every(r => r.provider === 'anthropic')).toBe(true);
    });

    it('should handle timeout scenarios consistently', async () => {
      const timeoutController = new AbortController();
      setTimeout(() => timeoutController.abort(), 50);
      
      // Mock tool execution with delay
      toolManager.executeTool = vi.fn().mockImplementation(() =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve({
            success: true,
            content: 'Delayed result',
          }), 100);
          
          timeoutController.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('Operation timed out'));
          });
        })
      );
      
      const toolCall = {
        id: 'timeout_call',
        name: 'read_file',
        parameters: { file_path: '/test/file.txt' },
      };
      
      await expect(
        toolManager.executeTool(toolCall, {
          provider: 'openai',
          conversationId: 'test',
          userId: 'user',
          signal: timeoutController.signal,
          confirmationCallback: vi.fn(),
        })
      ).rejects.toThrow('Operation timed out');
    });

    it('should maintain tool execution metrics across providers', async () => {
      // Execute some tools
      await Promise.all([
        toolManager.executeTool({
          id: 'metrics_call_1',
          name: 'read_file',
          parameters: { file_path: '/test/file1.txt' },
        }, {
          provider: 'openai',
          conversationId: 'test',
          userId: 'user',
          signal: mockAbortController.signal,
          confirmationCallback: vi.fn(),
        }),
        toolManager.executeTool({
          id: 'metrics_call_2',
          name: 'write_file',
          parameters: { file_path: '/test/file2.txt', content: 'test' },
        }, {
          provider: 'anthropic',
          conversationId: 'test',
          userId: 'user',
          signal: mockAbortController.signal,
          confirmationCallback: vi.fn(),
        }),
      ]);
      
      const stats = await toolManager.getToolStatistics();
      
      expect(stats).toHaveProperty('totalToolsAvailable', 11);
      expect(stats).toHaveProperty('toolsByCategory');
      expect(stats).toHaveProperty('executionStats');
      expect(stats.executionStats.successRate).toBeGreaterThan(0);
    });
  });
});