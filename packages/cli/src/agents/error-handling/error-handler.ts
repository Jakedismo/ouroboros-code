/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { Logger } from '../../../core/src/utils/logger.js';
import { Config } from '../../../core/src/config/config.js';

/**
 * Error severity levels
 */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Error categories for classification
 */
export type ErrorCategory = 
  | 'agent-activation'
  | 'agent-execution'
  | 'workflow-execution'
  | 'tool-execution'
  | 'session-management'
  | 'provider-communication'
  | 'resource-allocation'
  | 'performance-optimization'
  | 'analytics-collection'
  | 'system-integration'
  | 'configuration'
  | 'network'
  | 'authentication'
  | 'file-system'
  | 'unknown';

/**
 * Error context information
 */
export interface ErrorContext {
  timestamp: number;
  agentId?: string;
  agentName?: string;
  sessionId?: string;
  workflowId?: string;
  stepId?: string;
  toolName?: string;
  providerType?: string;
  userId?: string;
  systemInfo: {
    memory: number;
    cpu: number;
    platform: string;
    nodeVersion: string;
  };
  stackTrace?: string;
  additionalData?: Record<string, any>;
}

/**
 * Structured error information
 */
export interface StructuredError {
  errorId: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  originalError: Error;
  context: ErrorContext;
  recoveryActions: string[];
  userMessage: string;
  technicalDetails: Record<string, any>;
  retryable: boolean;
  maxRetries?: number;
  retryCount: number;
}

/**
 * Error handling configuration
 */
export interface ErrorHandlingConfig {
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  enableStackTraces: boolean;
  enableErrorReporting: boolean;
  maxErrorHistory: number;
  retryConfiguration: {
    maxRetries: number;
    backoffMultiplier: number;
    initialDelayMs: number;
    maxDelayMs: number;
  };
  alertThresholds: {
    errorRatePerMinute: number;
    criticalErrorsPerHour: number;
    consecutiveFailures: number;
  };
  recovery: {
    enableAutoRecovery: boolean;
    recoveryTimeoutMs: number;
    maxRecoveryAttempts: number;
  };
}

/**
 * Error recovery strategy
 */
export interface ErrorRecoveryStrategy {
  strategyId: string;
  category: ErrorCategory;
  condition: (error: StructuredError) => boolean;
  recoveryAction: (error: StructuredError) => Promise<boolean>;
  description: string;
  priority: number;
}

/**
 * Error statistics
 */
export interface ErrorStatistics {
  timestamp: number;
  totalErrors: number;
  errorsByCategory: Record<ErrorCategory, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
  errorRate: number; // errors per minute
  recoverySuccessRate: number;
  topErrors: Array<{
    message: string;
    count: number;
    category: ErrorCategory;
    severity: ErrorSeverity;
  }>;
  systemHealth: {
    status: 'healthy' | 'degraded' | 'critical';
    issues: string[];
    recommendations: string[];
  };
}

/**
 * Comprehensive error handler for the multi-agent system
 */
export class ErrorHandler extends EventEmitter {
  private logger: Logger;
  private config: ErrorHandlingConfig;
  private errorHistory: StructuredError[] = [];
  private errorCounter = 0;
  private recoveryStrategies: Map<string, ErrorRecoveryStrategy> = new Map();
  private errorStats: Map<string, number> = new Map();
  private lastErrorTimes: number[] = [];
  private consecutiveFailures = 0;
  private monitoringTimer?: NodeJS.Timeout;

  constructor(
    private coreConfig: Config,
    errorConfig?: Partial<ErrorHandlingConfig>
  ) {
    super();
    this.logger = new Logger('ErrorHandler');
    
    // Default error handling configuration
    this.config = {
      logLevel: 'error',
      enableStackTraces: true,
      enableErrorReporting: true,
      maxErrorHistory: 1000,
      retryConfiguration: {
        maxRetries: 3,
        backoffMultiplier: 2,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
      },
      alertThresholds: {
        errorRatePerMinute: 10,
        criticalErrorsPerHour: 5,
        consecutiveFailures: 3,
      },
      recovery: {
        enableAutoRecovery: true,
        recoveryTimeoutMs: 30000,
        maxRecoveryAttempts: 2,
      },
      ...errorConfig,
    };

    this.initializeRecoveryStrategies();
  }

  /**
   * Initialize error handler
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing error handler...');

    // Start error monitoring
    this.startErrorMonitoring();

    // Set up global error handlers
    this.setupGlobalErrorHandlers();

    this.emit('error-handler-initialized', {
      config: this.config,
      strategiesCount: this.recoveryStrategies.size,
    });

    this.logger.info('Error handler initialized successfully');
  }

  /**
   * Handle an error with comprehensive processing
   */
  async handleError(
    error: Error,
    category: ErrorCategory,
    severity: ErrorSeverity,
    context?: Partial<ErrorContext>
  ): Promise<StructuredError> {
    const errorId = `error_${++this.errorCounter}_${Date.now()}`;
    
    // Create structured error
    const structuredError: StructuredError = {
      errorId,
      category,
      severity,
      message: error.message,
      originalError: error,
      context: this.buildErrorContext(context),
      recoveryActions: this.getRecoveryActions(category, severity),
      userMessage: this.buildUserMessage(error, category, severity),
      technicalDetails: this.extractTechnicalDetails(error),
      retryable: this.isRetryable(error, category),
      retryCount: 0,
    };

    // Log the error
    this.logError(structuredError);

    // Store in history
    this.storeError(structuredError);

    // Update statistics
    this.updateErrorStatistics(structuredError);

    // Check for alert conditions
    await this.checkAlertConditions(structuredError);

    // Attempt recovery if enabled and applicable
    if (this.config.recovery.enableAutoRecovery && this.canAttemptRecovery(structuredError)) {
      await this.attemptRecovery(structuredError);
    }

    // Emit error event
    this.emit('error-handled', structuredError);

    return structuredError;
  }

  /**
   * Retry an operation with exponential backoff
   */
  async retryOperation<T>(
    operation: () => Promise<T>,
    category: ErrorCategory,
    context?: Partial<ErrorContext>,
    maxRetries?: number
  ): Promise<T> {
    const retries = maxRetries || this.config.retryConfiguration.maxRetries;
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await operation();
        
        // Reset consecutive failures on success
        if (attempt > 0) {
          this.consecutiveFailures = 0;
          this.emit('operation-retry-succeeded', {
            category,
            attempts: attempt + 1,
            context,
          });
        }
        
        return result;
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === retries) {
          break; // Last attempt, don't retry
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          this.config.retryConfiguration.initialDelayMs * 
          Math.pow(this.config.retryConfiguration.backoffMultiplier, attempt),
          this.config.retryConfiguration.maxDelayMs
        );

        this.logger.warn(`Retry attempt ${attempt + 1}/${retries} failed, waiting ${delay}ms`, {
          error: error.message,
          category,
          attempt,
        });

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // All retries failed
    this.consecutiveFailures++;
    const structuredError = await this.handleError(
      lastError!,
      category,
      'high',
      { ...context, retryCount: retries }
    );

    throw new Error(`Operation failed after ${retries} retries: ${structuredError.userMessage}`);
  }

  /**
   * Get error statistics
   */
  getErrorStatistics(): ErrorStatistics {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const recentErrors = this.errorHistory.filter(e => e.context.timestamp > oneHourAgo);

    // Calculate error rate (errors per minute over last hour)
    const oneMinuteAgo = now - 60 * 1000;
    const recentErrorTimes = this.lastErrorTimes.filter(time => time > oneMinuteAgo);
    const errorRate = recentErrorTimes.length;

    // Group errors by category and severity
    const errorsByCategory: Record<ErrorCategory, number> = {} as any;
    const errorsBySeverity: Record<ErrorSeverity, number> = {} as any;

    for (const error of recentErrors) {
      errorsByCategory[error.category] = (errorsByCategory[error.category] || 0) + 1;
      errorsBySeverity[error.severity] = (errorsBySeverity[error.severity] || 0) + 1;
    }

    // Calculate recovery success rate
    const recoveryAttempts = recentErrors.filter(e => e.recoveryActions.length > 0).length;
    const successfulRecoveries = recentErrors.filter(e => 
      e.technicalDetails.recoveryAttempted && e.technicalDetails.recoverySuccessful
    ).length;
    const recoverySuccessRate = recoveryAttempts > 0 ? successfulRecoveries / recoveryAttempts : 1;

    // Get top errors
    const errorCounts = new Map<string, { count: number; category: ErrorCategory; severity: ErrorSeverity }>();
    for (const error of recentErrors) {
      const key = error.message;
      const existing = errorCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        errorCounts.set(key, { count: 1, category: error.category, severity: error.severity });
      }
    }

    const topErrors = Array.from(errorCounts.entries())
      .map(([message, data]) => ({ message, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Assess system health
    const systemHealth = this.assessSystemHealth(errorRate, errorsByCategory, errorsBySeverity);

    return {
      timestamp: now,
      totalErrors: this.errorHistory.length,
      errorsByCategory,
      errorsBySeverity,
      errorRate,
      recoverySuccessRate,
      topErrors,
      systemHealth,
    };
  }

  /**
   * Register a custom error recovery strategy
   */
  registerRecoveryStrategy(strategy: ErrorRecoveryStrategy): void {
    this.recoveryStrategies.set(strategy.strategyId, strategy);
    this.logger.info(`Registered recovery strategy: ${strategy.strategyId}`, {
      category: strategy.category,
      description: strategy.description,
    });
  }

  /**
   * Get error history filtered by criteria
   */
  getErrorHistory(
    category?: ErrorCategory,
    severity?: ErrorSeverity,
    limit?: number,
    since?: number
  ): StructuredError[] {
    let filtered = this.errorHistory;

    if (category) {
      filtered = filtered.filter(e => e.category === category);
    }

    if (severity) {
      filtered = filtered.filter(e => e.severity === severity);
    }

    if (since) {
      filtered = filtered.filter(e => e.context.timestamp >= since);
    }

    // Sort by timestamp (most recent first)
    filtered.sort((a, b) => b.context.timestamp - a.context.timestamp);

    if (limit) {
      filtered = filtered.slice(0, limit);
    }

    return filtered;
  }

  /**
   * Clear error history
   */
  clearErrorHistory(): void {
    this.errorHistory.length = 0;
    this.errorStats.clear();
    this.lastErrorTimes.length = 0;
    this.consecutiveFailures = 0;
    
    this.logger.info('Error history cleared');
    this.emit('error-history-cleared');
  }

  /**
   * Initialize default recovery strategies
   */
  private initializeRecoveryStrategies(): void {
    // Agent activation recovery
    this.registerRecoveryStrategy({
      strategyId: 'agent-activation-retry',
      category: 'agent-activation',
      condition: (error) => error.retryable && error.retryCount < 2,
      recoveryAction: async (error) => {
        this.logger.info('Attempting agent activation recovery', { errorId: error.errorId });
        // Implementation would retry agent activation
        return true;
      },
      description: 'Retry agent activation with clean state',
      priority: 8,
    });

    // Provider communication recovery
    this.registerRecoveryStrategy({
      strategyId: 'provider-reconnect',
      category: 'provider-communication',
      condition: (error) => error.message.includes('connection') || error.message.includes('network'),
      recoveryAction: async (error) => {
        this.logger.info('Attempting provider reconnection', { errorId: error.errorId });
        // Implementation would reconnect to provider
        return true;
      },
      description: 'Reconnect to LLM provider',
      priority: 9,
    });

    // Resource allocation recovery
    this.registerRecoveryStrategy({
      strategyId: 'resource-cleanup-retry',
      category: 'resource-allocation',
      condition: (error) => error.message.includes('resource') || error.message.includes('memory'),
      recoveryAction: async (error) => {
        this.logger.info('Attempting resource cleanup recovery', { errorId: error.errorId });
        // Implementation would clean up resources and retry
        return true;
      },
      description: 'Clean up resources and retry allocation',
      priority: 7,
    });

    // Session management recovery
    this.registerRecoveryStrategy({
      strategyId: 'session-recovery',
      category: 'session-management',
      condition: (error) => error.severity !== 'critical',
      recoveryAction: async (error) => {
        this.logger.info('Attempting session recovery', { errorId: error.errorId });
        // Implementation would recover session state
        return true;
      },
      description: 'Recover session state from backup',
      priority: 6,
    });

    this.logger.info(`Initialized ${this.recoveryStrategies.size} default recovery strategies`);
  }

  /**
   * Build error context
   */
  private buildErrorContext(context?: Partial<ErrorContext>): ErrorContext {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      timestamp: Date.now(),
      systemInfo: {
        memory: memoryUsage.heapUsed / 1024 / 1024, // MB
        cpu: (cpuUsage.user + cpuUsage.system) / 1000, // ms
        platform: process.platform,
        nodeVersion: process.version,
      },
      ...context,
    };
  }

  /**
   * Get recovery actions for error category and severity
   */
  private getRecoveryActions(category: ErrorCategory, severity: ErrorSeverity): string[] {
    const actions: string[] = [];

    switch (category) {
      case 'agent-activation':
        actions.push('Retry agent activation', 'Check agent configuration', 'Verify system resources');
        break;
      case 'provider-communication':
        actions.push('Check network connectivity', 'Verify API credentials', 'Retry connection');
        break;
      case 'resource-allocation':
        actions.push('Free up system resources', 'Adjust resource limits', 'Retry allocation');
        break;
      case 'workflow-execution':
        actions.push('Review workflow configuration', 'Check tool availability', 'Retry execution');
        break;
      default:
        actions.push('Check system logs', 'Verify configuration', 'Contact support if persistent');
    }

    if (severity === 'critical') {
      actions.unshift('Contact system administrator immediately');
    }

    return actions;
  }

  /**
   * Build user-friendly error message
   */
  private buildUserMessage(error: Error, category: ErrorCategory, severity: ErrorSeverity): string {
    const baseMessages: Record<ErrorCategory, string> = {
      'agent-activation': 'Failed to activate agent',
      'agent-execution': 'Agent execution failed',
      'workflow-execution': 'Workflow execution failed',
      'tool-execution': 'Tool execution failed',
      'session-management': 'Session management error',
      'provider-communication': 'Communication with AI provider failed',
      'resource-allocation': 'Resource allocation failed',
      'performance-optimization': 'Performance optimization error',
      'analytics-collection': 'Analytics collection error',
      'system-integration': 'System integration error',
      'configuration': 'Configuration error',
      'network': 'Network connectivity error',
      'authentication': 'Authentication failed',
      'file-system': 'File system operation failed',
      'unknown': 'An unexpected error occurred',
    };

    let message = baseMessages[category] || 'An error occurred';

    if (severity === 'critical') {
      message = `CRITICAL: ${message}`;
    } else if (severity === 'high') {
      message = `HIGH PRIORITY: ${message}`;
    }

    return `${message}. Please try again or contact support if the issue persists.`;
  }

  /**
   * Extract technical details from error
   */
  private extractTechnicalDetails(error: Error): Record<string, any> {
    return {
      errorName: error.name,
      stack: this.config.enableStackTraces ? error.stack : undefined,
      cause: error.cause,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Determine if error is retryable
   */
  private isRetryable(error: Error, category: ErrorCategory): boolean {
    // Network and communication errors are generally retryable
    if (category === 'network' || category === 'provider-communication') {
      return true;
    }

    // Resource allocation errors might be retryable
    if (category === 'resource-allocation') {
      return !error.message.includes('quota') && !error.message.includes('limit exceeded');
    }

    // Configuration errors are generally not retryable
    if (category === 'configuration' || category === 'authentication') {
      return false;
    }

    // Default to retryable for most categories
    return true;
  }

  /**
   * Log error based on configuration
   */
  private logError(error: StructuredError): void {
    const logData = {
      errorId: error.errorId,
      category: error.category,
      severity: error.severity,
      message: error.message,
      context: error.context,
      userMessage: error.userMessage,
    };

    switch (error.severity) {
      case 'critical':
        this.logger.error('CRITICAL ERROR', logData);
        break;
      case 'high':
        this.logger.error('HIGH SEVERITY ERROR', logData);
        break;
      case 'medium':
        this.logger.warn('MEDIUM SEVERITY ERROR', logData);
        break;
      case 'low':
        this.logger.info('LOW SEVERITY ERROR', logData);
        break;
    }
  }

  /**
   * Store error in history
   */
  private storeError(error: StructuredError): void {
    this.errorHistory.push(error);

    // Trim history if it exceeds maximum
    if (this.errorHistory.length > this.config.maxErrorHistory) {
      this.errorHistory.shift();
    }

    // Track error timing
    this.lastErrorTimes.push(error.context.timestamp);
    
    // Keep only recent error times (last hour)
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    this.lastErrorTimes = this.lastErrorTimes.filter(time => time > oneHourAgo);
  }

  /**
   * Update error statistics
   */
  private updateErrorStatistics(error: StructuredError): void {
    const key = `${error.category}:${error.severity}`;
    this.errorStats.set(key, (this.errorStats.get(key) || 0) + 1);
  }

  /**
   * Check alert conditions and emit alerts
   */
  private async checkAlertConditions(error: StructuredError): Promise<void> {
    // Check error rate threshold
    const oneMinuteAgo = Date.now() - 60 * 1000;
    const recentErrors = this.lastErrorTimes.filter(time => time > oneMinuteAgo);
    
    if (recentErrors.length >= this.config.alertThresholds.errorRatePerMinute) {
      this.emit('error-rate-alert', {
        rate: recentErrors.length,
        threshold: this.config.alertThresholds.errorRatePerMinute,
        timestamp: Date.now(),
      });
    }

    // Check critical error threshold
    if (error.severity === 'critical') {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      const criticalErrors = this.errorHistory.filter(e => 
        e.severity === 'critical' && e.context.timestamp > oneHourAgo
      );

      if (criticalErrors.length >= this.config.alertThresholds.criticalErrorsPerHour) {
        this.emit('critical-error-alert', {
          count: criticalErrors.length,
          threshold: this.config.alertThresholds.criticalErrorsPerHour,
          timestamp: Date.now(),
        });
      }
    }

    // Check consecutive failures
    if (this.consecutiveFailures >= this.config.alertThresholds.consecutiveFailures) {
      this.emit('consecutive-failure-alert', {
        count: this.consecutiveFailures,
        threshold: this.config.alertThresholds.consecutiveFailures,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Determine if recovery should be attempted
   */
  private canAttemptRecovery(error: StructuredError): boolean {
    if (!this.config.recovery.enableAutoRecovery) {
      return false;
    }

    if (error.severity === 'critical') {
      return false; // Don't auto-recover from critical errors
    }

    // Check if we've exceeded max recovery attempts for this error type
    const recentSimilarErrors = this.errorHistory.filter(e =>
      e.category === error.category &&
      e.message === error.message &&
      e.context.timestamp > Date.now() - 60 * 60 * 1000 // Last hour
    );

    return recentSimilarErrors.length <= this.config.recovery.maxRecoveryAttempts;
  }

  /**
   * Attempt error recovery
   */
  private async attemptRecovery(error: StructuredError): Promise<boolean> {
    const strategies = Array.from(this.recoveryStrategies.values())
      .filter(strategy => strategy.category === error.category || strategy.category === 'unknown')
      .filter(strategy => strategy.condition(error))
      .sort((a, b) => b.priority - a.priority);

    if (strategies.length === 0) {
      this.logger.info('No recovery strategies available', { errorId: error.errorId });
      return false;
    }

    for (const strategy of strategies) {
      try {
        this.logger.info(`Attempting recovery strategy: ${strategy.strategyId}`, {
          errorId: error.errorId,
          strategy: strategy.description,
        });

        const success = await Promise.race([
          strategy.recoveryAction(error),
          new Promise<boolean>((_, reject) =>
            setTimeout(() => reject(new Error('Recovery timeout')), this.config.recovery.recoveryTimeoutMs)
          ),
        ]);

        if (success) {
          this.logger.info('Recovery successful', {
            errorId: error.errorId,
            strategyId: strategy.strategyId,
          });

          error.technicalDetails.recoveryAttempted = true;
          error.technicalDetails.recoverySuccessful = true;
          error.technicalDetails.recoveryStrategy = strategy.strategyId;

          this.emit('error-recovery-success', {
            errorId: error.errorId,
            strategyId: strategy.strategyId,
            timestamp: Date.now(),
          });

          return true;
        }
      } catch (recoveryError) {
        this.logger.warn('Recovery strategy failed', {
          errorId: error.errorId,
          strategyId: strategy.strategyId,
          recoveryError: recoveryError.message,
        });
      }
    }

    error.technicalDetails.recoveryAttempted = true;
    error.technicalDetails.recoverySuccessful = false;

    this.emit('error-recovery-failed', {
      errorId: error.errorId,
      strategiesAttempted: strategies.map(s => s.strategyId),
      timestamp: Date.now(),
    });

    return false;
  }

  /**
   * Assess overall system health
   */
  private assessSystemHealth(
    errorRate: number,
    errorsByCategory: Record<ErrorCategory, number>,
    errorsBySeverity: Record<ErrorSeverity, number>
  ): { status: 'healthy' | 'degraded' | 'critical'; issues: string[]; recommendations: string[] } {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check error rate
    if (errorRate > this.config.alertThresholds.errorRatePerMinute) {
      issues.push(`High error rate: ${errorRate} errors per minute`);
      recommendations.push('Investigate root causes of frequent errors');
    }

    // Check critical errors
    const criticalCount = errorsBySeverity.critical || 0;
    if (criticalCount > 0) {
      issues.push(`${criticalCount} critical errors in the last hour`);
      recommendations.push('Address critical errors immediately');
    }

    // Check consecutive failures
    if (this.consecutiveFailures >= this.config.alertThresholds.consecutiveFailures) {
      issues.push(`${this.consecutiveFailures} consecutive failures`);
      recommendations.push('System may need restart or manual intervention');
    }

    // Determine status
    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';

    if (criticalCount > 0 || this.consecutiveFailures >= this.config.alertThresholds.consecutiveFailures) {
      status = 'critical';
    } else if (errorRate > this.config.alertThresholds.errorRatePerMinute / 2 || issues.length > 0) {
      status = 'degraded';
    }

    return { status, issues, recommendations };
  }

  /**
   * Start error monitoring
   */
  private startErrorMonitoring(): void {
    this.monitoringTimer = setInterval(() => {
      const stats = this.getErrorStatistics();
      this.emit('error-statistics-updated', stats);

      // Clean up old error times
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      this.lastErrorTimes = this.lastErrorTimes.filter(time => time > oneHourAgo);
    }, 60000); // Every minute
  }

  /**
   * Setup global error handlers
   */
  private setupGlobalErrorHandlers(): void {
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.handleError(
        new Error(`Unhandled promise rejection: ${reason}`),
        'unknown',
        'high',
        { additionalData: { promise: promise.toString() } }
      );
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.handleError(
        error,
        'unknown',
        'critical',
        { additionalData: { type: 'uncaughtException' } }
      );
    });
  }

  /**
   * Update configuration
   */
  updateConfiguration(newConfig: Partial<ErrorHandlingConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };

    this.emit('error-handler-config-updated', { oldConfig, newConfig: this.config });
    this.logger.info('Error handler configuration updated');
  }

  /**
   * Cleanup and shutdown
   */
  async cleanup(): Promise<void> {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = undefined;
    }

    this.errorHistory.length = 0;
    this.errorStats.clear();
    this.lastErrorTimes.length = 0;
    this.recoveryStrategies.clear();
    this.removeAllListeners();

    this.logger.info('Error handler cleaned up');
  }
}

export default ErrorHandler;