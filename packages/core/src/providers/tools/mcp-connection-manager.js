/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { EventEmitter } from 'events';
/**
 * Connection state for an MCP server.
 */
export var MCPConnectionState;
(function (MCPConnectionState) {
    MCPConnectionState["DISCONNECTED"] = "disconnected";
    MCPConnectionState["CONNECTING"] = "connecting";
    MCPConnectionState["CONNECTED"] = "connected";
    MCPConnectionState["RECONNECTING"] = "reconnecting";
    MCPConnectionState["FAILED"] = "failed";
})(MCPConnectionState || (MCPConnectionState = {}));
/**
 * Managed connection to an MCP server with automatic reconnection.
 */
export class MCPManagedConnection extends EventEmitter {
    serverName;
    config;
    client = null;
    state = MCPConnectionState.DISCONNECTED;
    reconnectAttempts = 0;
    reconnectTimer = null;
    healthCheckTimer = null;
    requestStats = {
        count: 0,
        totalTime: 0,
    };
    connectionStats;
    constructor(serverName, config) {
        super();
        this.serverName = serverName;
        this.config = config;
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
    async connect() {
        if (this.state === MCPConnectionState.CONNECTING ||
            this.state === MCPConnectionState.CONNECTED) {
            return;
        }
        this.setState(MCPConnectionState.CONNECTING);
        try {
            // Import MCP client dynamically
            const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
            const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
            // Create transport and client
            const transport = new StdioClientTransport({
                command: this.config.command,
                args: this.config.args || [],
                env: this.config.env || {},
            });
            this.client = new Client({
                name: 'mcp-multi-provider-client',
                version: '1.0.0',
            }, {
                capabilities: {},
            });
            // Set connection timeout
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Connection timeout')), this.config.connectionTimeoutMs);
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
        }
        catch (error) {
            this.handleConnectionError(error);
            throw error;
        }
    }
    /**
     * Disconnect from the MCP server.
     */
    async disconnect() {
        this.clearTimers();
        if (this.client) {
            try {
                await this.client.close();
            }
            catch (error) {
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
    async executeRequest(method, params, options = {}) {
        if (!this.isConnected()) {
            await this.ensureConnected();
        }
        const startTime = Date.now();
        const maxRetries = options.retries ?? 3;
        let lastError;
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
            }
            catch (error) {
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
        throw lastError;
    }
    /**
     * Get connection statistics.
     */
    getStats() {
        return { ...this.connectionStats, state: this.state };
    }
    /**
     * Get the underlying MCP client (for direct access if needed).
     */
    getClient() {
        return this.client;
    }
    /**
     * Check if the connection is healthy.
     */
    isConnected() {
        return this.state === MCPConnectionState.CONNECTED && this.client !== null;
    }
    /**
     * Force a health check.
     */
    async performHealthCheck() {
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
        }
        catch (error) {
            this.handleConnectionError(error);
            return false;
        }
    }
    /**
     * Set the connection state and update statistics.
     */
    setState(state) {
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
    handleConnectionError(error) {
        console.warn(`MCP connection error for ${this.serverName}:`, error);
        this.setState(MCPConnectionState.FAILED);
        this.connectionStats.lastError = error.message;
        if (this.config.enableAutoReconnect &&
            this.reconnectAttempts < this.config.maxRetries) {
            this.scheduleReconnect();
        }
        this.emit('error', error);
    }
    /**
     * Check if an error is connection-related.
     */
    isConnectionError(error) {
        const connectionErrorTypes = [
            'ECONNREFUSED',
            'ENOTFOUND',
            'ETIMEDOUT',
            'EPIPE',
            'Connection timeout',
        ];
        return connectionErrorTypes.some((type) => error.message.includes(type) || error.name === type);
    }
    /**
     * Ensure the connection is established, reconnecting if necessary.
     */
    async ensureConnected() {
        if (this.isConnected()) {
            return;
        }
        if (this.state === MCPConnectionState.CONNECTING ||
            this.state === MCPConnectionState.RECONNECTING) {
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
                const onError = (error) => {
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
    scheduleReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        const delay = Math.min(this.config.retryDelayMs * Math.pow(2, this.reconnectAttempts), this.config.maxRetryDelayMs);
        this.reconnectTimer = setTimeout(async () => {
            this.reconnectAttempts++;
            this.connectionStats.reconnectAttempts++;
            this.setState(MCPConnectionState.RECONNECTING);
            try {
                await this.connect();
            }
            catch (_error) {
                // Connection failed, will be handled by handleConnectionError
            }
        }, delay);
    }
    /**
     * Start periodic health checks.
     */
    startHealthCheck() {
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
    async waitBeforeRetry(attempt) {
        const delay = Math.min(this.config.retryDelayMs * Math.pow(2, attempt), this.config.maxRetryDelayMs);
        await new Promise((resolve) => setTimeout(resolve, delay));
    }
    /**
     * Clear all active timers.
     */
    clearTimers() {
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
    poolConfig;
    connections = new Map();
    connectionStats = new Map();
    poolTimer = null;
    constructor(poolConfig) {
        super();
        this.poolConfig = poolConfig;
        this.startPoolMaintenance();
    }
    /**
     * Get or create a managed connection to an MCP server.
     */
    async getConnection(serverName, config) {
        let connection = this.connections.get(serverName);
        if (!connection) {
            // Check pool limits
            if (this.connections.size >= this.poolConfig.maxConnections) {
                throw new Error(`Connection pool limit reached (${this.poolConfig.maxConnections})`);
            }
            connection = new MCPManagedConnection(serverName, config);
            // Set up event listeners
            connection.on('connected', () => this.emit('connectionEstablished', serverName));
            connection.on('disconnected', () => this.emit('connectionClosed', serverName));
            connection.on('error', (error) => this.emit('connectionError', serverName, error));
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
    async removeConnection(serverName) {
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
    getAllStats() {
        const stats = {};
        for (const [serverName, connection] of this.connections) {
            stats[serverName] = connection.getStats();
        }
        return stats;
    }
    /**
     * Get pool-level statistics.
     */
    getPoolStats() {
        const allStats = this.getAllStats();
        const stats = Object.values(allStats);
        return {
            totalConnections: stats.length,
            activeConnections: stats.filter((s) => s.state === MCPConnectionState.CONNECTED).length,
            failedConnections: stats.filter((s) => s.state === MCPConnectionState.FAILED).length,
            totalRequests: stats.reduce((sum, s) => sum + s.totalRequests, 0),
            successfulRequests: stats.reduce((sum, s) => sum + s.successfulRequests, 0),
        };
    }
    /**
     * Perform health checks on all connections.
     */
    async performHealthChecks() {
        const results = {};
        const healthCheckPromises = Array.from(this.connections.entries()).map(async ([serverName, connection]) => {
            results[serverName] = await connection.performHealthCheck();
            return results[serverName];
        });
        await Promise.allSettled(healthCheckPromises);
        return results;
    }
    /**
     * Close all connections and clean up the pool.
     */
    async closeAll() {
        // Stop pool maintenance
        if (this.poolTimer) {
            clearInterval(this.poolTimer);
            this.poolTimer = null;
        }
        // Close all connections
        const closePromises = Array.from(this.connections.values()).map((connection) => connection.disconnect());
        await Promise.allSettled(closePromises);
        this.connections.clear();
        this.connectionStats.clear();
        this.emit('poolClosed');
    }
    /**
     * Start periodic pool maintenance.
     */
    startPoolMaintenance() {
        this.poolTimer = setInterval(async () => {
            await this.performPoolMaintenance();
        }, this.poolConfig.poolCheckInterval);
    }
    /**
     * Perform pool maintenance tasks.
     */
    async performPoolMaintenance() {
        const now = Date.now();
        const connectionsToRemove = [];
        // Check for idle connections to clean up
        for (const [serverName, connection] of this.connections) {
            const stats = connection.getStats();
            // Remove failed connections that haven't been used recently
            if (stats.state === MCPConnectionState.FAILED &&
                stats.disconnectedAt &&
                now - stats.disconnectedAt.getTime() > this.poolConfig.maxIdleTime) {
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
export function createDefaultMCPConnectionConfig(baseConfig) {
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
export function createDefaultMCPPoolConfig() {
    return {
        maxConnections: 20,
        maxIdleTime: 300000, // 5 minutes
        poolCheckInterval: 60000, // 1 minute
        enableConnectionSharing: true,
    };
}
//# sourceMappingURL=mcp-connection-manager.js.map