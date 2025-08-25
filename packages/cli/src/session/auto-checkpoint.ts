/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { OuroborosSession, SessionCheckpoint, SessionConfig } from './types.js';
import { SessionPersistence } from './session-persistence.js';

/**
 * Checkpoint trigger types
 */
export enum CheckpointTrigger {
  TIME_INTERVAL = 'time_interval',
  COMMAND_COUNT = 'command_count',
  WORKFLOW_MILESTONE = 'workflow_milestone',
  AGENT_SWITCH = 'agent_switch',
  ERROR_RECOVERY = 'error_recovery',
  MEMORY_THRESHOLD = 'memory_threshold',
  USER_ACTIVITY = 'user_activity'
}

/**
 * Checkpoint configuration
 */
export interface CheckpointConfig {
  // Time-based checkpoints
  intervalMs: number;
  maxIdleTimeMs: number; // Don't checkpoint if user has been idle
  
  // Activity-based checkpoints
  commandThreshold: number; // Checkpoint every N commands
  workflowMilestones: boolean; // Checkpoint on workflow completion
  agentSwitches: boolean; // Checkpoint on agent changes
  
  // Resource-based checkpoints
  memoryThresholdMB: number; // Checkpoint if memory usage exceeds
  
  // Retention
  maxCheckpoints: number; // Keep only N most recent checkpoints
  cleanupOlderThanHours: number; // Remove checkpoints older than N hours
}

/**
 * Checkpoint event data
 */
export interface CheckpointEvent {
  trigger: CheckpointTrigger;
  sessionId: string;
  checkpointId: string;
  timestamp: Date;
  success: boolean;
  duration: number; // Milliseconds
  size?: number; // Checkpoint size in bytes
  metadata?: Record<string, any>;
}

/**
 * Automatic checkpointing system with intelligent triggers
 */
export class AutoCheckpoint extends EventEmitter {
  private config: CheckpointConfig;
  private persistence: SessionPersistence;
  private currentSession: OuroborosSession | null = null;
  
  // Timers
  private intervalTimer: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  
  // Activity tracking
  private lastCommandTime = Date.now();
  private commandsSinceCheckpoint = 0;
  private lastUserActivity = Date.now();
  
  // Memory tracking
  private memoryCheckInterval: NodeJS.Timeout | null = null;
  
  constructor(persistence: SessionPersistence, sessionConfig: SessionConfig) {
    super();
    this.persistence = persistence;
    
    this.config = {
      intervalMs: sessionConfig.checkpointInterval,
      maxIdleTimeMs: 30 * 60 * 1000, // 30 minutes
      commandThreshold: 10, // Every 10 commands
      workflowMilestones: true,
      agentSwitches: true,
      memoryThresholdMB: 256, // 256MB
      maxCheckpoints: 20,
      cleanupOlderThanHours: 24
    };
  }

  /**
   * Start automatic checkpointing for a session
   */
  start(session: OuroborosSession): void {
    this.currentSession = session;
    this.resetTracking();
    
    // Start time-based checkpointing
    this.startIntervalTimer();
    
    // Start memory monitoring
    this.startMemoryMonitoring();
    
    console.log(`🔄 Auto-checkpoint started for session: ${session.id}`);
    console.log(`📅 Interval: ${this.config.intervalMs / 1000}s, Commands: ${this.config.commandThreshold}, Memory: ${this.config.memoryThresholdMB}MB`);
  }

  /**
   * Stop automatic checkpointing
   */
  stop(): void {
    this.stopAllTimers();
    this.currentSession = null;
    console.log('⏹️  Auto-checkpoint stopped');
  }

  /**
   * Record command execution (triggers activity-based checkpoints)
   */
  recordCommand(): void {
    this.lastCommandTime = Date.now();
    this.lastUserActivity = Date.now();
    this.commandsSinceCheckpoint++;

    // Check if we've hit the command threshold
    if (this.commandsSinceCheckpoint >= this.config.commandThreshold) {
      this.triggerCheckpoint(CheckpointTrigger.COMMAND_COUNT, {
        commandCount: this.commandsSinceCheckpoint
      });
    }

    // Reset idle timer
    this.resetIdleTimer();
  }

  /**
   * Record user activity (resets idle timer)
   */
  recordActivity(): void {
    this.lastUserActivity = Date.now();
    this.resetIdleTimer();
  }

  /**
   * Record workflow milestone
   */
  recordWorkflowMilestone(workflowId: string, milestone: string): void {
    if (this.config.workflowMilestones) {
      this.triggerCheckpoint(CheckpointTrigger.WORKFLOW_MILESTONE, {
        workflowId,
        milestone
      });
    }
  }

  /**
   * Record agent switch
   */
  recordAgentSwitch(fromAgent: string, toAgent: string): void {
    if (this.config.agentSwitches) {
      this.triggerCheckpoint(CheckpointTrigger.AGENT_SWITCH, {
        fromAgent,
        toAgent
      });
    }
  }

  /**
   * Record error for recovery checkpoint
   */
  recordError(error: Error, context?: string): void {
    this.triggerCheckpoint(CheckpointTrigger.ERROR_RECOVERY, {
      error: error.message,
      context
    });
  }

  /**
   * Force immediate checkpoint
   */
  forceCheckpoint(reason: string = 'manual'): Promise<void> {
    return this.triggerCheckpoint(CheckpointTrigger.USER_ACTIVITY, { reason });
  }

  /**
   * Clean up old checkpoints
   */
  async cleanupOldCheckpoints(): Promise<void> {
    if (!this.currentSession) return;

    const cutoffTime = Date.now() - (this.config.cleanupOlderThanHours * 60 * 60 * 1000);
    const session = this.currentSession;

    const originalCount = session.checkpoints.length;
    
    // Remove old checkpoints
    session.checkpoints = session.checkpoints.filter(checkpoint => 
      checkpoint.timestamp.getTime() > cutoffTime
    );

    // Keep only the most recent N checkpoints
    if (session.checkpoints.length > this.config.maxCheckpoints) {
      session.checkpoints = session.checkpoints
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, this.config.maxCheckpoints);
    }

    const cleanedCount = originalCount - session.checkpoints.length;
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} old checkpoints`);
    }
  }

  /**
   * Get checkpoint statistics
   */
  getStats(): {
    totalCheckpoints: number;
    lastCheckpoint: Date | null;
    commandsSinceCheckpoint: number;
    timeSinceLastCommand: number;
    memoryUsage: NodeJS.MemoryUsage;
  } {
    const memoryUsage = process.memoryUsage();
    
    return {
      totalCheckpoints: this.currentSession?.checkpoints.length || 0,
      lastCheckpoint: this.currentSession?.lastCheckpoint || null,
      commandsSinceCheckpoint: this.commandsSinceCheckpoint,
      timeSinceLastCommand: Date.now() - this.lastCommandTime,
      memoryUsage
    };
  }

  /**
   * Private: Trigger checkpoint with specific trigger type
   */
  private async triggerCheckpoint(
    trigger: CheckpointTrigger, 
    metadata: Record<string, any> = {}
  ): Promise<void> {
    if (!this.currentSession) return;

    const startTime = Date.now();
    const checkpointId = `checkpoint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Create checkpoint data
      const checkpoint: SessionCheckpoint = {
        id: checkpointId,
        timestamp: new Date(),
        type: trigger === CheckpointTrigger.USER_ACTIVITY ? 'manual' : 'auto',
        description: this.getCheckpointDescription(trigger, metadata),
        state: {
          activeWorkflows: this.currentSession.activeWorkflows.map(w => w.workflowId),
          completedWorkflows: this.currentSession.completedWorkflows,
          failedWorkflows: this.currentSession.failedWorkflows.map(f => f.workflowId),
          memoryUsage: process.memoryUsage()
        },
        metadata: {
          trigger: trigger,
          ...metadata
        }
      };

      // Add checkpoint to session
      this.currentSession.checkpoints.push(checkpoint);
      this.currentSession.lastCheckpoint = new Date();

      // Persist session with checkpoint flag
      await this.persistence.saveSession(this.currentSession, true);

      const duration = Date.now() - startTime;

      // Clean up old checkpoints
      await this.cleanupOldCheckpoints();

      // Reset activity counters
      if (trigger === CheckpointTrigger.COMMAND_COUNT) {
        this.commandsSinceCheckpoint = 0;
      }

      const event: CheckpointEvent = {
        trigger,
        sessionId: this.currentSession.id,
        checkpointId,
        timestamp: checkpoint.timestamp,
        success: true,
        duration,
        metadata
      };

      this.emit('checkpoint-created', event);

      console.log(`✅ Checkpoint created: ${trigger} (${duration}ms)`);

    } catch (error) {
      const event: CheckpointEvent = {
        trigger,
        sessionId: this.currentSession.id,
        checkpointId,
        timestamp: new Date(),
        success: false,
        duration: Date.now() - startTime,
        metadata
      };

      this.emit('checkpoint-failed', event, error);
      console.error(`❌ Checkpoint failed: ${trigger}`, error);
    }
  }

  /**
   * Private: Get checkpoint description
   */
  private getCheckpointDescription(trigger: CheckpointTrigger, metadata: Record<string, any>): string {
    switch (trigger) {
      case CheckpointTrigger.TIME_INTERVAL:
        return 'Scheduled checkpoint';
      case CheckpointTrigger.COMMAND_COUNT:
        return `Command threshold reached (${metadata['commandCount']} commands)`;
      case CheckpointTrigger.WORKFLOW_MILESTONE:
        return `Workflow milestone: ${metadata['milestone']}`;
      case CheckpointTrigger.AGENT_SWITCH:
        return `Agent switched: ${metadata['fromAgent']} → ${metadata['toAgent']}`;
      case CheckpointTrigger.ERROR_RECOVERY:
        return `Error recovery: ${metadata['error']}`;
      case CheckpointTrigger.MEMORY_THRESHOLD:
        return `Memory threshold exceeded: ${Math.round(metadata['memoryMB'])}MB`;
      case CheckpointTrigger.USER_ACTIVITY:
        return metadata['reason'] || 'Manual checkpoint';
      default:
        return 'Automatic checkpoint';
    }
  }

  /**
   * Private: Start interval timer
   */
  private startIntervalTimer(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
    }

    this.intervalTimer = setInterval(() => {
      // Only checkpoint if user has been active recently
      const timeSinceActivity = Date.now() - this.lastUserActivity;
      if (timeSinceActivity < this.config.maxIdleTimeMs) {
        this.triggerCheckpoint(CheckpointTrigger.TIME_INTERVAL);
      }
    }, this.config.intervalMs);
  }

  /**
   * Private: Reset idle timer
   */
  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    // Set timer to trigger a checkpoint just before idle timeout
    const timeoutMs = this.config.maxIdleTimeMs - 60000; // 1 minute before idle
    this.idleTimer = setTimeout(() => {
      this.triggerCheckpoint(CheckpointTrigger.USER_ACTIVITY, { reason: 'pre-idle' });
    }, timeoutMs);
  }

  /**
   * Private: Start memory monitoring
   */
  private startMemoryMonitoring(): void {
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
    }

    this.memoryCheckInterval = setInterval(() => {
      const memoryUsage = process.memoryUsage();
      const memoryMB = memoryUsage.heapUsed / (1024 * 1024);

      if (memoryMB > this.config.memoryThresholdMB) {
        this.triggerCheckpoint(CheckpointTrigger.MEMORY_THRESHOLD, {
          memoryMB: memoryMB,
          memoryUsage
        });
      }
    }, 60000); // Check every minute
  }

  /**
   * Private: Stop all timers
   */
  private stopAllTimers(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }

    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
      this.memoryCheckInterval = null;
    }
  }

  /**
   * Private: Reset activity tracking
   */
  private resetTracking(): void {
    this.lastCommandTime = Date.now();
    this.lastUserActivity = Date.now();
    this.commandsSinceCheckpoint = 0;
  }
}