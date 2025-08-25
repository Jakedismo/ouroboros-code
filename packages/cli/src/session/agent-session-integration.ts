/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { getSessionManager } from './session-manager.js';
import { getRegistryInitializer } from '../agents/registry/index.js';
import { OuroborosSession } from './types.js';
import { Agent } from '../agents/registry/index.js';

/**
 * Agent-session integration events
 */
export interface AgentSessionEvents {
  'agent-switched-in-session': (sessionId: string, fromAgent: string, toAgent: string) => void;
  'agent-context-restored': (sessionId: string, agentId: string) => void;
  'session-agent-validated': (sessionId: string, agentId: string, isValid: boolean) => void;
}

/**
 * Agent context for session management
 */
export interface SessionAgentContext {
  agentId: string;
  activatedAt: Date;
  sessionId: string;
  systemPrompt: string;
  configuration: Record<string, any>;
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  preferences: Record<string, any>;
  capabilities: string[];
  performance: {
    commandsExecuted: number;
    workflowsCompleted: number;
    averageResponseTime: number;
    successRate: number;
  };
}

/**
 * Integration layer between session management and agent systems
 */
export class AgentSessionIntegration extends EventEmitter {
  private sessionManager = getSessionManager();
  private registryInitializer = getRegistryInitializer();
  private agentContexts = new Map<string, SessionAgentContext>(); // sessionId -> context
  private isInitialized = false;

  /**
   * Initialize the agent-session integration
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Setup session manager listeners
    this.setupSessionListeners();
    
    // Setup agent registry listeners (simplified for now)
    // this.setupAgentListeners();

    this.isInitialized = true;
    console.log('🤖 Agent-Session integration initialized');
  }

  /**
   * Switch agent within current session
   */
  async switchAgentInSession(newAgentId: string): Promise<void> {
    const session = this.sessionManager.getCurrentSession();
    if (!session) {
      throw new Error('No active session - start a session first');
    }

    const currentAgentId = session.activeAgent;
    
    if (currentAgentId === newAgentId) {
      console.log(`🤖 Already using agent: ${newAgentId}`);
      return;
    }

    // Validate new agent exists
    const registry = this.registryInitializer.getRegistry();
    const newAgent = await registry.getAgent(newAgentId);
    if (!newAgent) {
      throw new Error(`Agent not found: ${newAgentId}`);
    }

    // Save current agent context
    await this.saveAgentContext(session, currentAgentId);

    // Update session agent history
    const currentAgentHistory = session.agentHistory.find(h => h.agentId === currentAgentId);
    if (currentAgentHistory) {
      currentAgentHistory.duration = Date.now() - currentAgentHistory.activatedAt.getTime();
    }

    // Switch to new agent
    session.activeAgent = newAgentId;
    session.agentHistory.push({
      agentId: newAgentId,
      activatedAt: new Date(),
      duration: 0
    });

    // Record agent switch for checkpointing
    this.sessionManager.recordAgentSwitch(currentAgentId, newAgentId);

    // Load agent context if available
    await this.loadAgentContext(session, newAgentId);

    // Update session statistics
    session.statistics.mostUsedAgent = this.getMostUsedAgent(session);

    // Emit integration event
    this.emit('agent-switched-in-session', session.id, currentAgentId, newAgentId);

    console.log(`🤖 Switched agent: ${currentAgentId} → ${newAgentId} in session ${session.id.substring(0, 8)}`);
  }

  /**
   * Restore agent context from recovered session
   */
  async restoreAgentFromSession(session: OuroborosSession): Promise<void> {
    const agentId = session.activeAgent;

    try {
      // Validate agent still exists
      const registry = this.registryInitializer.getRegistry();
      const agent = await registry.getAgent(agentId);
      if (!agent) {
        console.log(`⚠️  Agent ${agentId} no longer available, switching to default`);
        session.activeAgent = 'default';
        return;
      }

      // Load stored agent context
      await this.loadAgentContext(session, agentId);

      // Emit restoration event
      this.emit('agent-context-restored', session.id, agentId);

      console.log(`🤖 Restored agent context: ${agentId} in session ${session.id.substring(0, 8)}`);

    } catch (error) {
      console.error(`❌ Failed to restore agent context for ${agentId}:`, error);
      
      // Fallback to default agent
      session.activeAgent = 'default';
      console.log(`🤖 Fallback to default agent in session ${session.id.substring(0, 8)}`);
    }
  }

  /**
   * Validate agent compatibility with session
   */
  async validateSessionAgent(session: OuroborosSession): Promise<boolean> {
    const agentId = session.activeAgent;

    try {
      // Check if agent exists
      const registry = this.registryInitializer.getRegistry();
      const agent = await registry.getAgent(agentId);
      if (!agent) {
        this.emit('session-agent-validated', session.id, agentId, false);
        return false;
      }

      // Check if agent capabilities match session requirements
      const isCompatible = await this.checkAgentCompatibility(agent, session);
      
      this.emit('session-agent-validated', session.id, agentId, isCompatible);
      return isCompatible;

    } catch (error) {
      console.error(`❌ Error validating session agent ${agentId}:`, error);
      this.emit('session-agent-validated', session.id, agentId, false);
      return false;
    }
  }

  /**
   * Get agent performance in current session
   */
  getAgentSessionPerformance(agentId?: string): SessionAgentContext | null {
    const session = this.sessionManager.getCurrentSession();
    if (!session) {
      return null;
    }

    const targetAgentId = agentId || session.activeAgent;
    return this.agentContexts.get(`${session.id}-${targetAgentId}`) || null;
  }

  /**
   * Update agent performance metrics
   */
  updateAgentPerformance(agentId: string, metrics: {
    commandExecuted?: boolean;
    workflowCompleted?: boolean;
    responseTime?: number;
    success?: boolean;
  }): void {
    const session = this.sessionManager.getCurrentSession();
    if (!session) {
      return;
    }

    const contextKey = `${session.id}-${agentId}`;
    let context = this.agentContexts.get(contextKey);

    if (!context) {
      // Create new context
      context = this.createDefaultAgentContext(agentId, session.id);
      this.agentContexts.set(contextKey, context);
    }

    // Update performance metrics
    if (metrics.commandExecuted) {
      context.performance.commandsExecuted++;
    }

    if (metrics.workflowCompleted) {
      context.performance.workflowsCompleted++;
    }

    if (metrics.responseTime) {
      const currentAvg = context.performance.averageResponseTime;
      const currentCount = context.performance.commandsExecuted;
      context.performance.averageResponseTime = 
        (currentAvg * (currentCount - 1) + metrics.responseTime) / currentCount;
    }

    if (metrics.success !== undefined) {
      // Update success rate
      const totalOperations = context.performance.commandsExecuted + context.performance.workflowsCompleted;
      if (totalOperations > 0) {
        const currentSuccesses = context.performance.successRate * (totalOperations - 1);
        const newSuccesses = currentSuccesses + (metrics.success ? 1 : 0);
        context.performance.successRate = newSuccesses / totalOperations;
      }
    }

    this.agentContexts.set(contextKey, context);
  }

  /**
   * Get agent session statistics
   */
  getAgentSessionStats(): {
    currentAgent: string;
    agentHistory: Array<{ agentId: string; duration: number; activatedAt: Date }>;
    agentPerformance: Record<string, SessionAgentContext['performance']>;
    mostUsedAgent: string;
    totalAgentSwitches: number;
  } {
    const session = this.sessionManager.getCurrentSession();
    if (!session) {
      return {
        currentAgent: 'none',
        agentHistory: [],
        agentPerformance: {},
        mostUsedAgent: 'none',
        totalAgentSwitches: 0
      };
    }

    const agentPerformance: Record<string, SessionAgentContext['performance']> = {};
    
    // Collect performance data for all agents used in this session
    for (const [contextKey, context] of this.agentContexts.entries()) {
      if (contextKey.startsWith(`${session.id}-`)) {
        const agentId = contextKey.substring(`${session.id}-`.length);
        agentPerformance[agentId] = context.performance;
      }
    }

    return {
      currentAgent: session.activeAgent,
      agentHistory: [...session.agentHistory],
      agentPerformance,
      mostUsedAgent: session.statistics.mostUsedAgent,
      totalAgentSwitches: session.agentHistory.length - 1 // -1 because first entry is not a switch
    };
  }

  /**
   * Add conversation entry to agent context
   */
  addConversationEntry(role: 'user' | 'assistant', content: string, agentId?: string): void {
    const session = this.sessionManager.getCurrentSession();
    if (!session) {
      return;
    }

    const targetAgentId = agentId || session.activeAgent;
    const contextKey = `${session.id}-${targetAgentId}`;
    let context = this.agentContexts.get(contextKey);

    if (!context) {
      context = this.createDefaultAgentContext(targetAgentId, session.id);
      this.agentContexts.set(contextKey, context);
    }

    // Add conversation entry
    context.conversationHistory.push({
      role,
      content,
      timestamp: new Date()
    });

    // Keep only last 50 entries to manage memory
    if (context.conversationHistory.length > 50) {
      context.conversationHistory = context.conversationHistory.slice(-50);
    }

    this.agentContexts.set(contextKey, context);
  }

  /**
   * Private: Setup session manager listeners
   */
  private setupSessionListeners(): void {
    this.sessionManager.on('session-created', (session) => {
      // Initialize agent context for new session
      this.initializeAgentContext(session);
    });

    this.sessionManager.on('session-restored', (session) => {
      // Restore agent context
      this.restoreAgentFromSession(session);
    });

    this.sessionManager.on('session-ended', (session) => {
      // Clean up agent contexts for ended session
      this.cleanupSessionAgentContexts(session.id);
    });
  }


  /**
   * Private: Initialize agent context for new session
   */
  private async initializeAgentContext(session: OuroborosSession): Promise<void> {
    const agentId = session.activeAgent;
    const context = this.createDefaultAgentContext(agentId, session.id);
    
    // Load agent configuration
    const registry = this.registryInitializer.getRegistry();
    const agent = await registry.getAgent(agentId);
    if (agent) {
      context.systemPrompt = agent.systemPrompt;
      context.capabilities = agent.capabilities.specialBehaviors || [];
      context.configuration = agent.toolConfiguration || {};
    }

    this.agentContexts.set(`${session.id}-${agentId}`, context);
    console.log(`🤖 Initialized agent context: ${agentId} for session ${session.id.substring(0, 8)}`);
  }

  /**
   * Private: Save agent context to session metadata
   */
  private async saveAgentContext(session: OuroborosSession, agentId: string): Promise<void> {
    const contextKey = `${session.id}-${agentId}`;
    const context = this.agentContexts.get(contextKey);
    
    if (context) {
      // Store in session metadata for persistence
      if (!session.metadata.agentContexts) {
        session.metadata.agentContexts = {};
      }
      
      session.metadata.agentContexts[agentId] = {
        performance: context.performance,
        preferences: context.preferences,
        lastActive: new Date()
      };
    }
  }

  /**
   * Private: Load agent context from session metadata
   */
  private async loadAgentContext(session: OuroborosSession, agentId: string): Promise<void> {
    const contextKey = `${session.id}-${agentId}`;
    let context = this.createDefaultAgentContext(agentId, session.id);

    // Load from session metadata if available
    const storedContext = session.metadata.agentContexts?.[agentId];
    if (storedContext) {
      context.performance = storedContext.performance;
      context.preferences = storedContext.preferences;
    }

    // Load current agent configuration
    const registry = this.registryInitializer.getRegistry();
    const agent = await registry.getAgent(agentId);
    if (agent) {
      context.systemPrompt = agent.systemPrompt;
      context.capabilities = agent.capabilities.specialBehaviors || [];
      context.configuration = agent.toolConfiguration || {};
    }

    this.agentContexts.set(contextKey, context);
  }


  /**
   * Private: Create default agent context
   */
  private createDefaultAgentContext(agentId: string, sessionId: string): SessionAgentContext {
    return {
      agentId,
      activatedAt: new Date(),
      sessionId,
      systemPrompt: '',
      configuration: {},
      conversationHistory: [],
      preferences: {},
      capabilities: [],
      performance: {
        commandsExecuted: 0,
        workflowsCompleted: 0,
        averageResponseTime: 0,
        successRate: 1.0
      }
    };
  }

  /**
   * Private: Get most used agent in session
   */
  private getMostUsedAgent(session: OuroborosSession): string {
    const agentDurations = new Map<string, number>();
    
    for (const agentHistory of session.agentHistory) {
      const duration = agentHistory.duration || 0;
      agentDurations.set(agentHistory.agentId, (agentDurations.get(agentHistory.agentId) || 0) + duration);
    }

    let mostUsedAgent = session.activeAgent;
    let maxDuration = 0;
    
    for (const [agentId, duration] of agentDurations) {
      if (duration > maxDuration) {
        maxDuration = duration;
        mostUsedAgent = agentId;
      }
    }

    return mostUsedAgent;
  }

  /**
   * Private: Check agent compatibility with session
   */
  private async checkAgentCompatibility(agent: Agent, session: OuroborosSession): Promise<boolean> {
    // Check if agent has required capabilities for active workflows
    // For now, simplified compatibility check
    if (session.activeWorkflows.length > 0 && (!agent.capabilities.specialBehaviors || agent.capabilities.specialBehaviors.length === 0)) {
      // Agent has no capabilities but there are active workflows
      return false;
    }

    return true;
  }

  /**
   * Private: Clean up agent contexts for ended session
   */
  private cleanupSessionAgentContexts(sessionId: string): void {
    const keysToRemove: string[] = [];
    
    for (const [contextKey] of this.agentContexts) {
      if (contextKey.startsWith(`${sessionId}-`)) {
        keysToRemove.push(contextKey);
      }
    }

    keysToRemove.forEach(key => this.agentContexts.delete(key));
    console.log(`🧹 Cleaned up agent contexts for session: ${sessionId.substring(0, 8)}`);
  }
}

/**
 * Global agent-session integration instance
 */
let globalAgentSessionIntegration: AgentSessionIntegration | null = null;

/**
 * Get the global agent-session integration instance
 */
export function getAgentSessionIntegration(): AgentSessionIntegration {
  if (!globalAgentSessionIntegration) {
    globalAgentSessionIntegration = new AgentSessionIntegration();
  }
  return globalAgentSessionIntegration;
}

/**
 * Initialize agent-session integration
 */
export async function initializeAgentSessionIntegration(): Promise<AgentSessionIntegration> {
  const integration = getAgentSessionIntegration();
  await integration.initialize();
  console.log('🤖 Agent-Session integration system initialized');
  return integration;
}