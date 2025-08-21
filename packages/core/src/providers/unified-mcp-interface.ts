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
import { DiscoveredMCPTool } from '../tools/mcp-tool.js';
import { McpClientManager } from '../tools/mcp-client-manager.js';
import { Config } from '../config/config.js';
import { ToolRegistry } from '../tools/tool-registry.js';

/**
 * Security levels specific to MCP tools
 */
export enum MCPToolSecurityLevel {
  SAFE = 'safe', // Read-only MCP operations
  MODERATE = 'moderate', // MCP operations that may modify data
  DANGEROUS = 'dangerous', // MCP operations with system-level access
}

/**
 * Metadata for MCP tools across providers
 */
export interface MCPToolMetadata {
  serverName: string;
  toolName: string;
  displayName: string;
  description: string;
  securityLevel: MCPToolSecurityLevel;
  requiresConfirmation: boolean;
  trusted: boolean;
  timeout?: number;
  supportedProviders: LLMProvider[];
  capabilities: MCPToolCapability[];
}

export interface MCPToolCapability {
  name: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high';
}

/**
 * Context for MCP tool execution across providers
 */
export interface MCPToolExecutionContext {
  provider: LLMProvider;
  serverName: string;
  toolName: string;
  userPromptId: string;
  sessionId: string;
  parameters: Record<string, any>;
  abortSignal?: AbortSignal;
}

/**
 * Result from MCP tool execution
 */
export interface UnifiedMCPToolResult extends UnifiedToolResult {
  serverName: string;
  toolName: string;
  executionTime?: number;
  contentBlocks?: MCPContentBlock[];
}

/**
 * MCP Content Block types for unified handling
 */
export interface MCPContentBlock {
  type: 'text' | 'image' | 'audio' | 'resource' | 'resource_link';
  content: any;
  mimeType?: string;
}

/**
 * Unified MCP Tool Interface for cross-provider compatibility
 * This ensures MCP tools work consistently across all LLM providers
 */
export class UnifiedMCPInterface {
  private mcpClientManager: McpClientManager;
  private toolRegistry: ToolRegistry;

  // Cache for tool metadata to avoid repeated lookups
  private toolMetadataCache = new Map<string, MCPToolMetadata>();

  // Provider-specific MCP tool adapters
  private providerAdapters = new Map<LLMProvider, MCPProviderAdapter>();

  constructor(_config: Config, toolRegistry: ToolRegistry) {
    this.toolRegistry = toolRegistry;
    this.mcpClientManager = new McpClientManager(
      _config.getMcpServers() ?? {},
      _config.getMcpServerCommand(),
      toolRegistry,
      _config.getPromptRegistry(),
      _config.getDebugMode(),
      _config.getWorkspaceContext(),
    );

    // Initialize provider adapters
    this.initializeProviderAdapters();
  }

  /**
   * Initialize provider-specific MCP adapters
   */
  private initializeProviderAdapters(): void {
    this.providerAdapters.set(LLMProvider.GEMINI, new GeminiMCPAdapter());
    this.providerAdapters.set(LLMProvider.OPENAI, new OpenAIMCPAdapter());
    this.providerAdapters.set(LLMProvider.ANTHROPIC, new AnthropicMCPAdapter());
  }

  /**
   * Get all available MCP tools in unified format
   */
  getUnifiedMCPTools(): UnifiedTool[] {
    const mcpTools = this.toolRegistry
      .getAllTools()
      .filter((tool) => tool instanceof DiscoveredMCPTool)
      .map((tool) => tool as DiscoveredMCPTool);

    return mcpTools.map((tool) => this.convertMCPToolToUnified(tool));
  }

  /**
   * Get MCP tools formatted for a specific provider
   */
  getToolsForProvider(provider: LLMProvider): any[] {
    const unifiedTools = this.getUnifiedMCPTools();
    const adapter = this.providerAdapters.get(provider);

    if (!adapter) {
      throw new Error(`No MCP adapter found for provider: ${provider}`);
    }

    return adapter.formatToolsForRequest(unifiedTools);
  }

  /**
   * Execute MCP tool calls across providers
   */
  async executeMCPToolCall(
    context: MCPToolExecutionContext,
  ): Promise<UnifiedMCPToolResult> {
    const startTime = Date.now();
    const toolKey = `${context.serverName}.${context.toolName}`;

    // Get the MCP tool from registry
    const mcpTool = this.toolRegistry
      .getAllTools()
      .find(
        (tool) =>
          tool instanceof DiscoveredMCPTool &&
          tool.serverName === context.serverName &&
          tool.serverToolName === context.toolName,
      ) as DiscoveredMCPTool;

    if (!mcpTool) {
      throw new Error(`MCP tool not found: ${toolKey}`);
    }

    // Process confirmation if required
    await this.processMCPToolConfirmation(context, mcpTool);

    // Execute the tool
    // TODO: Fix createInvocation access - method is protected
    // const invocation = mcpTool.createInvocation(context.parameters);
    const invocation = (mcpTool as any).createInvocation(context.parameters);
    const result = await invocation.execute(
      context.abortSignal || new AbortController().signal,
    );

    // Convert to unified MCP result
    const unifiedResult: UnifiedMCPToolResult = {
      toolCallId: `mcp_${context.serverName}_${context.toolName}_${Date.now()}`,
      content: result.llmContent || '',
      serverName: context.serverName,
      toolName: context.toolName,
      executionTime: Date.now() - startTime,
      isError: !!result.error,
      success: !result.error,
      error: result.error ? { message: result.error.message, type: 'execution' } : undefined,
      display: result.returnDisplay,
    };

    return unifiedResult;
  }

  /**
   * Process MCP tool confirmation using unified confirmation system
   */
  private async processMCPToolConfirmation(
    context: MCPToolExecutionContext,
    mcpTool: DiscoveredMCPTool,
  ): Promise<void> {
    // TODO: Implement MCP confirmation logic
    // Currently commenting out until proper confirmation interface is established
    
    // Check if confirmation is required using the tool's own logic
    // const invocation = mcpTool.createInvocation(context.parameters);
    // const confirmationDetails = await invocation.shouldConfirmExecute(
    //   context.abortSignal || new AbortController().signal,
    // );

    // TODO: Implement MCP confirmation handling when proper interfaces are available
    // if (confirmationDetails && confirmationDetails.type === 'mcp') {
    //   // Use the existing MCP confirmation system
    //   const outcome = await new Promise<ToolConfirmationOutcome>((resolve) => {
    //     // This would typically be handled by the UI layer
    //     // For now, we default to proceed for trusted tools
    //     if (mcpTool.trust) {
    //       resolve(ToolConfirmationOutcome.ProceedOnce);
    //     } else {
    //       resolve(ToolConfirmationOutcome.Cancel);
    //     }
    //   });

    //   if (confirmationDetails.onConfirm) {
    //     await confirmationDetails.onConfirm(outcome);
    //   }

    //   if (outcome === ToolConfirmationOutcome.Cancel) {
    //     throw new Error('MCP tool execution was cancelled by user');
    //   }
    // }
  }

  /**
   * Convert DiscoveredMCPTool to UnifiedTool format
   */
  private convertMCPToolToUnified(mcpTool: DiscoveredMCPTool): UnifiedTool {
    return {
      name: mcpTool.name,
      description: mcpTool.description,
      parameters: {
        type: 'object',
        properties: this.convertParameterSchema(mcpTool.parameterSchema),
        required: this.extractRequiredParameters(mcpTool.parameterSchema),
      },
    };
  }

  /**
   * Convert MCP parameter schema to unified format
   */
  private convertParameterSchema(schema: any): Record<string, any> {
    if (!schema || typeof schema !== 'object') {
      return {};
    }

    if (schema.properties) {
      return schema.properties;
    }

    return schema;
  }

  /**
   * Extract required parameters from MCP schema
   */
  private extractRequiredParameters(schema: any): string[] {
    if (!schema || typeof schema !== 'object') {
      return [];
    }

    return schema.required || [];
  }

  /**
   * Get MCP tool metadata with caching
   */
  getMCPToolMetadata(serverName: string, toolName: string): MCPToolMetadata {
    const key = `${serverName}.${toolName}`;

    if (this.toolMetadataCache.has(key)) {
      return this.toolMetadataCache.get(key)!;
    }

    const mcpTool = this.toolRegistry
      .getAllTools()
      .find(
        (tool) =>
          tool instanceof DiscoveredMCPTool &&
          tool.serverName === serverName &&
          tool.serverToolName === toolName,
      ) as DiscoveredMCPTool;

    if (!mcpTool) {
      throw new Error(`MCP tool not found: ${key}`);
    }

    const metadata: MCPToolMetadata = {
      serverName,
      toolName,
      displayName: mcpTool.displayName,
      description: mcpTool.description,
      securityLevel: this.assessMCPToolSecurityLevel(mcpTool),
      requiresConfirmation: !mcpTool.trust,
      trusted: mcpTool.trust || false,
      timeout: mcpTool.timeout,
      supportedProviders: [
        LLMProvider.GEMINI,
        LLMProvider.OPENAI,
        LLMProvider.ANTHROPIC,
      ],
      capabilities: this.analyzeMCPToolCapabilities(mcpTool),
    };

    this.toolMetadataCache.set(key, metadata);
    return metadata;
  }

  /**
   * Assess security level of MCP tool based on its characteristics
   */
  private assessMCPToolSecurityLevel(
    mcpTool: DiscoveredMCPTool,
  ): MCPToolSecurityLevel {
    const toolName = mcpTool.serverToolName.toLowerCase();
    const description = mcpTool.description.toLowerCase();

    // Dangerous patterns
    const dangerousPatterns = [
      'execute',
      'run',
      'shell',
      'command',
      'system',
      'kill',
      'delete',
      'remove',
      'write',
      'create',
      'modify',
      'update',
      'install',
      'uninstall',
    ];

    // Safe patterns
    const safePatterns = [
      'read',
      'get',
      'fetch',
      'list',
      'search',
      'find',
      'query',
      'show',
      'display',
    ];

    if (
      dangerousPatterns.some(
        (pattern) =>
          toolName.includes(pattern) || description.includes(pattern),
      )
    ) {
      return MCPToolSecurityLevel.DANGEROUS;
    }

    if (
      safePatterns.some(
        (pattern) =>
          toolName.includes(pattern) || description.includes(pattern),
      )
    ) {
      return MCPToolSecurityLevel.SAFE;
    }

    return MCPToolSecurityLevel.MODERATE;
  }

  /**
   * Analyze MCP tool capabilities
   */
  private analyzeMCPToolCapabilities(
    mcpTool: DiscoveredMCPTool,
  ): MCPToolCapability[] {
    const capabilities: MCPToolCapability[] = [];
    const toolName = mcpTool.serverToolName.toLowerCase();
    const description = mcpTool.description.toLowerCase();

    // Analyze based on tool name and description
    if (toolName.includes('read') || description.includes('read')) {
      capabilities.push({
        name: 'data_reading',
        description: 'Can read data from external sources',
        riskLevel: 'low',
      });
    }

    if (
      toolName.includes('write') ||
      description.includes('write') ||
      toolName.includes('create') ||
      description.includes('create')
    ) {
      capabilities.push({
        name: 'data_modification',
        description: 'Can modify or create data',
        riskLevel: 'medium',
      });
    }

    if (
      toolName.includes('execute') ||
      toolName.includes('run') ||
      toolName.includes('shell') ||
      toolName.includes('command')
    ) {
      capabilities.push({
        name: 'command_execution',
        description: 'Can execute system commands',
        riskLevel: 'high',
      });
    }

    if (
      toolName.includes('network') ||
      toolName.includes('http') ||
      toolName.includes('api') ||
      description.includes('network')
    ) {
      capabilities.push({
        name: 'network_access',
        description: 'Can make network requests',
        riskLevel: 'medium',
      });
    }

    return capabilities;
  }

  /**
   * Get tool statistics for MCP tools
   */
  getMCPToolStatistics(): {
    totalMCPTools: number;
    byServer: Record<string, number>;
    bySecurityLevel: Record<MCPToolSecurityLevel, number>;
    trusted: number;
    requiresConfirmation: number;
  } {
    const mcpTools = this.toolRegistry
      .getAllTools()
      .filter((tool) => tool instanceof DiscoveredMCPTool)
      .map((tool) => tool as DiscoveredMCPTool);

    const byServer: Record<string, number> = {};
    const bySecurityLevel: Record<MCPToolSecurityLevel, number> = {
      [MCPToolSecurityLevel.SAFE]: 0,
      [MCPToolSecurityLevel.MODERATE]: 0,
      [MCPToolSecurityLevel.DANGEROUS]: 0,
    };

    let trusted = 0;
    let requiresConfirmation = 0;

    mcpTools.forEach((tool) => {
      // Count by server
      byServer[tool.serverName] = (byServer[tool.serverName] || 0) + 1;

      // Count by security level
      const securityLevel = this.assessMCPToolSecurityLevel(tool);
      bySecurityLevel[securityLevel]++;

      // Count trust and confirmation requirements
      if (tool.trust) trusted++;
      if (!tool.trust) requiresConfirmation++;
    });

    return {
      totalMCPTools: mcpTools.length,
      byServer,
      bySecurityLevel,
      trusted,
      requiresConfirmation,
    };
  }

  /**
   * Restart MCP servers
   */
  async restartMCPServers(): Promise<void> {
    await this.toolRegistry.restartMcpServers();
    this.toolMetadataCache.clear(); // Clear cache after restart
  }

  /**
   * Discover MCP tools
   */
  async discoverMCPTools(): Promise<void> {
    await this.toolRegistry.discoverMcpTools();
    this.toolMetadataCache.clear(); // Clear cache after discovery
  }

  /**
   * Get the MCP client manager
   */
  getMCPClientManager(): McpClientManager {
    return this.mcpClientManager;
  }
}

/**
 * Abstract base class for provider-specific MCP adapters
 */
export abstract class MCPProviderAdapter {
  abstract formatToolsForRequest(tools: UnifiedTool[]): any[];
  abstract convertToolCallFromProvider(toolCall: any): UnifiedToolCall;
  abstract convertToolResultToProvider(result: UnifiedMCPToolResult): any;
}

/**
 * Gemini MCP Adapter - handles Gemini-specific MCP tool formatting
 */
export class GeminiMCPAdapter extends MCPProviderAdapter {
  formatToolsForRequest(tools: UnifiedTool[]): any[] {
    // Gemini uses FunctionDeclaration format
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parametersJsonSchema: tool.parameters,
    }));
  }

  convertToolCallFromProvider(toolCall: any): UnifiedToolCall {
    return {
      id: `gemini_mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: toolCall.name,
      arguments: toolCall.args || {},
    };
  }

  convertToolResultToProvider(result: UnifiedMCPToolResult): any {
    return {
      functionResponse: {
        name: `${result.serverName}.${result.toolName}`,
        response: {
          content: result.content,
          executionTime: result.executionTime,
        },
      },
    };
  }
}

/**
 * OpenAI MCP Adapter - handles OpenAI-specific MCP tool formatting
 */
export class OpenAIMCPAdapter extends MCPProviderAdapter {
  formatToolsForRequest(tools: UnifiedTool[]): any[] {
    return tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  convertToolCallFromProvider(toolCall: any): UnifiedToolCall {
    return {
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: JSON.parse(toolCall.function.arguments || '{}'),
    };
  }

  convertToolResultToProvider(result: UnifiedMCPToolResult): any {
    return {
      tool_call_id: result.toolCallId,
      role: 'tool',
      content:
        typeof result.content === 'string'
          ? result.content
          : JSON.stringify(result.content),
    };
  }
}

/**
 * Anthropic MCP Adapter - handles Anthropic-specific MCP tool formatting
 */
export class AnthropicMCPAdapter extends MCPProviderAdapter {
  formatToolsForRequest(tools: UnifiedTool[]): any[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  }

  convertToolCallFromProvider(toolCall: any): UnifiedToolCall {
    return {
      id: toolCall.id,
      name: toolCall.name,
      arguments: toolCall.input || {},
    };
  }

  convertToolResultToProvider(result: UnifiedMCPToolResult): any {
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
}
