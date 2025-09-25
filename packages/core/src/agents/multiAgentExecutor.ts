/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GenerateContentParameters, GenerateContentResponse, Part } from '@google/genai';
import type { ContentGenerator } from '../core/contentGenerator.js';
import type { Config } from '../config/config.js';
import { UnifiedAgentsClient } from '../runtime/unifiedAgentsClient.js';
import type { UnifiedAgentMessage, UnifiedAgentStreamOptions } from '../runtime/types.js';
import type { AgentPersona } from './personas.js';
import { getAgentById } from './personas.js';
import { injectToolExamples } from './toolInjector.js';
import type { ToolResultDisplay } from '../tools/tools.js';

interface MultiAgentExecutorOptions {
  defaultModel?: string;
  client?: UnifiedAgentsClient;
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
  toolName: string;
  arguments: Record<string, unknown>;
  outputText: string;
  resultDisplay: ToolResultDisplay | undefined;
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

const DEFAULT_MODEL_FALLBACK = 'gpt-5';

export class MultiAgentExecutor {
  private readonly defaultModel: string;
  private readonly providedClient?: UnifiedAgentsClient;

  constructor(
    private readonly contentGenerator: ContentGenerator,
    private readonly config: Config,
    options: MultiAgentExecutorOptions = {},
  ) {
    this.defaultModel = options.defaultModel ?? DEFAULT_MODEL_FALLBACK;
    this.providedClient = options.client;
  }

  async execute(
    userPrompt: string,
    seedAgents: AgentPersona[],
  ): Promise<MultiAgentExecutionResult> {
    const toolEventLog = new Map<string, AgentToolEvent[]>();
    const unifiedClient =
      this.providedClient ??
      new UnifiedAgentsClient(this.config, {
        onToolExecuted: ({ session, request, response }) => {
          const meta = session.metadata;
          const agentId = meta && typeof meta['agentId'] === 'string'
            ? (meta['agentId'] as string)
            : undefined;
          if (!agentId) return;
          const list = toolEventLog.get(agentId) ?? [];
          list.push({
            toolName: request.name,
            arguments: request.args,
            outputText: this.formatResponseParts(response.responseParts),
            resultDisplay: response.resultDisplay,
            timestamp: Date.now(),
          });
          toolEventLog.set(agentId, list);
        },
      });

    const executed = new Map<string, AgentRunResult>();
    const queue: AgentPersona[] = [...seedAgents];
    const timeline: Array<{ wave: number; agents: AgentPersona[] }> = [];
    const startedAt = Date.now();
    let passes = 0;

    while (queue.length > 0 && passes < MAX_EXECUTION_PASSES && executed.size < MAX_AGENTS_PER_RUN) {
      const agent = queue.shift();
      if (!agent) break;

      passes += 1;
      timeline.push({ wave: passes, agents: [agent] });

      const result = await this.runSingleAgent(
        agent,
        userPrompt,
        unifiedClient,
        toolEventLog,
        Array.from(executed.values()),
      );

      if (!result) {
        continue;
      }

      executed.set(result.agent.id, result);

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
    const { finalResponse, aggregateReasoning } = await this.synthesize(userPrompt, agentResults);

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
  ): Promise<AgentRunResult | null> {
    try {
      const { rawText, parsed } = await this.executeAgentSession(
        agent,
        userPrompt,
        unifiedClient,
        previousResults,
      );
      const agentToolEvents = toolEventLog.get(agent.id) ?? [];

      return {
        agent,
        analysis: parsed.analysis ?? rawText,
        solution: parsed.solution ?? '',
        confidence: this.clampConfidence(parsed.confidence),
        handoffAgentIds: Array.isArray(parsed.handoff)
          ? parsed.handoff.filter((id: unknown): id is string => typeof id === 'string')
          : [],
        rawText,
        toolEvents: agentToolEvents,
      };
    } catch (error) {
      const fallbackText = error instanceof Error ? error.message : 'Agent execution failed';
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

    const userContent = this.buildAgentUserPrompt(agent, userPrompt, previousResults);

    let accumulated = '';

    for await (const event of unifiedClient.streamResponse(
      session,
      userContent,
      streamOptions,
    )) {
      if (event.type === 'text-delta' && event.delta) {
        accumulated += event.delta;
      }
      if (event.type === 'final') {
        accumulated = event.message.content ?? accumulated;
      }
    }

    const parsed = this.safeParse(accumulated);
    return { rawText: accumulated, parsed };
  }

  private buildAgentSystemPrompt(agent: AgentPersona): string {
    const domainKnowledge = injectToolExamples(agent.systemPrompt, agent.specialties);

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
    return [
      { role: 'user', content: instructions },
    ];
  }

  private formatPriorInsights(previousResults: AgentRunResult[], currentAgentId: string): string {
    if (previousResults.length === 0) {
      return 'PREVIOUS SPECIALISTS: none yet. You are the first responder.';
    }

    const summaries = previousResults
      .filter((result) => result.agent.id !== currentAgentId)
      .map((result, index) => {
        const analysis = this.truncateForContext(result.analysis);
        const solution = this.truncateForContext(result.solution);
        return `${index + 1}. ${result.agent.name}: analysis → ${analysis || 'n/a'}; solution → ${solution || 'n/a'}; confidence ${Math.round(result.confidence * 100)}%`;
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
  ): Promise<{ finalResponse: string; aggregateReasoning: string }>
  {
    if (agentResults.length === 0) {
      return {
        finalResponse: 'No specialised agents were able to contribute to this task.',
        aggregateReasoning: 'No agent responses available.',
      };
    }

    const summaryPayload = agentResults
      .map((result) => ({
        agentId: result.agent.id,
        name: result.agent.name,
        expertise: result.agent.description,
        analysis: result.analysis,
        solution: result.solution,
        confidence: result.confidence,
      }));

    const synthesisPrompt = `You are the Ouroboros master orchestrator. Multiple specialists responded to the user's request.\n\n` +
      `USER PROMPT:\n${userPrompt}\n\n` +
      `SPECIALIST RESPONSES (JSON):\n${JSON.stringify(summaryPayload, null, 2)}\n\n` +
      `TASK: Combine the specialists' insights into a single, coherent answer.\n` +
      `- Reference the most relevant specialist reasoning\n` +
      `- Resolve contradictions if they exist\n` +
      `- Provide clear, actionable guidance\n` +
      `- Use Markdown where appropriate\n` +
      `- Close with a short reasoning summary on its own line in the format "---\n\nReasoning: ..."`;

    const response = await this.contentGenerator.generateContent(
      {
        model: this.defaultModel,
        contents: [{ role: 'user', parts: [{ text: synthesisPrompt }] }],
        config: { temperature: 0.4, maxOutputTokens: 4096 },
      } as GenerateContentParameters,
      'multi-agent-synthesis',
    );

    const text = this.extractResponseText(response);

    const [finalResponse, aggregateReasoning] = this.splitFinalResponse(text);

    return { finalResponse, aggregateReasoning };
  }

  private extractResponseText(response: GenerateContentResponse): string {
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .map((part: unknown) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          const maybe = (part as { text?: string }).text;
          return typeof maybe === 'string' ? maybe : '';
        }
        return '';
      })
      .join('');
    return text.trim();
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

  private formatResponseParts(parts: Part[] | undefined): string {
    if (!Array.isArray(parts)) return '';
    return parts
      .map((part) => {
        if (part && typeof part === 'object' && 'text' in part) {
          const value = (part as { text?: string }).text;
          return typeof value === 'string' ? value : '';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }
}
