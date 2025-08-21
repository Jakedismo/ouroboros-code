/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { UnifiedTool, UnifiedToolCall, UnifiedToolResult, LLMProvider } from './types.js';
import { UnifiedMCPInterface, MCPToolMetadata } from './unified-mcp-interface.js';
import { Config } from '../config/config.js';
import { ToolRegistry } from '../tools/tool-registry.js';
/**
 * MCP Tool Adapter for integrating MCP tools with multi-provider architecture
 * This bridges MCP tools with the BuiltinToolManager for cross-provider compatibility
 */
export declare class MCPToolAdapter {
    private unifiedMCPInterface;
    private config;
    private toolRegistry;
    private readonly providerPrefixes;
    constructor(config: Config, toolRegistry: ToolRegistry);
    /**
     * Get MCP tools formatted for a specific provider
     */
    getMCPToolsForProvider(provider: LLMProvider): UnifiedTool[];
    /**
     * Execute MCP tool call from any provider
     */
    executeMCPToolCall(toolCall: UnifiedToolCall, provider: LLMProvider, context: {
        userPromptId: string;
        sessionId: string;
    }, abortSignal?: AbortSignal): Promise<UnifiedToolResult>;
    /**
     * Check if a tool name is an MCP tool
     */
    isMCPTool(toolName: string, provider: LLMProvider): boolean;
    /**
     * Get MCP tool metadata
     */
    getMCPToolMetadata(toolName: string, provider: LLMProvider): MCPToolMetadata;
    /**
     * Get all available MCP tools across providers
     */
    getAllMCPTools(): {
        [provider in LLMProvider]: UnifiedTool[];
    };
    /**
     * Convert provider-specific tool calls to MCP-compatible format
     */
    adaptToolCallsFromProvider(toolCalls: any[], provider: LLMProvider): UnifiedToolCall[];
    /**
     * Convert unified tool results to provider-specific format
     */
    formatMCPResultsForProvider(results: UnifiedToolResult[], provider: LLMProvider): any[];
    /**
     * Parse fully qualified tool name (server.tool) into components
     */
    private parseFullyQualifiedToolName;
    /**
     * Check if a tool name follows MCP naming patterns
     */
    private isValidMCPToolName;
    /**
     * Convert MCP result to unified tool result
     */
    private convertMCPResultToUnified;
    /**
     * Adapt OpenAI MCP tool calls
     */
    private adaptOpenAIMCPToolCalls;
    /**
     * Adapt Anthropic MCP tool calls
     */
    private adaptAnthropicMCPToolCalls;
    /**
     * Adapt Gemini MCP tool calls
     */
    private adaptGeminiMCPToolCalls;
    /**
     * Format result for OpenAI
     */
    private formatResultForOpenAI;
    /**
     * Format result for Anthropic
     */
    private formatResultForAnthropic;
    /**
     * Get MCP tool statistics
     */
    getMCPToolStatistics(): {
        totalMCPTools: number;
        byServer: Record<string, number>;
        bySecurityLevel: Record<import("./unified-mcp-interface.js").MCPToolSecurityLevel, number>;
        trusted: number;
        requiresConfirmation: number;
    };
    /**
     * Restart MCP servers
     */
    restartMCPServers(): Promise<void>;
    /**
     * Discover MCP tools
     */
    discoverMCPTools(): Promise<void>;
    /**
     * Get the unified MCP interface
     */
    getUnifiedMCPInterface(): UnifiedMCPInterface;
}
/**
 * OpenAI-specific MCP integration helper
 */
export declare class OpenAIMCPIntegration {
    private mcpAdapter;
    constructor(mcpAdapter: MCPToolAdapter);
    /**
     * Format MCP tools for OpenAI API request
     */
    formatMCPToolsForOpenAI(): any[];
    /**
     * Execute OpenAI MCP tool calls
     */
    executeOpenAIMCPTools(toolCalls: any[], context: {
        userPromptId: string;
        sessionId: string;
    }, abortSignal?: AbortSignal): Promise<any[]>;
}
/**
 * Anthropic-specific MCP integration helper
 */
export declare class AnthropicMCPIntegration {
    private mcpAdapter;
    constructor(mcpAdapter: MCPToolAdapter);
    /**
     * Format MCP tools for Anthropic API request
     */
    formatMCPToolsForAnthropic(): any[];
    /**
     * Execute Anthropic MCP tool calls
     */
    executeAnthropicMCPTools(toolUses: any[], context: {
        userPromptId: string;
        sessionId: string;
    }, abortSignal?: AbortSignal): Promise<any[]>;
}
/**
 * Factory for creating provider-specific MCP integrations
 */
export declare class MCPIntegrationFactory {
    static create(provider: LLMProvider, config: Config, toolRegistry: ToolRegistry): MCPToolAdapter | OpenAIMCPIntegration | AnthropicMCPIntegration;
}
