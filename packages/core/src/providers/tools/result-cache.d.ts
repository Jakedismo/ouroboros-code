/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { EventEmitter } from 'events';
import { UnifiedToolResult, UnifiedToolCall } from './unified-tool-interface.js';
/**
 * Cache configuration for tool results.
 */
export interface CacheConfig {
    /** Maximum size of cache in MB */
    maxSizeMB: number;
    /** Maximum age for cached entries in milliseconds */
    maxAgeMs: number;
    /** Maximum number of cached entries */
    maxEntries: number;
    /** Cache eviction strategy */
    evictionStrategy: 'lru' | 'lfu' | 'ttl' | 'hybrid';
    /** Enable compression for cached results */
    enableCompression: boolean;
    /** Minimum result size to compress (bytes) */
    compressionThreshold: number;
    /** Cache persistence to disk */
    persistToDisk: boolean;
    /** Disk cache directory */
    cacheDirectory?: string;
}
/**
 * Cached tool result entry.
 */
export interface CacheEntry {
    /** Unique cache key */
    key: string;
    /** Tool call that generated this result */
    toolCall: UnifiedToolCall;
    /** Cached tool result */
    result: UnifiedToolResult;
    /** Entry creation timestamp */
    createdAt: Date;
    /** Last access timestamp */
    lastAccessedAt: Date;
    /** Number of times accessed */
    accessCount: number;
    /** Size of entry in bytes */
    size: number;
    /** Whether the result is compressed */
    compressed: boolean;
    /** TTL for this specific entry (optional override) */
    ttl?: number;
    /** Provider that generated this result */
    providerId: string;
    /** Hash of the tool arguments for cache validation */
    argsHash: string;
}
/**
 * Cache statistics for monitoring.
 */
export interface CacheStats {
    totalEntries: number;
    totalSize: number;
    hitCount: number;
    missCount: number;
    evictionCount: number;
    hitRatio: number;
    averageAccessTime: number;
    compressionRatio: number;
    oldestEntry?: Date;
    newestEntry?: Date;
}
/**
 * Default cache configuration.
 */
export declare const DEFAULT_CACHE_CONFIG: CacheConfig;
/**
 * High-performance tool result cache with intelligent eviction and compression.
 */
export declare class ToolResultCache extends EventEmitter {
    private cache;
    private accessOrder;
    private accessFrequency;
    private config;
    private stats;
    private cleanupTimer;
    constructor(config?: Partial<CacheConfig>);
    /**
     * Get a cached result if available and valid.
     * @param toolCall Tool call to look up.
     * @param providerId Provider ID for cache isolation.
     * @returns Cached result or null if not found/expired.
     */
    get(toolCall: UnifiedToolCall, providerId: string): UnifiedToolResult | null;
    /**
     * Cache a tool result.
     * @param toolCall Tool call that generated the result.
     * @param result Result to cache.
     * @param providerId Provider ID for cache isolation.
     * @param customTTL Optional custom TTL for this entry.
     */
    set(toolCall: UnifiedToolCall, result: UnifiedToolResult, providerId: string, customTTL?: number): void;
    /**
     * Invalidate cached results for a specific tool.
     * @param toolName Tool name to invalidate.
     * @param providerId Optional provider ID filter.
     */
    invalidate(toolName: string, providerId?: string): number;
    /**
     * Clear all cached results.
     * @param providerId Optional provider ID to clear only that provider's cache.
     */
    clear(providerId?: string): void;
    /**
     * Get cache statistics.
     * @returns Current cache statistics.
     */
    getStats(): CacheStats;
    /**
     * Force cache cleanup and optimization.
     * @param aggressive Whether to perform aggressive cleanup.
     */
    cleanup(aggressive?: boolean): Promise<void>;
    /**
     * Shutdown the cache and cleanup resources.
     */
    shutdown(): Promise<void>;
    /**
     * Create cache key for a tool call.
     * @param toolCall Tool call to create key for.
     * @param providerId Provider ID for isolation.
     * @returns Cache key string.
     */
    private createCacheKey;
    /**
     * Hash tool arguments for cache key generation.
     * @param args Tool arguments.
     * @returns Hash string.
     */
    private hashToolArguments;
    /**
     * Sort object properties deeply for consistent hashing.
     * @param obj Object to sort.
     * @returns Sorted object.
     */
    private sortObjectDeep;
    /**
     * Calculate result size in bytes.
     * @param result Tool result.
     * @returns Size in bytes.
     */
    private calculateResultSize;
    /**
     * Check if cache entry is expired.
     * @param entry Cache entry to check.
     * @returns True if expired.
     */
    private isExpired;
    /**
     * Update access tracking for cache entry.
     * @param entry Cache entry to update.
     */
    private updateAccessTracking;
    /**
     * Compress result if beneficial.
     * @param result Tool result to potentially compress.
     * @param size Result size in bytes.
     * @returns Compressed result and compression flag.
     */
    private compressResult;
    /**
     * Decompress result if needed.
     * @param entry Cache entry containing potentially compressed result.
     * @returns Decompressed result.
     */
    private decompressResult;
    /**
     * Ensure there's enough space in cache for new entry.
     * @param requiredSize Size required in bytes.
     */
    private ensureCacheSpace;
    /**
     * Get current total cache size.
     * @returns Cache size in bytes.
     */
    private getCurrentCacheSize;
    /**
     * Perform cache eviction based on strategy.
     * @param aggressive Whether to perform aggressive eviction.
     * @param targetSpace Target space to free in bytes.
     */
    private performEviction;
    /**
     * Select candidates for eviction based on strategy.
     * @param targetBytes Target bytes to free.
     * @returns Array of cache keys to evict.
     */
    private selectEvictionCandidates;
    /**
     * Select LRU eviction candidates.
     * @param targetBytes Target bytes to free.
     * @returns Array of keys to evict.
     */
    private selectLRUCandidates;
    /**
     * Select LFU eviction candidates.
     * @param targetBytes Target bytes to free.
     * @returns Array of keys to evict.
     */
    private selectLFUCandidates;
    /**
     * Select TTL eviction candidates.
     * @param targetBytes Target bytes to free.
     * @returns Array of keys to evict.
     */
    private selectTTLCandidates;
    /**
     * Select hybrid eviction candidates (combination of strategies).
     * @param targetBytes Target bytes to free.
     * @returns Array of keys to evict.
     */
    private selectHybridCandidates;
    /**
     * Calculate eviction score for hybrid strategy.
     * @param key Cache key.
     * @param entry Cache entry.
     * @param now Current timestamp.
     * @returns Eviction score (higher = more likely to evict).
     */
    private calculateEvictionScore;
    /**
     * Evict a cache entry.
     * @param key Cache key to evict.
     */
    private evict;
    /**
     * Remove all expired entries.
     */
    private removeExpiredEntries;
    /**
     * Optimize cache data structures.
     */
    private optimizeCacheStructure;
    /**
     * Initialize cache statistics.
     * @returns Initial statistics.
     */
    private initializeStats;
    /**
     * Update cache statistics.
     */
    private updateStats;
    /**
     * Start cleanup timer for periodic maintenance.
     */
    private startCleanupTimer;
}
/**
 * Create a result cache with provider-specific configuration.
 * @param providerId Provider ID for optimization.
 * @param customConfig Custom configuration overrides.
 * @returns Configured result cache.
 */
export declare function createResultCache(providerId?: string, customConfig?: Partial<CacheConfig>): ToolResultCache;
