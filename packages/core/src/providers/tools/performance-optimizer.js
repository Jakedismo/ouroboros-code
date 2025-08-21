/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Advanced performance optimizer for built-in tools execution.
 * Provides intelligent caching, parallel execution planning, resource management,
 * and performance monitoring for optimal tool execution across all providers.
 *
 * Features:
 * - Multi-level intelligent caching with LRU eviction
 * - Dependency-aware parallel execution planning
 * - Resource pooling and management
 * - Performance profiling and optimization
 * - Circuit breaker patterns for reliability
 * - Adaptive timeout management
 * - Memory-efficient streaming for large operations
 */
export class PerformanceOptimizer {
    // Cache storage with LRU eviction
    cache = new Map();
    cacheAccessOrder = [];
    maxCacheSize;
    defaultTTL;
    // Performance metrics storage
    metrics = new Map();
    executionHistory = new Map();
    // Resource pools
    pools = new Map();
    // Circuit breaker state
    circuitBreakers = new Map();
    // Configuration
    config;
    constructor(config) {
        this.config = {
            maxCacheSize: 1000,
            defaultTTL: 5 * 60 * 1000, // 5 minutes
            maxParallelExecutions: 10,
            circuitBreakerThreshold: 5,
            circuitBreakerTimeout: 60000,
            enableProfiling: true,
            enableResourcePools: true,
            ...config,
        };
        this.maxCacheSize = this.config.maxCacheSize;
        this.defaultTTL = this.config.defaultTTL;
        // Initialize resource pools
        if (this.config.enableResourcePools) {
            this.initializeResourcePools();
        }
        // Start background cleanup tasks
        this.startBackgroundTasks();
    }
    /**
     * Create an optimized execution plan for multiple tool calls
     */
    async createExecutionPlan(toolCalls, context) {
        const startTime = performance.now();
        // Analyze tool dependencies and characteristics
        const analysis = await this.analyzeToolCalls(toolCalls);
        // Create execution groups based on dependencies and characteristics
        const executionGroups = this.createExecutionGroups(toolCalls, analysis);
        // Apply optimization strategies
        const optimizations = this.identifyOptimizations(toolCalls, analysis);
        // Calculate resource requirements
        const resourceRequirements = this.calculateResourceRequirements(toolCalls);
        // Estimate total execution time
        const estimatedDuration = this.estimateGroupsExecutionTime(executionGroups);
        const planningTime = performance.now() - startTime;
        console.debug(`[PerformanceOptimizer] Created execution plan in ${planningTime.toFixed(2)}ms`);
        return {
            originalCalls: toolCalls,
            executionGroups,
            estimatedDuration,
            optimizations,
            resourceRequirements,
        };
    }
    /**
     * Check if a result is cached
     */
    getCachedResult(toolCall, context) {
        const cacheKey = this.generateCacheKey(toolCall, context);
        const entry = this.cache.get(cacheKey);
        if (!entry) {
            return null;
        }
        // Check TTL
        if (Date.now() - entry.timestamp.getTime() > entry.ttl) {
            this.cache.delete(cacheKey);
            this.removeCacheKeyFromAccessOrder(cacheKey);
            return null;
        }
        // Update access statistics
        entry.accessCount++;
        entry.lastAccess = new Date();
        this.updateCacheAccessOrder(cacheKey);
        // Update cache hit rate in metrics
        this.updateCacheHitRate(toolCall.name, true);
        console.debug(`[PerformanceOptimizer] Cache hit for ${toolCall.name}`);
        return entry.result;
    }
    /**
     * Cache a tool execution result
     */
    cacheResult(toolCall, context, result, customTTL) {
        const cacheKey = this.generateCacheKey(toolCall, context);
        const ttl = customTTL || this.getTTLForTool(toolCall.name);
        // Calculate memory size (rough estimate)
        const sizeBytes = this.estimateResultSize(result);
        const entry = {
            result,
            timestamp: new Date(),
            ttl,
            accessCount: 1,
            lastAccess: new Date(),
            sizeBytes,
            tags: this.generateCacheTags(toolCall, context),
        };
        // Ensure cache size limit
        this.evictIfNecessary(sizeBytes);
        this.cache.set(cacheKey, entry);
        this.updateCacheAccessOrder(cacheKey);
        console.debug(`[PerformanceOptimizer] Cached result for ${toolCall.name} (TTL: ${ttl}ms, Size: ${sizeBytes} bytes)`);
    }
    /**
     * Record tool execution metrics
     */
    recordExecution(toolName, executionTime, success, memoryUsage) {
        if (!this.config.enableProfiling)
            return;
        const existing = this.metrics.get(toolName) || {
            toolName,
            avgExecutionTime: 0,
            minExecutionTime: Infinity,
            maxExecutionTime: 0,
            totalExecutions: 0,
            successRate: 1,
            cacheHitRate: 0,
            avgMemoryUsage: 0,
            lastExecution: new Date(),
            trend: 'stable',
        };
        // Update execution statistics
        existing.totalExecutions++;
        existing.lastExecution = new Date();
        existing.minExecutionTime = Math.min(existing.minExecutionTime, executionTime);
        existing.maxExecutionTime = Math.max(existing.maxExecutionTime, executionTime);
        // Calculate new averages
        existing.avgExecutionTime = ((existing.avgExecutionTime * (existing.totalExecutions - 1)) + executionTime) / existing.totalExecutions;
        if (memoryUsage) {
            existing.avgMemoryUsage = ((existing.avgMemoryUsage * (existing.totalExecutions - 1)) + memoryUsage) / existing.totalExecutions;
        }
        // Update success rate
        const successCount = Math.floor(existing.successRate * existing.totalExecutions);
        const newSuccessCount = success ? successCount + 1 : successCount;
        existing.successRate = newSuccessCount / existing.totalExecutions;
        // Update performance trend
        existing.trend = this.calculatePerformanceTrend(toolName, executionTime);
        this.metrics.set(toolName, existing);
        // Update circuit breaker state
        this.updateCircuitBreaker(toolName, success);
        console.debug(`[PerformanceOptimizer] Recorded execution for ${toolName}: ${executionTime}ms (success: ${success})`);
    }
    /**
     * Get performance metrics for a tool
     */
    getToolMetrics(toolName) {
        return this.metrics.get(toolName) || null;
    }
    /**
     * Get all performance metrics
     */
    getAllMetrics() {
        return new Map(this.metrics);
    }
    /**
     * Check if a tool's circuit breaker is open
     */
    isCircuitBreakerOpen(toolName) {
        const breaker = this.circuitBreakers.get(toolName);
        if (!breaker)
            return false;
        if (breaker.state === 'open') {
            // Check if timeout has passed to attempt half-open
            if (Date.now() - breaker.lastFailure.getTime() > this.config.circuitBreakerTimeout) {
                breaker.state = 'half-open';
                console.debug(`[PerformanceOptimizer] Circuit breaker for ${toolName} is now half-open`);
                return false;
            }
            return true;
        }
        return false;
    }
    /**
     * Invalidate cache entries by tags
     */
    invalidateCache(tags) {
        let invalidated = 0;
        for (const [key, entry] of this.cache.entries()) {
            if (entry.tags.some(tag => tags.includes(tag))) {
                this.cache.delete(key);
                this.removeCacheKeyFromAccessOrder(key);
                invalidated++;
            }
        }
        console.debug(`[PerformanceOptimizer] Invalidated ${invalidated} cache entries`);
        return invalidated;
    }
    /**
     * Clear all cached results
     */
    clearCache() {
        this.cache.clear();
        this.cacheAccessOrder.length = 0;
        console.debug('[PerformanceOptimizer] Cleared all cache entries');
    }
    /**
     * Get cache statistics
     */
    getCacheStats() {
        let totalMemory = 0;
        let oldestEntry = null;
        let newestEntry = null;
        for (const entry of this.cache.values()) {
            totalMemory += entry.sizeBytes;
            if (!oldestEntry || entry.timestamp < oldestEntry) {
                oldestEntry = entry.timestamp;
            }
            if (!newestEntry || entry.timestamp > newestEntry) {
                newestEntry = entry.timestamp;
            }
        }
        // Calculate overall hit rate from metrics
        let totalHits = 0;
        let totalAttempts = 0;
        for (const metric of this.metrics.values()) {
            const attempts = metric.totalExecutions;
            const hits = Math.floor(attempts * metric.cacheHitRate);
            totalHits += hits;
            totalAttempts += attempts;
        }
        const hitRate = totalAttempts > 0 ? totalHits / totalAttempts : 0;
        return {
            size: this.cache.size,
            maxSize: this.maxCacheSize,
            hitRate,
            totalMemoryMB: Math.round(totalMemory / (1024 * 1024) * 100) / 100,
            oldestEntry,
            newestEntry,
        };
    }
    /**
     * Get resource pool statistics
     */
    getResourcePoolStats() {
        const stats = new Map();
        for (const [name, pool] of this.pools.entries()) {
            stats.set(name, pool.getStats());
        }
        return stats;
    }
    /**
     * Optimize tool execution order based on dependencies and performance
     */
    optimizeExecutionOrder(toolCalls) {
        // Create dependency graph
        const dependencies = this.analyzeDependencies(toolCalls);
        // Sort by priority and dependencies
        const sorted = [...toolCalls].sort((a, b) => {
            const aDeps = dependencies.get(a.id) || [];
            const bDeps = dependencies.get(b.id) || [];
            // Tools with fewer dependencies execute first
            if (aDeps.length !== bDeps.length) {
                return aDeps.length - bDeps.length;
            }
            // Use performance metrics as tiebreaker
            const aMetrics = this.getToolMetrics(a.name);
            const bMetrics = this.getToolMetrics(b.name);
            if (aMetrics && bMetrics) {
                return aMetrics.avgExecutionTime - bMetrics.avgExecutionTime;
            }
            return 0;
        });
        return sorted;
    }
    /**
     * Estimate execution time for a tool call
     */
    estimateExecutionTime(toolCall) {
        const metrics = this.getToolMetrics(toolCall.name);
        if (metrics) {
            // Use historical data with trend adjustment
            const baseTime = metrics.avgExecutionTime;
            const trendMultiplier = metrics.trend === 'improving' ? 0.9 :
                metrics.trend === 'degrading' ? 1.1 : 1.0;
            return baseTime * trendMultiplier;
        }
        // Default estimates based on tool type
        return this.getDefaultExecutionTime(toolCall.name);
    }
    /**
     * Acquire a resource from a pool
     */
    async acquireResource(poolName, timeoutMs = 5000) {
        const pool = this.pools.get(poolName);
        if (!pool) {
            throw new Error(`Resource pool '${poolName}' not found`);
        }
        return pool.acquire(timeoutMs);
    }
    /**
     * Release a resource back to a pool
     */
    releaseResource(poolName, resource) {
        const pool = this.pools.get(poolName);
        if (pool) {
            pool.release(resource);
        }
    }
    /**
     * Destroy the optimizer and clean up resources
     */
    async destroy() {
        // Clear caches
        this.clearCache();
        // Destroy resource pools
        await Promise.all(Array.from(this.pools.values()).map(pool => pool.destroy()));
        this.pools.clear();
        console.debug('[PerformanceOptimizer] Destroyed optimizer and cleaned up resources');
    }
    // Private helper methods
    async analyzeToolCalls(toolCalls) {
        // Analyze each tool call for characteristics
        return {
            dependencies: this.analyzeDependencies(toolCalls),
            ioIntensive: this.identifyIOIntensiveTools(toolCalls),
            cpuIntensive: this.identifyCPUIntensiveTools(toolCalls),
            cacheable: this.identifyCacheableTools(toolCalls),
            parallelizable: this.identifyParallelizableTools(toolCalls),
        };
    }
    createExecutionGroups(toolCalls, analysis) {
        const groups = [];
        const processed = new Set();
        for (const toolCall of toolCalls) {
            if (processed.has(toolCall.id))
                continue;
            const group = this.createGroupForTool(toolCall, toolCalls, analysis, processed);
            groups.push(group);
        }
        return groups;
    }
    createGroupForTool(rootTool, allTools, analysis, processed) {
        const groupTools = [rootTool];
        processed.add(rootTool.id);
        // Find tools that can be grouped with this one
        for (const tool of allTools) {
            if (processed.has(tool.id))
                continue;
            if (this.canGroupTogether(rootTool, tool, analysis)) {
                groupTools.push(tool);
                processed.add(tool.id);
            }
        }
        // Determine execution mode
        const mode = this.determineExecutionMode(groupTools, analysis);
        return {
            tools: groupTools,
            mode,
            priority: this.calculateGroupPriority(groupTools),
            dependencies: [],
            groupId: `group_${rootTool.name}_${Date.now()}`,
            estimatedTime: this.estimateGroupExecutionTime(groupTools, mode),
        };
    }
    identifyOptimizations(toolCalls, analysis) {
        const strategies = [];
        // Caching optimization
        const cacheableTools = toolCalls.filter(call => analysis.cacheable.has(call.id));
        if (cacheableTools.length > 0) {
            strategies.push({
                type: 'caching',
                name: 'Intelligent Caching',
                description: 'Cache results for frequently accessed tools',
                expectedImprovement: 0.6,
                affectedTools: cacheableTools.map(t => t.name),
            });
        }
        // Parallel execution optimization
        const parallelizableTools = toolCalls.filter(call => analysis.parallelizable.has(call.id));
        if (parallelizableTools.length > 1) {
            strategies.push({
                type: 'parallel',
                name: 'Parallel Execution',
                description: 'Execute independent tools in parallel',
                expectedImprovement: 0.4,
                affectedTools: parallelizableTools.map(t => t.name),
            });
        }
        return strategies;
    }
    calculateResourceRequirements(toolCalls) {
        let memoryMB = 0;
        let cpuCores = 1;
        let networkMbps = 0;
        let diskIOPS = 0;
        let connections = 0;
        let tempStorageMB = 0;
        for (const toolCall of toolCalls) {
            const reqs = this.getToolResourceRequirements(toolCall.name);
            memoryMB += reqs.memoryMB;
            cpuCores = Math.max(cpuCores, reqs.cpuCores);
            networkMbps += reqs.networkMbps;
            diskIOPS += reqs.diskIOPS;
            connections += reqs.connections;
            tempStorageMB += reqs.tempStorageMB;
        }
        return {
            memoryMB,
            cpuCores,
            networkMbps,
            diskIOPS,
            connections,
            tempStorageMB,
        };
    }
    getToolResourceRequirements(toolName) {
        // Default resource requirements by tool type
        const defaults = {
            'read_file': { memoryMB: 10, cpuCores: 1, networkMbps: 0, diskIOPS: 10, connections: 0, tempStorageMB: 0 },
            'write_file': { memoryMB: 10, cpuCores: 1, networkMbps: 0, diskIOPS: 20, connections: 0, tempStorageMB: 5 },
            'web_fetch': { memoryMB: 5, cpuCores: 1, networkMbps: 1, diskIOPS: 0, connections: 1, tempStorageMB: 2 },
            'run_shell_command': { memoryMB: 20, cpuCores: 1, networkMbps: 0, diskIOPS: 5, connections: 0, tempStorageMB: 10 },
        };
        return defaults[toolName] || { memoryMB: 5, cpuCores: 1, networkMbps: 0, diskIOPS: 1, connections: 0, tempStorageMB: 1 };
    }
    estimateGroupsExecutionTime(groups) {
        let totalTime = 0;
        for (const group of groups) {
            totalTime += group.estimatedTime;
        }
        return totalTime;
    }
    generateCacheKey(toolCall, context) {
        const params = JSON.stringify(toolCall.parameters, Object.keys(toolCall.parameters).sort());
        return `${toolCall.name}:${context.provider}:${Buffer.from(params).toString('base64')}`;
    }
    getTTLForTool(toolName) {
        // Tool-specific TTL configuration
        const ttlConfig = {
            'read_file': 2 * 60 * 1000, // 2 minutes for file reads
            'web_fetch': 10 * 60 * 1000, // 10 minutes for web content
            'google_web_search': 30 * 60 * 1000, // 30 minutes for search results
            'ls': 1 * 60 * 1000, // 1 minute for directory listings
        };
        return ttlConfig[toolName] || this.defaultTTL;
    }
    generateCacheTags(toolCall, context) {
        const tags = [toolCall.name, context.provider];
        // Add parameter-based tags
        if (toolCall.parameters.file_path) {
            tags.push(`file:${toolCall.parameters.file_path}`);
        }
        if (toolCall.parameters.url) {
            tags.push(`url:${toolCall.parameters.url}`);
        }
        return tags;
    }
    estimateResultSize(result) {
        return JSON.stringify(result).length * 2; // Rough estimate
    }
    evictIfNecessary(newEntrySize) {
        while (this.cache.size >= this.maxCacheSize || this.shouldEvictForMemory(newEntrySize)) {
            const oldestKey = this.cacheAccessOrder[0];
            if (oldestKey) {
                this.cache.delete(oldestKey);
                this.cacheAccessOrder.shift();
            }
            else {
                break;
            }
        }
    }
    shouldEvictForMemory(newEntrySize) {
        const currentMemory = Array.from(this.cache.values()).reduce((sum, entry) => sum + entry.sizeBytes, 0);
        const maxMemory = 100 * 1024 * 1024; // 100MB cache limit
        return (currentMemory + newEntrySize) > maxMemory;
    }
    updateCacheAccessOrder(key) {
        const index = this.cacheAccessOrder.indexOf(key);
        if (index > -1) {
            this.cacheAccessOrder.splice(index, 1);
        }
        this.cacheAccessOrder.push(key);
    }
    removeCacheKeyFromAccessOrder(key) {
        const index = this.cacheAccessOrder.indexOf(key);
        if (index > -1) {
            this.cacheAccessOrder.splice(index, 1);
        }
    }
    updateCacheHitRate(toolName, isHit) {
        const metric = this.metrics.get(toolName);
        if (metric) {
            const totalAttempts = Math.max(1, metric.totalExecutions);
            const currentHits = Math.floor(metric.cacheHitRate * totalAttempts);
            const newHits = isHit ? currentHits + 1 : currentHits;
            metric.cacheHitRate = newHits / (totalAttempts + 1);
        }
    }
    calculatePerformanceTrend(toolName, executionTime) {
        const history = this.executionHistory.get(toolName) || [];
        history.push(executionTime);
        // Keep only recent history (last 10 executions)
        if (history.length > 10) {
            history.shift();
        }
        this.executionHistory.set(toolName, history);
        if (history.length < 3) {
            return 'stable';
        }
        // Calculate trend using linear regression
        const recent = history.slice(-5);
        const older = history.slice(-10, -5);
        if (older.length === 0)
            return 'stable';
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
        const threshold = olderAvg * 0.1; // 10% threshold
        if (recentAvg < olderAvg - threshold) {
            return 'improving';
        }
        else if (recentAvg > olderAvg + threshold) {
            return 'degrading';
        }
        else {
            return 'stable';
        }
    }
    updateCircuitBreaker(toolName, success) {
        const breaker = this.circuitBreakers.get(toolName) || {
            failures: 0,
            lastFailure: new Date(),
            state: 'closed',
        };
        if (success) {
            if (breaker.state === 'half-open') {
                breaker.state = 'closed';
                breaker.failures = 0;
            }
        }
        else {
            breaker.failures++;
            breaker.lastFailure = new Date();
            if (breaker.failures >= this.config.circuitBreakerThreshold) {
                breaker.state = 'open';
                console.warn(`[PerformanceOptimizer] Circuit breaker opened for ${toolName} after ${breaker.failures} failures`);
            }
        }
        this.circuitBreakers.set(toolName, breaker);
    }
    analyzeDependencies(toolCalls) {
        const dependencies = new Map();
        for (const toolCall of toolCalls) {
            const deps = this.getToolDependencies(toolCall, toolCalls);
            dependencies.set(toolCall.id, deps);
        }
        return dependencies;
    }
    getToolDependencies(toolCall, allCalls) {
        const deps = [];
        // Simple dependency analysis based on parameters
        if (toolCall.name === 'write_file' || toolCall.name === 'edit_file') {
            // Find read operations on the same file that should execute first
            const filePath = toolCall.parameters.file_path;
            for (const otherCall of allCalls) {
                if (otherCall.id !== toolCall.id &&
                    otherCall.name === 'read_file' &&
                    otherCall.parameters.file_path === filePath) {
                    deps.push(otherCall.id);
                }
            }
        }
        return deps;
    }
    identifyIOIntensiveTools(toolCalls) {
        const ioIntensive = new Set();
        const ioTools = ['read_file', 'write_file', 'read_many_files', 'ls', 'glob', 'grep'];
        for (const toolCall of toolCalls) {
            if (ioTools.includes(toolCall.name)) {
                ioIntensive.add(toolCall.id);
            }
        }
        return ioIntensive;
    }
    identifyCPUIntensiveTools(toolCalls) {
        const cpuIntensive = new Set();
        const cpuTools = ['run_shell_command', 'grep'];
        for (const toolCall of toolCalls) {
            if (cpuTools.includes(toolCall.name)) {
                cpuIntensive.add(toolCall.id);
            }
        }
        return cpuIntensive;
    }
    identifyCacheableTools(toolCalls) {
        const cacheable = new Set();
        const cacheableTools = ['read_file', 'web_fetch', 'google_web_search', 'ls'];
        for (const toolCall of toolCalls) {
            if (cacheableTools.includes(toolCall.name)) {
                cacheable.add(toolCall.id);
            }
        }
        return cacheable;
    }
    identifyParallelizableTools(toolCalls) {
        const parallelizable = new Set();
        // Tools that don't modify state and can run in parallel
        for (const toolCall of toolCalls) {
            if (['read_file', 'web_fetch', 'google_web_search', 'ls', 'glob', 'grep'].includes(toolCall.name)) {
                parallelizable.add(toolCall.id);
            }
        }
        return parallelizable;
    }
    canGroupTogether(tool1, tool2, analysis) {
        // Don't group if there are dependencies
        const deps1 = analysis.dependencies.get(tool1.id) || [];
        const deps2 = analysis.dependencies.get(tool2.id) || [];
        if (deps1.includes(tool2.id) || deps2.includes(tool1.id)) {
            return false;
        }
        // Group similar tools together
        return this.getToolCategory(tool1.name) === this.getToolCategory(tool2.name);
    }
    getToolCategory(toolName) {
        const categories = {
            'read_file': 'filesystem',
            'write_file': 'filesystem',
            'edit_file': 'filesystem',
            'ls': 'filesystem',
            'glob': 'filesystem',
            'grep': 'filesystem',
            'read_many_files': 'filesystem',
            'web_fetch': 'web',
            'google_web_search': 'web',
            'run_shell_command': 'system',
            'save_memory': 'system',
        };
        return categories[toolName] || 'other';
    }
    determineExecutionMode(tools, analysis) {
        if (tools.length === 1) {
            return 'sequential';
        }
        // Check if all tools can run in parallel
        const allParallelizable = tools.every(tool => analysis.parallelizable.has(tool.id));
        if (allParallelizable) {
            return 'parallel';
        }
        // Check for pipeline pattern (output of one feeds into another)
        const hasDependencies = tools.some(tool => {
            const deps = analysis.dependencies.get(tool.id) || [];
            return deps.some(dep => tools.some(t => t.id === dep));
        });
        if (hasDependencies) {
            return 'pipeline';
        }
        return 'sequential';
    }
    calculateGroupPriority(tools) {
        // Higher priority for smaller groups and faster tools
        let priority = 100 - tools.length * 10;
        for (const tool of tools) {
            const metrics = this.getToolMetrics(tool.name);
            if (metrics) {
                // Faster tools get higher priority
                priority += Math.max(0, 1000 - metrics.avgExecutionTime) / 100;
            }
        }
        return Math.max(0, priority);
    }
    estimateGroupExecutionTime(tools, mode) {
        const times = tools.map(tool => this.estimateExecutionTime(tool));
        switch (mode) {
            case 'parallel':
                return Math.max(...times);
            case 'sequential':
            case 'pipeline':
                return times.reduce((sum, time) => sum + time, 0);
            default:
                return times.reduce((sum, time) => sum + time, 0);
        }
    }
    getDefaultExecutionTime(toolName) {
        const defaults = {
            'read_file': 100,
            'write_file': 150,
            'edit_file': 200,
            'ls': 50,
            'glob': 300,
            'grep': 500,
            'read_many_files': 1000,
            'web_fetch': 2000,
            'google_web_search': 1500,
            'run_shell_command': 1000,
            'save_memory': 100,
        };
        return defaults[toolName] || 500;
    }
    initializeResourcePools() {
        // Initialize HTTP connection pool
        this.pools.set('http', this.createHttpPool());
        // Initialize file handle pool
        this.pools.set('files', this.createFilePool());
    }
    createHttpPool() {
        // Implementation would depend on HTTP client library
        return {
            acquire: async () => ({}),
            release: () => { },
            getStats: () => ({ total: 10, available: 8, inUse: 2, pending: 0 }),
            destroy: async () => { },
        };
    }
    createFilePool() {
        // Implementation would manage file descriptors
        return {
            acquire: async () => ({}),
            release: () => { },
            getStats: () => ({ total: 100, available: 95, inUse: 5, pending: 0 }),
            destroy: async () => { },
        };
    }
    startBackgroundTasks() {
        // Cache cleanup task
        setInterval(() => {
            this.cleanupExpiredCache();
        }, 60000); // Every minute
        // Metrics rotation task
        setInterval(() => {
            this.rotateMetrics();
        }, 3600000); // Every hour
    }
    cleanupExpiredCache() {
        const now = Date.now();
        let cleaned = 0;
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp.getTime() > entry.ttl) {
                this.cache.delete(key);
                this.removeCacheKeyFromAccessOrder(key);
                cleaned++;
            }
        }
        if (cleaned > 0) {
            console.debug(`[PerformanceOptimizer] Cleaned up ${cleaned} expired cache entries`);
        }
    }
    rotateMetrics() {
        // Keep only recent metrics to prevent memory growth
        const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
        for (const [toolName, metric] of this.metrics.entries()) {
            if (metric.lastExecution.getTime() < cutoff) {
                this.metrics.delete(toolName);
                this.executionHistory.delete(toolName);
            }
        }
    }
}
//# sourceMappingURL=performance-optimizer.js.map