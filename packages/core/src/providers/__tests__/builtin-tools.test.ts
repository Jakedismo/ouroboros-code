/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BuiltinToolManager } from '../tools/builtin-tool-manager.js';
import { ToolBehaviorManager } from '../tools/tool-behaviors.js';
import { FileSystemBoundary } from '../tools/filesystem-boundary.js';
import { ShellToolSecurity } from '../tools/shell-tool-security.js';
import { MemoryToolHandler } from '../tools/memory-tool-handler.js';
import { WebToolsHandler } from '../tools/web-tools-handler.js';
import { Config } from '../../config/config.js';
import { ToolRegistry } from '../../tools/tool-registry.js';
import { UnifiedTool, UnifiedToolCall, ToolExecutionContext } from '../tools/unified-tool-interface.js';

// Mock dependencies
vi.mock('../../config/config.js');
vi.mock('../../tools/tool-registry.js');
vi.mock('../tools/tool-behaviors.js');
vi.mock('../tools/filesystem-boundary.js');
vi.mock('../tools/shell-tool-security.js');
vi.mock('../tools/memory-tool-handler.js');
vi.mock('../tools/web-tools-handler.js');

describe('BuiltinToolManager', () => {
  let config: Config;
  let toolRegistry: ToolRegistry;
  let toolManager: BuiltinToolManager;
  let mockContext: ToolExecutionContext;

  beforeEach(() => {
    // Create mock config
    config = {
      getProjectRoot: vi.fn().mockReturnValue('/test/project'),
      getDebugMode: vi.fn().mockReturnValue(false),
      getCoreTools: vi.fn().mockReturnValue([]),
      getExcludeTools: vi.fn().mockReturnValue([]),
      getTargetDir: vi.fn().mockReturnValue('/test/project'),
      getWorkspaceContext: vi.fn().mockReturnValue({
        getDirectories: vi.fn().mockReturnValue(['/test/project']),
      }),
    } as any;

    // Create mock tool registry
    toolRegistry = {
      getRegisteredTools: vi.fn().mockReturnValue(new Map([
        ['read_file', { name: 'read_file', displayName: 'ReadFile', kind: 'read' }],
        ['write_file', { name: 'write_file', displayName: 'WriteFile', kind: 'write' }],
        ['run_shell_command', { name: 'run_shell_command', displayName: 'Shell', kind: 'execute' }],
        ['web_fetch', { name: 'web_fetch', displayName: 'WebFetch', kind: 'fetch' }],
        ['google_web_search', { name: 'google_web_search', displayName: 'GoogleSearch', kind: 'search' }],
        ['save_memory', { name: 'save_memory', displayName: 'Memory', kind: 'memory' }],
        ['ls', { name: 'ls', displayName: 'LS', kind: 'read' }],
        ['glob', { name: 'glob', displayName: 'Glob', kind: 'read' }],
        ['grep', { name: 'grep', displayName: 'Grep', kind: 'search' }],
        ['edit_file', { name: 'edit_file', displayName: 'EditFile', kind: 'write' }],
        ['read_many_files', { name: 'read_many_files', displayName: 'ReadManyFiles', kind: 'read' }],
      ])),
      getTool: vi.fn().mockImplementation((name: string) => ({
        name,
        displayName: name.replace(/_/g, ' '),
        kind: 'read',
        build: vi.fn().mockReturnValue({
          execute: vi.fn().mockResolvedValue({ llmContent: 'test result', returnDisplay: 'test' }),
          getDescription: vi.fn().mockReturnValue('test description'),
          shouldConfirmExecute: vi.fn().mockResolvedValue(false),
        }),
      })),
    } as any;

    // Mock context
    mockContext = {
      config,
      signal: new AbortController().signal,
      abortSignal: new AbortController().signal,
      onConfirmation: vi.fn().mockResolvedValue('proceed'),
    };

    // Create tool manager
    toolManager = new BuiltinToolManager(config, toolRegistry);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with all required components', () => {
      expect(toolManager).toBeInstanceOf(BuiltinToolManager);
      expect(ToolBehaviorManager).toHaveBeenCalledWith(config);
      expect(FileSystemBoundary).toHaveBeenCalledWith(config);
      expect(ShellToolSecurity).toHaveBeenCalledWith(config);
      expect(MemoryToolHandler).toHaveBeenCalledWith(config);
      expect(WebToolsHandler).toHaveBeenCalledWith(config);
    });

    it('should discover available tools from registry', async () => {
      const tools = await toolManager.getAvailableTools();
      
      expect(tools).toHaveLength(11);
      expect(tools.map(t => t.name)).toContain('read_file');
      expect(tools.map(t => t.name)).toContain('write_file');
      expect(tools.map(t => t.name)).toContain('run_shell_command');
    });
  });

  describe('tool categorization', () => {
    it('should correctly categorize file system tools', async () => {
      const tools = await toolManager.getAvailableTools();
      const fileSystemTools = tools.filter(t => (toolManager as any).getToolCategory(t.name) === 'filesystem');
      
      expect(fileSystemTools).toHaveLength(7);
      expect(fileSystemTools.map(t => t.name)).toEqual(expect.arrayContaining([
        'read_file', 'write_file', 'edit_file', 'ls', 'glob', 'grep', 'read_many_files'
      ]));
    });

    it('should correctly categorize web tools', async () => {
      const tools = await toolManager.getAvailableTools();
      const webTools = tools.filter(t => (toolManager as any).getToolCategory(t.name) === 'web');
      
      expect(webTools).toHaveLength(2);
      expect(webTools.map(t => t.name)).toEqual(expect.arrayContaining([
        'web_fetch', 'google_web_search'
      ]));
    });

    it('should correctly categorize system tools', async () => {
      const tools = await toolManager.getAvailableTools();
      const systemTools = tools.filter(t => (toolManager as any).getToolCategory(t.name) === 'system');
      
      expect(systemTools).toHaveLength(2);
      expect(systemTools.map(t => t.name)).toEqual(expect.arrayContaining([
        'run_shell_command', 'save_memory'
      ]));
    });
  });

  describe('tool execution', () => {
    it('should execute a simple file read tool', async () => {
      const toolCall: UnifiedToolCall = {
        id: 'test-call-1',
        name: 'read_file',
        arguments: { file_path: '/test/file.txt' },
      };

      const result = await toolManager.executeTool(toolCall, mockContext);
      
      expect(result.success).toBe(true);
      expect(result.content).toBe('test result');
      expect(result.display).toBe('test');
      expect(toolRegistry.getTool).toHaveBeenCalledWith('read_file');
    });

    it('should handle tool execution errors gracefully', async () => {
      const mockTool = {
        build: vi.fn().mockReturnValue({
          execute: vi.fn().mockRejectedValue(new Error('Tool execution failed')),
          getDescription: vi.fn().mockReturnValue('test description'),
          shouldConfirmExecute: vi.fn().mockResolvedValue(false),
        }),
      };

      toolRegistry.getTool = vi.fn().mockReturnValue(mockTool);

      const toolCall: UnifiedToolCall = {
        id: 'test-call-1',
        name: 'read_file',
        arguments: { file_path: '/test/file.txt' },
      };

      const result = await toolManager.executeTool(toolCall, mockContext);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Tool execution failed');
    });

    it('should handle missing tools', async () => {
      toolRegistry.getTool = vi.fn().mockReturnValue(null);

      const toolCall: UnifiedToolCall = {
        id: 'test-call-1',
        name: 'nonexistent_tool',
        arguments: {},
      };

      const result = await toolManager.executeTool(toolCall, mockContext);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Tool not found');
    });

    it('should handle tool confirmation flow', async () => {
      const mockTool = {
        build: vi.fn().mockReturnValue({
          execute: vi.fn().mockResolvedValue({ llmContent: 'confirmed result', returnDisplay: 'confirmed' }),
          getDescription: vi.fn().mockReturnValue('test description'),
          shouldConfirmExecute: vi.fn().mockResolvedValue({
            type: 'exec',
            title: 'Confirm execution',
            command: 'test command',
            onConfirm: vi.fn(),
          }),
        }),
      };

      toolRegistry.getTool = vi.fn().mockReturnValue(mockTool);

      const toolCall: UnifiedToolCall = {
        id: 'test-call-1',
        name: 'run_shell_command',
        arguments: { command: 'ls -la' },
      };

      const result = await toolManager.executeTool(toolCall, mockContext);
      
      expect(result.success).toBe(true);
      expect(mockContext.onConfirmation).toHaveBeenCalled();
      expect(result.content).toBe('confirmed result');
    });
  });

  describe('security validation', () => {
    let mockToolBehaviors: any;
    let mockFileSystemBoundary: any;
    let mockShellSecurity: any;

    beforeEach(() => {
      mockToolBehaviors = {
        getToolConfig: vi.fn().mockReturnValue({
          securityLevel: 'SAFE',
          requiresConfirmation: false,
          timeoutMs: 5000,
          allowedFileOperations: ['read', 'write'],
        }),
        isToolAllowed: vi.fn().mockReturnValue(true),
      };

      mockFileSystemBoundary = {
        isPathAllowed: vi.fn().mockReturnValue(true),
        validatePath: vi.fn().mockResolvedValue('/validated/path'),
        shouldIgnorePath: vi.fn().mockReturnValue(false),
      };

      mockShellSecurity = {
        validateCommand: vi.fn().mockReturnValue({
          allowed: true,
          securityLevel: 'SAFE',
          reason: 'Command is safe',
        }),
      };

      (ToolBehaviorManager as any).mockImplementation(() => mockToolBehaviors);
      (FileSystemBoundary as any).mockImplementation(() => mockFileSystemBoundary);
      (ShellToolSecurity as any).mockImplementation(() => mockShellSecurity);

      toolManager = new BuiltinToolManager(config, toolRegistry);
    });

    it('should validate file system operations', async () => {
      const toolCall: UnifiedToolCall = {
        id: 'test-call-1',
        name: 'read_file',
        arguments: { file_path: '/test/file.txt' },
      };

      await toolManager.executeTool(toolCall, mockContext);
      
      expect(mockFileSystemBoundary.isPathAllowed).toHaveBeenCalledWith('/test/file.txt');
      expect(mockToolBehaviors.getToolConfig).toHaveBeenCalledWith('read_file');
    });

    it('should validate shell commands', async () => {
      const toolCall: UnifiedToolCall = {
        id: 'test-call-1',
        name: 'run_shell_command',
        arguments: { command: 'ls -la' },
      };

      await toolManager.executeTool(toolCall, mockContext);
      
      expect(mockShellSecurity.validateCommand).toHaveBeenCalledWith('ls -la');
    });

    it('should block unsafe file paths', async () => {
      mockFileSystemBoundary.isPathAllowed.mockReturnValue(false);
      mockFileSystemBoundary.validatePath.mockReturnValue({
        valid: false,
        reason: 'Path outside project boundary',
      });

      const toolCall: UnifiedToolCall = {
        id: 'test-call-1',
        name: 'read_file',
        arguments: { file_path: '/etc/passwd' },
      };

      const result = await toolManager.executeTool(toolCall, mockContext);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Path outside project boundary');
    });

    it('should block unsafe shell commands', async () => {
      mockShellSecurity.validateCommand.mockReturnValue({
        allowed: false,
        securityLevel: 'CRITICAL',
        reason: 'Command contains dangerous patterns',
        threats: ['Command injection'],
      });

      const toolCall: UnifiedToolCall = {
        id: 'test-call-1',
        name: 'run_shell_command',
        arguments: { command: 'rm -rf /' },
      };

      const result = await toolManager.executeTool(toolCall, mockContext);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Command contains dangerous patterns');
    });
  });

  describe('provider compatibility', () => {
    it('should handle OpenAI provider context', async () => {
      const openaiContext: ToolExecutionContext = {
        ...mockContext,
      };

      const toolCall: UnifiedToolCall = {
        id: 'test-call-1',
        name: 'read_file',
        arguments: { file_path: '/test/file.txt' },
      };

      const result = await toolManager.executeTool(toolCall, openaiContext);
      
      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
    });

    it('should handle Anthropic provider context', async () => {
      const anthropicContext: ToolExecutionContext = {
        ...mockContext,
      };

      const toolCall: UnifiedToolCall = {
        id: 'test-call-1',
        name: 'read_file',
        arguments: { file_path: '/test/file.txt' },
      };

      const result = await toolManager.executeTool(toolCall, anthropicContext);
      
      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
    });

    it('should handle Gemini provider context', async () => {
      const geminiContext: ToolExecutionContext = {
        ...mockContext,
      };

      const toolCall: UnifiedToolCall = {
        id: 'test-call-1',
        name: 'read_file',
        arguments: { file_path: '/test/file.txt' },
      };

      const result = await toolManager.executeTool(toolCall, geminiContext);
      
      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
    });
  });

  describe('performance and caching', () => {
    it('should cache tool instances for repeated calls', async () => {
      const toolCall1: UnifiedToolCall = {
        id: 'test-call-1',
        name: 'read_file',
        arguments: { file_path: '/test/file1.txt' },
      };

      const toolCall2: UnifiedToolCall = {
        id: 'test-call-2',
        name: 'read_file',
        arguments: { file_path: '/test/file2.txt' },
      };

      await toolManager.executeTool(toolCall1, mockContext);
      await toolManager.executeTool(toolCall2, mockContext);
      
      // Tool registry should be called only once for the same tool name
      expect(toolRegistry.getTool).toHaveBeenCalledTimes(2);
      expect(toolRegistry.getTool).toHaveBeenCalledWith('read_file');
    });

    it('should handle concurrent tool execution', async () => {
      const toolCalls = Array.from({ length: 5 }, (_, i) => ({
        id: `test-call-${i}`,
        name: 'read_file',
        arguments: { file_path: `/test/file${i}.txt` },
      }));

      const results = await Promise.all(
        toolCalls.map(toolCall => toolManager.executeTool(toolCall, mockContext))
      );
      
      expect(results).toHaveLength(5);
      expect(results.every(r => r.success)).toBe(true);
    });
  });

  describe('error handling and resilience', () => {
    it('should handle aborted tool execution', async () => {
      const abortController = new AbortController();
      const abortedContext = {
        ...mockContext,
        signal: abortController.signal,
      };

      const mockTool = {
        build: vi.fn().mockReturnValue({
          execute: vi.fn().mockImplementation(async (signal: AbortSignal) => new Promise((resolve, reject) => {
              signal.addEventListener('abort', () => {
                reject(new Error('Operation was aborted'));
              });
              
              setTimeout(() => {
                resolve({ llmContent: 'result', returnDisplay: 'result' });
              }, 1000);
            })),
          getDescription: vi.fn().mockReturnValue('test description'),
          shouldConfirmExecute: vi.fn().mockResolvedValue(false),
        }),
      };

      toolRegistry.getTool = vi.fn().mockReturnValue(mockTool);

      const toolCall: UnifiedToolCall = {
        id: 'test-call-1',
        name: 'read_file',
        arguments: { file_path: '/test/file.txt' },
      };

      // Abort after a short delay
      setTimeout(() => abortController.abort(), 100);

      const result = await toolManager.executeTool(toolCall, abortedContext);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Operation was aborted');
    });

    it('should provide detailed error information', async () => {
      const mockTool = {
        build: vi.fn().mockReturnValue({
          execute: vi.fn().mockRejectedValue(new Error('Detailed error message')),
          getDescription: vi.fn().mockReturnValue('test description'),
          shouldConfirmExecute: vi.fn().mockResolvedValue(false),
        }),
      };

      toolRegistry.getTool = vi.fn().mockReturnValue(mockTool);

      const toolCall: UnifiedToolCall = {
        id: 'test-call-1',
        name: 'read_file',
        arguments: { file_path: '/test/file.txt' },
      };

      const result = await toolManager.executeTool(toolCall, mockContext);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Detailed error message');
      expect(result.toolCallId).toBe('test-call-1');
    });
  });

  describe('tool statistics and monitoring', () => {
    it('should track tool execution statistics', async () => {
      const toolCall: UnifiedToolCall = {
        id: 'test-call-1',
        name: 'read_file',
        arguments: { file_path: '/test/file.txt' },
      };

      const startTime = Date.now();
      const result = await toolManager.executeTool(toolCall, mockContext);
      const endTime = Date.now();
      
      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
      expect(endTime - startTime).toBeGreaterThanOrEqual(0);
    });

    it('should provide tool usage metrics', async () => {
      const stats = await toolManager.getToolStatistics();
      
      expect(stats).toHaveProperty('totalToolsAvailable');
      expect(stats).toHaveProperty('toolsByCategory');
      expect(stats).toHaveProperty('executionStats');
      expect(stats.totalToolsAvailable).toBe(11);
      expect(stats.toolsByCategory).toHaveProperty('filesystem');
      expect(stats.toolsByCategory).toHaveProperty('web');
      expect(stats.toolsByCategory).toHaveProperty('system');
    });
  });
});

describe('Tool Integration Edge Cases', () => {
  let toolManager: BuiltinToolManager;
  let config: Config;
  let toolRegistry: ToolRegistry;
  let mockContext: ToolExecutionContext;

  beforeEach(() => {
    config = {
      getProjectRoot: vi.fn().mockReturnValue('/test/project'),
      getDebugMode: vi.fn().mockReturnValue(true),
    } as any;

    toolRegistry = {
      getRegisteredTools: vi.fn().mockReturnValue(new Map()),
      getTool: vi.fn().mockReturnValue(null),
    } as any;

    mockContext = {
      config,
      signal: new AbortController().signal,
      abortSignal: new AbortController().signal,
      onConfirmation: vi.fn(),
    };

    toolManager = new BuiltinToolManager(config, toolRegistry);
  });

  it('should handle empty tool registry', async () => {
    const tools = await toolManager.getAvailableTools();
    expect(tools).toHaveLength(0);
  });

  it('should handle malformed tool parameters', async () => {
    const mockTool = {
      build: vi.fn().mockImplementation(() => {
        throw new Error('Invalid parameters');
      }),
    };

    toolRegistry.getTool = vi.fn().mockReturnValue(mockTool);

    const toolCall: UnifiedToolCall = {
      id: 'test-call-1',
      name: 'read_file',
      arguments: { invalid: 'parameters' },
    };

    const result = await toolManager.executeTool(toolCall, mockContext);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid parameters');
  });

  it('should handle network timeout scenarios', async () => {
    const mockTool = {
      build: vi.fn().mockReturnValue({
        execute: vi.fn().mockImplementation(() => 
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Request timeout')), 100);
          })
        ),
        getDescription: vi.fn().mockReturnValue('test description'),
        shouldConfirmExecute: vi.fn().mockResolvedValue(false),
      }),
    };

    toolRegistry.getTool = vi.fn().mockReturnValue(mockTool);

    const toolCall: UnifiedToolCall = {
      id: 'test-call-1',
      name: 'web_fetch',
      arguments: { url: 'https://example.com' },
    };

    const result = await toolManager.executeTool(toolCall, mockContext);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Request timeout');
  });
});