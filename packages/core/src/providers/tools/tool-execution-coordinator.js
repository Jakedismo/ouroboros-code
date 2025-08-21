/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { PerformanceOptimizer } from './performance-optimizer.js';
/**
 * Advanced tool execution coordinator that orchestrates optimal execution
 * of multiple tools using intelligent planning, caching, and resource management.
 *
 * Features:
 * - Intelligent execution planning with dependency analysis
 * - Adaptive parallel execution with resource management
 * - Performance-optimized caching and result sharing
 * - Real-time progress monitoring and metrics
 * - Circuit breaker patterns for reliability
 * - Resource pooling and efficient cleanup
 * - Advanced error handling and recovery strategies
 */
export class ToolExecutionCoordinator {
    optimizer;
    toolManager;
    // Active execution tracking
    activeExecutions = new Map();
    constructor(toolManager, optimizerConfig) {
        this.toolManager = toolManager;
        this.optimizer = new PerformanceOptimizer(optimizerConfig);
    }
    /**
     * Execute multiple tools with intelligent coordination and optimization
     */
    async executeTools(toolCalls, context, options = {}) {
        const executionId = this.generateExecutionId();
        const startTime = performance.now();
        try {
            // Phase 1: Planning
            options.onProgress?.({
                phase: 'planning',
                completed: 0,
                total: toolCalls.length,
                executing: [],
                estimatedRemaining: 0,
                progress: 0,
            });
            console.debug(`[ToolExecutionCoordinator] Starting execution of ${toolCalls.length} tools`);
            const plan = await this.createOptimizedPlan(toolCalls, context, options);
            // Initialize execution tracking
            this.activeExecutions.set(executionId, {
                plan,
                context,
                startTime,
                results: new Map(),
                errors: [],
            });
            // Phase 2: Execution
            const executionResult = await this.executePlan(executionId, plan, context, options);
            // Phase 3: Cleanup and metrics
            const totalTime = performance.now() - startTime;
            console.debug(`[ToolExecutionCoordinator] Completed execution in ${totalTime.toFixed(2)}ms`);
            return {
                results: executionResult.results,
                success: executionResult.success,
                totalTime,
                plan,
                metrics: {
                    cacheHits: executionResult.cacheHits,
                    totalTools: toolCalls.length,
                    parallelGroups: plan.executionGroups.filter(g => g.mode === 'parallel').length,
                    resourceUtilization: this.calculateResourceUtilization(plan),
                    optimizationsApplied: plan.optimizations.map(o => o.name),
                },
                errors: executionResult.errors,
            };
        }
        catch (error) {
            console.error('[ToolExecutionCoordinator] Execution failed:', error);
            return {
                results: new Map(),
                success: false,
                totalTime: performance.now() - startTime,
                plan: { originalCalls: toolCalls, executionGroups: [], estimatedDuration: 0, optimizations: [], resourceRequirements: { memoryMB: 0, cpuCores: 0, networkMbps: 0, diskIOPS: 0, connections: 0, tempStorageMB: 0 } },
                metrics: { cacheHits: 0, totalTools: 0, parallelGroups: 0, resourceUtilization: 0, optimizationsApplied: [] },
                errors: [{
                        toolId: 'coordinator',
                        toolName: 'coordinator',
                        error: error instanceof Error ? error.message : 'Unknown error',
                    }],
            };
        }
        finally {
            this.activeExecutions.delete(executionId);
        }
    }
    /**
     * Execute a single tool with optimization
     */
    async executeSingleTool(toolCall, context, options = {}) {
        const result = await this.executeTools([toolCall], context, options);
        if (result.results.has(toolCall.id)) {
            return result.results.get(toolCall.id);
        }
        throw new Error(`Tool execution failed: ${result.errors[0]?.error || 'Unknown error'}`);
    }
    /**
     * Get performance metrics for all tools
     */
    getPerformanceMetrics() {
        return this.optimizer.getAllMetrics();
    }
    /**
     * Get cache statistics
     */
    getCacheStatistics() {
        return this.optimizer.getCacheStats();
    }
    /**
     * Get resource pool statistics
     */
    getResourceStatistics() {
        return this.optimizer.getResourcePoolStats();
    }
    /**
     * Clear performance cache
     */
    clearCache() {
        this.optimizer.clearCache();
    }
    /**
     * Invalidate cache by tags
     */
    invalidateCache(tags) {
        return this.optimizer.invalidateCache(tags);
    }
    /**
     * Get current execution status for active executions
     */
    getExecutionStatus() {
        const statuses = new Map();
        for (const [executionId, execution] of this.activeExecutions.entries()) {
            const completed = execution.results.size;
            const total = execution.plan.originalCalls.length;
            const progress = total > 0 ? (completed / total) * 100 : 0;
            statuses.set(executionId, {
                phase: 'executing',
                completed,
                total,
                executing: [], // Would track currently executing tools
                estimatedRemaining: this.estimateRemainingTime(execution),
                progress,
            });
        }
        return statuses;
    }
    /**
     * Cancel an active execution
     */
    async cancelExecution(executionId) {
        const execution = this.activeExecutions.get(executionId);
        if (!execution) {
            return false;
        }
        // Signal cancellation through AbortController
        if (execution.context.signal && !execution.context.signal.aborted) {
            // Note: We can't abort an external signal, but we can track the cancellation
            console.debug(`[ToolExecutionCoordinator] Cancellation requested for execution ${executionId}`);
            return true;
        }
        return false;
    }
    /**
     * Optimize tool execution order
     */
    optimizeToolOrder(toolCalls) {
        return this.optimizer.optimizeExecutionOrder(toolCalls);
    }
    /**
     * Estimate execution time for tools
     */
    estimateExecutionTime(toolCalls) {
        return toolCalls.reduce((total, call) => total + this.optimizer.estimateExecutionTime(call), 0);
    }
    /**
     * Destroy coordinator and clean up resources
     */
    async destroy() {
        // Cancel all active executions
        for (const executionId of this.activeExecutions.keys()) {
            await this.cancelExecution(executionId);
        }
        // Clean up optimizer
        await this.optimizer.destroy();
        console.debug('[ToolExecutionCoordinator] Destroyed coordinator and cleaned up resources');
    }
    // Private implementation methods
    async createOptimizedPlan(toolCalls, context, options) {
        const planStart = performance.now();
        // Create execution plan with optimizer
        let plan = await this.optimizer.createExecutionPlan(toolCalls, context);
        // Apply execution options overrides
        if (options.forceSequential) {
            plan = this.convertToSequential(plan);
        }
        if (options.maxParallel) {
            plan = this.limitParallelism(plan, options.maxParallel);
        }
        const planTime = performance.now() - planStart;
        console.debug(`[ToolExecutionCoordinator] Created execution plan in ${planTime.toFixed(2)}ms`);
        return plan;
    }
    async executePlan(executionId, plan, context, options) {
        const execution = this.activeExecutions.get(executionId);
        let cacheHits = 0;
        let completed = 0;
        // Execute groups in dependency order
        for (const group of plan.executionGroups) {
            options.onProgress?.({
                phase: 'executing',
                completed,
                total: plan.originalCalls.length,
                executing: group.tools.map(t => t.name),
                estimatedRemaining: this.estimateRemainingTime(execution),
                progress: (completed / plan.originalCalls.length) * 100,
            });
            try {
                const groupResults = await this.executeGroup(group, context, options);
                // Merge results
                for (const [toolId, result] of groupResults.entries()) {
                    execution.results.set(toolId, result);
                    if (result.fromCache) {
                        cacheHits++;
                    }
                }
                completed += group.tools.length;
            }
            catch (error) {
                const errorInfo = {
                    toolId: group.groupId,
                    toolName: group.tools.map(t => t.name).join(', '),
                    error: error instanceof Error ? error.message : 'Unknown error',
                };
                execution.errors.push(errorInfo);
                if (options.failFast) {
                    throw error;
                }
            }
            // Check for cancellation
            if (context.signal?.aborted) {
                throw new Error('Execution was cancelled');
            }
        }
        options.onProgress?.({
            phase: 'completed',
            completed,
            total: plan.originalCalls.length,
            executing: [],
            estimatedRemaining: 0,
            progress: 100,
        });
        return {
            results: execution.results,
            success: execution.errors.length === 0,
            cacheHits,
            errors: execution.errors,
        };
    }
    async executeGroup(group, context, options) {
        const results = new Map();
        console.debug(`[ToolExecutionCoordinator] Executing group ${group.groupId} with ${group.tools.length} tools (${group.mode})`);
        switch (group.mode) {
            case 'parallel':
                const parallelResults = await this.executeParallel(group.tools, context, options);
                parallelResults.forEach((result, toolId) => results.set(toolId, result));
                break;
            case 'sequential':
                for (const tool of group.tools) {
                    const result = await this.executeSingleToolWithOptimizations(tool, context, options);
                    results.set(tool.id, result);
                }
                break;
            case 'pipeline':
                const pipelineResults = await this.executePipeline(group.tools, context, options);
                pipelineResults.forEach((result, toolId) => results.set(toolId, result));
                break;
        }
        return results;
    }
    async executeParallel(tools, context, options) {
        const maxParallel = Math.min(options.maxParallel || 10, this.optimizer['config'].maxParallelExecutions);
        const results = new Map();
        const errors = [];
        // Process tools in batches
        for (let i = 0; i < tools.length; i += maxParallel) {
            const batch = tools.slice(i, i + maxParallel);
            const batchPromises = batch.map(async (tool) => {
                try {
                    const result = await this.executeSingleToolWithOptimizations(tool, context, options);
                    return { tool, result, error: null };
                }
                catch (error) {
                    return { tool, result: null, error };
                }
            });
            const batchResults = await Promise.allSettled(batchPromises);
            for (const promiseResult of batchResults) {
                if (promiseResult.status === 'fulfilled') {
                    const { tool, result, error } = promiseResult.value;
                    if (result) {
                        results.set(tool.id, result);
                    }
                    else if (error) {
                        errors.push({ toolId: tool.id, toolName: tool.name, error });
                    }
                }
            }
        }
        if (errors.length > 0 && options.failFast) {
            throw new Error(`Parallel execution failed: ${errors[0].error}`);
        }
        return results;
    }
    async executePipeline(tools, context, options) {
        const results = new Map();
        let previousResult = null;
        for (const tool of tools) {
            // In a pipeline, previous results might be inputs to the next tool
            const modifiedTool = this.adaptToolForPipeline(tool, previousResult);
            const result = await this.executeSingleToolWithOptimizations(modifiedTool, context, options);
            results.set(tool.id, result);
            previousResult = result;
        }
        return results;
    }
    async executeSingleToolWithOptimizations(toolCall, context, options) {
        const startTime = performance.now();
        // Check circuit breaker
        if (this.optimizer.isCircuitBreakerOpen(toolCall.name)) {
            throw new Error(`Circuit breaker is open for tool ${toolCall.name}`);
        }
        // Try cache first (unless disabled)
        if (!options.disableCache) {
            const cachedResult = this.optimizer.getCachedResult(toolCall, context);
            if (cachedResult) {
                console.debug(`[ToolExecutionCoordinator] Using cached result for ${toolCall.name}`);
                return { ...cachedResult, fromCache: true };
            }
        }
        try {
            // Execute tool through manager
            const result = await this.toolManager.executeTool(toolCall, context);
            const executionTime = performance.now() - startTime;
            // Record performance metrics
            this.optimizer.recordExecution(toolCall.name, executionTime, result.success, this.estimateMemoryUsage(result));
            // Cache successful results (unless disabled)
            if (result.success && !options.disableCache) {
                this.optimizer.cacheResult(toolCall, context, result);
            }
            return result;
        }
        catch (error) {
            const executionTime = performance.now() - startTime;
            // Record failed execution
            this.optimizer.recordExecution(toolCall.name, executionTime, false);
            throw error;
        }
    }
    convertToSequential(plan) {
        return {
            ...plan,
            executionGroups: plan.executionGroups.map(group => ({
                ...group,
                mode: 'sequential',
                estimatedTime: group.tools.reduce((sum, tool) => sum + this.optimizer.estimateExecutionTime(tool), 0),
            })),
        };
    }
    limitParallelism(plan, maxParallel) {
        return {
            ...plan,
            executionGroups: plan.executionGroups.map(group => {
                if (group.mode === 'parallel' && group.tools.length > maxParallel) {
                    // Split large parallel groups into smaller ones
                    const subGroups = [];
                    for (let i = 0; i < group.tools.length; i += maxParallel) {
                        const subTools = group.tools.slice(i, i + maxParallel);
                        subGroups.push({
                            ...group,
                            tools: subTools,
                            groupId: `${group.groupId}_${i / maxParallel}`,
                            estimatedTime: Math.max(...subTools.map(tool => this.optimizer.estimateExecutionTime(tool))),
                        });
                    }
                    return subGroups;
                }
                return [group];
            }).flat(),
        };
    }
    adaptToolForPipeline(tool, previousResult) {
        // In a real pipeline, we might modify parameters based on previous results
        // For now, just return the original tool
        return tool;
    }
    calculateResourceUtilization(plan) {
        // Calculate resource efficiency based on parallelization and optimization
        const totalTools = plan.originalCalls.length;
        const parallelGroups = plan.executionGroups.filter(g => g.mode === 'parallel').length;
        if (totalTools === 0)
            return 0;
        return Math.min(100, (parallelGroups / totalTools) * 100 +
            plan.optimizations.length * 10);
    }
    estimateRemainingTime(execution) {
        const elapsed = performance.now() - execution.startTime;
        const completed = execution.results.size;
        const total = execution.plan.originalCalls.length;
        if (completed === 0)
            return execution.plan.estimatedDuration;
        const avgTimePerTool = elapsed / completed;
        const remaining = total - completed;
        return remaining * avgTimePerTool;
    }
    estimateMemoryUsage(result) {
        // Rough estimate of result memory usage
        return JSON.stringify(result).length * 2;
    }
    generateExecutionId() {
        return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
//# sourceMappingURL=tool-execution-coordinator.js.map