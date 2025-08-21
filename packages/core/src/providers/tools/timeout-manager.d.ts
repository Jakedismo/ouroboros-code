/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { EventEmitter } from 'events';
/**
 * Timeout configuration for different types of operations.
 */
export interface TimeoutConfig {
    /** Default timeout for tool execution in milliseconds */
    toolExecutionMs: number;
    /** Timeout for tool discovery operations in milliseconds */
    toolDiscoveryMs: number;
    /** Timeout for provider API requests in milliseconds */
    providerRequestMs: number;
    /** Timeout for MCP server connections in milliseconds */
    mcpConnectionMs: number;
    /** Timeout for tool confirmation prompts in milliseconds */
    confirmationMs: number;
    /** Grace period for cleanup operations in milliseconds */
    cleanupGraceMs: number;
}
/**
 * Timeout context for tracking active operations.
 */
export interface TimeoutContext {
    operationId: string;
    operationType: 'tool_execution' | 'tool_discovery' | 'provider_request' | 'mcp_connection' | 'confirmation';
    startTime: Date;
    timeoutMs: number;
    abortController: AbortController;
    metadata?: Record<string, unknown>;
}
/**
 * Timeout event details for monitoring and debugging.
 */
export interface TimeoutEvent {
    operationId: string;
    operationType: string;
    duration: number;
    timeoutMs: number;
    metadata?: Record<string, unknown>;
}
/**
 * Default timeout configuration values.
 */
export declare const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig;
/**
 * Timeout manager for handling all timeout operations across providers.
 * Provides centralized timeout management with monitoring and cleanup capabilities.
 */
export declare class TimeoutManager extends EventEmitter {
    private config;
    private activeTimeouts;
    private timeoutHandles;
    private cleanupTimer;
    private isShuttingDown;
    constructor(config?: TimeoutConfig);
    /**
     * Create a timeout context for an operation.
     * @param operationType Type of operation being timed.
     * @param customTimeoutMs Custom timeout override.
     * @param metadata Optional metadata for debugging.
     * @returns Timeout context with abort controller.
     */
    createTimeout(operationType: TimeoutContext['operationType'], customTimeoutMs?: number, metadata?: Record<string, unknown>): TimeoutContext;
    /**
     * Clear a timeout and mark the operation as completed.
     * @param operationId ID of the operation to clear.
     * @param successful Whether the operation completed successfully.
     */
    clearTimeout(operationId: string, successful?: boolean): void;
    /**
     * Execute an operation with timeout protection.
     * @param operation Async operation to execute.
     * @param operationType Type of operation.
     * @param customTimeoutMs Custom timeout override.
     * @param metadata Optional metadata.
     * @returns Promise resolving to operation result.
     */
    withTimeout<T>(operation: (abortSignal: AbortSignal) => Promise<T>, operationType: TimeoutContext['operationType'], customTimeoutMs?: number, metadata?: Record<string, unknown>): Promise<T>;
    /**
     * Execute a tool with timeout protection and automatic retry.
     * @param toolExecution Tool execution function.
     * @param toolName Name of the tool being executed.
     * @param customTimeoutMs Custom timeout override.
     * @param retryCount Number of retries on timeout.
     * @returns Promise resolving to tool result.
     */
    withToolTimeout<T>(toolExecution: (abortSignal: AbortSignal) => Promise<T>, toolName: string, customTimeoutMs?: number, retryCount?: number): Promise<T>;
    /**
     * Create a race condition between multiple operations with timeout.
     * @param operations Array of operations to race.
     * @param operationType Type of operations.
     * @param customTimeoutMs Custom timeout override.
     * @returns Promise resolving to the first successful result.
     */
    raceWithTimeout<T>(operations: Array<(abortSignal: AbortSignal) => Promise<T>>, operationType: TimeoutContext['operationType'], customTimeoutMs?: number): Promise<T>;
    /**
     * Get statistics about active and completed timeouts.
     * @returns Timeout statistics.
     */
    getStats(): {
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
     * Get all active timeout contexts.
     * @returns Array of active timeout contexts.
     */
    getActiveTimeouts(): TimeoutContext[];
    /**
     * Cancel all active timeouts and clean up.
     * @param reason Reason for cancellation.
     */
    cancelAll(reason?: string): Promise<void>;
    /**
     * Update timeout configuration.
     * @param newConfig New configuration values.
     */
    updateConfig(newConfig: Partial<TimeoutConfig>): void;
    /**
     * Handle timeout expiration.
     * @param operationId ID of the timed out operation.
     */
    private handleTimeout;
    /**
     * Get default timeout for operation type.
     * @param operationType Type of operation.
     * @returns Default timeout in milliseconds.
     */
    private getDefaultTimeout;
    /**
     * Generate unique operation ID.
     * @returns Unique operation identifier.
     */
    private generateOperationId;
    /**
     * Start periodic cleanup of stale timeout references.
     */
    private startCleanupTimer;
}
/**
 * Custom timeout error class.
 */
export declare class TimeoutError extends Error {
    readonly operationType: string;
    readonly timeoutMs: number;
    readonly metadata?: Record<string, unknown> | undefined;
    constructor(message: string, operationType: string, timeoutMs: number, metadata?: Record<string, unknown> | undefined);
}
/**
 * Create a default timeout manager instance.
 * @param config Optional configuration overrides.
 * @returns Configured timeout manager.
 */
export declare function createTimeoutManager(config?: Partial<TimeoutConfig>): TimeoutManager;
/**
 * Provider-specific timeout configurations.
 */
export declare const PROVIDER_TIMEOUT_CONFIGS: {
    readonly openai: {
        readonly toolExecutionMs: 45000;
        readonly providerRequestMs: 90000;
        readonly mcpConnectionMs: 15000;
    };
    readonly anthropic: {
        readonly toolExecutionMs: 60000;
        readonly providerRequestMs: 120000;
        readonly mcpConnectionMs: 12000;
    };
    readonly gemini: {
        readonly toolExecutionMs: 30000;
        readonly providerRequestMs: 60000;
        readonly mcpConnectionMs: 10000;
    };
};
/**
 * Get provider-specific timeout configuration.
 * @param providerType Provider type.
 * @returns Provider-specific timeout config.
 */
export declare function getProviderTimeoutConfig(providerType: 'openai' | 'anthropic' | 'gemini'): Partial<TimeoutConfig>;
