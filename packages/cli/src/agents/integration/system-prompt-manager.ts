/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { AgentConfig } from '../registry/agent-storage.js';
import { SystemPromptOptions } from '../../../core/src/core/prompts.js';

/**
 * Enhanced system prompt manager that integrates agent-specific prompts
 * with the core Ouroboros system prompt infrastructure
 */
export class SystemPromptManager {
  private agentSystemPromptCache = new Map<string, string>();
  private baseSystemPrompt: string = '';
  
  constructor() {
    this.initializeBasePrompt();
  }

  /**
   * Build comprehensive system prompt by combining agent-specific prompt
   * with core system prompts and capabilities
   */
  buildSystemPrompt(
    agent: AgentConfig,
    baseSystemPromptOptions?: SystemPromptOptions,
    userMemory?: string
  ): string {
    const cacheKey = this.buildCacheKey(agent, baseSystemPromptOptions, userMemory);
    
    // Check cache first
    if (this.agentSystemPromptCache.has(cacheKey)) {
      return this.agentSystemPromptCache.get(cacheKey)!;
    }

    const promptSections: string[] = [];

    // 1. Start with base core system prompt
    if (this.baseSystemPrompt) {
      promptSections.push(this.baseSystemPrompt);
    }

    // 2. Add agent identification and role
    promptSections.push(this.buildAgentIdentitySection(agent));

    // 3. Add agent-specific system prompt
    if (agent.systemPrompt) {
      promptSections.push('## Agent-Specific Instructions\n\n' + agent.systemPrompt);
    }

    // 4. Add agent capabilities
    if (agent.capabilities && agent.capabilities.length > 0) {
      promptSections.push(this.buildCapabilitiesSection(agent.capabilities));
    }

    // 5. Add tool configuration context
    if (agent.toolConfiguration) {
      promptSections.push(this.buildToolConfigurationSection(agent.toolConfiguration));
    }

    // 6. Add behavioral guidelines
    if (agent.specialBehaviors && agent.specialBehaviors.length > 0) {
      promptSections.push(this.buildBehaviorSection(agent.specialBehaviors));
    }

    // 7. Add examples if available
    if (agent.examples && agent.examples.length > 0) {
      promptSections.push(this.buildExamplesSection(agent.examples));
    }

    // 8. Add user memory context if provided
    if (userMemory) {
      promptSections.push('## User Context and Memory\n\n' + userMemory);
    }

    // 9. Add custom prompt overrides if specified
    if (baseSystemPromptOptions?.customPrompt) {
      promptSections.push('## Custom Instructions\n\n' + baseSystemPromptOptions.customPrompt);
    }

    // Combine all sections
    const finalPrompt = promptSections.join('\n\n');
    
    // Cache the result
    this.agentSystemPromptCache.set(cacheKey, finalPrompt);
    
    return finalPrompt;
  }

  /**
   * Build agent identity section
   */
  private buildAgentIdentitySection(agent: AgentConfig): string {
    let identity = `## Agent Identity\n\n`;
    identity += `You are **${agent.name}**, a specialized AI agent.\n\n`;
    
    if (agent.description) {
      identity += `**Role**: ${agent.description}\n\n`;
    }
    
    identity += `**Category**: ${agent.category}\n`;
    identity += `**Version**: ${agent.version}\n`;
    
    if (agent.author) {
      identity += `**Created by**: ${agent.author}\n`;
    }

    return identity;
  }

  /**
   * Build capabilities section
   */
  private buildCapabilitiesSection(capabilities: string[]): string {
    let section = `## Your Capabilities\n\n`;
    section += 'You have been specifically configured with the following capabilities:\n\n';
    
    capabilities.forEach((capability, index) => {
      section += `${index + 1}. ${capability}\n`;
    });

    return section;
  }

  /**
   * Build tool configuration section
   */
  private buildToolConfigurationSection(toolConfig: any): string {
    let section = `## Available Tools and Integration\n\n`;
    
    if (toolConfig.enabledTools && toolConfig.enabledTools.length > 0) {
      section += `**Enabled Tools**: ${toolConfig.enabledTools.join(', ')}\n\n`;
      section += 'Use these tools appropriately to accomplish tasks efficiently.\n\n';
    }

    if (toolConfig.enableBuiltinTools) {
      section += '**Built-in Tools**: Enabled - You have access to file operations, web search, and system tools.\n\n';
    }

    if (toolConfig.enableMCP) {
      section += '**MCP Integration**: Enabled - You can use advanced Model Context Protocol tools for enhanced functionality.\n\n';
    }

    return section;
  }

  /**
   * Build behavioral guidelines section
   */
  private buildBehaviorSection(behaviors: string[]): string {
    let section = `## Behavioral Guidelines\n\n`;
    section += 'Please adhere to these specific behavioral guidelines:\n\n';
    
    behaviors.forEach((behavior, index) => {
      section += `${index + 1}. ${behavior}\n`;
    });

    return section;
  }

  /**
   * Build examples section
   */
  private buildExamplesSection(examples: any[]): string {
    let section = `## Examples and Usage Patterns\n\n`;
    
    examples.forEach((example, index) => {
      section += `### Example ${index + 1}${example.description ? `: ${example.description}` : ''}\n\n`;
      
      if (example.input) {
        section += `**Input**: ${example.input}\n\n`;
      }
      
      if (example.output) {
        section += `**Expected Output**: ${example.output}\n\n`;
      }
      
      if (example.explanation) {
        section += `**Explanation**: ${example.explanation}\n\n`;
      }
    });

    return section;
  }

  /**
   * Initialize base system prompt from core system
   */
  private initializeBasePrompt(): void {
    // This would integrate with the core system's getCoreSystemPrompt function
    // For now, we'll use a basic prompt that matches the Ouroboros system
    this.baseSystemPrompt = `# Ouroboros Multi-Agent AI System

You are operating within Ouroboros, a next-generation multi-LLM CLI framework that provides:

- **Multi-Provider Support**: Access to multiple LLM providers (OpenAI, Anthropic, Gemini)
- **Advanced Tool Integration**: Built-in tools and MCP (Model Context Protocol) capabilities  
- **Workflow Management**: Sophisticated workflow planning and execution
- **Session Management**: Context preservation across sessions
- **Agent-Based Architecture**: Specialized AI agents for different tasks

## Core Principles

1. **Tool Usage**: Proactively use available tools to accomplish tasks effectively
2. **Workflow Awareness**: Consider creating workflows for multi-step processes
3. **Context Preservation**: Maintain context and state across interactions
4. **Security**: Follow security best practices, never expose sensitive information
5. **User Focus**: Always prioritize user goals and provide actionable solutions`;
  }

  /**
   * Build cache key for system prompt caching
   */
  private buildCacheKey(
    agent: AgentConfig,
    baseOptions?: SystemPromptOptions,
    userMemory?: string
  ): string {
    const parts = [
      agent.id,
      agent.version,
      JSON.stringify(agent.capabilities || []),
      JSON.stringify(agent.specialBehaviors || []),
      JSON.stringify(agent.toolConfiguration || {}),
      baseOptions?.customPrompt || '',
      baseOptions?.flavour || '',
      userMemory || ''
    ];
    
    return parts.join('|');
  }

  /**
   * Clear the prompt cache (e.g., when agent is updated)
   */
  clearCache(agentId?: string): void {
    if (agentId) {
      // Clear cache entries for specific agent
      const keysToDelete: string[] = [];
      for (const key of this.agentSystemPromptCache.keys()) {
        if (key.startsWith(agentId + '|')) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => this.agentSystemPromptCache.delete(key));
    } else {
      // Clear entire cache
      this.agentSystemPromptCache.clear();
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; agentCount: number } {
    const agentIds = new Set<string>();
    for (const key of this.agentSystemPromptCache.keys()) {
      const agentId = key.split('|')[0];
      agentIds.add(agentId);
    }

    return {
      size: this.agentSystemPromptCache.size,
      agentCount: agentIds.size
    };
  }

  /**
   * Update base system prompt (e.g., when core system changes)
   */
  updateBasePrompt(newBasePrompt: string): void {
    this.baseSystemPrompt = newBasePrompt;
    this.clearCache(); // Clear cache as base prompt changed
  }

  /**
   * Generate a system prompt validation report
   */
  validateSystemPrompt(agent: AgentConfig, prompt: string): {
    isValid: boolean;
    warnings: string[];
    suggestions: string[];
  } {
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Check prompt length
    if (prompt.length > 50000) {
      warnings.push('System prompt is very long (>50k chars) - may impact performance');
    }

    // Check for agent identity
    if (!prompt.includes(agent.name)) {
      warnings.push('System prompt does not mention the agent name - may cause confusion');
    }

    // Check for tool configuration mentions
    if (agent.toolConfiguration?.enabledTools?.length > 0 && !prompt.toLowerCase().includes('tool')) {
      suggestions.push('Consider mentioning available tools in the system prompt');
    }

    // Check for examples
    if (!agent.examples || agent.examples.length === 0) {
      suggestions.push('Adding examples can improve agent performance and consistency');
    }

    return {
      isValid: warnings.length === 0,
      warnings,
      suggestions
    };
  }
}

/**
 * Global system prompt manager instance
 */
let globalPromptManager: SystemPromptManager | null = null;

/**
 * Get global system prompt manager
 */
export function getSystemPromptManager(): SystemPromptManager {
  if (!globalPromptManager) {
    globalPromptManager = new SystemPromptManager();
  }
  return globalPromptManager;
}