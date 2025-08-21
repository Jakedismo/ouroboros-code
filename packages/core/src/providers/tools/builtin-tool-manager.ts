/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FunctionDeclaration } from '@google/genai';
import { ToolRegistry } from '../../tools/tool-registry.js';
import { Config } from '../../config/config.js';
import { 
  AnyDeclarativeTool
} from '../../tools/tools.js';
import { 
  UnifiedTool, 
  UnifiedToolCall, 
  UnifiedToolResult, 
  ToolExecutionContext
} from './unified-tool-interface.js';
import { PerformanceOptimizer, ToolPerformanceMetrics } from './performance-optimizer.js';
import { ToolExecutionCoordinator, ExecutionOptions } from './tool-execution-coordinator.js';
import { ResourcePoolFactory } from './resource-pools.js';
import { ToolBehaviorManager } from './tool-behaviors.js';
import { FileSystemBoundary } from './filesystem-boundary.js';
import { ShellToolSecurity } from './shell-tool-security.js';
import { MemoryToolHandler } from './memory-tool-handler.js';
import { WebToolsHandler } from './web-tools-handler.js';
import { BuiltinToolManagerHelpers, SecurityValidationResult } from './builtin-tool-manager-helpers.js';

/**
 * Enhanced core manager for built-in tools with advanced performance optimization,
 * intelligent caching, resource management, and comprehensive security.
 * 
 * Provides provider-agnostic access to Gemini CLI's built-in tool suite across
 * OpenAI, Anthropic, and Gemini providers with stellar performance characteristics.
 * 
 * Features:
 * - Intelligent execution planning and optimization
 * - Multi-level caching with automatic invalidation
 * - Resource pooling and efficient cleanup
 * - Performance monitoring and metrics
 * - Circuit breaker patterns for reliability
 * - Advanced security validation and boundaries
 * - Parallel execution with dependency management
 */
export class BuiltinToolManager {
  private toolRegistry?: ToolRegistry;
  private builtinTools: Map<string, AnyDeclarativeTool> = new Map();
  private config: Config;
  
  // Performance optimization components
  private performanceOptimizer: PerformanceOptimizer;
  private executionCoordinator: ToolExecutionCoordinator;
  
  // Security and validation components
  private toolBehaviors: ToolBehaviorManager;
  private fileSystemBoundary: FileSystemBoundary;
  private shellSecurity: ShellToolSecurity;
  private memoryHandler: MemoryToolHandler;
  private webHandler: WebToolsHandler;
  
  // Performance tracking
  private executionStats: {
    totalExecutions: number;
    successfulExecutions: number;
    cacheHits: number;
    averageExecutionTime: number;
    lastExecutionTimes: number[];
  } = {
    totalExecutions: 0,
    successfulExecutions: 0,
    cacheHits: 0,
    averageExecutionTime: 0,
    lastExecutionTimes: [],
  };
  
  constructor(config: Config, toolRegistry?: ToolRegistry) {
    this.config = config;
    this.toolRegistry = toolRegistry;
    
    // Initialize performance optimization components
    this.performanceOptimizer = new PerformanceOptimizer({
      maxCacheSize: 500,
      defaultTTL: 5 * 60 * 1000, // 5 minutes
      maxParallelExecutions: 8,
      enableProfiling: true,
      enableResourcePools: true,
    });
    
    // Initialize security and validation components
    this.toolBehaviors = new ToolBehaviorManager(config);
    this.fileSystemBoundary = new FileSystemBoundary(config);
    this.shellSecurity = new ShellToolSecurity(config);
    this.memoryHandler = new MemoryToolHandler(config);
    this.webHandler = new WebToolsHandler(config);
    
    // Initialize execution coordinator
    this.executionCoordinator = new ToolExecutionCoordinator(
      this,
      {
        maxCacheSize: 500,
        enableProfiling: true,
        maxParallelExecutions: 8,
      }
    );
  }
  
  /**
   * Initialize and discover all built-in tools with performance optimization setup.
   * This populates the internal tool registry, extracts built-in tools, and
   * initializes all performance and security components.
   */
  async initialize(): Promise<void> {
    // Create and populate tool registry if not provided
    if (!this.toolRegistry) {
      this.toolRegistry = await this.config.createToolRegistry();
    }
    
    // Get all registered tools
    const allTools = this.toolRegistry.getAllTools();
    
    // Filter and store built-in tools (non-MCP tools don't have ':' in their names)
    for (const tool of allTools) {
      if (!tool.name.includes(':')) { // MCP tools have server:tool format
        this.builtinTools.set(tool.name, tool);
      }
    }
    
    // Initialize specialized handlers
    await this.memoryHandler.initialize();
    
    console.debug(`[BuiltinToolManager] Initialized ${this.builtinTools.size} built-in tools with performance optimization`);
    
    // Pre-warm commonly used tools
    await this.preWarmTools();
  }
  
  /**
   * Get all built-in tools as unified tools for provider conversion.
   * These tools can then be converted to provider-specific formats.
   * 
   * @returns Array of unified tool definitions
   */
  getUnifiedTools(): UnifiedTool[] {
    const unifiedTools: UnifiedTool[] = [];
    
    for (const tool of this.builtinTools.values()) {
      const declaration = tool.schema;
      unifiedTools.push(this.convertToUnified(declaration, tool));
    }
    
    return unifiedTools;
  }
  
  /**
   * Execute a built-in tool with stellar performance optimization.
   * Features intelligent caching, security validation, resource management,
   * and comprehensive error handling with circuit breaker patterns.
   * 
   * @param toolCall - The unified tool call to execute
   * @param context - Execution context with configuration and callbacks
   * @returns Unified tool result with performance metrics
   */
  async executeTool(
    toolCall: UnifiedToolCall,
    context: ToolExecutionContext
  ): Promise<UnifiedToolResult> {
    const startTime = performance.now();
    this.executionStats.totalExecutions++;
    
    try {
      // Check if circuit breaker is open for this tool
      if (this.performanceOptimizer.isCircuitBreakerOpen(toolCall.name)) {
        return this.createErrorResult(toolCall.id, 
          `Tool ${toolCall.name} is temporarily unavailable (circuit breaker open)`);
      }
      
      // Try cache first
      const cachedResult = this.performanceOptimizer.getCachedResult(toolCall, context);
      if (cachedResult) {
        this.executionStats.cacheHits++;
        console.debug(`[BuiltinToolManager] Cache hit for ${toolCall.name}`);
        return { ...cachedResult, fromCache: true };
      }
      
      // Validate tool exists
      const tool = this.builtinTools.get(toolCall.name);
      if (!tool) {
        return this.createErrorResult(toolCall.id, 
          `Built-in tool ${toolCall.name} not found`);
      }
      
      // Perform security validation
      const securityValidation = await this.validateToolSecurity(toolCall, context);
      if (!securityValidation.allowed) {
        return this.createErrorResult(toolCall.id, 
          `Security validation failed: ${securityValidation.reason}`);
      }
      
      // Execute tool with optimization
      const result = await this.executeToolOptimized(tool, toolCall, context);
      
      // Record performance metrics
      const executionTime = performance.now() - startTime;
      this.recordExecution(toolCall.name, executionTime, result.isError !== true);
      
      // Cache successful results
      if (result.isError !== true && this.shouldCacheResult(toolCall.name)) {
        this.performanceOptimizer.cacheResult(toolCall, context, result);
      }
      
      return result;
      
    } catch (error) {
      const executionTime = performance.now() - startTime;
      this.recordExecution(toolCall.name, executionTime, false);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[BuiltinToolManager] Tool execution failed for ${toolCall.name}:`, error);
      
      return this.createErrorResult(toolCall.id, errorMessage);
    }
  }
  
  /**
   * Execute multiple tools with intelligent coordination and optimization.
   * Uses advanced execution planning, parallel processing, and resource management.
   * 
   * @param toolCalls - Array of tool calls to execute
   * @param context - Execution context
   * @param options - Execution options for optimization
   * @returns Map of results by tool call ID
   */
  async executeMultipleTools(
    toolCalls: UnifiedToolCall[],
    context: ToolExecutionContext,
    options: ExecutionOptions = {}
  ): Promise<Map<string, UnifiedToolResult>> {
    console.debug(`[BuiltinToolManager] Executing ${toolCalls.length} tools with coordination`);
    
    const result = await this.executionCoordinator.executeTools(toolCalls, context, options);
    
    // Update aggregate statistics
    this.executionStats.totalExecutions += toolCalls.length;
    this.executionStats.successfulExecutions += Array.from(result.results.values())
      .filter(r => r.isError !== true).length;
    this.executionStats.cacheHits += result.metrics.cacheHits;
    
    return result.results;
  }
  
  /**
   * Get comprehensive performance metrics for all tools.
   */
  getPerformanceMetrics(): {
    overall: any;
    byTool: Map<string, ToolPerformanceMetrics>;
    cache: unknown;
    resourcePools: unknown;
  } {
    return {
      overall: { ...this.executionStats },
      byTool: this.performanceOptimizer.getAllMetrics(),
      cache: this.performanceOptimizer.getCacheStats(),
      resourcePools: this.performanceOptimizer.getResourcePoolStats(),
    };
  }
  
  /**
   * Get available tools with category information and performance stats.
   */
  async getAvailableTools(): Promise<Array<UnifiedTool & { 
    category: string; 
    performance?: ToolPerformanceMetrics;
  }>> {
    const tools = this.getUnifiedTools();
    
    return tools.map(tool => ({
      ...tool,
      category: this.getToolCategory(tool.name),
      performance: this.performanceOptimizer.getToolMetrics(tool.name) || undefined,
    }));
  }
  
  /**
   * Get tool statistics and usage information.
   */
  getToolStatistics(): {
    totalToolsAvailable: number;
    toolsByCategory: Record<string, number>;
    executionStats: any;
    topPerformingTools: Array<{ name: string; avgTime: number; successRate: number }>;
  } {
    const tools = this.getUnifiedTools();
    const toolsByCategory: Record<string, number> = {};
    
    // Count tools by category
    for (const tool of tools) {
      const category = this.getToolCategory(tool.name);
      toolsByCategory[category] = (toolsByCategory[category] || 0) + 1;
    }
    
    // Get top performing tools
    const allMetrics = this.performanceOptimizer.getAllMetrics();
    const topPerformingTools = Array.from(allMetrics.entries())
      .map(([name, metrics]) => ({
        name,
        avgTime: metrics.avgExecutionTime,
        successRate: metrics.successRate,
      }))
      .sort((a, b) => (b.successRate - a.successRate) || (a.avgTime - b.avgTime))
      .slice(0, 10);
    
    return {
      totalToolsAvailable: tools.length,
      toolsByCategory,
      executionStats: { ...this.executionStats },
      topPerformingTools,
    };
  }
  
  /**
   * Clear performance caches and reset statistics.
   */
  clearPerformanceCache(): void {
    this.performanceOptimizer.clearCache();
    this.executionStats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      cacheHits: 0,
      averageExecutionTime: 0,
      lastExecutionTimes: [],
    };
    console.debug('[BuiltinToolManager] Performance cache cleared');
  }
  
  /**
   * Invalidate cache entries by tags (e.g., after file modifications).
   */
  invalidateCache(tags: string[]): number {
    const invalidated = this.performanceOptimizer.invalidateCache(tags);
    console.debug(`[BuiltinToolManager] Invalidated ${invalidated} cache entries for tags: ${tags.join(', ')}`);
    return invalidated;
  }
  
  /**
   * Get specialized tool handlers for advanced operations.
   */
  getSpecializedHandlers(): {
    memory: MemoryToolHandler;
    web: WebToolsHandler;
    shell: ShellToolSecurity;
    filesystem: FileSystemBoundary;
  } {
    return {
      memory: this.memoryHandler,
      web: this.webHandler,
      shell: this.shellSecurity,
      filesystem: this.fileSystemBoundary,
    };
  }
  
  /**
   * Optimize tool execution order based on dependencies and performance.
   */
  optimizeToolOrder(toolCalls: UnifiedToolCall[]): UnifiedToolCall[] {
    return this.performanceOptimizer.optimizeExecutionOrder(toolCalls);
  }
  
  /**
   * Estimate execution time for a set of tools.
   */
  estimateExecutionTime(toolCalls: UnifiedToolCall[]): number {
    return toolCalls.reduce((total, call) => total + this.performanceOptimizer.estimateExecutionTime(call), 0);
  }
  
  /**
   * Clean up resources and shut down performance components.
   */
  async destroy(): Promise<void> {
    await this.executionCoordinator.destroy();
    await this.performanceOptimizer.destroy();
    await ResourcePoolFactory.destroyAll();
    
    console.debug('[BuiltinToolManager] Destroyed and cleaned up all resources');
  }
  
  // Private helper methods
  
  private async executeToolOptimized(
    tool: AnyDeclarativeTool,
    toolCall: UnifiedToolCall,
    context: ToolExecutionContext
  ): Promise<UnifiedToolResult> {
    return await BuiltinToolManagerHelpers.executeToolOptimized(
      tool,
      toolCall,
      context,
      this.toolBehaviors,
      this.fileSystemBoundary,
      this.shellSecurity,
      this.webHandler
    );
  }
  
  /**
   * Validate tool security using comprehensive security components.
   */
  private async validateToolSecurity(
    toolCall: UnifiedToolCall,
    context: ToolExecutionContext
  ): Promise<SecurityValidationResult> {
    return await BuiltinToolManagerHelpers.validateToolSecurity(
      toolCall,
      context,
      this.toolBehaviors,
      this.fileSystemBoundary,
      this.shellSecurity,
      this.webHandler
    );
  }
  
  /**
   * Check if tool results should be cached based on tool characteristics.
   */
  private shouldCacheResult(toolName: string): boolean {
    return BuiltinToolManagerHelpers.shouldCacheResult(toolName);
  }
  
  /**
   * Record execution statistics and performance metrics.
   */
  private recordExecution(toolName: string, executionTime: number, success: boolean): void {
    BuiltinToolManagerHelpers.recordExecution(
      toolName,
      executionTime,
      success,
      this.executionStats,
      this.performanceOptimizer
    );
  }
  
  /**
   * Pre-warm commonly used tools for better initial performance.
   */
  private async preWarmTools(): Promise<void> {
    await BuiltinToolManagerHelpers.preWarmTools(this.builtinTools);
  }
  
  /**
   * Create a standardized error result.
   */
  private createErrorResult(toolCallId: string, errorMessage: string): UnifiedToolResult {
    return BuiltinToolManagerHelpers.createErrorResult(toolCallId, errorMessage);
  }
  
  /**
   * Get tool category for classification.
   */
  private getToolCategory(toolName: string): 'filesystem' | 'web' | 'system' | 'other' {
    return BuiltinToolManagerHelpers.getToolCategory(toolName);
  }
  
  
  
  /**
   * Convert a Gemini function declaration to unified tool format.
   * 
   * @private
   */
  private convertToUnified(declaration: FunctionDeclaration, tool: AnyDeclarativeTool): UnifiedTool {
    return BuiltinToolManagerHelpers.convertToUnified(declaration, tool);
  }
  
  /**
   * Get the underlying tool registry (for advanced use cases).
   * 
   * @returns The initialized tool registry
   */
  getToolRegistry(): ToolRegistry | undefined {
    return this.toolRegistry;
  }
  
  /**
   * Get a specific built-in tool by name.
   * 
   * @param name - Tool name
   * @returns The tool instance or undefined
   */
  getTool(name: string): AnyDeclarativeTool | undefined {
    return this.builtinTools.get(name);
  }
  
  /**
   * Get all built-in tool names.
   * 
   * @returns Array of tool names
   */
  getToolNames(): string[] {
    return Array.from(this.builtinTools.keys());
  }
  
  /**
   * Check if a tool is available.
   * 
   * @param name - Tool name
   * @returns True if tool exists
   */
  hasTool(name: string): boolean {
    return this.builtinTools.has(name);
  }
}