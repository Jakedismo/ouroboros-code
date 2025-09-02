/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { AgentSelectorService } from './agentSelectorService.js';
import { AgentManager } from './agentManager.js';
import type { AgentPersona } from './personas.js';

/**
 * Orchestrates automatic agent selection and conversation flow integration
 */
export class ConversationOrchestrator {
  private static instance: ConversationOrchestrator | null = null;
  private agentSelectorService: AgentSelectorService;
  private agentManager: AgentManager;

  private constructor() {
    this.agentSelectorService = AgentSelectorService.getInstance();
    this.agentManager = AgentManager.getInstance();
  }

  static getInstance(): ConversationOrchestrator {
    if (!ConversationOrchestrator.instance) {
      ConversationOrchestrator.instance = new ConversationOrchestrator();
    }
    return ConversationOrchestrator.instance;
  }

  /**
   * Initialize the orchestrator with OpenAI API key for agent selection
   */
  async initialize(openaiApiKey: string): Promise<void> {
    await this.agentSelectorService.initialize(openaiApiKey);
  }

  /**
   * Process a user prompt with streaming agent selection
   */
  async *processPromptWithAutoSelectionStream(userPrompt: string): AsyncGenerator<{
    type: 'progress' | 'complete';
    message?: string;
    shouldProceed?: boolean;
    selectionFeedback?: {
      selectedAgents: AgentPersona[];
      reasoning: string;
      confidence: number;
      processingTime: number;
    };
    previousAgentState?: string[];
  }> {
    // Check if we should apply automatic agent selection
    if (!this.agentSelectorService.isAutoModeEnabled()) {
      yield { type: 'complete', shouldProceed: true };
      return;
    }

    // Skip automatic selection for slash commands and @ commands
    if (this.isCommand(userPrompt)) {
      yield { type: 'complete', shouldProceed: true };
      return;
    }

    try {
      // Store current agent state for restoration
      const previousAgentState = this.agentManager.getActiveAgents().map(a => a.id);

      // Stream agent selection process
      const selectionStream = this.agentSelectorService.analyzeAndSelectAgentsStream(userPrompt);
      
      let finalResult: any = null;

      for await (const event of selectionStream) {
        if (event.type === 'progress') {
          yield { type: 'progress', message: event.message };
        } else if (event.type === 'complete') {
          finalResult = event;
        }
      }

      if (finalResult && finalResult.selectedAgents.length > 0) {
        // Temporarily activate selected agents
        await this.agentSelectorService.temporarilyActivateAgents(
          finalResult.selectedAgents
        );

        yield {
          type: 'complete',
          shouldProceed: true,
          selectionFeedback: finalResult,
          previousAgentState,
        };
      } else {
        yield { type: 'complete', shouldProceed: true };
      }
    } catch (error) {
      console.error('Automatic agent selection failed:', error);
      yield { type: 'complete', shouldProceed: true };
    }
  }

  /**
   * Process a user prompt with automatic agent selection if enabled (legacy method)
   * Returns selection info and feedback for the user
   */
  async processPromptWithAutoSelection(userPrompt: string, promptParts: any[]): Promise<{
    shouldProceed: boolean;
    selectionFeedback?: {
      selectedAgents: AgentPersona[];
      reasoning: string;
      confidence: number;
      processingTime: number;
    };
    previousAgentState?: string[];
  }> {
    // Check if we should apply automatic agent selection
    if (!this.agentSelectorService.isAutoModeEnabled()) {
      return { shouldProceed: true };
    }

    // Skip automatic selection for slash commands and @ commands
    if (this.isCommand(userPrompt)) {
      return { shouldProceed: true };
    }

    try {
      // Analyze prompt and select appropriate agents
      const selectionResult = await this.agentSelectorService.analyzeAndSelectAgents(userPrompt);
      
      if (selectionResult.selectedAgents.length === 0) {
        // No agents selected, continue without modification
        return { shouldProceed: true };
      }

      // Store current agent state for restoration
      const previousAgentState = this.agentManager.getActiveAgents().map(a => a.id);

      // Temporarily activate selected agents
      await this.agentSelectorService.temporarilyActivateAgents(
        selectionResult.selectedAgents
      );

      return {
        shouldProceed: true,
        selectionFeedback: selectionResult,
        previousAgentState,
      };
    } catch (error) {
      console.error('Automatic agent selection failed:', error);
      // Continue without agent selection if there's an error
      return { shouldProceed: true };
    }
  }

  /**
   * Restore previous agent state after conversation turn
   */
  async restorePreviousAgentState(previousAgentState: string[]): Promise<void> {
    if (!previousAgentState) return;
    
    await this.agentSelectorService.restorePreviousAgentState(previousAgentState);
  }

  /**
   * Generate user feedback message about agent selection
   */
  generateSelectionFeedback(selectionInfo: {
    selectedAgents: AgentPersona[];
    reasoning: string;
    confidence: number;
    processingTime: number;
  }): {
    type: 'INFO';
    text: string;
  } {
    const agentsList = selectionInfo.selectedAgents
      .map(agent => `${agent.emoji} **${agent.name}**`)
      .join(', ');

    const confidenceEmoji = selectionInfo.confidence > 0.8 ? '🎯' : 
                          selectionInfo.confidence > 0.6 ? '🎲' : '🤔';

    return {
      type: 'INFO',
      text: `${confidenceEmoji} **Auto-Selected Specialists:** ${agentsList}

**AI Reasoning:** ${selectionInfo.reasoning}

**Selection Quality:** ${(selectionInfo.confidence * 100).toFixed(0)}% confidence • ${selectionInfo.processingTime}ms

*These specialists are temporarily active for this conversation turn.*`
    };
  }

  /**
   * Check if a prompt is a command that should skip agent selection
   */
  private isCommand(prompt: string): boolean {
    const trimmed = prompt.trim();
    return trimmed.startsWith('/') || trimmed.startsWith('@') || trimmed.length === 0;
  }

  /**
   * Get automatic selection mode status
   */
  isAutoModeEnabled(): boolean {
    return this.agentSelectorService.isAutoModeEnabled();
  }

  /**
   * Enable/disable automatic selection mode
   */
  setAutoMode(enabled: boolean): void {
    this.agentSelectorService.setAutoMode(enabled);
  }

  /**
   * Get selection statistics for debugging
   */
  getSelectionStats() {
    return this.agentSelectorService.getSelectionStats();
  }

  /**
   * Get selection history for analysis
   */
  getSelectionHistory(limit?: number) {
    return this.agentSelectorService.getSelectionHistory(limit);
  }
}