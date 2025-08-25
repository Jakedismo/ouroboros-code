/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { AgentRegistry, AgentInfo, AgentConfig, initializeGlobalRegistry } from '../registry/index.js';
import { 
  AgentActivationService, 
  getAgentActivationService,
  AgentActivationListener
} from './provider-integration.js';

/**
 * High-level agent management interface that combines registry and activation
 */
export class AgentManager {
  private registry: AgentRegistry;
  private activationService: AgentActivationService;
  private initialized = false;

  constructor(
    registry?: AgentRegistry,
    activationService?: AgentActivationService
  ) {
    this.registry = registry || new AgentRegistry();
    this.activationService = activationService || getAgentActivationService();
  }

  /**
   * Initialize the agent management system
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('🤖 Initializing Agent Management System...');

    try {
      // Initialize registry with built-in agents
      this.registry = await initializeGlobalRegistry();
      
      // Set up activation listeners
      this.setupActivationListeners();

      // Sync with currently active agent from storage
      await this.syncActiveAgent();

      this.initialized = true;
      console.log('✅ Agent Management System initialized');

    } catch (error) {
      console.error('❌ Failed to initialize Agent Management System:', error);
      throw error;
    }
  }

  /**
   * List all available agents
   */
  async listAgents(): Promise<AgentInfo[]> {
    await this.ensureInitialized();
    return await this.registry.listAgents();
  }

  /**
   * Get agents by category
   */
  async getAgentsByCategory(category: 'built-in' | 'custom'): Promise<AgentInfo[]> {
    await this.ensureInitialized();
    return await this.registry.getAgentsByCategory(category);
  }

  /**
   * Get agent by ID
   */
  async getAgent(agentId: string): Promise<AgentConfig | null> {
    await this.ensureInitialized();
    return await this.registry.getAgent(agentId);
  }

  /**
   * Get currently active agent
   */
  async getActiveAgent(): Promise<AgentConfig | null> {
    await this.ensureInitialized();
    
    // First check the activation service
    const activeAgentId = this.activationService.getCurrentAgentId();
    if (activeAgentId) {
      return await this.registry.getAgent(activeAgentId);
    }

    // Fallback to registry storage
    return await this.registry.getActiveAgent();
  }

  /**
   * Activate an agent by ID
   */
  async activateAgent(agentId: string): Promise<AgentConfig> {
    await this.ensureInitialized();

    const agent = await this.registry.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent with ID '${agentId}' not found`);
    }

    // Activate through both registry and activation service
    const activatedAgent = await this.registry.activateAgent(agentId);
    await this.activationService.activateAgent(activatedAgent);

    console.log(`🎯 Agent activated: ${agent.name}`);
    return activatedAgent;
  }

  /**
   * Deactivate current agent
   */
  async deactivateCurrentAgent(): Promise<void> {
    await this.ensureInitialized();

    await this.activationService.deactivateAgent();
    
    // Note: We don't clear the registry's active agent to maintain persistence
    // This allows the agent to be reactivated on next startup
    
    console.log('🔄 Current agent deactivated');
  }

  /**
   * Switch to a different agent
   */
  async switchAgent(agentId: string): Promise<AgentConfig> {
    await this.ensureInitialized();

    const currentAgent = await this.getActiveAgent();
    
    if (currentAgent?.id === agentId) {
      console.log(`⚠️  Agent '${agentId}' is already active`);
      return currentAgent;
    }

    console.log(`🔄 Switching agents: ${currentAgent?.name || 'none'} → ${agentId}`);
    
    return await this.activateAgent(agentId);
  }

  /**
   * Save a new or updated agent
   */
  async saveAgent(agent: AgentConfig): Promise<void> {
    await this.ensureInitialized();
    await this.registry.saveAgent(agent);
  }

  /**
   * Delete a custom agent
   */
  async deleteAgent(agentId: string): Promise<void> {
    await this.ensureInitialized();

    // Check if this is the currently active agent
    const activeAgent = await this.getActiveAgent();
    if (activeAgent?.id === agentId) {
      // Deactivate first, then switch to default
      await this.deactivateCurrentAgent();
      await this.activateAgent('automation-specialist'); // Default fallback
    }

    await this.registry.deleteAgent(agentId);
  }

  /**
   * Search agents
   */
  async searchAgents(query: string): Promise<AgentInfo[]> {
    await this.ensureInitialized();
    return await this.registry.searchAgents(query);
  }

  /**
   * Export agent configuration
   */
  async exportAgent(agentId: string): Promise<string> {
    await this.ensureInitialized();
    return await this.registry.exportAgent(agentId);
  }

  /**
   * Import agent from configuration
   */
  async importAgent(configJson: string, overwrite = false): Promise<AgentConfig> {
    await this.ensureInitialized();
    return await this.registry.importAgent(configJson, overwrite);
  }

  /**
   * Update agent metrics
   */
  async updateAgentMetrics(agentId: string, rating?: number, effectiveness?: number): Promise<void> {
    await this.ensureInitialized();
    await this.registry.updateAgentMetrics(agentId, rating, effectiveness);
  }

  /**
   * Get system status
   */
  async getSystemStatus(): Promise<AgentSystemStatus> {
    await this.ensureInitialized();

    const stats = await this.registry.getRegistryStats();
    const activeAgent = await this.getActiveAgent();
    const allAgents = await this.listAgents();

    return {
      initialized: this.initialized,
      registryVersion: stats.version,
      agentCount: stats.agentCount,
      activeAgent: activeAgent ? {
        id: activeAgent.id,
        name: activeAgent.name,
        version: activeAgent.version,
        category: activeAgent.category,
      } : null,
      recentAgents: allAgents
        .filter(agent => agent.lastUsed)
        .sort((a, b) => new Date(b.lastUsed!).getTime() - new Date(a.lastUsed!).getTime())
        .slice(0, 5)
        .map(agent => ({
          id: agent.id,
          name: agent.name,
          lastUsed: agent.lastUsed!,
        })),
    };
  }

  /**
   * Add activation listener
   */
  onAgentActivation(listener: AgentActivationListener): void {
    this.activationService.addActivationListener(listener);
  }

  /**
   * Remove activation listener
   */
  removeAgentActivationListener(listener: AgentActivationListener): void {
    this.activationService.removeActivationListener(listener);
  }

  /**
   * Ensure system is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Set up activation event listeners
   */
  private setupActivationListeners(): void {
    this.activationService.addActivationListener(async (event, agent, error) => {
      switch (event) {
        case 'after-activation':
          if (agent) {
            console.log(`📡 Agent activated: ${agent.name} (${agent.id})`);
          }
          break;
          
        case 'activation-failed':
          if (agent && error) {
            console.error(`📡 Agent activation failed: ${agent.name} - ${error.message}`);
          }
          break;
          
        case 'after-deactivation':
          console.log('📡 Agent deactivated');
          break;
      }
    });
  }

  /**
   * Sync activation service with registry's active agent
   */
  private async syncActiveAgent(): Promise<void> {
    try {
      const activeAgent = await this.registry.getActiveAgent();
      
      if (activeAgent && !this.activationService.isAgentActive()) {
        console.log(`🔄 Syncing active agent: ${activeAgent.name}`);
        await this.activationService.activateAgent(activeAgent);
      }
    } catch (error) {
      console.warn(`⚠️  Failed to sync active agent: ${error}`);
    }
  }
}

/**
 * Agent system status interface
 */
export interface AgentSystemStatus {
  initialized: boolean;
  registryVersion: string;
  agentCount: {
    builtIn: number;
    custom: number;
  };
  activeAgent: {
    id: string;
    name: string;
    version: string;
    category: 'built-in' | 'custom';
  } | null;
  recentAgents: {
    id: string;
    name: string;
    lastUsed: string;
  }[];
}

/**
 * Global agent manager instance
 */
let globalAgentManager: AgentManager | null = null;

/**
 * Get or create global agent manager
 */
export function getAgentManager(): AgentManager {
  if (!globalAgentManager) {
    globalAgentManager = new AgentManager();
  }
  return globalAgentManager;
}

/**
 * Initialize global agent manager (call once at startup)
 */
export async function initializeGlobalAgentManager(): Promise<AgentManager> {
  const manager = getAgentManager();
  await manager.initialize();
  return manager;
}