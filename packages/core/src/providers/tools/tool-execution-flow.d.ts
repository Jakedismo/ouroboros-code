/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Config } from '../../config/config.js';
import { UnifiedToolCall, UnifiedToolResult } from './unified-tool-interface.js';
import { ToolConfirmationOutcome } from '../../tools/tools.js';
import { MCPToolManager } from './mcp-tool-manager.js';
import { ProviderToolError } from './error-handling.js';
import { TimeoutManager } from './timeout-manager.js';
/**
 * Execution context for tool operations.
 */
export interface ToolExecutionContext {
    config: Config;
    abortSignal: AbortSignal;
    onProgress?: (message: string, toolName?: string) => void;
    onConfirmation?: (details: any) => Promise<ToolConfirmationOutcome>;
    maxConcurrentTools?: number;
    timeoutMs?: number;
    retryAttempts?: number;
    providerId: string;
}
/**
 * Progress information for tool execution.
 */
export interface ToolExecutionProgress {
    toolName: string;
    status: 'pending' | 'confirming' | 'executing' | 'completed' | 'failed';
    startTime: number;
    endTime?: number;
    error?: string;
    attemptNumber: number;
}
/**
 * Configuration for parallel tool execution.
 */
export interface ParallelExecutionConfig {
    maxConcurrency: number;
    timeoutMs: number;
    retryAttempts: number;
    retryDelay: number;
    failFast: boolean;
}
/**
 * Result of parallel tool execution.
 */
export interface ParallelExecutionResult {
    results: UnifiedToolResult[];
    summary: {
        totalTools: number;
        successful: number;
        failed: number;
        skipped: number;
        totalDuration: number;
    };
    errors: ProviderToolError[];
}
/**
 * Orchestrates tool execution with support for parallel processing,
 * progress tracking, confirmation handling, and timeout management.
 */
export declare class ToolExecutionOrchestrator {
    private readonly mcpManager;
    private readonly context;
    private readonly progressMap;
    private readonly timeoutManager;
    constructor(mcpManager: MCPToolManager, context: ToolExecutionContext, timeoutManager?: TimeoutManager);
    /**
     * Execute multiple tool calls in parallel with proper error handling.
     * @param toolCalls Array of tool calls to execute.
     * @param config Optional configuration for parallel execution.
     * @returns Promise resolving to execution results.
     */
    executeToolCallsInParallel(toolCalls: UnifiedToolCall[], config?: Partial<ParallelExecutionConfig>): Promise<ParallelExecutionResult>;
    /**
     * Execute multiple tool calls sequentially with proper error handling.
     * @param toolCalls Array of tool calls to execute.
     * @returns Promise resolving to execution results.
     */
    executeToolCallsSequentially(toolCalls: UnifiedToolCall[]): Promise<ParallelExecutionResult>;
    /**
     * Execute a single tool call with timeout, confirmation and progress handling.
     * @param toolCall Tool call to execute.
     * @param customTimeoutMs Optional custom timeout override.
     * @returns Promise resolving to unified tool result.
     */
    executeToolCall(toolCall: UnifiedToolCall, customTimeoutMs?: number): Promise<UnifiedToolResult>;
    /**
     * Execute a tool call with retry logic.
     * @param toolCall Tool call to execute.
     * @param config Execution configuration.
     * @returns Promise resolving to unified tool result.
     */
    private executeToolCallWithRetry;
    /**
     * Default confirmation handler that auto-approves tools.
     * @param details Confirmation details.
     * @returns Promise resolving to confirmation outcome.
     */
    private defaultConfirmationHandler;
    /**
     * Update progress for a tool execution.
     * @param toolCallId Tool call ID.
     * @param status New status.
     * @param error Optional error message.
     */
    private updateProgress;
    /**
     * Create a combined abort signal from multiple sources.
     * @param signals Abort signals to combine.
     * @returns Combined abort controller.
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
     * Get currently active tool timeouts.
     * @returns Array of active timeout contexts.
     */
    getActiveTimeouts(): import("./timeout-manager.js").TimeoutContext[];
    /**
     * Cancel all active timeouts and clean up.
     * @param reason Reason for cancellation.
     */
    dispose(reason?: string): Promise<void>;
    /**
     * Log progress message.
     * @param message Progress message.
     * @param toolName Optional tool name.
     */
    private logProgress;
    /**
     * Get current progress for all tools.
     * @returns Map of tool call ID to progress information.
     */
    getProgress(): Map<string, ToolExecutionProgress>;
    /**
     * Get progress summary.
     * @returns Object with aggregated progress information.
     */
    getProgressSummary(): {
        total: number;
        pending: number;
        confirming: number;
        executing: number;
        completed: number;
        failed: number;
    };
    /**
     * Clear progress tracking.
     */
    clearProgress(): void;
}
