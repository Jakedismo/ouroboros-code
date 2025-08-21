/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { UnifiedTool, UnifiedToolCall, UnifiedToolResult, LLMProvider } from './types.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { Config } from '../config/config.js';
import { UnifiedConfirmationManager, ProviderConfirmationContext, ConfirmationResult } from './unified-confirmation-manager.js';
import { MCPToolAdapter } from './mcp-tool-adapters.js';
export interface ToolExecutionContext {
    provider: LLMProvider;
    userPromptId: string;
    sessionId: string;
    requiresConfirmation?: (toolCall: UnifiedToolCall) => Promise<boolean>;
    onToolUse?: (toolCall: UnifiedToolCall) => void;
    onToolResult?: (result: UnifiedToolResult) => void;
    onConfirmationRequired?: (context: ProviderConfirmationContext, abortSignal: AbortSignal) => Promise<ConfirmationResult>;
}
/**
 * BuiltinToolManager provides provider-agnostic tool execution
 * by bridging the existing ToolRegistry with multiple LLM providers
 * Supports both built-in tools and MCP tools across all providers
 */
export declare class BuiltinToolManager {
    private toolRegistry;
    private config;
    private openaiAdapter;
    private anthropicAdapter;
    private confirmationManager;
    private mcpAdapter;
    constructor(toolRegistry: ToolRegistry, config: Config);
    /**
     * Get all available tools in unified format (built-in + MCP)
     */
    getUnifiedTools(): UnifiedTool[];
    /**
     * Get tools formatted for a specific provider (built-in + MCP)
     */
    getToolsForProvider(provider: LLMProvider): any;
    /**
     * Execute tools from provider-specific tool calls
     */
    executeToolCalls(toolCalls: any[], context: ToolExecutionContext, abortSignal?: AbortSignal): Promise<UnifiedToolResult[]>;
    /**
     * Convert provider-specific tool calls to unified format
     */
    private convertToUnifiedToolCalls;
    /**
     * Convert Gemini function calls to unified format
     */
    private convertGeminiToolCalls;
    /**
     * Execute a unified tool call (built-in or MCP)
     */
    private executeUnifiedToolCall;
    /**
     * Convert FunctionDeclaration to UnifiedTool
     */
    private functionDeclarationToUnifiedTool;
    /**
     * Convert unified tool results to provider-specific format
     */
    formatResultsForProvider(results: UnifiedToolResult[], provider: LLMProvider): any[];
    /**
     * Check if a tool requires confirmation based on approval mode and tool type
     */
    shouldRequireConfirmation(toolCall: UnifiedToolCall): boolean;
    /**
     * Get comprehensive tool statistics (built-in + MCP + discovered)
     */
    getToolStats(): {
        totalTools: number;
        builtinTools: number;
        mcpTools: number;
        discoveredTools: number;
        mcpStatistics: any;
    };
    /**
     * Get tool by name
     */
    getTool(name: string): UnifiedTool | undefined;
    /**
     * Get filtered tools for specific names
     */
    getFilteredTools(toolNames: string[]): UnifiedTool[];
    /**
     * Refresh discovered tools
     */
    refreshTools(): Promise<void>;
    /**
     * Get available tool names
     */
    getAvailableToolNames(): string[];
    /**
     * Check if a unified tool call requires confirmation
     * This method integrates the unified confirmation manager for cross-provider consistency
     */
    requiresConfirmation(toolCall: UnifiedToolCall, context: {
        provider: LLMProvider;
        userPromptId: string;
        sessionId: string;
    }, abortSignal?: AbortSignal): Promise<boolean>;
    /**
     * Get the unified confirmation manager instance
     * This allows external access to the confirmation system
     */
    getConfirmationManager(): UnifiedConfirmationManager;
    /**
     * Get the MCP tool adapter for direct MCP operations
     */
    getMCPAdapter(): MCPToolAdapter;
    /**
     * Check if a tool is an MCP tool
     */
    isMCPTool(toolName: string, provider: LLMProvider): boolean;
    /**
     * Get MCP tools for a specific provider
     */
    getMCPToolsForProvider(provider: LLMProvider): UnifiedTool[];
    /**
     * Restart MCP servers
     */
    restartMCPServers(): Promise<void>;
    /**
     * Discover MCP tools
     */
    discoverMCPTools(): Promise<void>;
    /**
     * Get all MCP tools across all providers
     */
    getAllMCPTools(): {
        gemini: UnifiedTool[];
        openai: UnifiedTool[];
        anthropic: UnifiedTool[];
    };
    /**
     * Get MCP tool metadata
     */
    getMCPToolMetadata(toolName: string, provider: LLMProvider): import("./unified-mcp-interface.js").MCPToolMetadata;
}
