/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { UnifiedToolResult } from './unified-tool-interface.js';

/**
 * Base class for all provider tool-related errors.
 */
export abstract class ProviderToolError extends Error {
  abstract readonly type: string;

  constructor(
    message: string,
    readonly cause?: Error,
  ) {
    super(message);
    this.name = this.constructor.name;

    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Get a detailed error description including cause if available.
   */
  getDetailedMessage(): string {
    let message = this.message;
    if (this.cause) {
      message += ` (caused by: ${this.cause.message})`;
    }
    return message;
  }

  /**
   * Convert to a unified tool result for consistent error handling.
   */
  toUnifiedResult(toolCallId: string): UnifiedToolResult {
    return {
      toolCallId,
      content: this.getDetailedMessage(),
      error: {
        message: this.message,
        type: this.type,
      },
      isError: true,
      success: false,
    };
  }
}

/**
 * Error thrown when tool execution fails.
 */
export class ToolExecutionError extends ProviderToolError {
  readonly type = 'TOOL_EXECUTION_ERROR';

  constructor(
    message: string,
    readonly toolName: string,
    readonly providerId: string,
    cause?: Error,
  ) {
    super(message, cause);
  }

  static fromError(
    error: Error,
    toolName: string,
    providerId: string,
  ): ToolExecutionError {
    return new ToolExecutionError(
      `Tool '${toolName}' execution failed: ${error.message}`,
      toolName,
      providerId,
      error,
    );
  }

  static timeout(
    toolName: string,
    providerId: string,
    timeoutMs: number,
  ): ToolExecutionError {
    return new ToolExecutionError(
      `Tool '${toolName}' execution timed out after ${timeoutMs}ms`,
      toolName,
      providerId,
    );
  }

  static invalidParameters(
    toolName: string,
    providerId: string,
    reason: string,
  ): ToolExecutionError {
    return new ToolExecutionError(
      `Tool '${toolName}' received invalid parameters: ${reason}`,
      toolName,
      providerId,
    );
  }
}

/**
 * Error thrown when tool format conversion fails.
 */
export class ToolConversionError extends ProviderToolError {
  readonly type = 'TOOL_CONVERSION_ERROR';

  constructor(
    message: string,
    readonly sourceFormat: string,
    readonly targetFormat: string,
    cause?: Error,
  ) {
    super(message, cause);
  }

  static schemaConversion(
    sourceFormat: string,
    targetFormat: string,
    details: string,
  ): ToolConversionError {
    return new ToolConversionError(
      `Failed to convert tool schema from ${sourceFormat} to ${targetFormat}: ${details}`,
      sourceFormat,
      targetFormat,
    );
  }

  static toolCallConversion(
    sourceFormat: string,
    targetFormat: string,
    toolName: string,
    details: string,
  ): ToolConversionError {
    return new ToolConversionError(
      `Failed to convert tool call '${toolName}' from ${sourceFormat} to ${targetFormat}: ${details}`,
      sourceFormat,
      targetFormat,
    );
  }

  static resultConversion(
    sourceFormat: string,
    targetFormat: string,
    toolName: string,
    details: string,
  ): ToolConversionError {
    return new ToolConversionError(
      `Failed to convert tool result for '${toolName}' from ${sourceFormat} to ${targetFormat}: ${details}`,
      sourceFormat,
      targetFormat,
    );
  }
}

/**
 * Error thrown when MCP server connection fails or encounters issues.
 */
export class MCPConnectionError extends ProviderToolError {
  readonly type = 'MCP_CONNECTION_ERROR';

  constructor(
    message: string,
    readonly serverName: string,
    cause?: Error,
  ) {
    super(message, cause);
  }

  static connectionFailed(
    serverName: string,
    details: string,
  ): MCPConnectionError {
    return new MCPConnectionError(
      `Failed to connect to MCP server '${serverName}': ${details}`,
      serverName,
    );
  }

  static connectionLost(serverName: string): MCPConnectionError {
    return new MCPConnectionError(
      `Lost connection to MCP server '${serverName}'`,
      serverName,
    );
  }

  static serverUnavailable(serverName: string): MCPConnectionError {
    return new MCPConnectionError(
      `MCP server '${serverName}' is not available`,
      serverName,
    );
  }

  static toolDiscoveryFailed(
    serverName: string,
    details: string,
  ): MCPConnectionError {
    return new MCPConnectionError(
      `Failed to discover tools from MCP server '${serverName}': ${details}`,
      serverName,
    );
  }

  static configurationError(
    serverName: string,
    details: string,
  ): MCPConnectionError {
    return new MCPConnectionError(
      `Configuration error for MCP server '${serverName}': ${details}`,
      serverName,
    );
  }
}

/**
 * Error thrown when provider initialization fails.
 */
export class ProviderInitializationError extends ProviderToolError {
  readonly type = 'PROVIDER_INITIALIZATION_ERROR';

  constructor(
    message: string,
    readonly providerId: string,
    cause?: Error,
  ) {
    super(message, cause);
  }

  static apiKeyMissing(providerId: string): ProviderInitializationError {
    return new ProviderInitializationError(
      `API key missing for provider '${providerId}'`,
      providerId,
    );
  }

  static configurationInvalid(
    providerId: string,
    details: string,
  ): ProviderInitializationError {
    return new ProviderInitializationError(
      `Invalid configuration for provider '${providerId}': ${details}`,
      providerId,
    );
  }

  static mcpInitializationFailed(
    providerId: string,
    error: Error,
  ): ProviderInitializationError {
    return new ProviderInitializationError(
      `MCP initialization failed for provider '${providerId}': ${error.message}`,
      providerId,
      error,
    );
  }
}

/**
 * Error thrown when tool confirmation is denied or fails.
 */
export class ToolConfirmationError extends ProviderToolError {
  readonly type = 'TOOL_CONFIRMATION_ERROR';

  constructor(
    message: string,
    readonly toolName: string,
    readonly reason: string,
  ) {
    super(message);
  }

  static denied(toolName: string): ToolConfirmationError {
    return new ToolConfirmationError(
      `Tool execution denied by user: ${toolName}`,
      toolName,
      'user_denied',
    );
  }

  static confirmationFailed(
    toolName: string,
    error: Error,
  ): ToolConfirmationError {
    return new ToolConfirmationError(
      `Tool confirmation failed: ${toolName} (${error.message})`,
      toolName,
      'confirmation_failed',
    );
  }
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
export class ErrorHandler {
  /**
   * Handle any error and convert to appropriate provider tool error.
   * @param error The original error.
   * @param context Context information about where the error occurred.
   * @returns Appropriate ProviderToolError subclass.
   */
  static handle(error: unknown, context: ErrorContext): ProviderToolError {
    // If already a provider tool error, return as-is
    if (error instanceof ProviderToolError) {
      return error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error : undefined;

    // Categorize error based on context and error content
    if (context.operation === 'tool_execution') {
      return new ToolExecutionError(
        errorMessage,
        context.tool || 'unknown',
        context.provider,
        cause,
      );
    }

    if (context.operation === 'tool_conversion') {
      return new ToolConversionError(
        errorMessage,
        'unified',
        context.provider,
        cause,
      );
    }

    if (context.operation === 'mcp_connection') {
      return new MCPConnectionError(
        errorMessage,
        context.serverName || 'unknown',
        cause,
      );
    }

    if (context.operation === 'provider_initialization') {
      return new ProviderInitializationError(
        errorMessage,
        context.provider,
        cause,
      );
    }

    // Default to tool execution error
    return new ToolExecutionError(
      errorMessage,
      context.tool || 'unknown',
      context.provider,
      cause,
    );
  }

  /**
   * Handle tool error and create unified result.
   * @param error Any error that occurred during tool operations.
   * @param context Error context information.
   * @returns UnifiedToolResult representing the error.
   */
  static handleToolError(
    error: unknown,
    context: ErrorContext,
  ): UnifiedToolResult {
    const providerError = this.handle(error, context);
    const toolCallId = context.toolCallId || `error_${Date.now()}`;

    return providerError.toUnifiedResult(toolCallId);
  }

  /**
   * Create error context for tool execution.
   * @param provider Provider identifier.
   * @param toolName Tool name.
   * @param toolCallId Optional tool call ID.
   * @returns Error context object.
   */
  static createToolExecutionContext(
    provider: string,
    toolName: string,
    toolCallId?: string,
  ): ErrorContext {
    return {
      provider,
      tool: toolName,
      toolCallId,
      operation: 'tool_execution',
      timestamp: Date.now(),
    };
  }

  /**
   * Create error context for MCP operations.
   * @param provider Provider identifier.
   * @param serverName MCP server name.
   * @param operation Specific MCP operation.
   * @returns Error context object.
   */
  static createMCPContext(
    provider: string,
    serverName: string,
    operation: string,
  ): ErrorContext {
    return {
      provider,
      serverName,
      operation: 'mcp_connection',
      timestamp: Date.now(),
      metadata: { mcpOperation: operation },
    };
  }

  /**
   * Create error context for tool conversion operations.
   * @param provider Provider identifier.
   * @param toolName Tool name being converted.
   * @returns Error context object.
   */
  static createConversionContext(
    provider: string,
    toolName: string,
  ): ErrorContext {
    return {
      provider,
      tool: toolName,
      operation: 'tool_conversion',
      timestamp: Date.now(),
    };
  }

  /**
   * Log error with appropriate severity and context.
   * @param error The error to log.
   * @param context Error context.
   * @param level Log level (error, warn, info).
   */
  static logError(
    error: ProviderToolError,
    context: ErrorContext,
    level: 'error' | 'warn' | 'info' = 'error',
  ): void {
    const logData = {
      type: error.type,
      message: error.message,
      context,
      stack: error.stack,
      ...(error.cause && { cause: error.cause.message }),
    };

    switch (level) {
      case 'error':
        console.error('Provider tool error:', logData);
        break;
      case 'warn':
        console.warn('Provider tool warning:', logData);
        break;
      case 'info':
        console.info('Provider tool info:', logData);
        break;
    }
  }

  /**
   * Determine if an error is recoverable and should be retried.
   * @param error The error to check.
   * @returns True if the error is potentially recoverable.
   */
  static isRecoverable(error: ProviderToolError): boolean {
    // MCP connection errors might be recoverable
    if (error instanceof MCPConnectionError) {
      return true;
    }

    // Tool execution timeouts might be recoverable
    if (
      error instanceof ToolExecutionError &&
      error.message.includes('timeout')
    ) {
      return true;
    }

    // Conversion errors are typically not recoverable
    if (error instanceof ToolConversionError) {
      return false;
    }

    // Confirmation denials are not recoverable
    if (error instanceof ToolConfirmationError) {
      return false;
    }

    return false;
  }

  /**
   * Get retry delay for recoverable errors.
   * @param error The error that occurred.
   * @param attemptNumber Current attempt number (0-based).
   * @returns Delay in milliseconds, or null if no retry should be attempted.
   */
  static getRetryDelay(
    error: ProviderToolError,
    attemptNumber: number,
  ): number | null {
    if (!this.isRecoverable(error)) {
      return null;
    }

    // Exponential backoff with jitter
    const baseDelay = 1000; // 1 second
    const maxDelay = 30000; // 30 seconds
    const delay = Math.min(baseDelay * Math.pow(2, attemptNumber), maxDelay);

    // Add jitter (±20%)
    const jitter = 0.2;
    const jitteredDelay = delay * (1 + (Math.random() - 0.5) * 2 * jitter);

    return Math.floor(jitteredDelay);
  }
}
