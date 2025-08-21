/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FunctionDeclaration, FunctionCall } from '@google/genai';
import {
  UnifiedTool,
  UnifiedToolCall,
  UnifiedToolResult,
  LLMProvider,
} from './types.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { OpenAIToolAdapter } from './openai/tool-adapter.js';
import { AnthropicToolAdapter } from './anthropic/tool-adapter.js';
import { Config } from '../config/config.js';
import { ApprovalMode } from '../config/config.js';
import {
  UnifiedConfirmationManager,
  ProviderConfirmationContext,
  ConfirmationResult,
} from './unified-confirmation-manager.js';
import { ToolConfirmationOutcome } from '../tools/tools.js';
import {
  MCPToolAdapter,
} from './mcp-tool-adapters.js';

export interface ToolExecutionContext {
  provider: LLMProvider;
  userPromptId: string;
  sessionId: string;
  requiresConfirmation?: (toolCall: UnifiedToolCall) => Promise<boolean>;
  onToolUse?: (toolCall: UnifiedToolCall) => void;
  onToolResult?: (result: UnifiedToolResult) => void;
  onConfirmationRequired?: (
    context: ProviderConfirmationContext,
    abortSignal: AbortSignal,
  ) => Promise<ConfirmationResult>;
}

/**
 * BuiltinToolManager provides provider-agnostic tool execution
 * by bridging the existing ToolRegistry with multiple LLM providers
 * Supports both built-in tools and MCP tools across all providers
 */
export class BuiltinToolManager {
  private openaiAdapter: OpenAIToolAdapter;
  private anthropicAdapter: AnthropicToolAdapter;
  private confirmationManager: UnifiedConfirmationManager;
  private mcpAdapter: MCPToolAdapter;

  constructor(
    private toolRegistry: ToolRegistry,
    private config: Config,
  ) {
    this.openaiAdapter = new OpenAIToolAdapter();
    this.anthropicAdapter = new AnthropicToolAdapter();
    this.confirmationManager = new UnifiedConfirmationManager(config, this);
    this.mcpAdapter = new MCPToolAdapter(config, toolRegistry);
  }

  /**
   * Get all available tools in unified format (built-in + MCP)
   */
  getUnifiedTools(): UnifiedTool[] {
    // Get built-in tools
    const declarations = this.toolRegistry.getFunctionDeclarations();
    const builtinTools = declarations.map((decl) =>
      this.functionDeclarationToUnifiedTool(decl),
    );

    // Get MCP tools
    const mcpTools = this.mcpAdapter
      .getUnifiedMCPInterface()
      .getUnifiedMCPTools();

    return [...builtinTools, ...mcpTools];
  }

  /**
   * Get tools formatted for a specific provider (built-in + MCP)
   */
  getToolsForProvider(provider: LLMProvider): any {
    // Get built-in tools
    const builtinDeclarations = this.toolRegistry.getFunctionDeclarations();
    const builtinUnifiedTools = builtinDeclarations.map((decl) =>
      this.functionDeclarationToUnifiedTool(decl),
    );

    // Get MCP tools for this provider
    const mcpTools = this.mcpAdapter.getMCPToolsForProvider(provider);

    // Combine both types
    const allUnifiedTools = [...builtinUnifiedTools, ...mcpTools];

    switch (provider) {
      case LLMProvider.GEMINI: {
        // For Gemini, return built-in function declarations + MCP tools in Gemini format
        const geminiMCPTools = this.mcpAdapter
          .getUnifiedMCPInterface()
          .getToolsForProvider(provider);
        return [...builtinDeclarations, ...geminiMCPTools];
      }
      case LLMProvider.OPENAI:
        // return this.openaiAdapter.formatToolsForRequest(allUnifiedTools); // Temporarily disabled
        return allUnifiedTools;
      case LLMProvider.ANTHROPIC:
        // return this.anthropicAdapter.formatToolsForRequest(allUnifiedTools); // Temporarily disabled 
        return allUnifiedTools;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Execute tools from provider-specific tool calls
   */
  async executeToolCalls(
    toolCalls: any[],
    context: ToolExecutionContext,
    abortSignal?: AbortSignal,
  ): Promise<UnifiedToolResult[]> {
    const unifiedCalls = this.convertToUnifiedToolCalls(
      toolCalls,
      context.provider,
    );
    const results: UnifiedToolResult[] = [];
    const signal = abortSignal || new AbortController().signal;

    for (const call of unifiedCalls) {
      try {
        // Process confirmation using unified confirmation manager
        const confirmationContext: ProviderConfirmationContext = {
          provider: context.provider,
          userPromptId: context.userPromptId,
          sessionId: context.sessionId,
          toolCall: call,
          tool: this.toolRegistry.getTool(call.name),
        };

        const confirmationResult =
          await this.confirmationManager.processConfirmation(
            confirmationContext,
            signal,
          );

        // Handle confirmation outcome
        if (confirmationResult.outcome === ToolConfirmationOutcome.Cancel) {
          results.push({
            toolCallId: call.id,
            content: 'Tool execution was cancelled by user',
            isError: true,
            success: false,
            error: { message: 'User cancelled operation' },
          });
          continue;
        }

        // Check for legacy confirmation callback (fallback)
        if (
          context.requiresConfirmation &&
          (await context.requiresConfirmation(call))
        ) {
          // Use onConfirmationRequired if provided, otherwise skip execution
          if (context.onConfirmationRequired) {
            const legacyConfirmationResult =
              await context.onConfirmationRequired(confirmationContext, signal);
            if (
              legacyConfirmationResult.outcome ===
              ToolConfirmationOutcome.Cancel
            ) {
              results.push({
                toolCallId: call.id,
                content:
                  'Tool execution was cancelled - user confirmation required',
                isError: true,
                success: false,
                error: { message: 'User confirmation required' },
              });
              continue;
            }
          } else {
            // No confirmation handler provided - skip execution
            results.push({
              toolCallId: call.id,
              content:
                'Tool execution was cancelled - confirmation required but no handler provided',
              isError: true,
              success: false,
              error: { message: 'User confirmation required' },
            });
            continue;
          }
        }

        // Notify about tool use
        if (context.onToolUse) {
          context.onToolUse(call);
        }

        // Execute the tool with abort signal (built-in or MCP)
        const result = await this.executeUnifiedToolCall(call, signal, context);

        // Notify about tool result
        if (context.onToolResult) {
          context.onToolResult(result);
        }

        results.push(result);
      } catch (error) {
        const errorResult: UnifiedToolResult = {
          toolCallId: call.id,
          content: `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          isError: true,
          success: false,
          error: { message: error instanceof Error ? error.message : 'Unknown error' },
        };
        results.push(errorResult);
      }
    }

    return results;
  }

  /**
   * Convert provider-specific tool calls to unified format
   */
  private convertToUnifiedToolCalls(
    toolCalls: any[],
    provider: LLMProvider,
  ): UnifiedToolCall[] {
    switch (provider) {
      case LLMProvider.GEMINI:
        return this.convertGeminiToolCalls(toolCalls);
      case LLMProvider.OPENAI:
        return toolCalls.map((call) =>
          this.openaiAdapter.fromProviderToolCall(call),
        );
      case LLMProvider.ANTHROPIC:
        return toolCalls.map((call) =>
          this.anthropicAdapter.fromProviderToolCall(call),
        );
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Convert Gemini function calls to unified format
   */
  private convertGeminiToolCalls(
    functionCalls: FunctionCall[],
  ): UnifiedToolCall[] {
    return functionCalls.map((call) => ({
      id: `gemini_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: call.name || 'unknown_function',
      arguments: call.args || {},
    }));
  }

  /**
   * Execute a unified tool call (built-in or MCP)
   */
  private async executeUnifiedToolCall(
    call: UnifiedToolCall,
    abortSignal?: AbortSignal,
    context?: ToolExecutionContext,
  ): Promise<UnifiedToolResult> {
    const signal = abortSignal || new AbortController().signal;

    // Check if operation was aborted
    if (signal.aborted) {
      return {
        toolCallId: call.id,
        content: 'Tool execution was aborted',
        isError: true,
        success: false,
        error: { message: 'Operation aborted' },
      };
    }

    // Check if this is an MCP tool
    if (context && this.mcpAdapter.isMCPTool(call.name, context.provider)) {
      try {
        return await this.mcpAdapter.executeMCPToolCall(
          call,
          context.provider,
          {
            userPromptId: context.userPromptId,
            sessionId: context.sessionId,
          },
          signal,
        );
      } catch (error) {
        // Check if error is due to abortion
        if (
          signal.aborted ||
          (error instanceof Error && error.name === 'AbortError')
        ) {
          return {
            toolCallId: call.id,
            content: 'MCP tool execution was aborted',
            isError: true,
            success: false,
            error: { message: 'Operation aborted' },
          };
        }

        return {
          toolCallId: call.id,
          content: `MCP tool execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          isError: true,
          success: false,
          error: { message: error instanceof Error ? error.message : 'Unknown error' },
        };
      }
    }

    // Execute built-in tool
    const tool = this.toolRegistry.getTool(call.name);

    if (!tool) {
      return {
        toolCallId: call.id,
        content: `Tool '${call.name}' not found`,
        isError: true,
        success: false,
        error: { message: `Tool '${call.name}' not found in registry` },
      };
    }

    try {
      // Validate parameters against tool schema
      const validationError = tool.validateToolParams(call.arguments);
      if (validationError) {
        return {
          toolCallId: call.id,
          content: `Parameter validation failed: ${validationError}`,
          isError: true,
          error: { message: validationError },
          success: false,
        };
      }

      // Build and execute tool invocation with abort signal
      const invocation = tool.build(call.arguments);
      const result = await invocation.execute(signal);

      // Convert to unified result format
      return {
        toolCallId: call.id,
        content: result.llmContent || '',
        isError: !!result.error,
        error: result.error ? { message: result.error.message } : undefined,
        success: !result.error,
      };
    } catch (error) {
      // Check if error is due to abortion
      if (
        signal.aborted ||
        (error instanceof Error && error.name === 'AbortError')
      ) {
        return {
          toolCallId: call.id,
          content: 'Tool execution was aborted',
          isError: true,
          error: { message: 'Operation aborted' },
          success: false,
        };
      }

      return {
        toolCallId: call.id,
        content: `Tool execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isError: true,
        success: false,
        error: { message: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  /**
   * Convert FunctionDeclaration to UnifiedTool
   */
  private functionDeclarationToUnifiedTool(
    declaration: FunctionDeclaration,
  ): UnifiedTool {
    return {
      name: declaration.name || 'unknown_function',
      description: declaration.description || '',
      parameters: {
        type: 'object',
        properties: declaration.parameters?.properties || {},
        required: declaration.parameters?.required || [],
      },
    };
  }

  /**
   * Convert unified tool results to provider-specific format
   */
  formatResultsForProvider(
    results: UnifiedToolResult[],
    provider: LLMProvider,
  ): any[] {
    switch (provider) {
      case LLMProvider.GEMINI:
        // Gemini doesn't require special result formatting - handled by LoggingContentGenerator
        return results;
      case LLMProvider.OPENAI:
        return results.map((result) =>
          this.openaiAdapter.toProviderToolResult(result),
        );
      case LLMProvider.ANTHROPIC:
        return results.map((result) =>
          this.anthropicAdapter.toProviderToolResult(result),
        );
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Check if a tool requires confirmation based on approval mode and tool type
   */
  shouldRequireConfirmation(toolCall: UnifiedToolCall): boolean {
    const approvalMode = this.config.getApprovalMode();

    // In YOLO mode, no confirmation is required
    if (approvalMode === ApprovalMode.YOLO) {
      return false;
    }

    // Tools that always require confirmation in non-YOLO modes
    const alwaysConfirmTools = [
      'run_shell_command',
      'shell_command',
      'exec',
      'system',
    ];

    // Tools that require confirmation in DEFAULT mode but not AUTO_EDIT mode
    const editTools = [
      'write_file',
      'edit_file',
      'replace',
      'create_file',
      'delete_file',
    ];

    if (alwaysConfirmTools.includes(toolCall.name)) {
      return true;
    }

    if (
      approvalMode === ApprovalMode.DEFAULT &&
      editTools.includes(toolCall.name)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Get comprehensive tool statistics (built-in + MCP + discovered)
   */
  getToolStats(): {
    totalTools: number;
    builtinTools: number;
    mcpTools: number;
    discoveredTools: number;
    mcpStatistics: any;
  } {
    const allTools = this.toolRegistry.getAllTools();
    const builtinTools = allTools.filter(
      (tool) =>
        !tool.name.includes('.') && // MCP tools typically have server.tool format
        !(tool as any).serverName && // MCP tools have serverName property
        tool.constructor.name !== 'DiscoveredTool',
    );
    const mcpTools = allTools.filter((tool) => (tool as any).serverName);
    const discoveredTools = allTools.filter(
      (tool) => tool.constructor.name === 'DiscoveredTool',
    );

    // Get detailed MCP statistics
    const mcpStatistics = this.mcpAdapter.getMCPToolStatistics();

    return {
      totalTools: allTools.length,
      builtinTools: builtinTools.length,
      mcpTools: mcpTools.length,
      discoveredTools: discoveredTools.length,
      mcpStatistics,
    };
  }

  /**
   * Get tool by name
   */
  getTool(name: string): UnifiedTool | undefined {
    const tool = this.toolRegistry.getTool(name);
    if (!tool) return undefined;

    return this.functionDeclarationToUnifiedTool(tool.schema);
  }

  /**
   * Get filtered tools for specific names
   */
  getFilteredTools(toolNames: string[]): UnifiedTool[] {
    const declarations =
      this.toolRegistry.getFunctionDeclarationsFiltered(toolNames);
    return declarations.map((decl) =>
      this.functionDeclarationToUnifiedTool(decl),
    );
  }

  /**
   * Refresh discovered tools
   */
  async refreshTools(): Promise<void> {
    await this.toolRegistry.discoverAllTools();
  }

  /**
   * Get available tool names
   */
  getAvailableToolNames(): string[] {
    return this.toolRegistry.getAllTools().map((tool) => tool.name);
  }

  /**
   * Check if a unified tool call requires confirmation
   * This method integrates the unified confirmation manager for cross-provider consistency
   */
  async requiresConfirmation(
    toolCall: UnifiedToolCall,
    context: {
      provider: LLMProvider;
      userPromptId: string;
      sessionId: string;
    },
    abortSignal?: AbortSignal,
  ): Promise<boolean> {
    const signal = abortSignal || new AbortController().signal;

    // Create confirmation context
    const confirmationContext: ProviderConfirmationContext = {
      provider: context.provider,
      userPromptId: context.userPromptId,
      sessionId: context.sessionId,
      toolCall,
      tool: this.toolRegistry.getTool(toolCall.name),
    };

    try {
      // Use unified confirmation manager to determine if confirmation is needed
      const confirmationResult =
        await this.confirmationManager.processConfirmation(
          confirmationContext,
          signal,
        );

      // If the result is anything other than immediate proceed, confirmation was required
      return confirmationResult.outcome !== ToolConfirmationOutcome.ProceedOnce;
    } catch (error) {
      // If there's an error in the confirmation process, err on the side of caution
      console.warn('Error checking confirmation requirements:', error);
      return true;
    }
  }

  /**
   * Get the unified confirmation manager instance
   * This allows external access to the confirmation system
   */
  getConfirmationManager(): UnifiedConfirmationManager {
    return this.confirmationManager;
  }

  /**
   * Get the MCP tool adapter for direct MCP operations
   */
  getMCPAdapter(): MCPToolAdapter {
    return this.mcpAdapter;
  }

  /**
   * Check if a tool is an MCP tool
   */
  isMCPTool(toolName: string, provider: LLMProvider): boolean {
    return this.mcpAdapter.isMCPTool(toolName, provider);
  }

  /**
   * Get MCP tools for a specific provider
   */
  getMCPToolsForProvider(provider: LLMProvider): UnifiedTool[] {
    return this.mcpAdapter.getMCPToolsForProvider(provider);
  }

  /**
   * Restart MCP servers
   */
  async restartMCPServers(): Promise<void> {
    await this.mcpAdapter.restartMCPServers();
  }

  /**
   * Discover MCP tools
   */
  async discoverMCPTools(): Promise<void> {
    await this.mcpAdapter.discoverMCPTools();
  }

  /**
   * Get all MCP tools across all providers
   */
  getAllMCPTools() {
    return this.mcpAdapter.getAllMCPTools();
  }

  /**
   * Get MCP tool metadata
   */
  getMCPToolMetadata(toolName: string, provider: LLMProvider) {
    return this.mcpAdapter.getMCPToolMetadata(toolName, provider);
  }
}
