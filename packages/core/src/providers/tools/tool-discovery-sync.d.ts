/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { EventEmitter } from 'events';
import { UnifiedTool } from './unified-tool-interface.js';
import { MCPToolManager } from './mcp-tool-manager.js';
import { DiscoveredMCPTool } from '../../tools/mcp-tool.js';
/**
 * Tool discovery synchronization configuration.
 */
export interface ToolDiscoveryConfig {
    /** Synchronization interval in milliseconds */
    syncIntervalMs: number;
    /** Enable automatic synchronization */
    enableAutoSync: boolean;
    /** Maximum sync attempts on failure */
    maxSyncAttempts: number;
    /** Sync retry delay in milliseconds */
    syncRetryDelayMs: number;
    /** Enable tool version tracking */
    enableVersionTracking: boolean;
    /** Tool discovery timeout in milliseconds */
    discoveryTimeoutMs: number;
    /** Enable tool conflict resolution */
    enableConflictResolution: boolean;
    /** Conflict resolution strategy */
    conflictResolutionStrategy: 'latest' | 'merge' | 'provider-priority' | 'manual';
    /** Provider priority for conflict resolution */
    providerPriority: string[];
    /** Enable tool discovery caching */
    enableDiscoveryCache: boolean;
    /** Discovery cache TTL in milliseconds */
    cacheTimeToLiveMs: number;
}
/**
 * Tool discovery state for each provider.
 */
export interface ProviderDiscoveryState {
    providerId: string;
    isDiscovering: boolean;
    lastDiscoveryTime?: Date;
    lastSuccessfulSync?: Date;
    discoveredToolCount: number;
    syncAttempts: number;
    errors: string[];
    version: number;
    toolSignatures: Set<string>;
}
/**
 * Synchronized tool registry entry.
 */
export interface SynchronizedTool {
    tool: UnifiedTool;
    originalTool: DiscoveredMCPTool;
    providerId: string;
    serverName: string;
    discoveryTime: Date;
    version: number;
    signature: string;
    conflictResolved: boolean;
    conflictSources?: string[];
}
/**
 * Tool conflict information.
 */
export interface ToolConflict {
    toolName: string;
    conflictingVersions: SynchronizedTool[];
    resolutionStrategy: string;
    resolvedTool?: SynchronizedTool;
    resolutionTime?: Date;
}
/**
 * Discovery synchronization statistics.
 */
export interface DiscoveryStats {
    totalProviders: number;
    activeProviders: number;
    totalTools: number;
    uniqueTools: number;
    conflictCount: number;
    lastSyncTime?: Date;
    averageSyncDuration: number;
    syncSuccessRate: number;
    providerStats: Record<string, ProviderDiscoveryState>;
}
/**
 * Default tool discovery configuration.
 */
export declare const DEFAULT_DISCOVERY_CONFIG: ToolDiscoveryConfig;
/**
 * Tool discovery synchronization manager.
 * Ensures all providers have access to the same set of available MCP tools.
 */
export declare class ToolDiscoverySync extends EventEmitter {
    private config;
    private providers;
    private providerStates;
    private synchronizedTools;
    private toolConflicts;
    private syncTimer;
    private syncInProgress;
    private discoveryCache;
    private stats;
    constructor(config?: Partial<ToolDiscoveryConfig>);
    /**
     * Register a provider for tool discovery synchronization.
     * @param providerId Provider identifier.
     * @param toolManager MCP tool manager for the provider.
     */
    registerProvider(providerId: string, toolManager: MCPToolManager): void;
    /**
     * Unregister a provider from synchronization.
     * @param providerId Provider identifier.
     */
    unregisterProvider(providerId: string): void;
    /**
     * Perform tool discovery synchronization across all providers.
     * @param forceSync Whether to force synchronization even if recently synced.
     * @returns Promise resolving to synchronization results.
     */
    synchronizeTools(forceSync?: boolean): Promise<{
        synchronized: number;
        conflicts: number;
        errors: string[];
        duration: number;
    }>;
    /**
     * Get synchronized tools available to all providers.
     * @param includingConflicted Whether to include conflicted tools.
     * @returns Array of synchronized tools.
     */
    getSynchronizedTools(includingConflicted?: boolean): SynchronizedTool[];
    /**
     * Get unified tools for a specific provider.
     * @param providerId Provider identifier.
     * @returns Array of unified tools available to the provider.
     */
    getProviderTools(providerId: string): UnifiedTool[];
    /**
     * Get tool conflicts that need resolution.
     * @returns Array of tool conflicts.
     */
    getToolConflicts(): ToolConflict[];
    /**
     * Manually resolve a tool conflict.
     * @param toolName Tool name with conflict.
     * @param selectedVersion Version to use (provider:version format).
     * @returns True if conflict was resolved.
     */
    resolveConflict(toolName: string, selectedVersion: string): Promise<boolean>;
    /**
     * Force refresh tools from a specific provider.
     * @param providerId Provider identifier.
     * @returns Promise resolving to refresh results.
     */
    refreshProvider(providerId: string): Promise<{
        toolsDiscovered: number;
        conflicts: number;
        errors: string[];
    }>;
    /**
     * Get synchronization statistics.
     * @returns Current synchronization statistics.
     */
    getStats(): DiscoveryStats;
    /**
     * Enable or disable automatic synchronization.
     * @param enabled Whether to enable auto sync.
     */
    setAutoSync(enabled: boolean): void;
    /**
     * Shutdown tool discovery synchronization.
     */
    shutdown(): Promise<void>;
    /**
     * Discover tools from a specific provider.
     * @param providerId Provider identifier.
     * @param toolManager MCP tool manager.
     * @param state Provider discovery state.
     */
    private discoverProviderTools;
    /**
     * Resolve tool conflicts based on configuration strategy.
     * @returns Number of conflicts resolved.
     */
    private resolveToolConflicts;
    /**
     * Apply conflict resolution strategy to resolve a tool conflict.
     * @param conflict Tool conflict to resolve.
     * @returns Resolved tool or null if no resolution.
     */
    private applyConflictResolution;
    /**
     * Merge multiple tool versions into a single comprehensive version.
     * @param versions Array of tool versions to merge.
     * @returns Merged tool or null if merge failed.
     */
    private mergeToolVersions;
    /**
     * Check if provider was recently synced.
     * @param state Provider discovery state.
     * @returns True if recently synced.
     */
    private isRecentlySynced;
    /**
     * Create tool signature for conflict detection.
     * @param tool Unified tool.
     * @returns Tool signature string.
     */
    private createToolSignature;
    /**
     * Create hash of an object for signature generation.
     * @param obj Object to hash.
     * @returns Hash string.
     */
    private hashObject;
    /**
     * Extract server name from tool information.
     * @param toolName Tool name.
     * @param toolManager Tool manager.
     * @returns Server name.
     */
    private extractServerName;
    /**
     * Get cached discovery results.
     * @param providerId Provider identifier.
     * @returns Cached tools or null if expired/not found.
     */
    private getCachedDiscovery;
    /**
     * Cache discovery results.
     * @param providerId Provider identifier.
     * @param tools Synchronized tools to cache.
     */
    private cacheDiscovery;
    /**
     * Process cached tools for a provider.
     * @param providerId Provider identifier.
     * @param cachedTools Cached synchronized tools.
     * @param state Provider discovery state.
     */
    private processCachedTools;
    /**
     * Initialize synchronization statistics.
     * @returns Initial statistics.
     */
    private initializeStats;
    /**
     * Update synchronization statistics.
     */
    private updateStats;
    /**
     * Start automatic synchronization timer.
     */
    private startAutoSync;
    /**
     * Stop automatic synchronization timer.
     */
    private stopAutoSync;
}
/**
 * Create tool discovery sync with default configuration.
 * @param customConfig Optional configuration overrides.
 * @returns Configured tool discovery sync.
 */
export declare function createToolDiscoverySync(customConfig?: Partial<ToolDiscoveryConfig>): ToolDiscoverySync;
