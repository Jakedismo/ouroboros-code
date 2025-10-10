/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { Agent, type ModelSettings, type Tool as AgentsTool } from '@openai/agents';
import { z } from 'zod';
import type { Config } from '../config/config.js';
import { UnifiedAgentsClient } from '../runtime/unifiedAgentsClient.js';
import type { UnifiedAgentSession } from '../runtime/types.js';
import { adaptToolsToAgents } from '../runtime/toolAdapter.js';
import type { ToolCallRequestInfo, ToolCallResponseInfo } from '../core/turn.js';
import type { AgentPersona } from './personas.js';
import { injectToolExamples } from './toolInjector.js';
import type { ToolResultDisplay, ToolErrorType } from '../tools/tools.js';
import { toolResponsePartsToString } from '../utils/toolResponseStringifier.js';
import { createHostedWebSearchTool, HOSTED_WEB_SEARCH_NAME } from '../tools/web-search-sdk.js';

interface MultiAgentExecutorOptions {
  defaultModel?: string;
  client?: UnifiedAgentsClient;
  disableDelegation?: boolean;
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

const ORCHESTRATOR_AGENT_NAME = 'ouroboros-orchestrator';
const MIN_SPECIALISTS = 3;
const MAX_SPECIALISTS = 10;

const SPECIALIST_OUTPUT_SCHEMA = z.object({
  analysis: z.string().min(1, 'analysis is required'),
  solution: z.string().default(''),
  confidence: z.number().min(0).max(1).default(0.5),
  handoff: z.array(z.string()).max(MAX_SPECIALISTS).default([]),
});

type SpecialistSchema = typeof SPECIALIST_OUTPUT_SCHEMA;

const ORCHESTRATOR_OUTPUT_SCHEMA = z.object({
  finalResponse: z.string().min(1, 'finalResponse is required'),
  reasoning: z.string().min(1, 'reasoning is required'),
});

type OrchestratorSchema = typeof ORCHESTRATOR_OUTPUT_SCHEMA;

type SpecialistStructuredOutput = z.infer<SpecialistSchema>;
type OrchestratorStructuredOutput = z.infer<OrchestratorSchema>;

type SpecialistMemoryEntry = {
  lastOutput?: SpecialistStructuredOutput;
  history: SpecialistStructuredOutput[];
};

interface OrchestrationRunContext {
  userPrompt: string;
  memory: Record<string, SpecialistMemoryEntry>;
}

interface BuildAgentToolsOptions {
  session: UnifiedAgentSession;
  persona?: AgentPersona;
  toolEventLog?: Map<string, AgentToolEvent[]>;
  hooks?: MultiAgentExecutionHooks;
}

export class MultiAgentExecutor {
  private readonly defaultModel: string;
  private readonly providedClient?: UnifiedAgentsClient;
  private readonly disableDelegation: boolean;

  constructor(
    private readonly config: Config,
    options: MultiAgentExecutorOptions = {},
  ) {
    this.defaultModel = options.defaultModel ?? 'gpt-5-codex';
    this.providedClient = options.client;
    this.disableDelegation = options.disableDelegation ?? false;
  }

  async execute(
    userPrompt: string,
    seedAgents: AgentPersona[],
    hooks?: MultiAgentExecutionHooks,
  ): Promise<MultiAgentExecutionResult> {
    if (seedAgents.length === 0) {
      throw new Error('Delegated execution requires at least one specialist agent.');
    }

    if (this.disableDelegation) {
      console.warn('[MultiAgentExecutor] disableDelegation is deprecated; running orchestrated flow regardless.');
    }

    const client = this.providedClient ?? new UnifiedAgentsClient(this.config);
    return this.executeWithDelegation(userPrompt, seedAgents, client, hooks);
  }

  private async executeWithDelegation(
    userPrompt: string,
    seedAgents: AgentPersona[],
    unifiedClient: UnifiedAgentsClient,
    hooks?: MultiAgentExecutionHooks,
  ): Promise<MultiAgentExecutionResult> {
    const startedAt = Date.now();

    const toolEventLog = new Map<string, AgentToolEvent[]>();
    const personaByAgentName = new Map<string, AgentPersona>();
    const agentResultsById = new Map<string, AgentRunResult>();
    const timeline: Array<{ wave: number; agents: AgentPersona[] }> = [];
    const waveByAgentId = new Map<string, number>();
    const runContext: OrchestrationRunContext = {
      userPrompt,
      memory: {},
    };

    let currentWave = 0;

    const onAgentEvent = (
      event:
        | { type: 'agent_start'; agent: Agent }
        | { type: 'agent_end'; agent: Agent; output: string }
        | { type: 'agent_handoff'; from: Agent; to: Agent },
    ) => {
      if (event.type === 'agent_handoff') {
        const persona = personaByAgentName.get(event.to.name);
        if (persona) {
          currentWave += 1;
          waveByAgentId.set(persona.id, currentWave);
          timeline.push({ wave: currentWave, agents: [persona] });
        }
        return;
      }

      if (event.type === 'agent_start') {
        const persona = personaByAgentName.get(event.agent.name);
        if (!persona) return;

        const wave = waveByAgentId.get(persona.id) ?? (() => {
          currentWave += 1;
          waveByAgentId.set(persona.id, currentWave);
          timeline.push({ wave: currentWave, agents: [persona] });
          return currentWave;
        })();

        if (hooks?.onAgentStart) {
          void hooks.onAgentStart({
            agent: persona,
            wave,
            pendingAgents: this.computePendingAgents(seedAgents, agentResultsById, persona.id),
            previousResults: Array.from(agentResultsById.values()),
          });
        }
        return;
      }

      if (event.type === 'agent_end') {
        const persona = personaByAgentName.get(event.agent.name);
        if (!persona) return;

        const wave = waveByAgentId.get(persona.id) ?? (() => {
          currentWave += 1;
          waveByAgentId.set(persona.id, currentWave);
          timeline.push({ wave: currentWave, agents: [persona] });
          return currentWave;
        })();

        const { rawText, parsed } = this.parseSpecialistOutput(event.output);
        const toolEvents = toolEventLog.get(persona.id) ?? [];
        const result = this.buildAgentRunResult({ persona, parsed, rawText, toolEvents });
        agentResultsById.set(persona.id, result);

        this.updateMemoryEntry(runContext, persona.id, parsed ?? this.convertAgentResultToStructured(result));

        if (hooks?.onAgentComplete) {
          void hooks.onAgentComplete({
            agent: persona,
            wave,
            result,
            completedAgents: agentResultsById.size,
            remainingAgents: this.computeRemainingAgents(seedAgents, agentResultsById),
          });
        }
      }
    };

    const { runResult } = await unifiedClient.runAgentOnce({
      sessionConfig: {
        providerId: this.config.getProvider(),
        model: this.defaultModel,
        systemPrompt: undefined,
        metadata: {
          agentId: ORCHESTRATOR_AGENT_NAME,
          agentName: 'Multi-Agent Orchestrator',
        },
      },
      buildAgent: ({ session, modelSettings }) => {
        const { orchestrator } = this.buildOrchestrationGraph({
          session,
          modelSettings,
          userPrompt,
          seedAgents,
          toolEventLog,
          hooks,
          personaByAgentName,
        });
        return orchestrator;
      },
      input: this.buildOrchestratorUserInput(userPrompt, seedAgents),
      context: runContext,
      onAgentEvent,
    });

    if (agentResultsById.size === 0) {
      throw new Error('Orchestrator session finished without consulting any specialists.');
    }

    const orchestratorOutput = this.parseOrchestratorOutput(runResult.finalOutput);
    if (!orchestratorOutput) {
      throw new Error('Orchestrator did not return structured output.');
    }

    const agentResults = Array.from(agentResultsById.values());

    // Ensure timeline is sorted and consolidated by wave
    const orderedTimeline = timeline
      .reduce<Array<{ wave: number; agents: AgentPersona[] }>>((acc, entry) => {
        const existing = acc.find((item) => item.wave === entry.wave);
        if (existing) {
          for (const agent of entry.agents) {
            if (!existing.agents.some((candidate) => candidate.id === agent.id)) {
              existing.agents.push(agent);
            }
          }
        } else {
          acc.push({ wave: entry.wave, agents: [...entry.agents] });
        }
        return acc;
      }, [])
      .sort((a, b) => a.wave - b.wave);

    return {
      agentResults,
      finalResponse: orchestratorOutput.finalResponse,
      aggregateReasoning: orchestratorOutput.reasoning,
      timeline: orderedTimeline,
      totalAgents: agentResults.length,
      durationMs: Date.now() - startedAt,
    };
  }

  private buildOrchestrationGraph(args: {
    session: UnifiedAgentSession;
    modelSettings: Partial<ModelSettings>;
    userPrompt: string;
    seedAgents: AgentPersona[];
    toolEventLog: Map<string, AgentToolEvent[]>;
    hooks?: MultiAgentExecutionHooks;
    personaByAgentName: Map<string, AgentPersona>;
  }): { orchestrator: Agent<OrchestrationRunContext, OrchestratorSchema>; specialists: Agent<OrchestrationRunContext, SpecialistSchema>[] } {
    const { session, modelSettings, seedAgents, toolEventLog, hooks, personaByAgentName } = args;

    const specialists = seedAgents.slice(0, MAX_SPECIALISTS).map((persona) => {
      const agent = this.buildSpecialistAgent({
        session,
        modelSettings,
        persona,
        toolEventLog,
        hooks,
      });
      personaByAgentName.set(agent.name, persona);
      return agent;
    });

    const orchestrator = this.buildOrchestratorAgent({
      session,
      modelSettings,
      specialists,
      seedAgents,
    });

    return { orchestrator, specialists };
  }

  private buildSpecialistAgent(args: {
    session: UnifiedAgentSession;
    modelSettings: Partial<ModelSettings>;
    persona: AgentPersona;
    toolEventLog: Map<string, AgentToolEvent[]>;
    hooks?: MultiAgentExecutionHooks;
  }): Agent<OrchestrationRunContext, SpecialistSchema> {
    const { session, modelSettings, persona, toolEventLog, hooks } = args;
    const instructions = this.buildSpecialistInstructions(persona);

    const personaModelSettings: Partial<ModelSettings> = {
      ...modelSettings,
    };
    if (typeof persona.temperature === 'number') {
      personaModelSettings.temperature = persona.temperature;
    }

    const tools = this.buildAgentTools({
      session,
      persona,
      toolEventLog,
      hooks,
    });

    return new Agent<OrchestrationRunContext, SpecialistSchema>({
      name: persona.id,
      instructions,
      handoffDescription: `${persona.emoji} ${persona.name} — ${persona.description}`,
      handoffs: [],
      model: session.modelHandle!,
      modelSettings: personaModelSettings,
      tools,
      outputType: SPECIALIST_OUTPUT_SCHEMA,
    });
  }

  private buildOrchestratorAgent(args: {
    session: UnifiedAgentSession;
    modelSettings: Partial<ModelSettings>;
    specialists: Agent<OrchestrationRunContext, SpecialistSchema>[];
    seedAgents: AgentPersona[];
  }): Agent<OrchestrationRunContext, OrchestratorSchema> {
    const { session, modelSettings, specialists, seedAgents } = args;
    const instructions = this.buildOrchestratorInstructions(seedAgents);
    const tools = this.buildAgentTools({ session });

    const orchestratorSettings: Partial<ModelSettings> = {
      ...modelSettings,
    };

    return new Agent<OrchestrationRunContext, OrchestratorSchema>({
      name: ORCHESTRATOR_AGENT_NAME,
      instructions,
      handoffDescription: 'Primary Ouroboros orchestrator coordinating specialist handoffs.',
      handoffs: specialists,
      model: session.modelHandle!,
      modelSettings: orchestratorSettings,
      tools,
      outputType: ORCHESTRATOR_OUTPUT_SCHEMA,
    });
  }

  private buildAgentTools(options: BuildAgentToolsOptions): AgentsTool[] {
    const { session, persona, toolEventLog, hooks } = options;
    const registry = this.config.getToolRegistry();

    const adaptedTools = adaptToolsToAgents({
      registry,
      config: this.config,
      getPromptId: () => session.id,
      agentId: persona?.id ?? ORCHESTRATOR_AGENT_NAME,
      agentName: persona?.name ?? 'Multi-Agent Orchestrator',
      agentEmoji: persona?.emoji,
      onToolExecuted:
        persona && toolEventLog
          ? ({ request, response }) =>
              this.recordToolEvent({
                persona,
                toolEventLog,
                hooks,
                request,
                response,
              })
          : undefined,
    });

    const hostedTools = this.createHostedToolsForSession(session, registry);
    const mergedTools = this.mergeTools(adaptedTools, hostedTools);

    if (persona?.suggestedTools?.length) {
      const allowed = new Set(persona.suggestedTools.map((name) => name.toLowerCase()));
      const filtered = mergedTools.filter((tool) => {
        const toolName = tool.name?.toLowerCase();
        return !toolName || allowed.has(toolName);
      });
      if (filtered.length > 0) {
        return filtered;
      }
    }

    return mergedTools;
  }

  private createHostedToolsForSession(
    session: UnifiedAgentSession,
    registry: ReturnType<Config['getToolRegistry']>,
  ): AgentsTool[] {
    if (
      session.providerId !== 'openai' ||
      !this.config.isToolEnabled([HOSTED_WEB_SEARCH_NAME, 'web_search'], 'WebSearchTool') ||
      registry.getTool(HOSTED_WEB_SEARCH_NAME)
    ) {
      return [];
    }

    return [createHostedWebSearchTool(this.config)];
  }

  private mergeTools(primary: AgentsTool[], secondary: AgentsTool[]): AgentsTool[] {
    if (secondary.length === 0) {
      return primary;
    }
    const seen = new Set<string>();
    const merged: AgentsTool[] = [];
    for (const tool of [...primary, ...secondary]) {
      const key = tool.name ?? `anonymous-${merged.length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(tool);
    }
    return merged;
  }

  private recordToolEvent(args: {
    persona: AgentPersona;
    toolEventLog: Map<string, AgentToolEvent[]>;
    hooks?: MultiAgentExecutionHooks;
    request: ToolCallRequestInfo;
    response: ToolCallResponseInfo;
  }): void {
    const { persona, toolEventLog, hooks, request, response } = args;
    const events = toolEventLog.get(persona.id) ?? [];
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
    events.push(event);
    toolEventLog.set(persona.id, events);

    if (hooks?.onToolEvent) {
      void hooks.onToolEvent({ agent: persona, event });
    }
  }

  private buildSpecialistInstructions(persona: AgentPersona): string {
    const domainKnowledge = injectToolExamples(persona.systemPrompt, persona.specialties);

    return [
      `You are ${persona.name} (${persona.id}) ${persona.emoji}.`,
      persona.description,
      domainKnowledge,
      'Leverage tools when they strengthen your analysis. Reference prior outputs available via context.memory to avoid duplication.',
      `Provide your final response using the structured schema provided by the SDK (analysis, solution, confidence, handoff). Do not wrap JSON in Markdown fences.`,
      `If you recommend additional specialists, list their agent IDs in the handoff array. Confidence must be between 0 and 1.`,
    ].join('\n\n');
  }

  private buildOrchestratorInstructions(seedAgents: AgentPersona[]): string {
    const roster = this.formatAgentRoster(seedAgents);
    return [
      'You are the Ouroboros multi-agent orchestrator responsible for coordinating specialist agents inside a single shared session.',
      roster,
      'Process: (1) understand the user task, (2) plan an approach, (3) delegate to 3-10 specialists using handoffs, possibly in parallel waves, (4) merge their findings into a final solution.',
      'For every handoff, provide the specialist with a concise directive that references the user prompt and any relevant prior outputs stored in context.memory. Update context.memory[agentId] with each specialist’s structured output before delegating to the next specialist.',
      'Before every handoff or tool invocation, emit a short reasoning line prefixed with "HANDOFF_PLAN:" describing why that action is necessary and which TODO item it tackles.',
      'Maintain a rolling TODO ledger in context.memory["orchestrator_todo"]. Add entries before delegating, mark them as [DONE] when resolved, and echo the final ledger at the end of the reasoning field you return.',
      'Ensure every consulted specialist completes their run and returns structured output conforming to the SDK schema.',
      'When all required work is complete, produce a final structured object with fields { finalResponse, reasoning }. finalResponse may include Markdown, but do not emit code fences or extra wrapper text.',
      'Respect token efficiency: reuse knowledge from earlier specialists and avoid redundant tool calls unless necessary.',
      'If the seed roster lacks required expertise, you may still produce handoff recommendations in the final reasoning, but you must only run specialists provided as handoffs in this graph.',
    ].join('\n\n');
  }

  private buildOrchestratorUserInput(
    userPrompt: string,
    selectedAgents: AgentPersona[],
  ): string {
    const roster = this.formatAgentRoster(selectedAgents);
    return [
      roster,
      'USER REQUEST:',
      userPrompt,
      'Deliver the best possible solution by delegating to the most relevant specialists and composing their insights.',
    ].join('\n\n');
  }

  private formatAgentRoster(agents: AgentPersona[]): string {
    if (agents.length === 0) {
      return 'Available specialists: none provided.';
    }
    const lines = agents.map((agent, index) => {
      const specialties = agent.specialties.slice(0, 3).join(', ');
      return `${index + 1}. ${agent.id} — ${agent.name} (${specialties})`;
    });
    const minSelectable = Math.min(MIN_SPECIALISTS, agents.length);
    const maxSelectable = Math.min(MAX_SPECIALISTS, agents.length);
    return `Available specialists (select at least ${minSelectable} and at most ${maxSelectable} per run):\n${lines.join('\n')}`;
  }

  private parseSpecialistOutput(raw: unknown): { rawText: string; parsed: SpecialistStructuredOutput | null } {
    if (raw === null || raw === undefined) {
      return { rawText: '', parsed: null };
    }

    if (typeof raw === 'object') {
      const parsed = SPECIALIST_OUTPUT_SCHEMA.safeParse(raw);
      if (parsed.success) {
        return { rawText: JSON.stringify(parsed.data), parsed: parsed.data };
      }
      return { rawText: JSON.stringify(raw), parsed: null };
    }

    if (typeof raw !== 'string') {
      const text = String(raw);
      return { rawText: text, parsed: null };
    }

    const trimmed = raw.trim();
    const candidate = this.stripCodeFences(trimmed);
    try {
      const parsedJson = JSON.parse(candidate);
      const parsed = SPECIALIST_OUTPUT_SCHEMA.safeParse(parsedJson);
      if (parsed.success) {
        return { rawText: candidate, parsed: parsed.data };
      }
      return { rawText: candidate, parsed: null };
    } catch (_error) {
      return { rawText: candidate, parsed: null };
    }
  }

  private parseOrchestratorOutput(output: unknown): OrchestratorStructuredOutput | null {
    if (!output) return null;
    if (typeof output === 'object') {
      const parsed = ORCHESTRATOR_OUTPUT_SCHEMA.safeParse(output);
      if (parsed.success) {
        return parsed.data;
      }
    }
    if (typeof output === 'string') {
      const candidate = this.stripCodeFences(output.trim());
      try {
        const parsedJson = JSON.parse(candidate);
        const parsed = ORCHESTRATOR_OUTPUT_SCHEMA.safeParse(parsedJson);
        if (parsed.success) {
          return parsed.data;
        }
      } catch (_error) {
        return null;
      }
    }
    return null;
  }

  private stripCodeFences(text: string): string {
    const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
    if (fenceMatch) {
      return fenceMatch[1].trim();
    }
    return text;
  }

  private buildAgentRunResult(args: {
    persona: AgentPersona;
    parsed: SpecialistStructuredOutput | null;
    rawText: string;
    toolEvents: AgentToolEvent[];
  }): AgentRunResult {
    const { persona, parsed, rawText, toolEvents } = args;
    const base: SpecialistStructuredOutput = parsed ?? {
      analysis: rawText || 'No structured analysis provided.',
      solution: '',
      confidence: 0,
      handoff: [],
    };

    return {
      agent: persona,
      analysis: base.analysis,
      solution: base.solution ?? '',
      confidence: this.clampConfidence(base.confidence),
      handoffAgentIds: Array.isArray(base.handoff)
        ? base.handoff.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        : [],
      rawText: rawText || JSON.stringify(base),
      toolEvents,
    };
  }

  private convertAgentResultToStructured(result: AgentRunResult): SpecialistStructuredOutput {
    return {
      analysis: result.analysis,
      solution: result.solution,
      confidence: this.clampConfidence(result.confidence),
      handoff: [...result.handoffAgentIds],
    };
  }

  private updateMemoryEntry(
    runContext: OrchestrationRunContext,
    agentId: string,
    output: SpecialistStructuredOutput,
  ): void {
    const existing = runContext.memory[agentId];
    if (!existing) {
      runContext.memory[agentId] = {
        lastOutput: output,
        history: [output],
      };
      return;
    }
    existing.lastOutput = output;
    existing.history.push(output);
  }

  private computePendingAgents(
    seedAgents: AgentPersona[],
    agentResultsById: Map<string, AgentRunResult>,
    currentAgentId: string,
  ): AgentPersona[] {
    return seedAgents.filter(
      (agent) => agent.id !== currentAgentId && !agentResultsById.has(agent.id),
    );
  }

  private computeRemainingAgents(
    seedAgents: AgentPersona[],
    agentResultsById: Map<string, AgentRunResult>,
  ): number {
    return seedAgents.filter((agent) => !agentResultsById.has(agent.id)).length;
  }

  private clampConfidence(value: unknown): number {
    if (typeof value !== 'number' || Number.isNaN(value)) return 0.0;
    return Math.min(1, Math.max(0, value));
  }
}
