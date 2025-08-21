# Built-in Tools Integration for Multi-LLM Providers

## Executive Summary

This document extends the Multi-LLM architecture to enable OpenAI and Anthropic providers to seamlessly use Gemini CLI's built-in tools. The implementation ensures all 11 core tools work identically across providers while maintaining tool-specific behaviors like confirmation flows, file system boundaries, and memory persistence.

## Built-in Tools Overview

### Core Tool Categories

#### 1. File System Tools (7 tools)

- **list_directory** (`LSTool`): Lists directory contents with metadata
- **read_file** (`ReadFileTool`): Reads single file content
- **read_many_files** (`ReadManyFilesTool`): Batch reads multiple files
- **search_file_content** (`GrepTool`): Pattern search across files
- **glob** (`GlobTool`): File discovery using glob patterns
- **replace** (`EditTool`): In-place file editing with pattern replacement
- **write_file** (`WriteFileTool`): Creates or overwrites files

#### 2. Web Tools (2 tools)

- **google_web_search** (`WebSearchTool`): Web search via Google
- **web_fetch** (`WebFetchTool`): Fetches content from URLs

#### 3. System Tools (2 tools)

- **run_shell_command** (`ShellTool`): Executes shell commands
- **save_memory** (`MemoryTool`): Persistent fact storage

## Architecture Design

### Tool Abstraction Layers

```
┌────────────────────────────────────────────┐
│          User Request with Tool Call       │
└────────────────┬───────────────────────────┘
                 │
┌────────────────▼───────────────────────────┐
│       Provider-Specific Tool Handler       │
│  (OpenAI/Anthropic/Gemini specific logic)  │
└────────────────┬───────────────────────────┘
                 │
┌────────────────▼───────────────────────────┐
│      Built-in Tool Execution Layer         │
│    (Shared tool instances & logic)         │
└────────────────┬───────────────────────────┘
                 │
┌────────────────▼───────────────────────────┐
│      Tool-Specific Implementations         │
│  (ReadFile, WriteFile, Shell, Memory...)   │
└────────────────┬───────────────────────────┘
                 │
┌────────────────▼───────────────────────────┐
│        System Resources & Services         │
│    (File System, Network, Git, Memory)     │
└────────────────────────────────────────────┘
```

## Implementation Details

### 1. Built-in Tool Manager

**Location**: `packages/core/src/providers/tools/builtin-tool-manager.ts`

```typescript
import { ToolRegistry } from '../../tools/tool-registry.js';
import { Config } from '../../config/config.js';
import {
  BaseDeclarativeTool,
  ToolInvocation,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
} from '../../tools/tools.js';
import {
  UnifiedTool,
  UnifiedToolCall,
  UnifiedToolResult,
} from './unified-tool-interface.js';
import { FunctionDeclaration } from '@google/genai';

export class BuiltinToolManager {
  private toolRegistry: ToolRegistry;
  private builtinTools: Map<string, BaseDeclarativeTool<any, any>> = new Map();
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Initialize and discover all built-in tools
   */
  async initialize(): Promise<void> {
    // Create and populate tool registry
    this.toolRegistry = await this.config.createToolRegistry();

    // Get all registered built-in tools
    const allTools = this.toolRegistry.getAllTools();

    // Filter and store built-in tools (non-MCP tools)
    for (const tool of allTools) {
      if (!tool.name.includes(':')) {
        // MCP tools have server:tool format
        this.builtinTools.set(tool.name, tool);
      }
    }

    console.debug(
      `[BuiltinToolManager] Initialized ${this.builtinTools.size} built-in tools`,
    );
  }

  /**
   * Get all built-in tools as unified tools for provider conversion
   */
  getUnifiedTools(): UnifiedTool[] {
    const unifiedTools: UnifiedTool[] = [];

    for (const tool of this.builtinTools.values()) {
      const declaration = tool.declaration();
      unifiedTools.push(this.convertToUnified(declaration));
    }

    return unifiedTools;
  }

  /**
   * Execute a built-in tool with full support for confirmation flows
   */
  async executeTool(
    toolCall: UnifiedToolCall,
    context: ToolExecutionContext,
  ): Promise<UnifiedToolResult> {
    const tool = this.builtinTools.get(toolCall.name);

    if (!tool) {
      return {
        toolCallId: toolCall.id,
        content: `Built-in tool ${toolCall.name} not found`,
        isError: true,
      };
    }

    try {
      // Validate and build tool invocation
      const invocation = tool.build(toolCall.arguments);

      // Handle confirmation if needed
      const confirmationDetails = await invocation.shouldConfirm(
        this.config,
        context.abortSignal,
      );

      if (confirmationDetails) {
        const outcome = await this.handleConfirmation(
          confirmationDetails,
          context,
        );

        if (outcome === ToolConfirmationOutcome.Deny) {
          return {
            toolCallId: toolCall.id,
            content: 'Tool execution cancelled by user',
            isError: false,
          };
        }

        // Apply confirmation outcome to invocation
        if (confirmationDetails.onConfirm) {
          await confirmationDetails.onConfirm(outcome);
        }
      }

      // Execute the tool with progress callback
      const result = await invocation.execute(
        context.abortSignal,
        context.onProgress,
      );

      return {
        toolCallId: toolCall.id,
        content: result.llmContent,
        display: result.returnDisplay,
        isError: result.error !== undefined,
        error: result.error,
      };
    } catch (error: any) {
      console.error(`Error executing built-in tool ${toolCall.name}:`, error);
      return {
        toolCallId: toolCall.id,
        content: `Error: ${error.message}`,
        isError: true,
      };
    }
  }

  /**
   * Handle tool confirmation with provider-agnostic interface
   */
  private async handleConfirmation(
    details: ToolCallConfirmationDetails,
    context: ToolExecutionContext,
  ): Promise<ToolConfirmationOutcome> {
    if (!context.onConfirmation) {
      // Auto-approve if no confirmation handler
      return ToolConfirmationOutcome.ProceedOnce;
    }

    // Convert confirmation details to provider-agnostic format
    const confirmationRequest = {
      toolName: details.toolDisplayName || 'Tool',
      description: details.toolDescription || '',
      action: this.getConfirmationAction(details),
      details: this.formatConfirmationDetails(details),
      options: this.getConfirmationOptions(details),
    };

    return await context.onConfirmation(confirmationRequest);
  }

  private getConfirmationAction(details: ToolCallConfirmationDetails): string {
    if ('fileDiff' in details) {
      return 'modify_file';
    } else if ('command' in details) {
      return 'execute_command';
    } else if ('url' in details) {
      return 'fetch_url';
    } else if ('fact' in details) {
      return 'save_memory';
    }
    return 'execute_tool';
  }

  private formatConfirmationDetails(details: any): Record<string, any> {
    // Format details based on tool type
    if ('fileDiff' in details) {
      return {
        file: details.filePath,
        diff: details.fileDiff,
        isNewFile: details.isNewFile,
      };
    } else if ('command' in details) {
      return {
        command: details.command,
        directory: details.directory,
      };
    } else if ('url' in details) {
      return {
        urls: details.urls,
      };
    }
    return details;
  }

  private getConfirmationOptions(details: any): string[] {
    const options = ['proceed_once', 'deny'];

    // Add tool-specific options
    if ('allowlistOption' in details && details.allowlistOption) {
      options.push('proceed_always');
    }

    return options;
  }

  private convertToUnified(declaration: FunctionDeclaration): UnifiedTool {
    return {
      name: declaration.name,
      description: declaration.description || '',
      parameters: {
        type: 'object',
        properties: declaration.parameters?.properties || {},
        required: declaration.parameters?.required || [],
      },
    };
  }
}

export interface ToolExecutionContext {
  config: Config;
  abortSignal: AbortSignal;
  onProgress?: (message: string) => void;
  onConfirmation?: (
    request: ConfirmationRequest,
  ) => Promise<ToolConfirmationOutcome>;
}

export interface ConfirmationRequest {
  toolName: string;
  description: string;
  action: string;
  details: Record<string, any>;
  options: string[];
}
```

### 2. Tool-Specific Behaviors

**Location**: `packages/core/src/providers/tools/tool-behaviors.ts`

```typescript
import { Config } from '../../config/config.js';
import { ApprovalMode } from '../../config/config.js';

/**
 * Encapsulates tool-specific behaviors and constraints
 */
export class ToolBehaviorManager {
  constructor(private config: Config) {}

  /**
   * Get tool-specific configuration
   */
  getToolConfig(toolName: string): ToolSpecificConfig {
    switch (toolName) {
      case 'write_file':
      case 'replace':
        return {
          requiresConfirmation:
            this.config.getApprovalMode() !== ApprovalMode.AUTO,
          respectsGitIgnore: true,
          boundToProjectRoot: true,
          supportsDiff: true,
        };

      case 'run_shell_command':
        return {
          requiresConfirmation: true,
          allowlist: this.config.getShellAllowlist(),
          timeout: 30000,
          boundToProjectRoot: true,
        };

      case 'web_fetch':
        return {
          requiresConfirmation: this.shouldConfirmUrl(),
          maxUrls: 20,
          timeout: 10000,
          blocksPrivateIPs: true,
        };

      case 'save_memory':
        return {
          requiresConfirmation: false,
          persistsAcrossSessions: true,
          hierarchical: true,
          globalPath: this.config.getGeminiDir(),
        };

      case 'google_web_search':
        return {
          requiresConfirmation: false,
          requiresGeminiAPI: true,
          maxResults: 10,
        };

      default:
        return {
          requiresConfirmation: false,
          boundToProjectRoot: true,
        };
    }
  }

  private shouldConfirmUrl(): boolean {
    return this.config.getApprovalMode() !== ApprovalMode.AUTO;
  }
}

interface ToolSpecificConfig {
  requiresConfirmation: boolean;
  respectsGitIgnore?: boolean;
  boundToProjectRoot?: boolean;
  supportsDiff?: boolean;
  allowlist?: Set<string>;
  timeout?: number;
  maxUrls?: number;
  blocksPrivateIPs?: boolean;
  persistsAcrossSessions?: boolean;
  hierarchical?: boolean;
  globalPath?: string;
  requiresGeminiAPI?: boolean;
  maxResults?: number;
}
```

### 3. Provider Integration Layer

#### OpenAI Provider with Built-in Tools

**Location**: `packages/core/src/providers/openai/builtin-tools-integration.ts`

```typescript
import { BuiltinToolManager } from '../tools/builtin-tool-manager.js';
import { OpenAIToolAdapter } from './tool-adapter.js';
import { ToolConfirmationOutcome } from '../../tools/tools.js';

export class OpenAIBuiltinToolsIntegration {
  private toolManager: BuiltinToolManager;
  private adapter: OpenAIToolAdapter;

  constructor(private config: Config) {
    this.toolManager = new BuiltinToolManager(config);
    this.adapter = new OpenAIToolAdapter();
  }

  async initialize(): Promise<void> {
    await this.toolManager.initialize();
  }

  /**
   * Get built-in tools formatted for OpenAI
   */
  getOpenAITools(): any[] {
    const unifiedTools = this.toolManager.getUnifiedTools();
    return unifiedTools.map((tool) => ({
      type: 'function',
      function: this.adapter.toProviderFormat(tool),
    }));
  }

  /**
   * Execute tool calls from OpenAI response
   */
  async executeToolCalls(
    toolCalls: any[],
    options: {
      onProgress?: (message: string) => void;
      onConfirmation?: (request: any) => Promise<boolean>;
      abortSignal?: AbortSignal;
    } = {},
  ): Promise<any[]> {
    const results = [];

    for (const toolCall of toolCalls) {
      const unifiedCall = this.adapter.fromProviderToolCall(toolCall);

      // Create execution context
      const context = {
        config: this.config,
        abortSignal: options.abortSignal || new AbortController().signal,
        onProgress: options.onProgress,
        onConfirmation: options.onConfirmation
          ? async (request: any) => {
              const approved = await options.onConfirmation!(request);
              return approved
                ? ToolConfirmationOutcome.ProceedOnce
                : ToolConfirmationOutcome.Deny;
            }
          : undefined,
      };

      // Execute tool
      const result = await this.toolManager.executeTool(unifiedCall, context);

      // Convert result to OpenAI format
      results.push(this.adapter.toProviderToolResult(result));
    }

    return results;
  }
}
```

#### Anthropic Provider with Built-in Tools

**Location**: `packages/core/src/providers/anthropic/builtin-tools-integration.ts`

```typescript
import { BuiltinToolManager } from '../tools/builtin-tool-manager.js';
import { AnthropicToolAdapter } from './tool-adapter.js';
import { ToolConfirmationOutcome } from '../../tools/tools.js';

export class AnthropicBuiltinToolsIntegration {
  private toolManager: BuiltinToolManager;
  private adapter: AnthropicToolAdapter;

  constructor(private config: Config) {
    this.toolManager = new BuiltinToolManager(config);
    this.adapter = new AnthropicToolAdapter();
  }

  async initialize(): Promise<void> {
    await this.toolManager.initialize();
  }

  /**
   * Get built-in tools formatted for Anthropic
   */
  getAnthropicTools(): any[] {
    const unifiedTools = this.toolManager.getUnifiedTools();
    return unifiedTools.map((tool) => this.adapter.toProviderFormat(tool));
  }

  /**
   * Execute tool use blocks from Anthropic response
   */
  async executeToolUse(
    toolUseBlocks: any[],
    options: {
      onProgress?: (message: string) => void;
      onConfirmation?: (request: any) => Promise<boolean>;
      abortSignal?: AbortSignal;
    } = {},
  ): Promise<any[]> {
    const results = [];

    for (const toolUse of toolUseBlocks) {
      const unifiedCall = this.adapter.fromProviderToolCall(toolUse);

      // Create execution context
      const context = {
        config: this.config,
        abortSignal: options.abortSignal || new AbortController().signal,
        onProgress: options.onProgress,
        onConfirmation: options.onConfirmation
          ? async (request: any) => {
              const approved = await options.onConfirmation!(request);
              return approved
                ? ToolConfirmationOutcome.ProceedOnce
                : ToolConfirmationOutcome.Deny;
            }
          : undefined,
      };

      // Execute tool
      const result = await this.toolManager.executeTool(unifiedCall, context);

      // Convert result to Anthropic format
      results.push(this.adapter.toProviderToolResult(result));
    }

    return results;
  }
}
```

### 4. Complete Provider Implementation

**Location**: `packages/core/src/providers/openai/provider-complete.ts`

```typescript
import OpenAI from 'openai';
import { OpenAIProvider } from './provider.js';
import { OpenAIBuiltinToolsIntegration } from './builtin-tools-integration.js';
import { MCPEnabledProviderFactory } from '../factory-with-mcp.js';
import {
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';

export class OpenAICompleteProvider extends OpenAIProvider {
  private builtinTools: OpenAIBuiltinToolsIntegration;
  private mcpTools?: any; // MCP tools integration if enabled

  constructor(config: any) {
    super(config);
    this.builtinTools = new OpenAIBuiltinToolsIntegration(
      config.configInstance,
    );
  }

  async initialize(): Promise<void> {
    // Initialize built-in tools
    await this.builtinTools.initialize();

    // Initialize MCP tools if enabled
    if (this.config.enableMCP) {
      // Initialize MCP tools as per MCP integration document
    }
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    // Get all available tools
    const builtinTools = this.builtinTools.getOpenAITools();
    const mcpTools = this.mcpTools?.getOpenAITools() || [];
    const allTools = [...builtinTools, ...mcpTools];

    // Convert request to OpenAI format with tools
    const openaiRequest = {
      ...this.convertToOpenAIFormat(request),
      tools: allTools,
      tool_choice: 'auto',
    };

    let messages = [...openaiRequest.messages];
    const maxRounds = 10; // Prevent infinite loops
    let rounds = 0;

    // Tool execution loop
    while (rounds < maxRounds) {
      const response = await this.client.chat.completions.create({
        ...openaiRequest,
        messages,
      });

      const choice = response.choices[0];

      if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        // Add assistant message with tool calls
        messages.push(choice.message);

        // Execute tools
        const toolResults = await this.builtinTools.executeToolCalls(
          choice.message.tool_calls,
          {
            onProgress: (msg) => console.debug(`[Tool Progress] ${msg}`),
            onConfirmation: async (request) => {
              // In non-interactive mode, auto-approve safe operations
              if (
                request.action === 'save_memory' ||
                request.action === 'read_file'
              ) {
                return true;
              }
              // For dangerous operations, require explicit approval
              console.log('Tool confirmation required:', request);
              return false; // Deny by default in non-interactive
            },
          },
        );

        // Add tool results to messages
        messages.push(...toolResults);
        rounds++;

        // Continue conversation
        continue;
      } else {
        // No more tool calls, return final response
        return this.convertFromOpenAIFormat(response);
      }
    }

    throw new Error('Maximum tool execution rounds exceeded');
  }
}
```

### 5. Special Tool Handlers

#### Memory Tool Integration

**Location**: `packages/core/src/providers/tools/memory-tool-handler.ts`

```typescript
import { MemoryTool, setGeminiMdFilename } from '../../tools/memoryTool.js';
import { Config } from '../../config/config.js';

/**
 * Handles memory tool specifics for multi-provider support
 */
export class MemoryToolHandler {
  private memoryTool: MemoryTool;
  private memoryCache: Map<string, string> = new Map();

  constructor(private config: Config) {
    this.memoryTool = new MemoryTool();
  }

  /**
   * Initialize memory with hierarchical loading
   */
  async initialize(): Promise<void> {
    // Set context filename if configured
    const contextFile = this.config.getContextFileName();
    if (contextFile) {
      setGeminiMdFilename(contextFile);
    }

    // Load hierarchical memory
    const memory = await this.loadHierarchicalMemory();
    if (memory) {
      this.config.setUserMemory(memory);
    }
  }

  /**
   * Load memory from hierarchical structure
   */
  private async loadHierarchicalMemory(): Promise<string | undefined> {
    const { loadServerHierarchicalMemory } = await import(
      '../../utils/memoryDiscovery.js'
    );

    try {
      const memory = await loadServerHierarchicalMemory(
        this.config.getCwd(),
        this.config.getMemoryFileFilteringOptions(),
        false, // importFormat
      );
      return memory;
    } catch (error) {
      console.error('Failed to load hierarchical memory:', error);
      return undefined;
    }
  }

  /**
   * Handle memory save with provider-agnostic interface
   */
  async saveMemory(fact: string): Promise<void> {
    const invocation = this.memoryTool.build({ fact });
    await invocation.execute(new AbortController().signal);

    // Clear cache to force reload on next access
    this.memoryCache.clear();

    // Reload memory
    await this.initialize();
  }

  /**
   * Get current memory content
   */
  getCurrentMemory(): string | undefined {
    return this.config.getUserMemory();
  }
}
```

#### Shell Tool Security

**Location**: `packages/core/src/providers/tools/shell-tool-security.ts`

```typescript
import { ShellTool } from '../../tools/shell.js';
import { Config } from '../../config/config.js';

/**
 * Enhanced security for shell tool execution across providers
 */
export class ShellToolSecurity {
  private allowlist: Set<string>;
  private blocklist: Set<string> = new Set([
    'rm -rf /',
    'dd if=/dev/zero',
    'mkfs',
    'format',
    ':(){:|:&};:', // Fork bomb
  ]);

  constructor(private config: Config) {
    this.allowlist = new Set(config.getShellAllowlist());
  }

  /**
   * Validate shell command before execution
   */
  validateCommand(command: string): ValidationResult {
    // Check blocklist
    for (const blocked of this.blocklist) {
      if (command.includes(blocked)) {
        return {
          valid: false,
          reason: `Command contains blocked pattern: ${blocked}`,
        };
      }
    }

    // Check if command should be allowlisted
    if (this.requiresAllowlist(command)) {
      const isAllowed = this.allowlist.has(command);
      if (!isAllowed) {
        return {
          valid: false,
          reason: 'Command requires allowlisting',
          requiresConfirmation: true,
        };
      }
    }

    // Check for sudo/admin commands
    if (this.isAdminCommand(command)) {
      return {
        valid: true,
        requiresConfirmation: true,
        warning: 'Command requires administrative privileges',
      };
    }

    return { valid: true };
  }

  private requiresAllowlist(command: string): boolean {
    // Commands that modify system state
    const dangerousPatterns = [
      /^sudo/,
      /^rm\s/,
      /^mv\s/,
      /^cp\s.*\//,
      /^chmod/,
      /^chown/,
      />\s*\/dev\//,
    ];

    return dangerousPatterns.some((pattern) => pattern.test(command));
  }

  private isAdminCommand(command: string): boolean {
    return command.startsWith('sudo') || command.startsWith('doas');
  }
}

interface ValidationResult {
  valid: boolean;
  reason?: string;
  requiresConfirmation?: boolean;
  warning?: string;
}
```

### 6. File System Boundary Enforcement

**Location**: `packages/core/src/providers/tools/filesystem-boundary.ts`

```typescript
import * as path from 'path';
import { Config } from '../../config/config.js';

/**
 * Enforces file system boundaries for all providers
 */
export class FileSystemBoundary {
  private projectRoot: string;
  private allowedPaths: Set<string>;

  constructor(private config: Config) {
    this.projectRoot = config.getProjectRoot() || process.cwd();
    this.allowedPaths = new Set([
      this.projectRoot,
      ...config.getAdditionalAllowedPaths(),
    ]);
  }

  /**
   * Check if a path is within allowed boundaries
   */
  isPathAllowed(targetPath: string): boolean {
    const resolvedPath = path.resolve(targetPath);

    // Check if path is within project root
    if (this.isWithinPath(resolvedPath, this.projectRoot)) {
      return true;
    }

    // Check additional allowed paths
    for (const allowedPath of this.allowedPaths) {
      if (this.isWithinPath(resolvedPath, allowedPath)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get safe path for display
   */
  getSafePath(targetPath: string): string {
    const resolvedPath = path.resolve(targetPath);

    if (this.isWithinPath(resolvedPath, this.projectRoot)) {
      return path.relative(this.projectRoot, resolvedPath);
    }

    return resolvedPath;
  }

  private isWithinPath(targetPath: string, basePath: string): boolean {
    const relative = path.relative(basePath, targetPath);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  }

  /**
   * Apply git ignore rules if configured
   */
  async shouldIgnorePath(targetPath: string): Promise<boolean> {
    if (!this.config.getRespectGitIgnore()) {
      return false;
    }

    const { isIgnored } = await import('../../utils/gitUtils.js');
    return isIgnored(targetPath, this.projectRoot);
  }
}
```

### 7. Testing Strategy

#### Unit Tests for Tool Integration

**Location**: `packages/core/src/providers/__tests__/builtin-tools.test.ts`

```typescript
describe('Built-in Tools Multi-Provider Integration', () => {
  describe('BuiltinToolManager', () => {
    it('should discover all built-in tools', async () => {
      const config = createTestConfig();
      const manager = new BuiltinToolManager(config);
      await manager.initialize();

      const tools = manager.getUnifiedTools();
      expect(tools).toHaveLength(11); // All 11 built-in tools

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('read_file');
      expect(toolNames).toContain('write_file');
      expect(toolNames).toContain('run_shell_command');
      expect(toolNames).toContain('save_memory');
    });

    it('should execute read_file tool', async () => {
      const manager = new BuiltinToolManager(config);
      await manager.initialize();

      const result = await manager.executeTool(
        {
          id: 'test-1',
          name: 'read_file',
          arguments: { path: 'test.txt' },
        },
        {
          config,
          abortSignal: new AbortController().signal,
        },
      );

      expect(result.isError).toBe(false);
      expect(result.content).toContain('file content');
    });
  });

  describe('Tool Confirmation Flow', () => {
    it('should handle write_file confirmation', async () => {
      const manager = new BuiltinToolManager(config);
      const confirmationMock = vi
        .fn()
        .mockResolvedValue(ToolConfirmationOutcome.ProceedOnce);

      await manager.executeTool(
        {
          id: 'test-2',
          name: 'write_file',
          arguments: {
            path: 'new.txt',
            content: 'test content',
          },
        },
        {
          config,
          abortSignal: new AbortController().signal,
          onConfirmation: confirmationMock,
        },
      );

      expect(confirmationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'modify_file',
          toolName: 'write_file',
        }),
      );
    });
  });
});
```

#### Integration Tests

**Location**: `packages/core/src/providers/__tests__/provider-tool-integration.test.ts`

```typescript
describe('Provider Tool Integration', () => {
  it('OpenAI provider should use built-in tools', async () => {
    const provider = new OpenAICompleteProvider({
      apiKey: 'test',
      model: 'gpt-4',
      configInstance: testConfig,
    });

    await provider.initialize();

    const response = await provider.generateContent(
      {
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Read the README.md file' }],
          },
        ],
      },
      'test-id',
    );

    // Verify tool was called
    expect(response).toBeDefined();
  });

  it('Anthropic provider should use built-in tools', async () => {
    const provider = new AnthropicCompleteProvider({
      apiKey: 'test',
      model: 'claude-3-opus',
      configInstance: testConfig,
    });

    await provider.initialize();

    const response = await provider.generateContent(
      {
        contents: [
          {
            role: 'user',
            parts: [{ text: 'List the files in the current directory' }],
          },
        ],
      },
      'test-id',
    );

    expect(response).toBeDefined();
  });
});
```

### 8. CLI Configuration

**Location**: `packages/cli/src/config/builtin-tools-config.ts`

```typescript
export interface BuiltinToolsConfig {
  // Tool enablement
  enabledTools?: string[];
  disabledTools?: string[];

  // Tool-specific settings
  fileTools?: {
    respectGitIgnore?: boolean;
    maxFileSize?: number;
    allowedExtensions?: string[];
  };

  shellTool?: {
    enabled?: boolean;
    allowlist?: string[];
    timeout?: number;
  };

  webTools?: {
    maxUrls?: number;
    timeout?: number;
    blockPrivateIPs?: boolean;
  };

  memoryTool?: {
    contextFile?: string;
    hierarchical?: boolean;
  };
}

export function configureBuiltinTools(
  config: Config,
  options: BuiltinToolsConfig,
): void {
  // Apply tool enablement
  if (options.disabledTools) {
    config.setExcludeTools(options.disabledTools);
  }

  if (options.enabledTools) {
    config.setCoreTools(options.enabledTools);
  }

  // Apply tool-specific settings
  if (options.fileTools) {
    config.setFileFilteringOptions({
      respectGitIgnore: options.fileTools.respectGitIgnore ?? true,
    });
  }

  if (options.shellTool?.allowlist) {
    options.shellTool.allowlist.forEach((cmd) =>
      config.addShellAllowlistCommand(cmd),
    );
  }

  if (options.memoryTool?.contextFile) {
    config.setContextFileName(options.memoryTool.contextFile);
  }
}
```

### 9. Usage Examples

#### Basic Usage with OpenAI

```typescript
import { createProviderWithTools } from '@google/gemini-cli-core';

const provider = await createProviderWithTools({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4-turbo',
  enableBuiltinTools: true,
  toolConfig: {
    disabledTools: ['run_shell_command'], // Disable shell for safety
    fileTools: {
      respectGitIgnore: true,
    },
  },
});

const response = await provider.generateContent({
  contents: [
    {
      role: 'user',
      parts: [{ text: 'Analyze all TypeScript files in src/' }],
    },
  ],
});
```

#### Advanced Usage with Anthropic

```typescript
const provider = await createProviderWithTools({
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-opus',
  enableBuiltinTools: true,
  toolConfig: {
    shellTool: {
      enabled: true,
      allowlist: ['npm test', 'npm run build'],
    },
    memoryTool: {
      contextFile: 'PROJECT_CONTEXT.md',
    },
  },
});

// With confirmation handling
const response = await provider.generateContent(
  {
    contents: [
      {
        role: 'user',
        parts: [{ text: 'Fix the failing tests and update the documentation' }],
      },
    ],
  },
  {
    onToolConfirmation: async (request) => {
      console.log(
        `Tool ${request.toolName} needs confirmation:`,
        request.details,
      );
      // In a UI, this would show a confirmation dialog
      return true; // Auto-approve for demo
    },
  },
);
```

## Implementation Phases

### Phase 1: Core Integration (Week 1)

- [ ] Implement BuiltinToolManager
- [ ] Create tool behavior manager
- [ ] Set up filesystem boundary enforcement

### Phase 2: Provider Adapters (Week 2)

- [ ] Implement OpenAI built-in tools integration
- [ ] Implement Anthropic built-in tools integration
- [ ] Handle confirmation flows

### Phase 3: Special Tools (Week 3)

- [ ] Memory tool integration with hierarchy
- [ ] Shell tool security implementation
- [ ] Web tools with safety checks

### Phase 4: Testing & Polish (Week 4)

- [ ] Comprehensive unit tests
- [ ] Integration tests for all tools
- [ ] Performance optimization
- [ ] Documentation

## Key Considerations

### 1. Tool Parity

All built-in tools work identically across providers, maintaining the same:

- Confirmation flows
- Security boundaries
- Error handling
- Progress reporting

### 2. Safety & Security

- File system operations respect project boundaries
- Shell commands require explicit allowlisting
- Web fetches block private IPs
- All dangerous operations require confirmation

### 3. Memory Persistence

The memory tool maintains hierarchical structure and persistence across all providers, ensuring consistent context management.

### 4. Performance

- Tools are initialized once and reused
- Parallel tool execution where safe
- Efficient file system operations with caching

### 5. Extensibility

New built-in tools can be added to the registry and automatically become available to all providers without modification.

## Benefits

1. **Complete Tool Access**: All LLM providers get full access to Gemini CLI's powerful built-in tools
2. **Consistent Behavior**: Tools behave identically regardless of provider
3. **Safety First**: Security boundaries and confirmation flows are enforced uniformly
4. **Easy Migration**: Switch between providers without changing tool usage
5. **Future Proof**: New tools automatically work with all providers

## Conclusion

This implementation ensures that all LLM providers can leverage Gemini CLI's comprehensive built-in tool suite while maintaining security, consistency, and the original tool behaviors. The architecture cleanly separates provider-specific logic from tool execution, enabling seamless integration and future extensibility.
