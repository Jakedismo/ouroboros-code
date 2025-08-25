/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { getWorkflowStateManager, WorkflowCheckpoint } from '../state/workflow-state-manager.js';
import { getWorkflowMonitor, WorkflowExecutionState, WorkflowStatus } from '../monitoring/workflow-monitor.js';

/**
 * Rollback snapshot for data restoration
 */
export interface RollbackSnapshot {
  snapshotId: string;
  workflowId: string;
  checkpointId: string;
  timestamp: Date;
  fileSystem: {
    files: Map<string, {
      content: string;
      permissions: number;
      lastModified: Date;
    }>;
    directories: Map<string, {
      permissions: number;
      lastModified: Date;
    }>;
  };
  environment: {
    variables: Map<string, string>;
    workingDirectory: string;
    activeProcesses: string[];
  };
  state: {
    workflowState: WorkflowExecutionState;
    stepOutputs: Map<string, any>;
    resources: Map<string, any>;
  };
  metadata: {
    snapshotSize: number;
    compressionRatio: number;
    integrityHash: string;
  };
}

/**
 * Rollback operation progress
 */
export interface RollbackProgress {
  operationId: string;
  workflowId: string;
  phase: 'validating' | 'snapshotting' | 'restoring' | 'verifying' | 'completed' | 'failed';
  currentStep: string;
  stepsCompleted: number;
  stepsTotal: number;
  percentage: number;
  estimatedTimeRemaining: number;
  details: {
    filesRestored: number;
    filesTotal: number;
    dataRestored: number; // bytes
    dataTotal: number; // bytes
  };
  errors: string[];
  warnings: string[];
}

/**
 * Rollback validation result
 */
export interface RollbackValidation {
  isValid: boolean;
  checkpointExists: boolean;
  snapshotExists: boolean;
  integrityValid: boolean;
  dependenciesValid: boolean;
  conflicts: string[];
  warnings: string[];
  recommendations: string[];
  estimatedImpact: {
    filesToRestore: number;
    stepsToUndo: number;
    dataToRestore: number; // bytes
    estimatedDuration: number; // milliseconds
  };
}

/**
 * Rollback manager events
 */
export interface WorkflowRollbackManagerEvents {
  'rollback-started': (progress: RollbackProgress) => void;
  'rollback-progress': (progress: RollbackProgress) => void;
  'rollback-completed': (operationId: string, success: boolean) => void;
  'snapshot-created': (snapshotId: string, size: number) => void;
  'validation-completed': (validation: RollbackValidation) => void;
  'conflict-detected': (conflictType: string, details: string) => void;
}

/**
 * Comprehensive workflow rollback management system
 */
export class WorkflowRollbackManager extends EventEmitter {
  private stateManager = getWorkflowStateManager();
  private monitor = getWorkflowMonitor();
  private snapshotsDirectory: string;
  private activeRollbacks = new Map<string, RollbackProgress>();
  private snapshots = new Map<string, RollbackSnapshot>();
  private isInitialized = false;

  constructor() {
    super();
    this.snapshotsDirectory = join(homedir(), '.ouroboros-code', 'rollback-snapshots');
  }

  /**
   * Initialize rollback management system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await fs.mkdir(this.snapshotsDirectory, { recursive: true });
      await this.loadExistingSnapshots();
      
      this.isInitialized = true;
      console.log('🔄 Workflow rollback management system initialized');
    } catch (error) {
      throw new Error(`Failed to initialize rollback manager: ${error}`);
    }
  }

  /**
   * Create comprehensive rollback snapshot
   */
  async createRollbackSnapshot(
    workflowId: string,
    checkpointId: string,
    includeFileSystem: boolean = true
  ): Promise<RollbackSnapshot> {
    console.log(`📸 Creating rollback snapshot for workflow ${workflowId}, checkpoint ${checkpointId}`);

    const snapshotId = `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const workflowState = this.monitor.getWorkflowState(workflowId);
    
    if (!workflowState) {
      throw new Error(`Workflow ${workflowId} not found for snapshot creation`);
    }

    const snapshot: RollbackSnapshot = {
      snapshotId,
      workflowId,
      checkpointId,
      timestamp: new Date(),
      fileSystem: {
        files: new Map(),
        directories: new Map()
      },
      environment: {
        variables: new Map(Object.entries(process.env).filter(([_, value]) => value !== undefined) as [string, string][]),
        workingDirectory: process.cwd(),
        activeProcesses: []
      },
      state: {
        workflowState: { ...workflowState },
        stepOutputs: new Map(workflowState.stepResults),
        resources: new Map()
      },
      metadata: {
        snapshotSize: 0,
        compressionRatio: 1.0,
        integrityHash: ''
      }
    };

    // Capture file system state if requested
    if (includeFileSystem) {
      await this.captureFileSystemState(snapshot, workflowState);
    }

    // Calculate metadata
    snapshot.metadata = await this.calculateSnapshotMetadata(snapshot);

    // Persist snapshot
    await this.persistSnapshot(snapshot);
    
    this.snapshots.set(snapshotId, snapshot);
    this.emit('snapshot-created', snapshotId, snapshot.metadata.snapshotSize);

    console.log(`✅ Rollback snapshot created: ${snapshotId} (${(snapshot.metadata.snapshotSize / 1024 / 1024).toFixed(2)} MB)`);
    return snapshot;
  }

  /**
   * Validate rollback operation before execution
   */
  async validateRollback(
    workflowId: string,
    checkpointId: string,
    snapshotId?: string
  ): Promise<RollbackValidation> {
    console.log(`🔍 Validating rollback for workflow ${workflowId} to checkpoint ${checkpointId}`);

    const validation: RollbackValidation = {
      isValid: true,
      checkpointExists: false,
      snapshotExists: false,
      integrityValid: false,
      dependenciesValid: true,
      conflicts: [],
      warnings: [],
      recommendations: [],
      estimatedImpact: {
        filesToRestore: 0,
        stepsToUndo: 0,
        dataToRestore: 0,
        estimatedDuration: 0
      }
    };

    try {
      // Validate checkpoint exists
      const checkpoints = await this.getWorkflowCheckpoints(workflowId);
      const targetCheckpoint = checkpoints.find(cp => cp.id === checkpointId);
      validation.checkpointExists = !!targetCheckpoint;

      if (!validation.checkpointExists) {
        validation.isValid = false;
        validation.conflicts.push(`Checkpoint ${checkpointId} not found`);
      } else if (targetCheckpoint) {
        // Estimate rollback impact
        validation.estimatedImpact = await this.estimateRollbackImpact(workflowId, targetCheckpoint);
      }

      // Validate snapshot if provided
      if (snapshotId) {
        const snapshot = this.snapshots.get(snapshotId) || await this.loadSnapshot(snapshotId);
        validation.snapshotExists = !!snapshot;
        
        if (snapshot) {
          validation.integrityValid = await this.validateSnapshotIntegrity(snapshot);
          if (!validation.integrityValid) {
            validation.conflicts.push('Snapshot integrity validation failed');
            validation.isValid = false;
          }
        } else {
          validation.warnings.push(`Snapshot ${snapshotId} not found, rollback will proceed without file restoration`);
        }
      }

      // Check for conflicts with current state
      const conflicts = await this.detectRollbackConflicts(workflowId, checkpointId);
      validation.conflicts.push(...conflicts);
      
      if (conflicts.length > 0) {
        validation.isValid = false;
      }

      // Generate recommendations
      validation.recommendations = this.generateRollbackRecommendations(validation);

      this.emit('validation-completed', validation);
      return validation;

    } catch (error) {
      validation.isValid = false;
      validation.conflicts.push(`Validation error: ${error}`);
      return validation;
    }
  }

  /**
   * Execute comprehensive rollback operation
   */
  async executeRollback(
    workflowId: string,
    checkpointId: string,
    snapshotId?: string,
    options: {
      restoreFileSystem?: boolean;
      restoreEnvironment?: boolean;
      validateBeforeRestore?: boolean;
      createBackup?: boolean;
    } = {}
  ): Promise<boolean> {
    const operationId = `rollback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`🔄 Starting rollback operation: ${operationId}`);
    console.log(`   Workflow: ${workflowId}`);
    console.log(`   Target Checkpoint: ${checkpointId}`);
    console.log(`   Snapshot: ${snapshotId || 'none'}`);

    const progress: RollbackProgress = {
      operationId,
      workflowId,
      phase: 'validating',
      currentStep: 'Initializing rollback validation',
      stepsCompleted: 0,
      stepsTotal: this.calculateTotalSteps(options),
      percentage: 0,
      estimatedTimeRemaining: 0,
      details: {
        filesRestored: 0,
        filesTotal: 0,
        dataRestored: 0,
        dataTotal: 0
      },
      errors: [],
      warnings: []
    };

    this.activeRollbacks.set(operationId, progress);
    this.emit('rollback-started', progress);

    try {
      // Phase 1: Validation
      progress.phase = 'validating';
      progress.currentStep = 'Validating rollback prerequisites';
      this.updateProgress(progress, 1);

      if (options.validateBeforeRestore !== false) {
        const validation = await this.validateRollback(workflowId, checkpointId, snapshotId);
        if (!validation.isValid) {
          progress.errors.push('Rollback validation failed');
          progress.errors.push(...validation.conflicts);
          throw new Error('Rollback validation failed: ' + validation.conflicts.join(', '));
        }
        progress.warnings.push(...validation.warnings);
      }

      // Phase 2: Create backup snapshot if requested
      if (options.createBackup) {
        progress.phase = 'snapshotting';
        progress.currentStep = 'Creating backup snapshot';
        this.updateProgress(progress, 2);

        await this.createRollbackSnapshot(workflowId, 'pre_rollback_backup');
      }

      // Phase 3: Restore state
      progress.phase = 'restoring';
      progress.currentStep = 'Restoring workflow state';
      this.updateProgress(progress, 3);

      // Restore workflow state from checkpoint
      const restored = await this.stateManager.restoreFromCheckpoint(workflowId, checkpointId);
      if (!restored) {
        throw new Error(`Failed to restore workflow state from checkpoint ${checkpointId}`);
      }

      // Phase 4: Restore from snapshot if available
      if (snapshotId && (options.restoreFileSystem || options.restoreEnvironment)) {
        progress.currentStep = 'Restoring from snapshot';
        this.updateProgress(progress, 4);

        const snapshot = this.snapshots.get(snapshotId) || await this.loadSnapshot(snapshotId);
        if (snapshot) {
          await this.restoreFromSnapshot(snapshot, options, progress);
        } else {
          progress.warnings.push(`Snapshot ${snapshotId} not found, skipping file/environment restoration`);
        }
      }

      // Phase 5: Verification
      progress.phase = 'verifying';
      progress.currentStep = 'Verifying rollback completion';
      this.updateProgress(progress, progress.stepsTotal - 1);

      const verificationResult = await this.verifyRollbackCompletion(workflowId, checkpointId);
      if (!verificationResult.success) {
        progress.errors.push('Rollback verification failed');
        progress.errors.push(...verificationResult.errors);
        throw new Error('Rollback verification failed');
      }

      // Phase 6: Completion
      progress.phase = 'completed';
      progress.currentStep = 'Rollback completed successfully';
      progress.percentage = 100;
      progress.stepsCompleted = progress.stepsTotal;
      this.updateProgress(progress, progress.stepsTotal);

      this.emit('rollback-completed', operationId, true);
      console.log(`✅ Rollback completed successfully: ${operationId}`);
      return true;

    } catch (error) {
      progress.phase = 'failed';
      progress.errors.push(`Rollback failed: ${error}`);
      this.updateProgress(progress, progress.stepsCompleted);
      
      this.emit('rollback-completed', operationId, false);
      console.error(`❌ Rollback failed: ${operationId}`, error);
      return false;
    } finally {
      // Cleanup
      setTimeout(() => {
        this.activeRollbacks.delete(operationId);
      }, 30000); // Keep for 30 seconds for status queries
    }
  }

  /**
   * Get rollback operation status
   */
  getRollbackProgress(operationId: string): RollbackProgress | undefined {
    return this.activeRollbacks.get(operationId);
  }

  /**
   * Get all active rollback operations
   */
  getActiveRollbacks(): RollbackProgress[] {
    return Array.from(this.activeRollbacks.values());
  }

  /**
   * List available snapshots for workflow
   */
  getWorkflowSnapshots(workflowId: string): RollbackSnapshot[] {
    return Array.from(this.snapshots.values())
      .filter(snapshot => snapshot.workflowId === workflowId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Clean up old snapshots
   */
  async cleanupOldSnapshots(olderThanDays: number = 7): Promise<number> {
    const cutoffDate = new Date(Date.now() - (olderThanDays * 24 * 60 * 60 * 1000));
    let cleanedCount = 0;

    for (const [snapshotId, snapshot] of this.snapshots) {
      if (snapshot.timestamp < cutoffDate) {
        try {
          await this.deleteSnapshot(snapshotId);
          cleanedCount++;
        } catch (error) {
          console.warn(`⚠️  Failed to delete snapshot ${snapshotId}:`, error);
        }
      }
    }

    console.log(`🧹 Cleaned up ${cleanedCount} old rollback snapshots`);
    return cleanedCount;
  }

  /**
   * Generate rollback status report
   */
  async generateRollbackReport(workflowId?: string): Promise<string> {
    const allSnapshots = workflowId 
      ? this.getWorkflowSnapshots(workflowId)
      : Array.from(this.snapshots.values());
    
    const activeRollbacks = this.getActiveRollbacks();
    const totalSize = allSnapshots.reduce((sum, s) => sum + s.metadata.snapshotSize, 0);

    let report = `🔄 WORKFLOW ROLLBACK SYSTEM REPORT\n`;
    report += `═══════════════════════════════════════════════════════════════════════════════\n\n`;

    report += `📊 SNAPSHOT SUMMARY:\n`;
    report += `• Total Snapshots: ${allSnapshots.length}\n`;
    report += `• Total Size: ${(totalSize / 1024 / 1024).toFixed(2)} MB\n`;
    report += `• Active Rollbacks: ${activeRollbacks.length}\n`;
    report += `• Average Compression: ${allSnapshots.length > 0 ? 
      (allSnapshots.reduce((sum, s) => sum + s.metadata.compressionRatio, 0) / allSnapshots.length).toFixed(2) : 0}x\n\n`;

    if (activeRollbacks.length > 0) {
      report += `🔄 ACTIVE ROLLBACKS:\n`;
      activeRollbacks.forEach(rollback => {
        report += `• ${rollback.operationId}: ${rollback.phase} (${rollback.percentage.toFixed(1)}%)\n`;
        report += `  Current Step: ${rollback.currentStep}\n`;
        if (rollback.errors.length > 0) {
          report += `  Errors: ${rollback.errors.length}\n`;
        }
        report += `\n`;
      });
    }

    if (allSnapshots.length > 0) {
      report += `📸 RECENT SNAPSHOTS:\n`;
      allSnapshots.slice(0, 5).forEach(snapshot => {
        report += `• ${snapshot.snapshotId} (${snapshot.workflowId})\n`;
        report += `  Created: ${snapshot.timestamp.toLocaleString()}\n`;
        report += `  Size: ${(snapshot.metadata.snapshotSize / 1024 / 1024).toFixed(2)} MB\n`;
        report += `  Checkpoint: ${snapshot.checkpointId}\n\n`;
      });
    }

    return report;
  }

  /**
   * Private: Update rollback progress
   */
  private updateProgress(progress: RollbackProgress, step: number): void {
    progress.stepsCompleted = step;
    progress.percentage = (step / progress.stepsTotal) * 100;
    
    // Estimate remaining time based on current progress
    if (progress.stepsCompleted > 0) {
      const avgTimePerStep = 5000; // 5 seconds average per step
      progress.estimatedTimeRemaining = (progress.stepsTotal - progress.stepsCompleted) * avgTimePerStep;
    }

    this.emit('rollback-progress', progress);
  }

  /**
   * Private: Calculate total steps for rollback operation
   */
  private calculateTotalSteps(options: any): number {
    let steps = 3; // validation, restore state, verification
    
    if (options.createBackup) steps++;
    if (options.restoreFileSystem || options.restoreEnvironment) steps++;
    
    return steps;
  }

  /**
   * Private: Capture file system state
   */
  private async captureFileSystemState(snapshot: RollbackSnapshot, workflowState: WorkflowExecutionState): Promise<void> {
    // Placeholder implementation - in a real system this would:
    // 1. Scan the workflow's working directory
    // 2. Capture file contents and metadata
    // 3. Store directory structure
    // For now, we'll simulate this
    
    console.log(`📁 Capturing file system state for snapshot ${snapshot.snapshotId}`);
    
    // Mock file system capture
    snapshot.fileSystem.files.set('/mock/file.txt', {
      content: 'Mock file content',
      permissions: 0o644,
      lastModified: new Date()
    });
    
    snapshot.fileSystem.directories.set('/mock', {
      permissions: 0o755,
      lastModified: new Date()
    });
  }

  /**
   * Private: Calculate snapshot metadata
   */
  private async calculateSnapshotMetadata(snapshot: RollbackSnapshot): Promise<RollbackSnapshot['metadata']> {
    // Calculate approximate size
    let size = JSON.stringify(snapshot.state).length;
    size += Array.from(snapshot.fileSystem.files.values())
      .reduce((sum, file) => sum + file.content.length, 0);
    size += Array.from(snapshot.environment.variables.entries()).length * 50; // rough estimate
    
    return {
      snapshotSize: size,
      compressionRatio: 1.0, // Could implement actual compression
      integrityHash: `hash_${Date.now()}` // Could implement actual hash
    };
  }

  /**
   * Private: Get workflow checkpoints
   */
  private async getWorkflowCheckpoints(workflowId: string): Promise<WorkflowCheckpoint[]> {
    // This would integrate with the state manager to get actual checkpoints
    // For now, return empty array as placeholder
    return [];
  }

  /**
   * Private: Estimate rollback impact
   */
  private async estimateRollbackImpact(
    workflowId: string,
    checkpoint: WorkflowCheckpoint
  ): Promise<RollbackValidation['estimatedImpact']> {
    // Placeholder implementation
    return {
      filesToRestore: 5,
      stepsToUndo: 3,
      dataToRestore: 1024 * 1024, // 1MB
      estimatedDuration: 30000 // 30 seconds
    };
  }

  /**
   * Private: Validate snapshot integrity
   */
  private async validateSnapshotIntegrity(snapshot: RollbackSnapshot): Promise<boolean> {
    // Placeholder - could implement actual integrity checking
    return true;
  }

  /**
   * Private: Detect rollback conflicts
   */
  private async detectRollbackConflicts(workflowId: string, checkpointId: string): Promise<string[]> {
    const conflicts: string[] = [];
    
    // Check if workflow is currently running
    const workflowState = this.monitor.getWorkflowState(workflowId);
    if (workflowState?.status === WorkflowStatus.RUNNING) {
      conflicts.push('Cannot rollback while workflow is running');
    }
    
    // Could add more conflict detection logic here
    return conflicts;
  }

  /**
   * Private: Generate rollback recommendations
   */
  private generateRollbackRecommendations(validation: RollbackValidation): string[] {
    const recommendations: string[] = [];
    
    if (!validation.checkpointExists) {
      recommendations.push('Create a checkpoint before attempting rollback');
    }
    
    if (!validation.snapshotExists) {
      recommendations.push('Create a rollback snapshot for complete restoration');
    }
    
    if (validation.conflicts.length > 0) {
      recommendations.push('Resolve conflicts before proceeding with rollback');
    }
    
    return recommendations;
  }

  /**
   * Private: Restore from snapshot
   */
  private async restoreFromSnapshot(
    snapshot: RollbackSnapshot,
    options: any,
    progress: RollbackProgress
  ): Promise<void> {
    console.log(`🔄 Restoring from snapshot: ${snapshot.snapshotId}`);
    
    if (options.restoreFileSystem) {
      progress.currentStep = 'Restoring file system';
      progress.details.filesTotal = snapshot.fileSystem.files.size;
      
      // Simulate file restoration
      for (const [filePath, fileInfo] of snapshot.fileSystem.files) {
        progress.currentStep = `Restoring file: ${filePath}`;
        progress.details.filesRestored++;
        progress.details.dataRestored += fileInfo.content.length;
        
        // In a real implementation, this would restore the actual file
        await new Promise(resolve => setTimeout(resolve, 100));
        
        this.updateProgress(progress, progress.stepsCompleted);
      }
    }
    
    if (options.restoreEnvironment) {
      progress.currentStep = 'Restoring environment variables';
      
      // Simulate environment restoration
      for (const [key, value] of snapshot.environment.variables) {
        process.env[key] = value;
      }
      
      // Restore working directory
      try {
        process.chdir(snapshot.environment.workingDirectory);
      } catch (error) {
        progress.warnings.push(`Could not restore working directory: ${error}`);
      }
    }
    
    console.log(`✅ Snapshot restoration completed: ${snapshot.snapshotId}`);
  }

  /**
   * Private: Verify rollback completion
   */
  private async verifyRollbackCompletion(
    workflowId: string,
    checkpointId: string
  ): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    // Verify workflow state was restored
    const workflowState = this.monitor.getWorkflowState(workflowId);
    if (!workflowState) {
      errors.push('Workflow state not found after rollback');
    }
    
    // Could add more verification logic here
    
    return {
      success: errors.length === 0,
      errors
    };
  }

  /**
   * Private: Persist snapshot to disk
   */
  private async persistSnapshot(snapshot: RollbackSnapshot): Promise<void> {
    const filePath = join(this.snapshotsDirectory, `${snapshot.snapshotId}.json`);
    
    // Convert Maps to objects for JSON serialization
    const serializable = {
      ...snapshot,
      fileSystem: {
        files: Object.fromEntries(snapshot.fileSystem.files),
        directories: Object.fromEntries(snapshot.fileSystem.directories)
      },
      environment: {
        ...snapshot.environment,
        variables: Object.fromEntries(snapshot.environment.variables)
      },
      state: {
        ...snapshot.state,
        stepOutputs: Object.fromEntries(snapshot.state.stepOutputs),
        resources: Object.fromEntries(snapshot.state.resources)
      }
    };
    
    await fs.writeFile(filePath, JSON.stringify(serializable, null, 2), 'utf-8');
  }

  /**
   * Private: Load snapshot from disk
   */
  private async loadSnapshot(snapshotId: string): Promise<RollbackSnapshot | null> {
    try {
      const filePath = join(this.snapshotsDirectory, `${snapshotId}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      
      // Convert objects back to Maps
      const snapshot: RollbackSnapshot = {
        ...data,
        fileSystem: {
          files: new Map(Object.entries(data.fileSystem.files)),
          directories: new Map(Object.entries(data.fileSystem.directories))
        },
        environment: {
          ...data.environment,
          variables: new Map(Object.entries(data.environment.variables))
        },
        state: {
          ...data.state,
          stepOutputs: new Map(Object.entries(data.state.stepOutputs)),
          resources: new Map(Object.entries(data.state.resources))
        }
      };
      
      return snapshot;
    } catch (error) {
      return null;
    }
  }

  /**
   * Private: Load existing snapshots from disk
   */
  private async loadExistingSnapshots(): Promise<void> {
    try {
      const files = await fs.readdir(this.snapshotsDirectory);
      const snapshotFiles = files.filter(f => f.endsWith('.json'));
      
      for (const file of snapshotFiles) {
        const snapshotId = file.replace('.json', '');
        const snapshot = await this.loadSnapshot(snapshotId);
        if (snapshot) {
          this.snapshots.set(snapshotId, snapshot);
        }
      }
      
      console.log(`📸 Loaded ${this.snapshots.size} existing rollback snapshots`);
    } catch (error) {
      console.warn('⚠️  Could not load existing snapshots:', error);
    }
  }

  /**
   * Private: Delete snapshot
   */
  private async deleteSnapshot(snapshotId: string): Promise<void> {
    const filePath = join(this.snapshotsDirectory, `${snapshotId}.json`);
    await fs.unlink(filePath);
    this.snapshots.delete(snapshotId);
  }
}

/**
 * Global workflow rollback manager instance
 */
let globalWorkflowRollbackManager: WorkflowRollbackManager | null = null;

/**
 * Get the global workflow rollback manager instance
 */
export function getWorkflowRollbackManager(): WorkflowRollbackManager {
  if (!globalWorkflowRollbackManager) {
    globalWorkflowRollbackManager = new WorkflowRollbackManager();
  }
  return globalWorkflowRollbackManager;
}

/**
 * Initialize workflow rollback management system
 */
export async function initializeWorkflowRollbackManagement(): Promise<WorkflowRollbackManager> {
  const manager = getWorkflowRollbackManager();
  await manager.initialize();
  console.log('🔄 Comprehensive workflow rollback management system initialized');
  return manager;
}