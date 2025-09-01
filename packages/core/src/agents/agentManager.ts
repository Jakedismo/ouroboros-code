/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { getAgentById, type AgentPersona } from './personas.js';
import type { Config } from '../config/config.js';
import { injectToolExamples } from './toolInjector.js';

/**
 * Manages active agents and their integration with the system prompt
 */
export class AgentManager {
  private static instance: AgentManager | null = null;
  private activeAgents = new Set<string>();
  private config: Config | null = null;
  private baseSystemPrompt = '';

  private constructor() {}

  static getInstance(): AgentManager {
    if (!AgentManager.instance) {
      AgentManager.instance = new AgentManager();
    }
    return AgentManager.instance;
  }

  /**
   * Initialize the agent manager with the config instance
   */
  initialize(config: Config): void {
    this.config = config;
    // Store the original system prompt so we can restore it
    this.baseSystemPrompt = this.getCurrentSystemPrompt();
  }

  /**
   * Get the current system prompt from config
   */
  private getCurrentSystemPrompt(): string {
    if (!this.config) return '';
    
    // Try to get current system prompt from config
    // This might need to be adapted based on how Config stores system prompts
    return this.config.getSystemPrompt?.() || '';
  }

  /**
   * Activate an agent by adding its expertise to the system prompt
   */
  async activateAgent(agentId: string): Promise<{ success: boolean; message: string; agent?: AgentPersona }> {
    const agent = getAgentById(agentId);
    if (!agent) {
      return {
        success: false,
        message: `Agent not found: ${agentId}`,
      };
    }

    if (this.activeAgents.has(agentId)) {
      return {
        success: false,
        message: `Agent ${agent.name} is already active`,
        agent,
      };
    }

    if (!this.config) {
      return {
        success: false,
        message: 'Agent manager not initialized with config',
      };
    }

    // Add agent to active set
    this.activeAgents.add(agentId);

    // Regenerate the combined system prompt
    await this.updateSystemPrompt();

    return {
      success: true,
      message: `${agent.name} activated successfully`,
      agent,
    };
  }

  /**
   * Deactivate an agent by removing its expertise from the system prompt
   */
  async deactivateAgent(agentId: string): Promise<{ success: boolean; message: string; agent?: AgentPersona }> {
    const agent = getAgentById(agentId);
    if (!agent) {
      return {
        success: false,
        message: `Agent not found: ${agentId}`,
      };
    }

    if (!this.activeAgents.has(agentId)) {
      return {
        success: false,
        message: `Agent ${agent.name} is not currently active`,
        agent,
      };
    }

    // Remove agent from active set
    this.activeAgents.delete(agentId);

    // Regenerate the combined system prompt
    await this.updateSystemPrompt();

    return {
      success: true,
      message: `${agent.name} deactivated successfully`,
      agent,
    };
  }

  /**
   * Get all currently active agents
   */
  getActiveAgents(): AgentPersona[] {
    return Array.from(this.activeAgents)
      .map(id => getAgentById(id))
      .filter(Boolean) as AgentPersona[];
  }

  /**
   * Check if an agent is active
   */
  isAgentActive(agentId: string): boolean {
    return this.activeAgents.has(agentId);
  }

  /**
   * Deactivate all agents
   */
  async deactivateAllAgents(): Promise<void> {
    this.activeAgents.clear();
    await this.updateSystemPrompt();
  }

  /**
   * Update the system prompt by combining base prompt with active agent prompts
   */
  private async updateSystemPrompt(): Promise<void> {
    if (!this.config) return;

    let combinedPrompt = this.baseSystemPrompt;
    const activeAgentsList = this.getActiveAgents();

    if (activeAgentsList.length > 0) {
      // Add agent coordination section
      combinedPrompt += `\n\n# ACTIVE SPECIALIST AGENTS

You now have access to the expertise of ${activeAgentsList.length} specialist agent(s). Each agent brings deep domain knowledge that you should leverage when relevant to the user's request.

## Active Specialists:
${activeAgentsList.map(agent => `• ${agent.emoji} **${agent.name}** - ${agent.description}`).join('\n')}

## Agent Integration Guidelines:
1. **Identify Relevant Expertise**: When the user's request relates to an active agent's specialty, integrate that agent's knowledge
2. **Multi-Agent Collaboration**: For complex tasks, combine insights from multiple relevant agents
3. **Maintain Agent Personas**: When acting on behalf of an agent, reflect their specific expertise and approach
4. **Agent Communication**: You can reference agents explicitly (e.g., "As the Systems Architect would recommend...")

---

# SPECIALIST AGENT KNOWLEDGE BASE

${activeAgentsList.map(agent => this.formatAgentPrompt(agent)).join('\n\n---\n\n')}

---

# END AGENT KNOWLEDGE BASE

Remember: You now have access to the combined expertise above. Use it appropriately based on the user's needs.`;
    }

    // Update the system prompt in the config
    await this.setSystemPrompt(combinedPrompt);
  }

  /**
   * Format an agent's system prompt for integration
   */
  private formatAgentPrompt(agent: AgentPersona): string {
    // Inject tool usage examples into the agent's system prompt
    const enhancedPrompt = injectToolExamples(agent.systemPrompt, agent.specialties);
    
    return `## ${agent.emoji} ${agent.name} (${agent.id})

**Category**: ${agent.category}
**Specialties**: ${agent.specialties.join(', ')}

**Expert Knowledge & Approach**:
${enhancedPrompt}

**When to engage this specialist**: When users ask about ${agent.specialties.slice(0, 3).join(', ')}, or related topics in ${agent.category}.`;
  }

  /**
   * Set the system prompt in the config
   * This method needs to be implemented based on how Config handles system prompts
   */
  private async setSystemPrompt(prompt: string): Promise<void> {
    if (!this.config) return;

    // This is the key integration point - we need to actually modify the system prompt
    // The exact implementation depends on how Config stores and applies system prompts
    
    try {
      // Option 1: If Config has a setSystemPrompt method
      if (typeof this.config.setSystemPrompt === 'function') {
        await this.config.setSystemPrompt(prompt);
      }
      // Option 2: If we need to recreate the client with new prompt
      else if (typeof this.config.refreshAuth === 'function') {
        // Store the prompt temporarily and refresh the client
        (this.config as any).agentSystemPrompt = prompt;
        const authType = this.config.getContentGeneratorConfig()?.authType;
        if (authType) {
          await this.config.refreshAuth(authType);
        }
      }
      // Option 3: Direct property setting (if accessible)
      else {
        (this.config as any).systemPrompt = prompt;
      }
    } catch (error) {
      console.error('Failed to update system prompt with agent expertise:', error);
    }
  }

  /**
   * Get statistics about agent usage
   */
  getAgentStats(): {
    totalAgents: number;
    activeAgents: number;
    activeCategories: string[];
    combinedSpecialties: string[];
  } {
    const activeAgentsList = this.getActiveAgents();
    const activeCategories = [...new Set(activeAgentsList.map(a => a.category))];
    const combinedSpecialties = [...new Set(activeAgentsList.flatMap(a => a.specialties))];

    return {
      totalAgents: 50, // We know we have 50 agents
      activeAgents: activeAgentsList.length,
      activeCategories,
      combinedSpecialties,
    };
  }

  /**
   * Save active agents state (for persistence across sessions)
   */
  saveState(): string[] {
    return Array.from(this.activeAgents);
  }

  /**
   * Restore active agents state
   */
  async restoreState(agentIds: string[]): Promise<void> {
    // Clear current state
    this.activeAgents.clear();
    
    // Restore agent IDs
    for (const agentId of agentIds) {
      if (getAgentById(agentId)) {
        this.activeAgents.add(agentId);
      }
    }

    // Update system prompt with restored agents
    await this.updateSystemPrompt();
  }
}