/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { AgentStorage, AgentConfig, AgentRegistryMetadata } from './agent-storage.js';

/**
 * Agent information for display purposes
 */
export interface AgentInfo {
  id: string;
  name: string;
  category: 'built-in' | 'custom';
  description: string;
  version: string;
  author: string;
  toolCount: number;
  specialBehaviors: string[];
  lastUsed: string | null;
  effectiveness: number;
  isActive: boolean;
}

/**
 * Main agent registry for managing and coordinating agents
 */
export class AgentRegistry {
  private storage: AgentStorage;
  private initialized = false;

  constructor() {
    this.storage = new AgentStorage();
  }

  /**
   * Initialize the agent registry
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.storage.initialize();
    this.initialized = true;

    console.log('🤖 Agent registry initialized');
  }

  /**
   * Get all available agents with summary information
   */
  async listAgents(): Promise<AgentInfo[]> {
    await this.ensureInitialized();
    
    const agents = await this.storage.loadAllAgents();
    const activeAgentId = await this.storage.getActiveAgent();

    return agents.map(agent => this.agentConfigToInfo(agent, activeAgentId));
  }

  /**
   * Get agents by category
   */
  async getAgentsByCategory(category: 'built-in' | 'custom'): Promise<AgentInfo[]> {
    const allAgents = await this.listAgents();
    return allAgents.filter(agent => agent.category === category);
  }

  /**
   * Get full agent configuration by ID
   */
  async getAgent(agentId: string): Promise<AgentConfig | null> {
    await this.ensureInitialized();

    // Try built-in first, then custom
    let agent = await this.storage.loadAgent(agentId, 'built-in');
    if (!agent) {
      agent = await this.storage.loadAgent(agentId, 'custom');
    }

    return agent;
  }

  /**
   * Get currently active agent
   */
  async getActiveAgent(): Promise<AgentConfig | null> {
    await this.ensureInitialized();

    const activeAgentId = await this.storage.getActiveAgent();
    if (!activeAgentId) return null;

    return await this.getAgent(activeAgentId);
  }

  /**
   * Activate an agent by ID
   */
  async activateAgent(agentId: string): Promise<AgentConfig> {
    await this.ensureInitialized();

    const agent = await this.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent with ID '${agentId}' not found`);
    }

    await this.storage.setActiveAgent(agentId);

    // Update last used timestamp
    agent.metadata.lastUsed = new Date().toISOString();
    agent.metadata.usageCount += 1;
    await this.storage.saveAgent(agent);

    console.log(`✅ Activated agent: ${agent.name} (${agent.id})`);
    return agent;
  }

  /**
   * Save a new or updated agent
   */
  async saveAgent(agent: AgentConfig): Promise<void> {
    await this.ensureInitialized();

    // Ensure timestamps are set
    const now = new Date().toISOString();
    if (!agent.created) {
      agent.created = now;
    }
    agent.modified = now;

    await this.storage.saveAgent(agent);
    console.log(`💾 Saved agent: ${agent.name} (${agent.id})`);
  }

  /**
   * Delete a custom agent
   */
  async deleteAgent(agentId: string): Promise<void> {
    await this.ensureInitialized();

    const agent = await this.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent with ID '${agentId}' not found`);
    }

    if (agent.category === 'built-in') {
      throw new Error('Cannot delete built-in agents');
    }

    // Check if this is the active agent
    const activeAgent = await this.storage.getActiveAgent();
    if (activeAgent === agentId) {
      // Deactivate by setting to null or default agent
      await this.storage.setActiveAgent('automation-specialist'); // Default fallback
    }

    await this.storage.deleteAgent(agentId, 'custom');
    console.log(`🗑️  Deleted agent: ${agent.name} (${agent.id})`);
  }

  /**
   * Search agents by name or description
   */
  async searchAgents(query: string): Promise<AgentInfo[]> {
    const allAgents = await this.listAgents();
    const searchTerm = query.toLowerCase();

    return allAgents.filter(agent => 
      agent.name.toLowerCase().includes(searchTerm) ||
      agent.description.toLowerCase().includes(searchTerm) ||
      agent.specialBehaviors.some(behavior => 
        behavior.toLowerCase().includes(searchTerm)
      )
    );
  }

  /**
   * Get registry statistics
   */
  async getRegistryStats(): Promise<AgentRegistryMetadata> {
    await this.ensureInitialized();
    return await this.storage.readRegistryMetadata();
  }

  /**
   * Export agent configuration for sharing
   */
  async exportAgent(agentId: string): Promise<string> {
    await this.ensureInitialized();

    const agent = await this.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent with ID '${agentId}' not found`);
    }

    // Create exportable version (remove usage metadata)
    const exportableAgent = {
      ...agent,
      metadata: {
        usageCount: 0,
        lastUsed: null,
        effectiveness: 0,
        userRating: 0,
      }
    };

    return JSON.stringify(exportableAgent, null, 2);
  }

  /**
   * Import agent from configuration string
   */
  async importAgent(configJson: string, overwrite = false): Promise<AgentConfig> {
    await this.ensureInitialized();

    let agent: AgentConfig;
    try {
      agent = JSON.parse(configJson) as AgentConfig;
    } catch (error) {
      throw new Error(`Invalid agent configuration: ${error}`);
    }

    // Validate required fields
    this.validateAgentConfig(agent);

    // Check if agent already exists
    const existingAgent = await this.getAgent(agent.id);
    if (existingAgent && !overwrite) {
      throw new Error(`Agent with ID '${agent.id}' already exists. Use overwrite=true to replace.`);
    }

    // Set as custom category for imported agents
    agent.category = 'custom';
    
    await this.saveAgent(agent);
    return agent;
  }

  /**
   * Update agent rating and effectiveness
   */
  async updateAgentMetrics(agentId: string, rating?: number, effectiveness?: number): Promise<void> {
    await this.ensureInitialized();

    const agent = await this.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent with ID '${agentId}' not found`);
    }

    if (rating !== undefined) {
      agent.metadata.userRating = Math.max(0, Math.min(5, rating));
    }

    if (effectiveness !== undefined) {
      agent.metadata.effectiveness = Math.max(0, Math.min(1, effectiveness));
    }

    await this.storage.saveAgent(agent);
  }

  /**
   * Ensure registry is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Convert AgentConfig to AgentInfo for display
   */
  private agentConfigToInfo(agent: AgentConfig, activeAgentId: string | null): AgentInfo {
    return {
      id: agent.id,
      name: agent.name,
      category: agent.category,
      description: agent.description,
      version: agent.version,
      author: agent.author,
      toolCount: agent.toolConfiguration.enabledTools.length,
      specialBehaviors: agent.capabilities.specialBehaviors,
      lastUsed: agent.metadata.lastUsed,
      effectiveness: agent.metadata.effectiveness,
      isActive: agent.id === activeAgentId,
    };
  }

  /**
   * Validate agent configuration
   */
  private validateAgentConfig(agent: any): asserts agent is AgentConfig {
    const required = ['id', 'name', 'version', 'description', 'systemPrompt'];
    
    for (const field of required) {
      if (!agent[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    if (!agent.capabilities || !agent.toolConfiguration) {
      throw new Error('Missing capabilities or toolConfiguration');
    }
  }
}