/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { UnifiedAgentsClient } from '../runtime/unifiedAgentsClient.js';
import type {
  UnifiedAgentMessage,
  UnifiedAgentStreamOptions,
} from '../runtime/types.js';
import type { AgentPersona } from './personas.js';
import { getAgentById } from './personas.js';
import { injectToolExamples } from './toolInjector.js';
import type { ToolResultDisplay, ToolErrorType } from '../tools/tools.js';
import { toolResponsePartsToString } from '../utils/toolResponseStringifier.js';

interface MultiAgentExecutorOptions {
  defaultModel?: string;
  client?: UnifiedAgentsClient;
}

export interface MultiAgentExecutionHooks {
  onAgentStart?: (payload: {
    agent: AgentPersona;
    wave: number;
    pendingAgents: AgentPersona[];
    previousResults: AgentRunResult[];
  }) => void | Promise<void>;
  onAgentComplete?: (payload: {
    agent: AgentPersona;
    wave: number;
    result: AgentRunResult;
    completedAgents: number;
    remainingAgents: number;
  }) => void | Promise<void>;
  onToolEvent?: (payload: {
    agent: AgentPersona;
    event: AgentToolEvent;
  }) => void | Promise<void>;
  onAgentThinking?: (payload: {
    agent: AgentPersona;
    wave: number;
    delta: string;
    accumulated: string;
  }) => void | Promise<void>;
}

interface AgentRunResult {
  agent: AgentPersona;
  analysis: string;
  solution: string;
  confidence: number;
  handoffAgentIds: string[];
  rawText: string;
  toolEvents: AgentToolEvent[];
}

interface AgentToolEvent {
  callId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  outputText?: string;
  resultDisplay: ToolResultDisplay | undefined;
  errorMessage?: string;
  errorType?: ToolErrorType;
  timestamp: number;
}

export interface MultiAgentExecutionResult {
  agentResults: AgentRunResult[];
  finalResponse: string;
  aggregateReasoning: string;
  timeline: Array<{
    wave: number;
    agents: AgentPersona[];
  }>;
  totalAgents: number;
  durationMs: number;
}

const MAX_EXECUTION_PASSES = 6;
const MAX_AGENTS_PER_RUN = 6;

const DEFAULT_MODEL_FALLBACK = 'gpt-5-codex';

export class MultiAgentExecutor {
  private readonly defaultModel: string;
  private readonly providedClient?: UnifiedAgentsClient;

  constructor(
    private readonly config: Config,
    options: MultiAgentExecutorOptions = {},
  ) {
    this.defaultModel = options.defaultModel ?? DEFAULT_MODEL_FALLBACK;
    this.providedClient = options.client;
  }

  async execute(
    userPrompt: string,
    seedAgents: AgentPersona[],
    hooks?: MultiAgentExecutionHooks,
  ): Promise<MultiAgentExecutionResult> {
    const toolEventLog = new Map<string, AgentToolEvent[]>();
    const unifiedClient =
      this.providedClient ??
      new UnifiedAgentsClient(this.config, {
        onToolExecuted: ({ session, request, response }) => {
          const meta = session.metadata;
          const agentId =
            meta && typeof meta['agentId'] === 'string'
              ? (meta['agentId'] as string)
              : undefined;
          if (!agentId) return;
          const list = toolEventLog.get(agentId) ?? [];
          const event: AgentToolEvent = {
            callId: request.callId,
            toolName: request.name,
            arguments: request.args,
            outputText: toolResponsePartsToString(response.responseParts),
            resultDisplay: response.resultDisplay,
            errorMessage: response.error?.message,
            errorType: response.errorType,
            timestamp: Date.now(),
          };
          list.push(event);
          toolEventLog.set(agentId, list);

          if (hooks?.onToolEvent) {
            const persona = getAgentById(agentId);
            if (persona) {
              void hooks.onToolEvent({ agent: persona, event });
            }
          }
        },
      });

    const executed = new Map<string, AgentRunResult>();
    const queue: AgentPersona[] = [...seedAgents];
    const timeline: Array<{ wave: number; agents: AgentPersona[] }> = [];
    const startedAt = Date.now();
    let passes = 0;

    while (
      queue.length > 0 &&
      passes < MAX_EXECUTION_PASSES &&
      executed.size < MAX_AGENTS_PER_RUN
    ) {
      const agent = queue.shift();
      if (!agent) break;

      passes += 1;
      timeline.push({ wave: passes, agents: [agent] });

      if (hooks?.onAgentStart) {
        await hooks.onAgentStart({
          agent,
          wave: passes,
          pendingAgents: [...queue],
          previousResults: Array.from(executed.values()),
        });
      }

      const result = await this.runSingleAgent(
        agent,
        userPrompt,
        unifiedClient,
        toolEventLog,
        Array.from(executed.values()),
        passes,
        hooks,
      );

      if (!result) {
        continue;
      }

      executed.set(result.agent.id, result);

      if (hooks?.onAgentComplete) {
        await hooks.onAgentComplete({
          agent,
          wave: passes,
          result,
          completedAgents: executed.size,
          remainingAgents: queue.length,
        });
      }

      for (const handoffId of result.handoffAgentIds) {
        if (executed.has(handoffId)) continue;
        if (queue.some((queuedAgent) => queuedAgent.id === handoffId)) continue;
        const persona = getAgentById(handoffId);
        if (persona) {
          queue.push(persona);
        }
      }
    }

    const agentResults = Array.from(executed.values());
    const { finalResponse, aggregateReasoning } = await this.synthesize(
      userPrompt,
      agentResults,
      unifiedClient,
    );

    return {
      agentResults,
      finalResponse,
      aggregateReasoning,
      timeline,
      totalAgents: agentResults.length,
      durationMs: Date.now() - startedAt,
    };
  }

  private async runSingleAgent(
    agent: AgentPersona,
    userPrompt: string,
    unifiedClient: UnifiedAgentsClient,
    toolEventLog: Map<string, AgentToolEvent[]>,
    previousResults: AgentRunResult[],
    wave: number,
    hooks?: MultiAgentExecutionHooks,
  ): Promise<AgentRunResult | null> {
    try {
      const { rawText, parsed } = await this.executeAgentSession(
        agent,
        userPrompt,
        unifiedClient,
        previousResults,
        wave,
        hooks,
      );
      const agentToolEvents = toolEventLog.get(agent.id) ?? [];

      return {
        agent,
        analysis: parsed.analysis ?? rawText,
        solution: parsed.solution ?? '',
        confidence: this.clampConfidence(parsed.confidence),
        handoffAgentIds: Array.isArray(parsed.handoff)
          ? parsed.handoff.filter(
              (id: unknown): id is string => typeof id === 'string',
            )
          : [],
        rawText,
        toolEvents: agentToolEvents,
      };
    } catch (error) {
      const fallbackText =
        error instanceof Error ? error.message : 'Agent execution failed';
      const agentToolEvents = toolEventLog.get(agent.id) ?? [];
      return {
        agent,
        analysis: fallbackText,
        solution: '',
        confidence: 0,
        handoffAgentIds: [],
        rawText: fallbackText,
        toolEvents: agentToolEvents,
      };
    }
  }

  private async executeAgentSession(
    agent: AgentPersona,
    userPrompt: string,
    unifiedClient: UnifiedAgentsClient,
    previousResults: AgentRunResult[],
    wave: number,
    hooks?: MultiAgentExecutionHooks,
  ): Promise<{ rawText: string; parsed: any }> {
    const session = await unifiedClient.createSession({
      providerId: this.config.getProvider(),
      model: this.defaultModel,
      systemPrompt: this.buildAgentSystemPrompt(agent),
      metadata: {
        agentId: agent.id,
        agentName: agent.name,
        agentEmoji: agent.emoji,
      },
    });

    const streamOptions: UnifiedAgentStreamOptions = {};

    if (this.config.getProvider() !== 'openai') {
      streamOptions.maxOutputTokens = 4096;
      if (typeof agent.temperature === 'number') {
        streamOptions.temperature = agent.temperature;
      }
    }

    const userContent = this.buildAgentUserPrompt(
      agent,
      userPrompt,
      previousResults,
    );

    let accumulated = '';
    let emittedFinalThinking = false;

    for await (const event of unifiedClient.streamResponse(
      session,
      userContent,
      streamOptions,
    )) {
      if (event.type === 'text-delta' && event.delta) {
        accumulated += event.delta;
        emittedFinalThinking = false;
        if (hooks?.onAgentThinking) {
          await hooks.onAgentThinking({
            agent,
            wave,
            delta: event.delta,
            accumulated,
          });
        }
      }
      if (event.type === 'final') {
        accumulated = event.message.content ?? accumulated;
        emittedFinalThinking = true;
        if (hooks?.onAgentThinking) {
          await hooks.onAgentThinking({
            agent,
            wave,
            delta: '',
            accumulated,
          });
        }
      }
    }

    if (!emittedFinalThinking && hooks?.onAgentThinking) {
      await hooks.onAgentThinking({
        agent,
        wave,
        delta: '',
        accumulated,
      });
    }

    const parsed = this.safeParse(accumulated);
    return { rawText: accumulated, parsed };
  }

  private buildAgentSystemPrompt(agent: AgentPersona): string {
    const domainKnowledge = injectToolExamples(
      agent.systemPrompt,
      agent.specialties,
    );

    return [
      `You are ${agent.name} (${agent.id}), a specialist in ${agent.specialties.join(', ')}.`,
      agent.description,
      domainKnowledge,
      'Use available tools when they help you produce a thorough solution. Narrate your reasoning before finalizing your answer.',
      'When you have reached a conclusion, produce a final JSON object with the fields {"analysis","solution","confidence","handoff"}.',
    ].join('\n\n');
  }

  private buildAgentUserPrompt(
    agent: AgentPersona,
    userPrompt: string,
    previousResults: AgentRunResult[],
  ): UnifiedAgentMessage[] {
    const priorInsights = this.formatPriorInsights(previousResults, agent.id);
    const instructions = `USER TASK:\n${userPrompt}\n\n${priorInsights}\nFINAL RESPONSE FORMAT:\nReturn a JSON object like:\n{\n  "analysis": "key findings...",\n  "solution": "proposed implementation or answer",\n  "confidence": 0.0-1.0,\n  "handoff": ["optional-agent-id", ...]\n}\nIf no handoff is needed, respond with an empty array.`;
    return [{ role: 'user', content: instructions }];
  }

  private formatPriorInsights(
    previousResults: AgentRunResult[],
    currentAgentId: string,
  ): string {
    if (previousResults.length === 0) {
      return 'PREVIOUS SPECIALISTS: none yet. You are the first responder.';
    }

    const summaries = previousResults
      .filter((result) => result.agent.id !== currentAgentId)
      .map((result, index) => {
        const analysis = this.truncateForContext(result.analysis);
        const solution = this.truncateForContext(result.solution);
        const raw = this.formatRawForContext(result.rawText);
        const lines = [
          `${index + 1}. ${result.agent.name} (${result.agent.id})`,
          `   • Analysis: ${analysis || 'n/a'}`,
          `   • Solution: ${solution || 'n/a'}`,
          `   • Confidence: ${Math.round(result.confidence * 100)}%`,
        ];
        if (raw) {
          lines.push('   • Full JSON output:', `     ${raw}`);
        }
        return lines.join('\n');
      })
      .join('\n');

    if (!summaries) {
      return 'PREVIOUS SPECIALISTS: none yet. You are the first responder.';
    }

    return `PREVIOUS SPECIALISTS (use to avoid duplication and build upon their output):\n${summaries}`;
  }

  private truncateForContext(text: string): string {
    if (!text) return '';
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= 280) {
      return normalized;
    }
    return `${normalized.slice(0, 277)}...`;
  }

  private formatRawForContext(raw: string): string {
    if (!raw) return '';
    const trimmed = raw.trim();
    if (!trimmed) return '';
    let pretty = trimmed;
    try {
      const parsed = JSON.parse(trimmed);
      pretty = JSON.stringify(parsed, null, 2);
    } catch (_error) {
      const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (codeBlock) {
        const candidate = codeBlock[1].trim();
        try {
          pretty = JSON.stringify(JSON.parse(candidate), null, 2);
        } catch (_inner) {
          pretty = candidate;
        }
      }
    }

    return this.limitForContext(pretty, 1200)
      .split('\n')
      .map((line) => (line.length > 0 ? line : ' '))
      .join('\n     ');
  }

  private limitForContext(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return `${text.slice(0, maxLength - 3)}...`;
  }

  private safeParse(raw: string): any {
    try {
      return JSON.parse(raw);
    } catch (_error) {
      const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (codeBlock) {
        try {
          return JSON.parse(codeBlock[1]);
        } catch (_inner) {
          // fall through
        }
      }

      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (_inner) {
          // ignore
        }
      }

      return {};
    }
  }

  private clampConfidence(value: unknown): number {
    if (typeof value !== 'number' || Number.isNaN(value)) return 0.0;
    return Math.min(1, Math.max(0, value));
  }

  private async synthesize(
    userPrompt: string,
    agentResults: AgentRunResult[],
    unifiedClient: UnifiedAgentsClient,
  ): Promise<{ finalResponse: string; aggregateReasoning: string }> {
    if (agentResults.length === 0) {
      return {
        finalResponse:
          'No specialised agents were able to contribute to this task.',
        aggregateReasoning: 'No agent responses available.',
      };
    }

    const summaryPayload = agentResults.map((result) => ({
      agentId: result.agent.id,
      name: result.agent.name,
      expertise: result.agent.description,
      analysis: result.analysis,
      solution: result.solution,
      confidence: result.confidence,
    }));

    const synthesisPrompt =
      `You are the Ouroboros master orchestrator. Multiple specialists responded to the user's request.\n\n` +
      `USER PROMPT:\n${userPrompt}\n\n` +
      `SPECIALIST RESPONSES (JSON):\n${JSON.stringify(summaryPayload, null, 2)}\n\n` +
      `TASK: Combine the specialists' insights into a single, coherent answer.\n` +
      `- Reference the most relevant specialist reasoning\n` +
      `- Resolve contradictions if they exist\n` +
      `- Provide clear, actionable guidance\n` +
      `- Use Markdown where appropriate\n` +
      `- Close with a short reasoning summary on its own line in the format "---\n\nReasoning: ..."`;

    const session = await unifiedClient.createSession({
      providerId: this.config.getProvider(),
      model: this.defaultModel,
      systemPrompt:
        'You are the Ouroboros master orchestrator. Combine specialist insights into a single, coherent response.',
      metadata: {
        agentId: 'orchestrator',
        agentName: 'Master Orchestrator',
      },
    });

    const streamOptions: UnifiedAgentStreamOptions = {
      temperature: 0.4,
    };

    if (this.config.getProvider() !== 'openai') {
      streamOptions.maxOutputTokens = 4096;
    }

    const messages: UnifiedAgentMessage[] = [
      {
        role: 'user',
        content: synthesisPrompt,
      },
    ];

    let accumulated = '';

    for await (const event of unifiedClient.streamResponse(
      session,
      messages,
      streamOptions,
    )) {
      if (event.type === 'text-delta' && event.delta) {
        accumulated += event.delta;
      }
      if (event.type === 'final') {
        accumulated = event.message.content ?? accumulated;
      }
    }

    const [finalResponse, aggregateReasoning] = this.splitFinalResponse(
      accumulated.trim(),
    );

    return { finalResponse, aggregateReasoning };
  }

  private splitFinalResponse(text: string): [string, string] {
    if (!text) return ['', ''];
    const marker = '\n\n---\n\nReasoning:';
    if (!text.includes(marker)) {
      return [text.trim(), ''];
    }
    const [answer, reasoning] = text.split(marker);
    return [answer.trim(), reasoning.trim()];
  }

}
