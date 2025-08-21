/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'crypto';
import { EventEmitter } from 'events';
import {
  UnifiedToolResult,
  UnifiedToolCall,
} from './unified-tool-interface.js';

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
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxSizeMB: 256, // 256MB cache
  maxAgeMs: 600000, // 10 minutes
  maxEntries: 10000, // 10k entries max
  evictionStrategy: 'hybrid', // LRU + TTL hybrid
  enableCompression: true, // Compress large results
  compressionThreshold: 1024, // Compress results > 1KB
  persistToDisk: false, // In-memory only by default
  cacheDirectory: undefined,
};

/**
 * High-performance tool result cache with intelligent eviction and compression.
 */
export class ToolResultCache extends EventEmitter {
  private cache = new Map<string, CacheEntry>();
  private accessOrder = new Set<string>(); // For LRU
  private accessFrequency = new Map<string, number>(); // For LFU
  private config: CacheConfig;
  private stats: CacheStats;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<CacheConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
    this.stats = this.initializeStats();
    this.startCleanupTimer();
  }

  /**
   * Get a cached result if available and valid.
   * @param toolCall Tool call to look up.
   * @param providerId Provider ID for cache isolation.
   * @returns Cached result or null if not found/expired.
   */
  get(toolCall: UnifiedToolCall, providerId: string): UnifiedToolResult | null {
    const key = this.createCacheKey(toolCall, providerId);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.missCount++;
      this.emit('cache_miss', { key, toolName: toolCall.name, providerId });
      return null;
    }

    // Check if entry is expired
    if (this.isExpired(entry)) {
      this.evict(key);
      this.stats.missCount++;
      this.emit('cache_expired', {
        key,
        toolName: toolCall.name,
        providerId,
        age: Date.now() - entry.createdAt.getTime(),
      });
      return null;
    }

    // Validate arguments haven't changed
    const argsHash = this.hashToolArguments(toolCall.arguments);
    if (entry.argsHash !== argsHash) {
      this.evict(key);
      this.stats.missCount++;
      this.emit('cache_invalidated', {
        key,
        toolName: toolCall.name,
        providerId,
        reason: 'arguments_changed',
      });
      return null;
    }

    // Update access tracking
    this.updateAccessTracking(entry);

    this.stats.hitCount++;
    this.emit('cache_hit', {
      key,
      toolName: toolCall.name,
      providerId,
      accessCount: entry.accessCount,
    });

    return this.decompressResult(entry);
  }

  /**
   * Cache a tool result.
   * @param toolCall Tool call that generated the result.
   * @param result Result to cache.
   * @param providerId Provider ID for cache isolation.
   * @param customTTL Optional custom TTL for this entry.
   */
  set(
    toolCall: UnifiedToolCall,
    result: UnifiedToolResult,
    providerId: string,
    customTTL?: number,
  ): void {
    // Don't cache error results by default
    if (result.isError) {
      return;
    }

    const key = this.createCacheKey(toolCall, providerId);
    const size = this.calculateResultSize(result);

    // Skip caching if result is too large
    if (size > this.config.maxSizeMB * 1024 * 1024 * 0.1) {
      // Max 10% of cache size per entry
      this.emit('cache_skip', {
        key,
        toolName: toolCall.name,
        providerId,
        reason: 'too_large',
        size,
      });
      return;
    }

    // Check if we need to make space
    this.ensureCacheSpace(size);

    // Compress result if needed
    const { compressedResult, compressed } = this.compressResult(result, size);

    const entry: CacheEntry = {
      key,
      toolCall: { ...toolCall },
      result: compressedResult,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      accessCount: 0,
      size: compressed ? this.calculateResultSize(compressedResult) : size,
      compressed,
      ttl: customTTL,
      providerId,
      argsHash: this.hashToolArguments(toolCall.arguments),
    };

    this.cache.set(key, entry);
    this.accessOrder.add(key);
    this.accessFrequency.set(key, 0);

    this.updateStats();
    this.emit('cache_set', {
      key,
      toolName: toolCall.name,
      providerId,
      size: entry.size,
      compressed,
    });
  }

  /**
   * Invalidate cached results for a specific tool.
   * @param toolName Tool name to invalidate.
   * @param providerId Optional provider ID filter.
   */
  invalidate(toolName: string, providerId?: string): number {
    let invalidatedCount = 0;
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (
        entry.toolCall.name === toolName &&
        (!providerId || entry.providerId === providerId)
      ) {
        keysToDelete.push(key);
        invalidatedCount++;
      }
    }

    for (const key of keysToDelete) {
      this.evict(key);
    }

    if (invalidatedCount > 0) {
      this.emit('cache_invalidated', {
        toolName,
        providerId,
        count: invalidatedCount,
      });
    }

    return invalidatedCount;
  }

  /**
   * Clear all cached results.
   * @param providerId Optional provider ID to clear only that provider's cache.
   */
  clear(providerId?: string): void {
    if (providerId) {
      // Clear only entries for specific provider
      const keysToDelete = Array.from(this.cache.entries())
        .filter(([_, entry]) => entry.providerId === providerId)
        .map(([key]) => key);

      for (const key of keysToDelete) {
        this.evict(key);
      }

      this.emit('cache_cleared', { providerId, count: keysToDelete.length });
    } else {
      // Clear all entries
      const count = this.cache.size;
      this.cache.clear();
      this.accessOrder.clear();
      this.accessFrequency.clear();
      this.updateStats();

      this.emit('cache_cleared', { count });
    }
  }

  /**
   * Get cache statistics.
   * @returns Current cache statistics.
   */
  getStats(): CacheStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * Force cache cleanup and optimization.
   * @param aggressive Whether to perform aggressive cleanup.
   */
  async cleanup(aggressive: boolean = false): Promise<void> {
    const startTime = Date.now();
    const initialEntries = this.cache.size;

    // Remove expired entries
    this.removeExpiredEntries();

    // Perform eviction if cache is too large
    this.performEviction(aggressive);

    // Optimize cache structure if needed
    if (aggressive) {
      this.optimizeCacheStructure();
    }

    const endTime = Date.now();
    const finalEntries = this.cache.size;
    const removedEntries = initialEntries - finalEntries;

    this.emit('cache_cleanup', {
      aggressive,
      duration: endTime - startTime,
      removedEntries,
      finalEntries,
    });
  }

  /**
   * Shutdown the cache and cleanup resources.
   */
  async shutdown(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Perform final cleanup
    await this.cleanup(true);

    this.emit('cache_shutdown');
  }

  /**
   * Create cache key for a tool call.
   * @param toolCall Tool call to create key for.
   * @param providerId Provider ID for isolation.
   * @returns Cache key string.
   */
  private createCacheKey(
    toolCall: UnifiedToolCall,
    providerId: string,
  ): string {
    const argsHash = this.hashToolArguments(toolCall.arguments);
    return `${providerId}:${toolCall.name}:${argsHash}`;
  }

  /**
   * Hash tool arguments for cache key generation.
   * @param args Tool arguments.
   * @returns Hash string.
   */
  private hashToolArguments(args: Record<string, any>): string {
    const sortedArgs = this.sortObjectDeep(args);
    const argsString = JSON.stringify(sortedArgs);
    return createHash('sha256')
      .update(argsString)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Sort object properties deeply for consistent hashing.
   * @param obj Object to sort.
   * @returns Sorted object.
   */
  private sortObjectDeep(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sortObjectDeep(item));
    }

    const sorted: any = {};
    const keys = Object.keys(obj).sort();

    for (const key of keys) {
      sorted[key] = this.sortObjectDeep(obj[key]);
    }

    return sorted;
  }

  /**
   * Calculate result size in bytes.
   * @param result Tool result.
   * @returns Size in bytes.
   */
  private calculateResultSize(result: UnifiedToolResult): number {
    const jsonString = JSON.stringify(result);
    return new TextEncoder().encode(jsonString).length;
  }

  /**
   * Check if cache entry is expired.
   * @param entry Cache entry to check.
   * @returns True if expired.
   */
  private isExpired(entry: CacheEntry): boolean {
    const now = Date.now();
    const age = now - entry.createdAt.getTime();
    const ttl = entry.ttl || this.config.maxAgeMs;
    return age > ttl;
  }

  /**
   * Update access tracking for cache entry.
   * @param entry Cache entry to update.
   */
  private updateAccessTracking(entry: CacheEntry): void {
    entry.lastAccessedAt = new Date();
    entry.accessCount++;

    // Update LRU order
    this.accessOrder.delete(entry.key);
    this.accessOrder.add(entry.key);

    // Update LFU frequency
    const currentFreq = this.accessFrequency.get(entry.key) || 0;
    this.accessFrequency.set(entry.key, currentFreq + 1);
  }

  /**
   * Compress result if beneficial.
   * @param result Tool result to potentially compress.
   * @param size Result size in bytes.
   * @returns Compressed result and compression flag.
   */
  private compressResult(
    result: UnifiedToolResult,
    size: number,
  ): { compressedResult: UnifiedToolResult; compressed: boolean } {
    if (
      !this.config.enableCompression ||
      size < this.config.compressionThreshold
    ) {
      return { compressedResult: result, compressed: false };
    }

    try {
      // Simple compression simulation (in real implementation, use zlib)
      // For now, we'll just mark it as compressed
      const compressedResult = { ...result, _compressed: true };
      return { compressedResult, compressed: true };
    } catch (error) {
      console.warn('Failed to compress result:', error);
      return { compressedResult: result, compressed: false };
    }
  }

  /**
   * Decompress result if needed.
   * @param entry Cache entry containing potentially compressed result.
   * @returns Decompressed result.
   */
  private decompressResult(entry: CacheEntry): UnifiedToolResult {
    if (!entry.compressed) {
      return entry.result;
    }

    try {
      // Simple decompression simulation
      const { _compressed, ...result } = entry.result as any;
      return result;
    } catch (error) {
      console.warn('Failed to decompress result:', error);
      return entry.result;
    }
  }

  /**
   * Ensure there's enough space in cache for new entry.
   * @param requiredSize Size required in bytes.
   */
  private ensureCacheSpace(requiredSize: number): void {
    const maxSizeBytes = this.config.maxSizeMB * 1024 * 1024;
    const currentSize = this.getCurrentCacheSize();

    // Check if we need to evict entries
    if (
      currentSize + requiredSize > maxSizeBytes ||
      this.cache.size >= this.config.maxEntries
    ) {
      this.performEviction(false, requiredSize);
    }
  }

  /**
   * Get current total cache size.
   * @returns Cache size in bytes.
   */
  private getCurrentCacheSize(): number {
    let totalSize = 0;
    for (const entry of this.cache.values()) {
      totalSize += entry.size;
    }
    return totalSize;
  }

  /**
   * Perform cache eviction based on strategy.
   * @param aggressive Whether to perform aggressive eviction.
   * @param targetSpace Target space to free in bytes.
   */
  private performEviction(
    aggressive: boolean = false,
    targetSpace: number = 0,
  ): void {
    const maxSizeBytes = this.config.maxSizeMB * 1024 * 1024;
    const currentSize = this.getCurrentCacheSize();
    const targetSize = aggressive
      ? maxSizeBytes * 0.7
      : maxSizeBytes - targetSpace;

    if (currentSize <= targetSize && this.cache.size < this.config.maxEntries) {
      return;
    }

    const candidates = this.selectEvictionCandidates(currentSize - targetSize);
    let evictedCount = 0;

    for (const key of candidates) {
      if (
        this.cache.size <= this.config.maxEntries * 0.8 &&
        this.getCurrentCacheSize() <= targetSize
      ) {
        break;
      }

      this.evict(key);
      evictedCount++;
    }

    if (evictedCount > 0) {
      this.emit('cache_eviction', {
        count: evictedCount,
        strategy: this.config.evictionStrategy,
      });
    }
  }

  /**
   * Select candidates for eviction based on strategy.
   * @param targetBytes Target bytes to free.
   * @returns Array of cache keys to evict.
   */
  private selectEvictionCandidates(targetBytes: number): string[] {
    switch (this.config.evictionStrategy) {
      case 'lru':
        return this.selectLRUCandidates(targetBytes);
      case 'lfu':
        return this.selectLFUCandidates(targetBytes);
      case 'ttl':
        return this.selectTTLCandidates(targetBytes);
      case 'hybrid':
      default:
        return this.selectHybridCandidates(targetBytes);
    }
  }

  /**
   * Select LRU eviction candidates.
   * @param targetBytes Target bytes to free.
   * @returns Array of keys to evict.
   */
  private selectLRUCandidates(targetBytes: number): string[] {
    const candidates: string[] = [];
    let freedBytes = 0;

    for (const key of this.accessOrder) {
      const entry = this.cache.get(key);
      if (entry) {
        candidates.push(key);
        freedBytes += entry.size;

        if (freedBytes >= targetBytes) {
          break;
        }
      }
    }

    return candidates;
  }

  /**
   * Select LFU eviction candidates.
   * @param targetBytes Target bytes to free.
   * @returns Array of keys to evict.
   */
  private selectLFUCandidates(targetBytes: number): string[] {
    const entries = Array.from(this.cache.entries());
    entries.sort(([keyA], [keyB]) => {
      const freqA = this.accessFrequency.get(keyA) || 0;
      const freqB = this.accessFrequency.get(keyB) || 0;
      return freqA - freqB; // Ascending order (least frequent first)
    });

    const candidates: string[] = [];
    let freedBytes = 0;

    for (const [key, entry] of entries) {
      candidates.push(key);
      freedBytes += entry.size;

      if (freedBytes >= targetBytes) {
        break;
      }
    }

    return candidates;
  }

  /**
   * Select TTL eviction candidates.
   * @param targetBytes Target bytes to free.
   * @returns Array of keys to evict.
   */
  private selectTTLCandidates(targetBytes: number): string[] {
    const entries = Array.from(this.cache.entries());
    entries.sort(([, entryA], [, entryB]) => {
      return entryA.createdAt.getTime() - entryB.createdAt.getTime(); // Oldest first
    });

    const candidates: string[] = [];
    let freedBytes = 0;

    for (const [key, entry] of entries) {
      candidates.push(key);
      freedBytes += entry.size;

      if (freedBytes >= targetBytes) {
        break;
      }
    }

    return candidates;
  }

  /**
   * Select hybrid eviction candidates (combination of strategies).
   * @param targetBytes Target bytes to free.
   * @returns Array of keys to evict.
   */
  private selectHybridCandidates(targetBytes: number): string[] {
    const now = Date.now();
    const entries = Array.from(this.cache.entries());

    // Score-based hybrid approach
    entries.sort(([keyA, entryA], [keyB, entryB]) => {
      const scoreA = this.calculateEvictionScore(keyA, entryA, now);
      const scoreB = this.calculateEvictionScore(keyB, entryB, now);
      return scoreB - scoreA; // Higher score = more likely to evict
    });

    const candidates: string[] = [];
    let freedBytes = 0;

    for (const [key, entry] of entries) {
      candidates.push(key);
      freedBytes += entry.size;

      if (freedBytes >= targetBytes) {
        break;
      }
    }

    return candidates;
  }

  /**
   * Calculate eviction score for hybrid strategy.
   * @param key Cache key.
   * @param entry Cache entry.
   * @param now Current timestamp.
   * @returns Eviction score (higher = more likely to evict).
   */
  private calculateEvictionScore(
    key: string,
    entry: CacheEntry,
    now: number,
  ): number {
    const age = now - entry.createdAt.getTime();
    const timeSinceAccess = now - entry.lastAccessedAt.getTime();
    const frequency = this.accessFrequency.get(key) || 0;

    // Normalize factors
    const ageScore = age / this.config.maxAgeMs;
    const accessScore = timeSinceAccess / this.config.maxAgeMs;
    const frequencyScore = 1 / (frequency + 1); // Inverse frequency
    const sizeScore = entry.size / (1024 * 1024); // Size in MB

    // Weighted combination
    return (
      ageScore * 0.3 +
      accessScore * 0.3 +
      frequencyScore * 0.3 +
      sizeScore * 0.1
    );
  }

  /**
   * Evict a cache entry.
   * @param key Cache key to evict.
   */
  private evict(key: string): void {
    this.cache.delete(key);
    this.accessOrder.delete(key);
    this.accessFrequency.delete(key);
    this.stats.evictionCount++;
  }

  /**
   * Remove all expired entries.
   */
  private removeExpiredEntries(): void {
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.evict(key);
    }
  }

  /**
   * Optimize cache data structures.
   */
  private optimizeCacheStructure(): void {
    // Rebuild access order set to remove any stale references
    const validKeys = new Set<string>();
    for (const key of this.cache.keys()) {
      validKeys.add(key);
    }
    this.accessOrder = validKeys;

    // Clean up frequency tracking
    const validFrequency = new Map<string, number>();
    for (const [key, freq] of this.accessFrequency.entries()) {
      if (this.cache.has(key)) {
        validFrequency.set(key, freq);
      }
    }
    this.accessFrequency = validFrequency;
  }

  /**
   * Initialize cache statistics.
   * @returns Initial statistics.
   */
  private initializeStats(): CacheStats {
    return {
      totalEntries: 0,
      totalSize: 0,
      hitCount: 0,
      missCount: 0,
      evictionCount: 0,
      hitRatio: 0,
      averageAccessTime: 0,
      compressionRatio: 0,
    };
  }

  /**
   * Update cache statistics.
   */
  private updateStats(): void {
    this.stats.totalEntries = this.cache.size;
    this.stats.totalSize = this.getCurrentCacheSize();

    const totalAccesses = this.stats.hitCount + this.stats.missCount;
    this.stats.hitRatio =
      totalAccesses > 0 ? this.stats.hitCount / totalAccesses : 0;

    // Calculate compression ratio
    let compressedEntries = 0;
    for (const entry of this.cache.values()) {
      if (entry.compressed) {
        compressedEntries++;
      }
    }
    this.stats.compressionRatio =
      this.cache.size > 0 ? compressedEntries / this.cache.size : 0;

    // Find oldest and newest entries
    let oldest: Date | undefined;
    let newest: Date | undefined;

    for (const entry of this.cache.values()) {
      if (!oldest || entry.createdAt < oldest) {
        oldest = entry.createdAt;
      }
      if (!newest || entry.createdAt > newest) {
        newest = entry.createdAt;
      }
    }

    this.stats.oldestEntry = oldest;
    this.stats.newestEntry = newest;
  }

  /**
   * Start cleanup timer for periodic maintenance.
   */
  private startCleanupTimer(): void {
    // Cleanup every 5 minutes
    this.cleanupTimer = setInterval(() => {
      this.cleanup(false);
    }, 300000);
  }
}

/**
 * Create a result cache with provider-specific configuration.
 * @param providerId Provider ID for optimization.
 * @param customConfig Custom configuration overrides.
 * @returns Configured result cache.
 */
export function createResultCache(
  providerId?: string,
  customConfig?: Partial<CacheConfig>,
): ToolResultCache {
  // Provider-specific cache configurations
  const providerConfigs: Record<string, Partial<CacheConfig>> = {
    openai: {
      maxSizeMB: 512, // OpenAI can have large responses
      maxAgeMs: 900000, // 15 minutes for OpenAI
      evictionStrategy: 'lru', // Simple LRU for OpenAI
    },
    anthropic: {
      maxSizeMB: 1024, // Anthropic has very large context
      maxAgeMs: 1800000, // 30 minutes for Claude
      evictionStrategy: 'hybrid', // Intelligent eviction for Claude
      enableCompression: true, // Compress Claude's verbose responses
    },
    gemini: {
      maxSizeMB: 256, // Conservative for Gemini
      maxAgeMs: 600000, // 10 minutes for Gemini
      evictionStrategy: 'lfu', // Frequency-based for Gemini
    },
  };

  const providerConfig = providerId ? providerConfigs[providerId] || {} : {};
  const finalConfig = { ...providerConfig, ...customConfig };

  return new ToolResultCache(finalConfig);
}
