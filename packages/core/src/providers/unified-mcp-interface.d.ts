/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { UnifiedTool, UnifiedToolCall, UnifiedToolResult, LLMProvider } from './types.js';
import { McpClientManager } from '../tools/mcp-client-manager.js';
import { Config } from '../config/config.js';
import { ToolRegistry } from '../tools/tool-registry.js';
/**
 * Security levels specific to MCP tools
 */
export declare enum MCPToolSecurityLevel {
    SAFE = "safe",// Read-only MCP operations
    MODERATE = "moderate",// MCP operations that may modify data
    DANGEROUS = "dangerous"
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
export declare class UnifiedMCPInterface {
    private mcpClientManager;
    private toolRegistry;
    private config;
    private toolMetadataCache;
    private providerAdapters;
    constructor(config: Config, toolRegistry: ToolRegistry);
    /**
     * Initialize provider-specific MCP adapters
     */
    private initializeProviderAdapters;
    /**
     * Get all available MCP tools in unified format
     */
    getUnifiedMCPTools(): UnifiedTool[];
    /**
     * Get MCP tools formatted for a specific provider
     */
    getToolsForProvider(provider: LLMProvider): any[];
    /**
     * Execute MCP tool calls across providers
     */
    executeMCPToolCall(context: MCPToolExecutionContext): Promise<UnifiedMCPToolResult>;
    /**
     * Process MCP tool confirmation using unified confirmation system
     */
    private processMCPToolConfirmation;
    /**
     * Convert DiscoveredMCPTool to UnifiedTool format
     */
    private convertMCPToolToUnified;
    /**
     * Convert MCP parameter schema to unified format
     */
    private convertParameterSchema;
    /**
     * Extract required parameters from MCP schema
     */
    private extractRequiredParameters;
    /**
     * Get MCP tool metadata with caching
     */
    getMCPToolMetadata(serverName: string, toolName: string): MCPToolMetadata;
    /**
     * Assess security level of MCP tool based on its characteristics
     */
    private assessMCPToolSecurityLevel;
    /**
     * Analyze MCP tool capabilities
     */
    private analyzeMCPToolCapabilities;
    /**
     * Get tool statistics for MCP tools
     */
    getMCPToolStatistics(): {
        totalMCPTools: number;
        byServer: Record<string, number>;
        bySecurityLevel: Record<MCPToolSecurityLevel, number>;
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
     * Get the MCP client manager
     */
    getMCPClientManager(): McpClientManager;
}
/**
 * Abstract base class for provider-specific MCP adapters
 */
export declare abstract class MCPProviderAdapter {
    abstract formatToolsForRequest(tools: UnifiedTool[]): any[];
    abstract convertToolCallFromProvider(toolCall: any): UnifiedToolCall;
    abstract convertToolResultToProvider(result: UnifiedMCPToolResult): any;
}
/**
 * Gemini MCP Adapter - handles Gemini-specific MCP tool formatting
 */
export declare class GeminiMCPAdapter extends MCPProviderAdapter {
    formatToolsForRequest(tools: UnifiedTool[]): any[];
    convertToolCallFromProvider(toolCall: any): UnifiedToolCall;
    convertToolResultToProvider(result: UnifiedMCPToolResult): any;
}
/**
 * OpenAI MCP Adapter - handles OpenAI-specific MCP tool formatting
 */
export declare class OpenAIMCPAdapter extends MCPProviderAdapter {
    formatToolsForRequest(tools: UnifiedTool[]): any[];
    convertToolCallFromProvider(toolCall: any): UnifiedToolCall;
    convertToolResultToProvider(result: UnifiedMCPToolResult): any;
}
/**
 * Anthropic MCP Adapter - handles Anthropic-specific MCP tool formatting
 */
export declare class AnthropicMCPAdapter extends MCPProviderAdapter {
    formatToolsForRequest(tools: UnifiedTool[]): any[];
    convertToolCallFromProvider(toolCall: any): UnifiedToolCall;
    convertToolResultToProvider(result: UnifiedMCPToolResult): any;
}
