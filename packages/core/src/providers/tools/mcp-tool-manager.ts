/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { DiscoveredMCPTool } from '../../tools/mcp-tool.js';
import { ToolRegistry } from '../../tools/tool-registry.js';
import { Config } from '../../config/config.js';
import {
  UnifiedTool,
  UnifiedToolCall,
  UnifiedToolResult,
} from './unified-tool-interface.js';
// Removed unused imports
import { discoverTools } from '../../tools/mcp-client.js';
import { MCPServerConfig } from '../../config/config.js';

// Re-export for other modules
export { MCPServerConfig };
import { ToolConfirmationOutcome, AnyDeclarativeTool } from '../../tools/tools.js';
import {
  MCPConnectionPool,
  MCPManagedConnection,
  MCPConnectionState,
  MCPConnectionConfig,
  MCPConnectionStats,
  createDefaultMCPConnectionConfig,
  createDefaultMCPPoolConfig,
} from './mcp-connection-manager.js';
import {
  TimeoutManager,
  createTimeoutManager,
  DEFAULT_TIMEOUT_CONFIG,
} from './timeout-manager.js';
import { MemoryManager, createMemoryManager } from './memory-manager.js';
import { ToolResultCache, createResultCache } from './result-cache.js';


/**
 * Manages MCP tool discovery, execution, and confirmation across all providers.
 * This centralizes MCP functionality so all LLM providers can access the same tools.
 * Uses advanced connection management with automatic reconnection and pooling.
 */
export class MCPToolManager {
  private toolRegistry: ToolRegistry;
  private mcpTools: Map<string, DiscoveredMCPTool> = new Map();
  private connectionPool: MCPConnectionPool;
  private connectionPromises: Map<string, Promise<void>> = new Map();
  private isInitialized = false;
  private serverConnections: Map<string, MCPManagedConnection> = new Map();
  private timeoutManager: TimeoutManager;
  private memoryManager: MemoryManager;
  private resultCache: ToolResultCache;

  constructor(private config: Config) {
    this.toolRegistry = config.getToolRegistry();

    // Initialize timeout manager
    this.timeoutManager = createTimeoutManager({
      ...DEFAULT_TIMEOUT_CONFIG,
      toolDiscoveryMs: 15000, // Allow more time for tool discovery
      mcpConnectionMs: 12000, // Allow more time for MCP connections
    });

    // Initialize memory manager for tool execution tracking
    this.memoryManager = createMemoryManager('mcp-manager', {
      maxToolMemoryMB: 512, // Allow generous memory for MCP operations
      maxConcurrentExecutions: 15, // Support many concurrent operations
      resultCacheMaxMB: 256, // Cache tool results for performance
      aggressiveCleanup: false, // Conservative cleanup for stability
    });

    // Initialize connection pool with default settings
    const poolConfig = createDefaultMCPPoolConfig();
    this.connectionPool = new MCPConnectionPool(poolConfig);

    // Set up pool event listeners for monitoring
    this.connectionPool.on('connectionEstablished', (serverName) => {
      console.log(`✅ MCP connection established: ${serverName}`);
    });

    this.connectionPool.on('connectionClosed', (serverName) => {
      console.log(`❌ MCP connection closed: ${serverName}`);
    });

    this.connectionPool.on('connectionError', (serverName, error) => {
      console.warn(`⚠️ MCP connection error for ${serverName}:`, error.message);
    });

    this.connectionPool.on(
      'connectionStateChange',
      (serverName, newState, oldState) => {
        console.log(
          `🔄 MCP connection state change for ${serverName}: ${oldState} → ${newState}`,
        );
      },
    );

    // Set up memory manager event listeners
    this.memoryManager.on('memory_pressure', (event) => {
      console.warn(`📢 MCP memory pressure ${event.level}: ${event.reason}`);

      // Clear cache on high memory pressure
      if (event.level === 'high' || event.level === 'critical') {
        console.log('📄 Clearing result cache due to memory pressure');
        this.resultCache.clear();
      }
    });

    this.memoryManager.on('cleanup_completed', (event) => {
      console.log(
        `🧹 MCP memory cleanup: ${event.memoryFreed.toFixed(1)}MB freed`,
      );
    });

    // Initialize result cache for performance optimization
    this.resultCache = createResultCache('mcp-manager', {
      maxSizeMB: 128, // Conservative cache size for MCP
      maxAgeMs: 300000, // 5 minute cache for MCP results
      evictionStrategy: 'hybrid', // Intelligent eviction
      enableCompression: true, // Compress MCP results
    });

    // Set up result cache event listeners
    this.resultCache.on('cache_hit', (event) => {
      console.log(
        `📄 Cache hit for ${event.toolName} (access count: ${event.accessCount})`,
      );
    });

    this.resultCache.on('cache_eviction', (event) => {
      console.log(
        `🗞️ Cache eviction: ${event.count} entries removed (${event.strategy})`,
      );
    });
  }

  /**
   * Initialize MCP connections and discover tools.
   * This method is idempotent and can be called multiple times safely.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    console.log('Initializing MCP Tool Manager...');

    // Connect to MCP servers and discover tools
    const mcpServers = this.config.getMcpServers() || {};
    const connectionPromises: Array<Promise<void>> = [];

    for (const [serverName, serverConfig] of Object.entries(mcpServers)) {
      const connectionPromise = this.connectToServer(serverName, serverConfig);
      this.connectionPromises.set(serverName, connectionPromise);
      connectionPromises.push(connectionPromise);
    }

    // Wait for all connections to complete (or fail)
    await Promise.allSettled(connectionPromises);

    this.isInitialized = true;
    console.log(
      `MCP Tool Manager initialized with ${this.mcpTools.size} tools from ${this.serverConnections.size} servers`,
    );
  }

  /**
   * Connect to a single MCP server and discover its tools.
   * Uses advanced connection management with timeout protection.
   * @param serverName Name of the MCP server.
   * @param serverConfig Configuration for the server.
   */
  private async connectToServer(
    serverName: string,
    serverConfig: any,
  ): Promise<void> {
    try {
      console.log(`🔗 Connecting to MCP server: ${serverName}`);

      await this.timeoutManager.withTimeout(
        async (abortSignal) => {
          // Create connection configuration with defaults
          const connectionConfig: MCPConnectionConfig =
            createDefaultMCPConnectionConfig({
              command: serverConfig.command,
              args: serverConfig.args,
              env: serverConfig.env,
              timeout: serverConfig.timeout,
              trust: serverConfig.trust,
            });

          // Get managed connection from pool
          const managedConnection = await this.connectionPool.getConnection(
            serverName,
            connectionConfig,
          );
          this.serverConnections.set(serverName, managedConnection);

          // Get the underlying client for tool discovery
          const client = managedConnection.getClient();
          if (!client) {
            throw new Error(
              `Failed to get MCP client for server ${serverName}`,
            );
          }

          // Discover tools from this server using timeout protection
          const tools = await this.timeoutManager.withTimeout(
            async () => {
              return await this.discoverToolsFromServerWithConnection(
                serverName,
                managedConnection,
              );
            },
            'tool_discovery',
            undefined,
            { serverName, toolCount: 0 },
          );

          // Register tools in our local cache
          for (const tool of tools) {
            this.mcpTools.set(tool.name, tool);
            console.log(
              `🔧 Discovered tool: ${tool.name} from server: ${serverName}`,
            );
          }

          console.log(
            `✅ Successfully connected to ${serverName} with ${tools.length} tools`,
          );
        },
        'mcp_connection',
        undefined,
        { serverName },
      );
    } catch (error) {
      console.error(`❌ Failed to connect to MCP server ${serverName}:`, error);
      // Don't throw - allow other servers to connect successfully
    }
  }

  /**
   * Discover tools from a specific MCP server using managed connection.
   * @param serverName Name of the server.
   * @param managedConnection Managed connection to the server.
   * @returns Array of discovered MCP tools.
   */
  private async discoverToolsFromServerWithConnection(
    serverName: string,
    managedConnection: MCPManagedConnection,
  ): Promise<DiscoveredMCPTool[]> {
    try {
      // Get the underlying client from the managed connection
      const client = managedConnection.getClient();
      if (!client) {
        throw new Error(`No client available for server ${serverName}`);
      }

      // Use existing tool discovery logic
      // Create a minimal server config for discovery
      const serverConfig: MCPServerConfig = {
        command: '',
        args: [],
      };
      return await discoverTools(serverName, serverConfig, client as any);
    } catch (error) {
      console.error(
        `Failed to discover tools from server ${serverName}:`,
        error,
      );
      return [];
    }
  }


  /**
   * Get all available MCP tools as unified tools.
   * Includes both MCP tools and native Gemini CLI tools.
   * @returns Array of unified tools.
   */
  getUnifiedTools(): UnifiedTool[] {
    const unifiedTools: UnifiedTool[] = [];

    // Convert MCP tools to unified format
    for (const mcpTool of this.mcpTools.values()) {
      try {
        unifiedTools.push(this.convertMCPToUnified(mcpTool));
      } catch (error) {
        console.warn(
          `Failed to convert MCP tool ${mcpTool.name} to unified format:`,
          error,
        );
      }
    }

    // Also include native Gemini CLI tools
    const nativeTools = this.toolRegistry.getAllTools();
    for (const tool of nativeTools) {
      // Skip MCP tools that are already included
      if (!(tool instanceof DiscoveredMCPTool)) {
        try {
          unifiedTools.push(this.convertMCPToUnified(tool));
        } catch (error) {
          console.warn(
            `Failed to convert native tool ${tool.name} to unified format:`,
            error,
          );
        }
      }
    }

    return unifiedTools;
  }

  /**
   * Get a specific tool by name.
   * @param toolName Name of the tool.
   * @returns The tool if found, undefined otherwise.
   */
  getTool(toolName: string): DiscoveredMCPTool | any | undefined {
    // First check MCP tools
    const mcpTool = this.mcpTools.get(toolName);
    if (mcpTool) {
      return mcpTool;
    }

    // Then check native tools
    return this.toolRegistry.getTool(toolName);
  }

  /**
   * Execute a tool call with timeout protection regardless of provider.
   * @param toolCall Unified tool call to execute.
   * @param abortSignal Optional abort signal for cancellation.
   * @param customTimeoutMs Optional custom timeout override.
   * @returns Promise resolving to unified tool result.
   */
  async executeTool(
    toolCall: UnifiedToolCall,
    abortSignal?: AbortSignal,
    customTimeoutMs?: number,
  ): Promise<UnifiedToolResult> {
    // Check cache first for performance optimization
    const cachedResult = this.resultCache.get(toolCall, 'mcp-manager');
    if (cachedResult) {
      console.log(`📄 Returning cached result for ${toolCall.name}`);
      return cachedResult;
    }

    // Create memory context for this tool execution
    // Track execution in memory manager
    this.memoryManager.createExecutionContext(
      toolCall.id,
      toolCall.name,
      'mcp-manager',
    );

    try {
      return await this.timeoutManager.withToolTimeout(
        async (timeoutSignal) => {
          try {
            const tool = this.getTool(toolCall.name);

            if (!tool) {
              const errorResult = {
                toolCallId: toolCall.id,
                content: `Tool ${toolCall.name} not found`,
                error: `Tool ${toolCall.name} not found`,
                isError: true,
                success: false,
              };

              this.memoryManager.completeExecution(toolCall.id, errorResult);
              return errorResult;
            }

            // Build and execute the tool invocation with combined signals
            const invocation = tool.build(toolCall.arguments);
            const combinedSignal = this.createCombinedAbortSignal(
              timeoutSignal,
              abortSignal,
            );

            // Register the tool invocation for memory tracking
            this.memoryManager.registerObject(toolCall.id, invocation, () => {
              // Cleanup callback for tool invocation
              console.log(`🧹 Cleaning up tool invocation: ${toolCall.name}`);
            });

            const result = await invocation.execute(combinedSignal);

            const unifiedResult = {
              toolCallId: toolCall.id,
              content: result.llmContent,
              summary: result.summary,
              isError: false,
              success: true,
            };

            // Cache successful results for future use
            this.resultCache.set(toolCall, unifiedResult, 'mcp-manager');

            // Complete memory context with successful result
            this.memoryManager.completeExecution(toolCall.id, unifiedResult);
            return unifiedResult;
          } catch (error: any) {
            console.error(`Error executing tool ${toolCall.name}:`, error);
            const errorResult = {
              toolCallId: toolCall.id,
              content: `Error executing tool: ${error.message}`,
              error: error.message,
              isError: true,
              success: false,
            };

            // Complete memory context with error result (don't cache errors)
            this.memoryManager.completeExecution(toolCall.id, errorResult);
            return errorResult;
          }
        },
        toolCall.name,
        customTimeoutMs,
      );
    } catch (error) {
      // Force cleanup memory context on unexpected errors
      this.memoryManager.forceCleanup(toolCall.id);
      throw error;
    }
  }

  /**
   * Handle tool confirmation flow.
   * @param toolCall Unified tool call to confirm.
   * @param confirmationCallback Callback to handle user confirmation.
   * @returns Promise resolving to whether execution should proceed.
   */
  async confirmToolExecution(
    toolCall: UnifiedToolCall,
    confirmationCallback: (details: any) => Promise<ToolConfirmationOutcome>,
  ): Promise<boolean> {
    try {
      const tool = this.getTool(toolCall.name);

      if (!tool) {
        console.warn(`Tool ${toolCall.name} not found for confirmation check`);
        return false;
      }

      const invocation = tool.build(toolCall.arguments);
      const confirmationDetails = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      // If no confirmation needed, proceed
      if (!confirmationDetails) {
        return true;
      }

      // Ask user for confirmation
      const outcome = await confirmationCallback(confirmationDetails);

      // Handle the confirmation outcome
      switch (outcome) {
        case ToolConfirmationOutcome.ProceedOnce:
        case ToolConfirmationOutcome.ProceedAlwaysTool:
        case ToolConfirmationOutcome.ProceedAlwaysServer:
          return true;
        case ToolConfirmationOutcome.Cancel:
        default:
          return false;
      }
    } catch (error: any) {
      console.error(`Error in tool confirmation for ${toolCall.name}:`, error);
      return false;
    }
  }

  /**
   * Convert MCP tool to UnifiedTool format.
   * @param tool MCP or native tool.
   * @returns Unified tool representation.
   */
  private convertMCPToUnified(tool: AnyDeclarativeTool): UnifiedTool {
    const parameters = (tool as any).parameterSchema || {};

    return {
      name: tool.name,
      description: tool.description || '',
      parameters: {
        type: 'object',
        properties: this.convertParameterProperties(
          parameters.properties || {},
        ),
        required: parameters.required || [],
      },
    };
  }

  /**
   * Convert parameter properties to unified format.
   * @param properties Parameter properties object.
   * @returns Unified parameter properties.
   */
  private convertParameterProperties(
    properties: Record<string, any>,
  ): Record<string, any> {
    const converted: Record<string, any> = {};

    for (const [key, prop] of Object.entries(properties)) {
      converted[key] = {
        type: prop.type || 'string',
        description: prop.description,
        ...(prop.enum && { enum: prop.enum }),
        ...(prop.default !== undefined && { default: prop.default }),
        ...(prop.minimum !== undefined && { minimum: prop.minimum }),
        ...(prop.maximum !== undefined && { maximum: prop.maximum }),
        ...(prop.minLength !== undefined && { minLength: prop.minLength }),
        ...(prop.maxLength !== undefined && { maxLength: prop.maxLength }),
        ...(prop.pattern && { pattern: prop.pattern }),
      };

      // Handle nested objects
      if (prop.properties) {
        converted[key].properties = this.convertParameterProperties(
          prop.properties,
        );
      }

      // Handle arrays
      if (prop.items) {
        converted[key].items = {
          type: prop.items.type || 'string',
          description: prop.items.description,
          ...(prop.items.properties && {
            properties: this.convertParameterProperties(prop.items.properties),
          }),
        };
      }
    }

    return converted;
  }

  /**
   * Refresh tools from a specific server.
   * Uses connection pool for managed reconnection.
   * @param serverName Name of the server to refresh.
   */
  async refreshServer(serverName: string): Promise<void> {
    console.log(`🔄 Refreshing tools from server: ${serverName}`);

    // Remove existing tools from this server
    for (const [toolName, tool] of this.mcpTools.entries()) {
      if (tool.serverName === serverName) {
        this.mcpTools.delete(toolName);
      }
    }

    // Remove connection from pool (will close it gracefully)
    await this.connectionPool.removeConnection(serverName);
    this.serverConnections.delete(serverName);

    // Reconnect to the server
    const mcpServers = this.config.getMcpServers() || {};
    const serverConfig = mcpServers[serverName];

    if (serverConfig) {
      await this.connectToServer(serverName, serverConfig);
    } else {
      console.warn(`⚠️ Server configuration not found for: ${serverName}`);
    }
  }

  /**
   * Refresh all MCP connections and tools.
   * Uses connection pool for graceful shutdown and restart.
   */
  async refreshAllServers(): Promise<void> {
    console.log('🔄 Refreshing all MCP servers...');

    // Clear all existing tools and connections
    this.mcpTools.clear();
    this.serverConnections.clear();
    this.connectionPromises.clear();

    // Close all connections in the pool
    await this.connectionPool.closeAll();

    // Recreate connection pool
    const poolConfig = createDefaultMCPPoolConfig();
    this.connectionPool = new MCPConnectionPool(poolConfig);

    this.isInitialized = false;

    // Re-initialize
    await this.initialize();
  }

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
    servers: Record<
      string,
      {
        connected: boolean;
        toolCount: number;
        connectionStats?: MCPConnectionStats;
      }
    >;
    poolStats: {
      totalConnections: number;
      activeConnections: number;
      failedConnections: number;
      totalRequests: number;
      successfulRequests: number;
    };
  } {
    const nativeTools = this.toolRegistry
      .getAllTools()
      .filter((tool) => !(tool instanceof DiscoveredMCPTool));

    const serverStats: Record<
      string,
      {
        connected: boolean;
        toolCount: number;
        connectionStats?: MCPConnectionStats;
      }
    > = {};

    // Count tools per server
    const toolCountsByServer: Record<string, number> = {};
    for (const tool of this.mcpTools.values()) {
      toolCountsByServer[tool.serverName] =
        (toolCountsByServer[tool.serverName] || 0) + 1;
    }

    // Get connection pool statistics
    const allConnectionStats = this.connectionPool.getAllStats();
    const poolStats = this.connectionPool.getPoolStats();

    // Build server statistics with connection details
    const mcpServers = this.config.getMcpServers() || {};
    for (const serverName of Object.keys(mcpServers)) {
      const connectionStats = allConnectionStats[serverName];
      serverStats[serverName] = {
        connected: connectionStats?.state === MCPConnectionState.CONNECTED,
        toolCount: toolCountsByServer[serverName] || 0,
        connectionStats,
      };
    }

    return {
      connectedServers: poolStats.activeConnections,
      totalTools: this.mcpTools.size + nativeTools.length,
      mcpTools: this.mcpTools.size,
      nativeTools: nativeTools.length,
      servers: serverStats,
      poolStats,
    };
  }

  /**
   * Check if the manager is properly initialized.
   * @returns True if initialized, false otherwise.
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Wait for initialization to complete.
   * @param timeoutMs Maximum time to wait in milliseconds.
   * @returns Promise resolving when ready or rejecting on timeout.
   */
  async waitForReady(timeoutMs: number = 30000): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    return new Promise((resolve, reject) => {
      const checkReady = () => {
        if (this.isInitialized) {
          resolve();
        } else {
          setTimeout(checkReady, 100);
        }
      };

      const timeout = setTimeout(() => {
        reject(
          new Error(
            `MCP Tool Manager failed to initialize within ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);

      checkReady();

      // Clear timeout when resolved
      resolve = ((originalResolve) => () => {
        clearTimeout(timeout);
        originalResolve();
      })(resolve);
    });
  }

  /**
   * Get detailed health status of all connections.
   * @returns Health check results for all servers.
   */
  async getHealthStatus(): Promise<Record<string, boolean>> {
    return await this.connectionPool.performHealthChecks();
  }

  /**
   * Get detailed connection statistics for a specific server.
   * @param serverName Name of the server.
   * @returns Connection statistics or null if not found.
   */
  getConnectionStats(serverName: string): MCPConnectionStats | null {
    const connection = this.serverConnections.get(serverName);
    return connection ? connection.getStats() : null;
  }

  /**
   * Execute an MCP request on a specific server with retry logic.
   * @param serverName Name of the server.
   * @param method MCP method to call.
   * @param params Parameters for the method.
   * @param options Execution options.
   * @returns Promise resolving to the result.
   */
  async executeServerRequest<T = any>(
    serverName: string,
    method: string,
    params?: any,
    options?: { timeout?: number; retries?: number },
  ): Promise<T> {
    const connection = this.serverConnections.get(serverName);
    if (!connection) {
      throw new Error(`No connection found for server: ${serverName}`);
    }

    return await connection.executeRequest<T>(method, params, options);
  }

  /**
   * Create a combined abort signal from multiple sources.
   * @param signals Abort signals to combine.
   * @returns Combined abort signal.
   */
  private createCombinedAbortSignal(
    ...signals: (AbortSignal | undefined)[]
  ): AbortSignal {
    const validSignals = signals.filter(
      (s): s is AbortSignal => s !== undefined,
    );

    if (validSignals.length === 0) {
      return new AbortController().signal;
    }

    if (validSignals.length === 1) {
      return validSignals[0];
    }

    const controller = new AbortController();

    // If any signal is already aborted, abort immediately
    for (const signal of validSignals) {
      if (signal.aborted) {
        controller.abort();
        return controller.signal;
      }
    }

    // Set up listeners for all signals
    const handlers = validSignals.map((signal) => {
      const handler = () => controller.abort();
      signal.addEventListener('abort', handler);
      return { signal, handler };
    });

    // Clean up listeners when the combined signal is aborted
    controller.signal.addEventListener('abort', () => {
      handlers.forEach(({ signal, handler }) => {
        signal.removeEventListener('abort', handler);
      });
    });

    return controller.signal;
  }

  /**
   * Get timeout manager statistics.
   * @returns Timeout statistics.
   */
  getTimeoutStats() {
    return this.timeoutManager.getStats();
  }

  /**
   * Get memory usage statistics.
   * @returns Memory statistics.
   */
  getMemoryStats() {
    return this.memoryManager.getMemoryStats();
  }

  /**
   * Force memory cleanup for tool executions.
   * @param aggressive Whether to perform aggressive cleanup.
   */
  async forceMemoryCleanup(aggressive: boolean = false): Promise<void> {
    await this.memoryManager.performCleanup(aggressive);

    // Also cleanup result cache during memory pressure
    if (aggressive) {
      await this.resultCache.cleanup(true);
    }
  }

  /**
   * Get result cache statistics.
   * @returns Cache statistics.
   */
  getCacheStats() {
    return this.resultCache.getStats();
  }

  /**
   * Invalidate cached results for a specific tool.
   * @param toolName Tool name to invalidate.
   * @returns Number of invalidated entries.
   */
  invalidateCache(toolName: string): number {
    return this.resultCache.invalidate(toolName, 'mcp-manager');
  }

  /**
   * Clear all cached results.
   */
  clearCache(): void {
    this.resultCache.clear('mcp-manager');
  }

  /**
   * Cleanup resources when shutting down.
   * Uses connection pool, timeout manager, memory manager, and result cache for graceful shutdown.
   */
  async dispose(): Promise<void> {
    console.log('🧹 Disposing MCP Tool Manager...');

    // Shutdown result cache first
    await this.resultCache.shutdown();

    // Shutdown memory manager to cleanup tool executions
    await this.memoryManager.shutdown();

    // Cancel all active timeouts
    await this.timeoutManager.cancelAll('MCP Tool Manager disposal');

    // Close all connections through the pool
    await this.connectionPool.closeAll();

    // Clear all state
    this.mcpTools.clear();
    this.serverConnections.clear();
    this.connectionPromises.clear();
    this.isInitialized = false;

    console.log('✅ MCP Tool Manager disposed');
  }
}
