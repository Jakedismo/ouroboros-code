/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { OuroborosSession, SessionStatus, SessionSearchCriteria, SessionConfig } from './types.js';

/**
 * File system storage for Ouroboros sessions
 */
export class SessionStorage {
  private baseDir: string;
  private config: SessionConfig;

  constructor(config?: Partial<SessionConfig>) {
    this.config = {
      autoSaveInterval: 30000, // 30 seconds
      checkpointInterval: 300000, // 5 minutes
      maxSessionHistory: 100,
      archiveAfterDays: 30,
      recoveryScoreThreshold: 0.3,
      maxRecoverySuggestions: 5,
      storageDirectory: join(homedir(), '.ouroboros-code', 'sessions'),
      compressionEnabled: false, // TODO: Implement compression
      trackOpenFiles: true,
      trackTerminalSessions: true,
      trackClipboard: false, // Privacy concern
      trackEnvironmentVars: true,
      excludeEnvVars: ['PATH', 'HOME', 'USER', 'PWD', 'SHELL'],
      anonymizeFiles: false,
      ...config
    };

    this.baseDir = this.config.storageDirectory;
  }

  /**
   * Initialize storage directory structure
   */
  async initialize(): Promise<void> {
    try {
      // Create base directories
      await this.ensureDirectory(this.baseDir);
      await this.ensureDirectory(join(this.baseDir, 'active'));
      await this.ensureDirectory(join(this.baseDir, 'history'));
      await this.ensureDirectory(join(this.baseDir, 'recovery'));
      await this.ensureDirectory(join(this.baseDir, 'archives'));
      
      console.log(`📁 Session storage initialized at: ${this.baseDir}`);
    } catch (error) {
      throw new Error(`Failed to initialize session storage: ${error}`);
    }
  }

  /**
   * Save a session to storage
   */
  async saveSession(session: OuroborosSession): Promise<void> {
    try {
      const sessionData = this.serializeSession(session);
      
      // Determine storage location based on status
      let filePath: string;
      if (session.status === SessionStatus.ACTIVE) {
        filePath = join(this.baseDir, 'active', `${session.projectId}.json`);
      } else {
        // Create date-based directory for history
        const dateDir = session.lastActive.toISOString().split('T')[0]; // YYYY-MM-DD
        const historyDir = join(this.baseDir, 'history', dateDir);
        await this.ensureDirectory(historyDir);
        filePath = join(historyDir, `${session.id}.json`);
      }

      await fs.writeFile(filePath, JSON.stringify(sessionData, null, 2), 'utf-8');
      
      console.log(`💾 Session saved: ${session.id} (${session.status})`);
    } catch (error) {
      console.error(`❌ Failed to save session ${session.id}:`, error);
      throw error;
    }
  }

  /**
   * Load a session from storage
   */
  async loadSession(sessionId: string): Promise<OuroborosSession | null> {
    try {
      // Search in active sessions first
      const activePath = join(this.baseDir, 'active');
      const activeFiles = await this.getFilesInDirectory(activePath);
      
      for (const file of activeFiles) {
        const sessionData = await this.loadSessionFromFile(file);
        if (sessionData && sessionData.id === sessionId) {
          return this.deserializeSession(sessionData);
        }
      }

      // Search in history
      const historyPath = join(this.baseDir, 'history');
      const historyDirs = await this.getDirectoriesInDirectory(historyPath);
      
      for (const dateDir of historyDirs) {
        const files = await this.getFilesInDirectory(join(historyPath, dateDir));
        for (const file of files) {
          if (file.includes(sessionId)) {
            const sessionData = await this.loadSessionFromFile(join(historyPath, dateDir, file));
            if (sessionData) {
              return this.deserializeSession(sessionData);
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.error(`❌ Failed to load session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Load session by project ID (for active sessions)
   */
  async loadActiveSessionByProject(projectId: string): Promise<OuroborosSession | null> {
    try {
      const filePath = join(this.baseDir, 'active', `${projectId}.json`);
      
      if (!existsSync(filePath)) {
        return null;
      }

      const sessionData = await this.loadSessionFromFile(filePath);
      return sessionData ? this.deserializeSession(sessionData) : null;
    } catch (error) {
      console.error(`❌ Failed to load active session for project ${projectId}:`, error);
      return null;
    }
  }

  /**
   * Search sessions based on criteria
   */
  async searchSessions(criteria: SessionSearchCriteria): Promise<OuroborosSession[]> {
    const sessions: OuroborosSession[] = [];
    
    try {
      // Search active sessions
      if (!criteria.status || criteria.status === SessionStatus.ACTIVE) {
        const activeSessions = await this.loadActiveSessions();
        sessions.push(...activeSessions);
      }

      // Search history if not specifically looking for active only
      if (!criteria.status || criteria.status !== SessionStatus.ACTIVE) {
        const historicalSessions = await this.loadHistoricalSessions(criteria);
        sessions.push(...historicalSessions);
      }

      // Apply filters
      return this.filterSessions(sessions, criteria);
    } catch (error) {
      console.error('❌ Failed to search sessions:', error);
      return [];
    }
  }

  /**
   * Get sessions for a specific project path
   */
  async getSessionsForProject(projectPath: string, limit: number = 10): Promise<OuroborosSession[]> {
    const criteria: SessionSearchCriteria = {
      projectPath
    };
    
    const sessions = await this.searchSessions(criteria);
    
    // Sort by last active (most recent first)
    return sessions
      .sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime())
      .slice(0, limit);
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      // Try to find and delete from active
      const activeFiles = await this.getFilesInDirectory(join(this.baseDir, 'active'));
      
      for (const file of activeFiles) {
        const sessionData = await this.loadSessionFromFile(join(this.baseDir, 'active', file));
        if (sessionData && sessionData.id === sessionId) {
          await fs.unlink(join(this.baseDir, 'active', file));
          console.log(`🗑️  Deleted active session: ${sessionId}`);
          return true;
        }
      }

      // Try to find and delete from history
      const historyPath = join(this.baseDir, 'history');
      const historyDirs = await this.getDirectoriesInDirectory(historyPath);
      
      for (const dateDir of historyDirs) {
        const files = await this.getFilesInDirectory(join(historyPath, dateDir));
        for (const file of files) {
          if (file.includes(sessionId)) {
            await fs.unlink(join(historyPath, dateDir, file));
            console.log(`🗑️  Deleted historical session: ${sessionId}`);
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      console.error(`❌ Failed to delete session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Archive old sessions
   */
  async archiveOldSessions(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.archiveAfterDays);
    
    let archivedCount = 0;
    
    try {
      const historyPath = join(this.baseDir, 'history');
      const historyDirs = await this.getDirectoriesInDirectory(historyPath);
      
      for (const dateDir of historyDirs) {
        const dirDate = new Date(dateDir);
        if (dirDate < cutoffDate) {
          const sourcePath = join(historyPath, dateDir);
          const archivePath = join(this.baseDir, 'archives', dateDir);
          
          await this.ensureDirectory(dirname(archivePath));
          await fs.rename(sourcePath, archivePath);
          
          // Count files in archived directory
          const archivedFiles = await this.getFilesInDirectory(archivePath);
          archivedCount += archivedFiles.length;
          
          console.log(`📦 Archived ${archivedFiles.length} sessions from ${dateDir}`);
        }
      }
    } catch (error) {
      console.error('❌ Failed to archive sessions:', error);
    }

    return archivedCount;
  }

  /**
   * Get storage statistics
   */
  async getStorageStatistics(): Promise<{
    activeSessions: number;
    historicalSessions: number;
    archivedSessions: number;
    totalSize: number;
    oldestSession?: Date;
    newestSession?: Date;
  }> {
    try {
      const stats = {
        activeSessions: 0,
        historicalSessions: 0,
        archivedSessions: 0,
        totalSize: 0,
        oldestSession: undefined as Date | undefined,
        newestSession: undefined as Date | undefined
      };

      // Count active sessions
      const activeFiles = await this.getFilesInDirectory(join(this.baseDir, 'active'));
      stats.activeSessions = activeFiles.length;

      // Count historical sessions
      const historyPath = join(this.baseDir, 'history');
      if (existsSync(historyPath)) {
        const historyDirs = await this.getDirectoriesInDirectory(historyPath);
        for (const dateDir of historyDirs) {
          const files = await this.getFilesInDirectory(join(historyPath, dateDir));
          stats.historicalSessions += files.length;
          
          // Track oldest/newest dates
          const date = new Date(dateDir);
          if (!stats.oldestSession || date < stats.oldestSession) {
            stats.oldestSession = date;
          }
          if (!stats.newestSession || date > stats.newestSession) {
            stats.newestSession = date;
          }
        }
      }

      // Count archived sessions
      const archivePath = join(this.baseDir, 'archives');
      if (existsSync(archivePath)) {
        const archiveDirs = await this.getDirectoriesInDirectory(archivePath);
        for (const dateDir of archiveDirs) {
          const files = await this.getFilesInDirectory(join(archivePath, dateDir));
          stats.archivedSessions += files.length;
        }
      }

      // Calculate total size (simplified - just count files)
      stats.totalSize = stats.activeSessions + stats.historicalSessions + stats.archivedSessions;

      return stats;
    } catch (error) {
      console.error('❌ Failed to get storage statistics:', error);
      return {
        activeSessions: 0,
        historicalSessions: 0,
        archivedSessions: 0,
        totalSize: 0
      };
    }
  }

  /**
   * Cleanup storage based on config limits
   */
  async cleanup(): Promise<void> {
    try {
      // Archive old sessions first
      await this.archiveOldSessions();
      
      // If we still have too many sessions, delete oldest archived ones
      const stats = await this.getStorageStatistics();
      const totalSessions = stats.activeSessions + stats.historicalSessions;
      
      if (totalSessions > this.config.maxSessionHistory) {
        // TODO: Implement oldest session deletion
        console.log(`📊 Session count (${totalSessions}) exceeds limit (${this.config.maxSessionHistory})`);
      }
      
      console.log('🧹 Session storage cleanup completed');
    } catch (error) {
      console.error('❌ Failed to cleanup session storage:', error);
    }
  }

  /**
   * Private: Serialize session for storage
   */
  private serializeSession(session: OuroborosSession): any {
    // Create a copy to avoid modifying original
    const serialized = JSON.parse(JSON.stringify(session));
    
    // Add serialization metadata
    serialized._serialized = {
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
    
    return serialized;
  }

  /**
   * Private: Deserialize session from storage
   */
  private deserializeSession(data: any): OuroborosSession {
    // Convert date strings back to Date objects
    const session = { ...data };
    
    session.created = new Date(data.created);
    session.lastActive = new Date(data.lastActive);
    session.lastSaved = new Date(data.lastSaved);
    
    if (data.gitInfo?.lastCommitDate) {
      session.gitInfo.lastCommitDate = new Date(data.gitInfo.lastCommitDate);
    }
    
    // Convert checkpoints
    if (session.checkpoints) {
      session.checkpoints = session.checkpoints.map((cp: any) => ({
        ...cp,
        timestamp: new Date(cp.timestamp)
      }));
    }
    
    // Convert agent history
    if (session.agentHistory) {
      session.agentHistory = session.agentHistory.map((ah: any) => ({
        ...ah,
        activatedAt: new Date(ah.activatedAt)
      }));
    }

    // Convert failed workflows timestamps
    if (session.failedWorkflows) {
      session.failedWorkflows = session.failedWorkflows.map((fw: any) => ({
        ...fw,
        timestamp: new Date(fw.timestamp)
      }));
    }

    // Remove serialization metadata
    delete session._serialized;
    
    return session;
  }

  /**
   * Private: Load session data from file
   */
  private async loadSessionFromFile(filePath: string): Promise<any | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.warn(`⚠️  Failed to load session file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Private: Load all active sessions
   */
  private async loadActiveSessions(): Promise<OuroborosSession[]> {
    const sessions: OuroborosSession[] = [];
    const activeDir = join(this.baseDir, 'active');
    
    if (!existsSync(activeDir)) {
      return sessions;
    }

    const files = await this.getFilesInDirectory(activeDir);
    
    for (const file of files) {
      const sessionData = await this.loadSessionFromFile(join(activeDir, file));
      if (sessionData) {
        sessions.push(this.deserializeSession(sessionData));
      }
    }
    
    return sessions;
  }

  /**
   * Private: Load historical sessions based on criteria
   */
  private async loadHistoricalSessions(criteria: SessionSearchCriteria): Promise<OuroborosSession[]> {
    const sessions: OuroborosSession[] = [];
    const historyDir = join(this.baseDir, 'history');
    
    if (!existsSync(historyDir)) {
      return sessions;
    }

    const dateDirs = await this.getDirectoriesInDirectory(historyDir);
    
    for (const dateDir of dateDirs) {
      // Skip if outside date range
      if (criteria.dateRange) {
        const date = new Date(dateDir);
        if (date < criteria.dateRange.from || date > criteria.dateRange.to) {
          continue;
        }
      }

      const files = await this.getFilesInDirectory(join(historyDir, dateDir));
      
      for (const file of files) {
        const sessionData = await this.loadSessionFromFile(join(historyDir, dateDir, file));
        if (sessionData) {
          sessions.push(this.deserializeSession(sessionData));
        }
      }
    }
    
    return sessions;
  }

  /**
   * Private: Filter sessions based on criteria
   */
  private filterSessions(sessions: OuroborosSession[], criteria: SessionSearchCriteria): OuroborosSession[] {
    return sessions.filter(session => {
      // Project path filter
      if (criteria.projectPath && session.projectPath !== criteria.projectPath) {
        return false;
      }

      // Git commit hash filter
      if (criteria.gitCommitHash && session.gitInfo.commitHash !== criteria.gitCommitHash) {
        return false;
      }

      // Git branch filter
      if (criteria.gitBranch && session.gitInfo.branch !== criteria.gitBranch) {
        return false;
      }

      // Agent filter
      if (criteria.agentId && session.activeAgent !== criteria.agentId) {
        return false;
      }

      // Status filter
      if (criteria.status && session.status !== criteria.status) {
        return false;
      }

      // Active workflows filter
      if (criteria.hasActiveWorkflows !== undefined) {
        const hasActive = session.activeWorkflows.length > 0;
        if (criteria.hasActiveWorkflows !== hasActive) {
          return false;
        }
      }

      // Minimum duration filter
      if (criteria.minDuration && session.totalDuration < criteria.minDuration) {
        return false;
      }

      // Tags filter
      if (criteria.tags && criteria.tags.length > 0) {
        const sessionTags = session.metadata.tags || [];
        const hasMatchingTag = criteria.tags.some(tag => sessionTags.includes(tag));
        if (!hasMatchingTag) {
          return false;
        }
      }

      // Text search filter
      if (criteria.textSearch) {
        const searchTerm = criteria.textSearch.toLowerCase();
        const searchableText = [
          session.sessionName || '',
          session.metadata.notes || '',
          session.activeAgent,
          session.gitInfo.branch,
          session.gitInfo.lastCommitMessage || ''
        ].join(' ').toLowerCase();
        
        if (!searchableText.includes(searchTerm)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Private: Ensure directory exists
   */
  private async ensureDirectory(dirPath: string): Promise<void> {
    if (!existsSync(dirPath)) {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * Private: Get files in directory
   */
  private async getFilesInDirectory(dirPath: string): Promise<string[]> {
    if (!existsSync(dirPath)) {
      return [];
    }

    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .map(entry => entry.name);
  }

  /**
   * Private: Get directories in directory
   */
  private async getDirectoriesInDirectory(dirPath: string): Promise<string[]> {
    if (!existsSync(dirPath)) {
      return [];
    }

    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  }
}