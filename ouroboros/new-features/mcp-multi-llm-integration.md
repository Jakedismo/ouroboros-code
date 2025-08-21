# MCP Tools Integration for Multi-LLM Providers

## Executive Summary

This document extends the Multi-LLM Extension Plan to detail how OpenAI and Anthropic providers will seamlessly integrate with MCP (Model Context Protocol) tools. The implementation ensures that all LLM providers can discover, declare, and execute MCP tools while maintaining format compatibility and upstream synchronization.

## Architecture Overview

### Integration Layers

```ascii
┌─────────────────────────────────────────┐
│         User Request with MCP Tools     │
└─────────────┬───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│       Unified Tool Orchestrator         │
│   (Provider-agnostic tool handling)     │
└─────────────┬───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│       Provider-Specific Adapters        │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐   │
│  │ Gemini  │ │ OpenAI  │ │Anthropic │   │
│  │ Adapter │ │ Adapter │ │ Adapter  │   │
│  └─────────┘ └─────────┘ └──────────┘   │
└─────────────┬───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│          MCP Client & Tools             │
│     (Shared across all providers)       │
└─────────────────────────────────────────┘
```

## Implementation Details

### 1. Unified Tool Interface

**Location**: `packages/core/src/providers/tools/unified-tool-interface.ts`

```typescript
import { FunctionDeclaration, Tool as GeminiTool } from '@google/genai';
import { CallableTool } from '@google/genai';

/**
 * Unified tool representation that can be converted to any provider format
 */
export interface UnifiedTool {
  name: string;
  description: string;
  parameters: UnifiedToolParameters;
  required?: string[];
}

export interface UnifiedToolParameters {
  type: 'object';
  properties: Record<string, UnifiedParameterSchema>;
  required?: string[];
}

export interface UnifiedParameterSchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: any[];
  items?: UnifiedParameterSchema;
  properties?: Record<string, UnifiedParameterSchema>;
  default?: any;
}

export interface UnifiedToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface UnifiedToolResult {
  toolCallId: string;
  content: string | object;
  error?: string;
  isError?: boolean;
}

/**
 * Abstract base for tool format converters
 */
export abstract class ToolFormatConverter {
  abstract toProviderFormat(tool: UnifiedTool): any;
  abstract fromProviderToolCall(toolCall: any): UnifiedToolCall;
  abstract toProviderToolResult(result: UnifiedToolResult): any;

  /**
   * Convert MCP/Gemini FunctionDeclaration to UnifiedTool
   */
  fromFunctionDeclaration(decl: FunctionDeclaration): UnifiedTool {
    return {
      name: decl.name,
      description: decl.description || '',
      parameters: this.convertGeminiSchema(decl.parameters as any),
    };
  }

  private convertGeminiSchema(schema: any): UnifiedToolParameters {
    return {
      type: 'object',
      properties: schema.properties || {},
      required: schema.required || [],
    };
  }
}
```

### 2. OpenAI Tool Adapter

**Location**: `packages/core/src/providers/openai/tool-adapter.ts`

```typescript
import {
  ToolFormatConverter,
  UnifiedTool,
  UnifiedToolCall,
  UnifiedToolResult,
} from '../tools/unified-tool-interface.js';

interface OpenAIFunction {
  name: string;
  description?: string;
  parameters: Record<string, any>;
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export class OpenAIToolAdapter extends ToolFormatConverter {
  /**
   * Convert UnifiedTool to OpenAI function format
   */
  toProviderFormat(tool: UnifiedTool): OpenAIFunction {
    return {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: tool.parameters.properties,
        required: tool.parameters.required || [],
      },
    };
  }

  /**
   * Convert OpenAI tool call to unified format
   */
  fromProviderToolCall(toolCall: OpenAIToolCall): UnifiedToolCall {
    return {
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: JSON.parse(toolCall.function.arguments),
    };
  }

  /**
   * Convert unified result to OpenAI format
   */
  toProviderToolResult(result: UnifiedToolResult): any {
    return {
      tool_call_id: result.toolCallId,
      role: 'tool',
      content:
        typeof result.content === 'string'
          ? result.content
          : JSON.stringify(result.content),
    };
  }

  /**
   * Format tools for OpenAI completion request
   */
  formatToolsForRequest(tools: UnifiedTool[]): {
    tools: any[];
    tool_choice?: string;
  } {
    return {
      tools: tools.map((tool) => ({
        type: 'function',
        function: this.toProviderFormat(tool),
      })),
      tool_choice: 'auto', // Can be 'auto', 'none', or specific tool
    };
  }
}
```

### 3. Anthropic Tool Adapter

**Location**: `packages/core/src/providers/anthropic/tool-adapter.ts`

```typescript
import {
  ToolFormatConverter,
  UnifiedTool,
  UnifiedToolCall,
  UnifiedToolResult,
} from '../tools/unified-tool-interface.js';

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

interface AnthropicToolUse {
  id: string;
  type: 'tool_use';
  name: string;
  input: Record<string, any>;
}

export class AnthropicToolAdapter extends ToolFormatConverter {
  /**
   * Convert UnifiedTool to Anthropic tool format
   */
  toProviderFormat(tool: UnifiedTool): AnthropicTool {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object',
        properties: tool.parameters.properties,
        required: tool.parameters.required,
      },
    };
  }

  /**
   * Convert Anthropic tool use to unified format
   */
  fromProviderToolCall(toolUse: AnthropicToolUse): UnifiedToolCall {
    return {
      id: toolUse.id,
      name: toolUse.name,
      arguments: toolUse.input,
    };
  }

  /**
   * Convert unified result to Anthropic format
   */
  toProviderToolResult(result: UnifiedToolResult): any {
    return {
      type: 'tool_result',
      tool_use_id: result.toolCallId,
      content:
        typeof result.content === 'string'
          ? result.content
          : JSON.stringify(result.content),
      is_error: result.isError || false,
    };
  }

  /**
   * Format tools for Anthropic message request
   */
  formatToolsForRequest(tools: UnifiedTool[]): { tools: AnthropicTool[] } {
    return {
      tools: tools.map((tool) => this.toProviderFormat(tool)),
    };
  }
}
```

### 4. MCP Tool Manager

**Location**: `packages/core/src/providers/tools/mcp-tool-manager.ts`

```typescript
import { DiscoveredMCPTool } from '../../tools/mcp-tool.js';
import { ToolRegistry } from '../../tools/tool-registry.js';
import { Config } from '../../config/config.js';
import {
  UnifiedTool,
  UnifiedToolCall,
  UnifiedToolResult,
} from './unified-tool-interface.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { FunctionDeclaration } from '@google/genai';

export class MCPToolManager {
  private toolRegistry: ToolRegistry;
  private mcpTools: Map<string, DiscoveredMCPTool> = new Map();
  private mcpClients: Map<string, Client> = new Map();

  constructor(private config: Config) {
    this.toolRegistry = config.getToolRegistry();
  }

  /**
   * Initialize MCP connections and discover tools
   */
  async initialize(): Promise<void> {
    // Connect to MCP servers
    const mcpServers = this.config.getMcpServers();
    for (const [serverName, serverConfig] of Object.entries(mcpServers)) {
      try {
        const client = await this.connectToMcpServer(serverConfig);
        this.mcpClients.set(serverName, client);

        // Discover tools from this server
        const tools = await this.discoverToolsFromServer(serverName, client);
        tools.forEach((tool) => {
          this.mcpTools.set(tool.name, tool);
        });
      } catch (error) {
        console.error(`Failed to connect to MCP server ${serverName}:`, error);
      }
    }
  }

  /**
   * Get all available MCP tools as unified tools
   */
  getUnifiedTools(): UnifiedTool[] {
    const unifiedTools: UnifiedTool[] = [];

    // Convert MCP tools to unified format
    for (const mcpTool of this.mcpTools.values()) {
      const declaration = mcpTool.declaration();
      unifiedTools.push(this.convertMCPToUnified(declaration));
    }

    // Also include native Gemini CLI tools
    const nativeTools = this.toolRegistry.getTools();
    for (const tool of nativeTools.values()) {
      if (!(tool instanceof DiscoveredMCPTool)) {
        const declaration = tool.declaration();
        unifiedTools.push(this.convertMCPToUnified(declaration));
      }
    }

    return unifiedTools;
  }

  /**
   * Execute a tool call regardless of provider
   */
  async executeTool(
    toolCall: UnifiedToolCall,
    abortSignal?: AbortSignal,
  ): Promise<UnifiedToolResult> {
    const tool =
      this.mcpTools.get(toolCall.name) ||
      this.toolRegistry.getTool(toolCall.name);

    if (!tool) {
      return {
        toolCallId: toolCall.id,
        content: `Tool ${toolCall.name} not found`,
        isError: true,
      };
    }

    try {
      // Build and execute the tool invocation
      const invocation = tool.build(toolCall.arguments);
      const result = await invocation.execute(
        abortSignal || new AbortController().signal,
      );

      return {
        toolCallId: toolCall.id,
        content: result.llmContent,
        isError: false,
      };
    } catch (error: any) {
      return {
        toolCallId: toolCall.id,
        content: `Error executing tool: ${error.message}`,
        isError: true,
      };
    }
  }

  /**
   * Handle tool confirmation flow
   */
  async confirmToolExecution(
    toolCall: UnifiedToolCall,
    confirmationCallback: (details: any) => Promise<boolean>,
  ): Promise<boolean> {
    const tool =
      this.mcpTools.get(toolCall.name) ||
      this.toolRegistry.getTool(toolCall.name);

    if (!tool) {
      return false;
    }

    const invocation = tool.build(toolCall.arguments);
    const confirmationDetails = await invocation.shouldConfirm(
      this.config,
      new AbortController().signal,
    );

    if (confirmationDetails) {
      return await confirmationCallback(confirmationDetails);
    }

    return true; // No confirmation needed
  }

  private convertMCPToUnified(declaration: FunctionDeclaration): UnifiedTool {
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

  private async connectToMcpServer(config: any): Promise<Client> {
    // Use existing MCP connection logic
    const { connectToMcpServer } = await import('../../tools/mcp-client.js');
    return connectToMcpServer(config);
  }

  private async discoverToolsFromServer(
    serverName: string,
    client: Client,
  ): Promise<DiscoveredMCPTool[]> {
    // Use existing tool discovery logic
    const { discoverTools } = await import('../../tools/mcp-client.js');
    return discoverTools(serverName, client, this.config);
  }
}
```

### 5. Enhanced Provider Implementations

#### OpenAI Provider with MCP Tools

**Location**: `packages/core/src/providers/openai/provider-with-tools.ts`

```typescript
import OpenAI from 'openai';
import { OpenAIProvider } from './provider.js';
import { OpenAIToolAdapter } from './tool-adapter.js';
import { MCPToolManager } from '../tools/mcp-tool-manager.js';
import {
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';

export class OpenAIProviderWithMCP extends OpenAIProvider {
  private toolAdapter: OpenAIToolAdapter;
  private mcpManager: MCPToolManager;

  constructor(config: any) {
    super(config);
    this.toolAdapter = new OpenAIToolAdapter();
    this.mcpManager = new MCPToolManager(config.configInstance);
  }

  async initialize(): Promise<void> {
    await this.mcpManager.initialize();
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    // Get available tools
    const unifiedTools = this.mcpManager.getUnifiedTools();
    const { tools, tool_choice } =
      this.toolAdapter.formatToolsForRequest(unifiedTools);

    // Convert request to OpenAI format with tools
    const openaiRequest = {
      ...this.convertToOpenAIFormat(request),
      tools,
      tool_choice,
    };

    let messages = [...openaiRequest.messages];
    let toolCallsToExecute: any[] = [];

    // Tool execution loop
    while (true) {
      const response = await this.client.chat.completions.create({
        ...openaiRequest,
        messages,
      });

      const choice = response.choices[0];

      // Check if the model wants to call tools
      if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        // Add assistant message with tool calls
        messages.push(choice.message);

        // Execute each tool call
        for (const toolCall of choice.message.tool_calls) {
          const unifiedCall = this.toolAdapter.fromProviderToolCall(toolCall);

          // Check if confirmation is needed
          const needsConfirmation = await this.mcpManager.confirmToolExecution(
            unifiedCall,
            async (details) => {
              // Handle confirmation UI
              console.log('Tool confirmation needed:', details);
              return true; // Auto-approve for now
            },
          );

          if (!needsConfirmation) {
            continue;
          }

          // Execute the tool
          const result = await this.mcpManager.executeTool(unifiedCall);

          // Add tool result to messages
          const toolMessage = this.toolAdapter.toProviderToolResult(result);
          messages.push(toolMessage);
        }

        // Continue the conversation with tool results
        continue;
      } else {
        // No more tool calls, return the final response
        return this.convertFromOpenAIFormat(response);
      }
    }
  }

  async *generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): AsyncIterable<GenerateContentResponse> {
    // Get available tools
    const unifiedTools = this.mcpManager.getUnifiedTools();
    const { tools, tool_choice } =
      this.toolAdapter.formatToolsForRequest(unifiedTools);

    // Convert request with tools
    const openaiRequest = {
      ...this.convertToOpenAIFormat(request),
      tools,
      tool_choice,
      stream: true,
    };

    const stream = await this.client.chat.completions.create(openaiRequest);

    let accumulatedToolCalls: any[] = [];

    for await (const chunk of stream) {
      // Accumulate tool calls from stream
      if (chunk.choices[0]?.delta?.tool_calls) {
        // Handle streaming tool calls
        for (const toolCall of chunk.choices[0].delta.tool_calls) {
          // Accumulate tool call data
          if (!accumulatedToolCalls[toolCall.index]) {
            accumulatedToolCalls[toolCall.index] = {
              id: '',
              type: 'function',
              function: { name: '', arguments: '' },
            };
          }

          if (toolCall.id) {
            accumulatedToolCalls[toolCall.index].id = toolCall.id;
          }
          if (toolCall.function?.name) {
            accumulatedToolCalls[toolCall.index].function.name =
              toolCall.function.name;
          }
          if (toolCall.function?.arguments) {
            accumulatedToolCalls[toolCall.index].function.arguments +=
              toolCall.function.arguments;
          }
        }
      }

      // Yield intermediate response
      yield this.convertStreamChunkFromOpenAI(chunk);
    }

    // Execute accumulated tool calls if any
    if (accumulatedToolCalls.length > 0) {
      for (const toolCall of accumulatedToolCalls) {
        const unifiedCall = this.toolAdapter.fromProviderToolCall(toolCall);
        const result = await this.mcpManager.executeTool(unifiedCall);

        // Yield tool result as response
        yield this.createToolResultResponse(result);
      }
    }
  }
}
```

#### Anthropic Provider with MCP Tools

**Location**: `packages/core/src/providers/anthropic/provider-with-tools.ts`

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicProvider } from './provider.js';
import { AnthropicToolAdapter } from './tool-adapter.js';
import { MCPToolManager } from '../tools/mcp-tool-manager.js';
import {
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';

export class AnthropicProviderWithMCP extends AnthropicProvider {
  private toolAdapter: AnthropicToolAdapter;
  private mcpManager: MCPToolManager;

  constructor(config: any) {
    super(config);
    this.toolAdapter = new AnthropicToolAdapter();
    this.mcpManager = new MCPToolManager(config.configInstance);
  }

  async initialize(): Promise<void> {
    await this.mcpManager.initialize();
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    // Get available tools
    const unifiedTools = this.mcpManager.getUnifiedTools();
    const { tools } = this.toolAdapter.formatToolsForRequest(unifiedTools);

    // Convert request to Anthropic format with tools
    const anthropicRequest = {
      ...this.convertToAnthropicFormat(request),
      tools,
      max_tokens: 4096,
    };

    // Tool execution loop
    while (true) {
      const response = await this.client.messages.create(anthropicRequest);

      // Check for tool use in response
      const toolUseBlocks = response.content.filter(
        (block) => block.type === 'tool_use',
      );

      if (toolUseBlocks.length > 0) {
        // Execute each tool
        const toolResults = [];

        for (const toolUse of toolUseBlocks) {
          const unifiedCall = this.toolAdapter.fromProviderToolCall(toolUse);

          // Confirmation check
          const needsConfirmation = await this.mcpManager.confirmToolExecution(
            unifiedCall,
            async (details) => {
              console.log('Tool confirmation needed:', details);
              return true; // Auto-approve
            },
          );

          if (!needsConfirmation) {
            continue;
          }

          // Execute tool
          const result = await this.mcpManager.executeTool(unifiedCall);
          toolResults.push(this.toolAdapter.toProviderToolResult(result));
        }

        // Add tool results to conversation
        anthropicRequest.messages.push({
          role: 'assistant',
          content: response.content,
        });

        anthropicRequest.messages.push({
          role: 'user',
          content: toolResults,
        });

        // Continue conversation
        continue;
      } else {
        // No tool use, return final response
        return this.convertFromAnthropicFormat(response);
      }
    }
  }

  async *generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): AsyncIterable<GenerateContentResponse> {
    // Get available tools
    const unifiedTools = this.mcpManager.getUnifiedTools();
    const { tools } = this.toolAdapter.formatToolsForRequest(unifiedTools);

    const anthropicRequest = {
      ...this.convertToAnthropicFormat(request),
      tools,
      stream: true,
    };

    const stream = await this.client.messages.create(anthropicRequest);

    let currentToolUse: any = null;

    for await (const event of stream) {
      if (
        event.type === 'content_block_start' &&
        event.content_block.type === 'tool_use'
      ) {
        currentToolUse = {
          id: event.content_block.id,
          name: event.content_block.name,
          input: '',
        };
      } else if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'tool_use'
      ) {
        if (currentToolUse) {
          currentToolUse.input += event.delta.partial_json;
        }
      } else if (event.type === 'content_block_stop' && currentToolUse) {
        // Execute the completed tool
        currentToolUse.input = JSON.parse(currentToolUse.input);
        const unifiedCall =
          this.toolAdapter.fromProviderToolCall(currentToolUse);
        const result = await this.mcpManager.executeTool(unifiedCall);

        // Yield tool result
        yield this.createToolResultResponse(result);

        currentToolUse = null;
      }

      // Yield text content
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield this.convertStreamEventFromAnthropic(event);
      }
    }
  }
}
```

### 6. Tool Execution Flow

**Location**: `packages/core/src/providers/tools/tool-execution-flow.ts`

```typescript
import { Config } from '../../config/config.js';
import {
  UnifiedToolCall,
  UnifiedToolResult,
} from './unified-tool-interface.js';
import { ToolConfirmationOutcome } from '../../tools/tools.js';

export interface ToolExecutionContext {
  config: Config;
  abortSignal: AbortSignal;
  onProgress?: (message: string) => void;
  onConfirmation?: (details: any) => Promise<ToolConfirmationOutcome>;
}

export class ToolExecutionOrchestrator {
  constructor(
    private mcpManager: MCPToolManager,
    private context: ToolExecutionContext,
  ) {}

  /**
   * Execute multiple tool calls in parallel with proper error handling
   */
  async executeToolCalls(
    toolCalls: UnifiedToolCall[],
  ): Promise<UnifiedToolResult[]> {
    const results = await Promise.all(
      toolCalls.map((call) => this.executeToolCall(call)),
    );
    return results;
  }

  /**
   * Execute a single tool call with confirmation and progress handling
   */
  private async executeToolCall(
    toolCall: UnifiedToolCall,
  ): Promise<UnifiedToolResult> {
    try {
      // Log tool execution start
      if (this.context.onProgress) {
        this.context.onProgress(`Executing tool: ${toolCall.name}`);
      }

      // Check for confirmation
      const needsConfirmation = await this.mcpManager.confirmToolExecution(
        toolCall,
        this.context.onConfirmation ||
          (async () => ToolConfirmationOutcome.ProceedOnce),
      );

      if (!needsConfirmation) {
        return {
          toolCallId: toolCall.id,
          content: 'Tool execution cancelled by user',
          isError: true,
        };
      }

      // Execute the tool
      const result = await this.mcpManager.executeTool(
        toolCall,
        this.context.abortSignal,
      );

      // Log completion
      if (this.context.onProgress) {
        this.context.onProgress(`Tool ${toolCall.name} completed`);
      }

      return result;
    } catch (error: any) {
      console.error(`Tool execution error for ${toolCall.name}:`, error);
      return {
        toolCallId: toolCall.id,
        content: `Tool execution failed: ${error.message}`,
        isError: true,
      };
    }
  }
}
```

### 7. Configuration Extension for Multi-Provider MCP

**Location**: `packages/core/src/config/multi-provider-mcp-config.ts`

```typescript
export interface MultiProviderMCPConfig {
  // MCP server configurations remain the same
  mcpServers: Record<string, MCPServerConfig>;

  // Provider-specific tool settings
  toolSettings: {
    openai?: {
      parallelToolCalls?: boolean;
      maxToolRounds?: number;
      toolChoice?: 'auto' | 'none' | 'required';
    };
    anthropic?: {
      maxToolUseBlocks?: number;
      toolUseTimeout?: number;
    };
    gemini?: {
      // Existing Gemini settings
    };
  };

  // Shared tool execution settings
  toolExecution: {
    confirmationMode: 'always' | 'never' | 'smart';
    parallelExecution: boolean;
    maxConcurrentTools: number;
    timeoutMs: number;
  };
}

export const DEFAULT_MULTI_PROVIDER_MCP_CONFIG: MultiProviderMCPConfig = {
  mcpServers: {},
  toolSettings: {
    openai: {
      parallelToolCalls: true,
      maxToolRounds: 10,
      toolChoice: 'auto',
    },
    anthropic: {
      maxToolUseBlocks: 20,
      toolUseTimeout: 30000,
    },
  },
  toolExecution: {
    confirmationMode: 'smart',
    parallelExecution: true,
    maxConcurrentTools: 5,
    timeoutMs: 60000,
  },
};
```

### 8. Factory Pattern Update

**Location**: `packages/core/src/providers/factory-with-mcp.ts`

```typescript
import { LLMProviderFactory } from './factory.js';
import { OpenAIProviderWithMCP } from './openai/provider-with-tools.js';
import { AnthropicProviderWithMCP } from './anthropic/provider-with-tools.js';
import { GeminiProvider } from './gemini/provider.js';
import { ContentGenerator } from '../core/contentGenerator.js';
import { LLMProvider, LLMProviderConfig } from './types.js';

export class MCPEnabledProviderFactory extends LLMProviderFactory {
  static async create(
    config: LLMProviderConfig,
    enableMCP: boolean = true,
  ): Promise<ContentGenerator> {
    if (!enableMCP) {
      return super.create(config);
    }

    let provider: ContentGenerator;

    switch (config.provider) {
      case LLMProvider.GEMINI:
        // Gemini already has MCP support
        provider = new GeminiProvider(config);
        break;

      case LLMProvider.OPENAI:
        provider = new OpenAIProviderWithMCP(config);
        await (provider as OpenAIProviderWithMCP).initialize();
        break;

      case LLMProvider.ANTHROPIC:
        provider = new AnthropicProviderWithMCP(config);
        await (provider as AnthropicProviderWithMCP).initialize();
        break;

      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }

    return provider;
  }
}
```

### 9. Testing Strategy

#### Unit Tests for Tool Adapters

**Location**: `packages/core/src/providers/__tests__/tool-adapters.test.ts`

```typescript
describe('Tool Format Adapters', () => {
  describe('OpenAIToolAdapter', () => {
    it('should convert UnifiedTool to OpenAI format', () => {
      const unifiedTool: UnifiedTool = {
        name: 'search',
        description: 'Search the web',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
          },
          required: ['query'],
        },
      };

      const adapter = new OpenAIToolAdapter();
      const openaiTool = adapter.toProviderFormat(unifiedTool);

      expect(openaiTool.name).toBe('search');
      expect(openaiTool.parameters.properties.query).toBeDefined();
    });

    it('should handle tool call conversion', () => {
      const openaiCall = {
        id: 'call_123',
        type: 'function',
        function: {
          name: 'search',
          arguments: '{"query": "test"}',
        },
      };

      const adapter = new OpenAIToolAdapter();
      const unifiedCall = adapter.fromProviderToolCall(openaiCall);

      expect(unifiedCall.id).toBe('call_123');
      expect(unifiedCall.name).toBe('search');
      expect(unifiedCall.arguments.query).toBe('test');
    });
  });

  describe('AnthropicToolAdapter', () => {
    // Similar tests for Anthropic adapter
  });
});
```

#### Integration Tests

**Location**: `packages/core/src/providers/__tests__/mcp-integration.test.ts`

```typescript
describe('Multi-Provider MCP Integration', () => {
  it('should execute MCP tools with OpenAI provider', async () => {
    const config = createTestConfig();
    const provider = await MCPEnabledProviderFactory.create(
      {
        provider: LLMProvider.OPENAI,
        apiKey: 'test-key',
        model: 'gpt-4',
      },
      true,
    );

    const response = await provider.generateContent(
      {
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Search for TypeScript tutorials' }],
          },
        ],
      },
      'test-prompt-id',
    );

    // Verify tool was called
    expect(response).toBeDefined();
    // Additional assertions
  });

  it('should handle tool confirmation flow', async () => {
    // Test confirmation handling across providers
  });

  it('should execute multiple tools in parallel', async () => {
    // Test parallel tool execution
  });
});
```

### 10. CLI Integration

**Location**: `packages/cli/src/config/mcp-provider-config.ts`

```typescript
export function configureMCPForProvider(
  config: Config,
  provider: string,
): void {
  // Set provider-specific MCP settings
  switch (provider) {
    case 'openai':
      config.setToolSettings({
        parallelToolCalls: true,
        toolChoice: 'auto',
      });
      break;

    case 'anthropic':
      config.setToolSettings({
        maxToolUseBlocks: 20,
      });
      break;

    default:
      // Use default settings
      break;
  }
}

// CLI usage
// gemini --provider openai --enable-mcp "Analyze this repository with MCP tools"
```

### 11. Error Handling and Recovery

**Location**: `packages/core/src/providers/tools/error-handling.ts`

```typescript
export class ToolExecutionError extends Error {
  constructor(
    message: string,
    public toolName: string,
    public providerId: string,
    public originalError?: Error,
  ) {
    super(message);
    this.name = 'ToolExecutionError';
  }
}

export class ToolConversionError extends Error {
  constructor(
    message: string,
    public sourceFormat: string,
    public targetFormat: string,
  ) {
    super(message);
    this.name = 'ToolConversionError';
  }
}

export class MCPConnectionError extends Error {
  constructor(
    message: string,
    public serverName: string,
  ) {
    super(message);
    this.name = 'MCPConnectionError';
  }
}

export function handleToolError(
  error: Error,
  context: { provider: string; tool?: string },
): UnifiedToolResult {
  console.error(`Tool error in ${context.provider}:`, error);

  if (error instanceof ToolExecutionError) {
    return {
      toolCallId: 'error',
      content: `Tool ${error.toolName} failed: ${error.message}`,
      isError: true,
    };
  }

  return {
    toolCallId: 'error',
    content: `Unexpected error: ${error.message}`,
    isError: true,
  };
}
```

## Implementation Phases

### Phase 1: Foundation (Week 1)

- [ ] Implement unified tool interface
- [ ] Create base tool format converter
- [ ] Set up MCP tool manager

### Phase 2: OpenAI Integration (Week 2)

- [ ] Implement OpenAI tool adapter
- [ ] Create OpenAI provider with MCP support
- [ ] Test tool execution flow

### Phase 3: Anthropic Integration (Week 3)

- [ ] Implement Anthropic tool adapter
- [ ] Create Anthropic provider with MCP support
- [ ] Test tool execution flow

### Phase 4: Testing & Polish (Week 4)

- [ ] Comprehensive integration tests
- [ ] Error handling improvements
- [ ] Performance optimization
- [ ] Documentation

## Key Challenges & Solutions

### Challenge 1: Tool Declaration Format Differences

**Solution**: Unified tool interface with provider-specific adapters

### Challenge 2: Streaming Tool Calls

**Solution**: Accumulate tool calls during streaming, execute after completion

### Challenge 3: Tool Confirmation Flow

**Solution**: Centralized confirmation handling in MCPToolManager

### Challenge 4: Parallel Tool Execution

**Solution**: ToolExecutionOrchestrator with configurable concurrency

### Challenge 5: Error Recovery

**Solution**: Graceful degradation with detailed error reporting

## Benefits

1. **Unified Experience**: All providers can use MCP tools seamlessly
2. **Format Agnostic**: Tools work regardless of LLM provider
3. **Maintainable**: Clean separation between providers and tools
4. **Extensible**: Easy to add new providers or tool formats
5. **Robust**: Comprehensive error handling and recovery

## Conclusion

This implementation ensures that MCP tools work seamlessly across all LLM providers while maintaining clean separation of concerns and upstream compatibility. The unified tool interface acts as a bridge between different provider formats, while the MCP tool manager handles the complexity of tool discovery, execution, and confirmation flows.
