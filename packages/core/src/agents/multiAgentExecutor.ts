/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';
import type { ContentGenerator } from '../core/contentGenerator.js';
import type { AgentPersona } from './personas.js';
import { getAgentById } from './personas.js';

interface MultiAgentExecutorOptions {
  defaultModel?: string;
}

interface AgentRunResult {
  agent: AgentPersona;
  analysis: string;
  solution: string;
  confidence: number;
  handoffAgentIds: string[];
  rawText: string;
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

const AGENT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    analysis: { type: 'string' },
    solution: { type: 'string' },
    confidence: {
      type: 'number',
      description: 'Value between 0 and 1 describing confidence in the solution.',
    },
    handoff: {
      type: 'array',
      description: 'Agent IDs that should be consulted next, in priority order.',
      items: { type: 'string' },
    },
    reasoning: {
      type: 'string',
      description: 'Short justification for the solution.',
    },
  },
  required: ['analysis', 'solution'],
  additionalProperties: false,
};

const MAX_PARALLEL_WAVES = 3;
const MAX_AGENTS_PER_RUN = 6;

const DEFAULT_MODEL_FALLBACK = 'gpt-4o';

export class MultiAgentExecutor {
  private readonly defaultModel: string;

  constructor(
    private readonly contentGenerator: ContentGenerator,
    options: MultiAgentExecutorOptions = {},
  ) {
    this.defaultModel = options.defaultModel ?? DEFAULT_MODEL_FALLBACK;
  }

  async execute(
    userPrompt: string,
    seedAgents: AgentPersona[],
  ): Promise<MultiAgentExecutionResult> {
    const executed = new Map<string, AgentRunResult>();
    const queue: AgentPersona[] = [...seedAgents];
    let waves = 0;
    const timeline: Array<{ wave: number; agents: AgentPersona[] }> = [];
    const startedAt = Date.now();

    while (queue.length > 0 && waves < MAX_PARALLEL_WAVES && executed.size < MAX_AGENTS_PER_RUN) {
      const batch = queue.splice(0).slice(0, MAX_AGENTS_PER_RUN - executed.size);
      if (batch.length === 0) break;

      timeline.push({ wave: waves + 1, agents: batch.map((agent) => agent) });

      const results = await Promise.all(batch.map((agent) => this.runSingleAgent(agent, userPrompt)));

      for (const result of results) {
        if (!result) continue;
        executed.set(result.agent.id, result);

        for (const handoffId of result.handoffAgentIds) {
          if (executed.has(handoffId)) continue;
          if (queue.some((agent) => agent.id === handoffId)) continue;
          const persona = getAgentById(handoffId);
          if (persona) {
            queue.push(persona);
          }
        }
      }

      waves += 1;
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
  ): Promise<AgentRunResult | null> {
    const request = this.buildAgentRequest(agent, userPrompt);

    try {
      const response = await this.contentGenerator.generateContent(
        request,
        `multi-agent-${agent.id}`,
      );
      const rawText = this.extractText(response);
      const parsed = this.safeParse(rawText);

      return {
        agent,
        analysis: parsed.analysis ?? rawText,
        solution: parsed.solution ?? '',
        confidence: this.clampConfidence(parsed.confidence),
        handoffAgentIds: Array.isArray(parsed.handoff)
          ? parsed.handoff.filter((id: unknown): id is string => typeof id === 'string')
          : [],
        rawText,
      };
    } catch (error) {
      const fallbackText = error instanceof Error ? error.message : 'Agent execution failed';
      return {
        agent,
        analysis: fallbackText,
        solution: '',
        confidence: 0,
        handoffAgentIds: [],
        rawText: fallbackText,
      };
    }
  }

  private buildAgentRequest(agent: AgentPersona, userPrompt: string): GenerateContentParameters {
    const agentInstruction = `You are ${agent.name} (${agent.id}).\n` +
      `Specialties: ${agent.specialties.join(', ')}.\n` +
      `Your description: ${agent.description}.\n` +
      `Respond ONLY with JSON matching the provided schema.`;

    const promptText = `${agentInstruction}\n\nUSER TASK:\n${userPrompt}`;

    return {
      model: this.defaultModel,
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
      config: {
        temperature: agent.temperature ?? 0.3,
        responseJsonSchema: AGENT_RESPONSE_SCHEMA,
        responseMimeType: 'application/json',
        maxOutputTokens: 2048,
      },
    } as GenerateContentParameters;
  }

  private safeParse(raw: string): any {
    try {
      return JSON.parse(raw);
    } catch (_error) {
      return {};
    }
  }

  private clampConfidence(value: unknown): number {
    if (typeof value !== 'number' || Number.isNaN(value)) return 0.0;
    return Math.min(1, Math.max(0, value));
  }

  private extractText(response: GenerateContentResponse): string {
    const text = response.candidates?.[0]?.content?.parts?.[0];
    if (!text) return '';
    if (typeof text === 'string') return text;
    if (typeof text === 'object' && text && 'text' in text && typeof text.text === 'string') {
      return text.text;
    }
    return '';
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

    const text = this.extractText(response);

    const [finalResponse, aggregateReasoning] = this.splitFinalResponse(text);

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
