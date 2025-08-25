/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { getSessionManager } from './session-manager.js';
import { getWorkflowSessionIntegration } from './workflow-session-integration.js';
import { getAgentSessionIntegration } from './agent-session-integration.js';
import { OuroborosSession, SessionStatus } from './types.js';

/**
 * Comprehensive session integration events
 */
export interface SessionIntegrationEvents {
  'integration-initialized': () => void;
  'session-fully-integrated': (sessionId: string) => void;
  'integration-health-check': (health: IntegrationHealth) => void;
  'cross-system-sync-completed': (sessionId: string) => void;
}

/**
 * Integration health status
 */
export interface IntegrationHealth {
  sessionManager: boolean;
  workflowIntegration: boolean;
  agentIntegration: boolean;
  overallHealth: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: Date;
  issues: string[];
}

/**
 * Master integration manager for all session-related systems
 */
export class SessionIntegrationManager extends EventEmitter {
  private sessionManager = getSessionManager();
  private workflowIntegration = getWorkflowSessionIntegration();
  private agentIntegration = getAgentSessionIntegration();
  private isInitialized = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private syncInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize all integration systems
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    console.log('🔧 Initializing comprehensive session integration...');

    try {
      // Initialize session manager first
      await this.sessionManager.initialize();

      // Initialize workflow integration
      await this.workflowIntegration.initialize();

      // Initialize agent integration
      await this.agentIntegration.initialize();

      // Setup cross-system event listeners
      this.setupCrossSystemListeners();

      // Start health monitoring
      this.startHealthMonitoring();

      // Start periodic sync
      this.startPeriodicSync();

      this.isInitialized = true;
      this.emit('integration-initialized');

      console.log('✅ Session integration system fully initialized');
      console.log('   🔄 Workflow integration: active');
      console.log('   🤖 Agent integration: active');
      console.log('   📊 Health monitoring: active');
      console.log('   🔄 Periodic sync: active');

    } catch (error) {
      console.error('❌ Failed to initialize session integration:', error);
      throw error;
    }
  }

  /**
   * Start a new integrated session
   */
  async startIntegratedSession(options: {
    projectPath?: string;
    sessionName?: string;
    agentId?: string;
    forceNew?: boolean;
  } = {}): Promise<OuroborosSession> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    console.log('🚀 Starting integrated session...');

    // Start the session
    const session = await this.sessionManager.startSession(options.projectPath, {
      sessionName: options.sessionName,
      agentId: options.agentId,
      forceNew: options.forceNew
    });

    // Ensure all integration systems are aware of the new session
    await this.fullyIntegrateSession(session);

    this.emit('session-fully-integrated', session.id);
    
    console.log(`✅ Integrated session started: ${session.id.substring(0, 8)}`);
    console.log(`   📂 Project: ${session.projectPath}`);
    console.log(`   🤖 Agent: ${session.activeAgent}`);
    console.log(`   🌳 Git: ${session.gitInfo ? `${session.gitInfo.branch}@${session.gitInfo.shortHash}` : 'not a git repo'}`);

    return session;
  }

  /**
   * Recover integrated session with full context restoration
   */
  async recoverIntegratedSession(sessionId: string, options: any = {}): Promise<OuroborosSession> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    console.log(`🔄 Recovering integrated session: ${sessionId.substring(0, 8)}...`);

    // Recover the session
    const session = await this.sessionManager.recoverSession(sessionId, options);

    // Restore all integrated systems
    await this.restoreIntegratedSystems(session, options);

    this.emit('session-fully-integrated', session.id);

    console.log(`✅ Integrated session recovered: ${session.id.substring(0, 8)}`);
    
    if (options.restoreWorkflows && session.activeWorkflows.length > 0) {
      console.log(`   🔄 Restored ${session.activeWorkflows.length} workflows`);
    }
    
    if (options.restoreAgent) {
      console.log(`   🤖 Restored agent: ${session.activeAgent}`);
    }

    return session;
  }

  /**
   * Perform cross-system synchronization
   */
  async synchronizeAllSystems(): Promise<void> {
    const session = this.sessionManager.getCurrentSession();
    if (!session) {
      return;
    }

    console.log(`🔄 Synchronizing all systems for session: ${session.id.substring(0, 8)}`);

    try {
      // Sync workflow state
      await this.workflowIntegration.syncSessionState();

      // Validate agent state
      const agentValid = await this.agentIntegration.validateSessionAgent(session);
      if (!agentValid) {
        console.log(`⚠️  Agent validation failed, may need to switch agents`);
      }

      // Update session with latest data
      session.lastActive = new Date();

      this.emit('cross-system-sync-completed', session.id);

      console.log(`✅ System synchronization completed`);

    } catch (error) {
      console.error('❌ System synchronization failed:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive system status
   */
  getSystemStatus(): {
    session: {
      active: boolean;
      sessionId: string | null;
      uptime: number;
      agent: string;
      project: string;
      workflows: { active: number; completed: number; failed: number };
      commands: number;
      lastActivity: Date | null;
    };
    integrations: {
      workflow: any;
      agent: any;
    };
    health: IntegrationHealth;
  } {
    const session = this.sessionManager.getCurrentSession();
    const health = this.performHealthCheck();

    const sessionStatus = session ? {
      active: true,
      sessionId: session.id,
      uptime: Date.now() - session.created.getTime(),
      agent: session.activeAgent,
      project: session.projectPath,
      workflows: {
        active: session.activeWorkflows.length,
        completed: session.completedWorkflows.length,
        failed: session.failedWorkflows.length
      },
      commands: session.statistics.commandsExecuted,
      lastActivity: session.lastActive
    } : {
      active: false,
      sessionId: null,
      uptime: 0,
      agent: 'none',
      project: 'none',
      workflows: { active: 0, completed: 0, failed: 0 },
      commands: 0,
      lastActivity: null
    };

    return {
      session: sessionStatus,
      integrations: {
        workflow: this.workflowIntegration.getSessionWorkflowSummary(),
        agent: this.agentIntegration.getAgentSessionStats()
      },
      health
    };
  }

  /**
   * Shutdown integration system gracefully
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down session integration system...');

    // Stop monitoring intervals
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    // End current session gracefully
    const session = this.sessionManager.getCurrentSession();
    if (session) {
      await this.sessionManager.endSession('system_shutdown');
    }

    this.isInitialized = false;
    console.log('✅ Session integration system shutdown complete');
  }

  /**
   * Private: Setup cross-system event listeners
   */
  private setupCrossSystemListeners(): void {
    // Workflow-session events
    this.workflowIntegration.on('workflow-session-started', (sessionId, workflowId) => {
      console.log(`🔄 Workflow ${workflowId.substring(0, 8)} started in session ${sessionId.substring(0, 8)}`);
    });

    this.workflowIntegration.on('workflow-session-completed', (sessionId, workflowId, success) => {
      const status = success ? '✅ completed' : '❌ failed';
      console.log(`🔄 Workflow ${workflowId.substring(0, 8)} ${status} in session ${sessionId.substring(0, 8)}`);
      
      // Update agent performance
      this.agentIntegration.updateAgentPerformance(
        this.sessionManager.getCurrentSession()?.activeAgent || 'unknown',
        { workflowCompleted: success, success }
      );
    });

    this.workflowIntegration.on('command-session-tracked', (sessionId, commandId) => {
      // Update agent performance for command execution
      const session = this.sessionManager.getCurrentSession();
      if (session) {
        this.agentIntegration.updateAgentPerformance(session.activeAgent, {
          commandExecuted: true,
          success: true
        });
      }
    });

    // Agent-session events
    this.agentIntegration.on('agent-switched-in-session', (sessionId, fromAgent, toAgent) => {
      console.log(`🤖 Agent switched in session ${sessionId.substring(0, 8)}: ${fromAgent} → ${toAgent}`);
    });

    this.agentIntegration.on('agent-context-restored', (sessionId, agentId) => {
      console.log(`🤖 Agent context restored in session ${sessionId.substring(0, 8)}: ${agentId}`);
    });

    this.agentIntegration.on('session-agent-validated', (sessionId, agentId, isValid) => {
      if (!isValid) {
        console.log(`⚠️  Agent validation failed in session ${sessionId.substring(0, 8)}: ${agentId}`);
      }
    });

    // Session manager events
    this.sessionManager.on('session-created', (session) => {
      console.log(`📋 Session integration activated: ${session.id.substring(0, 8)}`);
    });

    this.sessionManager.on('session-restored', (session) => {
      console.log(`📋 Session integration restored: ${session.id.substring(0, 8)}`);
    });

    this.sessionManager.on('session-ended', (session, reason) => {
      console.log(`📋 Session integration deactivated: ${session.id.substring(0, 8)} (${reason})`);
    });

    this.sessionManager.on('checkpoint-created', (session, checkpoint) => {
      console.log(`📍 Checkpoint created: ${checkpoint.description} in session ${session.id.substring(0, 8)}`);
    });
  }

  /**
   * Private: Fully integrate a session with all systems
   */
  private async fullyIntegrateSession(session: OuroborosSession): Promise<void> {
    // No additional setup needed - integrations are event-driven
    // This method is a placeholder for future integration requirements
    console.log(`🔗 Session fully integrated: ${session.id.substring(0, 8)}`);
  }

  /**
   * Private: Restore all integrated systems for recovered session
   */
  private async restoreIntegratedSystems(session: OuroborosSession, options: any): Promise<void> {
    const restorePromises: Promise<void>[] = [];

    // Restore workflows if requested
    if (options.restoreWorkflows && session.activeWorkflows.length > 0) {
      restorePromises.push(
        this.workflowIntegration.restoreWorkflowsFromSession(session)
      );
    }

    // Restore agent context if requested
    if (options.restoreAgent) {
      restorePromises.push(
        this.agentIntegration.restoreAgentFromSession(session)
      );
    }

    // Wait for all restorations to complete
    await Promise.all(restorePromises);

    console.log(`🔗 Integrated systems restored for session: ${session.id.substring(0, 8)}`);
  }

  /**
   * Private: Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      const health = this.performHealthCheck();
      this.emit('integration-health-check', health);
      
      if (health.overallHealth === 'unhealthy') {
        console.log('⚠️  Integration health check failed:', health.issues.join(', '));
      }
    }, 60000); // Check every minute
  }

  /**
   * Private: Start periodic synchronization
   */
  private startPeriodicSync(): void {
    this.syncInterval = setInterval(async () => {
      try {
        await this.synchronizeAllSystems();
      } catch (error) {
        console.error('❌ Periodic sync failed:', error);
      }
    }, 300000); // Sync every 5 minutes
  }

  /**
   * Private: Perform health check on all integration systems
   */
  private performHealthCheck(): IntegrationHealth {
    const issues: string[] = [];
    let sessionManagerHealthy = true;
    let workflowIntegrationHealthy = true;
    let agentIntegrationHealthy = true;

    // Check session manager health
    try {
      const session = this.sessionManager.getCurrentSession();
      if (session && session.status === SessionStatus.CRASHED) {
        issues.push('Session manager has crashed session');
        sessionManagerHealthy = false;
      }
    } catch (error) {
      issues.push('Session manager is not responding');
      sessionManagerHealthy = false;
    }

    // Check workflow integration health
    try {
      this.workflowIntegration.getSessionWorkflowSummary();
      // Health check passed if we can get the summary without errors
    } catch (error) {
      issues.push('Workflow integration is not responding');
      workflowIntegrationHealthy = false;
    }

    // Check agent integration health
    try {
      this.agentIntegration.getAgentSessionStats();
      // Health check passed if we can get the stats without errors
    } catch (error) {
      issues.push('Agent integration is not responding');
      agentIntegrationHealthy = false;
    }

    // Determine overall health
    let overallHealth: 'healthy' | 'degraded' | 'unhealthy';
    if (sessionManagerHealthy && workflowIntegrationHealthy && agentIntegrationHealthy) {
      overallHealth = 'healthy';
    } else if (sessionManagerHealthy) {
      overallHealth = 'degraded';
    } else {
      overallHealth = 'unhealthy';
    }

    return {
      sessionManager: sessionManagerHealthy,
      workflowIntegration: workflowIntegrationHealthy,
      agentIntegration: agentIntegrationHealthy,
      overallHealth,
      lastCheck: new Date(),
      issues
    };
  }
}

/**
 * Global session integration manager instance
 */
let globalSessionIntegrationManager: SessionIntegrationManager | null = null;

/**
 * Get the global session integration manager instance
 */
export function getSessionIntegrationManager(): SessionIntegrationManager {
  if (!globalSessionIntegrationManager) {
    globalSessionIntegrationManager = new SessionIntegrationManager();
  }
  return globalSessionIntegrationManager;
}

/**
 * Initialize the complete session integration system
 */
export async function initializeSessionIntegrationSystem(): Promise<SessionIntegrationManager> {
  const manager = getSessionIntegrationManager();
  await manager.initialize();
  console.log('🎯 Complete session integration system initialized');
  return manager;
}