/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { Config } from '../../../core/src/config/config.js';
import { ToolRegistry } from '../../../core/src/tools/tool-registry.js';
import { AgentManager } from '../core/agent-manager.js';
import { ErrorHandler, ErrorCategory, ErrorSeverity, StructuredError } from './error-handler.js';
import { AgentLogger, LogCategory, LogLevel } from '../logging/agent-logger.js';
import { Logger } from '../../../core/src/utils/logger.js';

/**
 * Error and logging integration configuration
 */
export interface ErrorLoggingIntegrationConfig {
  enableAutomaticErrorLogging: boolean;
  enableErrorRecoveryLogging: boolean;
  enablePerformanceErrorTracking: boolean;
  errorToLogLevelMapping: Record<ErrorSeverity, LogLevel>;
  categoryMapping: {
    errorToLogCategory: Record<ErrorCategory, LogCategory>;
    logToErrorCategory: Record<LogCategory, ErrorCategory>;
  };
  alerting: {
    enableErrorAlerts: boolean;
    enableLogAlerts: boolean;
    errorRateThreshold: number;
    criticalErrorThreshold: number;
  };
  monitoring: {
    enableRealTimeMonitoring: boolean;
    monitoringIntervalMs: number;
    healthCheckIntervalMs: number;
  };
}

/**
 * System health status
 */
export interface SystemHealthStatus {
  timestamp: number;
  overallStatus: 'healthy' | 'degraded' | 'critical' | 'failing';
  errorHandling: {
    status: 'healthy' | 'degraded' | 'critical';
    totalErrors: number;
    errorRate: number;
    criticalErrors: number;
    recoverySuccessRate: number;
    consecutiveFailures: number;
  };
  logging: {
    status: 'healthy' | 'degraded' | 'critical';
    logRate: number;
    bufferUsage: number;
    transportHealth: Record<string, boolean>;
    flushLatency: number;
  };
  systemMetrics: {
    memoryUsage: number;
    cpuUsage: number;
    diskUsage?: number;
    networkLatency?: number;
  };
  recommendations: string[];
  alerts: Array<{
    level: 'info' | 'warning' | 'error' | 'critical';
    message: string;
    category: string;
    timestamp: number;
  }>;
}

/**
 * Error and logging correlation data
 */
export interface ErrorLogCorrelation {
  correlationId: string;
  timestamp: number;
  error: StructuredError;
  relatedLogs: Array<{
    id: string;
    timestamp: number;
    level: LogLevel;
    category: LogCategory;
    message: string;
  }>;
  context: {
    beforeErrorLogs: number;
    afterErrorLogs: number;
    timeWindowMs: number;
  };
  analysis: {
    possibleCauses: string[];
    relatedPatterns: string[];
    recommendedActions: string[];
  };
}

/**
 * Comprehensive error handling and logging integration system
 */
export class ErrorLoggingIntegration extends EventEmitter {
  private logger: Logger;
  private config: ErrorLoggingIntegrationConfig;
  private errorHandler: ErrorHandler;
  private agentLogger: AgentLogger;
  private monitoringTimer?: NodeJS.Timeout;
  private healthCheckTimer?: NodeJS.Timeout;
  private correlationMap: Map<string, ErrorLogCorrelation> = new Map();
  private systemHealth: SystemHealthStatus | null = null;

  constructor(
    private coreConfig: Config,
    private toolRegistry: ToolRegistry,
    private agentManager: AgentManager,
    config?: Partial<ErrorLoggingIntegrationConfig>
  ) {
    super();
    this.logger = new Logger('ErrorLoggingIntegration');

    // Default configuration
    this.config = {
      enableAutomaticErrorLogging: true,
      enableErrorRecoveryLogging: true,
      enablePerformanceErrorTracking: true,
      errorToLogLevelMapping: {
        low: LogLevel.INFO,
        medium: LogLevel.WARN,
        high: LogLevel.ERROR,
        critical: LogLevel.CRITICAL,
      },
      categoryMapping: {
        errorToLogCategory: {
          'agent-activation': 'agent-lifecycle',
          'agent-execution': 'agent-lifecycle',
          'workflow-execution': 'workflow-execution',
          'tool-execution': 'tool-execution',
          'session-management': 'session-management',
          'provider-communication': 'provider-communication',
          'resource-allocation': 'resource-management',
          'performance-optimization': 'performance',
          'analytics-collection': 'analytics',
          'system-integration': 'system',
          'configuration': 'configuration',
          'network': 'system',
          'authentication': 'security',
          'file-system': 'system',
          'unknown': 'system',
        },
        logToErrorCategory: {
          'agent-lifecycle': 'agent-execution',
          'workflow-execution': 'workflow-execution',
          'tool-execution': 'tool-execution',
          'session-management': 'session-management',
          'provider-communication': 'provider-communication',
          'resource-management': 'resource-allocation',
          'performance': 'performance-optimization',
          'analytics': 'analytics-collection',
          'system': 'system-integration',
          'user-interaction': 'system-integration',
          'security': 'authentication',
          'configuration': 'configuration',
        },
      },
      alerting: {
        enableErrorAlerts: true,
        enableLogAlerts: true,
        errorRateThreshold: 10, // errors per minute
        criticalErrorThreshold: 3, // critical errors per hour
      },
      monitoring: {
        enableRealTimeMonitoring: true,
        monitoringIntervalMs: 30000, // 30 seconds
        healthCheckIntervalMs: 60000, // 1 minute
      },
      ...config,
    };

    // Initialize error handler and logger
    this.errorHandler = new ErrorHandler(coreConfig);
    this.agentLogger = new AgentLogger(coreConfig);
  }

  /**
   * Initialize error and logging integration
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing error and logging integration...');

    // Initialize error handler
    await this.errorHandler.initialize();

    // Initialize agent logger
    await this.agentLogger.initialize();

    // Set up event listeners
    this.setupEventListeners();

    // Start monitoring if enabled
    if (this.config.monitoring.enableRealTimeMonitoring) {
      this.startMonitoring();
    }

    // Start health checking
    this.startHealthChecking();

    this.emit('error-logging-integration-initialized', {
      config: this.config,
      errorHandlerInitialized: true,
      agentLoggerInitialized: true,
    });

    this.logger.info('Error and logging integration initialized successfully');
  }

  /**
   * Handle an error with integrated logging
   */
  async handleError(
    error: Error,
    category: ErrorCategory,
    severity: ErrorSeverity,
    context?: any
  ): Promise<StructuredError> {
    // Handle the error
    const structuredError = await this.errorHandler.handleError(error, category, severity, context);

    // Log the error automatically if enabled
    if (this.config.enableAutomaticErrorLogging) {
      await this.logError(structuredError);
    }

    // Create correlation if enabled
    await this.createErrorLogCorrelation(structuredError);

    return structuredError;
  }

  /**
   * Create a child logger with error handling integration
   */
  createIntegratedLogger(
    context: any,
    tags: string[] = []
  ) {
    const childLogger = this.agentLogger.createChildLogger(context, tags);

    return {
      ...childLogger,
      
      // Enhanced error logging methods
      errorWithHandling: async (
        error: Error,
        category: ErrorCategory,
        severity: ErrorSeverity,
        message?: string,
        metadata?: Record<string, any>
      ) => {
        // Handle the error
        const structuredError = await this.handleError(error, category, severity, context);
        
        // Log with correlation
        const logCategory = this.config.categoryMapping.errorToLogCategory[category] || 'system';
        const logLevel = this.config.errorToLogLevelMapping[severity];
        
        this.agentLogger.log(
          logLevel,
          message || structuredError.userMessage,
          logCategory,
          { ...context, errorId: structuredError.errorId },
          { ...metadata, structuredError },
          [...tags, 'error-handled']
        );

        return structuredError;
      },

      // Timer with automatic error handling
      createTimerWithErrorHandling: (
        name: string,
        category: LogCategory = 'performance'
      ) => {
        const timer = childLogger.createTimer(name, category);
        
        return {
          ...timer,
          endWithErrorHandling: async (
            error?: Error,
            message?: string,
            metadata?: Record<string, any>
          ) => {
            try {
              const result = timer.end(message, metadata);
              
              if (error) {
                await this.handleError(
                  error,
                  this.config.categoryMapping.logToErrorCategory[category] || 'unknown',
                  'medium',
                  { ...context, timer: name, ...result }
                );
              }
              
              return result;
            } catch (timerError) {
              await this.handleError(
                timerError as Error,
                'performance-optimization',
                'medium',
                { ...context, timer: name }
              );
              throw timerError;
            }
          },
        };
      },
    };
  }

  /**
   * Get comprehensive system health status
   */
  async getSystemHealthStatus(): Promise<SystemHealthStatus> {
    const timestamp = Date.now();

    // Get error handler statistics
    const errorStats = this.errorHandler.getErrorStatistics();

    // Get logger statistics (would be implemented based on logger capabilities)
    const logStats = {
      logRate: 0, // logs per minute
      bufferUsage: 0.1, // percentage
      transportHealth: { console: true, file: true, analytics: true },
      flushLatency: 50, // ms
    };

    // Get system metrics
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    const systemMetrics = {
      memoryUsage: memoryUsage.heapUsed / 1024 / 1024, // MB
      cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000, // ms
    };

    // Assess error handling health
    let errorStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (errorStats.systemHealth.status === 'critical') {
      errorStatus = 'critical';
    } else if (errorStats.systemHealth.status === 'warning') {
      errorStatus = 'degraded';
    }

    // Assess logging health
    let loggingStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (logStats.bufferUsage > 0.8 || logStats.flushLatency > 1000) {
      loggingStatus = 'degraded';
    }
    if (Object.values(logStats.transportHealth).some(healthy => !healthy)) {
      loggingStatus = 'critical';
    }

    // Determine overall status
    let overallStatus: SystemHealthStatus['overallStatus'] = 'healthy';
    if (errorStatus === 'critical' || loggingStatus === 'critical') {
      overallStatus = 'critical';
    } else if (errorStatus === 'degraded' || loggingStatus === 'degraded') {
      overallStatus = 'degraded';
    }

    // Generate recommendations
    const recommendations: string[] = [];
    recommendations.push(...errorStats.systemHealth.recommendations);
    
    if (logStats.bufferUsage > 0.7) {
      recommendations.push('Consider increasing log buffer size or reducing log volume');
    }
    if (systemMetrics.memoryUsage > 512) {
      recommendations.push('Memory usage is high; consider optimizing memory allocations');
    }

    // Generate alerts
    const alerts: SystemHealthStatus['alerts'] = [];
    
    if (errorStats.errorRate > this.config.alerting.errorRateThreshold) {
      alerts.push({
        level: 'error',
        message: `High error rate: ${errorStats.errorRate} errors per minute`,
        category: 'error-handling',
        timestamp,
      });
    }

    const criticalErrors = errorStats.errorsBySeverity.critical || 0;
    if (criticalErrors > this.config.alerting.criticalErrorThreshold) {
      alerts.push({
        level: 'critical',
        message: `${criticalErrors} critical errors in the last hour`,
        category: 'error-handling',
        timestamp,
      });
    }

    this.systemHealth = {
      timestamp,
      overallStatus,
      errorHandling: {
        status: errorStatus,
        totalErrors: errorStats.totalErrors,
        errorRate: errorStats.errorRate,
        criticalErrors: criticalErrors,
        recoverySuccessRate: errorStats.recoverySuccessRate,
        consecutiveFailures: 0, // Would get from error handler
      },
      logging: {
        status: loggingStatus,
        logRate: logStats.logRate,
        bufferUsage: logStats.bufferUsage,
        transportHealth: logStats.transportHealth,
        flushLatency: logStats.flushLatency,
      },
      systemMetrics,
      recommendations: [...new Set(recommendations)],
      alerts,
    };

    return this.systemHealth;
  }

  /**
   * Get error-log correlations
   */
  async getErrorLogCorrelations(
    options: {
      errorId?: string;
      category?: ErrorCategory;
      timeRange?: { start: number; end: number };
      limit?: number;
    } = {}
  ): Promise<ErrorLogCorrelation[]> {
    let correlations = Array.from(this.correlationMap.values());

    if (options.errorId) {
      correlations = correlations.filter(c => c.error.errorId === options.errorId);
    }

    if (options.category) {
      correlations = correlations.filter(c => c.error.category === options.category);
    }

    if (options.timeRange) {
      correlations = correlations.filter(c =>
        c.timestamp >= options.timeRange!.start &&
        c.timestamp <= options.timeRange!.end
      );
    }

    // Sort by timestamp (newest first)
    correlations.sort((a, b) => b.timestamp - a.timestamp);

    if (options.limit) {
      correlations = correlations.slice(0, options.limit);
    }

    return correlations;
  }

  /**
   * Get error handler instance
   */
  getErrorHandler(): ErrorHandler {
    return this.errorHandler;
  }

  /**
   * Get agent logger instance
   */
  getAgentLogger(): AgentLogger {
    return this.agentLogger;
  }

  /**
   * Log an error with proper categorization
   */
  private async logError(error: StructuredError): Promise<void> {
    const logCategory = this.config.categoryMapping.errorToLogCategory[error.category] || 'system';
    const logLevel = this.config.errorToLogLevelMapping[error.severity];

    const message = `${error.category}: ${error.message}`;
    const metadata = {
      errorId: error.errorId,
      severity: error.severity,
      recoveryActions: error.recoveryActions,
      retryable: error.retryable,
      technicalDetails: error.technicalDetails,
    };

    // Use the appropriate logging method
    switch (logLevel) {
      case LogLevel.DEBUG:
        this.agentLogger.debug(message, logCategory, error.context, metadata);
        break;
      case LogLevel.INFO:
        this.agentLogger.info(message, logCategory, error.context, metadata);
        break;
      case LogLevel.WARN:
        this.agentLogger.warn(message, logCategory, error.context, metadata);
        break;
      case LogLevel.ERROR:
        this.agentLogger.error(message, logCategory, error.context, metadata);
        break;
      case LogLevel.CRITICAL:
        this.agentLogger.critical(message, logCategory, error.context, metadata);
        break;
    }
  }

  /**
   * Create error-log correlation
   */
  private async createErrorLogCorrelation(error: StructuredError): Promise<void> {
    const correlationId = `correlation_${error.errorId}_${Date.now()}`;
    const timeWindowMs = 60000; // 1 minute before and after
    const errorTime = error.context.timestamp;

    try {
      // Query related logs
      const relatedLogs = await this.agentLogger.queryLogs({
        startTime: errorTime - timeWindowMs,
        endTime: errorTime + timeWindowMs,
        agentId: error.context.agentId,
        sessionId: error.context.sessionId,
        limit: 100,
      });

      // Filter logs by relevance
      const beforeErrorLogs = relatedLogs.filter(log => log.timestamp < errorTime);
      const afterErrorLogs = relatedLogs.filter(log => log.timestamp > errorTime);

      // Analyze patterns
      const possibleCauses = this.analyzePossibleCauses(error, beforeErrorLogs);
      const relatedPatterns = this.identifyRelatedPatterns(error, relatedLogs);
      const recommendedActions = this.generateRecommendedActions(error, possibleCauses);

      const correlation: ErrorLogCorrelation = {
        correlationId,
        timestamp: Date.now(),
        error,
        relatedLogs: relatedLogs.map(log => ({
          id: log.id,
          timestamp: log.timestamp,
          level: log.level,
          category: log.category,
          message: log.message,
        })),
        context: {
          beforeErrorLogs: beforeErrorLogs.length,
          afterErrorLogs: afterErrorLogs.length,
          timeWindowMs,
        },
        analysis: {
          possibleCauses,
          relatedPatterns,
          recommendedActions,
        },
      };

      this.correlationMap.set(correlationId, correlation);

      // Cleanup old correlations (keep last 1000)
      if (this.correlationMap.size > 1000) {
        const oldest = Array.from(this.correlationMap.entries())
          .sort((a, b) => a[1].timestamp - b[1].timestamp)
          .slice(0, this.correlationMap.size - 1000);

        oldest.forEach(([id]) => this.correlationMap.delete(id));
      }

      this.emit('error-log-correlation-created', correlation);
    } catch (correlationError) {
      this.logger.warn('Failed to create error-log correlation', {
        errorId: error.errorId,
        error: correlationError.message,
      });
    }
  }

  /**
   * Analyze possible causes from log patterns
   */
  private analyzePossibleCauses(error: StructuredError, beforeLogs: any[]): string[] {
    const causes: string[] = [];

    // Look for warning signs
    const warnings = beforeLogs.filter(log => log.level === LogLevel.WARN);
    if (warnings.length > 0) {
      causes.push(`${warnings.length} warning(s) detected before error`);
    }

    // Look for resource issues
    const resourceLogs = beforeLogs.filter(log => 
      log.category === 'resource-management' || 
      log.message.toLowerCase().includes('memory') ||
      log.message.toLowerCase().includes('resource')
    );
    if (resourceLogs.length > 0) {
      causes.push('Resource-related issues detected');
    }

    // Look for network issues
    const networkLogs = beforeLogs.filter(log =>
      log.message.toLowerCase().includes('network') ||
      log.message.toLowerCase().includes('connection') ||
      log.message.toLowerCase().includes('timeout')
    );
    if (networkLogs.length > 0) {
      causes.push('Network connectivity issues detected');
    }

    return causes;
  }

  /**
   * Identify related patterns
   */
  private identifyRelatedPatterns(error: StructuredError, logs: any[]): string[] {
    const patterns: string[] = [];

    // Pattern: Repeated similar errors
    const similarErrors = logs.filter(log =>
      log.level >= LogLevel.ERROR &&
      log.message.includes(error.message.split(' ').slice(0, 3).join(' '))
    );
    if (similarErrors.length > 1) {
      patterns.push(`Similar error pattern repeated ${similarErrors.length} times`);
    }

    // Pattern: Cascading failures
    const errorSequence = logs
      .filter(log => log.level >= LogLevel.ERROR)
      .sort((a, b) => a.timestamp - b.timestamp);
    if (errorSequence.length > 2) {
      patterns.push('Potential cascading failure detected');
    }

    return patterns;
  }

  /**
   * Generate recommended actions
   */
  private generateRecommendedActions(error: StructuredError, causes: string[]): string[] {
    const actions: string[] = [...error.recoveryActions];

    // Add actions based on analysis
    if (causes.some(c => c.includes('resource'))) {
      actions.push('Check system resource availability');
      actions.push('Consider scaling resources or optimizing usage');
    }

    if (causes.some(c => c.includes('network'))) {
      actions.push('Verify network connectivity');
      actions.push('Check for network configuration issues');
    }

    if (causes.some(c => c.includes('warning'))) {
      actions.push('Review warning logs for early indicators');
      actions.push('Consider implementing preventive measures');
    }

    return [...new Set(actions)];
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // Error handler events
    this.errorHandler.on('error-handled', (error) => {
      this.emit('error-handled', error);
    });

    this.errorHandler.on('error-recovery-success', (event) => {
      if (this.config.enableErrorRecoveryLogging) {
        this.agentLogger.info(
          `Error recovery successful: ${event.strategyId}`,
          'error-handling',
          { errorId: event.errorId },
          { recoveryStrategy: event.strategyId }
        );
      }
    });

    this.errorHandler.on('error-recovery-failed', (event) => {
      if (this.config.enableErrorRecoveryLogging) {
        this.agentLogger.warn(
          `Error recovery failed after ${event.strategiesAttempted.length} attempts`,
          'error-handling',
          { errorId: event.errorId },
          { strategiesAttempted: event.strategiesAttempted }
        );
      }
    });

    // Logger events
    this.agentLogger.on('log-entry', (entry) => {
      this.emit('log-entry', entry);
    });

    this.agentLogger.on('logs-flushed', (count) => {
      this.emit('logs-flushed', count);
    });

    // Alert events
    if (this.config.alerting.enableErrorAlerts) {
      this.errorHandler.on('error-rate-alert', (alert) => {
        this.agentLogger.critical(
          `Error rate alert: ${alert.rate} errors per minute`,
          'error-handling',
          {},
          alert
        );
        this.emit('error-rate-alert', alert);
      });

      this.errorHandler.on('critical-error-alert', (alert) => {
        this.agentLogger.critical(
          `Critical error alert: ${alert.count} critical errors`,
          'error-handling',
          {},
          alert
        );
        this.emit('critical-error-alert', alert);
      });
    }
  }

  /**
   * Start real-time monitoring
   */
  private startMonitoring(): void {
    this.monitoringTimer = setInterval(async () => {
      try {
        const health = await this.getSystemHealthStatus();
        this.emit('system-health-update', health);

        // Emit specific alerts based on health status
        if (health.overallStatus === 'critical') {
          this.emit('system-critical-alert', health);
        } else if (health.overallStatus === 'degraded') {
          this.emit('system-degraded-alert', health);
        }
      } catch (error) {
        this.logger.error('Health monitoring failed', { error: error.message });
      }
    }, this.config.monitoring.monitoringIntervalMs);
  }

  /**
   * Start health checking
   */
  private startHealthChecking(): void {
    this.healthCheckTimer = setInterval(async () => {
      try {
        // Perform basic health checks
        const memoryUsage = process.memoryUsage();
        const heapUsed = memoryUsage.heapUsed / 1024 / 1024; // MB

        if (heapUsed > 1000) { // 1GB
          this.agentLogger.warn(
            `High memory usage detected: ${heapUsed.toFixed(2)}MB`,
            'system',
            {},
            { memoryUsage: memoryUsage }
          );
        }

        // Check error handler health
        const errorStats = this.errorHandler.getErrorStatistics();
        if (errorStats.systemHealth.status === 'critical') {
          this.agentLogger.critical(
            'Error handler reports critical system status',
            'error-handling',
            {},
            { errorStats }
          );
        }

      } catch (error) {
        this.logger.error('Health check failed', { error: error.message });
      }
    }, this.config.monitoring.healthCheckIntervalMs);
  }

  /**
   * Update configuration
   */
  updateConfiguration(newConfig: Partial<ErrorLoggingIntegrationConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };

    // Restart monitoring if interval changed
    if (newConfig.monitoring && this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.startMonitoring();
    }

    this.emit('error-logging-config-updated', { oldConfig, newConfig: this.config });
    this.logger.info('Error-logging integration configuration updated');
  }

  /**
   * Cleanup and shutdown
   */
  async cleanup(): Promise<void> {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = undefined;
    }

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    await this.errorHandler.cleanup();
    await this.agentLogger.cleanup();

    this.correlationMap.clear();
    this.removeAllListeners();

    this.logger.info('Error-logging integration cleaned up');
  }
}

/**
 * Global error-logging integration instance
 */
let globalErrorLoggingIntegration: ErrorLoggingIntegration | null = null;

/**
 * Initialize global error-logging integration
 */
export async function initializeErrorLoggingIntegration(
  config: Config,
  toolRegistry: ToolRegistry,
  agentManager: AgentManager,
  integrationConfig?: Partial<ErrorLoggingIntegrationConfig>
): Promise<ErrorLoggingIntegration> {
  if (globalErrorLoggingIntegration) {
    return globalErrorLoggingIntegration;
  }

  globalErrorLoggingIntegration = new ErrorLoggingIntegration(
    config,
    toolRegistry,
    agentManager,
    integrationConfig
  );

  await globalErrorLoggingIntegration.initialize();
  return globalErrorLoggingIntegration;
}

/**
 * Get global error-logging integration instance
 */
export function getErrorLoggingIntegration(): ErrorLoggingIntegration | null {
  return globalErrorLoggingIntegration;
}

export default ErrorLoggingIntegration;