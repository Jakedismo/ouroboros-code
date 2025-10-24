/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { AgentSelectorService } from './agentSelectorService.js';
import type { Config } from '../config/config.js';
import { getAgentById, type AgentPersona } from './personas.js';
import type { MultiAgentExecutionResult } from './multiAgentExecutor.js';
import type { ToolResultDisplay, ToolErrorType } from '../tools/tools.js';

type ToolEventSnapshot = {
  callId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  outputText?: string;
  resultDisplay?: ToolResultDisplay;
  errorMessage?: string;
  errorType?: ToolErrorType;
  timestamp: number;
};

type AgentProgressSnapshot = {
  agent: AgentPersona;
  analysis: string;
  solution: string;
  confidence: number;
  handoffAgentIds: string[];
  rawText: string;
  liveThought: string;
  status: 'pending' | 'running' | 'complete';
  toolEvents: ToolEventSnapshot[];
};

/**
 * Orchestrates automatic agent selection and conversation flow integration
 */
export class ConversationOrchestrator {
  private static instance: ConversationOrchestrator | null = null;
  private agentSelectorService: AgentSelectorService;

  private constructor() {
    this.agentSelectorService = AgentSelectorService.getInstance();
  }

  static getInstance(): ConversationOrchestrator {
    if (!ConversationOrchestrator.instance) {
      ConversationOrchestrator.instance = new ConversationOrchestrator();
    }
    return ConversationOrchestrator.instance;
  }

  /**
   * Initialize the orchestrator with the same ContentGenerator as regular chat
   * @param config - Active configuration (provides the shared AgentsClient/content generator)
   */
  async initialize(config: Config): Promise<void> {
    await this.agentSelectorService.initialize(config);
  }

  /**
   * Process a user prompt with streaming agent selection
   */
  async *processPromptWithAutoSelectionStream(
    userPrompt: string,
  ): AsyncGenerator<{
    type: 'progress' | 'complete';
    message?: string;
    shouldProceed?: boolean;
    selectionPreview?: {
      selectedAgents: AgentPersona[];
      reasoning: string;
      confidence: number;
      processingTime: number;
      status: 'planning' | 'running' | 'complete';
      execution?: {
        totalAgents: number;
        durationMs: number;
        aggregateReasoning?: string;
        finalResponse?: string;
        timeline: Array<{
          wave: number;
          agents: AgentPersona[];
        }>;
        agentResults: Array<{
          agent: AgentPersona;
          analysis: string;
          solution: string;
          confidence: number;
          handoffAgentIds: string[];
          rawText: string;
          toolEvents: ToolEventSnapshot[];
        }>;
      };
    };
    selectionFeedback?: {
      selectedAgents: AgentPersona[];
      reasoning: string;
      confidence: number;
      processingTime: number;
      status?: 'planning' | 'running' | 'complete';
      execution?: MultiAgentExecutionResult;
    };
    toolEvent?: {
      agent: AgentPersona;
      event: ToolEventSnapshot;
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
      // Use non-streaming method for reliable JSON parsing
      // The streaming version was causing JSON parsing failures
      const selectionResult =
        await this.agentSelectorService.analyzeAndSelectAgents(userPrompt);

      if (selectionResult && selectionResult.selectedAgents.length > 0) {
        yield {
          type: 'progress',
          selectionPreview: {
            selectedAgents: selectionResult.selectedAgents,
            reasoning: selectionResult.reasoning,
            confidence: selectionResult.confidence,
            processingTime: selectionResult.processingTime,
            status: 'planning',
          },
        };

        const selectionStartedAt = Date.now();
        const progressQueue: Array<{
          type: 'progress';
          message?: string;
          selectionPreview?: {
            selectedAgents: AgentPersona[];
            reasoning: string;
            confidence: number;
            processingTime: number;
            status: 'planning' | 'running' | 'complete';
            execution?: {
              totalAgents: number;
              durationMs: number;
              aggregateReasoning?: string;
              finalResponse?: string;
              timeline: Array<{
                wave: number;
                agents: AgentPersona[];
              }>;
              agentResults: Array<{
                agent: AgentPersona;
                analysis: string;
                solution: string;
                confidence: number;
                handoffAgentIds: string[];
                rawText: string;
                toolEvents: ToolEventSnapshot[];
              }>;
            };
          };
          toolEvent?: {
            agent: AgentPersona;
            event: ToolEventSnapshot;
          };
        }> = [];
        let queueResolver: (() => void) | null = null;
        let executionSettled = false;

        const emitProgress = (event: (typeof progressQueue)[number]) => {
          progressQueue.push(event);
          if (queueResolver) {
            const resolver = queueResolver;
            queueResolver = null;
            resolver();
          }
        };

        const partialExecutionState: {
          totalAgents: number;
          durationMs: number;
          aggregateReasoning?: string;
          finalResponse?: string;
          timeline: Array<{ wave: number; agents: AgentPersona[] }>;
          agentResults: Map<string, AgentProgressSnapshot>;
        } = {
          totalAgents: selectionResult.selectedAgents.length,
          durationMs: 0,
          aggregateReasoning: undefined,
          finalResponse: undefined,
          timeline: [],
          agentResults: new Map(),
        };

        const ensureAgentEntry = (agent: AgentPersona): AgentProgressSnapshot => {
          const existing = partialExecutionState.agentResults.get(agent.id);
          if (existing) {
            return existing;
          }
          const created = {
            agent,
            analysis: '',
            solution: '',
            confidence: 0,
            handoffAgentIds: [] as string[],
            rawText: '',
            liveThought: '',
            status: 'pending' as const,
            toolEvents: [] as ToolEventSnapshot[],
          };
          partialExecutionState.agentResults.set(agent.id, created);
          partialExecutionState.totalAgents = Math.max(
            partialExecutionState.totalAgents,
            partialExecutionState.agentResults.size,
          );
          return created;
        };

        const buildSelectionPreview = (status: 'planning' | 'running' | 'complete' = 'running') => ({
          selectedAgents: selectionResult.selectedAgents,
          reasoning: selectionResult.reasoning,
          confidence: selectionResult.confidence,
          processingTime: Date.now() - selectionStartedAt,
          status,
          execution: {
            totalAgents: partialExecutionState.totalAgents,
            durationMs: partialExecutionState.durationMs,
            aggregateReasoning: partialExecutionState.aggregateReasoning,
            finalResponse: partialExecutionState.finalResponse,
            timeline: partialExecutionState.timeline.map((entry) => ({
              wave: entry.wave,
              agents: [...entry.agents],
            })),
            agentResults: Array.from(partialExecutionState.agentResults.values()).map((result) => ({
              agent: result.agent,
              analysis: result.analysis,
              solution: result.solution,
              confidence: result.confidence,
              handoffAgentIds: [...result.handoffAgentIds],
              rawText: result.rawText,
              liveThought: result.liveThought,
              status: result.status,
              toolEvents: result.toolEvents.map((event) => ({
                callId: event.callId,
                toolName: event.toolName,
                arguments: { ...event.arguments },
                outputText: event.outputText,
                resultDisplay: event.resultDisplay,
                errorMessage: event.errorMessage,
                errorType: event.errorType,
                timestamp: event.timestamp,
              })),
            })),
          },
        });

        const executionPromise =
          this.agentSelectorService.executeWithSelectedAgents(
            userPrompt,
            selectionResult.selectedAgents,
            {
              onAgentStart: ({ agent, wave }) => {
                partialExecutionState.timeline.push({ wave, agents: [agent] });
                partialExecutionState.durationMs = Date.now() - selectionStartedAt;
                const entry = ensureAgentEntry(agent);
                entry.status = 'running';
                entry.liveThought = entry.liveThought || '';
                emitProgress({
                  type: 'progress',
                  message: `🤖 ${agent.emoji} ${agent.name} starting (wave ${wave})`,
                  selectionPreview: buildSelectionPreview('running'),
                });
              },
              onAgentComplete: ({ result, wave }) => {
                partialExecutionState.durationMs =
                  Date.now() - selectionStartedAt;
                const entry = ensureAgentEntry(result.agent);
                entry.analysis = result.analysis;
                entry.solution = result.solution;
                entry.confidence = result.confidence;
                entry.handoffAgentIds = [...result.handoffAgentIds];
                entry.rawText = result.rawText;
                entry.liveThought = '';
                entry.status = 'complete';
                entry.toolEvents = (result.toolEvents ?? []).map((event) => ({
                  callId: event.callId,
                  toolName: event.toolName,
                  arguments: { ...event.arguments },
                  outputText: event.outputText,
                  resultDisplay: event.resultDisplay,
                  errorMessage: event.errorMessage,
                  errorType: event.errorType,
                  timestamp: event.timestamp,
                })).sort((a, b) => a.timestamp - b.timestamp);
                emitProgress({
                  type: 'progress',
                  message: `✅ ${result.agent.emoji} ${result.agent.name} completed (wave ${wave})`,
                  selectionPreview: buildSelectionPreview('running'),
                });
              },
              onAgentThinking: ({ agent, accumulated }) => {
                partialExecutionState.durationMs =
                  Date.now() - selectionStartedAt;
                const entry = ensureAgentEntry(agent);
                const normalized = accumulated.trim();
                if (!normalized) {
                  entry.rawText = accumulated;
                  return;
                }
                const truncated = normalized.length > 1200
                  ? normalized.slice(-1200)
                  : normalized;
                if (truncated !== entry.liveThought) {
                  entry.liveThought = truncated;
                  entry.rawText = accumulated;
                  entry.status = 'running';
                  emitProgress({
                    type: 'progress',
                    selectionPreview: buildSelectionPreview('running'),
                  });
                }
              },
              onToolEvent: ({ agent, event: toolEvent }) => {
                partialExecutionState.durationMs =
                  Date.now() - selectionStartedAt;
                const entry = ensureAgentEntry(agent);
                const snapshot: ToolEventSnapshot = {
                  callId: toolEvent.callId,
                  toolName: toolEvent.toolName,
                  arguments: { ...toolEvent.arguments },
                  outputText: toolEvent.outputText,
                  resultDisplay: toolEvent.resultDisplay,
                  errorMessage: toolEvent.errorMessage,
                  errorType: toolEvent.errorType,
                  timestamp: toolEvent.timestamp,
                };
                entry.status = 'running';
                const existingIndex = entry.toolEvents.findIndex(
                  (candidate) => candidate.callId === snapshot.callId,
                );
                if (existingIndex >= 0) {
                  const next = [...entry.toolEvents];
                  next[existingIndex] = snapshot;
                  entry.toolEvents = next.sort((a, b) => a.timestamp - b.timestamp);
                } else {
                  entry.toolEvents = [...entry.toolEvents, snapshot].sort(
                    (a, b) => a.timestamp - b.timestamp,
                  );
                }
                emitProgress({
                  type: 'progress',
                  toolEvent: { agent, event: snapshot },
                  selectionPreview: buildSelectionPreview('running'),
                });
              },
            },
          );

        executionPromise
          .then((execution) => {
            if (execution) {
              partialExecutionState.aggregateReasoning =
                execution.aggregateReasoning;
              partialExecutionState.finalResponse = execution.finalResponse;
              partialExecutionState.totalAgents = execution.totalAgents;
              for (const agentResult of execution.agentResults) {
                const entry = ensureAgentEntry(agentResult.agent);
                entry.analysis = agentResult.analysis;
                entry.solution = agentResult.solution;
                entry.confidence = agentResult.confidence;
                entry.handoffAgentIds = [...agentResult.handoffAgentIds];
                entry.rawText = agentResult.rawText;
                entry.liveThought = '';
                entry.status = 'complete';
                entry.toolEvents = (agentResult.toolEvents ?? []).map((event) => ({
                  callId: event.callId,
                  toolName: event.toolName,
                  arguments: { ...event.arguments },
                  outputText: event.outputText,
                  resultDisplay: event.resultDisplay,
                  errorMessage: event.errorMessage,
                  errorType: event.errorType,
                  timestamp: event.timestamp,
                }));
              }
            }
          })
          .finally(() => {
            executionSettled = true;
            if (queueResolver) {
              const resolver = queueResolver;
              queueResolver = null;
              resolver();
            }
          });

        while (!executionSettled || progressQueue.length > 0) {
          if (progressQueue.length === 0) {
            await new Promise<void>((resolve) => {
              queueResolver = resolve;
            });
            continue;
          }

          const event = progressQueue.shift();
          if (event) {
            yield event;
          }
        }

        const execution = await executionPromise;

        if (execution) {
          yield {
            type: 'complete',
            shouldProceed: false,
            selectionFeedback: {
              ...selectionResult,
              status: 'complete',
              execution,
            },
            previousAgentState: undefined,
            finalResponse: execution.finalResponse,
          };
          return;
        }

        // Fallback to legacy activation path if execution failed
        yield {
          type: 'complete',
          shouldProceed: false,
          selectionFeedback: {
            ...selectionResult,
            status: 'complete',
          },
          previousAgentState: undefined,
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
  async processPromptWithAutoSelection(
    userPrompt: string,
    promptParts: any[],
  ): Promise<{
    shouldProceed: boolean;
    selectionFeedback?: {
      selectedAgents: AgentPersona[];
      reasoning: string;
      confidence: number;
      processingTime: number;
      status?: 'planning' | 'running' | 'complete';
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
      const selectionResult =
        await this.agentSelectorService.analyzeAndSelectAgents(userPrompt);

      if (selectionResult.selectedAgents.length === 0) {
        // No agents selected, continue without modification
        return { shouldProceed: true };
      }

      const execution =
        await this.agentSelectorService.executeWithSelectedAgents(
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
      return {
        shouldProceed: false,
        selectionFeedback: selectionResult,
        previousAgentState: undefined,
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

    await this.agentSelectorService.restorePreviousAgentState(
      previousAgentState,
    );
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
      .map((agent) => `${agent.emoji} ${agent.name}`)
      .join(', ');

    const confidenceEmoji =
      selectionInfo.confidence > 0.8
        ? '🎯'
        : selectionInfo.confidence > 0.6
          ? '🎲'
          : '🤔';

    const execution = selectionInfo.execution;
    const durationText = execution
      ? `${(execution.durationMs / 1000).toFixed(1)}s`
      : `${selectionInfo.processingTime}ms`;

    const lines: string[] = [];
    lines.push(`${confidenceEmoji} **Multi-Agent Orchestration Activated**`);
    lines.push('');
    lines.push(
      `• **Team Size:** ${execution?.totalAgents ?? selectionInfo.selectedAgents.length} specialist${(execution?.totalAgents ?? selectionInfo.selectedAgents.length) === 1 ? '' : 's'}`,
    );
    lines.push(`• **Team:** ${teamNames}`);
    lines.push(
      `• **Selection Confidence:** ${(selectionInfo.confidence * 100).toFixed(0)}%`,
    );
    lines.push(`• **Orchestration Time:** ${durationText}`);
    lines.push(`• **Dispatcher Reasoning:** ${selectionInfo.reasoning}`);

    if (execution?.timeline.length) {
      const waveEmojis = ['①', '②', '③', '④', '⑤', '⑥'];
      lines.push('\n**Execution Waves**');
      for (const entry of execution.timeline) {
        const label = waveEmojis[entry.wave - 1] ?? `Wave ${entry.wave}`;
        const participants = entry.agents
          .map((agent) => `${agent.emoji} ${agent.name}`)
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

    lines.push(
      '\n*Multi-agent response synthesized by the Ouroboros orchestrator.*',
    );

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
    return (
      trimmed.startsWith('/') || trimmed.startsWith('@') || trimmed.length === 0
    );
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
