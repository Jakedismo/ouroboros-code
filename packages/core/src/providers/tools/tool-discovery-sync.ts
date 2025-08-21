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
  conflictResolutionStrategy:
    | 'latest'
    | 'merge'
    | 'provider-priority'
    | 'manual';
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
export const DEFAULT_DISCOVERY_CONFIG: ToolDiscoveryConfig = {
  syncIntervalMs: 300000, // 5 minutes
  enableAutoSync: true,
  maxSyncAttempts: 3,
  syncRetryDelayMs: 10000, // 10 seconds
  enableVersionTracking: true,
  discoveryTimeoutMs: 30000, // 30 seconds
  enableConflictResolution: true,
  conflictResolutionStrategy: 'latest',
  providerPriority: ['primary', 'secondary', 'fallback'],
  enableDiscoveryCache: true,
  cacheTimeToLiveMs: 600000, // 10 minutes
};

/**
 * Tool discovery synchronization manager.
 * Ensures all providers have access to the same set of available MCP tools.
 */
export class ToolDiscoverySync extends EventEmitter {
  private config: ToolDiscoveryConfig;
  private providers = new Map<string, MCPToolManager>();
  private providerStates = new Map<string, ProviderDiscoveryState>();
  private synchronizedTools = new Map<string, SynchronizedTool>();
  private toolConflicts = new Map<string, ToolConflict>();
  private syncTimer: NodeJS.Timeout | null = null;
  private syncInProgress = false;
  private discoveryCache = new Map<
    string,
    { tools: SynchronizedTool[]; timestamp: Date }
  >();
  private stats: DiscoveryStats;

  constructor(config: Partial<ToolDiscoveryConfig> = {}) {
    super();
    this.config = { ...DEFAULT_DISCOVERY_CONFIG, ...config };
    this.stats = this.initializeStats();

    if (this.config.enableAutoSync) {
      this.startAutoSync();
    }
  }

  /**
   * Register a provider for tool discovery synchronization.
   * @param providerId Provider identifier.
   * @param toolManager MCP tool manager for the provider.
   */
  registerProvider(providerId: string, toolManager: MCPToolManager): void {
    this.providers.set(providerId, toolManager);

    this.providerStates.set(providerId, {
      providerId,
      isDiscovering: false,
      discoveredToolCount: 0,
      syncAttempts: 0,
      errors: [],
      version: 0,
      toolSignatures: new Set(),
    });

    this.emit('provider_registered', { providerId, toolCount: 0 });
  }

  /**
   * Unregister a provider from synchronization.
   * @param providerId Provider identifier.
   */
  unregisterProvider(providerId: string): void {
    this.providers.delete(providerId);
    this.providerStates.delete(providerId);

    // Remove tools from this provider
    const toolsToRemove: string[] = [];
    for (const [toolName, syncedTool] of this.synchronizedTools.entries()) {
      if (syncedTool.providerId === providerId) {
        toolsToRemove.push(toolName);
      }
    }

    for (const toolName of toolsToRemove) {
      this.synchronizedTools.delete(toolName);
    }

    this.emit('provider_unregistered', {
      providerId,
      removedTools: toolsToRemove.length,
    });
  }

  /**
   * Perform tool discovery synchronization across all providers.
   * @param forceSync Whether to force synchronization even if recently synced.
   * @returns Promise resolving to synchronization results.
   */
  async synchronizeTools(forceSync: boolean = false): Promise<{
    synchronized: number;
    conflicts: number;
    errors: string[];
    duration: number;
  }> {
    if (this.syncInProgress && !forceSync) {
      throw new Error('Synchronization already in progress');
    }

    this.syncInProgress = true;
    const startTime = Date.now();
    const errors: string[] = [];

    try {
      this.emit('sync_started', {
        providerCount: this.providers.size,
        forceSync,
      });

      // Discover tools from each provider
      const discoveryPromises: Array<Promise<void>> = [];

      for (const [providerId, toolManager] of this.providers.entries()) {
        const state = this.providerStates.get(providerId)!;

        // Skip if recently synced (unless forced)
        if (!forceSync && this.isRecentlySynced(state)) {
          continue;
        }

        const discoveryPromise = this.discoverProviderTools(
          providerId,
          toolManager,
          state,
        ).catch((error) => {
          errors.push(`${providerId}: ${error.message}`);
          console.error(`Tool discovery failed for ${providerId}:`, error);
        });

        discoveryPromises.push(discoveryPromise);
      }

      // Wait for all discovery operations
      await Promise.allSettled(discoveryPromises);

      // Resolve conflicts if enabled
      let conflictCount = 0;
      if (this.config.enableConflictResolution) {
        conflictCount = await this.resolveToolConflicts();
      }

      // Update statistics
      this.updateStats();

      const duration = Date.now() - startTime;
      const synchronized = this.synchronizedTools.size;

      this.emit('sync_completed', {
        synchronized,
        conflicts: conflictCount,
        errors: errors.length,
        duration,
      });

      return {
        synchronized,
        conflicts: conflictCount,
        errors,
        duration,
      };
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Get synchronized tools available to all providers.
   * @param includingConflicted Whether to include conflicted tools.
   * @returns Array of synchronized tools.
   */
  getSynchronizedTools(
    includingConflicted: boolean = false,
  ): SynchronizedTool[] {
    const tools: SynchronizedTool[] = [];

    for (const syncedTool of this.synchronizedTools.values()) {
      if (
        includingConflicted ||
        !this.toolConflicts.has(syncedTool.tool.name)
      ) {
        tools.push(syncedTool);
      }
    }

    return tools.sort((a, b) => a.tool.name.localeCompare(b.tool.name));
  }

  /**
   * Get unified tools for a specific provider.
   * @param providerId Provider identifier.
   * @returns Array of unified tools available to the provider.
   */
  getProviderTools(providerId: string): UnifiedTool[] {
    const tools: UnifiedTool[] = [];

    for (const syncedTool of this.synchronizedTools.values()) {
      // Include tools from this provider and resolved tools from other providers
      if (
        syncedTool.providerId === providerId ||
        !this.toolConflicts.has(syncedTool.tool.name)
      ) {
        tools.push(syncedTool.tool);
      }
    }

    return tools;
  }

  /**
   * Get tool conflicts that need resolution.
   * @returns Array of tool conflicts.
   */
  getToolConflicts(): ToolConflict[] {
    return Array.from(this.toolConflicts.values());
  }

  /**
   * Manually resolve a tool conflict.
   * @param toolName Tool name with conflict.
   * @param selectedVersion Version to use (provider:version format).
   * @returns True if conflict was resolved.
   */
  async resolveConflict(
    toolName: string,
    selectedVersion: string,
  ): Promise<boolean> {
    const conflict = this.toolConflicts.get(toolName);
    if (!conflict) {
      return false;
    }

    const [providerId, version] = selectedVersion.split(':');
    const selectedTool = conflict.conflictingVersions.find(
      (tool) =>
        tool.providerId === providerId && tool.version.toString() === version,
    );

    if (!selectedTool) {
      return false;
    }

    // Update the synchronized tool registry
    this.synchronizedTools.set(toolName, {
      ...selectedTool,
      conflictResolved: true,
      conflictSources: conflict.conflictingVersions.map((t) => t.providerId),
    });

    // Update conflict record
    conflict.resolvedTool = selectedTool;
    conflict.resolutionTime = new Date();
    conflict.resolutionStrategy = 'manual';

    this.emit('conflict_resolved', {
      toolName,
      selectedProvider: providerId,
      selectedVersion: version,
      strategy: 'manual',
    });

    return true;
  }

  /**
   * Force refresh tools from a specific provider.
   * @param providerId Provider identifier.
   * @returns Promise resolving to refresh results.
   */
  async refreshProvider(providerId: string): Promise<{
    toolsDiscovered: number;
    conflicts: number;
    errors: string[];
  }> {
    const toolManager = this.providers.get(providerId);
    const state = this.providerStates.get(providerId);

    if (!toolManager || !state) {
      throw new Error(`Provider ${providerId} not registered`);
    }

    const errors: string[] = [];

    try {
      // Clear existing tools from this provider
      const existingTools = Array.from(this.synchronizedTools.entries())
        .filter(([, tool]) => tool.providerId === providerId)
        .map(([name]) => name);

      for (const toolName of existingTools) {
        this.synchronizedTools.delete(toolName);
      }

      // Discover tools from this provider
      await this.discoverProviderTools(providerId, toolManager, state);

      // Resolve any new conflicts
      const conflictCount = this.config.enableConflictResolution
        ? await this.resolveToolConflicts()
        : 0;

      return {
        toolsDiscovered: state.discoveredToolCount,
        conflicts: conflictCount,
        errors,
      };
    } catch (error: any) {
      errors.push(error.message);
      throw error;
    }
  }

  /**
   * Get synchronization statistics.
   * @returns Current synchronization statistics.
   */
  getStats(): DiscoveryStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * Enable or disable automatic synchronization.
   * @param enabled Whether to enable auto sync.
   */
  setAutoSync(enabled: boolean): void {
    this.config.enableAutoSync = enabled;

    if (enabled && !this.syncTimer) {
      this.startAutoSync();
    } else if (!enabled && this.syncTimer) {
      this.stopAutoSync();
    }
  }

  /**
   * Shutdown tool discovery synchronization.
   */
  async shutdown(): Promise<void> {
    this.stopAutoSync();

    // Clear all data
    this.providers.clear();
    this.providerStates.clear();
    this.synchronizedTools.clear();
    this.toolConflicts.clear();
    this.discoveryCache.clear();

    this.emit('sync_shutdown');
  }

  /**
   * Discover tools from a specific provider.
   * @param providerId Provider identifier.
   * @param toolManager MCP tool manager.
   * @param state Provider discovery state.
   */
  private async discoverProviderTools(
    providerId: string,
    toolManager: MCPToolManager,
    state: ProviderDiscoveryState,
  ): Promise<void> {
    state.isDiscovering = true;
    state.syncAttempts++;

    try {
      // Check cache first
      if (this.config.enableDiscoveryCache) {
        const cached = this.getCachedDiscovery(providerId);
        if (cached) {
          this.processCachedTools(providerId, cached, state);
          return;
        }
      }

      // Wait for tool manager to be ready
      await toolManager.waitForReady(this.config.discoveryTimeoutMs);

      // Get unified tools from the provider
      const unifiedTools = toolManager.getUnifiedTools();
      const synchronizedTools: SynchronizedTool[] = [];

      // Convert to synchronized tool format
      for (const unifiedTool of unifiedTools) {
        const signature = this.createToolSignature(unifiedTool);
        const syncedTool: SynchronizedTool = {
          tool: unifiedTool,
          originalTool: toolManager.getTool(
            unifiedTool.name,
          ) as DiscoveredMCPTool,
          providerId,
          serverName: this.extractServerName(unifiedTool.name, toolManager),
          discoveryTime: new Date(),
          version: state.version + 1,
          signature,
          conflictResolved: false,
        };

        synchronizedTools.push(syncedTool);
        this.synchronizedTools.set(unifiedTool.name, syncedTool);
        state.toolSignatures.add(signature);
      }

      // Cache the discovery results
      if (this.config.enableDiscoveryCache) {
        this.cacheDiscovery(providerId, synchronizedTools);
      }

      // Update state
      state.discoveredToolCount = synchronizedTools.length;
      state.lastDiscoveryTime = new Date();
      state.lastSuccessfulSync = new Date();
      state.version++;
      state.errors = []; // Clear previous errors on success

      this.emit('provider_discovery_completed', {
        providerId,
        toolCount: synchronizedTools.length,
        version: state.version,
      });
    } catch (error: any) {
      state.errors.push(error.message);
      this.emit('provider_discovery_failed', {
        providerId,
        error: error.message,
        attempt: state.syncAttempts,
      });
      throw error;
    } finally {
      state.isDiscovering = false;
    }
  }

  /**
   * Resolve tool conflicts based on configuration strategy.
   * @returns Number of conflicts resolved.
   */
  private async resolveToolConflicts(): Promise<number> {
    const toolGroups = new Map<string, SynchronizedTool[]>();

    // Group tools by name to identify conflicts
    for (const syncedTool of this.synchronizedTools.values()) {
      const toolName = syncedTool.tool.name;
      if (!toolGroups.has(toolName)) {
        toolGroups.set(toolName, []);
      }
      toolGroups.get(toolName)!.push(syncedTool);
    }

    let resolvedCount = 0;

    // Process groups with conflicts
    for (const [toolName, tools] of toolGroups.entries()) {
      if (tools.length > 1) {
        const conflict: ToolConflict = {
          toolName,
          conflictingVersions: tools,
          resolutionStrategy: this.config.conflictResolutionStrategy,
        };

        const resolvedTool = await this.applyConflictResolution(conflict);
        if (resolvedTool) {
          // Update synchronized tools registry with resolved version
          this.synchronizedTools.set(toolName, {
            ...resolvedTool,
            conflictResolved: true,
            conflictSources: tools.map((t) => t.providerId),
          });

          conflict.resolvedTool = resolvedTool;
          conflict.resolutionTime = new Date();
          resolvedCount++;
        }

        this.toolConflicts.set(toolName, conflict);
      }
    }

    if (resolvedCount > 0) {
      this.emit('conflicts_resolved', {
        resolvedCount,
        totalConflicts: this.toolConflicts.size,
        strategy: this.config.conflictResolutionStrategy,
      });
    }

    return resolvedCount;
  }

  /**
   * Apply conflict resolution strategy to resolve a tool conflict.
   * @param conflict Tool conflict to resolve.
   * @returns Resolved tool or null if no resolution.
   */
  private async applyConflictResolution(
    conflict: ToolConflict,
  ): Promise<SynchronizedTool | null> {
    const { conflictingVersions, resolutionStrategy } = conflict;

    switch (resolutionStrategy) {
      case 'latest':
        // Use the most recently discovered version
        return conflictingVersions.reduce((latest, current) =>
          current.discoveryTime > latest.discoveryTime ? current : latest,
        );

      case 'provider-priority':
        // Use provider priority order
        for (const priority of this.config.providerPriority) {
          const tool = conflictingVersions.find(
            (t) => t.providerId === priority,
          );
          if (tool) return tool;
        }
        // Fallback to latest if no priority match
        return conflictingVersions.reduce((latest, current) =>
          current.discoveryTime > latest.discoveryTime ? current : latest,
        );

      case 'merge':
        // Attempt to merge tool definitions (advanced strategy)
        return this.mergeToolVersions(conflictingVersions);

      case 'manual':
      default:
        // No automatic resolution, requires manual intervention
        return null;
    }
  }

  /**
   * Merge multiple tool versions into a single comprehensive version.
   * @param versions Array of tool versions to merge.
   * @returns Merged tool or null if merge failed.
   */
  private mergeToolVersions(
    versions: SynchronizedTool[],
  ): SynchronizedTool | null {
    if (versions.length === 0) return null;

    // Use the first version as base and merge others
    const baseTool = versions[0];
    const mergedTool = { ...baseTool };

    // Merge descriptions (take longest)
    let longestDescription = baseTool.tool.description;
    for (const version of versions.slice(1)) {
      if (version.tool.description.length > longestDescription.length) {
        longestDescription = version.tool.description;
      }
    }
    mergedTool.tool.description = longestDescription;

    // Merge parameters (union of all properties)
    const mergedProperties = { ...baseTool.tool.parameters.properties };
    const allRequired = new Set(baseTool.tool.parameters.required || []);

    for (const version of versions.slice(1)) {
      // Merge properties
      Object.assign(mergedProperties, version.tool.parameters.properties);

      // Union required fields
      if (version.tool.parameters.required) {
        version.tool.parameters.required.forEach((req) => allRequired.add(req));
      }
    }

    mergedTool.tool.parameters = {
      type: 'object',
      properties: mergedProperties,
      required: Array.from(allRequired),
    };

    // Update metadata
    mergedTool.conflictSources = versions.map((v) => v.providerId);
    mergedTool.version = Math.max(...versions.map((v) => v.version));
    mergedTool.discoveryTime = new Date();

    return mergedTool;
  }

  /**
   * Check if provider was recently synced.
   * @param state Provider discovery state.
   * @returns True if recently synced.
   */
  private isRecentlySynced(state: ProviderDiscoveryState): boolean {
    if (!state.lastSuccessfulSync) return false;

    const age = Date.now() - state.lastSuccessfulSync.getTime();
    return age < this.config.syncIntervalMs * 0.5; // Consider recent if less than half interval
  }

  /**
   * Create tool signature for conflict detection.
   * @param tool Unified tool.
   * @returns Tool signature string.
   */
  private createToolSignature(tool: UnifiedTool): string {
    const signatureData = {
      name: tool.name,
      description: tool.description,
      parametersHash: this.hashObject(tool.parameters),
    };

    return JSON.stringify(signatureData);
  }

  /**
   * Create hash of an object for signature generation.
   * @param obj Object to hash.
   * @returns Hash string.
   */
  private hashObject(obj: any): string {
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Extract server name from tool information.
   * @param toolName Tool name.
   * @param toolManager Tool manager.
   * @returns Server name.
   */
  private extractServerName(
    toolName: string,
    toolManager: MCPToolManager,
  ): string {
    const tool = toolManager.getTool(toolName);
    if (tool instanceof DiscoveredMCPTool) {
      return tool.serverName;
    }
    return 'unknown';
  }

  /**
   * Get cached discovery results.
   * @param providerId Provider identifier.
   * @returns Cached tools or null if expired/not found.
   */
  private getCachedDiscovery(providerId: string): SynchronizedTool[] | null {
    const cached = this.discoveryCache.get(providerId);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp.getTime();
    if (age > this.config.cacheTimeToLiveMs) {
      this.discoveryCache.delete(providerId);
      return null;
    }

    return cached.tools;
  }

  /**
   * Cache discovery results.
   * @param providerId Provider identifier.
   * @param tools Synchronized tools to cache.
   */
  private cacheDiscovery(providerId: string, tools: SynchronizedTool[]): void {
    this.discoveryCache.set(providerId, {
      tools: [...tools], // Create copy
      timestamp: new Date(),
    });
  }

  /**
   * Process cached tools for a provider.
   * @param providerId Provider identifier.
   * @param cachedTools Cached synchronized tools.
   * @param state Provider discovery state.
   */
  private processCachedTools(
    providerId: string,
    cachedTools: SynchronizedTool[],
    state: ProviderDiscoveryState,
  ): void {
    // Update synchronized tools registry
    for (const syncedTool of cachedTools) {
      this.synchronizedTools.set(syncedTool.tool.name, syncedTool);
      state.toolSignatures.add(syncedTool.signature);
    }

    // Update state
    state.discoveredToolCount = cachedTools.length;
    state.lastDiscoveryTime = new Date();

    this.emit('provider_discovery_cached', {
      providerId,
      toolCount: cachedTools.length,
      cacheAge: Date.now() - cachedTools[0]?.discoveryTime.getTime() || 0,
    });
  }

  /**
   * Initialize synchronization statistics.
   * @returns Initial statistics.
   */
  private initializeStats(): DiscoveryStats {
    return {
      totalProviders: 0,
      activeProviders: 0,
      totalTools: 0,
      uniqueTools: 0,
      conflictCount: 0,
      averageSyncDuration: 0,
      syncSuccessRate: 0,
      providerStats: {},
    };
  }

  /**
   * Update synchronization statistics.
   */
  private updateStats(): void {
    this.stats.totalProviders = this.providers.size;
    this.stats.activeProviders = Array.from(
      this.providerStates.values(),
    ).filter((state) => state.lastSuccessfulSync).length;
    this.stats.totalTools = this.synchronizedTools.size;
    this.stats.uniqueTools = new Set(
      Array.from(this.synchronizedTools.keys()),
    ).size;
    this.stats.conflictCount = this.toolConflicts.size;

    // Update provider stats
    this.stats.providerStats = Object.fromEntries(
      this.providerStates.entries(),
    );
  }

  /**
   * Start automatic synchronization timer.
   */
  private startAutoSync(): void {
    if (this.syncTimer) return;

    this.syncTimer = setInterval(async () => {
      try {
        await this.synchronizeTools(false);
      } catch (error) {
        console.warn('Auto-sync failed:', error);
      }
    }, this.config.syncIntervalMs);
  }

  /**
   * Stop automatic synchronization timer.
   */
  private stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }
}

/**
 * Create tool discovery sync with default configuration.
 * @param customConfig Optional configuration overrides.
 * @returns Configured tool discovery sync.
 */
export function createToolDiscoverySync(
  customConfig?: Partial<ToolDiscoveryConfig>,
): ToolDiscoverySync {
  return new ToolDiscoverySync(customConfig);
}
