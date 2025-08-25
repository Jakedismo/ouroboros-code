/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { promises as fs, existsSync } from 'fs';
import { join, dirname } from 'path';
import { OuroborosSession, SessionConfig } from './types.js';

/**
 * Persistence operation types
 */
export enum PersistenceOperation {
  SAVE = 'save',
  LOAD = 'load',
  DELETE = 'delete',
  CHECKPOINT = 'checkpoint',
  CLEANUP = 'cleanup'
}

/**
 * Persistence event data
 */
export interface PersistenceEvent {
  operation: PersistenceOperation;
  sessionId: string;
  timestamp: Date;
  success: boolean;
  error?: Error;
  size?: number; // Bytes written/read
  duration?: number; // Milliseconds
}

/**
 * Persistence statistics
 */
export interface PersistenceStats {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  totalBytes: number;
  averageLatency: number;
  lastOperation: Date | null;
  operationCounts: Record<PersistenceOperation, number>;
  errorCounts: Record<string, number>;
}

/**
 * Advanced session persistence with crash-safe operations and automatic checkpointing
 */
export class SessionPersistence extends EventEmitter {
  private config: SessionConfig;
  private operationQueue: Array<() => Promise<void>> = [];
  private processing = false;
  private stats: PersistenceStats;

  constructor(config: SessionConfig) {
    super();
    this.config = config;
    this.stats = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      totalBytes: 0,
      averageLatency: 0,
      lastOperation: null,
      operationCounts: {
        [PersistenceOperation.SAVE]: 0,
        [PersistenceOperation.LOAD]: 0,
        [PersistenceOperation.DELETE]: 0,
        [PersistenceOperation.CHECKPOINT]: 0,
        [PersistenceOperation.CLEANUP]: 0
      },
      errorCounts: {}
    };
  }

  /**
   * Save session with crash-safe operations
   */
  async saveSession(session: OuroborosSession, isCheckpoint: boolean = false): Promise<void> {
    const operation = isCheckpoint ? PersistenceOperation.CHECKPOINT : PersistenceOperation.SAVE;
    
    return this.queueOperation(async () => {
      const startTime = Date.now();
      const event: PersistenceEvent = {
        operation,
        sessionId: session.id,
        timestamp: new Date(),
        success: false
      };

      try {
        const sessionPath = this.getSessionPath(session.id);
        const tempPath = `${sessionPath}.tmp`;
        const backupPath = `${sessionPath}.backup`;

        // Ensure directory exists
        await fs.mkdir(dirname(sessionPath), { recursive: true });

        // Create backup if original exists
        if (existsSync(sessionPath)) {
          await fs.copyFile(sessionPath, backupPath);
        }

        // Write to temporary file first
        const sessionData = JSON.stringify(session, null, this.config.compressionEnabled ? 0 : 2);
        await fs.writeFile(tempPath, sessionData, 'utf8');

        // Atomic rename
        await fs.rename(tempPath, sessionPath);

        // Clean up backup after successful write
        if (existsSync(backupPath)) {
          await fs.unlink(backupPath);
        }

        const duration = Date.now() - startTime;
        const size = Buffer.byteLength(sessionData, 'utf8');

        event.success = true;
        event.duration = duration;
        event.size = size;

        this.updateStats(event);
        
        console.log(`💾 Session ${isCheckpoint ? 'checkpoint' : 'saved'}: ${session.id} (${size} bytes, ${duration}ms)`);

      } catch (error) {
        event.error = error as Error;
        this.updateStats(event);
        
        // Attempt to restore from backup
        const sessionPath = this.getSessionPath(session.id);
        const backupPath = `${sessionPath}.backup`;
        
        if (existsSync(backupPath)) {
          try {
            await fs.copyFile(backupPath, sessionPath);
            console.log(`🔄 Restored session from backup: ${session.id}`);
          } catch (restoreError) {
            console.error('❌ Failed to restore session from backup:', restoreError);
          }
        }

        throw error;
      } finally {
        this.emit('persistence-event', event);
      }
    });
  }

  /**
   * Load session with validation
   */
  async loadSession(sessionId: string): Promise<OuroborosSession | null> {
    return this.queueOperation(async () => {
      const startTime = Date.now();
      const event: PersistenceEvent = {
        operation: PersistenceOperation.LOAD,
        sessionId,
        timestamp: new Date(),
        success: false
      };

      try {
        const sessionPath = this.getSessionPath(sessionId);
        
        if (!existsSync(sessionPath)) {
          return null;
        }

        const sessionData = await fs.readFile(sessionPath, 'utf8');
        const session = JSON.parse(sessionData) as OuroborosSession;

        // Validate session structure
        if (!this.validateSession(session)) {
          throw new Error('Invalid session structure');
        }

        // Convert date strings back to Date objects
        session.created = new Date(session.created);
        session.lastActive = new Date(session.lastActive);
        session.lastSaved = new Date(session.lastSaved);
        if (session.lastCheckpoint) {
          session.lastCheckpoint = new Date(session.lastCheckpoint);
        }
        if (session.gitInfo.lastCommitDate) {
          session.gitInfo.lastCommitDate = new Date(session.gitInfo.lastCommitDate);
        }

        // Convert checkpoint dates
        session.checkpoints.forEach(checkpoint => {
          checkpoint.timestamp = new Date(checkpoint.timestamp);
        });

        // Convert agent history dates
        session.agentHistory.forEach(agent => {
          agent.activatedAt = new Date(agent.activatedAt);
        });

        const duration = Date.now() - startTime;
        const size = Buffer.byteLength(sessionData, 'utf8');

        event.success = true;
        event.duration = duration;
        event.size = size;

        this.updateStats(event);
        
        console.log(`📂 Session loaded: ${sessionId} (${size} bytes, ${duration}ms)`);
        
        return session;

      } catch (error) {
        event.error = error as Error;
        this.updateStats(event);
        
        console.error(`❌ Failed to load session ${sessionId}:`, error);
        throw error;
      } finally {
        this.emit('persistence-event', event);
      }
    });
  }

  /**
   * Delete session with cleanup
   */
  async deleteSession(sessionId: string): Promise<void> {
    return this.queueOperation(async () => {
      const startTime = Date.now();
      const event: PersistenceEvent = {
        operation: PersistenceOperation.DELETE,
        sessionId,
        timestamp: new Date(),
        success: false
      };

      try {
        const sessionPath = this.getSessionPath(sessionId);
        
        if (existsSync(sessionPath)) {
          await fs.unlink(sessionPath);
        }

        // Clean up any backup files
        const backupPath = `${sessionPath}.backup`;
        if (existsSync(backupPath)) {
          await fs.unlink(backupPath);
        }

        const duration = Date.now() - startTime;
        event.success = true;
        event.duration = duration;

        this.updateStats(event);
        
        console.log(`🗑️  Session deleted: ${sessionId} (${duration}ms)`);

      } catch (error) {
        event.error = error as Error;
        this.updateStats(event);
        throw error;
      } finally {
        this.emit('persistence-event', event);
      }
    });
  }

  /**
   * Clean up old sessions and temporary files
   */
  async performCleanup(): Promise<void> {
    return this.queueOperation(async () => {
      const startTime = Date.now();
      const event: PersistenceEvent = {
        operation: PersistenceOperation.CLEANUP,
        sessionId: 'system',
        timestamp: new Date(),
        success: false
      };

      try {
        let cleanedFiles = 0;

        // Clean up temporary files
        const baseDir = this.config.storageDirectory;
        const tempPattern = /\.tmp$/;
        const backupPattern = /\.backup$/;

        await this.cleanupFilesByPattern(baseDir, tempPattern);
        await this.cleanupFilesByPattern(baseDir, backupPattern);

        // Archive old sessions
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.config.archiveAfterDays);
        
        const allFiles = await this.getAllSessionFiles();
        for (const filePath of allFiles) {
          try {
            const stats = await fs.stat(filePath);
            if (stats.mtime < cutoffDate) {
              const session = await this.loadSessionFromPath(filePath);
              if (session && session.status !== 'active') {
                await this.archiveSession(session, filePath);
                cleanedFiles++;
              }
            }
          } catch (error) {
            console.warn(`⚠️  Failed to process file ${filePath}:`, error);
          }
        }

        const duration = Date.now() - startTime;
        event.success = true;
        event.duration = duration;

        this.updateStats(event);
        
        console.log(`🧹 Cleanup completed: ${cleanedFiles} sessions archived (${duration}ms)`);

      } catch (error) {
        event.error = error as Error;
        this.updateStats(event);
        throw error;
      } finally {
        this.emit('persistence-event', event);
      }
    });
  }

  /**
   * Get persistence statistics
   */
  getStats(): PersistenceStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      totalBytes: 0,
      averageLatency: 0,
      lastOperation: null,
      operationCounts: {
        [PersistenceOperation.SAVE]: 0,
        [PersistenceOperation.LOAD]: 0,
        [PersistenceOperation.DELETE]: 0,
        [PersistenceOperation.CHECKPOINT]: 0,
        [PersistenceOperation.CLEANUP]: 0
      },
      errorCounts: {}
    };
  }

  /**
   * Private: Queue operation for sequential processing
   */
  private async queueOperation<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.operationQueue.push(async () => {
        try {
          const result = await operation();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  /**
   * Private: Process operation queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.operationQueue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.operationQueue.length > 0) {
      const operation = this.operationQueue.shift();
      if (operation) {
        try {
          await operation();
        } catch (error) {
          console.error('❌ Operation queue error:', error);
        }
      }
    }

    this.processing = false;
  }

  /**
   * Private: Get session file path
   */
  private getSessionPath(sessionId: string): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return join(this.config.storageDirectory, String(year), month, `${sessionId}.json`);
  }

  /**
   * Private: Validate session structure
   */
  private validateSession(session: any): session is OuroborosSession {
    return session &&
           typeof session.id === 'string' &&
           typeof session.projectPath === 'string' &&
           typeof session.status === 'string' &&
           Array.isArray(session.checkpoints) &&
           typeof session.created === 'string' &&
           typeof session.lastActive === 'string';
  }

  /**
   * Private: Update statistics
   */
  private updateStats(event: PersistenceEvent): void {
    this.stats.totalOperations++;
    this.stats.operationCounts[event.operation]++;
    this.stats.lastOperation = event.timestamp;

    if (event.success) {
      this.stats.successfulOperations++;
      if (event.size) {
        this.stats.totalBytes += event.size;
      }
      if (event.duration) {
        const prevAvg = this.stats.averageLatency;
        const newCount = this.stats.successfulOperations;
        this.stats.averageLatency = (prevAvg * (newCount - 1) + event.duration) / newCount;
      }
    } else {
      this.stats.failedOperations++;
      if (event.error) {
        const errorKey = event.error.constructor.name;
        this.stats.errorCounts[errorKey] = (this.stats.errorCounts[errorKey] || 0) + 1;
      }
    }
  }

  /**
   * Private: Clean up files by pattern
   */
  private async cleanupFilesByPattern(dir: string, pattern: RegExp): Promise<void> {
    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        if (pattern.test(file)) {
          await fs.unlink(join(dir, file));
        }
      }
    } catch (error) {
      // Directory might not exist, that's okay
    }
  }

  /**
   * Private: Get all session files
   */
  private async getAllSessionFiles(): Promise<string[]> {
    const files: string[] = [];
    const baseDir = this.config.storageDirectory;

    try {
      const years = await fs.readdir(baseDir);
      for (const year of years) {
        const yearPath = join(baseDir, year);
        const yearStat = await fs.stat(yearPath);
        if (!yearStat.isDirectory()) continue;

        const months = await fs.readdir(yearPath);
        for (const month of months) {
          const monthPath = join(yearPath, month);
          const monthStat = await fs.stat(monthPath);
          if (!monthStat.isDirectory()) continue;

          const sessions = await fs.readdir(monthPath);
          for (const session of sessions) {
            if (session.endsWith('.json')) {
              files.push(join(monthPath, session));
            }
          }
        }
      }
    } catch (error) {
      // Base directory might not exist
    }

    return files;
  }

  /**
   * Private: Load session from file path
   */
  private async loadSessionFromPath(filePath: string): Promise<OuroborosSession | null> {
    try {
      const sessionData = await fs.readFile(filePath, 'utf8');
      const session = JSON.parse(sessionData) as OuroborosSession;
      return this.validateSession(session) ? session : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Private: Archive session
   */
  private async archiveSession(session: OuroborosSession, currentPath: string): Promise<void> {
    const archiveDir = join(this.config.storageDirectory, 'archive');
    await fs.mkdir(archiveDir, { recursive: true });
    
    const archivePath = join(archiveDir, `${session.id}.json`);
    await fs.rename(currentPath, archivePath);
    
    console.log(`📦 Archived session: ${session.id}`);
  }
}