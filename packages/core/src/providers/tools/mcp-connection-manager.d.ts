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
export declare enum MCPConnectionState {
    DISCONNECTED = "disconnected",
    CONNECTING = "connecting",
    CONNECTED = "connected",
    RECONNECTING = "reconnecting",
    FAILED = "failed"
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
export declare class MCPManagedConnection extends EventEmitter {
    private serverName;
    private config;
    private client;
    private state;
    private reconnectAttempts;
    private reconnectTimer;
    private healthCheckTimer;
    private requestStats;
    private connectionStats;
    constructor(serverName: string, config: MCPConnectionConfig);
    /**
     * Connect to the MCP server.
     */
    connect(): Promise<void>;
    /**
     * Disconnect from the MCP server.
     */
    disconnect(): Promise<void>;
    /**
     * Execute an MCP request with automatic retry on failure.
     */
    executeRequest<T = any>(method: string, params?: any, options?: {
        timeout?: number;
        retries?: number;
    }): Promise<T>;
    /**
     * Get connection statistics.
     */
    getStats(): MCPConnectionStats;
    /**
     * Get the underlying MCP client (for direct access if needed).
     */
    getClient(): any;
    /**
     * Check if the connection is healthy.
     */
    isConnected(): boolean;
    /**
     * Force a health check.
     */
    performHealthCheck(): Promise<boolean>;
    /**
     * Set the connection state and update statistics.
     */
    private setState;
    /**
     * Handle connection errors and trigger reconnection if enabled.
     */
    private handleConnectionError;
    /**
     * Check if an error is connection-related.
     */
    private isConnectionError;
    /**
     * Ensure the connection is established, reconnecting if necessary.
     */
    private ensureConnected;
    /**
     * Schedule a reconnection attempt.
     */
    private scheduleReconnect;
    /**
     * Start periodic health checks.
     */
    private startHealthCheck;
    /**
     * Wait before retrying a failed request.
     */
    private waitBeforeRetry;
    /**
     * Clear all active timers.
     */
    private clearTimers;
}
/**
 * Pool manager for MCP connections with connection sharing and lifecycle management.
 */
export declare class MCPConnectionPool extends EventEmitter {
    private poolConfig;
    private connections;
    private connectionStats;
    private poolTimer;
    constructor(poolConfig: MCPConnectionPoolConfig);
    /**
     * Get or create a managed connection to an MCP server.
     */
    getConnection(serverName: string, config: MCPConnectionConfig): Promise<MCPManagedConnection>;
    /**
     * Remove and disconnect a connection from the pool.
     */
    removeConnection(serverName: string): Promise<void>;
    /**
     * Get all connection statistics.
     */
    getAllStats(): Record<string, MCPConnectionStats>;
    /**
     * Get pool-level statistics.
     */
    getPoolStats(): {
        totalConnections: number;
        activeConnections: number;
        failedConnections: number;
        totalRequests: number;
        successfulRequests: number;
    };
    /**
     * Perform health checks on all connections.
     */
    performHealthChecks(): Promise<Record<string, boolean>>;
    /**
     * Close all connections and clean up the pool.
     */
    closeAll(): Promise<void>;
    /**
     * Start periodic pool maintenance.
     */
    private startPoolMaintenance;
    /**
     * Perform pool maintenance tasks.
     */
    private performPoolMaintenance;
}
/**
 * Default connection configuration factory.
 */
export declare function createDefaultMCPConnectionConfig(baseConfig: MCPServerConfig): MCPConnectionConfig;
/**
 * Default pool configuration.
 */
export declare function createDefaultMCPPoolConfig(): MCPConnectionPoolConfig;
