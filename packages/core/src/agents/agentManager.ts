/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { getAgentById, type AgentPersona } from './personas.js';
import type { Config } from '../config/config.js';
import {
  injectToolExamples,
  buildSharedToolingAppendix,
  type SlashCommandSummary,
} from './toolInjector.js';

/**
 * Manages active agents and their integration with the system prompt
 */
export class AgentManager {
  private static instance: AgentManager | null = null;
  private activeAgents = new Set<string>();
  private config: Config | null = null;
  private slashCommandSummaries: SlashCommandSummary[] | null = null;

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
    this.slashCommandSummaries = null;
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

  setSlashCommandSummaries(summaries: SlashCommandSummary[]): void {
    this.slashCommandSummaries = [...summaries];
    if (this.config && this.activeAgents.size > 0) {
      void this.updateSystemPrompt();
    }
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
    if (!this.config) {
      return;
    }

    const activeAgentsList = this.getActiveAgents();

    if (activeAgentsList.length === 0) {
      await this.config.clearSystemPrompt();
      return;
    }

    const basePrompt = this.config.getBaseSystemPrompt().trim();
    const rosterLines = activeAgentsList
      .map(
        (agent) =>
          `• ${agent.emoji} **${agent.name}** (${agent.id}) — ${agent.description}`,
      )
      .join('\n');

    const personaSections = activeAgentsList
      .map((agent) => this.formatAgentPrompt(agent))
      .join('\n\n---\n\n');

    const sharedAppendix = buildSharedToolingAppendix(this.config, {
      slashCommandSummaries: this.slashCommandSummaries ?? undefined,
    });

    const combinedPrompt = [
      basePrompt,
      '---',
      '# ACTIVE SPECIALIST AGENTS',
      `You now have access to the expertise of ${activeAgentsList.length} specialist agent(s). Leverage their strengths when relevant to the user\'s request and coordinate tightly so plans stay cohesive.`,
      '## Active Specialists:',
      rosterLines,
      '## Collaboration Protocol:',
      '1. **Targeted Delegation** — Route sub-tasks to the specialist whose skills best match the need. Avoid redundant parallel work.',
      '2. **Evidence First** — Cite the repository evidence (tool outputs, file paths, logs) each specialist uses so the orchestrator can audit reasoning.',
      '3. **Tight Feedback Loop** — Summaries must be concise, highlight blockers, and propose next steps or handoffs explicitly.',
      '---',
      '# SPECIALIST AGENT DOSSIER',
      personaSections,
      '---',
      '# SHARED TOOLING APPENDIX',
      sharedAppendix,
      '---',
      '# END AGENT KNOWLEDGE BASE',
      'Remember: invoke specialists deliberately, respect their guardrails, and fall back to the base prompt when no specialist insight is needed.',
    ]
      .filter((section) => section && section.length > 0)
      .join('\n\n');

    await this.setSystemPrompt(combinedPrompt);
  }

  /**
   * Format an agent's system prompt for integration
   */
  private formatAgentPrompt(agent: AgentPersona): string {
    const specialties = agent.specialties
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    const primarySpecialties = specialties.slice(0, 5);
    const engagementHints =
      primarySpecialties.length > 0
        ? primarySpecialties.map((entry) => `- ${entry}`).join('\n')
        : '- Apply judgement for ambiguous domain questions.';

    const personaPrimer = injectToolExamples(agent.systemPrompt, specialties, {
      includeSharedAppendix: false,
    });

    return [
      `## ${agent.emoji} ${agent.name} (${agent.id})`,
      `**Category**: ${agent.category}`,
      `**Mission Statement**: ${agent.description}`,
      '### When to Pull This Specialist In',
      engagementHints,
      '### Working Agreements',
      '- Respond with short, evidence-backed updates tailored to the orchestrator. Highlight blockers immediately.',
      '- Escalate when requirements are ambiguous or conflicting. Recommend which agent should assist next.',
      '- Keep deliverables reproducible: reference exact files, commands, and verification steps.',
      '### Specialist Playbook',
      personaPrimer,
    ].join('\n\n');
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