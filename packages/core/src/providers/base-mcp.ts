/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseLLMProvider } from './base.js';
import {
  LLMProviderConfig,
  MCPCapableProvider,
} from './types.js';
import { MCPToolManager } from './tools/mcp-tool-manager.js';
import {
  UnifiedTool,
  UnifiedToolCall,
  UnifiedToolResult,
} from './tools/unified-tool-interface.js';
import {
  MultiProviderMCPConfig,
  MultiProviderMCPConfigMerger,
  DEFAULT_MULTI_PROVIDER_MCP_CONFIG,
} from '../config/multi-provider-mcp-config.js';

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
export abstract class BaseMCPProvider extends BaseLLMProvider implements MCPCapableProvider {
  protected mcpToolManager?: MCPToolManager;
  protected mcpConfig: MultiProviderMCPConfig;

  constructor(config: MCPProviderConfig) {
    super(config);
    
    // Merge MCP configuration with defaults
    this.mcpConfig = MultiProviderMCPConfigMerger.merge(
      config.mcpConfig || {},
      DEFAULT_MULTI_PROVIDER_MCP_CONFIG,
    );

    // Use provided MCP tool manager or indicate it needs to be initialized
    this.mcpToolManager = config.mcpToolManager;
  }

  /**
   * Initialize MCP functionality during provider initialization
   * This should be called by subclasses during their initialize() method
   */
  protected async initializeMCP(): Promise<void> {
    if (!this.config.enableMCP || !this.config.configInstance) {
      return;
    }

    if (!this.mcpToolManager) {
      this.mcpToolManager = new MCPToolManager(this.config.configInstance);
      await this.mcpToolManager.initialize();
    }
  }

  /**
   * Get the MCP tool manager instance for this provider
   */
  getMCPToolManager(): MCPToolManager {
    if (!this.mcpToolManager) {
      throw new Error('MCP tool manager not initialized. Call initialize() first.');
    }
    return this.mcpToolManager;
  }

  /**
   * Execute multiple tool calls using MCP integration
   */
  async executeToolsWithMCP(calls: UnifiedToolCall[]): Promise<UnifiedToolResult[]> {
    if (!this.isMCPEnabled()) {
      throw new Error('MCP is not enabled for this provider');
    }

    const results: UnifiedToolResult[] = [];
    const toolManager = this.getMCPToolManager();

    // Execute tools concurrently if allowed by configuration
    const maxConcurrent = this.mcpConfig.toolExecution.maxConcurrentTools || 3;
    const parallelExecution = this.mcpConfig.toolExecution.parallelExecution ?? true;

    if (parallelExecution && calls.length > 1) {
      // Execute tools in parallel with concurrency limit
      for (let i = 0; i < calls.length; i += maxConcurrent) {
        const batch = calls.slice(i, i + maxConcurrent);
        const batchPromises = batch.map(call => 
          toolManager.executeTool(call).catch(error => ({
            toolCallId: call.id,
            content: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`,
            error: { message: error instanceof Error ? error.message : String(error) },
            isError: true,
            success: false,
          }))
        );
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      }
    } else {
      // Execute tools sequentially
      for (const call of calls) {
        try {
          const result = await toolManager.executeTool(call);
          results.push(result);
        } catch (error) {
          results.push({
            toolCallId: call.id,
            content: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`,
            error: { message: error instanceof Error ? error.message : String(error) },
            isError: true,
            success: false,
          });
          
          // Stop execution if failFast is enabled
          if (this.mcpConfig.toolExecution.failFast) {
            break;
          }
        }
      }
    }

    return results;
  }

  /**
   * Discover available MCP tools from connected servers
   */
  async discoverMCPTools(): Promise<UnifiedTool[]> {
    if (!this.isMCPEnabled()) {
      return [];
    }

    const toolManager = this.getMCPToolManager();
    return toolManager.getUnifiedTools();
  }

  /**
   * Synchronize tools across all providers in the system
   */
  async syncToolsAcrossProviders(): Promise<void> {
    if (!this.isMCPEnabled()) {
      return;
    }

    const toolManager = this.getMCPToolManager();
    
    // This would typically coordinate with a central tool discovery sync service
    // For now, we'll refresh the local tool manager's connections
    await toolManager.refreshAllServers();
  }

  /**
   * Check if MCP integration is enabled and functional
   */
  isMCPEnabled(): boolean {
    return (
      this.config.enableMCP === true &&
      this.mcpToolManager !== undefined &&
      this.mcpToolManager.isReady()
    );
  }

  /**
   * Get health status of MCP connections
   */
  async getMCPConnectionHealth(): Promise<Record<string, boolean>> {
    if (!this.isMCPEnabled()) {
      return {};
    }

    const toolManager = this.getMCPToolManager();
    return await toolManager.getHealthStatus();
  }

  /**
   * Refresh MCP connections and rediscover tools
   */
  async refreshMCPConnections(): Promise<void> {
    if (!this.isMCPEnabled()) {
      return;
    }

    const toolManager = this.getMCPToolManager();
    await toolManager.refreshAllServers();
  }

  /**
   * Get MCP configuration for this provider
   */
  getMCPConfig(): MultiProviderMCPConfig {
    return this.mcpConfig;
  }

  /**
   * Update MCP configuration
   */
  updateMCPConfig(updates: Partial<MultiProviderMCPConfig>): void {
    this.mcpConfig = MultiProviderMCPConfigMerger.merge(
      updates,
      this.mcpConfig,
    );
  }

  /**
   * Clean up MCP resources
   * Should be called by subclasses in their dispose/cleanup methods
   */
  protected async disposeMCP(): Promise<void> {
    if (this.mcpToolManager) {
      await this.mcpToolManager.dispose();
      this.mcpToolManager = undefined;
    }
  }

  /**
   * Get MCP statistics and diagnostics
   */
  getMCPStats(): any {
    if (!this.isMCPEnabled()) {
      return { enabled: false };
    }

    const toolManager = this.getMCPToolManager();
    return {
      enabled: true,
      connections: toolManager.getStats(),
      config: this.mcpConfig,
      health: this.getMCPConnectionHealth(),
    };
  }
}