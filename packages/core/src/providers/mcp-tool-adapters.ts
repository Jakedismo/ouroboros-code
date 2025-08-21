/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  UnifiedTool,
  UnifiedToolCall,
  UnifiedToolResult,
  LLMProvider,
} from './types.js';
import {
  UnifiedMCPInterface,
  MCPToolExecutionContext,
  UnifiedMCPToolResult,
  MCPToolMetadata,
} from './unified-mcp-interface.js';
import { Config } from '../config/config.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { DiscoveredMCPTool } from '../tools/mcp-tool.js';

/**
 * MCP Tool Adapter for integrating MCP tools with multi-provider architecture
 * This bridges MCP tools with the BuiltinToolManager for cross-provider compatibility
 */
export class MCPToolAdapter {
  private unifiedMCPInterface: UnifiedMCPInterface;
  private toolRegistry: ToolRegistry;

  // Provider-specific tool name prefixes to avoid conflicts
  private readonly providerPrefixes = {
    [LLMProvider.OPENAI]: 'openai_mcp_',
    [LLMProvider.ANTHROPIC]: 'anthropic_mcp_',
    [LLMProvider.GEMINI]: '', // Gemini uses original names
  };

  constructor(config: Config, toolRegistry: ToolRegistry) {
    this.toolRegistry = toolRegistry;
    this.unifiedMCPInterface = new UnifiedMCPInterface(config, toolRegistry);
  }

  /**
   * Get MCP tools formatted for a specific provider
   */
  getMCPToolsForProvider(provider: LLMProvider): UnifiedTool[] {
    const mcpTools = this.unifiedMCPInterface.getUnifiedMCPTools();
    const prefix = this.providerPrefixes[provider];

    // Add provider-specific prefixes to avoid naming conflicts
    return mcpTools.map((tool) => ({
      ...tool,
      name: prefix + tool.name,
    }));
  }

  /**
   * Execute MCP tool call from any provider
   */
  async executeMCPToolCall(
    toolCall: UnifiedToolCall,
    provider: LLMProvider,
    context: {
      userPromptId: string;
      sessionId: string;
    },
    abortSignal?: AbortSignal,
  ): Promise<UnifiedToolResult> {
    // Remove provider prefix from tool name
    const prefix = this.providerPrefixes[provider];
    const originalToolName = toolCall.name.startsWith(prefix)
      ? toolCall.name.substring(prefix.length)
      : toolCall.name;

    // Parse server name and tool name from the original name
    const [serverName, toolName] =
      this.parseFullyQualifiedToolName(originalToolName);

    if (!serverName || !toolName) {
      throw new Error(`Invalid MCP tool name format: ${originalToolName}`);
    }

    // Create MCP execution context
    const mcpContext: MCPToolExecutionContext = {
      provider,
      serverName,
      toolName,
      userPromptId: context.userPromptId,
      sessionId: context.sessionId,
      parameters: toolCall.arguments,
      abortSignal,
    };

    // Execute the MCP tool
    const mcpResult =
      await this.unifiedMCPInterface.executeMCPToolCall(mcpContext);

    // Convert to unified tool result format
    return this.convertMCPResultToUnified(mcpResult, toolCall.id);
  }

  /**
   * Check if a tool name is an MCP tool
   */
  isMCPTool(toolName: string, provider: LLMProvider): boolean {
    const prefix = this.providerPrefixes[provider];

    if (prefix && toolName.startsWith(prefix)) {
      const originalName = toolName.substring(prefix.length);
      return this.isValidMCPToolName(originalName);
    }

    // For Gemini (no prefix), check if it matches MCP naming pattern
    return provider === LLMProvider.GEMINI && this.isValidMCPToolName(toolName);
  }

  /**
   * Get MCP tool metadata
   */
  getMCPToolMetadata(toolName: string, provider: LLMProvider): MCPToolMetadata {
    const prefix = this.providerPrefixes[provider];
    const originalToolName = toolName.startsWith(prefix)
      ? toolName.substring(prefix.length)
      : toolName;

    const [serverName, mcpToolName] =
      this.parseFullyQualifiedToolName(originalToolName);

    if (!serverName || !mcpToolName) {
      throw new Error(`Invalid MCP tool name format: ${originalToolName}`);
    }

    return this.unifiedMCPInterface.getMCPToolMetadata(serverName, mcpToolName);
  }

  /**
   * Get all available MCP tools across providers
   */
  getAllMCPTools(): {
    [provider in LLMProvider]: UnifiedTool[];
  } {
    return {
      [LLMProvider.GEMINI]: this.getMCPToolsForProvider(LLMProvider.GEMINI),
      [LLMProvider.OPENAI]: this.getMCPToolsForProvider(LLMProvider.OPENAI),
      [LLMProvider.ANTHROPIC]: this.getMCPToolsForProvider(
        LLMProvider.ANTHROPIC,
      ),
    };
  }

  /**
   * Convert provider-specific tool calls to MCP-compatible format
   */
  adaptToolCallsFromProvider(
    toolCalls: any[],
    provider: LLMProvider,
  ): UnifiedToolCall[] {
    switch (provider) {
      case LLMProvider.OPENAI:
        return this.adaptOpenAIMCPToolCalls(toolCalls);
      case LLMProvider.ANTHROPIC:
        return this.adaptAnthropicMCPToolCalls(toolCalls);
      case LLMProvider.GEMINI:
        return this.adaptGeminiMCPToolCalls(toolCalls);
      default:
        throw new Error(`Unsupported provider for MCP tools: ${provider}`);
    }
  }

  /**
   * Convert unified tool results to provider-specific format
   */
  formatMCPResultsForProvider(
    results: UnifiedToolResult[],
    provider: LLMProvider,
  ): any[] {
    switch (provider) {
      case LLMProvider.OPENAI:
        return results.map((result) => this.formatResultForOpenAI(result));
      case LLMProvider.ANTHROPIC:
        return results.map((result) => this.formatResultForAnthropic(result));
      case LLMProvider.GEMINI:
        return results; // Gemini uses the standard format
      default:
        throw new Error(`Unsupported provider for MCP results: ${provider}`);
    }
  }

  /**
   * Parse fully qualified tool name (server.tool) into components
   */
  private parseFullyQualifiedToolName(toolName: string): [string, string] {
    // Handle both "server.tool" and "server__tool" formats
    if (toolName.includes('.')) {
      const parts = toolName.split('.');
      return [parts[0], parts.slice(1).join('.')];
    } else if (toolName.includes('__')) {
      const parts = toolName.split('__');
      return [parts[0], parts.slice(1).join('__')];
    } else {
      // Single tool name - try to find the server
      const mcpTools = this.toolRegistry
        .getAllTools()
        .filter((tool) => tool instanceof DiscoveredMCPTool)
        .map((tool) => tool as DiscoveredMCPTool);

      const matchingTool = mcpTools.find(
        (tool) => tool.serverToolName === toolName || tool.name === toolName,
      );

      if (matchingTool) {
        return [matchingTool.serverName, matchingTool.serverToolName];
      }
    }

    return ['', ''];
  }

  /**
   * Check if a tool name follows MCP naming patterns
   */
  private isValidMCPToolName(toolName: string): boolean {
    // Check if it contains server.tool pattern or exists in MCP registry
    if (toolName.includes('.') || toolName.includes('__')) {
      return true;
    }

    const mcpTools = this.toolRegistry
      .getAllTools()
      .filter((tool) => tool instanceof DiscoveredMCPTool);

    return mcpTools.some(
      (tool) =>
        (tool as DiscoveredMCPTool).serverToolName === toolName ||
        tool.name === toolName,
    );
  }

  /**
   * Convert MCP result to unified tool result
   */
  private convertMCPResultToUnified(
    mcpResult: UnifiedMCPToolResult,
    toolCallId: string,
  ): UnifiedToolResult {
    return {
      toolCallId,
      content: mcpResult.content,
      isError: mcpResult.isError,
      success: !mcpResult.isError,
      error: mcpResult.error,
      display: mcpResult.display,
    };
  }

  /**
   * Adapt OpenAI MCP tool calls
   */
  private adaptOpenAIMCPToolCalls(toolCalls: any[]): UnifiedToolCall[] {
    return toolCalls
      .filter(
        (call) =>
          call.type === 'function' &&
          this.isMCPTool(call.function?.name || '', LLMProvider.OPENAI),
      )
      .map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: JSON.parse(call.function.arguments || '{}'),
      }));
  }

  /**
   * Adapt Anthropic MCP tool calls
   */
  private adaptAnthropicMCPToolCalls(toolCalls: any[]): UnifiedToolCall[] {
    return toolCalls
      .filter(
        (call) =>
          call.type === 'tool_use' &&
          this.isMCPTool(call.name || '', LLMProvider.ANTHROPIC),
      )
      .map((call) => ({
        id: call.id,
        name: call.name,
        arguments: call.input || {},
      }));
  }

  /**
   * Adapt Gemini MCP tool calls
   */
  private adaptGeminiMCPToolCalls(toolCalls: any[]): UnifiedToolCall[] {
    return toolCalls
      .filter((call) => this.isMCPTool(call.name || '', LLMProvider.GEMINI))
      .map((call) => ({
        id: `gemini_mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: call.name,
        arguments: call.args || {},
      }));
  }

  /**
   * Format result for OpenAI
   */
  private formatResultForOpenAI(result: UnifiedToolResult): any {
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
   * Format result for Anthropic
   */
  private formatResultForAnthropic(result: UnifiedToolResult): any {
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
   * Get MCP tool statistics
   */
  getMCPToolStatistics() {
    return this.unifiedMCPInterface.getMCPToolStatistics();
  }

  /**
   * Restart MCP servers
   */
  async restartMCPServers(): Promise<void> {
    await this.unifiedMCPInterface.restartMCPServers();
  }

  /**
   * Discover MCP tools
   */
  async discoverMCPTools(): Promise<void> {
    await this.unifiedMCPInterface.discoverMCPTools();
  }

  /**
   * Get the unified MCP interface
   */
  getUnifiedMCPInterface(): UnifiedMCPInterface {
    return this.unifiedMCPInterface;
  }
}

/**
 * OpenAI-specific MCP integration helper
 */
export class OpenAIMCPIntegration {
  constructor(private mcpAdapter: MCPToolAdapter) {}

  /**
   * Format MCP tools for OpenAI API request
   */
  formatMCPToolsForOpenAI(): any[] {
    return this.mcpAdapter
      .getMCPToolsForProvider(LLMProvider.OPENAI)
      .map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
  }

  /**
   * Execute OpenAI MCP tool calls
   */
  async executeOpenAIMCPTools(
    toolCalls: any[],
    context: { userPromptId: string; sessionId: string },
    abortSignal?: AbortSignal,
  ): Promise<any[]> {
    const results = [];

    for (const toolCall of toolCalls) {
      if (
        toolCall.type === 'function' &&
        this.mcpAdapter.isMCPTool(toolCall.function.name, LLMProvider.OPENAI)
      ) {
        const unifiedCall: UnifiedToolCall = {
          id: toolCall.id,
          name: toolCall.function.name,
          arguments: JSON.parse(toolCall.function.arguments || '{}'),
        };

        const result = await this.mcpAdapter.executeMCPToolCall(
          unifiedCall,
          LLMProvider.OPENAI,
          context,
          abortSignal,
        );

        results.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          content:
            typeof result.content === 'string'
              ? result.content
              : JSON.stringify(result.content),
        });
      }
    }

    return results;
  }
}

/**
 * Anthropic-specific MCP integration helper
 */
export class AnthropicMCPIntegration {
  constructor(private mcpAdapter: MCPToolAdapter) {}

  /**
   * Format MCP tools for Anthropic API request
   */
  formatMCPToolsForAnthropic(): any[] {
    return this.mcpAdapter
      .getMCPToolsForProvider(LLMProvider.ANTHROPIC)
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
      }));
  }

  /**
   * Execute Anthropic MCP tool calls
   */
  async executeAnthropicMCPTools(
    toolUses: any[],
    context: { userPromptId: string; sessionId: string },
    abortSignal?: AbortSignal,
  ): Promise<any[]> {
    const results = [];

    for (const toolUse of toolUses) {
      if (
        toolUse.type === 'tool_use' &&
        this.mcpAdapter.isMCPTool(toolUse.name, LLMProvider.ANTHROPIC)
      ) {
        const unifiedCall: UnifiedToolCall = {
          id: toolUse.id,
          name: toolUse.name,
          arguments: toolUse.input || {},
        };

        const result = await this.mcpAdapter.executeMCPToolCall(
          unifiedCall,
          LLMProvider.ANTHROPIC,
          context,
          abortSignal,
        );

        results.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content:
            typeof result.content === 'string'
              ? result.content
              : JSON.stringify(result.content),
          is_error: result.isError || false,
        });
      }
    }

    return results;
  }
}

/**
 * Factory for creating provider-specific MCP integrations
 */
export class MCPIntegrationFactory {
  static create(
    provider: LLMProvider,
    config: Config,
    toolRegistry: ToolRegistry,
  ) {
    const mcpAdapter = new MCPToolAdapter(config, toolRegistry);

    switch (provider) {
      case LLMProvider.OPENAI:
        return new OpenAIMCPIntegration(mcpAdapter);
      case LLMProvider.ANTHROPIC:
        return new AnthropicMCPIntegration(mcpAdapter);
      case LLMProvider.GEMINI:
        return mcpAdapter; // Gemini uses the base adapter
      default:
        throw new Error(
          `Unsupported provider for MCP integration: ${provider}`,
        );
    }
  }
}
