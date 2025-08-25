/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { Logger } from '../../../core/src/utils/logger.js';
import { Config } from '../../../core/src/config/config.js';

/**
 * Log levels with numeric priorities
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4,
}

/**
 * Log categories for better organization
 */
export type LogCategory = 
  | 'agent-lifecycle'
  | 'workflow-execution'
  | 'tool-execution'
  | 'session-management'
  | 'provider-communication'
  | 'resource-management'
  | 'performance'
  | 'analytics'
  | 'error-handling'
  | 'system'
  | 'user-interaction'
  | 'security'
  | 'configuration';

/**
 * Structured log entry
 */
export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  context: {
    agentId?: string;
    agentName?: string;
    sessionId?: string;
    workflowId?: string;
    stepId?: string;
    toolName?: string;
    userId?: string;
    requestId?: string;
    traceId?: string;
  };
  metadata: Record<string, any>;
  tags: string[];
  source: {
    file?: string;
    function?: string;
    line?: number;
  };
  performance?: {
    duration?: number;
    memoryUsage?: number;
    cpuUsage?: number;
  };
  correlationId?: string;
}

/**
 * Log transport interface
 */
export interface LogTransport {
  name: string;
  level: LogLevel;
  enabled: boolean;
  write(entry: LogEntry): Promise<void>;
  flush?(): Promise<void>;
  close?(): Promise<void>;
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
  level: LogLevel;
  enableConsoleLogging: boolean;
  enableFileLogging: boolean;
  logDirectory: string;
  maxLogFileSize: number; // bytes
  maxLogFiles: number;
  enableStructuredLogging: boolean;
  enablePerformanceLogging: boolean;
  enableCorrelationTracking: boolean;
  bufferSize: number;
  flushIntervalMs: number;
  transports: {
    console: {
      enabled: boolean;
      level: LogLevel;
      colorize: boolean;
      format: 'simple' | 'json' | 'structured';
    };
    file: {
      enabled: boolean;
      level: LogLevel;
      format: 'json' | 'structured';
      rotationSize: number;
      maxFiles: number;
    };
    analytics: {
      enabled: boolean;
      level: LogLevel;
      aggregationIntervalMs: number;
    };
  };
  filters: {
    enableCategoryFiltering: boolean;
    enableTagFiltering: boolean;
    excludeCategories: LogCategory[];
    includeOnlyTags: string[];
  };
}

/**
 * Log aggregation data
 */
export interface LogAggregation {
  timeWindow: {
    start: number;
    end: number;
  };
  totalLogs: number;
  logsByLevel: Record<LogLevel, number>;
  logsByCategory: Record<LogCategory, number>;
  topErrors: Array<{
    message: string;
    count: number;
    lastOccurrence: number;
  }>;
  performanceMetrics: {
    averageDuration: number;
    maxDuration: number;
    minDuration: number;
    totalOperations: number;
  };
  systemHealth: {
    errorRate: number;
    warningRate: number;
    averageMemoryUsage: number;
    peakMemoryUsage: number;
  };
}

/**
 * Comprehensive logging system for the multi-agent framework
 */
export class AgentLogger extends EventEmitter {
  private logger: Logger;
  private config: LoggingConfig;
  private transports: Map<string, LogTransport> = new Map();
  private logBuffer: LogEntry[] = [];
  private logCounter = 0;
  private flushTimer?: NodeJS.Timeout;
  private correlationIdCounter = 0;
  private activeCorrelations: Map<string, string> = new Map();

  constructor(
    private coreConfig: Config,
    loggingConfig?: Partial<LoggingConfig>
  ) {
    super();
    this.logger = new Logger('AgentLogger');
    
    // Default logging configuration
    this.config = {
      level: LogLevel.INFO,
      enableConsoleLogging: true,
      enableFileLogging: true,
      logDirectory: join(process.cwd(), 'logs'),
      maxLogFileSize: 10 * 1024 * 1024, // 10MB
      maxLogFiles: 10,
      enableStructuredLogging: true,
      enablePerformanceLogging: true,
      enableCorrelationTracking: true,
      bufferSize: 1000,
      flushIntervalMs: 5000, // 5 seconds
      transports: {
        console: {
          enabled: true,
          level: LogLevel.INFO,
          colorize: true,
          format: 'structured',
        },
        file: {
          enabled: true,
          level: LogLevel.DEBUG,
          format: 'json',
          rotationSize: 10 * 1024 * 1024, // 10MB
          maxFiles: 10,
        },
        analytics: {
          enabled: true,
          level: LogLevel.INFO,
          aggregationIntervalMs: 60000, // 1 minute
        },
      },
      filters: {
        enableCategoryFiltering: false,
        enableTagFiltering: false,
        excludeCategories: [],
        includeOnlyTags: [],
      },
      ...loggingConfig,
    };
  }

  /**
   * Initialize logging system
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing agent logging system...');

    // Ensure log directory exists
    await this.ensureLogDirectory();

    // Initialize transports
    await this.initializeTransports();

    // Start flush timer
    this.startFlushTimer();

    // Set up process event handlers
    this.setupProcessEventHandlers();

    this.emit('logger-initialized', {
      config: this.config,
      transportsCount: this.transports.size,
    });

    this.logger.info('Agent logging system initialized successfully');
  }

  /**
   * Log a debug message
   */
  debug(
    message: string,
    category: LogCategory = 'system',
    context?: Partial<LogEntry['context']>,
    metadata?: Record<string, any>
  ): void {
    this.log(LogLevel.DEBUG, message, category, context, metadata);
  }

  /**
   * Log an info message
   */
  info(
    message: string,
    category: LogCategory = 'system',
    context?: Partial<LogEntry['context']>,
    metadata?: Record<string, any>
  ): void {
    this.log(LogLevel.INFO, message, category, context, metadata);
  }

  /**
   * Log a warning message
   */
  warn(
    message: string,
    category: LogCategory = 'system',
    context?: Partial<LogEntry['context']>,
    metadata?: Record<string, any>
  ): void {
    this.log(LogLevel.WARN, message, category, context, metadata);
  }

  /**
   * Log an error message
   */
  error(
    message: string,
    category: LogCategory = 'system',
    context?: Partial<LogEntry['context']>,
    metadata?: Record<string, any>
  ): void {
    this.log(LogLevel.ERROR, message, category, context, metadata);
  }

  /**
   * Log a critical message
   */
  critical(
    message: string,
    category: LogCategory = 'system',
    context?: Partial<LogEntry['context']>,
    metadata?: Record<string, any>
  ): void {
    this.log(LogLevel.CRITICAL, message, category, context, metadata);
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    message: string,
    category: LogCategory,
    context: Partial<LogEntry['context']> = {},
    metadata: Record<string, any> = {},
    tags: string[] = []
  ): void {
    // Check if logging level is enabled
    if (level < this.config.level) {
      return;
    }

    // Apply filters
    if (!this.shouldLog(category, tags)) {
      return;
    }

    // Create log entry
    const entry: LogEntry = {
      id: `log_${++this.logCounter}_${Date.now()}`,
      timestamp: Date.now(),
      level,
      category,
      message,
      context: { ...context },
      metadata: { ...metadata },
      tags: [...tags],
      source: this.getSourceInfo(),
      correlationId: this.getCorrelationId(context),
    };

    // Add performance data if enabled
    if (this.config.enablePerformanceLogging) {
      entry.performance = this.getPerformanceData();
    }

    // Buffer the entry
    this.bufferLogEntry(entry);

    // Emit log event
    this.emit('log-entry', entry);

    // Force flush for critical logs
    if (level === LogLevel.CRITICAL) {
      this.flush().catch(error => {
        console.error('Failed to flush critical log:', error);
      });
    }
  }

  /**
   * Create a performance timing logger
   */
  createTimer(
    name: string,
    category: LogCategory = 'performance',
    context?: Partial<LogEntry['context']>
  ) {
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    return {
      end: (message?: string, metadata?: Record<string, any>) => {
        const duration = Date.now() - startTime;
        const memoryUsed = process.memoryUsage().heapUsed - startMemory;

        this.info(
          message || `${name} completed`,
          category,
          context,
          {
            timer: name,
            duration,
            memoryUsed,
            ...metadata,
          }
        );

        return { duration, memoryUsed };
      },
    };
  }

  /**
   * Create a correlation ID for request tracking
   */
  createCorrelationId(prefix: string = 'req'): string {
    const correlationId = `${prefix}_${++this.correlationIdCounter}_${Date.now()}`;
    this.activeCorrelations.set(correlationId, correlationId);
    return correlationId;
  }

  /**
   * Create a child logger with preset context
   */
  createChildLogger(
    context: Partial<LogEntry['context']>,
    tags: string[] = []
  ) {
    return {
      debug: (message: string, category?: LogCategory, additionalContext?: Record<string, any>, metadata?: Record<string, any>) =>
        this.log(LogLevel.DEBUG, message, category || 'system', { ...context, ...additionalContext }, metadata, tags),
      
      info: (message: string, category?: LogCategory, additionalContext?: Record<string, any>, metadata?: Record<string, any>) =>
        this.log(LogLevel.INFO, message, category || 'system', { ...context, ...additionalContext }, metadata, tags),
      
      warn: (message: string, category?: LogCategory, additionalContext?: Record<string, any>, metadata?: Record<string, any>) =>
        this.log(LogLevel.WARN, message, category || 'system', { ...context, ...additionalContext }, metadata, tags),
      
      error: (message: string, category?: LogCategory, additionalContext?: Record<string, any>, metadata?: Record<string, any>) =>
        this.log(LogLevel.ERROR, message, category || 'system', { ...context, ...additionalContext }, metadata, tags),
      
      critical: (message: string, category?: LogCategory, additionalContext?: Record<string, any>, metadata?: Record<string, any>) =>
        this.log(LogLevel.CRITICAL, message, category || 'system', { ...context, ...additionalContext }, metadata, tags),

      createTimer: (name: string, category?: LogCategory) =>
        this.createTimer(name, category, context),
    };
  }

  /**
   * Query logs with filters
   */
  async queryLogs(
    options: {
      level?: LogLevel;
      category?: LogCategory;
      startTime?: number;
      endTime?: number;
      limit?: number;
      tags?: string[];
      search?: string;
      agentId?: string;
      sessionId?: string;
      correlationId?: string;
    } = {}
  ): Promise<LogEntry[]> {
    // This would typically query from persistent storage
    // For now, return from buffer
    let results = [...this.logBuffer];

    if (options.level !== undefined) {
      results = results.filter(entry => entry.level >= options.level!);
    }

    if (options.category) {
      results = results.filter(entry => entry.category === options.category);
    }

    if (options.startTime) {
      results = results.filter(entry => entry.timestamp >= options.startTime!);
    }

    if (options.endTime) {
      results = results.filter(entry => entry.timestamp <= options.endTime!);
    }

    if (options.tags && options.tags.length > 0) {
      results = results.filter(entry => 
        options.tags!.some(tag => entry.tags.includes(tag))
      );
    }

    if (options.search) {
      const searchLower = options.search.toLowerCase();
      results = results.filter(entry =>
        entry.message.toLowerCase().includes(searchLower) ||
        Object.values(entry.metadata).some(value =>
          String(value).toLowerCase().includes(searchLower)
        )
      );
    }

    if (options.agentId) {
      results = results.filter(entry => entry.context.agentId === options.agentId);
    }

    if (options.sessionId) {
      results = results.filter(entry => entry.context.sessionId === options.sessionId);
    }

    if (options.correlationId) {
      results = results.filter(entry => entry.correlationId === options.correlationId);
    }

    // Sort by timestamp (newest first)
    results.sort((a, b) => b.timestamp - a.timestamp);

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Generate log aggregation report
   */
  async generateAggregation(
    startTime: number,
    endTime: number
  ): Promise<LogAggregation> {
    const logs = await this.queryLogs({ startTime, endTime });

    const logsByLevel: Record<LogLevel, number> = {
      [LogLevel.DEBUG]: 0,
      [LogLevel.INFO]: 0,
      [LogLevel.WARN]: 0,
      [LogLevel.ERROR]: 0,
      [LogLevel.CRITICAL]: 0,
    };

    const logsByCategory: Record<LogCategory, number> = {} as any;
    const errorMessages = new Map<string, number>();
    const durations: number[] = [];
    const memoryUsages: number[] = [];

    for (const log of logs) {
      logsByLevel[log.level]++;
      logsByCategory[log.category] = (logsByCategory[log.category] || 0) + 1;

      if (log.level >= LogLevel.ERROR) {
        errorMessages.set(log.message, (errorMessages.get(log.message) || 0) + 1);
      }

      if (log.performance?.duration) {
        durations.push(log.performance.duration);
      }

      if (log.performance?.memoryUsage) {
        memoryUsages.push(log.performance.memoryUsage);
      }
    }

    const topErrors = Array.from(errorMessages.entries())
      .map(([message, count]) => ({
        message,
        count,
        lastOccurrence: logs.find(l => l.message === message)?.timestamp || 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const totalLogs = logs.length;
    const errorCount = logsByLevel[LogLevel.ERROR] + logsByLevel[LogLevel.CRITICAL];
    const warningCount = logsByLevel[LogLevel.WARN];

    return {
      timeWindow: { start: startTime, end: endTime },
      totalLogs,
      logsByLevel,
      logsByCategory,
      topErrors,
      performanceMetrics: {
        averageDuration: durations.length > 0 ? durations.reduce((a, b) => a + b) / durations.length : 0,
        maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
        minDuration: durations.length > 0 ? Math.min(...durations) : 0,
        totalOperations: durations.length,
      },
      systemHealth: {
        errorRate: totalLogs > 0 ? errorCount / totalLogs : 0,
        warningRate: totalLogs > 0 ? warningCount / totalLogs : 0,
        averageMemoryUsage: memoryUsages.length > 0 ? memoryUsages.reduce((a, b) => a + b) / memoryUsages.length : 0,
        peakMemoryUsage: memoryUsages.length > 0 ? Math.max(...memoryUsages) : 0,
      },
    };
  }

  /**
   * Flush buffered logs to all transports
   */
  async flush(): Promise<void> {
    if (this.logBuffer.length === 0) {
      return;
    }

    const logsToFlush = [...this.logBuffer];
    this.logBuffer.length = 0;

    const flushPromises = Array.from(this.transports.values())
      .filter(transport => transport.enabled)
      .map(async transport => {
        try {
          for (const entry of logsToFlush) {
            if (entry.level >= transport.level) {
              await transport.write(entry);
            }
          }
          if (transport.flush) {
            await transport.flush();
          }
        } catch (error) {
          console.error(`Transport ${transport.name} flush failed:`, error);
        }
      });

    await Promise.allSettled(flushPromises);
    this.emit('logs-flushed', logsToFlush.length);
  }

  /**
   * Update logging configuration
   */
  updateConfiguration(newConfig: Partial<LoggingConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };

    // Restart flush timer if interval changed
    if (newConfig.flushIntervalMs && newConfig.flushIntervalMs !== oldConfig.flushIntervalMs) {
      this.stopFlushTimer();
      this.startFlushTimer();
    }

    this.emit('logger-config-updated', { oldConfig, newConfig: this.config });
    this.info('Logging configuration updated', 'configuration');
  }

  /**
   * Add a custom transport
   */
  addTransport(transport: LogTransport): void {
    this.transports.set(transport.name, transport);
    this.info(`Transport added: ${transport.name}`, 'configuration');
  }

  /**
   * Remove a transport
   */
  removeTransport(name: string): void {
    const transport = this.transports.get(name);
    if (transport) {
      this.transports.delete(name);
      if (transport.close) {
        transport.close().catch(error => {
          console.error(`Failed to close transport ${name}:`, error);
        });
      }
      this.info(`Transport removed: ${name}`, 'configuration');
    }
  }

  /**
   * Initialize log directory
   */
  private async ensureLogDirectory(): Promise<void> {
    try {
      await fs.access(this.config.logDirectory);
    } catch {
      await fs.mkdir(this.config.logDirectory, { recursive: true });
    }
  }

  /**
   * Initialize default transports
   */
  private async initializeTransports(): Promise<void> {
    // Console transport
    if (this.config.transports.console.enabled) {
      this.addTransport(new ConsoleTransport(this.config.transports.console));
    }

    // File transport
    if (this.config.transports.file.enabled) {
      this.addTransport(new FileTransport(this.config.logDirectory, this.config.transports.file));
    }

    // Analytics transport
    if (this.config.transports.analytics.enabled) {
      this.addTransport(new AnalyticsTransport(this.config.transports.analytics, this));
    }
  }

  /**
   * Check if log should be written based on filters
   */
  private shouldLog(category: LogCategory, tags: string[]): boolean {
    // Category filtering
    if (this.config.filters.enableCategoryFiltering) {
      if (this.config.filters.excludeCategories.includes(category)) {
        return false;
      }
    }

    // Tag filtering
    if (this.config.filters.enableTagFiltering) {
      if (this.config.filters.includeOnlyTags.length > 0) {
        return this.config.filters.includeOnlyTags.some(tag => tags.includes(tag));
      }
    }

    return true;
  }

  /**
   * Get source information
   */
  private getSourceInfo(): LogEntry['source'] {
    const stack = new Error().stack;
    if (!stack) return {};

    // Parse stack trace to get caller info
    const lines = stack.split('\n');
    const callerLine = lines.find(line => 
      !line.includes('AgentLogger') && 
      !line.includes('node_modules') &&
      line.includes('at ')
    );

    if (callerLine) {
      const match = callerLine.match(/at\s+(.+?)\s+\((.+):(\d+):\d+\)/);
      if (match) {
        return {
          function: match[1],
          file: match[2],
          line: parseInt(match[3]),
        };
      }
    }

    return {};
  }

  /**
   * Get or create correlation ID
   */
  private getCorrelationId(context: Partial<LogEntry['context']>): string | undefined {
    if (!this.config.enableCorrelationTracking) {
      return undefined;
    }

    // Use existing correlation ID from context
    if (context.requestId || context.traceId) {
      return context.requestId || context.traceId;
    }

    // Generate new correlation ID for session/agent
    if (context.sessionId || context.agentId) {
      const key = context.sessionId || context.agentId || 'default';
      if (!this.activeCorrelations.has(key)) {
        this.activeCorrelations.set(key, this.createCorrelationId('auto'));
      }
      return this.activeCorrelations.get(key);
    }

    return undefined;
  }

  /**
   * Get performance data
   */
  private getPerformanceData(): LogEntry['performance'] {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      memoryUsage: memoryUsage.heapUsed,
      cpuUsage: cpuUsage.user + cpuUsage.system,
    };
  }

  /**
   * Buffer log entry
   */
  private bufferLogEntry(entry: LogEntry): void {
    this.logBuffer.push(entry);

    // Force flush if buffer is full
    if (this.logBuffer.length >= this.config.bufferSize) {
      this.flush().catch(error => {
        console.error('Failed to flush full buffer:', error);
      });
    }
  }

  /**
   * Start flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(error => {
        console.error('Scheduled flush failed:', error);
      });
    }, this.config.flushIntervalMs);
  }

  /**
   * Stop flush timer
   */
  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  /**
   * Setup process event handlers
   */
  private setupProcessEventHandlers(): void {
    // Flush logs on exit
    const gracefulShutdown = async () => {
      await this.cleanup();
      process.exit(0);
    };

    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);
  }

  /**
   * Cleanup and shutdown
   */
  async cleanup(): Promise<void> {
    this.stopFlushTimer();

    // Flush any remaining logs
    await this.flush();

    // Close all transports
    const closePromises = Array.from(this.transports.values())
      .map(async transport => {
        try {
          if (transport.close) {
            await transport.close();
          }
        } catch (error) {
          console.error(`Failed to close transport ${transport.name}:`, error);
        }
      });

    await Promise.allSettled(closePromises);

    this.transports.clear();
    this.logBuffer.length = 0;
    this.activeCorrelations.clear();
    this.removeAllListeners();

    this.logger.info('Agent logging system cleaned up');
  }
}

/**
 * Console transport implementation
 */
class ConsoleTransport implements LogTransport {
  name = 'console';
  enabled = true;
  
  constructor(
    private config: { level: LogLevel; colorize: boolean; format: string },
    public level: LogLevel = config.level
  ) {}

  async write(entry: LogEntry): Promise<void> {
    const levelNames = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'];
    const colors = {
      [LogLevel.DEBUG]: '\x1b[36m', // Cyan
      [LogLevel.INFO]: '\x1b[32m',  // Green
      [LogLevel.WARN]: '\x1b[33m',  // Yellow
      [LogLevel.ERROR]: '\x1b[31m', // Red
      [LogLevel.CRITICAL]: '\x1b[35m', // Magenta
    };
    const reset = '\x1b[0m';

    const timestamp = new Date(entry.timestamp).toISOString();
    const level = levelNames[entry.level];
    const color = this.config.colorize ? colors[entry.level] : '';

    let output: string;

    if (this.config.format === 'json') {
      output = JSON.stringify(entry, null, 2);
    } else {
      const contextStr = entry.context.agentId ? `[${entry.context.agentId}] ` : '';
      const categoryStr = `[${entry.category}] `;
      
      output = `${color}${timestamp} ${level}${reset} ${categoryStr}${contextStr}${entry.message}`;
      
      if (Object.keys(entry.metadata).length > 0) {
        output += ` ${JSON.stringify(entry.metadata)}`;
      }
    }

    console.log(output);
  }
}

/**
 * File transport implementation
 */
class FileTransport implements LogTransport {
  name = 'file';
  enabled = true;
  
  private currentFile: string;
  private currentSize = 0;

  constructor(
    private logDirectory: string,
    private config: { level: LogLevel; format: string; rotationSize: number; maxFiles: number },
    public level: LogLevel = config.level
  ) {
    this.currentFile = this.getLogFileName();
  }

  async write(entry: LogEntry): Promise<void> {
    const line = this.formatEntry(entry) + '\n';
    
    // Check if rotation is needed
    if (this.currentSize + line.length > this.config.rotationSize) {
      await this.rotateLog();
    }

    await fs.appendFile(this.currentFile, line, 'utf8');
    this.currentSize += line.length;
  }

  private formatEntry(entry: LogEntry): string {
    if (this.config.format === 'json') {
      return JSON.stringify(entry);
    } else {
      return `${new Date(entry.timestamp).toISOString()} [${entry.category}] ${entry.message} ${JSON.stringify(entry.metadata)}`;
    }
  }

  private getLogFileName(index: number = 0): string {
    const date = new Date().toISOString().split('T')[0];
    const suffix = index > 0 ? `.${index}` : '';
    return join(this.logDirectory, `agent-${date}${suffix}.log`);
  }

  private async rotateLog(): Promise<void> {
    // Find next available log file
    let index = 1;
    while (index < this.config.maxFiles) {
      const fileName = this.getLogFileName(index);
      try {
        await fs.access(fileName);
        index++;
      } catch {
        this.currentFile = fileName;
        this.currentSize = 0;
        return;
      }
    }

    // If we've reached max files, use the last one
    this.currentFile = this.getLogFileName(this.config.maxFiles - 1);
    this.currentSize = 0;
  }
}

/**
 * Analytics transport for aggregating logs
 */
class AnalyticsTransport implements LogTransport {
  name = 'analytics';
  enabled = true;
  
  private aggregationBuffer: LogEntry[] = [];
  private aggregationTimer?: NodeJS.Timeout;

  constructor(
    private config: { level: LogLevel; aggregationIntervalMs: number },
    private logger: AgentLogger,
    public level: LogLevel = config.level
  ) {
    this.startAggregation();
  }

  async write(entry: LogEntry): Promise<void> {
    this.aggregationBuffer.push(entry);
  }

  private startAggregation(): void {
    this.aggregationTimer = setInterval(async () => {
      if (this.aggregationBuffer.length === 0) return;

      const now = Date.now();
      const start = now - this.config.aggregationIntervalMs;
      
      try {
        const aggregation = await this.logger.generateAggregation(start, now);
        this.logger.emit('log-aggregation', aggregation);
      } catch (error) {
        console.error('Log aggregation failed:', error);
      }

      this.aggregationBuffer.length = 0;
    }, this.config.aggregationIntervalMs);
  }

  async close(): Promise<void> {
    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer);
      this.aggregationTimer = undefined;
    }
  }
}

export default AgentLogger;