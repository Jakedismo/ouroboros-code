/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';
import { gzipSync, gunzipSync } from 'zlib';
import { PersistedWorkflowState } from './workflow-state-manager.js';

/**
 * Persistence configuration
 */
export interface PersistenceConfig {
  baseDirectory: string;
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
  backupCount: number;
  autoCleanup: boolean;
  maxStateSize: number; // bytes
  indexingEnabled: boolean;
}

/**
 * State storage metadata
 */
export interface StateStorageMetadata {
  workflowId: string;
  version: string;
  checksum: string;
  compressed: boolean;
  encrypted: boolean;
  size: number;
  createdAt: Date;
  lastAccessed: Date;
  backupCount: number;
  tags: string[];
}

/**
 * State index entry
 */
export interface StateIndexEntry {
  workflowId: string;
  sessionId?: string;
  projectPath?: string;
  status: string;
  createdAt: Date;
  lastUpdated: Date;
  size: number;
  checksum: string;
  tags: string[];
  metadata: Record<string, any>;
}

/**
 * Recovery point information
 */
export interface RecoveryPoint {
  id: string;
  workflowId: string;
  timestamp: Date;
  description: string;
  type: 'auto' | 'manual' | 'milestone' | 'error';
  size: number;
  checkpointCount: number;
  isRestorable: boolean;
  metadata: Record<string, any>;
}

/**
 * Persistence events
 */
export interface WorkflowStatePersistenceEvents {
  'state-saved': (workflowId: string, metadata: StateStorageMetadata) => void;
  'state-loaded': (workflowId: string, size: number) => void;
  'backup-created': (workflowId: string, backupId: string) => void;
  'recovery-point-created': (recoveryPoint: RecoveryPoint) => void;
  'index-updated': (entryCount: number) => void;
  'cleanup-completed': (removedCount: number, freedSpace: number) => void;
  'corruption-detected': (workflowId: string, error: string) => void;
}

/**
 * Advanced workflow state persistence system
 */
export class WorkflowStatePersistence extends EventEmitter {
  private config: PersistenceConfig;
  private stateIndex = new Map<string, StateIndexEntry>();
  private recoveryPoints = new Map<string, RecoveryPoint[]>();
  private isInitialized = false;

  constructor(config?: Partial<PersistenceConfig>) {
    super();
    
    this.config = {
      baseDirectory: join(homedir(), '.ouroboros-code', 'workflow-states'),
      compressionEnabled: true,
      encryptionEnabled: false, // Would need implementation
      backupCount: 5,
      autoCleanup: true,
      maxStateSize: 50 * 1024 * 1024, // 50MB
      indexingEnabled: true,
      ...config
    };
  }

  /**
   * Initialize persistence system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Create directory structure
      await fs.mkdir(this.config.baseDirectory, { recursive: true });
      await fs.mkdir(join(this.config.baseDirectory, 'states'), { recursive: true });
      await fs.mkdir(join(this.config.baseDirectory, 'backups'), { recursive: true });
      await fs.mkdir(join(this.config.baseDirectory, 'recovery'), { recursive: true });
      await fs.mkdir(join(this.config.baseDirectory, 'index'), { recursive: true });

      // Load existing index
      if (this.config.indexingEnabled) {
        await this.loadStateIndex();
      }

      // Setup cleanup if enabled
      if (this.config.autoCleanup) {
        this.scheduleCleanup();
      }

      this.isInitialized = true;
      console.log('💾 Workflow state persistence system initialized');
    } catch (error) {
      throw new Error(`Failed to initialize workflow state persistence: ${error}`);
    }
  }

  /**
   * Save workflow state with advanced options
   */
  async saveWorkflowState(
    state: PersistedWorkflowState,
    options: {
      createBackup?: boolean;
      compress?: boolean;
      tags?: string[];
      metadata?: Record<string, any>;
    } = {}
  ): Promise<StateStorageMetadata> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const {
      createBackup = false,
      compress = this.config.compressionEnabled,
      tags = [],
      metadata = {}
    } = options;

    try {
      // Serialize state
      const serializedState = JSON.stringify(state, this.serializationReplacer, 2);
      let stateData = Buffer.from(serializedState, 'utf-8');

      // Validate size
      if (stateData.length > this.config.maxStateSize) {
        throw new Error(`State size ${stateData.length} exceeds maximum allowed ${this.config.maxStateSize}`);
      }

      // Compress if enabled
      if (compress) {
        stateData = gzipSync(stateData);
      }

      // Calculate checksum
      const checksum = createHash('sha256').update(stateData).digest('hex');

      // Create backup if requested
      if (createBackup) {
        await this.createBackup(state.workflowId);
      }

      // Save to disk
      const statePath = this.getStatePath(state.workflowId);
      await fs.writeFile(statePath, stateData);

      // Create metadata
      const storageMetadata: StateStorageMetadata = {
        workflowId: state.workflowId,
        version: state.metadata.version,
        checksum,
        compressed: compress,
        encrypted: false, // Not implemented yet
        size: stateData.length,
        createdAt: new Date(state.metadata.createdAt),
        lastAccessed: new Date(),
        backupCount: createBackup ? 1 : 0,
        tags
      };

      // Save metadata
      await this.saveStateMetadata(state.workflowId, storageMetadata);

      // Update index
      if (this.config.indexingEnabled) {
        await this.updateStateIndex(state, storageMetadata, metadata);
      }

      this.emit('state-saved', state.workflowId, storageMetadata);
      
      console.log(`💾 Saved workflow state: ${state.workflowId} (${stateData.length} bytes, compressed: ${compress})`);
      return storageMetadata;
    } catch (error) {
      console.error(`❌ Failed to save workflow state ${state.workflowId}:`, error);
      throw error;
    }
  }

  /**
   * Load workflow state with validation
   */
  async loadWorkflowState(workflowId: string): Promise<PersistedWorkflowState | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const statePath = this.getStatePath(workflowId);
      const metadataPath = this.getMetadataPath(workflowId);

      // Check if files exist
      try {
        await fs.access(statePath);
        await fs.access(metadataPath);
      } catch {
        return null; // Files don't exist
      }

      // Load metadata
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata: StateStorageMetadata = JSON.parse(metadataContent);

      // Load state data
      let stateData = await fs.readFile(statePath);

      // Verify checksum
      const currentChecksum = createHash('sha256').update(stateData).digest('hex');
      if (currentChecksum !== metadata.checksum) {
        const error = 'State corruption detected - checksum mismatch';
        this.emit('corruption-detected', workflowId, error);
        throw new Error(error);
      }

      // Decompress if needed
      if (metadata.compressed) {
        try {
          stateData = gunzipSync(stateData);
        } catch (decompressError) {
          const error = `Failed to decompress state: ${decompressError}`;
          this.emit('corruption-detected', workflowId, error);
          throw new Error(error);
        }
      }

      // Parse state
      const serializedState = stateData.toString('utf-8');
      const state: PersistedWorkflowState = JSON.parse(serializedState, this.serializationReviver);

      // Update last accessed time
      metadata.lastAccessed = new Date();
      await this.saveStateMetadata(workflowId, metadata);

      this.emit('state-loaded', workflowId, stateData.length);
      
      console.log(`💾 Loaded workflow state: ${workflowId} (${stateData.length} bytes)`);
      return state;
    } catch (error) {
      console.error(`❌ Failed to load workflow state ${workflowId}:`, error);
      return null;
    }
  }

  /**
   * Create recovery point for workflow
   */
  async createRecoveryPoint(
    workflowId: string,
    description: string,
    type: 'auto' | 'manual' | 'milestone' | 'error' = 'manual'
  ): Promise<RecoveryPoint> {
    const state = await this.loadWorkflowState(workflowId);
    if (!state) {
      throw new Error(`Cannot create recovery point: workflow ${workflowId} not found`);
    }

    const recoveryPoint: RecoveryPoint = {
      id: `recovery_${workflowId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      workflowId,
      timestamp: new Date(),
      description,
      type,
      size: 0, // Will be calculated
      checkpointCount: state.checkpoints.length,
      isRestorable: true,
      metadata: {
        stepIndex: state.state.currentStepIndex,
        status: state.state.status,
        progress: state.state.progress.percentage
      }
    };

    // Save recovery point
    const recoveryPath = join(this.config.baseDirectory, 'recovery', `${recoveryPoint.id}.json`);
    const recoveryData = JSON.stringify({
      recoveryPoint,
      state
    }, null, 2);

    await fs.writeFile(recoveryPath, recoveryData, 'utf-8');
    recoveryPoint.size = Buffer.from(recoveryData).length;

    // Update recovery points map
    if (!this.recoveryPoints.has(workflowId)) {
      this.recoveryPoints.set(workflowId, []);
    }
    this.recoveryPoints.get(workflowId)!.push(recoveryPoint);

    // Keep only recent recovery points (configurable limit)
    const workflowRecoveryPoints = this.recoveryPoints.get(workflowId)!;
    if (workflowRecoveryPoints.length > 10) {
      const oldestPoint = workflowRecoveryPoints.shift()!;
      try {
        await fs.unlink(join(this.config.baseDirectory, 'recovery', `${oldestPoint.id}.json`));
      } catch {
        // File might already be deleted
      }
    }

    this.emit('recovery-point-created', recoveryPoint);
    
    console.log(`📍 Created recovery point for workflow ${workflowId}: ${description}`);
    return recoveryPoint;
  }

  /**
   * Restore workflow from recovery point
   */
  async restoreFromRecoveryPoint(recoveryPointId: string): Promise<PersistedWorkflowState | null> {
    try {
      const recoveryPath = join(this.config.baseDirectory, 'recovery', `${recoveryPointId}.json`);
      const recoveryData = await fs.readFile(recoveryPath, 'utf-8');
      const { recoveryPoint, state } = JSON.parse(recoveryData);

      // Validate recovery point
      if (!recoveryPoint.isRestorable) {
        throw new Error(`Recovery point ${recoveryPointId} is not restorable`);
      }

      // Save as current state
      await this.saveWorkflowState(state, {
        createBackup: true,
        tags: ['restored', recoveryPoint.type]
      });

      console.log(`📍 Restored workflow ${state.workflowId} from recovery point: ${recoveryPoint.description}`);
      return state;
    } catch (error) {
      console.error(`❌ Failed to restore from recovery point ${recoveryPointId}:`, error);
      return null;
    }
  }

  /**
   * Get recovery points for workflow
   */
  async getRecoveryPoints(workflowId: string): Promise<RecoveryPoint[]> {
    const points = this.recoveryPoints.get(workflowId) || [];
    
    // Also load from disk if not in memory
    try {
      const recoveryDir = join(this.config.baseDirectory, 'recovery');
      const files = await fs.readdir(recoveryDir);
      const workflowFiles = files.filter(f => f.includes(`recovery_${workflowId}_`));

      for (const file of workflowFiles) {
        const recoveryData = await fs.readFile(join(recoveryDir, file), 'utf-8');
        const { recoveryPoint } = JSON.parse(recoveryData);
        
        // Check if already in memory
        if (!points.find(p => p.id === recoveryPoint.id)) {
          points.push(recoveryPoint);
        }
      }
    } catch {
      // Directory might not exist or be inaccessible
    }

    return points.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Search workflow states by criteria
   */
  async searchStates(criteria: {
    sessionId?: string;
    projectPath?: string;
    status?: string;
    tags?: string[];
    dateRange?: { from: Date; to: Date };
    sizeRange?: { min: number; max: number };
  }): Promise<StateIndexEntry[]> {
    if (!this.config.indexingEnabled) {
      throw new Error('Indexing must be enabled for state search functionality');
    }

    const results: StateIndexEntry[] = [];

    for (const entry of this.stateIndex.values()) {
      // Apply filters
      if (criteria.sessionId && entry.sessionId !== criteria.sessionId) continue;
      if (criteria.projectPath && entry.projectPath !== criteria.projectPath) continue;
      if (criteria.status && entry.status !== criteria.status) continue;
      
      if (criteria.tags && criteria.tags.length > 0) {
        const hasAllTags = criteria.tags.every(tag => entry.tags.includes(tag));
        if (!hasAllTags) continue;
      }
      
      if (criteria.dateRange) {
        if (entry.createdAt < criteria.dateRange.from || entry.createdAt > criteria.dateRange.to) continue;
      }
      
      if (criteria.sizeRange) {
        if (entry.size < criteria.sizeRange.min || entry.size > criteria.sizeRange.max) continue;
      }

      results.push(entry);
    }

    return results.sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());
  }

  /**
   * Get storage statistics
   */
  async getStorageStatistics(): Promise<{
    totalStates: number;
    totalSize: number;
    averageSize: number;
    compressionRatio: number;
    backupCount: number;
    recoveryPointCount: number;
    oldestState: Date | null;
    newestState: Date | null;
  }> {
    const entries = Array.from(this.stateIndex.values());
    const totalStates = entries.length;
    const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);
    const averageSize = totalStates > 0 ? totalSize / totalStates : 0;

    // Calculate compression ratio (simplified)
    const compressedEntries = entries.filter(e => e.checksum); // Proxy for compression
    const compressionRatio = compressedEntries.length / Math.max(totalStates, 1);

    // Count backups
    const backupDir = join(this.config.baseDirectory, 'backups');
    let backupCount = 0;
    try {
      const backupFiles = await fs.readdir(backupDir);
      backupCount = backupFiles.length;
    } catch {
      // Directory might not exist
    }

    // Count recovery points
    const recoveryDir = join(this.config.baseDirectory, 'recovery');
    let recoveryPointCount = 0;
    try {
      const recoveryFiles = await fs.readdir(recoveryDir);
      recoveryPointCount = recoveryFiles.length;
    } catch {
      // Directory might not exist
    }

    // Find oldest and newest states
    const dates = entries.map(e => e.createdAt.getTime());
    const oldestState = dates.length > 0 ? new Date(Math.min(...dates)) : null;
    const newestState = dates.length > 0 ? new Date(Math.max(...dates)) : null;

    return {
      totalStates,
      totalSize,
      averageSize,
      compressionRatio,
      backupCount,
      recoveryPointCount,
      oldestState,
      newestState
    };
  }

  /**
   * Cleanup old states and backups
   */
  async cleanup(options: {
    olderThanDays?: number;
    keepLatestCount?: number;
    maxTotalSize?: number;
  } = {}): Promise<{ removedCount: number; freedSpace: number }> {
    const {
      olderThanDays = 30,
      keepLatestCount = 50,
      maxTotalSize = 500 * 1024 * 1024 // 500MB
    } = options;

    let removedCount = 0;
    let freedSpace = 0;
    const cutoffDate = new Date(Date.now() - (olderThanDays * 24 * 60 * 60 * 1000));

    // Get all entries sorted by date (oldest first)
    const entries = Array.from(this.stateIndex.values())
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    // Calculate current total size
    const currentTotalSize = entries.reduce((sum, entry) => sum + entry.size, 0);

    // Remove by age
    for (const entry of entries) {
      if (entry.createdAt < cutoffDate && entries.length - removedCount > keepLatestCount) {
        try {
          await this.removeWorkflowState(entry.workflowId);
          freedSpace += entry.size;
          removedCount++;
        } catch (error) {
          console.warn(`⚠️  Failed to remove workflow state ${entry.workflowId}:`, error);
        }
      }
    }

    // Remove by size limit (oldest first)
    let remainingSize = currentTotalSize - freedSpace;
    if (remainingSize > maxTotalSize) {
      const sortedByAge = entries
        .filter(e => e.createdAt >= cutoffDate) // Only remaining entries
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      for (const entry of sortedByAge) {
        if (remainingSize <= maxTotalSize || sortedByAge.length - removedCount <= keepLatestCount) {
          break;
        }

        try {
          await this.removeWorkflowState(entry.workflowId);
          remainingSize -= entry.size;
          freedSpace += entry.size;
          removedCount++;
        } catch (error) {
          console.warn(`⚠️  Failed to remove workflow state ${entry.workflowId}:`, error);
        }
      }
    }

    // Cleanup orphaned backups and recovery points
    await this.cleanupOrphanedFiles();

    this.emit('cleanup-completed', removedCount, freedSpace);
    
    console.log(`🧹 Cleanup completed: removed ${removedCount} states, freed ${(freedSpace / 1024 / 1024).toFixed(1)} MB`);
    return { removedCount, freedSpace };
  }

  /**
   * Private: Get state file path
   */
  private getStatePath(workflowId: string): string {
    return join(this.config.baseDirectory, 'states', `${workflowId}.state`);
  }

  /**
   * Private: Get metadata file path
   */
  private getMetadataPath(workflowId: string): string {
    return join(this.config.baseDirectory, 'states', `${workflowId}.meta`);
  }

  /**
   * Private: Save state metadata
   */
  private async saveStateMetadata(workflowId: string, metadata: StateStorageMetadata): Promise<void> {
    const metadataPath = this.getMetadataPath(workflowId);
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
  }

  /**
   * Private: Create backup
   */
  private async createBackup(workflowId: string): Promise<string> {
    const backupId = `backup_${workflowId}_${Date.now()}`;
    const backupPath = join(this.config.baseDirectory, 'backups', `${backupId}.bak`);
    
    try {
      const statePath = this.getStatePath(workflowId);
      const stateData = await fs.readFile(statePath);
      await fs.writeFile(backupPath, stateData);
      
      this.emit('backup-created', workflowId, backupId);
      return backupId;
    } catch (error) {
      console.warn(`⚠️  Failed to create backup for ${workflowId}:`, error);
      throw error;
    }
  }

  /**
   * Private: Load state index
   */
  private async loadStateIndex(): Promise<void> {
    try {
      const indexPath = join(this.config.baseDirectory, 'index', 'state-index.json');
      const indexData = await fs.readFile(indexPath, 'utf-8');
      const indexEntries: StateIndexEntry[] = JSON.parse(indexData);
      
      this.stateIndex.clear();
      indexEntries.forEach(entry => {
        this.stateIndex.set(entry.workflowId, {
          ...entry,
          createdAt: new Date(entry.createdAt),
          lastUpdated: new Date(entry.lastUpdated)
        });
      });
      
      console.log(`💾 Loaded state index: ${indexEntries.length} entries`);
    } catch {
      // Index file doesn't exist or is corrupted - start fresh
      this.stateIndex.clear();
    }
  }

  /**
   * Private: Save state index
   */
  private async saveStateIndex(): Promise<void> {
    try {
      const indexPath = join(this.config.baseDirectory, 'index', 'state-index.json');
      const indexEntries = Array.from(this.stateIndex.values());
      await fs.writeFile(indexPath, JSON.stringify(indexEntries, null, 2), 'utf-8');
      
      this.emit('index-updated', indexEntries.length);
    } catch (error) {
      console.warn('⚠️  Failed to save state index:', error);
    }
  }

  /**
   * Private: Update state index
   */
  private async updateStateIndex(
    state: PersistedWorkflowState,
    metadata: StateStorageMetadata,
    additionalMetadata: Record<string, any>
  ): Promise<void> {
    const indexEntry: StateIndexEntry = {
      workflowId: state.workflowId,
      sessionId: state.sessionId,
      projectPath: state.projectPath,
      status: state.state.status,
      createdAt: new Date(state.metadata.createdAt),
      lastUpdated: new Date(state.metadata.lastUpdated),
      size: metadata.size,
      checksum: metadata.checksum,
      tags: metadata.tags,
      metadata: {
        ...additionalMetadata,
        version: metadata.version,
        compressed: metadata.compressed
      }
    };

    this.stateIndex.set(state.workflowId, indexEntry);
    await this.saveStateIndex();
  }

  /**
   * Private: Remove workflow state
   */
  private async removeWorkflowState(workflowId: string): Promise<void> {
    try {
      await fs.unlink(this.getStatePath(workflowId));
      await fs.unlink(this.getMetadataPath(workflowId));
      this.stateIndex.delete(workflowId);
    } catch (error) {
      // Files might not exist
    }
  }

  /**
   * Private: Cleanup orphaned files
   */
  private async cleanupOrphanedFiles(): Promise<void> {
    const validWorkflowIds = new Set(this.stateIndex.keys());
    
    // Cleanup orphaned backups
    try {
      const backupDir = join(this.config.baseDirectory, 'backups');
      const backupFiles = await fs.readdir(backupDir);
      
      for (const file of backupFiles) {
        const workflowId = file.match(/backup_(.+?)_\d+\.bak/)?.[1];
        if (workflowId && !validWorkflowIds.has(workflowId)) {
          await fs.unlink(join(backupDir, file));
        }
      }
    } catch {
      // Directory might not exist
    }

    // Cleanup orphaned recovery points
    try {
      const recoveryDir = join(this.config.baseDirectory, 'recovery');
      const recoveryFiles = await fs.readdir(recoveryDir);
      
      for (const file of recoveryFiles) {
        const workflowId = file.match(/recovery_(.+?)_\d+_.*\.json/)?.[1];
        if (workflowId && !validWorkflowIds.has(workflowId)) {
          await fs.unlink(join(recoveryDir, file));
        }
      }
    } catch {
      // Directory might not exist
    }
  }

  /**
   * Private: Schedule cleanup
   */
  private scheduleCleanup(): void {
    // Run cleanup daily
    const cleanupInterval = setInterval(async () => {
      try {
        await this.cleanup();
      } catch (error) {
        console.warn('⚠️  Scheduled cleanup failed:', error);
      }
    }, 24 * 60 * 60 * 1000); // 24 hours

    // Cleanup on process exit
    process.on('exit', () => {
      clearInterval(cleanupInterval);
    });
  }

  /**
   * Private: Serialization replacer for JSON.stringify
   */
  private serializationReplacer(key: string, value: any): any {
    // Convert Maps to objects for serialization
    if (value instanceof Map) {
      return {
        __type: 'Map',
        __data: Array.from(value.entries())
      };
    }
    // Convert Dates to ISO strings
    if (value instanceof Date) {
      return {
        __type: 'Date',
        __data: value.toISOString()
      };
    }
    return value;
  }

  /**
   * Private: Serialization reviver for JSON.parse
   */
  private serializationReviver(key: string, value: any): any {
    // Restore Maps
    if (value && value.__type === 'Map') {
      return new Map(value.__data);
    }
    // Restore Dates
    if (value && value.__type === 'Date') {
      return new Date(value.__data);
    }
    return value;
  }
}

/**
 * Global workflow state persistence instance
 */
let globalWorkflowStatePersistence: WorkflowStatePersistence | null = null;

/**
 * Get the global workflow state persistence instance
 */
export function getWorkflowStatePersistence(config?: Partial<PersistenceConfig>): WorkflowStatePersistence {
  if (!globalWorkflowStatePersistence) {
    globalWorkflowStatePersistence = new WorkflowStatePersistence(config);
  }
  return globalWorkflowStatePersistence;
}

/**
 * Initialize workflow state persistence
 */
export async function initializeWorkflowStatePersistence(
  config?: Partial<PersistenceConfig>
): Promise<WorkflowStatePersistence> {
  const persistence = getWorkflowStatePersistence(config);
  await persistence.initialize();
  console.log('💾 Advanced workflow state persistence system initialized');
  return persistence;
}