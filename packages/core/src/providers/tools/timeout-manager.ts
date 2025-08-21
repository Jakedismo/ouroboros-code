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
  operationType:
    | 'tool_execution'
    | 'tool_discovery'
    | 'provider_request'
    | 'mcp_connection'
    | 'confirmation';
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
export const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
  toolExecutionMs: 30000, // 30 seconds
  toolDiscoveryMs: 10000, // 10 seconds
  providerRequestMs: 60000, // 60 seconds
  mcpConnectionMs: 10000, // 10 seconds
  confirmationMs: 300000, // 5 minutes
  cleanupGraceMs: 5000, // 5 seconds
};

/**
 * Timeout manager for handling all timeout operations across providers.
 * Provides centralized timeout management with monitoring and cleanup capabilities.
 */
export class TimeoutManager extends EventEmitter {
  private activeTimeouts = new Map<string, TimeoutContext>();
  private timeoutHandles = new Map<string, NodeJS.Timeout>();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  constructor(private config: TimeoutConfig = DEFAULT_TIMEOUT_CONFIG) {
    super();
    this.startCleanupTimer();
  }

  /**
   * Create a timeout context for an operation.
   * @param operationType Type of operation being timed.
   * @param customTimeoutMs Custom timeout override.
   * @param metadata Optional metadata for debugging.
   * @returns Timeout context with abort controller.
   */
  createTimeout(
    operationType: TimeoutContext['operationType'],
    customTimeoutMs?: number,
    metadata?: Record<string, unknown>,
  ): TimeoutContext {
    const operationId = this.generateOperationId();
    const timeoutMs = customTimeoutMs ?? this.getDefaultTimeout(operationType);
    const abortController = new AbortController();

    const context: TimeoutContext = {
      operationId,
      operationType,
      startTime: new Date(),
      timeoutMs,
      abortController,
      metadata,
    };

    // Store the active timeout
    this.activeTimeouts.set(operationId, context);

    // Set up the timeout handler
    const timeoutHandle = setTimeout(() => {
      this.handleTimeout(operationId);
    }, timeoutMs);

    this.timeoutHandles.set(operationId, timeoutHandle);

    this.emit('timeout_created', {
      operationId,
      operationType,
      timeoutMs,
      metadata,
    });

    return context;
  }

  /**
   * Clear a timeout and mark the operation as completed.
   * @param operationId ID of the operation to clear.
   * @param successful Whether the operation completed successfully.
   */
  clearTimeout(operationId: string, successful: boolean = true): void {
    const context = this.activeTimeouts.get(operationId);
    if (!context) {
      return;
    }

    // Clear the timeout handle
    const handle = this.timeoutHandles.get(operationId);
    if (handle) {
      clearTimeout(handle);
      this.timeoutHandles.delete(operationId);
    }

    // Calculate duration
    const duration = Date.now() - context.startTime.getTime();

    // Remove from active timeouts
    this.activeTimeouts.delete(operationId);

    // Emit completion event
    this.emit('timeout_cleared', {
      operationId: context.operationId,
      operationType: context.operationType,
      duration,
      timeoutMs: context.timeoutMs,
      successful,
      metadata: context.metadata,
    });
  }

  /**
   * Execute an operation with timeout protection.
   * @param operation Async operation to execute.
   * @param operationType Type of operation.
   * @param customTimeoutMs Custom timeout override.
   * @param metadata Optional metadata.
   * @returns Promise resolving to operation result.
   */
  async withTimeout<T>(
    operation: (abortSignal: AbortSignal) => Promise<T>,
    operationType: TimeoutContext['operationType'],
    customTimeoutMs?: number,
    metadata?: Record<string, unknown>,
  ): Promise<T> {
    const context = this.createTimeout(
      operationType,
      customTimeoutMs,
      metadata,
    );

    try {
      const result = await operation(context.abortController.signal);
      this.clearTimeout(context.operationId, true);
      return result;
    } catch (error) {
      this.clearTimeout(context.operationId, false);

      // Check if this was a timeout error
      if (context.abortController.signal.aborted) {
        throw new TimeoutError(
          `Operation timed out after ${context.timeoutMs}ms`,
          context.operationType,
          context.timeoutMs,
          context.metadata,
        );
      }

      throw error;
    }
  }

  /**
   * Execute a tool with timeout protection and automatic retry.
   * @param toolExecution Tool execution function.
   * @param toolName Name of the tool being executed.
   * @param customTimeoutMs Custom timeout override.
   * @param retryCount Number of retries on timeout.
   * @returns Promise resolving to tool result.
   */
  async withToolTimeout<T>(
    toolExecution: (abortSignal: AbortSignal) => Promise<T>,
    toolName: string,
    customTimeoutMs?: number,
    retryCount: number = 0,
  ): Promise<T> {
    const metadata = { toolName, retryCount };

    try {
      return await this.withTimeout(
        toolExecution,
        'tool_execution',
        customTimeoutMs,
        metadata,
      );
    } catch (error) {
      if (error instanceof TimeoutError && retryCount > 0) {
        console.warn(
          `Tool ${toolName} timed out, retrying (${retryCount} attempts left)`,
        );
        return await this.withToolTimeout(
          toolExecution,
          toolName,
          customTimeoutMs,
          retryCount - 1,
        );
      }
      throw error;
    }
  }

  /**
   * Create a race condition between multiple operations with timeout.
   * @param operations Array of operations to race.
   * @param operationType Type of operations.
   * @param customTimeoutMs Custom timeout override.
   * @returns Promise resolving to the first successful result.
   */
  async raceWithTimeout<T>(
    operations: Array<(abortSignal: AbortSignal) => Promise<T>>,
    operationType: TimeoutContext['operationType'],
    customTimeoutMs?: number,
  ): Promise<T> {
    const context = this.createTimeout(operationType, customTimeoutMs);

    try {
      const promises = operations.map((op) =>
        op(context.abortController.signal),
      );
      const result = await Promise.race(promises);
      this.clearTimeout(context.operationId, true);
      return result;
    } catch (error) {
      this.clearTimeout(context.operationId, false);
      throw error;
    }
  }

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
    byType: Record<
      string,
      {
        active: number;
        completed: number;
        timedOut: number;
        avgDuration: number;
      }
    >;
  } {
    const stats = {
      activeTimeouts: this.activeTimeouts.size,
      totalCreated: 0,
      totalCompleted: 0,
      totalTimedOut: 0,
      averageDuration: 0,
      byType: {} as Record<
        string,
        {
          active: number;
          completed: number;
          timedOut: number;
          avgDuration: number;
        }
      >,
    };

    // Count active timeouts by type
    for (const context of this.activeTimeouts.values()) {
      if (!stats.byType[context.operationType]) {
        stats.byType[context.operationType] = {
          active: 0,
          completed: 0,
          timedOut: 0,
          avgDuration: 0,
        };
      }
      stats.byType[context.operationType].active++;
    }

    return stats;
  }

  /**
   * Get all active timeout contexts.
   * @returns Array of active timeout contexts.
   */
  getActiveTimeouts(): TimeoutContext[] {
    return Array.from(this.activeTimeouts.values());
  }

  /**
   * Cancel all active timeouts and clean up.
   * @param reason Reason for cancellation.
   */
  async cancelAll(reason: string = 'Shutdown'): Promise<void> {
    this.isShuttingDown = true;

    console.log(
      `Cancelling ${this.activeTimeouts.size} active timeouts: ${reason}`,
    );

    // Cancel all active operations
    const cancellationPromises: Promise<void>[] = [];

    for (const [operationId, context] of this.activeTimeouts.entries()) {
      cancellationPromises.push(
        (async () => {
          try {
            // Abort the operation
            context.abortController.abort();

            // Clear the timeout
            const handle = this.timeoutHandles.get(operationId);
            if (handle) {
              clearTimeout(handle);
              this.timeoutHandles.delete(operationId);
            }

            // Emit cancellation event
            this.emit('timeout_cancelled', {
              operationId: context.operationId,
              operationType: context.operationType,
              duration: Date.now() - context.startTime.getTime(),
              timeoutMs: context.timeoutMs,
              reason,
              metadata: context.metadata,
            });
          } catch (error) {
            console.warn(`Error cancelling timeout ${operationId}:`, error);
          }
        })(),
      );
    }

    // Wait for all cancellations with a grace period
    await Promise.race([
      Promise.allSettled(cancellationPromises),
      new Promise((resolve) => setTimeout(resolve, this.config.cleanupGraceMs)),
    ]);

    // Clear all state
    this.activeTimeouts.clear();
    this.timeoutHandles.clear();

    // Stop cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    console.log('All timeouts cancelled successfully');
  }

  /**
   * Update timeout configuration.
   * @param newConfig New configuration values.
   */
  updateConfig(newConfig: Partial<TimeoutConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.emit('config_updated', this.config);
  }

  /**
   * Handle timeout expiration.
   * @param operationId ID of the timed out operation.
   */
  private handleTimeout(operationId: string): void {
    const context = this.activeTimeouts.get(operationId);
    if (!context) {
      return;
    }

    // Abort the operation
    context.abortController.abort();

    // Calculate duration
    const duration = Date.now() - context.startTime.getTime();

    // Remove from tracking
    this.activeTimeouts.delete(operationId);
    this.timeoutHandles.delete(operationId);

    // Emit timeout event
    const timeoutEvent: TimeoutEvent = {
      operationId: context.operationId,
      operationType: context.operationType,
      duration,
      timeoutMs: context.timeoutMs,
      metadata: context.metadata,
    };

    this.emit('timeout_expired', timeoutEvent);

    console.warn(
      `Operation timeout: ${context.operationType} (${operationId}) exceeded ${context.timeoutMs}ms`,
      context.metadata,
    );
  }

  /**
   * Get default timeout for operation type.
   * @param operationType Type of operation.
   * @returns Default timeout in milliseconds.
   */
  private getDefaultTimeout(
    operationType: TimeoutContext['operationType'],
  ): number {
    switch (operationType) {
      case 'tool_execution':
        return this.config.toolExecutionMs;
      case 'tool_discovery':
        return this.config.toolDiscoveryMs;
      case 'provider_request':
        return this.config.providerRequestMs;
      case 'mcp_connection':
        return this.config.mcpConnectionMs;
      case 'confirmation':
        return this.config.confirmationMs;
      default:
        return this.config.toolExecutionMs;
    }
  }

  /**
   * Generate unique operation ID.
   * @returns Unique operation identifier.
   */
  private generateOperationId(): string {
    return `timeout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Start periodic cleanup of stale timeout references.
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      if (this.isShuttingDown) {
        return;
      }

      // Clean up any stale references
      const now = Date.now();
      const staleTimeouts: string[] = [];

      for (const [operationId, context] of this.activeTimeouts.entries()) {
        // Consider timeouts stale if they've been running for more than double their timeout
        const maxDuration = context.timeoutMs * 2;
        const actualDuration = now - context.startTime.getTime();

        if (actualDuration > maxDuration) {
          staleTimeouts.push(operationId);
        }
      }

      // Clean up stale timeouts
      for (const operationId of staleTimeouts) {
        console.warn(`Cleaning up stale timeout: ${operationId}`);
        this.clearTimeout(operationId, false);
      }
    }, 30000); // Run cleanup every 30 seconds
  }
}

/**
 * Custom timeout error class.
 */
export class TimeoutError extends Error {
  constructor(
    message: string,
    public readonly operationType: string,
    public readonly timeoutMs: number,
    public readonly metadata?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Create a default timeout manager instance.
 * @param config Optional configuration overrides.
 * @returns Configured timeout manager.
 */
export function createTimeoutManager(
  config?: Partial<TimeoutConfig>,
): TimeoutManager {
  const fullConfig = { ...DEFAULT_TIMEOUT_CONFIG, ...config };
  return new TimeoutManager(fullConfig);
}

/**
 * Provider-specific timeout configurations.
 */
export const PROVIDER_TIMEOUT_CONFIGS = {
  openai: {
    toolExecutionMs: 45000, // OpenAI can be slower
    providerRequestMs: 90000, // Allow more time for complex requests
    mcpConnectionMs: 15000,
  },
  anthropic: {
    toolExecutionMs: 60000, // Anthropic can take longer for complex tool calls
    providerRequestMs: 120000, // Claude can be slower on complex requests
    mcpConnectionMs: 12000,
  },
  gemini: {
    toolExecutionMs: 30000, // Standard timeout
    providerRequestMs: 60000, // Standard timeout
    mcpConnectionMs: 10000,
  },
} as const;

/**
 * Get provider-specific timeout configuration.
 * @param providerType Provider type.
 * @returns Provider-specific timeout config.
 */
export function getProviderTimeoutConfig(
  providerType: 'openai' | 'anthropic' | 'gemini',
): Partial<TimeoutConfig> {
  return PROVIDER_TIMEOUT_CONFIGS[providerType] || {};
}
