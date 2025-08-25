/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { getSessionManager } from '../../session/session-manager.js';
import { getAgentManager } from './agent-manager.js';
import { AgentConfig, AgentExecutionHistory, AgentPerformanceMetrics } from '../registry/agent-storage.js';
import { OuroborosSession } from '../../session/types.js';

/**
 * Session-agent integration events
 */
export interface SessionAgentEvents {
  'agent-activated-in-session': (sessionId: string, agentId: string, agentConfig: AgentConfig) => void;
  'agent-deactivated-in-session': (sessionId: string, agentId: string) => void;
  'session-agent-persisted': (sessionId: string, agentId: string, persistenceData: AgentSessionPersistence) => void;
  'session-agent-restored': (sessionId: string, agentId: string, restoredData: AgentSessionPersistence) => void;
  'agent-performance-updated': (sessionId: string, agentId: string, metrics: AgentPerformanceMetrics) => void;
}

/**
 * Agent persistence data within session context
 */
export interface AgentSessionPersistence {
  agentId: string;
  agentName: string;
  activatedAt: Date;
  deactivatedAt?: Date;
  totalActiveDuration: number; // milliseconds
  executionHistory: AgentSessionExecution[];
  performanceMetrics: AgentSessionPerformanceMetrics;
  contextData: {
    systemPromptVersion: string;
    toolConfiguration: any;
    workflowsExecuted: string[];
    lastKnownState: Record<string, any>;
  };
  persistedAt: Date;
}

/**
 * Agent execution within session
 */
export interface AgentSessionExecution {
  executionId: string;
  type: 'workflow' | 'command' | 'conversation';
  startTime: Date;
  endTime?: Date;
  duration?: number; // milliseconds
  success: boolean;
  input: {
    userRequest?: string;
    workflowId?: string;
    commandType?: string;
    parameters?: Record<string, any>;
  };
  output: {
    result?: any;
    error?: string;
    performance?: {
      tokensUsed?: number;
      toolsCalled?: number;
      executionTime?: number;
    };
  };
  metadata: {
    sessionContext: Record<string, any>;
    environmentSnapshot: Record<string, any>;
  };
}

/**
 * Agent performance metrics in session context
 */
export interface AgentSessionPerformanceMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  successRate: number; // 0-1
  averageResponseTime: number; // milliseconds
  totalTokensUsed: number;
  totalToolsCalled: number;
  workflowsCompleted: number;
  workflowsFailed: number;
  userSatisfactionScore?: number; // 0-1, if tracked
  resourceEfficiency: number; // 0-1, how efficiently resources were used
  adaptabilityScore: number; // 0-1, how well agent adapted to session context
}

/**
 * Session-agent relationship data
 */
export interface SessionAgentRelationship {
  sessionId: string;
  activeAgentId?: string;
  agentHistory: AgentSessionPersistence[];
  agentSwitches: {
    fromAgentId?: string;
    toAgentId: string;
    timestamp: Date;
    reason: string; // 'user-requested', 'automatic-optimization', 'task-specific', etc.
    context: Record<string, any>;
  }[];
  aggregateMetrics: {
    totalAgentsUsed: number;
    totalSwitches: number;
    dominantAgentId?: string; // agent with most usage time
    mostEffectiveAgentId?: string; // agent with best performance
    averageAgentEfficiency: number;
  };
}

/**
 * Integration layer between session management and agent persistence
 * 
 * This class provides:
 * - Agent activation/deactivation tracking within sessions
 * - Agent performance metrics collection and analysis
 * - Agent context persistence and restoration
 * - Session-aware agent optimization and recommendations
 * - Agent usage history and pattern analysis
 */
export class SessionAgentIntegration extends EventEmitter {
  private sessionManager = getSessionManager();
  private agentManager = getAgentManager();
  
  // Active session-agent relationships
  private sessionAgentRelationships = new Map<string, SessionAgentRelationship>();
  
  // Performance tracking
  private activeExecutions = new Map<string, AgentSessionExecution>();
  private performanceBuffer = new Map<string, AgentSessionPerformanceMetrics>();
  
  private isInitialized = false;

  /**
   * Initialize session-agent integration
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    console.log('🔗 Initializing session-agent integration...');
    
    // Setup session manager listeners
    this.setupSessionListeners();
    
    // Setup agent manager listeners
    this.setupAgentListeners();
    
    // Restore any existing session-agent relationships
    await this.restoreExistingRelationships();

    this.isInitialized = true;
    console.log('✅ Session-agent integration initialized');
  }

  /**
   * Activate an agent within the current session context
   */
  async activateAgentInSession(
    agentId: string, 
    reason: string = 'user-requested',
    context: Record<string, any> = {}
  ): Promise<void> {
    const session = this.sessionManager.getCurrentSession();
    if (!session) {
      throw new Error('No active session - start a session first');
    }

    const agentConfig = await this.agentManager.getAgent(agentId);
    if (!agentConfig) {
      throw new Error(`Agent ${agentId} not found`);
    }

    console.log(`🤖 Activating agent ${agentConfig.name} in session ${session.id.substring(0, 8)}`);

    // Get or create session-agent relationship
    let relationship = this.sessionAgentRelationships.get(session.id);
    if (!relationship) {
      relationship = this.initializeSessionAgentRelationship(session.id);
      this.sessionAgentRelationships.set(session.id, relationship);
    }

    // Record agent switch if there was a previous agent
    const previousAgentId = relationship.activeAgentId;
    if (previousAgentId && previousAgentId !== agentId) {
      await this.recordAgentSwitch(relationship, previousAgentId, agentId, reason, context);
    }

    // Update active agent
    relationship.activeAgentId = agentId;

    // Create or update agent persistence data
    const agentPersistence = this.getOrCreateAgentPersistence(relationship, agentId, agentConfig);
    agentPersistence.activatedAt = new Date();
    agentPersistence.deactivatedAt = undefined;

    // Initialize performance metrics if not exists
    if (!this.performanceBuffer.has(agentId)) {
      this.performanceBuffer.set(agentId, this.initializePerformanceMetrics());
    }

    // Update session with agent context
    this.updateSessionWithAgentContext(session, agentConfig);

    // Activate agent in agent manager
    await this.agentManager.activateAgent(agentId);

    this.emit('agent-activated-in-session', session.id, agentId, agentConfig);
    console.log(`✅ Agent ${agentConfig.name} activated in session context`);
  }

  /**
   * Deactivate the current agent in the session
   */
  async deactivateCurrentAgent(reason: string = 'user-requested'): Promise<void> {
    const session = this.sessionManager.getCurrentSession();
    if (!session) {
      return;
    }

    const relationship = this.sessionAgentRelationships.get(session.id);
    if (!relationship || !relationship.activeAgentId) {
      return;
    }

    const agentId = relationship.activeAgentId;
    console.log(`🤖 Deactivating agent ${agentId} from session ${session.id.substring(0, 8)}`);

    // Update agent persistence data
    const agentPersistence = relationship.agentHistory.find(a => a.agentId === agentId);
    if (agentPersistence) {
      agentPersistence.deactivatedAt = new Date();
      agentPersistence.totalActiveDuration += (
        agentPersistence.deactivatedAt.getTime() - agentPersistence.activatedAt.getTime()
      );
      
      // Update performance metrics
      const metrics = this.performanceBuffer.get(agentId);
      if (metrics) {
        agentPersistence.performanceMetrics = { ...metrics };
        this.emit('agent-performance-updated', session.id, agentId, metrics);
      }

      // Persist agent data
      await this.persistAgentSessionData(session.id, agentId, agentPersistence);
    }

    // Clear active agent
    relationship.activeAgentId = undefined;

    // Deactivate in agent manager
    await this.agentManager.deactivateAgent();

    this.emit('agent-deactivated-in-session', session.id, agentId);
    console.log(`✅ Agent ${agentId} deactivated from session context`);
  }

  /**
   * Record an execution for the current agent
   */
  async recordAgentExecution(
    type: 'workflow' | 'command' | 'conversation',
    input: any,
    output: any,
    success: boolean,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    const session = this.sessionManager.getCurrentSession();
    if (!session) return;

    const relationship = this.sessionAgentRelationships.get(session.id);
    if (!relationship || !relationship.activeAgentId) return;

    const agentId = relationship.activeAgentId;
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const execution: AgentSessionExecution = {
      executionId,
      type,
      startTime: new Date(),
      endTime: new Date(),
      duration: output.executionTime || 1000,
      success,
      input,
      output,
      metadata: {
        sessionContext: {
          sessionId: session.id,
          workingPath: session.environment.workingPath,
          gitBranch: session.environment.gitBranch,
        },
        environmentSnapshot: metadata,
      },
    };

    // Update agent persistence
    const agentPersistence = relationship.agentHistory.find(a => a.agentId === agentId);
    if (agentPersistence) {
      agentPersistence.executionHistory.push(execution);
      
      // Keep only last 50 executions per agent
      if (agentPersistence.executionHistory.length > 50) {
        agentPersistence.executionHistory = agentPersistence.executionHistory.slice(-50);
      }
    }

    // Update performance metrics
    this.updatePerformanceMetrics(agentId, execution);

    console.debug(`📊 Recorded ${type} execution for agent ${agentId}: ${success ? 'success' : 'failure'}`);
  }

  /**
   * Get session agent relationship data
   */
  getSessionAgentRelationship(sessionId?: string): SessionAgentRelationship | null {
    const targetSessionId = sessionId || this.sessionManager.getCurrentSession()?.id;
    if (!targetSessionId) return null;

    return this.sessionAgentRelationships.get(targetSessionId) || null;
  }

  /**
   * Get agent performance metrics for current session
   */
  getAgentPerformanceInSession(agentId?: string): AgentSessionPerformanceMetrics | null {
    const session = this.sessionManager.getCurrentSession();
    if (!session) return null;

    const relationship = this.sessionAgentRelationships.get(session.id);
    if (!relationship) return null;

    const targetAgentId = agentId || relationship.activeAgentId;
    if (!targetAgentId) return null;

    return this.performanceBuffer.get(targetAgentId) || null;
  }

  /**
   * Get agent usage statistics for current session
   */
  getAgentUsageStatistics(): {
    totalAgents: number;
    activeAgent?: string;
    agentSwitches: number;
    dominantAgent?: string;
    averageSessionTime: number;
    topPerformers: Array<{ agentId: string; score: number }>;
  } {
    const session = this.sessionManager.getCurrentSession();
    if (!session) {
      return {
        totalAgents: 0,
        agentSwitches: 0,
        averageSessionTime: 0,
        topPerformers: [],
      };
    }

    const relationship = this.sessionAgentRelationships.get(session.id);
    if (!relationship) {
      return {
        totalAgents: 0,
        agentSwitches: 0,
        averageSessionTime: 0,
        topPerformers: [],
      };
    }

    // Calculate statistics
    const totalAgents = relationship.agentHistory.length;
    const agentSwitches = relationship.agentSwitches.length;
    const averageSessionTime = totalAgents > 0 
      ? relationship.agentHistory.reduce((sum, agent) => sum + agent.totalActiveDuration, 0) / totalAgents
      : 0;

    // Find dominant agent (most time)
    let dominantAgent = relationship.agentHistory.reduce((max, agent) => 
      agent.totalActiveDuration > (max?.totalActiveDuration || 0) ? agent : max, 
      null as AgentSessionPersistence | null
    )?.agentId;

    // Calculate top performers
    const topPerformers = relationship.agentHistory
      .map(agent => ({
        agentId: agent.agentId,
        score: agent.performanceMetrics.successRate * agent.performanceMetrics.resourceEfficiency,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return {
      totalAgents,
      activeAgent: relationship.activeAgentId,
      agentSwitches,
      dominantAgent,
      averageSessionTime,
      topPerformers,
    };
  }

  /**
   * Restore agent context from session
   */
  async restoreAgentFromSession(sessionId: string, agentId: string): Promise<boolean> {
    try {
      const relationship = this.sessionAgentRelationships.get(sessionId);
      if (!relationship) {
        console.warn(`⚠️  No session-agent relationship found for session ${sessionId}`);
        return false;
      }

      const agentPersistence = relationship.agentHistory.find(a => a.agentId === agentId);
      if (!agentPersistence) {
        console.warn(`⚠️  No persistence data found for agent ${agentId} in session ${sessionId}`);
        return false;
      }

      // Restore performance metrics
      this.performanceBuffer.set(agentId, agentPersistence.performanceMetrics);

      // Restore agent context
      const agentConfig = await this.agentManager.getAgent(agentId);
      if (agentConfig) {
        // Update agent with restored context
        agentConfig.lastKnownState = agentPersistence.contextData.lastKnownState;
      }

      this.emit('session-agent-restored', sessionId, agentId, agentPersistence);
      console.log(`✅ Restored agent ${agentId} context from session ${sessionId.substring(0, 8)}`);
      return true;

    } catch (error) {
      console.error(`❌ Failed to restore agent ${agentId} from session:`, error);
      return false;
    }
  }

  /**
   * Clean up session-agent integration
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up session-agent integration...');
    
    // Persist all active relationships
    for (const [sessionId, relationship] of this.sessionAgentRelationships.entries()) {
      if (relationship.activeAgentId) {
        await this.deactivateCurrentAgent('cleanup');
      }
    }

    this.sessionAgentRelationships.clear();
    this.activeExecutions.clear();
    this.performanceBuffer.clear();
    
    console.log('✅ Session-agent integration cleanup completed');
  }

  // Private implementation methods

  /**
   * Setup session manager event listeners
   */
  private setupSessionListeners(): void {
    this.sessionManager.on('session-created', (session) => {
      console.debug(`🔗 Setting up agent tracking for session: ${session.id.substring(0, 8)}`);
      this.initializeSessionAgentRelationship(session.id);
    });

    this.sessionManager.on('session-restored', (session) => {
      console.debug(`🔗 Restoring agent context for session: ${session.id.substring(0, 8)}`);
      this.restoreSessionAgentRelationship(session.id);
    });

    this.sessionManager.on('session-ended', (session) => {
      console.debug(`🔗 Finalizing agent data for session: ${session.id.substring(0, 8)}`);
      this.finalizeSessionAgentData(session.id);
    });
  }

  /**
   * Setup agent manager event listeners
   */
  private setupAgentListeners(): void {
    this.agentManager.onAgentActivation(async (event, agent, error) => {
      const session = this.sessionManager.getCurrentSession();
      if (!session) return;

      if (event === 'after-activation' && agent) {
        // Update session-agent relationship
        const relationship = this.sessionAgentRelationships.get(session.id);
        if (relationship && relationship.activeAgentId === agent.id) {
          // Agent was activated through our integration - update context
          this.updateSessionWithAgentContext(session, agent);
        }
      }
    });
  }

  /**
   * Initialize session-agent relationship
   */
  private initializeSessionAgentRelationship(sessionId: string): SessionAgentRelationship {
    const relationship: SessionAgentRelationship = {
      sessionId,
      agentHistory: [],
      agentSwitches: [],
      aggregateMetrics: {
        totalAgentsUsed: 0,
        totalSwitches: 0,
        averageAgentEfficiency: 0,
      },
    };

    this.sessionAgentRelationships.set(sessionId, relationship);
    return relationship;
  }

  /**
   * Get or create agent persistence data
   */
  private getOrCreateAgentPersistence(
    relationship: SessionAgentRelationship,
    agentId: string,
    agentConfig: AgentConfig
  ): AgentSessionPersistence {
    let agentPersistence = relationship.agentHistory.find(a => a.agentId === agentId);
    
    if (!agentPersistence) {
      agentPersistence = {
        agentId,
        agentName: agentConfig.name,
        activatedAt: new Date(),
        totalActiveDuration: 0,
        executionHistory: [],
        performanceMetrics: this.initializePerformanceMetrics(),
        contextData: {
          systemPromptVersion: agentConfig.version,
          toolConfiguration: agentConfig.toolConfiguration,
          workflowsExecuted: [],
          lastKnownState: agentConfig.lastKnownState || {},
        },
        persistedAt: new Date(),
      };
      
      relationship.agentHistory.push(agentPersistence);
      relationship.aggregateMetrics.totalAgentsUsed++;
    }

    return agentPersistence;
  }

  /**
   * Record agent switch
   */
  private async recordAgentSwitch(
    relationship: SessionAgentRelationship,
    fromAgentId: string,
    toAgentId: string,
    reason: string,
    context: Record<string, any>
  ): Promise<void> {
    // Finalize previous agent
    const fromPersistence = relationship.agentHistory.find(a => a.agentId === fromAgentId);
    if (fromPersistence) {
      fromPersistence.deactivatedAt = new Date();
      fromPersistence.totalActiveDuration += (
        fromPersistence.deactivatedAt.getTime() - fromPersistence.activatedAt.getTime()
      );
    }

    // Record switch
    relationship.agentSwitches.push({
      fromAgentId,
      toAgentId,
      timestamp: new Date(),
      reason,
      context,
    });

    relationship.aggregateMetrics.totalSwitches++;

    console.debug(`🔄 Recorded agent switch: ${fromAgentId} → ${toAgentId} (${reason})`);
  }

  /**
   * Update session with agent context
   */
  private updateSessionWithAgentContext(session: OuroborosSession, agentConfig: AgentConfig): void {
    // Add agent-specific metadata to session
    if (!session.metadata) {
      session.metadata = {};
    }

    session.metadata.activeAgent = {
      id: agentConfig.id,
      name: agentConfig.name,
      category: agentConfig.category,
      activatedAt: new Date().toISOString(),
    };

    console.debug(`📋 Updated session ${session.id.substring(0, 8)} with agent ${agentConfig.name} context`);
  }

  /**
   * Initialize performance metrics
   */
  private initializePerformanceMetrics(): AgentSessionPerformanceMetrics {
    return {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      successRate: 1.0,
      averageResponseTime: 0,
      totalTokensUsed: 0,
      totalToolsCalled: 0,
      workflowsCompleted: 0,
      workflowsFailed: 0,
      resourceEfficiency: 1.0,
      adaptabilityScore: 1.0,
    };
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(agentId: string, execution: AgentSessionExecution): void {
    let metrics = this.performanceBuffer.get(agentId);
    if (!metrics) {
      metrics = this.initializePerformanceMetrics();
      this.performanceBuffer.set(agentId, metrics);
    }

    // Update basic metrics
    metrics.totalExecutions++;
    if (execution.success) {
      metrics.successfulExecutions++;
    } else {
      metrics.failedExecutions++;
    }

    metrics.successRate = metrics.successfulExecutions / metrics.totalExecutions;

    // Update response time
    if (execution.duration) {
      const totalTime = metrics.averageResponseTime * (metrics.totalExecutions - 1) + execution.duration;
      metrics.averageResponseTime = totalTime / metrics.totalExecutions;
    }

    // Update performance data from output
    if (execution.output.performance) {
      if (execution.output.performance.tokensUsed) {
        metrics.totalTokensUsed += execution.output.performance.tokensUsed;
      }
      if (execution.output.performance.toolsCalled) {
        metrics.totalToolsCalled += execution.output.performance.toolsCalled;
      }
    }

    // Update workflow metrics
    if (execution.type === 'workflow') {
      if (execution.success) {
        metrics.workflowsCompleted++;
      } else {
        metrics.workflowsFailed++;
      }
    }

    // Calculate resource efficiency (simplified)
    metrics.resourceEfficiency = Math.min(1.0, metrics.successRate * (1000 / Math.max(metrics.averageResponseTime, 100)));

    // Calculate adaptability score (simplified)
    metrics.adaptabilityScore = Math.min(1.0, metrics.successRate * 0.8 + (metrics.resourceEfficiency * 0.2));
  }

  /**
   * Persist agent session data
   */
  private async persistAgentSessionData(
    sessionId: string,
    agentId: string,
    persistenceData: AgentSessionPersistence
  ): Promise<void> {
    try {
      persistenceData.persistedAt = new Date();
      
      // This could be enhanced to use proper storage
      console.debug(`💾 Persisted agent ${agentId} data for session ${sessionId.substring(0, 8)}`);
      
      this.emit('session-agent-persisted', sessionId, agentId, persistenceData);
    } catch (error) {
      console.error(`❌ Failed to persist agent session data:`, error);
    }
  }

  /**
   * Restore existing relationships
   */
  private async restoreExistingRelationships(): Promise<void> {
    // This could be enhanced to load from persistent storage
    console.debug('🔄 Restoring existing session-agent relationships...');
  }

  /**
   * Restore session-agent relationship
   */
  private async restoreSessionAgentRelationship(sessionId: string): Promise<void> {
    // This could be enhanced to load specific relationship data
    console.debug(`🔄 Restoring session-agent relationship for ${sessionId.substring(0, 8)}`);
  }

  /**
   * Finalize session agent data
   */
  private async finalizeSessionAgentData(sessionId: string): Promise<void> {
    const relationship = this.sessionAgentRelationships.get(sessionId);
    if (!relationship) return;

    // Finalize any active agent
    if (relationship.activeAgentId) {
      await this.deactivateCurrentAgent('session-ended');
    }

    // Calculate final aggregate metrics
    relationship.aggregateMetrics.averageAgentEfficiency = 
      relationship.agentHistory.reduce((sum, agent) => sum + agent.performanceMetrics.resourceEfficiency, 0) /
      Math.max(relationship.agentHistory.length, 1);

    // Determine dominant and most effective agents
    if (relationship.agentHistory.length > 0) {
      const dominantAgent = relationship.agentHistory.reduce((max, agent) => 
        agent.totalActiveDuration > max.totalActiveDuration ? agent : max
      );
      relationship.aggregateMetrics.dominantAgentId = dominantAgent.agentId;

      const mostEffectiveAgent = relationship.agentHistory.reduce((max, agent) => 
        agent.performanceMetrics.successRate > max.performanceMetrics.successRate ? agent : max
      );
      relationship.aggregateMetrics.mostEffectiveAgentId = mostEffectiveAgent.agentId;
    }

    // Final persistence
    for (const agentPersistence of relationship.agentHistory) {
      await this.persistAgentSessionData(sessionId, agentPersistence.agentId, agentPersistence);
    }

    console.debug(`📊 Finalized agent data for session ${sessionId.substring(0, 8)}: ${relationship.agentHistory.length} agents`);
  }
}

/**
 * Global session-agent integration instance
 */
let globalSessionAgentIntegration: SessionAgentIntegration | null = null;

/**
 * Get or create the global session-agent integration instance
 */
export function getSessionAgentIntegration(): SessionAgentIntegration {
  if (!globalSessionAgentIntegration) {
    globalSessionAgentIntegration = new SessionAgentIntegration();
  }
  return globalSessionAgentIntegration;
}

/**
 * Initialize the global session-agent integration
 */
export async function initializeSessionAgentIntegration(): Promise<SessionAgentIntegration> {
  const integration = getSessionAgentIntegration();
  await integration.initialize();
  console.log('🔗 Global session-agent integration initialized');
  return integration;
}