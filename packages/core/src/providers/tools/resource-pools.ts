/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ResourcePool } from './performance-optimizer.js';

/**
 * Configuration for resource pools
 */
export interface ResourcePoolConfig {
  /** Minimum number of resources to maintain */
  minSize: number;
  
  /** Maximum number of resources in the pool */
  maxSize: number;
  
  /** Timeout for acquiring a resource in milliseconds */
  acquireTimeout: number;
  
  /** How long to keep idle resources before cleanup */
  idleTimeout: number;
  
  /** Resource validation function */
  validate?: (resource: unknown) => Promise<boolean>;
  
  /** Resource creation function */
  create: () => Promise<any>;
  
  /** Resource cleanup function */
  destroy: (resource: unknown) => Promise<void>;
  
  /** Resource reset function (called when returning to pool) */
  reset?: (resource: unknown) => Promise<void>;
}

/**
 * Resource pool statistics
 */
export interface PoolStats {
  /** Total resources in pool */
  total: number;
  
  /** Available resources */
  available: number;
  
  /** Resources currently in use */
  inUse: number;
  
  /** Number of pending acquisition requests */
  pending: number;
  
  /** Total resources created */
  created: number;
  
  /** Total resources destroyed */
  destroyed: number;
  
  /** Average acquisition time in milliseconds */
  avgAcquisitionTime: number;
  
  /** Pool hit rate (successful immediate acquisitions) */
  hitRate: number;
}

/**
 * Resource wrapper with metadata
 */
interface PooledResource<T> {
  /** The actual resource */
  resource: T;
  
  /** When this resource was created */
  createdAt: Date;
  
  /** When this resource was last used */
  lastUsedAt: Date;
  
  /** Number of times this resource has been used */
  useCount: number;
  
  /** Whether this resource is currently in use */
  inUse: boolean;
  
  /** Unique identifier for this resource */
  id: string;
}

/**
 * Acquisition request in the queue
 */
interface AcquisitionRequest<T> {
  /** Promise resolver for the request */
  resolve: (resource: T) => void;
  
  /** Promise rejecter for the request */
  reject: (error: Error) => void;
  
  /** When this request was made */
  timestamp: Date;
  
  /** Request timeout handle */
  timeout: NodeJS.Timeout;
}

/**
 * Generic resource pool implementation with advanced features like
 * resource validation, automatic cleanup, queue management, and
 * comprehensive monitoring.
 */
export class GenericResourcePool<T> implements ResourcePool<T> {
  private resources: Map<string, PooledResource<T>> = new Map();
  private availableQueue: string[] = [];
  private pendingQueue: Array<AcquisitionRequest<T>> = [];
  private config: ResourcePoolConfig;
  
  // Statistics
  private stats: PoolStats = {
    total: 0,
    available: 0,
    inUse: 0,
    pending: 0,
    created: 0,
    destroyed: 0,
    avgAcquisitionTime: 0,
    hitRate: 1.0,
  };
  
  private acquisitionTimes: number[] = [];
  private cleanupInterval: NodeJS.Timeout | null = null;
  private destroyed = false;
  
  constructor(config: ResourcePoolConfig) {
    this.config = config;
    this.startCleanupTask();
    
    // Pre-populate pool to minimum size
    this.ensureMinimumResources();
  }
  
  /**
   * Acquire a resource from the pool
   */
  async acquire(timeoutMs?: number): Promise<T> {
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
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        // Remove from queue and reject
        const index = this.pendingQueue.findIndex(req => req.resolve === resolve);
        if (index >= 0) {
          this.pendingQueue.splice(index, 1);
          this.updateStats();
        }
        reject(new Error(`Resource acquisition timed out after ${actualTimeout}ms`));
      }, actualTimeout);
      
      const request: AcquisitionRequest<T> = {
        resolve: (resource: T) => {
          clearTimeout(timeout);
          this.recordAcquisitionTime(performance.now() - startTime);
          resolve(resource);
        },
        reject: (error: Error) => {
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
  release(resource: T): void {
    if (this.destroyed) {
      // Just destroy the resource if pool is destroyed
      this.config.destroy(resource).catch(console.error);
      return;
    }
    
    // Find the resource in our pool
    let resourceId: string | null = null;
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
    
    const pooledResource = this.resources.get(resourceId)!;
    
    // Reset resource if configured
    const releaseResource = async () => {
      try {
        if (this.config.reset) {
          await this.config.reset(resource);
        }
        
        // Validate resource if configured
        if (this.config.validate && !(await this.config.validate(resource))) {
          await this.destroyResource(resourceId!);
          return;
        }
        
        // Mark as available
        pooledResource.inUse = false;
        pooledResource.lastUsedAt = new Date();
        this.availableQueue.push(resourceId!);
        
        // Process pending requests
        this.processPendingRequests();
        this.updateStats();
        
      } catch (error) {
        console.error('[ResourcePool] Error releasing resource:', error);
        await this.destroyResource(resourceId!);
      }
    };
    
    releaseResource();
  }
  
  /**
   * Get current pool statistics
   */
  getStats(): PoolStats {
    return { ...this.stats };
  }
  
  /**
   * Destroy the pool and clean up all resources
   */
  async destroy(): Promise<void> {
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
      } catch (error) {
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
  async resize(newMinSize: number, newMaxSize: number): Promise<void> {
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
  async validateAll(): Promise<number> {
    if (!this.config.validate) {
      return 0;
    }
    
    let invalidCount = 0;
    const validationPromises: Array<Promise<void>> = [];
    
    for (const [id, pooledResource] of this.resources.entries()) {
      if (!pooledResource.inUse) {
        validationPromises.push(
          this.config.validate(pooledResource.resource).then(valid => {
            if (!valid) {
              invalidCount++;
              return this.destroyResource(id);
            }
            return Promise.resolve();
          }).catch(error => {
            console.error('[ResourcePool] Validation error:', error);
            invalidCount++;
            return this.destroyResource(id);
          })
        );
      }
    }
    
    await Promise.allSettled(validationPromises);
    await this.ensureMinimumResources();
    
    return invalidCount;
  }
  
  // Private methods
  
  private async tryGetImmediate(): Promise<T | null> {
    if (this.availableQueue.length === 0) {
      return null;
    }
    
    const resourceId = this.availableQueue.shift()!;
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
      } catch (error) {
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
  
  private async tryCreateResource(): Promise<boolean> {
    if (this.resources.size >= this.config.maxSize) {
      return false;
    }
    
    try {
      const resource = await this.config.create();
      const id = this.generateResourceId();
      
      const pooledResource: PooledResource<T> = {
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
      
    } catch (error) {
      console.error('[ResourcePool] Failed to create resource:', error);
      return false;
    }
  }
  
  private async destroyResource(resourceId: string): Promise<void> {
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
    } catch (error) {
      console.error('[ResourcePool] Error destroying resource:', error);
    }
    
    this.updateStats();
  }
  
  private processPendingRequests(): void {
    while (this.pendingQueue.length > 0 && this.availableQueue.length > 0) {
      const request = this.pendingQueue.shift()!;
      
      this.tryGetImmediate().then(resource => {
        if (resource) {
          request.resolve(resource);
        } else {
          request.reject(new Error('Failed to acquire resource'));
        }
      }).catch(error => {
        request.reject(error);
      });
    }
  }
  
  private async ensureMinimumResources(): Promise<void> {
    while (this.resources.size < this.config.minSize && !this.destroyed) {
      const created = await this.tryCreateResource();
      if (!created) {
        break; // Failed to create, stop trying
      }
    }
  }
  
  private async shrinkPool(): Promise<void> {
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
  
  private startCleanupTask(): void {
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupIdleResources();
    }, 30000); // Clean up every 30 seconds
  }
  
  private async cleanupIdleResources(): Promise<void> {
    if (this.destroyed) {
      return;
    }
    
    const now = Date.now();
    const idleThreshold = now - this.config.idleTimeout;
    const toRemove: string[] = [];
    
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
  
  private updateStats(): void {
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
  
  private recordAcquisitionTime(time: number): void {
    this.acquisitionTimes.push(time);
    
    // Keep only recent acquisition times (last 100)
    if (this.acquisitionTimes.length > 100) {
      this.acquisitionTimes.shift();
    }
  }
  
  private generateResourceId(): string {
    return `resource_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * HTTP connection pool for web requests
 */
export class HttpConnectionPool extends GenericResourcePool<any> {
  constructor(config?: Partial<ResourcePoolConfig>) {
    const defaultConfig: ResourcePoolConfig = {
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
        })
      ,
      destroy: async (connection: unknown) => {
        // Clean up connection
        console.debug('[HttpConnectionPool] Destroying connection:', (connection as any).id);
      },
      validate: async (connection: unknown): Promise<boolean> => {
        // Validate connection is still usable
        const conn = connection as any;
        return conn && Date.now() - conn.created.getTime() < 300000; // 5 minutes
      },
      reset: async (connection: unknown) => {
        // Reset connection state
        (connection as any).requests = 0;
      },
      ...config,
    };
    
    super(defaultConfig);
  }
}

/**
 * File descriptor pool for file operations
 */
export class FileDescriptorPool extends GenericResourcePool<any> {
  constructor(config?: Partial<ResourcePoolConfig>) {
    const defaultConfig: ResourcePoolConfig = {
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
        })
      ,
      destroy: async (fd: unknown) => {
        // Close file descriptor
        console.debug('[FileDescriptorPool] Destroying file descriptor:', (fd as any).id);
      },
      validate: async (fd: unknown): Promise<boolean> => {
        // Check if file descriptor is still valid
        const file = fd as any;
        return file && file.operations < 1000; // Limit operations per fd
      },
      reset: async (fd: unknown) => {
        // Reset operation counter
        (fd as any).operations = 0;
      },
      ...config,
    };
    
    super(defaultConfig);
  }
}

/**
 * Memory pool for large buffer allocations
 */
export class MemoryPool extends GenericResourcePool<Buffer> {
  constructor(bufferSize: number, config?: Partial<ResourcePoolConfig>) {
    const defaultConfig: ResourcePoolConfig = {
      minSize: 1,
      maxSize: 10,
      acquireTimeout: 1000,
      idleTimeout: 120000, // 2 minutes
      create: async () => Buffer.allocUnsafe(bufferSize),
      destroy: async (buffer: unknown) => {
        // Buffer will be garbage collected
        (buffer as Buffer).fill(0); // Clear sensitive data
      },
      reset: async (buffer: unknown) => {
        (buffer as Buffer).fill(0); // Clear buffer for reuse
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
  private static pools: Map<string, ResourcePool<any>> = new Map();
  
  /**
   * Get or create an HTTP connection pool
   */
  static getHttpPool(name: string = 'default', config?: Partial<ResourcePoolConfig>): HttpConnectionPool {
    const key = `http_${name}`;
    if (!this.pools.has(key)) {
      this.pools.set(key, new HttpConnectionPool(config));
    }
    return this.pools.get(key) as HttpConnectionPool;
  }
  
  /**
   * Get or create a file descriptor pool
   */
  static getFilePool(name: string = 'default', config?: Partial<ResourcePoolConfig>): FileDescriptorPool {
    const key = `file_${name}`;
    if (!this.pools.has(key)) {
      this.pools.set(key, new FileDescriptorPool(config));
    }
    return this.pools.get(key) as FileDescriptorPool;
  }
  
  /**
   * Get or create a memory pool
   */
  static getMemoryPool(bufferSize: number, name: string = 'default', config?: Partial<ResourcePoolConfig>): MemoryPool {
    const key = `memory_${bufferSize}_${name}`;
    if (!this.pools.has(key)) {
      this.pools.set(key, new MemoryPool(bufferSize, config));
    }
    return this.pools.get(key) as MemoryPool;
  }
  
  /**
   * Destroy all pools
   */
  static async destroyAll(): Promise<void> {
    const destroyPromises = Array.from(this.pools.values()).map(pool => pool.destroy());
    await Promise.allSettled(destroyPromises);
    this.pools.clear();
  }
  
  /**
   * Get statistics for all pools
   */
  static getAllStats(): Map<string, any> {
    const stats = new Map();
    for (const [name, pool] of this.pools.entries()) {
      stats.set(name, pool.getStats());
    }
    return stats;
  }
}