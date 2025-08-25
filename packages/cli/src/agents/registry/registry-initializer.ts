/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { AgentRegistry } from './agent-registry.js';
import { AgentStorage } from './agent-storage.js';
import { BUILT_IN_AGENTS } from './built-in-agents.js';

/**
 * Registry initialization and management
 */
export class RegistryInitializer {
  private registry: AgentRegistry;
  private storage: AgentStorage;

  constructor() {
    this.registry = new AgentRegistry();
    this.storage = new AgentStorage();
  }

  /**
   * Initialize the complete agent registry system
   */
  async initialize(): Promise<void> {
    console.log('🤖 Initializing Ouroboros Agent Registry...');

    try {
      // 1. Initialize storage directories
      await this.storage.initialize();
      console.log('✅ Storage directories initialized');

      // 2. Initialize registry
      await this.registry.initialize();
      console.log('✅ Agent registry initialized');

      // 3. Install built-in agents
      await this.installBuiltInAgents();
      console.log('✅ Built-in agents installed');

      // 4. Set default active agent if none is set
      await this.ensureDefaultActiveAgent();
      console.log('✅ Default active agent configured');

      // 5. Verify installation
      const stats = await this.registry.getRegistryStats();
      console.log(`✅ Registry ready: ${stats.agentCount.builtIn} built-in, ${stats.agentCount.custom} custom agents`);

    } catch (error) {
      console.error('❌ Failed to initialize agent registry:', error);
      throw error;
    }
  }

  /**
   * Install or update built-in agents
   */
  private async installBuiltInAgents(): Promise<void> {
    console.log('📦 Installing built-in agents...');

    for (const agent of BUILT_IN_AGENTS) {
      try {
        // Check if agent already exists
        const existingAgent = await this.storage.loadAgent(agent.id, 'built-in');
        
        if (existingAgent) {
          // Check if update is needed (compare versions)
          if (this.shouldUpdateAgent(existingAgent, agent)) {
            console.log(`🔄 Updating built-in agent: ${agent.name} (${existingAgent.version} → ${agent.version})`);
            
            // Preserve usage metadata when updating
            agent.metadata = {
              ...agent.metadata,
              usageCount: existingAgent.metadata.usageCount,
              lastUsed: existingAgent.metadata.lastUsed,
              // Only update effectiveness and rating if they're better
              effectiveness: Math.max(existingAgent.metadata.effectiveness, agent.metadata.effectiveness),
              userRating: Math.max(existingAgent.metadata.userRating, agent.metadata.userRating),
            };
            
            await this.storage.saveAgent(agent);
          } else {
            console.log(`✓ Built-in agent up to date: ${agent.name}`);
          }
        } else {
          // New installation
          console.log(`📥 Installing built-in agent: ${agent.name}`);
          await this.storage.saveAgent(agent);
        }
      } catch (error) {
        console.warn(`⚠️  Failed to install agent ${agent.id}: ${error}`);
      }
    }
  }

  /**
   * Ensure there's a default active agent
   */
  private async ensureDefaultActiveAgent(): Promise<void> {
    const activeAgent = await this.storage.getActiveAgent();
    
    if (!activeAgent) {
      // Set automation specialist as default
      const defaultAgentId = 'automation-specialist';
      const defaultAgent = await this.storage.loadAgent(defaultAgentId, 'built-in');
      
      if (defaultAgent) {
        await this.storage.setActiveAgent(defaultAgentId);
        console.log(`🎯 Set default active agent: ${defaultAgent.name}`);
      } else {
        // Fallback to any available built-in agent
        const agents = await this.registry.getAgentsByCategory('built-in');
        if (agents.length > 0) {
          await this.storage.setActiveAgent(agents[0].id);
          console.log(`🎯 Set fallback active agent: ${agents[0].name}`);
        }
      }
    }
  }

  /**
   * Check if an agent should be updated
   */
  private shouldUpdateAgent(existing: any, newAgent: any): boolean {
    // Simple version comparison - update if versions don't match
    return existing.version !== newAgent.version;
  }

  /**
   * Get the initialized registry instance
   */
  getRegistry(): AgentRegistry {
    return this.registry;
  }

  /**
   * Perform system health check
   */
  async performHealthCheck(): Promise<HealthCheckResult> {
    const result: HealthCheckResult = {
      status: 'healthy',
      issues: [],
      agentCount: { builtIn: 0, custom: 0 },
      activeAgent: null,
      registryVersion: '1.0.0',
    };

    try {
      // Check agent counts
      const stats = await this.registry.getRegistryStats();
      result.agentCount = stats.agentCount;
      result.registryVersion = stats.version;

      // Check active agent
      const activeAgent = await this.registry.getActiveAgent();
      result.activeAgent = activeAgent ? {
        id: activeAgent.id,
        name: activeAgent.name,
        version: activeAgent.version,
      } : null;

      // Verify built-in agents are present
      for (const builtInAgent of BUILT_IN_AGENTS) {
        const agent = await this.storage.loadAgent(builtInAgent.id, 'built-in');
        if (!agent) {
          result.issues.push(`Missing built-in agent: ${builtInAgent.name}`);
          result.status = 'degraded';
        }
      }

      // Check for orphaned active agent
      if (result.activeAgent && !await this.registry.getAgent(result.activeAgent.id)) {
        result.issues.push('Active agent not found in registry');
        result.status = 'degraded';
      }

      if (result.issues.length === 0) {
        result.status = 'healthy';
      }

    } catch (error) {
      result.status = 'unhealthy';
      result.issues.push(`Registry error: ${error}`);
    }

    return result;
  }

  /**
   * Repair registry issues
   */
  async repairRegistry(): Promise<void> {
    console.log('🔧 Performing registry repairs...');

    const healthCheck = await this.performHealthCheck();

    // Reinstall missing built-in agents
    for (const issue of healthCheck.issues) {
      if (issue.includes('Missing built-in agent')) {
        console.log(`🔄 Reinstalling built-in agents...`);
        await this.installBuiltInAgents();
        break;
      }
    }

    // Fix orphaned active agent
    if (healthCheck.issues.some(issue => issue.includes('Active agent not found'))) {
      console.log('🔄 Fixing active agent reference...');
      await this.ensureDefaultActiveAgent();
    }

    console.log('✅ Registry repairs completed');
  }
}

/**
 * Health check result interface
 */
export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  issues: string[];
  agentCount: {
    builtIn: number;
    custom: number;
  };
  activeAgent: {
    id: string;
    name: string;
    version: string;
  } | null;
  registryVersion: string;
}

/**
 * Singleton instance for global registry access
 */
let globalInitializer: RegistryInitializer | null = null;

/**
 * Get or create global registry initializer
 */
export function getRegistryInitializer(): RegistryInitializer {
  if (!globalInitializer) {
    globalInitializer = new RegistryInitializer();
  }
  return globalInitializer;
}

/**
 * Initialize global registry (call once at startup)
 */
export async function initializeGlobalRegistry(): Promise<AgentRegistry> {
  const initializer = getRegistryInitializer();
  await initializer.initialize();
  return initializer.getRegistry();
}