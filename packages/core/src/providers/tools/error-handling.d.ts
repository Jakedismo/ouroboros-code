/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { UnifiedToolResult } from './unified-tool-interface.js';
/**
 * Base class for all provider tool-related errors.
 */
export declare abstract class ProviderToolError extends Error {
    readonly cause?: Error | undefined;
    abstract readonly type: string;
    constructor(message: string, cause?: Error | undefined);
    /**
     * Get a detailed error description including cause if available.
     */
    getDetailedMessage(): string;
    /**
     * Convert to a unified tool result for consistent error handling.
     */
    toUnifiedResult(toolCallId: string): UnifiedToolResult;
}
/**
 * Error thrown when tool execution fails.
 */
export declare class ToolExecutionError extends ProviderToolError {
    readonly toolName: string;
    readonly providerId: string;
    readonly type = "TOOL_EXECUTION_ERROR";
    constructor(message: string, toolName: string, providerId: string, cause?: Error);
    static fromError(error: Error, toolName: string, providerId: string): ToolExecutionError;
    static timeout(toolName: string, providerId: string, timeoutMs: number): ToolExecutionError;
    static invalidParameters(toolName: string, providerId: string, reason: string): ToolExecutionError;
}
/**
 * Error thrown when tool format conversion fails.
 */
export declare class ToolConversionError extends ProviderToolError {
    readonly sourceFormat: string;
    readonly targetFormat: string;
    readonly type = "TOOL_CONVERSION_ERROR";
    constructor(message: string, sourceFormat: string, targetFormat: string, cause?: Error);
    static schemaConversion(sourceFormat: string, targetFormat: string, details: string): ToolConversionError;
    static toolCallConversion(sourceFormat: string, targetFormat: string, toolName: string, details: string): ToolConversionError;
    static resultConversion(sourceFormat: string, targetFormat: string, toolName: string, details: string): ToolConversionError;
}
/**
 * Error thrown when MCP server connection fails or encounters issues.
 */
export declare class MCPConnectionError extends ProviderToolError {
    readonly serverName: string;
    readonly type = "MCP_CONNECTION_ERROR";
    constructor(message: string, serverName: string, cause?: Error);
    static connectionFailed(serverName: string, details: string): MCPConnectionError;
    static connectionLost(serverName: string): MCPConnectionError;
    static serverUnavailable(serverName: string): MCPConnectionError;
    static toolDiscoveryFailed(serverName: string, details: string): MCPConnectionError;
    static configurationError(serverName: string, details: string): MCPConnectionError;
}
/**
 * Error thrown when provider initialization fails.
 */
export declare class ProviderInitializationError extends ProviderToolError {
    readonly providerId: string;
    readonly type = "PROVIDER_INITIALIZATION_ERROR";
    constructor(message: string, providerId: string, cause?: Error);
    static apiKeyMissing(providerId: string): ProviderInitializationError;
    static configurationInvalid(providerId: string, details: string): ProviderInitializationError;
    static mcpInitializationFailed(providerId: string, error: Error): ProviderInitializationError;
}
/**
 * Error thrown when tool confirmation is denied or fails.
 */
export declare class ToolConfirmationError extends ProviderToolError {
    readonly toolName: string;
    readonly reason: string;
    readonly type = "TOOL_CONFIRMATION_ERROR";
    constructor(message: string, toolName: string, reason: string);
    static denied(toolName: string): ToolConfirmationError;
    static confirmationFailed(toolName: string, error: Error): ToolConfirmationError;
}
/**
 * Context information for error handling.
 */
export interface ErrorContext {
    provider: string;
    tool?: string;
    toolCallId?: string;
    serverName?: string;
    operation?: string;
    timestamp: number;
    metadata?: Record<string, any>;
}
/**
 * Comprehensive error handling utility for provider tool operations.
 */
export declare class ErrorHandler {
    /**
     * Handle any error and convert to appropriate provider tool error.
     * @param error The original error.
     * @param context Context information about where the error occurred.
     * @returns Appropriate ProviderToolError subclass.
     */
    static handle(error: unknown, context: ErrorContext): ProviderToolError;
    /**
     * Handle tool error and create unified result.
     * @param error Any error that occurred during tool operations.
     * @param context Error context information.
     * @returns UnifiedToolResult representing the error.
     */
    static handleToolError(error: unknown, context: ErrorContext): UnifiedToolResult;
    /**
     * Create error context for tool execution.
     * @param provider Provider identifier.
     * @param toolName Tool name.
     * @param toolCallId Optional tool call ID.
     * @returns Error context object.
     */
    static createToolExecutionContext(provider: string, toolName: string, toolCallId?: string): ErrorContext;
    /**
     * Create error context for MCP operations.
     * @param provider Provider identifier.
     * @param serverName MCP server name.
     * @param operation Specific MCP operation.
     * @returns Error context object.
     */
    static createMCPContext(provider: string, serverName: string, operation: string): ErrorContext;
    /**
     * Create error context for tool conversion operations.
     * @param provider Provider identifier.
     * @param toolName Tool name being converted.
     * @returns Error context object.
     */
    static createConversionContext(provider: string, toolName: string): ErrorContext;
    /**
     * Log error with appropriate severity and context.
     * @param error The error to log.
     * @param context Error context.
     * @param level Log level (error, warn, info).
     */
    static logError(error: ProviderToolError, context: ErrorContext, level?: 'error' | 'warn' | 'info'): void;
    /**
     * Determine if an error is recoverable and should be retried.
     * @param error The error to check.
     * @returns True if the error is potentially recoverable.
     */
    static isRecoverable(error: ProviderToolError): boolean;
    /**
     * Get retry delay for recoverable errors.
     * @param error The error that occurred.
     * @param attemptNumber Current attempt number (0-based).
     * @returns Delay in milliseconds, or null if no retry should be attempted.
     */
    static getRetryDelay(error: ProviderToolError, attemptNumber: number): number | null;
}
