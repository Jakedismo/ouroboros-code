/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { MCPServerConfig } from './mcp-tool-manager.js';

/**
 * Connection state for an MCP server.
 */
export enum MCPConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  FAILED = 'failed',
}

/**
 * Connection statistics for monitoring.
 */
export interface MCPConnectionStats {
  serverName: string;
  state: MCPConnectionState;
  connectedAt?: Date;
  disconnectedAt?: Date;
  reconnectAttempts: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  lastError?: string;
}

/**
 * Connection configuration with retry settings.
 */
export interface MCPConnectionConfig extends MCPServerConfig {
  maxRetries: number;
  retryDelayMs: number;
  maxRetryDelayMs: number;
  connectionTimeoutMs: number;
  healthCheckIntervalMs: number;
  enableAutoReconnect: boolean;
}

/**
 * Connection pool configuration.
 */
export interface MCPConnectionPoolConfig {
  maxConnections: number;
  maxIdleTime: number;
  poolCheckInterval: number;
  enableConnectionSharing: boolean;
}

/**
 * Managed connection to an MCP server with automatic reconnection.
 */
export class MCPManagedConnection extends EventEmitter {
  private client: any = null;
  private state: MCPConnectionState = MCPConnectionState.DISCONNECTED;
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private requestStats: { count: number; totalTime: number } = {
    count: 0,
    totalTime: 0,
  };
  private connectionStats: MCPConnectionStats;

  constructor(
    private serverName: string,
    private config: MCPConnectionConfig,
  ) {
    super();
    this.connectionStats = {
      serverName,
      state: MCPConnectionState.DISCONNECTED,
      reconnectAttempts: 0,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
    };
  }

  /**
   * Connect to the MCP server.
   */
  async connect(): Promise<void> {
    if (
      this.state === MCPConnectionState.CONNECTING ||
      this.state === MCPConnectionState.CONNECTED
    ) {
      return;
    }

    this.setState(MCPConnectionState.CONNECTING);

    try {
      // Import MCP client dynamically
      const { Client } = await import(
        '@modelcontextprotocol/sdk/client/index.js'
      );
      const { StdioClientTransport } = await import(
        '@modelcontextprotocol/sdk/client/stdio.js'
      );

      // Create transport and client
      if (!this.config.command) {
        throw new Error(`MCP server ${this.serverName} missing required command`);
      }
      
      const transport = new StdioClientTransport({
        command: this.config.command,
        args: this.config.args || [],
        env: this.config.env || {},
      });

      this.client = new Client(
        {
          name: 'mcp-multi-provider-client',
          version: '1.0.0',
        },
        {
          capabilities: {},
        },
      );

      // Set connection timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error('Connection timeout')),
          this.config.connectionTimeoutMs,
        );
      });

      await Promise.race([this.client.connect(transport), timeoutPromise]);

      this.setState(MCPConnectionState.CONNECTED);
      this.reconnectAttempts = 0;
      this.connectionStats.connectedAt = new Date();

      // Start health check if enabled
      if (this.config.healthCheckIntervalMs > 0) {
        this.startHealthCheck();
      }

      this.emit('connected', this.serverName);
    } catch (error: any) {
      this.handleConnectionError(error);
      throw error;
    }
  }

  /**
   * Disconnect from the MCP server.
   */
  async disconnect(): Promise<void> {
    this.clearTimers();

    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        console.warn(`Error closing MCP client for ${this.serverName}:`, error);
      }
      this.client = null;
    }

    this.setState(MCPConnectionState.DISCONNECTED);
    this.connectionStats.disconnectedAt = new Date();
    this.emit('disconnected', this.serverName);
  }

  /**
   * Execute an MCP request with automatic retry on failure.
   */
  async executeRequest<T = any>(
    method: string,
    params?: any,
    options: { timeout?: number; retries?: number } = {},
  ): Promise<T> {
    if (!this.isConnected()) {
      await this.ensureConnected();
    }

    const startTime = Date.now();
    const maxRetries = options.retries ?? 3;
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        this.connectionStats.totalRequests++;

        const result = await this.client.request({
          method,
          params,
        });

        // Update stats on success
        const responseTime = Date.now() - startTime;
        this.requestStats.count++;
        this.requestStats.totalTime += responseTime;
        this.connectionStats.successfulRequests++;
        this.connectionStats.averageResponseTime =
          this.requestStats.totalTime / this.requestStats.count;

        return result;
      } catch (error: any) {
        lastError = error;
        this.connectionStats.failedRequests++;
        this.connectionStats.lastError = error.message;

        // Check if this is a connection-level error
        if (this.isConnectionError(error)) {
          this.handleConnectionError(error);

          // Try to reconnect for connection errors
          if (attempt < maxRetries) {
            await this.waitBeforeRetry(attempt);
            await this.ensureConnected();
            continue;
          }
        }

        // For non-connection errors or final attempt, don't retry
        if (attempt === maxRetries) {
          break;
        }

        await this.waitBeforeRetry(attempt);
      }
    }

    throw lastError!;
  }

  /**
   * Get connection statistics.
   */
  getStats(): MCPConnectionStats {
    return { ...this.connectionStats, state: this.state };
  }

  /**
   * Get the underlying MCP client (for direct access if needed).
   */
  getClient(): any {
    return this.client;
  }

  /**
   * Check if the connection is healthy.
   */
  isConnected(): boolean {
    return this.state === MCPConnectionState.CONNECTED && this.client !== null;
  }

  /**
   * Force a health check.
   */
  async performHealthCheck(): Promise<boolean> {
    try {
      if (!this.client) {
        return false;
      }

      // Try a simple ping/capabilities request
      await this.client.request({
        method: 'initialize',
        params: { capabilities: {} },
      });

      return true;
    } catch (error) {
      this.handleConnectionError(error as Error);
      return false;
    }
  }

  /**
   * Set the connection state and update statistics.
   */
  private setState(state: MCPConnectionState): void {
    const previousState = this.state;
    this.state = state;
    this.connectionStats.state = state;

    if (state !== previousState) {
      this.emit('stateChange', state, previousState);
    }
  }

  /**
   * Handle connection errors and trigger reconnection if enabled.
   */
  private handleConnectionError(error: Error): void {
    console.warn(`MCP connection error for ${this.serverName}:`, error);

    this.setState(MCPConnectionState.FAILED);
    this.connectionStats.lastError = error.message;

    if (
      this.config.enableAutoReconnect &&
      this.reconnectAttempts < this.config.maxRetries
    ) {
      this.scheduleReconnect();
    }

    this.emit('error', error);
  }

  /**
   * Check if an error is connection-related.
   */
  private isConnectionError(error: Error): boolean {
    const connectionErrorTypes = [
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'EPIPE',
      'Connection timeout',
    ];

    return connectionErrorTypes.some(
      (type) => error.message.includes(type) || error.name === type,
    );
  }

  /**
   * Ensure the connection is established, reconnecting if necessary.
   */
  private async ensureConnected(): Promise<void> {
    if (this.isConnected()) {
      return;
    }

    if (
      this.state === MCPConnectionState.CONNECTING ||
      this.state === MCPConnectionState.RECONNECTING
    ) {
      // Wait for current connection attempt to complete
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection attempt timeout'));
        }, this.config.connectionTimeoutMs);

        const onConnected = () => {
          clearTimeout(timeout);
          this.off('error', onError);
          resolve();
        };

        const onError = (error: Error) => {
          clearTimeout(timeout);
          this.off('connected', onConnected);
          reject(error);
        };

        this.once('connected', onConnected);
        this.once('error', onError);
      });
    }

    await this.connect();
  }

  /**
   * Schedule a reconnection attempt.
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delay = Math.min(
      this.config.retryDelayMs * Math.pow(2, this.reconnectAttempts),
      this.config.maxRetryDelayMs,
    );

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectAttempts++;
      this.connectionStats.reconnectAttempts++;
      this.setState(MCPConnectionState.RECONNECTING);

      try {
        await this.connect();
      } catch (_error) {
        // Connection failed, will be handled by handleConnectionError
      }
    }, delay);
  }

  /**
   * Start periodic health checks.
   */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(async () => {
      if (this.isConnected()) {
        const isHealthy = await this.performHealthCheck();
        if (!isHealthy) {
          this.handleConnectionError(new Error('Health check failed'));
        }
      }
    }, this.config.healthCheckIntervalMs);
  }

  /**
   * Wait before retrying a failed request.
   */
  private async waitBeforeRetry(attempt: number): Promise<void> {
    const delay = Math.min(
      this.config.retryDelayMs * Math.pow(2, attempt),
      this.config.maxRetryDelayMs,
    );

    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Clear all active timers.
   */
  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }
}

/**
 * Pool manager for MCP connections with connection sharing and lifecycle management.
 */
export class MCPConnectionPool extends EventEmitter {
  private connections = new Map<string, MCPManagedConnection>();
  private connectionStats = new Map<string, MCPConnectionStats>();
  private poolTimer: NodeJS.Timeout | null = null;

  constructor(private poolConfig: MCPConnectionPoolConfig) {
    super();
    this.startPoolMaintenance();
  }

  /**
   * Get or create a managed connection to an MCP server.
   */
  async getConnection(
    serverName: string,
    config: MCPConnectionConfig,
  ): Promise<MCPManagedConnection> {
    let connection = this.connections.get(serverName);

    if (!connection) {
      // Check pool limits
      if (this.connections.size >= this.poolConfig.maxConnections) {
        throw new Error(
          `Connection pool limit reached (${this.poolConfig.maxConnections})`,
        );
      }

      connection = new MCPManagedConnection(serverName, config);

      // Set up event listeners
      connection.on('connected', () =>
        this.emit('connectionEstablished', serverName),
      );
      connection.on('disconnected', () =>
        this.emit('connectionClosed', serverName),
      );
      connection.on('error', (error) =>
        this.emit('connectionError', serverName, error),
      );
      connection.on('stateChange', (newState, oldState) => {
        this.emit('connectionStateChange', serverName, newState, oldState);
      });

      this.connections.set(serverName, connection);
    }

    // Ensure connection is established
    if (!connection.isConnected()) {
      await connection.connect();
    }

    return connection;
  }

  /**
   * Remove and disconnect a connection from the pool.
   */
  async removeConnection(serverName: string): Promise<void> {
    const connection = this.connections.get(serverName);
    if (connection) {
      await connection.disconnect();
      this.connections.delete(serverName);
      this.connectionStats.delete(serverName);
      this.emit('connectionRemoved', serverName);
    }
  }

  /**
   * Get all connection statistics.
   */
  getAllStats(): Record<string, MCPConnectionStats> {
    const stats: Record<string, MCPConnectionStats> = {};

    for (const [serverName, connection] of this.connections) {
      stats[serverName] = connection.getStats();
    }

    return stats;
  }

  /**
   * Get pool-level statistics.
   */
  getPoolStats(): {
    totalConnections: number;
    activeConnections: number;
    failedConnections: number;
    totalRequests: number;
    successfulRequests: number;
  } {
    const allStats = this.getAllStats();
    const stats = Object.values(allStats);

    return {
      totalConnections: stats.length,
      activeConnections: stats.filter(
        (s) => s.state === MCPConnectionState.CONNECTED,
      ).length,
      failedConnections: stats.filter(
        (s) => s.state === MCPConnectionState.FAILED,
      ).length,
      totalRequests: stats.reduce((sum, s) => sum + s.totalRequests, 0),
      successfulRequests: stats.reduce(
        (sum, s) => sum + s.successfulRequests,
        0,
      ),
    };
  }

  /**
   * Perform health checks on all connections.
   */
  async performHealthChecks(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    const healthCheckPromises = Array.from(this.connections.entries()).map(
      async ([serverName, connection]) => {
        results[serverName] = await connection.performHealthCheck();
        return results[serverName];
      },
    );

    await Promise.allSettled(healthCheckPromises);
    return results;
  }

  /**
   * Close all connections and clean up the pool.
   */
  async closeAll(): Promise<void> {
    // Stop pool maintenance
    if (this.poolTimer) {
      clearInterval(this.poolTimer);
      this.poolTimer = null;
    }

    // Close all connections
    const closePromises = Array.from(this.connections.values()).map(
      (connection) => connection.disconnect(),
    );

    await Promise.allSettled(closePromises);

    this.connections.clear();
    this.connectionStats.clear();
    this.emit('poolClosed');
  }

  /**
   * Start periodic pool maintenance.
   */
  private startPoolMaintenance(): void {
    this.poolTimer = setInterval(async () => {
      await this.performPoolMaintenance();
    }, this.poolConfig.poolCheckInterval);
  }

  /**
   * Perform pool maintenance tasks.
   */
  private async performPoolMaintenance(): Promise<void> {
    const now = Date.now();
    const connectionsToRemove: string[] = [];

    // Check for idle connections to clean up
    for (const [serverName, connection] of this.connections) {
      const stats = connection.getStats();

      // Remove failed connections that haven't been used recently
      if (
        stats.state === MCPConnectionState.FAILED &&
        stats.disconnectedAt &&
        now - stats.disconnectedAt.getTime() > this.poolConfig.maxIdleTime
      ) {
        connectionsToRemove.push(serverName);
      }
    }

    // Clean up identified connections
    for (const serverName of connectionsToRemove) {
      await this.removeConnection(serverName);
    }

    // Emit maintenance event
    if (connectionsToRemove.length > 0) {
      this.emit('poolMaintenance', {
        removedConnections: connectionsToRemove,
        activeConnections: this.connections.size,
      });
    }
  }
}

/**
 * Default connection configuration factory.
 */
export function createDefaultMCPConnectionConfig(
  baseConfig: MCPServerConfig,
): MCPConnectionConfig {
  return {
    ...baseConfig,
    maxRetries: 3,
    retryDelayMs: 1000,
    maxRetryDelayMs: 30000,
    connectionTimeoutMs: 10000,
    healthCheckIntervalMs: 60000, // 1 minute
    enableAutoReconnect: true,
  };
}

/**
 * Default pool configuration.
 */
export function createDefaultMCPPoolConfig(): MCPConnectionPoolConfig {
  return {
    maxConnections: 20,
    maxIdleTime: 300000, // 5 minutes
    poolCheckInterval: 60000, // 1 minute
    enableConnectionSharing: true,
  };
}
