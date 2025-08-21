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
 * Generic resource pool implementation with advanced features like
 * resource validation, automatic cleanup, queue management, and
 * comprehensive monitoring.
 */
export declare class GenericResourcePool<T> implements ResourcePool<T> {
    private resources;
    private availableQueue;
    private pendingQueue;
    private config;
    private stats;
    private acquisitionTimes;
    private cleanupInterval;
    private destroyed;
    constructor(config: ResourcePoolConfig);
    /**
     * Acquire a resource from the pool
     */
    acquire(timeoutMs?: number): Promise<T>;
    /**
     * Release a resource back to the pool
     */
    release(resource: T): void;
    /**
     * Get current pool statistics
     */
    getStats(): PoolStats;
    /**
     * Destroy the pool and clean up all resources
     */
    destroy(): Promise<void>;
    /**
     * Resize the pool to a new size
     */
    resize(newMinSize: number, newMaxSize: number): Promise<void>;
    /**
     * Validate all resources in the pool
     */
    validateAll(): Promise<number>;
    private tryGetImmediate;
    private tryCreateResource;
    private destroyResource;
    private processPendingRequests;
    private ensureMinimumResources;
    private shrinkPool;
    private startCleanupTask;
    private cleanupIdleResources;
    private updateStats;
    private recordAcquisitionTime;
    private generateResourceId;
}
/**
 * HTTP connection pool for web requests
 */
export declare class HttpConnectionPool extends GenericResourcePool<any> {
    constructor(config?: Partial<ResourcePoolConfig>);
}
/**
 * File descriptor pool for file operations
 */
export declare class FileDescriptorPool extends GenericResourcePool<any> {
    constructor(config?: Partial<ResourcePoolConfig>);
}
/**
 * Memory pool for large buffer allocations
 */
export declare class MemoryPool extends GenericResourcePool<Buffer> {
    constructor(bufferSize: number, config?: Partial<ResourcePoolConfig>);
}
/**
 * Factory for creating resource pools
 */
export declare class ResourcePoolFactory {
    private static pools;
    /**
     * Get or create an HTTP connection pool
     */
    static getHttpPool(name?: string, config?: Partial<ResourcePoolConfig>): HttpConnectionPool;
    /**
     * Get or create a file descriptor pool
     */
    static getFilePool(name?: string, config?: Partial<ResourcePoolConfig>): FileDescriptorPool;
    /**
     * Get or create a memory pool
     */
    static getMemoryPool(bufferSize: number, name?: string, config?: Partial<ResourcePoolConfig>): MemoryPool;
    /**
     * Destroy all pools
     */
    static destroyAll(): Promise<void>;
    /**
     * Get statistics for all pools
     */
    static getAllStats(): Map<string, any>;
}
