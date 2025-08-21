/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { BaseLLMProvider } from './base.js';
import { LLMProviderConfig, MCPCapableProvider } from './types.js';
import { MCPToolManager } from './tools/mcp-tool-manager.js';
import { UnifiedTool, UnifiedToolCall, UnifiedToolResult } from './tools/unified-tool-interface.js';
import { MultiProviderMCPConfig } from '../config/multi-provider-mcp-config.js';
/**
 * Extended configuration for MCP-capable providers
 */
export interface MCPProviderConfig extends LLMProviderConfig {
    mcpConfig?: Partial<MultiProviderMCPConfig>;
    mcpToolManager?: MCPToolManager;
}
/**
 * Abstract base class for MCP-capable LLM providers
 * Extends BaseLLMProvider with MCP integration capabilities
 */
export declare abstract class BaseMCPProvider extends BaseLLMProvider implements MCPCapableProvider {
    protected mcpToolManager?: MCPToolManager;
    protected mcpConfig: MultiProviderMCPConfig;
    constructor(config: MCPProviderConfig);
    /**
     * Initialize MCP functionality during provider initialization
     * This should be called by subclasses during their initialize() method
     */
    protected initializeMCP(): Promise<void>;
    /**
     * Get the MCP tool manager instance for this provider
     */
    getMCPToolManager(): MCPToolManager;
    /**
     * Execute multiple tool calls using MCP integration
     */
    executeToolsWithMCP(calls: UnifiedToolCall[]): Promise<UnifiedToolResult[]>;
    /**
     * Discover available MCP tools from connected servers
     */
    discoverMCPTools(): Promise<UnifiedTool[]>;
    /**
     * Synchronize tools across all providers in the system
     */
    syncToolsAcrossProviders(): Promise<void>;
    /**
     * Check if MCP integration is enabled and functional
     */
    isMCPEnabled(): boolean;
    /**
     * Get health status of MCP connections
     */
    getMCPConnectionHealth(): Promise<Record<string, boolean>>;
    /**
     * Refresh MCP connections and rediscover tools
     */
    refreshMCPConnections(): Promise<void>;
    /**
     * Get MCP configuration for this provider
     */
    getMCPConfig(): MultiProviderMCPConfig;
    /**
     * Update MCP configuration
     */
    updateMCPConfig(updates: Partial<MultiProviderMCPConfig>): void;
    /**
     * Clean up MCP resources
     * Should be called by subclasses in their dispose/cleanup methods
     */
    protected disposeMCP(): Promise<void>;
    /**
     * Get MCP statistics and diagnostics
     */
    getMCPStats(): any;
}
