/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Generic resource pool implementation with advanced features like
 * resource validation, automatic cleanup, queue management, and
 * comprehensive monitoring.
 */
export class GenericResourcePool {
    resources = new Map();
    availableQueue = [];
    pendingQueue = [];
    config;
    // Statistics
    stats = {
        total: 0,
        available: 0,
        inUse: 0,
        pending: 0,
        created: 0,
        destroyed: 0,
        avgAcquisitionTime: 0,
        hitRate: 1.0,
    };
    acquisitionTimes = [];
    cleanupInterval = null;
    destroyed = false;
    constructor(config) {
        this.config = config;
        this.startCleanupTask();
        // Pre-populate pool to minimum size
        this.ensureMinimumResources();
    }
    /**
     * Acquire a resource from the pool
     */
    async acquire(timeoutMs) {
        if (this.destroyed) {
            throw new Error('Resource pool has been destroyed');
        }
        const startTime = performance.now();
        const actualTimeout = timeoutMs || this.config.acquireTimeout;
        // Try to get an available resource immediately
        const immediateResource = await this.tryGetImmediate();
        if (immediateResource) {
            this.recordAcquisitionTime(performance.now() - startTime);
            return immediateResource;
        }
        // No immediate resource available, queue the request
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                // Remove from queue and reject
                const index = this.pendingQueue.findIndex(req => req.resolve === resolve);
                if (index >= 0) {
                    this.pendingQueue.splice(index, 1);
                    this.updateStats();
                }
                reject(new Error(`Resource acquisition timed out after ${actualTimeout}ms`));
            }, actualTimeout);
            const request = {
                resolve: (resource) => {
                    clearTimeout(timeout);
                    this.recordAcquisitionTime(performance.now() - startTime);
                    resolve(resource);
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    reject(error);
                },
                timestamp: new Date(),
                timeout,
            };
            this.pendingQueue.push(request);
            this.updateStats();
            // Try to create a new resource if under limit
            this.tryCreateResource();
        });
    }
    /**
     * Release a resource back to the pool
     */
    release(resource) {
        if (this.destroyed) {
            // Just destroy the resource if pool is destroyed
            this.config.destroy(resource).catch(console.error);
            return;
        }
        // Find the resource in our pool
        let resourceId = null;
        for (const [id, pooledResource] of this.resources.entries()) {
            if (pooledResource.resource === resource) {
                resourceId = id;
                break;
            }
        }
        if (!resourceId) {
            console.warn('[ResourcePool] Attempted to release unknown resource');
            return;
        }
        const pooledResource = this.resources.get(resourceId);
        // Reset resource if configured
        const releaseResource = async () => {
            try {
                if (this.config.reset) {
                    await this.config.reset(resource);
                }
                // Validate resource if configured
                if (this.config.validate && !(await this.config.validate(resource))) {
                    await this.destroyResource(resourceId);
                    return;
                }
                // Mark as available
                pooledResource.inUse = false;
                pooledResource.lastUsedAt = new Date();
                this.availableQueue.push(resourceId);
                // Process pending requests
                this.processPendingRequests();
                this.updateStats();
            }
            catch (error) {
                console.error('[ResourcePool] Error releasing resource:', error);
                await this.destroyResource(resourceId);
            }
        };
        releaseResource();
    }
    /**
     * Get current pool statistics
     */
    getStats() {
        return { ...this.stats };
    }
    /**
     * Destroy the pool and clean up all resources
     */
    async destroy() {
        if (this.destroyed) {
            return;
        }
        this.destroyed = true;
        // Stop cleanup task
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        // Reject all pending requests
        const error = new Error('Resource pool is being destroyed');
        for (const request of this.pendingQueue) {
            clearTimeout(request.timeout);
            request.reject(error);
        }
        this.pendingQueue.length = 0;
        // Destroy all resources
        const destroyPromises = Array.from(this.resources.values()).map(async (pooledResource) => {
            try {
                await this.config.destroy(pooledResource.resource);
            }
            catch (error) {
                console.error('[ResourcePool] Error destroying resource:', error);
            }
        });
        await Promise.allSettled(destroyPromises);
        this.resources.clear();
        this.availableQueue.length = 0;
        this.updateStats();
        console.debug('[ResourcePool] Pool destroyed');
    }
    /**
     * Resize the pool to a new size
     */
    async resize(newMinSize, newMaxSize) {
        this.config.minSize = Math.max(0, newMinSize);
        this.config.maxSize = Math.max(this.config.minSize, newMaxSize);
        // If we have too many resources, destroy excess ones
        if (this.resources.size > this.config.maxSize) {
            await this.shrinkPool();
        }
        // If we have too few resources, create more
        await this.ensureMinimumResources();
    }
    /**
     * Validate all resources in the pool
     */
    async validateAll() {
        if (!this.config.validate) {
            return 0;
        }
        let invalidCount = 0;
        const validationPromises = [];
        for (const [id, pooledResource] of this.resources.entries()) {
            if (!pooledResource.inUse) {
                validationPromises.push(this.config.validate(pooledResource.resource).then(valid => {
                    if (!valid) {
                        invalidCount++;
                        return this.destroyResource(id);
                    }
                }).catch(error => {
                    console.error('[ResourcePool] Validation error:', error);
                    invalidCount++;
                    return this.destroyResource(id);
                }));
            }
        }
        await Promise.allSettled(validationPromises);
        await this.ensureMinimumResources();
        return invalidCount;
    }
    // Private methods
    async tryGetImmediate() {
        if (this.availableQueue.length === 0) {
            return null;
        }
        const resourceId = this.availableQueue.shift();
        const pooledResource = this.resources.get(resourceId);
        if (!pooledResource) {
            // Resource was somehow removed, try next one
            return this.tryGetImmediate();
        }
        // Validate resource if configured
        if (this.config.validate) {
            try {
                const isValid = await this.config.validate(pooledResource.resource);
                if (!isValid) {
                    await this.destroyResource(resourceId);
                    return this.tryGetImmediate();
                }
            }
            catch (error) {
                console.error('[ResourcePool] Resource validation failed:', error);
                await this.destroyResource(resourceId);
                return this.tryGetImmediate();
            }
        }
        // Mark as in use
        pooledResource.inUse = true;
        pooledResource.lastUsedAt = new Date();
        pooledResource.useCount++;
        this.updateStats();
        return pooledResource.resource;
    }
    async tryCreateResource() {
        if (this.resources.size >= this.config.maxSize) {
            return false;
        }
        try {
            const resource = await this.config.create();
            const id = this.generateResourceId();
            const pooledResource = {
                resource,
                createdAt: new Date(),
                lastUsedAt: new Date(),
                useCount: 0,
                inUse: false,
                id,
            };
            this.resources.set(id, pooledResource);
            this.availableQueue.push(id);
            this.stats.created++;
            this.updateStats();
            // Process any pending requests
            this.processPendingRequests();
            return true;
        }
        catch (error) {
            console.error('[ResourcePool] Failed to create resource:', error);
            return false;
        }
    }
    async destroyResource(resourceId) {
        const pooledResource = this.resources.get(resourceId);
        if (!pooledResource) {
            return;
        }
        // Remove from available queue
        const queueIndex = this.availableQueue.indexOf(resourceId);
        if (queueIndex >= 0) {
            this.availableQueue.splice(queueIndex, 1);
        }
        // Remove from resources
        this.resources.delete(resourceId);
        // Destroy the resource
        try {
            await this.config.destroy(pooledResource.resource);
            this.stats.destroyed++;
        }
        catch (error) {
            console.error('[ResourcePool] Error destroying resource:', error);
        }
        this.updateStats();
    }
    processPendingRequests() {
        while (this.pendingQueue.length > 0 && this.availableQueue.length > 0) {
            const request = this.pendingQueue.shift();
            this.tryGetImmediate().then(resource => {
                if (resource) {
                    request.resolve(resource);
                }
                else {
                    request.reject(new Error('Failed to acquire resource'));
                }
            }).catch(error => {
                request.reject(error);
            });
        }
    }
    async ensureMinimumResources() {
        while (this.resources.size < this.config.minSize && !this.destroyed) {
            const created = await this.tryCreateResource();
            if (!created) {
                break; // Failed to create, stop trying
            }
        }
    }
    async shrinkPool() {
        const targetSize = this.config.maxSize;
        const toRemove = Math.max(0, this.resources.size - targetSize);
        // Remove idle resources first
        const idleResources = Array.from(this.resources.entries())
            .filter(([_, resource]) => !resource.inUse)
            .sort((a, b) => a[1].lastUsedAt.getTime() - b[1].lastUsedAt.getTime())
            .slice(0, toRemove);
        for (const [id] of idleResources) {
            await this.destroyResource(id);
        }
    }
    startCleanupTask() {
        this.cleanupInterval = setInterval(async () => {
            await this.cleanupIdleResources();
        }, 30000); // Clean up every 30 seconds
    }
    async cleanupIdleResources() {
        if (this.destroyed) {
            return;
        }
        const now = Date.now();
        const idleThreshold = now - this.config.idleTimeout;
        const toRemove = [];
        // Find resources that have been idle too long
        for (const [id, resource] of this.resources.entries()) {
            if (!resource.inUse &&
                resource.lastUsedAt.getTime() < idleThreshold &&
                this.resources.size > this.config.minSize) {
                toRemove.push(id);
            }
        }
        // Remove idle resources
        for (const id of toRemove) {
            await this.destroyResource(id);
        }
        // Ensure minimum resources
        await this.ensureMinimumResources();
    }
    updateStats() {
        this.stats.total = this.resources.size;
        this.stats.available = this.availableQueue.length;
        this.stats.inUse = this.stats.total - this.stats.available;
        this.stats.pending = this.pendingQueue.length;
        // Calculate hit rate
        const totalAcquisitions = this.stats.created + this.availableQueue.length;
        if (totalAcquisitions > 0) {
            this.stats.hitRate = this.availableQueue.length / totalAcquisitions;
        }
        // Calculate average acquisition time
        if (this.acquisitionTimes.length > 0) {
            this.stats.avgAcquisitionTime =
                this.acquisitionTimes.reduce((a, b) => a + b, 0) / this.acquisitionTimes.length;
        }
    }
    recordAcquisitionTime(time) {
        this.acquisitionTimes.push(time);
        // Keep only recent acquisition times (last 100)
        if (this.acquisitionTimes.length > 100) {
            this.acquisitionTimes.shift();
        }
    }
    generateResourceId() {
        return `resource_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
/**
 * HTTP connection pool for web requests
 */
export class HttpConnectionPool extends GenericResourcePool {
    constructor(config) {
        const defaultConfig = {
            minSize: 2,
            maxSize: 20,
            acquireTimeout: 5000,
            idleTimeout: 60000,
            create: async () => 
            // In a real implementation, this would create an HTTP agent or connection
            ({
                id: Math.random().toString(36),
                created: new Date(),
                requests: 0,
            }),
            destroy: async (connection) => {
                // Clean up connection
                console.debug('[HttpConnectionPool] Destroying connection:', connection.id);
            },
            validate: async (connection) => 
            // Validate connection is still usable
            connection && Date.now() - connection.created.getTime() < 300000 // 5 minutes
            ,
            reset: async (connection) => {
                // Reset connection state
                connection.requests = 0;
            },
            ...config,
        };
        super(defaultConfig);
    }
}
/**
 * File descriptor pool for file operations
 */
export class FileDescriptorPool extends GenericResourcePool {
    constructor(config) {
        const defaultConfig = {
            minSize: 5,
            maxSize: 100,
            acquireTimeout: 3000,
            idleTimeout: 30000,
            create: async () => 
            // In a real implementation, this would manage file descriptors
            ({
                id: Math.random().toString(36),
                created: new Date(),
                operations: 0,
            }),
            destroy: async (fd) => {
                // Close file descriptor
                console.debug('[FileDescriptorPool] Destroying file descriptor:', fd.id);
            },
            validate: async (fd) => 
            // Check if file descriptor is still valid
            fd && fd.operations < 1000 // Limit operations per fd
            ,
            reset: async (fd) => {
                // Reset operation counter
                fd.operations = 0;
            },
            ...config,
        };
        super(defaultConfig);
    }
}
/**
 * Memory pool for large buffer allocations
 */
export class MemoryPool extends GenericResourcePool {
    constructor(bufferSize, config) {
        const defaultConfig = {
            minSize: 1,
            maxSize: 10,
            acquireTimeout: 1000,
            idleTimeout: 120000, // 2 minutes
            create: async () => Buffer.allocUnsafe(bufferSize),
            destroy: async (buffer) => {
                // Buffer will be garbage collected
                buffer.fill(0); // Clear sensitive data
            },
            reset: async (buffer) => {
                buffer.fill(0); // Clear buffer for reuse
            },
            ...config,
        };
        super(defaultConfig);
    }
}
/**
 * Factory for creating resource pools
 */
export class ResourcePoolFactory {
    static pools = new Map();
    /**
     * Get or create an HTTP connection pool
     */
    static getHttpPool(name = 'default', config) {
        const key = `http_${name}`;
        if (!this.pools.has(key)) {
            this.pools.set(key, new HttpConnectionPool(config));
        }
        return this.pools.get(key);
    }
    /**
     * Get or create a file descriptor pool
     */
    static getFilePool(name = 'default', config) {
        const key = `file_${name}`;
        if (!this.pools.has(key)) {
            this.pools.set(key, new FileDescriptorPool(config));
        }
        return this.pools.get(key);
    }
    /**
     * Get or create a memory pool
     */
    static getMemoryPool(bufferSize, name = 'default', config) {
        const key = `memory_${bufferSize}_${name}`;
        if (!this.pools.has(key)) {
            this.pools.set(key, new MemoryPool(bufferSize, config));
        }
        return this.pools.get(key);
    }
    /**
     * Destroy all pools
     */
    static async destroyAll() {
        const destroyPromises = Array.from(this.pools.values()).map(pool => pool.destroy());
        await Promise.allSettled(destroyPromises);
        this.pools.clear();
    }
    /**
     * Get statistics for all pools
     */
    static getAllStats() {
        const stats = new Map();
        for (const [name, pool] of this.pools.entries()) {
            stats.set(name, pool.getStats());
        }
        return stats;
    }
}
//# sourceMappingURL=resource-pools.js.map