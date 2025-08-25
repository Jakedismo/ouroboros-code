/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { 
  OuroborosSession, 
  SessionStatus, 
  SessionCheckpoint, 
  SessionRecoveryOptions,
  SessionRecoveryInfo,
  SessionStatistics,
  EnvironmentContext,
  SessionConfig
} from './types.js';
import { SessionStorage } from './session-storage.js';
import { SessionPersistence } from './session-persistence.js';
import { AutoCheckpoint } from './auto-checkpoint.js';
import { GitInfoExtractor } from './git-info.js';
import { getCommandExecutionTracker } from '../workflow/monitoring/command-execution-tracker.js';

/**
 * Core session management system
 */
export class SessionManager extends EventEmitter {
  private storage: SessionStorage;
  private persistence: SessionPersistence;
  private autoCheckpoint: AutoCheckpoint;
  private currentSession: OuroborosSession | null = null;
  private autoSaveInterval: NodeJS.Timeout | null = null;
  private config: SessionConfig;

  constructor(config?: Partial<SessionConfig>) {
    super();
    
    this.config = {
      autoSaveInterval: 30000, // 30 seconds
      checkpointInterval: 300000, // 5 minutes
      maxSessionHistory: 100,
      archiveAfterDays: 30,
      recoveryScoreThreshold: 0.3,
      maxRecoverySuggestions: 5,
      storageDirectory: require('path').join(require('os').homedir(), '.ouroboros-code', 'sessions'),
      compressionEnabled: false,
      trackOpenFiles: true,
      trackTerminalSessions: true,
      trackClipboard: false,
      trackEnvironmentVars: true,
      excludeEnvVars: ['PATH', 'HOME', 'USER', 'PWD', 'SHELL'],
      anonymizeFiles: false,
      ...config
    };

    this.storage = new SessionStorage(this.config);
    this.persistence = new SessionPersistence(this.config);
    this.autoCheckpoint = new AutoCheckpoint(this.persistence, this.config);
  }

  /**
   * Initialize session manager
   */
  async initialize(): Promise<void> {
    await this.storage.initialize();
    
    // Setup auto-checkpoint event listeners
    this.setupAutoCheckpointListeners();
    
    // Setup cleanup on process exit
    process.on('beforeExit', () => this.handleProcessExit('normal'));
    process.on('SIGINT', () => this.handleProcessExit('sigint'));
    process.on('SIGTERM', () => this.handleProcessExit('sigterm'));
    process.on('uncaughtException', (error) => {
      console.error('💥 Uncaught exception:', error);
      this.handleProcessExit('crash');
    });

    console.log('📊 Session manager initialized with enhanced persistence and auto-checkpointing');
  }

  /**
   * Start a new session or resume existing one
   */
  async startSession(projectPath?: string, options?: {
    sessionName?: string;
    forceNew?: boolean;
    agentId?: string;
  }): Promise<OuroborosSession> {
    const workingPath = projectPath || process.cwd();
    
    try {
      // Check for existing active session first
      if (!options?.forceNew) {
        const existingSession = await this.findActiveSession(workingPath);
        if (existingSession) {
          console.log(`🔄 Resuming existing session: ${existingSession.id}`);
          return await this.resumeSession(existingSession);
        }
      }

      // Create new session
      const session = await this.createNewSession(workingPath, options);
      
      this.currentSession = session;
      this.startAutoSave();
      this.autoCheckpoint.start(session);
      
      this.emit('session-created', session);
      
      console.log(`🚀 Started new session: ${session.id}`);
      console.log(`📂 Project: ${session.projectPath}`);
      console.log(`🌳 Git: ${session.gitInfo ? GitInfoExtractor.getGitStatusSummary(session.gitInfo) : 'not a git repo'}`);
      console.log(`🤖 Agent: ${session.activeAgent}`);
      
      return session;
      
    } catch (error) {
      console.error('❌ Failed to start session:', error);
      throw error;
    }
  }

  /**
   * Find and suggest sessions for recovery
   */
  async findRecoverySessions(projectPath?: string): Promise<OuroborosSession[]> {
    const workingPath = projectPath || process.cwd();
    
    try {
      // Get git info for scoring
      const currentGit = await GitInfoExtractor.getGitInfo(workingPath);
      
      // Find sessions for this project
      const sessions = await this.storage.getSessionsForProject(workingPath, 20);
      
      // Calculate recovery scores
      const scoredSessions = sessions.map(session => {
        const recoveryInfo = this.calculateRecoveryInfo(session, workingPath, currentGit);
        return {
          ...session,
          recovery: recoveryInfo
        };
      });

      // Filter by minimum score and sort
      const recoverySessions = scoredSessions
        .filter(session => session.recovery.score >= this.config.recoveryScoreThreshold)
        .sort((a, b) => b.recovery.score - a.recovery.score)
        .slice(0, this.config.maxRecoverySuggestions);

      if (recoverySessions.length > 0) {
        this.emit('recovery-available', recoverySessions);
      }

      return recoverySessions;
      
    } catch (error) {
      console.error('❌ Failed to find recovery sessions:', error);
      return [];
    }
  }

  /**
   * Recover from a previous session
   */
  async recoverSession(
    sessionId: string, 
    options: SessionRecoveryOptions = {
      restoreWorkflows: true,
      restoreAgent: true,
      restoreEnvironment: false,
      restoreOpenFiles: false,
      restoreTerminalSessions: false,
      restoreClipboard: false
    }
  ): Promise<OuroborosSession> {
    try {
      const session = await this.storage.loadSession(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // Validate recovery is possible
      const recoveryValidation = await this.validateRecovery(session, options);
      if (!recoveryValidation.canRecover && !options.forceRecovery) {
        throw new Error(`Cannot recover session: ${recoveryValidation.reasons.join(', ')}`);
      }

      // Create new session based on recovered one
      const recoveredSession = await this.createRecoveredSession(session, options);
      
      this.currentSession = recoveredSession;
      this.startAutoSave();
      this.autoCheckpoint.start(recoveredSession);
      
      this.emit('session-restored', recoveredSession);
      
      console.log(`🔄 Recovered session: ${sessionId}`);
      console.log(`📊 Restored: ${options.restoreWorkflows ? 'workflows' : 'no workflows'}, agent: ${options.restoreAgent ? session.activeAgent : 'default'}`);
      
      return recoveredSession;
      
    } catch (error) {
      console.error(`❌ Failed to recover session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Suspend current session
   */
  async suspendSession(reason?: string): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    try {
      this.currentSession.status = SessionStatus.SUSPENDED;
      this.currentSession.exitReason = reason || 'user_suspended';
      this.currentSession.lastActive = new Date();
      
      await this.createCheckpoint('manual', 'Session suspended by user');
      await this.persistence.saveSession(this.currentSession);
      
      this.stopAutoSave();
      this.autoCheckpoint.stop();
      
      this.emit('session-suspended', this.currentSession);
      
      console.log(`⏸️  Session suspended: ${this.currentSession.id}`);
      
    } catch (error) {
      console.error('❌ Failed to suspend session:', error);
      throw error;
    }
  }

  /**
   * End current session
   */
  async endSession(reason: string = 'user_ended'): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    try {
      this.currentSession.status = SessionStatus.COMPLETED;
      this.currentSession.exitReason = reason;
      this.currentSession.lastActive = new Date();
      
      // Final save
      await this.persistence.saveSession(this.currentSession);
      
      this.stopAutoSave();
      this.autoCheckpoint.stop();
      
      this.emit('session-ended', this.currentSession, reason);
      
      console.log(`✅ Session ended: ${this.currentSession.id} (${reason})`);
      
      this.currentSession = null;
      
    } catch (error) {
      console.error('❌ Failed to end session:', error);
      throw error;
    }
  }

  /**
   * Get current session
   */
  getCurrentSession(): OuroborosSession | null {
    return this.currentSession;
  }

  /**
   * Create manual checkpoint
   */
  async createManualCheckpoint(description: string): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    await this.createCheckpoint('manual', description);
    console.log(`📍 Manual checkpoint created: ${description}`);
  }

  /**
   * Record command execution (for auto-checkpointing)
   */
  recordCommand(): void {
    this.autoCheckpoint.recordCommand();
  }

  /**
   * Record user activity (resets idle timers)
   */
  recordActivity(): void {
    this.autoCheckpoint.recordActivity();
  }

  /**
   * Record workflow milestone
   */
  recordWorkflowMilestone(workflowId: string, milestone: string): void {
    this.autoCheckpoint.recordWorkflowMilestone(workflowId, milestone);
  }

  /**
   * Record agent switch
   */
  recordAgentSwitch(fromAgent: string, toAgent: string): void {
    this.autoCheckpoint.recordAgentSwitch(fromAgent, toAgent);
  }

  /**
   * Record error for recovery checkpointing
   */
  recordError(error: Error, context?: string): void {
    this.autoCheckpoint.recordError(error, context);
  }

  /**
   * Get enhanced session statistics including persistence and checkpointing
   */
  getEnhancedStats(): {
    session: SessionStatistics;
    persistence: any;
    checkpointing: any;
  } {
    return {
      session: this.getSessionStatistics() as any,
      persistence: this.persistence.getStats(),
      checkpointing: this.autoCheckpoint.getStats()
    };
  }

  /**
   * Get session statistics
   */
  async getSessionStatistics(): Promise<SessionStatistics> {
    try {
      const allSessions = await this.storage.searchSessions({});
      
      const stats: SessionStatistics = {
        totalSessions: allSessions.length,
        activeSessions: allSessions.filter(s => s.status === SessionStatus.ACTIVE).length,
        averageSessionDuration: 0,
        totalProjectTime: {},
        agentUsage: {},
        workflowSuccess: {
          total: 0,
          completed: 0,
          failed: 0,
          successRate: 0
        },
        productivity: {
          commandsPerHour: 0,
          workflowsPerSession: 0,
          averageErrorRate: 0
        },
        timeTracking: {
          mostActiveHours: [],
          mostActiveWeekdays: [],
          longestSession: 0,
          shortestSession: Infinity
        }
      };

      if (allSessions.length === 0) {
        return stats;
      }

      // Calculate basic stats
      let totalDuration = 0;
      let totalCommands = 0;
      let totalWorkflows = 0;
      let totalErrors = 0;

      for (const session of allSessions) {
        totalDuration += session.totalDuration;
        totalCommands += session.statistics.commandsExecuted;
        totalWorkflows += session.statistics.workflowsCompleted;
        totalErrors += session.statistics.errorsEncountered;

        // Project time tracking
        const projectKey = session.projectPath;
        stats.totalProjectTime[projectKey] = (stats.totalProjectTime[projectKey] || 0) + session.totalDuration;

        // Agent usage tracking
        const agentKey = session.activeAgent;
        stats.agentUsage[agentKey] = (stats.agentUsage[agentKey] || 0) + session.totalDuration;

        // Session duration tracking
        if (session.totalDuration > stats.timeTracking.longestSession) {
          stats.timeTracking.longestSession = session.totalDuration;
        }
        if (session.totalDuration < stats.timeTracking.shortestSession) {
          stats.timeTracking.shortestSession = session.totalDuration;
        }

        // Workflow success tracking
        stats.workflowSuccess.total += session.activeWorkflows.length + session.completedWorkflows.length + session.failedWorkflows.length;
        stats.workflowSuccess.completed += session.completedWorkflows.length;
        stats.workflowSuccess.failed += session.failedWorkflows.length;
      }

      // Calculate derived stats
      stats.averageSessionDuration = totalDuration / allSessions.length;
      stats.workflowSuccess.successRate = stats.workflowSuccess.total > 0 
        ? stats.workflowSuccess.completed / stats.workflowSuccess.total 
        : 0;

      const totalHours = totalDuration / (1000 * 60 * 60);
      stats.productivity.commandsPerHour = totalHours > 0 ? totalCommands / totalHours : 0;
      stats.productivity.workflowsPerSession = totalWorkflows / allSessions.length;
      stats.productivity.averageErrorRate = totalCommands > 0 ? totalErrors / totalCommands : 0;

      return stats;
      
    } catch (error) {
      console.error('❌ Failed to get session statistics:', error);
      throw error;
    }
  }

  /**
   * Private: Create a new session
   */
  private async createNewSession(
    projectPath: string, 
    options?: { sessionName?: string; agentId?: string }
  ): Promise<OuroborosSession> {
    const gitInfo = await GitInfoExtractor.getGitInfo(projectPath);
    const projectId = GitInfoExtractor.generateProjectId(projectPath, gitInfo || undefined);
    const environment = this.captureEnvironmentContext();
    
    // Get session number for this project
    const existingSessions = await this.storage.getSessionsForProject(projectPath);
    const sessionNumber = existingSessions.length + 1;

    const session: OuroborosSession = {
      id: randomUUID(),
      projectId,
      projectPath,
      sessionName: options?.sessionName,
      gitInfo: gitInfo || {
        commitHash: 'unknown',
        shortHash: 'unknown',
        branch: 'unknown',
        isDirty: false,
        uncommittedFiles: []
      },
      created: new Date(),
      lastActive: new Date(),
      lastSaved: new Date(),
      totalDuration: 0,
      sessionNumber,
      status: SessionStatus.ACTIVE,
      activeAgent: options?.agentId || 'default',
      agentHistory: [{
        agentId: options?.agentId || 'default',
        activatedAt: new Date(),
        duration: 0
      }],
      environment,
      activeWorkflows: [],
      completedWorkflows: [],
      failedWorkflows: [],
      commandHistory: [],
      checkpoints: [],
      openFiles: [],
      terminalSessions: [],
      statistics: {
        commandsExecuted: 0,
        workflowsCompleted: 0,
        errorsEncountered: 0,
        averageCommandTime: 0,
        mostUsedAgent: options?.agentId || 'default',
        productivityScore: 0
      },
      recovery: {
        canRecover: true,
        score: 1.0,
        factors: {
          gitMatch: true,
          branchMatch: true,
          pathMatch: true,
          recentActivity: true,
          workflowsInProgress: 0,
          agentCompatibility: true
        },
        recommendations: [],
        warnings: []
      },
      metadata: {
        version: '1.0.0',
        ouroborosVersion: '1.0.0-beta.2',
        platform: process.platform,
        nodeVersion: process.version
      }
    };

    await this.persistence.saveSession(session);
    return session;
  }

  /**
   * Private: Resume existing session
   */
  private async resumeSession(session: OuroborosSession): Promise<OuroborosSession> {
    session.lastActive = new Date();
    session.status = SessionStatus.ACTIVE;
    
    this.currentSession = session;
    this.startAutoSave();
    this.autoCheckpoint.start(session);
    
    this.emit('session-resumed', session);
    
    return session;
  }

  /**
   * Private: Find active session for project
   */
  private async findActiveSession(projectPath: string): Promise<OuroborosSession | null> {
    const gitInfo = await GitInfoExtractor.getGitInfo(projectPath);
    const projectId = GitInfoExtractor.generateProjectId(projectPath, gitInfo || undefined);
    
    return await this.storage.loadActiveSessionByProject(projectId);
  }

  /**
   * Private: Calculate recovery information
   */
  private calculateRecoveryInfo(
    session: OuroborosSession, 
    currentPath: string, 
    currentGit: any
  ): SessionRecoveryInfo {
    const factors = {
      gitMatch: false,
      branchMatch: false,
      pathMatch: session.projectPath === currentPath,
      recentActivity: false,
      workflowsInProgress: session.activeWorkflows.length,
      agentCompatibility: true // TODO: Check if agent still exists
    };

    let score = 0;

    // Path match (required)
    if (factors.pathMatch) {
      score += 0.3;
    } else {
      return {
        canRecover: false,
        score: 0,
        factors,
        recommendations: [],
        warnings: ['Different project path']
      };
    }

    // Git match
    if (currentGit) {
      const gitScore = GitInfoExtractor.calculateGitRelevanceScore(session.gitInfo, currentGit);
      factors.gitMatch = gitScore > 0.5;
      factors.branchMatch = session.gitInfo.branch === currentGit.branch;
      score += gitScore * 0.4;
    }

    // Recent activity
    const hoursAgo = (Date.now() - session.lastActive.getTime()) / (1000 * 60 * 60);
    factors.recentActivity = hoursAgo < 24; // Active within last 24 hours
    if (factors.recentActivity) {
      score += 0.2 * Math.max(0, 1 - hoursAgo / 24);
    }

    // Active workflows bonus
    if (factors.workflowsInProgress > 0) {
      score += 0.1;
    }

    const recommendations: string[] = [];
    const warnings: string[] = [];

    if (!factors.gitMatch && currentGit) {
      warnings.push(`Git state changed (${session.gitInfo.shortHash} → ${currentGit.shortHash})`);
    }

    if (!factors.recentActivity) {
      warnings.push(`Last active ${Math.round(hoursAgo)} hours ago`);
    }

    if (factors.workflowsInProgress > 0) {
      recommendations.push(`${factors.workflowsInProgress} workflows in progress can be resumed`);
    }

    return {
      canRecover: score > 0.1, // Very permissive - let user decide
      score: Math.min(score, 1.0),
      factors,
      recommendations,
      warnings
    };
  }

  /**
   * Private: Create recovered session
   */
  private async createRecoveredSession(
    originalSession: OuroborosSession,
    options: SessionRecoveryOptions
  ): Promise<OuroborosSession> {
    const newSession = await this.createNewSession(originalSession.projectPath, {
      sessionName: `Recovered from ${originalSession.id.substring(0, 8)}`,
      agentId: options.restoreAgent ? originalSession.activeAgent : undefined
    });

    // Restore workflows if requested
    if (options.restoreWorkflows) {
      newSession.activeWorkflows = originalSession.activeWorkflows;
      newSession.completedWorkflows = originalSession.completedWorkflows;
    }

    // Restore other context as requested
    if (options.restoreEnvironment) {
      newSession.environment = originalSession.environment;
    }

    if (options.restoreOpenFiles) {
      newSession.openFiles = originalSession.openFiles;
    }

    if (options.restoreTerminalSessions) {
      newSession.terminalSessions = originalSession.terminalSessions;
    }

    if (options.restoreClipboard) {
      newSession.clipboardContext = originalSession.clipboardContext;
    }

    return newSession;
  }

  /**
   * Private: Validate recovery is possible
   */
  private async validateRecovery(
    session: OuroborosSession,
    options: SessionRecoveryOptions
  ): Promise<{ canRecover: boolean; reasons: string[] }> {
    const reasons: string[] = [];

    // Check if project path still exists
    const fs = require('fs');
    if (!fs.existsSync(session.projectPath)) {
      reasons.push('Project path no longer exists');
    }

    // Check git compatibility if workflows are being restored
    if (options.restoreWorkflows && session.activeWorkflows.length > 0) {
      const currentGit = await GitInfoExtractor.getGitInfo(session.projectPath);
      if (currentGit) {
        const compatibility = GitInfoExtractor.areGitStatesCompatible(
          session.gitInfo,
          currentGit,
          { allowBranchSwitch: true, allowCommitAdvance: true }
        );
        if (!compatibility.compatible && !options.skipStepValidation) {
          reasons.push(...compatibility.reasons);
        }
      }
    }

    return {
      canRecover: reasons.length === 0,
      reasons
    };
  }

  /**
   * Private: Capture environment context
   */
  private captureEnvironmentContext(): EnvironmentContext {
    const env = process.env;
    const filteredEnv: Record<string, string> = {};
    
    // Filter out excluded environment variables
    Object.keys(env).forEach(key => {
      if (!this.config.excludeEnvVars.includes(key) && env[key]) {
        filteredEnv[key] = env[key]!;
      }
    });

    return {
      cwd: process.cwd(),
      platform: process.platform,
      nodeVersion: process.version,
      envVars: filteredEnv,
      pathDirectories: (env['PATH'] || '').split(':').filter(Boolean)
    };
  }

  /**
   * Private: Create checkpoint
   */
  private async createCheckpoint(
    type: 'auto' | 'manual' | 'workflow' | 'agent-switch',
    description: string,
    workflowId?: string,
    stepId?: string
  ): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    const commandTracker = getCommandExecutionTracker();

    const checkpoint: SessionCheckpoint = {
      id: randomUUID(),
      timestamp: new Date(),
      type,
      workflowId,
      stepId,
      description,
      state: {
        activeWorkflows: this.currentSession.activeWorkflows.map(w => w.workflowId),
        completedWorkflows: this.currentSession.completedWorkflows,
        failedWorkflows: this.currentSession.failedWorkflows.map(f => f.workflowId),
        lastCommand: commandTracker.getExecutionHistory(1)[0],
        memoryUsage: process.memoryUsage()
      }
    };

    this.currentSession.checkpoints.push(checkpoint);
    this.currentSession.lastCheckpoint = new Date();

    // Keep only last 20 checkpoints
    if (this.currentSession.checkpoints.length > 20) {
      this.currentSession.checkpoints = this.currentSession.checkpoints.slice(-20);
    }

    this.emit('checkpoint-created', this.currentSession, checkpoint);

    if (type === 'manual') {
      await this.persistence.saveSession(this.currentSession);
    }
  }

  /**
   * Private: Setup auto-checkpoint event listeners
   */
  private setupAutoCheckpointListeners(): void {
    // Listen to persistence events for logging
    this.persistence.on('persistence-event', (event) => {
      if (!event.success) {
        console.error(`❌ Persistence ${event.operation} failed for ${event.sessionId}:`, event.error);
      }
    });

    // Listen to checkpoint events
    this.autoCheckpoint.on('checkpoint-created', (event) => {
      console.log(`📍 Auto-checkpoint: ${event.trigger} (${event.duration}ms)`);
      if (this.currentSession) {
        this.emit('checkpoint-created', this.currentSession, {
          id: event.checkpointId,
          timestamp: event.timestamp,
          type: 'auto',
          description: `Auto-checkpoint: ${event.trigger}`,
          state: { activeWorkflows: [], completedWorkflows: [], failedWorkflows: [] }
        });
      }
    });

    this.autoCheckpoint.on('checkpoint-failed', (event, error) => {
      console.error(`❌ Auto-checkpoint failed: ${event.trigger}`, error);
    });
  }

  /**
   * Private: Start auto-save
   */
  private startAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }

    this.autoSaveInterval = setInterval(async () => {
      if (this.currentSession) {
        this.currentSession.lastActive = new Date();
        this.currentSession.lastSaved = new Date();
        try {
          await this.persistence.saveSession(this.currentSession);
          this.emit('auto-save', this.currentSession);
        } catch (error) {
          console.error('❌ Auto-save failed:', error);
        }
      }
    }, this.config.autoSaveInterval);
  }

  /**
   * Private: Stop auto-save
   */
  private stopAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }


  /**
   * Private: Handle process exit
   */
  private async handleProcessExit(reason: string): Promise<void> {
    if (this.currentSession) {
      try {
        if (reason === 'crash') {
          this.currentSession.status = SessionStatus.CRASHED;
        } else {
          this.currentSession.status = SessionStatus.COMPLETED;
        }
        
        this.currentSession.exitReason = reason;
        this.currentSession.lastActive = new Date();
        
        await this.persistence.saveSession(this.currentSession);
        
        this.stopAutoSave();
        this.autoCheckpoint.stop();
        
        console.log(`💾 Session saved on exit: ${reason}`);
      } catch (error) {
        console.error('❌ Failed to save session on exit:', error);
      }
    }
  }
}

/**
 * Global session manager instance
 */
let globalSessionManager: SessionManager | null = null;

/**
 * Get the global session manager instance
 */
export function getSessionManager(): SessionManager {
  if (!globalSessionManager) {
    globalSessionManager = new SessionManager();
  }
  return globalSessionManager;
}

/**
 * Initialize session management system
 */
export async function initializeSessionManager(config?: Partial<SessionConfig>): Promise<SessionManager> {
  const manager = new SessionManager(config);
  await manager.initialize();
  
  globalSessionManager = manager;
  
  console.log('📊 Session management system initialized');
  return manager;
}