/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { DiscoveredMCPTool } from '../../tools/mcp-tool.js';
import { Config } from '../../config/config.js';
import { UnifiedTool, UnifiedToolCall, UnifiedToolResult } from './unified-tool-interface.js';
import { ToolConfirmationOutcome } from '../../tools/tools.js';
import { MCPConnectionStats } from './mcp-connection-manager.js';
/**
 * Configuration for MCP server connections.
 */
export interface MCPServerConfig {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    timeout?: number;
    trust?: boolean;
    [key: string]: unknown;
}
/**
 * Manages MCP tool discovery, execution, and confirmation across all providers.
 * This centralizes MCP functionality so all LLM providers can access the same tools.
 * Uses advanced connection management with automatic reconnection and pooling.
 */
export declare class MCPToolManager {
    private config;
    private toolRegistry;
    private mcpTools;
    private connectionPool;
    private connectionPromises;
    private isInitialized;
    private serverConnections;
    private timeoutManager;
    private memoryManager;
    private resultCache;
    constructor(config: Config);
    /**
     * Initialize MCP connections and discover tools.
     * This method is idempotent and can be called multiple times safely.
     */
    initialize(): Promise<void>;
    /**
     * Connect to a single MCP server and discover its tools.
     * Uses advanced connection management with timeout protection.
     * @param serverName Name of the MCP server.
     * @param serverConfig Configuration for the server.
     */
    private connectToServer;
    /**
     * Discover tools from a specific MCP server using managed connection.
     * @param serverName Name of the server.
     * @param managedConnection Managed connection to the server.
     * @returns Array of discovered MCP tools.
     */
    private discoverToolsFromServerWithConnection;
    /**
     * Discover tools from a specific MCP server (legacy method for compatibility).
     * @param serverName Name of the server.
     * @param client Connected MCP client.
     * @returns Array of discovered MCP tools.
     */
    private discoverToolsFromServer;
    /**
     * Get all available MCP tools as unified tools.
     * Includes both MCP tools and native Gemini CLI tools.
     * @returns Array of unified tools.
     */
    getUnifiedTools(): UnifiedTool[];
    /**
     * Get a specific tool by name.
     * @param toolName Name of the tool.
     * @returns The tool if found, undefined otherwise.
     */
    getTool(toolName: string): DiscoveredMCPTool | any | undefined;
    /**
     * Execute a tool call with timeout protection regardless of provider.
     * @param toolCall Unified tool call to execute.
     * @param abortSignal Optional abort signal for cancellation.
     * @param customTimeoutMs Optional custom timeout override.
     * @returns Promise resolving to unified tool result.
     */
    executeTool(toolCall: UnifiedToolCall, abortSignal?: AbortSignal, customTimeoutMs?: number): Promise<UnifiedToolResult>;
    /**
     * Handle tool confirmation flow.
     * @param toolCall Unified tool call to confirm.
     * @param confirmationCallback Callback to handle user confirmation.
     * @returns Promise resolving to whether execution should proceed.
     */
    confirmToolExecution(toolCall: UnifiedToolCall, confirmationCallback: (details: any) => Promise<ToolConfirmationOutcome>): Promise<boolean>;
    /**
     * Convert MCP FunctionDeclaration to UnifiedTool format.
     * @param declaration Function declaration from MCP.
     * @returns Unified tool representation.
     */
    private convertMCPToUnified;
    /**
     * Convert parameter properties to unified format.
     * @param properties Parameter properties object.
     * @returns Unified parameter properties.
     */
    private convertParameterProperties;
    /**
     * Refresh tools from a specific server.
     * Uses connection pool for managed reconnection.
     * @param serverName Name of the server to refresh.
     */
    refreshServer(serverName: string): Promise<void>;
    /**
     * Refresh all MCP connections and tools.
     * Uses connection pool for graceful shutdown and restart.
     */
    refreshAllServers(): Promise<void>;
    /**
     * Get statistics about connected MCP servers and tools.
     * Includes advanced connection pool statistics.
     * @returns Object with connection and tool statistics.
     */
    getStats(): {
        connectedServers: number;
        totalTools: number;
        mcpTools: number;
        nativeTools: number;
        servers: Record<string, {
            connected: boolean;
            toolCount: number;
            connectionStats?: MCPConnectionStats;
        }>;
        poolStats: {
            totalConnections: number;
            activeConnections: number;
            failedConnections: number;
            totalRequests: number;
            successfulRequests: number;
        };
    };
    /**
     * Check if the manager is properly initialized.
     * @returns True if initialized, false otherwise.
     */
    isReady(): boolean;
    /**
     * Wait for initialization to complete.
     * @param timeoutMs Maximum time to wait in milliseconds.
     * @returns Promise resolving when ready or rejecting on timeout.
     */
    waitForReady(timeoutMs?: number): Promise<void>;
    /**
     * Get detailed health status of all connections.
     * @returns Health check results for all servers.
     */
    getHealthStatus(): Promise<Record<string, boolean>>;
    /**
     * Get detailed connection statistics for a specific server.
     * @param serverName Name of the server.
     * @returns Connection statistics or null if not found.
     */
    getConnectionStats(serverName: string): MCPConnectionStats | null;
    /**
     * Execute an MCP request on a specific server with retry logic.
     * @param serverName Name of the server.
     * @param method MCP method to call.
     * @param params Parameters for the method.
     * @param options Execution options.
     * @returns Promise resolving to the result.
     */
    executeServerRequest<T = any>(serverName: string, method: string, params?: any, options?: {
        timeout?: number;
        retries?: number;
    }): Promise<T>;
    /**
     * Create a combined abort signal from multiple sources.
     * @param signals Abort signals to combine.
     * @returns Combined abort signal.
     */
    private createCombinedAbortSignal;
    /**
     * Get timeout manager statistics.
     * @returns Timeout statistics.
     */
    getTimeoutStats(): {
        activeTimeouts: number;
        totalCreated: number;
        totalCompleted: number;
        totalTimedOut: number;
        averageDuration: number;
        byType: Record<string, {
            active: number;
            completed: number;
            timedOut: number;
            avgDuration: number;
        }>;
    };
    /**
     * Get memory usage statistics.
     * @returns Memory statistics.
     */
    getMemoryStats(): import("./memory-manager.js").MemoryStats;
    /**
     * Force memory cleanup for tool executions.
     * @param aggressive Whether to perform aggressive cleanup.
     */
    forceMemoryCleanup(aggressive?: boolean): Promise<void>;
    /**
     * Get result cache statistics.
     * @returns Cache statistics.
     */
    getCacheStats(): import("./result-cache.js").CacheStats;
    /**
     * Invalidate cached results for a specific tool.
     * @param toolName Tool name to invalidate.
     * @returns Number of invalidated entries.
     */
    invalidateCache(toolName: string): number;
    /**
     * Clear all cached results.
     */
    clearCache(): void;
    /**
     * Cleanup resources when shutting down.
     * Uses connection pool, timeout manager, memory manager, and result cache for graceful shutdown.
     */
    dispose(): Promise<void>;
}
