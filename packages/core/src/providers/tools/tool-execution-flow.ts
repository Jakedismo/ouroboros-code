/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../../config/config.js';
import {
  UnifiedToolCall,
  UnifiedToolResult,
} from './unified-tool-interface.js';
import { ToolConfirmationOutcome } from '../../tools/tools.js';
import { MCPToolManager } from './mcp-tool-manager.js';
import {
  ErrorHandler,
  ProviderToolError,
  ToolExecutionError,
  ToolConfirmationError,
} from './error-handling.js';
import {
  TimeoutManager,
  TimeoutError,
  createTimeoutManager,
  getProviderTimeoutConfig,
  DEFAULT_TIMEOUT_CONFIG,
} from './timeout-manager.js';

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
  failFast: boolean; // Stop all executions if one fails
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
export class ToolExecutionOrchestrator {
  private readonly mcpManager: MCPToolManager;
  private readonly context: ToolExecutionContext;
  private readonly progressMap: Map<string, ToolExecutionProgress> = new Map();
  private readonly timeoutManager: TimeoutManager;

  constructor(
    mcpManager: MCPToolManager,
    context: ToolExecutionContext,
    timeoutManager?: TimeoutManager,
  ) {
    this.mcpManager = mcpManager;
    this.context = context;

    // Initialize timeout manager with provider-specific configuration
    if (timeoutManager) {
      this.timeoutManager = timeoutManager;
    } else {
      const providerTimeoutConfig = getProviderTimeoutConfig(
        context.providerId as 'openai' | 'anthropic' | 'gemini',
      );
      this.timeoutManager = createTimeoutManager({
        ...DEFAULT_TIMEOUT_CONFIG,
        ...providerTimeoutConfig,
        // Override with context-specific settings
        ...(context.timeoutMs && { toolExecutionMs: context.timeoutMs }),
      });
    }

    // Set up timeout manager event listeners
    this.timeoutManager.on('timeout_expired', (event: any) => {
      this.logProgress(
        `⏰ Tool execution timeout: ${event.operationType} (${event.duration}ms > ${event.timeoutMs}ms)`,
      );
    });

    this.timeoutManager.on('timeout_created', (event: any) => {
      this.logProgress(
        `🕐 Starting ${event.operationType} with ${event.timeoutMs}ms timeout`,
        event.metadata?.toolName as string,
      );
    });
  }

  /**
   * Execute multiple tool calls in parallel with proper error handling.
   * @param toolCalls Array of tool calls to execute.
   * @param config Optional configuration for parallel execution.
   * @returns Promise resolving to execution results.
   */
  async executeToolCallsInParallel(
    toolCalls: UnifiedToolCall[],
    config?: Partial<ParallelExecutionConfig>,
  ): Promise<ParallelExecutionResult> {
    const startTime = Date.now();
    const execConfig: ParallelExecutionConfig = {
      maxConcurrency:
        config?.maxConcurrency || this.context.maxConcurrentTools || 3,
      timeoutMs: config?.timeoutMs || this.context.timeoutMs || 60000,
      retryAttempts: config?.retryAttempts || this.context.retryAttempts || 2,
      retryDelay: config?.retryDelay || 1000,
      failFast: config?.failFast ?? false,
    };

    this.logProgress(
      `Starting parallel execution of ${toolCalls.length} tools`,
    );

    // Initialize progress tracking
    for (const toolCall of toolCalls) {
      this.progressMap.set(toolCall.id, {
        toolName: toolCall.name,
        status: 'pending',
        startTime: Date.now(),
        attemptNumber: 0,
      });
    }

    const results: UnifiedToolResult[] = [];
    const errors: ProviderToolError[] = [];
    let skipped = 0;

    // Create semaphore for concurrency control
    const semaphore = new Semaphore(execConfig.maxConcurrency);
    const executionPromises: Array<Promise<void>> = [];

    // Track if we should abort due to fail-fast
    let shouldAbort = false;

    for (const toolCall of toolCalls) {
      const executionPromise = semaphore.acquire().then(async (release) => {
        try {
          // Check if we should abort due to fail-fast
          if (shouldAbort) {
            skipped++;
            this.updateProgress(
              toolCall.id,
              'failed',
              'Skipped due to previous failure',
            );
            return;
          }

          // Check memory pressure before executing
          // TODO: Implement memory pressure monitoring
          // if (this.isMemoryPressureHigh()) {
          //   this.logProgress(
          //     `⚠️ High memory pressure, performing cleanup before ${toolCall.name}`,
          //   );
          //   await this.forceMemoryCleanup(false);
          // }

          const result = await this.executeToolCallWithRetry(
            toolCall,
            execConfig,
          );
          results.push(result);

          if (result.isError && execConfig.failFast) {
            shouldAbort = true;
          }
        } catch (error) {
          const providerError = ErrorHandler.handle(
            error,
            ErrorHandler.createToolExecutionContext(
              this.context.providerId,
              toolCall.name,
              toolCall.id,
            ),
          );

          errors.push(providerError);
          results.push(providerError.toUnifiedResult(toolCall.id));

          if (execConfig.failFast) {
            shouldAbort = true;
          }
        } finally {
          release();
        }
      });

      executionPromises.push(executionPromise);
    }

    // Wait for all executions to complete
    await Promise.all(executionPromises);

    const endTime = Date.now();
    const successful = results.filter((r) => !r.isError).length;
    const failed = results.filter((r) => r.isError).length;

    const summary = {
      totalTools: toolCalls.length,
      successful,
      failed,
      skipped,
      totalDuration: endTime - startTime,
    };

    this.logProgress(
      `Parallel execution completed: ${successful} successful, ${failed} failed, ${skipped} skipped`,
    );

    return {
      results,
      summary,
      errors,
    };
  }

  /**
   * Execute multiple tool calls sequentially with proper error handling.
   * @param toolCalls Array of tool calls to execute.
   * @returns Promise resolving to execution results.
   */
  async executeToolCallsSequentially(
    toolCalls: UnifiedToolCall[],
  ): Promise<ParallelExecutionResult> {
    const startTime = Date.now();
    this.logProgress(
      `Starting sequential execution of ${toolCalls.length} tools`,
    );

    const results: UnifiedToolResult[] = [];
    const errors: ProviderToolError[] = [];

    for (const toolCall of toolCalls) {
      try {
        this.logProgress(`Executing tool: ${toolCall.name}`, toolCall.name);
        const result = await this.executeToolCall(
          toolCall,
          this.context.timeoutMs,
        );
        results.push(result);
      } catch (error) {
        const providerError = ErrorHandler.handle(
          error,
          ErrorHandler.createToolExecutionContext(
            this.context.providerId,
            toolCall.name,
            toolCall.id,
          ),
        );

        errors.push(providerError);
        results.push(providerError.toUnifiedResult(toolCall.id));
      }
    }

    const endTime = Date.now();
    const successful = results.filter((r) => !r.isError).length;
    const failed = results.filter((r) => r.isError).length;

    return {
      results,
      summary: {
        totalTools: toolCalls.length,
        successful,
        failed,
        skipped: 0,
        totalDuration: endTime - startTime,
      },
      errors,
    };
  }

  /**
   * Execute a single tool call with timeout, confirmation and progress handling.
   * @param toolCall Tool call to execute.
   * @param customTimeoutMs Optional custom timeout override.
   * @returns Promise resolving to unified tool result.
   */
  async executeToolCall(
    toolCall: UnifiedToolCall,
    customTimeoutMs?: number,
  ): Promise<UnifiedToolResult> {
    return await this.timeoutManager.withToolTimeout(
      async (abortSignal: AbortSignal) => {
        try {
          // Update progress
          this.updateProgress(toolCall.id, 'confirming');
          this.logProgress(
            `Checking confirmation for tool: ${toolCall.name}`,
            toolCall.name,
          );

          // Check for confirmation with timeout
          const needsConfirmation = await this.timeoutManager.withTimeout(
            async (confirmationSignal: AbortSignal) => {
              return await this.mcpManager.confirmToolExecution(
                toolCall,
                this.context.onConfirmation || this.defaultConfirmationHandler,
              );
            },
            'confirmation',
            undefined,
            { toolName: toolCall.name, toolId: toolCall.id },
          );

          if (!needsConfirmation) {
            const error = new ToolConfirmationError(
              `Tool execution denied: ${toolCall.name}`,
              toolCall.name,
              'user_denied',
            );

            this.updateProgress(toolCall.id, 'failed', 'Confirmation denied');
            return error.toUnifiedResult(toolCall.id);
          }

          // Execute the tool
          this.updateProgress(toolCall.id, 'executing');
          this.logProgress(`Executing tool: ${toolCall.name}`, toolCall.name);

          // Create combined abort signal
          const combinedSignal = this.createCombinedAbortSignal(
            abortSignal,
            this.context.abortSignal,
          );

          const result = await this.mcpManager.executeTool(
            toolCall,
            combinedSignal,
          );

          // Update progress on completion
          this.updateProgress(toolCall.id, 'completed');
          this.logProgress(
            `Tool ${toolCall.name} completed successfully`,
            toolCall.name,
          );

          return result;
        } catch (error: any) {
          const errorMsg = error.message || 'Unknown error';
          this.updateProgress(toolCall.id, 'failed', errorMsg);

          // Check if this is a timeout error
          if (error instanceof TimeoutError) {
            this.logProgress(
              `Tool ${toolCall.name} timed out after ${error.timeoutMs}ms`,
              toolCall.name,
            );
            return {
              toolCallId: toolCall.id,
              content: `Tool execution timed out after ${error.timeoutMs}ms`,
              error: { message: `Timeout: ${error.message}`, type: 'timeout' },
              isError: true,
              success: false,
            };
          }

          console.error(`Tool execution error for ${toolCall.name}:`, error);
          throw error;
        }
      },
      toolCall.name,
      customTimeoutMs,
    );
  }

  /**
   * Execute a tool call with retry logic.
   * @param toolCall Tool call to execute.
   * @param config Execution configuration.
   * @returns Promise resolving to unified tool result.
   */
  private async executeToolCallWithRetry(
    toolCall: UnifiedToolCall,
    config: ParallelExecutionConfig,
  ): Promise<UnifiedToolResult> {
    let lastError: ProviderToolError | null = null;

    for (let attempt = 0; attempt <= config.retryAttempts; attempt++) {
      try {
        // Update attempt number
        const progress = this.progressMap.get(toolCall.id);
        if (progress) {
          progress.attemptNumber = attempt;
        }

        if (attempt > 0) {
          this.logProgress(
            `Retrying tool ${toolCall.name} (attempt ${attempt + 1})`,
            toolCall.name,
          );

          // Wait for retry delay
          await new Promise((resolve) =>
            setTimeout(resolve, config.retryDelay * attempt),
          );
        }

        // Timeout is now handled by the executeToolCall method

        // Use the timeout manager for this retry attempt
        const result = await this.executeToolCall(toolCall, config.timeoutMs);

        return result;
      } catch (error) {
        // Handle timeout errors specially
        if (error instanceof TimeoutError) {
          this.logProgress(
            `Tool ${toolCall.name} timed out (${error.timeoutMs}ms), attempt ${attempt + 1}`,
            toolCall.name,
          );

          if (attempt < config.retryAttempts) {
            continue; // Retry timeout errors
          }

          // Final timeout failure
          lastError = new ToolExecutionError(
            `Tool timed out after ${config.retryAttempts + 1} attempts`,
            toolCall.name,
            this.context.providerId,
          );
          break;
        }

        const providerError = ErrorHandler.handle(
          error,
          ErrorHandler.createToolExecutionContext(
            this.context.providerId,
            toolCall.name,
            toolCall.id,
          ),
        );

        lastError = providerError;

        // Check if error is recoverable and we have more attempts
        if (
          attempt < config.retryAttempts &&
          ErrorHandler.isRecoverable(providerError)
        ) {
          this.logProgress(
            `Tool ${toolCall.name} failed, will retry: ${providerError.message}`,
            toolCall.name,
          );
          continue;
        }

        // No more retries or error not recoverable
        break;
      }
    }

    // All attempts failed
    if (lastError) {
      throw lastError;
    }

    // This should never happen, but just in case
    throw new ToolExecutionError(
      `Tool execution failed after ${config.retryAttempts + 1} attempts`,
      toolCall.name,
      this.context.providerId,
    );
  }

  /**
   * Default confirmation handler that auto-approves tools.
   * @param details Confirmation details.
   * @returns Promise resolving to confirmation outcome.
   */
  private async defaultConfirmationHandler(
    details: any,
  ): Promise<ToolConfirmationOutcome> {
    console.log('Tool confirmation needed:', details);
    // Auto-approve for automated execution
    return ToolConfirmationOutcome.ProceedOnce;
  }

  /**
   * Update progress for a tool execution.
   * @param toolCallId Tool call ID.
   * @param status New status.
   * @param error Optional error message.
   */
  private updateProgress(
    toolCallId: string,
    status: ToolExecutionProgress['status'],
    error?: string,
  ): void {
    const progress = this.progressMap.get(toolCallId);
    if (progress) {
      progress.status = status;
      if (error) {
        progress.error = error;
      }
      if (status === 'completed' || status === 'failed') {
        progress.endTime = Date.now();
      }
    }
  }

  /**
   * Create a combined abort signal from multiple sources.
   * @param signals Abort signals to combine.
   * @returns Combined abort controller.
   */
  private createCombinedAbortSignal(...signals: AbortSignal[]): AbortSignal {
    const controller = new AbortController();

    // If any signal is already aborted, abort immediately
    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort();
        return controller.signal;
      }
    }

    // Set up listeners for all signals
    const abortHandlers: (() => void)[] = [];

    for (const signal of signals) {
      const handler = () => {
        controller.abort();
        // Clean up all handlers
        abortHandlers.forEach((h, i) => {
          signals[i].removeEventListener('abort', h);
        });
      };

      signal.addEventListener('abort', handler);
      abortHandlers.push(handler);
    }

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
   * Get currently active tool timeouts.
   * @returns Array of active timeout contexts.
   */
  getActiveTimeouts() {
    return this.timeoutManager.getActiveTimeouts();
  }

  /**
   * Cancel all active timeouts and clean up.
   * @param reason Reason for cancellation.
   */
  async dispose(reason: string = 'Orchestrator disposed'): Promise<void> {
    await this.timeoutManager.cancelAll(reason);
  }

  /**
   * Log progress message.
   * @param message Progress message.
   * @param toolName Optional tool name.
   */
  private logProgress(message: string, toolName?: string): void {
    if (this.context.onProgress) {
      this.context.onProgress(message, toolName);
    } else {
      console.log(`[ToolOrchestrator] ${message}`);
    }
  }

  /**
   * Get current progress for all tools.
   * @returns Map of tool call ID to progress information.
   */
  getProgress(): Map<string, ToolExecutionProgress> {
    return new Map(this.progressMap);
  }

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
  } {
    const summary = {
      total: this.progressMap.size,
      pending: 0,
      confirming: 0,
      executing: 0,
      completed: 0,
      failed: 0,
    };

    for (const progress of this.progressMap.values()) {
      summary[progress.status]++;
    }

    return summary;
  }

  /**
   * Clear progress tracking.
   */
  clearProgress(): void {
    this.progressMap.clear();
  }
}

/**
 * Simple semaphore implementation for controlling concurrency.
 */
class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<() => void> {
    if (this.permits > 0) {
      this.permits--;
      return () => this.release();
    }

    return new Promise<() => void>((resolve) => {
      this.waiting.push(() => {
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    this.permits++;
    if (this.waiting.length > 0) {
      const next = this.waiting.shift();
      if (next) {
        this.permits--;
        next();
      }
    }
  }
}
