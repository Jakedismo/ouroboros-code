/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { MemoryTool } from '../../tools/memoryTool.js';
import { Config } from '../../config/config.js';
/**
 * Memory item with metadata for better organization and retrieval.
 */
export interface MemoryItem {
    /** Unique identifier for the memory item */
    id: string;
    /** The actual memory content/fact */
    fact: string;
    /** When the memory was created */
    timestamp: Date;
    /** Source context (project, global, etc.) */
    source: 'project' | 'global' | 'user';
    /** Optional tags for categorization */
    tags?: string[];
    /** Optional context about when/why this was saved */
    context?: string;
}
/**
 * Memory statistics and information.
 */
export interface MemoryStats {
    /** Total number of memory items */
    totalItems: number;
    /** Memory items by source */
    bySource: {
        project: number;
        global: number;
        user: number;
    };
    /** Total size of memory content in characters */
    totalSize: number;
    /** Files contributing to memory */
    fileCount: number;
    /** Last update timestamp */
    lastUpdated: Date;
}
/**
 * Provider-agnostic memory tool handler that manages hierarchical memory
 * loading and persistence across all LLM providers.
 *
 * This handler ensures that memory operations work identically whether using
 * OpenAI, Anthropic, or Gemini providers, maintaining the same hierarchical
 * structure and persistence model.
 *
 * Features:
 * - Hierarchical memory loading from project and global contexts
 * - Provider-agnostic memory save/retrieve operations
 * - Memory organization and statistics
 * - Context file configuration and management
 * - Automatic memory refresh and caching
 */
export declare class MemoryToolHandler {
    private config;
    private memoryTool;
    private memoryCache;
    private memoryItems;
    private lastMemoryLoad;
    private fileDiscoveryService;
    constructor(config: Config);
    /**
     * Initialize memory with hierarchical loading and context file configuration.
     * This loads all memory from the hierarchical structure and configures
     * the context filename if specified.
     */
    initialize(): Promise<void>;
    /**
     * Save a memory item with provider-agnostic interface.
     * This works identically across all providers.
     *
     * @param fact - The memory fact to save
     * @param options - Additional options for saving
     * @returns Promise that resolves when memory is saved
     */
    saveMemory(fact: string, options?: {
        tags?: string[];
        context?: string;
        source?: 'project' | 'global' | 'user';
    }): Promise<MemoryItem>;
    /**
     * Load memory from hierarchical structure.
     * This follows the same pattern as the original Gemini implementation.
     *
     * @private
     */
    private loadHierarchicalMemory;
    /**
     * Parse memory content to extract individual memory items.
     * This helps with organization and statistics.
     *
     * @private
     */
    private parseMemoryItems;
    /**
     * Get current memory content.
     * This returns the full hierarchical memory content.
     *
     * @returns Current memory content or undefined if not loaded
     */
    getCurrentMemory(): string | undefined;
    /**
     * Get cached memory content without reloading.
     *
     * @returns Cached memory content
     */
    getCachedMemory(): string | undefined;
    /**
     * Refresh memory by reloading from hierarchical structure.
     * Use this to pick up changes made outside the current session.
     */
    refreshMemory(): Promise<void>;
    /**
     * Search memory for items containing specific text.
     *
     * @param query - Search query
     * @returns Array of matching memory items
     */
    searchMemory(query: string): MemoryItem[];
    /**
     * Get memory items by source.
     *
     * @param source - Source to filter by
     * @returns Array of memory items from the specified source
     */
    getMemoryBySource(source: 'project' | 'global' | 'user'): MemoryItem[];
    /**
     * Get memory statistics and information.
     *
     * @returns Memory statistics
     */
    getMemoryStats(): MemoryStats;
    /**
     * Get all memory items organized by timestamp.
     *
     * @param limit - Maximum number of items to return
     * @returns Array of memory items sorted by timestamp (newest first)
     */
    getAllMemoryItems(limit?: number): MemoryItem[];
    /**
     * Check if memory needs refreshing based on age.
     *
     * @param maxAgeMs - Maximum age in milliseconds (default: 5 minutes)
     * @returns True if memory should be refreshed
     */
    needsRefresh(maxAgeMs?: number): boolean;
    /**
     * Get the currently configured context filename.
     *
     * @returns Current context filename
     */
    getContextFilename(): string;
    /**
     * Update the context filename configuration.
     * This affects where new memory items are saved.
     *
     * @param filename - New context filename
     */
    setContextFilename(filename: string): void;
    /**
     * Generate a unique ID for a memory item.
     *
     * @private
     */
    private generateMemoryId;
    /**
     * Clear all cached memory data.
     * Use this when memory files have been modified externally.
     */
    clearCache(): void;
    /**
     * Get memory tool instance for direct access if needed.
     * Generally, prefer using the handler methods instead.
     *
     * @returns The underlying memory tool instance
     */
    getMemoryTool(): MemoryTool;
    /**
     * Export memory data for backup or migration.
     *
     * @returns Serializable memory data
     */
    exportMemoryData(): {
        items: MemoryItem[];
        content: string;
        stats: MemoryStats;
        contextFilename: string;
        exportedAt: Date;
    };
}
