/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { AgentSelectorService } from './agentSelectorService.js';
import { AgentManager } from './agentManager.js';
import type { Config } from '../config/config.js';
import { getAgentById, type AgentPersona } from './personas.js';
import type { MultiAgentExecutionResult } from './multiAgentExecutor.js';

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
   * Initialize the orchestrator with the same ContentGenerator as regular chat
   * @param config - The Config instance that contains the GeminiClient with ContentGenerator
   */
  async initialize(config: Config): Promise<void> {
    await this.agentSelectorService.initialize(config);
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
      execution?: MultiAgentExecutionResult;
    };
    previousAgentState?: string[];
    finalResponse?: string;
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

      // Use non-streaming method for reliable JSON parsing
      // The streaming version was causing JSON parsing failures
      const selectionResult = await this.agentSelectorService.analyzeAndSelectAgents(userPrompt);

      if (selectionResult && selectionResult.selectedAgents.length > 0) {
        const execution = await this.agentSelectorService.executeWithSelectedAgents(
          userPrompt,
          selectionResult.selectedAgents,
        );

        if (execution) {
          yield {
            type: 'complete',
            shouldProceed: false,
            selectionFeedback: {
              ...selectionResult,
              execution,
            },
            previousAgentState,
            finalResponse: execution.finalResponse,
          };
          return;
        }

        // Fallback to legacy activation path if execution failed
        await this.agentSelectorService.temporarilyActivateAgents(
          selectionResult.selectedAgents,
        );

        yield {
          type: 'complete',
          shouldProceed: true,
          selectionFeedback: selectionResult,
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
      execution?: MultiAgentExecutionResult;
    };
    finalResponse?: string;
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

      const execution = await this.agentSelectorService.executeWithSelectedAgents(
        userPrompt,
        selectionResult.selectedAgents,
      );

      if (execution) {
        return {
          shouldProceed: false,
          selectionFeedback: {
            ...selectionResult,
            execution,
          },
          previousAgentState: undefined,
          finalResponse: execution.finalResponse,
        };
      }

      // Legacy fallback
      const previousAgentState = this.agentManager.getActiveAgents().map(a => a.id);

      await this.agentSelectorService.temporarilyActivateAgents(
        selectionResult.selectedAgents,
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
    execution?: MultiAgentExecutionResult;
  }): {
    type: 'INFO';
    text: string;
  } {
    const teamNames = selectionInfo.selectedAgents
      .map(agent => `${agent.emoji} ${agent.name}`)
      .join(', ');

    const confidenceEmoji = selectionInfo.confidence > 0.8 ? '🎯' :
      selectionInfo.confidence > 0.6 ? '🎲' : '🤔';

    const execution = selectionInfo.execution;
    const durationText = execution
      ? `${(execution.durationMs / 1000).toFixed(1)}s`
      : `${selectionInfo.processingTime}ms`;

    const lines: string[] = [];
    lines.push(`${confidenceEmoji} **Multi-Agent Orchestration Activated**`);
    lines.push('');
    lines.push(`• **Team Size:** ${execution?.totalAgents ?? selectionInfo.selectedAgents.length} specialist${(execution?.totalAgents ?? selectionInfo.selectedAgents.length) === 1 ? '' : 's'}`);
    lines.push(`• **Team:** ${teamNames}`);
    lines.push(`• **Selection Confidence:** ${(selectionInfo.confidence * 100).toFixed(0)}%`);
    lines.push(`• **Orchestration Time:** ${durationText}`);
    lines.push(`• **Dispatcher Reasoning:** ${selectionInfo.reasoning}`);

    if (execution?.timeline.length) {
      const waveEmojis = ['①', '②', '③', '④', '⑤', '⑥'];
      lines.push('\n**Execution Waves**');
      for (const entry of execution.timeline) {
        const label = waveEmojis[entry.wave - 1] ?? `Wave ${entry.wave}`;
        const participants = entry.agents
          .map(agent => `${agent.emoji} ${agent.name}`)
          .join(', ');
        lines.push(`${label} ${participants}`);
      }
    }

    if (execution?.agentResults.length) {
      lines.push('\n**Specialist Outcomes**');
      for (const result of execution.agentResults) {
        const agentLine = `- ${result.agent.emoji} **${result.agent.name}** (${Math.round(result.confidence * 100)}% confidence)`;
        lines.push(agentLine);
        const summary = result.solution || result.analysis;
        if (summary) {
          lines.push(`  ${summary}`);
        }
        if (result.handoffAgentIds.length > 0) {
          const handoffNames = result.handoffAgentIds
            .map((id) => getAgentById(id))
            .filter((persona): persona is AgentPersona => Boolean(persona))
            .map((persona) => `${persona.emoji} ${persona.name}`)
            .join(', ');
          if (handoffNames) {
            lines.push(`  ↪ Recommended handoff: ${handoffNames}`);
          }
        }
      }
    }

    if (execution?.aggregateReasoning) {
      lines.push('\n**Coordinated Reasoning**');
      lines.push(execution.aggregateReasoning);
    }

    lines.push('\n*Multi-agent response synthesized by the Ouroboros orchestrator.*');

    return {
      type: 'INFO',
      text: lines.join('\n'),
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
