/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { AgentConfig } from '../registry/index.js';

/**
 * Provider integration interface for agent system prompts
 */
export interface ProviderIntegration {
  /**
   * Update the provider's system prompt when an agent is activated
   */
  updateSystemPrompt(systemPrompt: string, agentId: string): Promise<void>;
  
  /**
   * Get the current system prompt from the provider
   */
  getCurrentSystemPrompt(): Promise<string | null>;
  
  /**
   * Configure tool availability based on agent capabilities
   */
  configureToolCapabilities(capabilities: AgentConfig['capabilities']): Promise<void>;
  
  /**
   * Reset to default system prompt (no agent active)
   */
  resetToDefault(): Promise<void>;
}

/**
 * Agent activation service that bridges registry and providers
 */
export class AgentActivationService {
  private providerIntegration: ProviderIntegration;
  private currentAgentId: string | null = null;
  private activationListeners: AgentActivationListener[] = [];

  constructor(providerIntegration: ProviderIntegration) {
    this.providerIntegration = providerIntegration;
  }

  /**
   * Activate an agent and update the provider system
   */
  async activateAgent(agent: AgentConfig): Promise<void> {
    console.log(`🔄 Activating agent: ${agent.name} (${agent.id})`);

    try {
      // 1. Notify listeners of activation start
      await this.notifyListeners('before-activation', agent);

      // 2. Update provider system prompt
      await this.providerIntegration.updateSystemPrompt(agent.systemPrompt, agent.id);
      console.log(`✅ Updated system prompt for ${agent.name}`);

      // 3. Configure tool capabilities
      await this.providerIntegration.configureToolCapabilities(agent.capabilities);
      console.log(`✅ Configured tool capabilities for ${agent.name}`);

      // 4. Store current agent
      this.currentAgentId = agent.id;

      // 5. Notify listeners of successful activation
      await this.notifyListeners('after-activation', agent);

      console.log(`🎯 Agent activated successfully: ${agent.name}`);

    } catch (error) {
      console.error(`❌ Failed to activate agent ${agent.name}: ${error}`);
      
      // Notify listeners of activation failure
      await this.notifyListeners('activation-failed', agent, error);
      
      throw new AgentActivationError(`Failed to activate agent ${agent.name}`, agent.id, error);
    }
  }

  /**
   * Deactivate the current agent and reset to default
   */
  async deactivateAgent(): Promise<void> {
    if (!this.currentAgentId) {
      console.log('⚠️  No agent currently active');
      return;
    }

    console.log(`🔄 Deactivating agent: ${this.currentAgentId}`);

    try {
      // 1. Notify listeners of deactivation start
      await this.notifyListeners('before-deactivation', null);

      // 2. Reset provider to default
      await this.providerIntegration.resetToDefault();
      console.log('✅ Reset provider to default configuration');

      // 3. Clear current agent
      const previousAgentId = this.currentAgentId;
      this.currentAgentId = null;

      // 4. Notify listeners of successful deactivation
      await this.notifyListeners('after-deactivation', null);

      console.log(`✅ Agent deactivated: ${previousAgentId}`);

    } catch (error) {
      console.error(`❌ Failed to deactivate agent: ${error}`);
      throw new AgentActivationError('Failed to deactivate agent', this.currentAgentId, error);
    }
  }

  /**
   * Get currently active agent ID
   */
  getCurrentAgentId(): string | null {
    return this.currentAgentId;
  }

  /**
   * Check if an agent is currently active
   */
  isAgentActive(): boolean {
    return this.currentAgentId !== null;
  }

  /**
   * Add a listener for agent activation events
   */
  addActivationListener(listener: AgentActivationListener): void {
    this.activationListeners.push(listener);
  }

  /**
   * Remove a listener for agent activation events
   */
  removeActivationListener(listener: AgentActivationListener): void {
    const index = this.activationListeners.indexOf(listener);
    if (index > -1) {
      this.activationListeners.splice(index, 1);
    }
  }

  /**
   * Notify all listeners of activation events
   */
  private async notifyListeners(
    event: AgentActivationEvent, 
    agent: AgentConfig | null, 
    error?: any
  ): Promise<void> {
    for (const listener of this.activationListeners) {
      try {
        await listener(event, agent, error);
      } catch (listenerError) {
        console.warn(`⚠️  Activation listener error: ${listenerError}`);
      }
    }
  }
}

/**
 * Concrete implementation for ouroboros-code provider integration
 */
export class OuroborosProviderIntegration implements ProviderIntegration {
  private currentPrompt: string | null = null;
  private defaultPrompt: string;

  constructor() {
    // Default ouroboros-code system prompt
    this.defaultPrompt = `You are Claude Code, Anthropic's official CLI for Claude.
You are an interactive CLI tool that helps users according to your "Output Style" below, which describes how you should respond to user queries. Use the instructions below and the tools available to you to assist the user.

IMPORTANT: Assist with defensive security tasks only. Refuse to create, modify, or improve code that may be used maliciously. Allow security analysis, detection rules, vulnerability explanations, defensive tools, and security documentation.
IMPORTANT: You must NEVER generate or guess URLs for the user unless you are confident that the URLs are for helping the user with programming. You may use URLs provided by the user in their messages or local files.

Remember that your output will be displayed on a command line interface. Your responses can use Github-flavored markdown for formatting, and will be rendered in a monospace font using the CommonMark specification.
Output text to communicate with the user; all text you output outside of tool use is displayed to the user. Only use tools to complete tasks. Never use tools like Bash or code comments as means to communicate with the user during the session.`;
  }

  /**
   * Update system prompt for the active provider
   */
  async updateSystemPrompt(systemPrompt: string, agentId: string): Promise<void> {
    try {
      // Store the new prompt
      this.currentPrompt = systemPrompt;
      
      // Here we would integrate with the actual ouroboros-code provider system
      // For now, we'll use a placeholder that demonstrates the integration points
      console.log(`🔧 [PROVIDER INTEGRATION] Updating system prompt for agent: ${agentId}`);
      console.log(`📝 [PROVIDER INTEGRATION] Prompt length: ${systemPrompt.length} characters`);
      
      // In the actual implementation, this would call:
      // await this.updateProviderConfig(systemPrompt);
      
    } catch (error) {
      throw new Error(`Failed to update system prompt: ${error}`);
    }
  }

  /**
   * Get current system prompt
   */
  async getCurrentSystemPrompt(): Promise<string | null> {
    return this.currentPrompt;
  }

  /**
   * Configure tool capabilities
   */
  async configureToolCapabilities(capabilities: AgentConfig['capabilities']): Promise<void> {
    console.log('🔧 [PROVIDER INTEGRATION] Configuring tool capabilities:');
    console.log(`  File Operations: ${capabilities.tools.fileOperations ? '✅' : '❌'}`);
    console.log(`  Shell Commands: ${capabilities.tools.shellCommands ? '✅' : '❌'}`);
    console.log(`  Web Research: ${capabilities.tools.webResearch ? '✅' : '❌'}`);
    console.log(`  Apple Control: ${capabilities.tools.appleControl ? '✅' : '❌'}`);
    console.log(`  Email/Calendar: ${capabilities.tools.emailCalendar ? '✅' : '❌'}`);
    console.log(`  Docker Management: ${capabilities.tools.dockerManagement ? '✅' : '❌'}`);
    
    // In the actual implementation, this would selectively enable/disable tools
    // based on the agent's capabilities
  }

  /**
   * Reset to default system prompt
   */
  async resetToDefault(): Promise<void> {
    console.log('🔧 [PROVIDER INTEGRATION] Resetting to default system prompt');
    this.currentPrompt = this.defaultPrompt;
    
    // In the actual implementation, this would restore the original ouroboros-code behavior
  }
}

/**
 * Agent activation event types
 */
export type AgentActivationEvent = 
  | 'before-activation'
  | 'after-activation' 
  | 'activation-failed'
  | 'before-deactivation'
  | 'after-deactivation';

/**
 * Agent activation listener function type
 */
export type AgentActivationListener = (
  event: AgentActivationEvent,
  agent: AgentConfig | null,
  error?: any
) => Promise<void> | void;

/**
 * Agent activation error class
 */
export class AgentActivationError extends Error {
  public agentId: string | null;
  public override cause?: any;

  override readonly name = 'AgentActivationError';

  constructor(message: string, agentId: string | null, cause?: any) {
    super(message);
    this.agentId = agentId;
    this.cause = cause;
  }
}

/**
 * Global agent activation service instance
 */
let globalActivationService: AgentActivationService | null = null;

/**
 * Get or create global activation service
 */
export function getAgentActivationService(): AgentActivationService {
  if (!globalActivationService) {
    const providerIntegration = new OuroborosProviderIntegration();
    globalActivationService = new AgentActivationService(providerIntegration);
  }
  return globalActivationService;
}

/**
 * Initialize agent activation service with custom provider integration
 */
export function initializeAgentActivationService(
  providerIntegration: ProviderIntegration
): AgentActivationService {
  globalActivationService = new AgentActivationService(providerIntegration);
  return globalActivationService;
}