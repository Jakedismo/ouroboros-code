/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { MemoryTool, setGeminiMdFilename, getCurrentGeminiMdFilename } from '../../tools/memoryTool.js';
import { loadServerHierarchicalMemory } from '../../utils/memoryDiscovery.js';
import { FileDiscoveryService } from '../../services/fileDiscoveryService.js';
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
export class MemoryToolHandler {
    config;
    memoryTool;
    memoryCache = new Map();
    memoryItems = new Map();
    lastMemoryLoad = null;
    fileDiscoveryService;
    constructor(config) {
        this.config = config;
        this.memoryTool = new MemoryTool();
        this.fileDiscoveryService = new FileDiscoveryService(config.getProjectRoot());
    }
    /**
     * Initialize memory with hierarchical loading and context file configuration.
     * This loads all memory from the hierarchical structure and configures
     * the context filename if specified.
     */
    async initialize() {
        // Set context filename if configured
        const contextFile = this.config.getContextFileName();
        if (contextFile) {
            setGeminiMdFilename(contextFile);
        }
        // Load hierarchical memory
        await this.loadHierarchicalMemory();
        console.debug('[MemoryToolHandler] Initialized memory tool handler');
    }
    /**
     * Save a memory item with provider-agnostic interface.
     * This works identically across all providers.
     *
     * @param fact - The memory fact to save
     * @param options - Additional options for saving
     * @returns Promise that resolves when memory is saved
     */
    async saveMemory(fact, options = {}) {
        // Create memory item
        const memoryItem = {
            id: this.generateMemoryId(),
            fact: fact.trim(),
            timestamp: new Date(),
            source: options.source || 'project',
            tags: options.tags,
            context: options.context,
        };
        // Execute the memory tool to save to file system
        const invocation = this.memoryTool.build({ fact: memoryItem.fact });
        await invocation.execute(new AbortController().signal);
        // Cache the memory item
        this.memoryItems.set(memoryItem.id, memoryItem);
        // Clear memory cache to force reload on next access
        this.memoryCache.clear();
        // Reload hierarchical memory to include the new item
        await this.loadHierarchicalMemory();
        return memoryItem;
    }
    /**
     * Load memory from hierarchical structure.
     * This follows the same pattern as the original Gemini implementation.
     *
     * @private
     */
    async loadHierarchicalMemory() {
        try {
            const result = await loadServerHierarchicalMemory(this.config.getProjectRoot(), [], // includeDirectoriesToReadGemini - let it use defaults
            this.config.getDebugMode(), this.fileDiscoveryService, [], // extensionContextFilePaths
            'tree', // importFormat
            this.config.getMemoryFileFilteringOptions() || undefined, 200 // maxDirs
            );
            if (result.memoryContent) {
                // Update config with loaded memory
                this.config.setUserMemory(result.memoryContent);
                this.config.setGeminiMdFileCount(result.fileCount);
                // Cache the loaded memory
                this.memoryCache.set('hierarchical', result.memoryContent);
                this.lastMemoryLoad = new Date();
                // Parse memory items from content for organization
                this.parseMemoryItems(result.memoryContent);
                console.debug(`[MemoryToolHandler] Loaded hierarchical memory: ${result.memoryContent.length} characters from ${result.fileCount} files`);
            }
        }
        catch (error) {
            console.error('[MemoryToolHandler] Failed to load hierarchical memory:', error);
        }
    }
    /**
     * Parse memory content to extract individual memory items.
     * This helps with organization and statistics.
     *
     * @private
     */
    parseMemoryItems(memoryContent) {
        // Simple parsing - in production this could be more sophisticated
        const lines = memoryContent.split('\n');
        let currentItem = '';
        let itemIndex = 0;
        for (const line of lines) {
            if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
                // Save previous item if exists
                if (currentItem.trim()) {
                    const memoryItem = {
                        id: `parsed_${itemIndex++}`,
                        fact: currentItem.trim(),
                        timestamp: new Date(this.lastMemoryLoad || Date.now()),
                        source: 'project', // Default to project source
                    };
                    this.memoryItems.set(memoryItem.id, memoryItem);
                }
                // Start new item
                currentItem = line.trim().substring(2); // Remove '- ' or '* '
            }
            else if (line.trim() && currentItem) {
                // Continue current item
                currentItem += ' ' + line.trim();
            }
        }
        // Save final item
        if (currentItem.trim()) {
            const memoryItem = {
                id: `parsed_${itemIndex}`,
                fact: currentItem.trim(),
                timestamp: new Date(this.lastMemoryLoad || Date.now()),
                source: 'project',
            };
            this.memoryItems.set(memoryItem.id, memoryItem);
        }
    }
    /**
     * Get current memory content.
     * This returns the full hierarchical memory content.
     *
     * @returns Current memory content or undefined if not loaded
     */
    getCurrentMemory() {
        return this.config.getUserMemory();
    }
    /**
     * Get cached memory content without reloading.
     *
     * @returns Cached memory content
     */
    getCachedMemory() {
        return this.memoryCache.get('hierarchical');
    }
    /**
     * Refresh memory by reloading from hierarchical structure.
     * Use this to pick up changes made outside the current session.
     */
    async refreshMemory() {
        this.memoryCache.clear();
        this.memoryItems.clear();
        await this.loadHierarchicalMemory();
    }
    /**
     * Search memory for items containing specific text.
     *
     * @param query - Search query
     * @returns Array of matching memory items
     */
    searchMemory(query) {
        const queryLower = query.toLowerCase();
        const matches = [];
        for (const item of this.memoryItems.values()) {
            if (item.fact.toLowerCase().includes(queryLower) ||
                item.tags?.some(tag => tag.toLowerCase().includes(queryLower)) ||
                item.context?.toLowerCase().includes(queryLower)) {
                matches.push(item);
            }
        }
        return matches.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }
    /**
     * Get memory items by source.
     *
     * @param source - Source to filter by
     * @returns Array of memory items from the specified source
     */
    getMemoryBySource(source) {
        const items = [];
        for (const item of this.memoryItems.values()) {
            if (item.source === source) {
                items.push(item);
            }
        }
        return items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }
    /**
     * Get memory statistics and information.
     *
     * @returns Memory statistics
     */
    getMemoryStats() {
        const items = Array.from(this.memoryItems.values());
        const memoryContent = this.getCurrentMemory() || '';
        const stats = {
            totalItems: items.length,
            bySource: {
                project: items.filter(item => item.source === 'project').length,
                global: items.filter(item => item.source === 'global').length,
                user: items.filter(item => item.source === 'user').length,
            },
            totalSize: memoryContent.length,
            fileCount: this.config.getGeminiMdFileCount(),
            lastUpdated: this.lastMemoryLoad || new Date(),
        };
        return stats;
    }
    /**
     * Get all memory items organized by timestamp.
     *
     * @param limit - Maximum number of items to return
     * @returns Array of memory items sorted by timestamp (newest first)
     */
    getAllMemoryItems(limit) {
        const items = Array.from(this.memoryItems.values())
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        return limit ? items.slice(0, limit) : items;
    }
    /**
     * Check if memory needs refreshing based on age.
     *
     * @param maxAgeMs - Maximum age in milliseconds (default: 5 minutes)
     * @returns True if memory should be refreshed
     */
    needsRefresh(maxAgeMs = 5 * 60 * 1000) {
        if (!this.lastMemoryLoad) {
            return true;
        }
        return (Date.now() - this.lastMemoryLoad.getTime()) > maxAgeMs;
    }
    /**
     * Get the currently configured context filename.
     *
     * @returns Current context filename
     */
    getContextFilename() {
        return getCurrentGeminiMdFilename();
    }
    /**
     * Update the context filename configuration.
     * This affects where new memory items are saved.
     *
     * @param filename - New context filename
     */
    setContextFilename(filename) {
        setGeminiMdFilename(filename);
        this.config.setContextFileName(filename);
    }
    /**
     * Generate a unique ID for a memory item.
     *
     * @private
     */
    generateMemoryId() {
        return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    /**
     * Clear all cached memory data.
     * Use this when memory files have been modified externally.
     */
    clearCache() {
        this.memoryCache.clear();
        this.memoryItems.clear();
        this.lastMemoryLoad = null;
    }
    /**
     * Get memory tool instance for direct access if needed.
     * Generally, prefer using the handler methods instead.
     *
     * @returns The underlying memory tool instance
     */
    getMemoryTool() {
        return this.memoryTool;
    }
    /**
     * Export memory data for backup or migration.
     *
     * @returns Serializable memory data
     */
    exportMemoryData() {
        return {
            items: this.getAllMemoryItems(),
            content: this.getCurrentMemory() || '',
            stats: this.getMemoryStats(),
            contextFilename: this.getContextFilename(),
            exportedAt: new Date(),
        };
    }
}
//# sourceMappingURL=memory-tool-handler.js.map