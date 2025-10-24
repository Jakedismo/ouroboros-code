/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { Agent } from '@openai/agents';
import { z } from 'zod';
import type { Config } from '../config/config.js';
import { UnifiedAgentsClient } from '../runtime/unifiedAgentsClient.js';
import { AgentManager } from './agentManager.js';
import { AGENT_PERSONAS, getAgentById, type AgentPersona } from './personas.js';
import {
  MultiAgentExecutor,
  MultiAgentAbortedError,
  type MultiAgentExecutionResult,
  type MultiAgentExecutionHooks,
} from './multiAgentExecutor.js';
import { convertJsonSchemaToZod } from '../runtime/jsonSchemaToZod.js';

/**
 * JSON Schema for OpenAI Structured Outputs - Agent Selection Response
 */
const AGENT_SELECTION_SCHEMA = {
  name: 'agent_selection_response',
  schema: {
    type: 'object',
    properties: {
      agentIds: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Array of selected agent IDs',
      },
      reasoning: {
        type: 'string',
        description: 'Clear explanation of why these agents were selected',
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Confidence score between 0 and 1',
      },
      taskCategory: {
        type: 'string',
        description: 'Category of the task',
      },
    },
    required: ['agentIds', 'reasoning', 'confidence'],
    additionalProperties: false,
  },
} as const;

/**
 * Service for automatically selecting the most appropriate agents for user prompts
 * using GPT-5-nano as an intelligent dispatcher
 */
export class AgentSelectorService {
  private static instance: AgentSelectorService | null = null;
  private unifiedClient: UnifiedAgentsClient | null = null;
  private agentManager: AgentManager | null = null;
  private config: Config | null = null;
  private selectedModel: string | null = null;
  private isAutoModeActive = false;
  private selectionHistory: Array<{
    prompt: string;
    selectedAgents: string[];
    reasoning: string;
    confidence: number;
    aggregateReasoning?: string;
    toolSummary?: Record<string, number>;
    timestamp: number;
  }> = [];
  private readonly fallbackAgents = [
    'systems-architect',
    'code-quality-analyst',
  ];
  private multiAgentExecutor: MultiAgentExecutor | null = null;
  private lastExecutionSummary: MultiAgentExecutionResult | null = null;
  private initialized = false;
  private initializedConfigRef: Config | null = null;
  private activeExecutionAbortController: AbortController | null = null;

  private getProviderDefaultModel(): string {
    const provider = this.config?.getProvider();
    switch (provider) {
      case 'anthropic':
        return 'claude-sonnet-4-20250514[1m]';
      case 'gemini':
        return 'gemini-2.5-pro';
      case 'openai':
      default:
        return 'gpt-5';
    }
  }

  private constructor() {}

  static getInstance(): AgentSelectorService {
    if (!AgentSelectorService.instance) {
      AgentSelectorService.instance = new AgentSelectorService();
    }
    return AgentSelectorService.instance;
  }

  /**
   * Initialize the agent selector service with the same ContentGenerator as regular chat
   * @param config - Active configuration (provides the shared AgentsClient/content generator)
   */
  async initialize(config: Config): Promise<void> {
    if (this.initialized && this.initializedConfigRef === config) {
      return;
    }

    this.config = config;
    this.unifiedClient = new UnifiedAgentsClient(config);

    this.selectedModel = config.getModel();
    this.agentManager = AgentManager.getInstance();

    const defaultModel =
      this.selectedModel || config.getModel() || this.getProviderDefaultModel();
    this.multiAgentExecutor = new MultiAgentExecutor(config, {
      defaultModel,
      client: this.unifiedClient,
    });
    this.initialized = true;
    this.initializedConfigRef = config;
  }

  /**
   * Toggle automatic agent selection mode
   */
  setAutoMode(enabled: boolean): void {
    this.isAutoModeActive = enabled;
    if (!enabled) {
      this.cancelActiveExecution('auto-mode-disabled');
      if (this.agentManager) {
        void this.agentManager.deactivateAllAgents().catch(error => {
          console.warn('Failed to deactivate agents during auto-mode shutdown:', error);
        });
      }
    }
  }

  /**
   * Check if auto mode is active
   */
  isAutoModeEnabled(): boolean {
    return this.isAutoModeActive;
  }

  /**
   * Analyze a user prompt and automatically select the best agents with streaming feedback
   */
  async *analyzeAndSelectAgentsStream(userPrompt: string): AsyncGenerator<{
    type: 'progress' | 'complete';
    message?: string;
    selectedAgents?: AgentPersona[];
    reasoning?: string;
    confidence?: number;
    processingTime?: number;
  }> {
    console.log(
      '[AgentSelector] DEBUG - analyzeAndSelectAgentsStream (STREAMING) called - REDIRECTING TO NON-STREAMING',
    );

    // Redirect to the non-streaming version to avoid JSON parsing issues
    try {
      yield {
        type: 'progress',
        message: '⚡ **Evaluating specialist expertise...**',
      };
      yield {
        type: 'progress',
        message: '✅ **Finalizing specialist selection...**',
      };

      const result = await this.analyzeAndSelectAgents(userPrompt);

      yield {
        type: 'complete',
        selectedAgents: result.selectedAgents,
        reasoning: result.reasoning,
        confidence: result.confidence,
        processingTime: result.processingTime,
      };
      return;
    } catch (error) {
      console.error('[AgentSelector] Error in streaming wrapper:', error);
      yield {
        type: 'complete',
        selectedAgents: [],
        reasoning: 'Error occurred during agent selection',
        confidence: 0,
        processingTime: 0,
      };
      return;
    }
  }

  /**
   * Analyze a user prompt and automatically select the best agents (legacy method)
   */
  async analyzeAndSelectAgents(userPrompt: string): Promise<{
    selectedAgents: AgentPersona[];
    reasoning: string;
    confidence: number;
    processingTime: number;
  }> {
    console.log(
      '[AgentSelector] DEBUG - analyzeAndSelectAgents (NON-STREAMING) called',
    );
    const startTime = Date.now();

    if (!this.isAutoModeActive || !this.unifiedClient) {
      return {
        selectedAgents: [],
        reasoning: 'Auto mode disabled or service not initialized',
        confidence: 0,
        processingTime: Date.now() - startTime,
      };
    }

    const modelCandidates = this.buildSelectionModelCandidates();
    const attemptedModels: string[] = [];
    const selectionErrors: Array<{ model: string; error: unknown }> = [];

    for (const model of modelCandidates) {
      if (!model) {
        continue;
      }
      attemptedModels.push(model);
      try {
        const selection = await this.runSelectionAttempt(userPrompt, model);
        const selectedAgents = selection.agentIds
          .map((id) => getAgentById(id))
          .filter(Boolean) as AgentPersona[];

        const finalSelection = this.validateAndEnhanceSelection(
          selectedAgents,
          userPrompt,
        );

        this.recordSelection(
          userPrompt,
          finalSelection.map((agent) => agent.id),
          selection.reasoning,
          selection.confidence,
        );

        return {
          selectedAgents: finalSelection,
          reasoning: selection.reasoning,
          confidence: selection.confidence,
          processingTime: Date.now() - startTime,
        };
      } catch (error) {
        selectionErrors.push({ model, error });
        console.warn(
          `[AgentSelector] Structured selection attempt with model "${model}" failed:`,
          error,
        );
      }
    }

    const fallbackAgents = this.validateAndEnhanceSelection(
      this.fallbackSelection(userPrompt),
      userPrompt,
    );

    const attemptedSummary = attemptedModels.length
      ? attemptedModels.join(', ')
      : 'none';
    const lastError = selectionErrors[selectionErrors.length - 1]?.error;
    const errorDetails =
      lastError instanceof Error
        ? lastError.message
        : lastError
          ? String(lastError)
          : 'unknown error';

    const reasoning = selectionErrors.length
      ? `Structured dispatcher could not scout specialists after trying ${attemptedSummary}. Falling back to heuristics (${errorDetails}).`
      : 'Structured dispatcher unavailable; using heuristic agent selection.';

    this.recordSelection(
      userPrompt,
      fallbackAgents.map((agent) => agent.id),
      reasoning,
      0.3,
    );

    return {
      selectedAgents: fallbackAgents,
      reasoning,
      confidence: 0.3,
      processingTime: Date.now() - startTime,
    };
  }

  private buildSelectionModelCandidates(): string[] {
    const candidates: string[] = [];
    const provider = this.config?.getProvider();

    const providerDefault = this.getProviderDefaultModel();
    if (providerDefault) {
      candidates.push(providerDefault);
    }

    if (this.selectedModel) {
      candidates.push(this.selectedModel);
    }

    if (this.config) {
      const configuredModel = this.config.getModel();
      if (configuredModel) {
        candidates.push(configuredModel);
      }
    }

    if (provider === 'openai') {
      candidates.push('gpt-5', 'gpt-5-codex');
    }

    return Array.from(
      new Set(
        candidates.filter(
          (model) => typeof model === 'string' && model.trim().length > 0,
        ),
      ),
    );
  }

  private async runSelectionAttempt(
    userPrompt: string,
    model: string,
  ): Promise<{
    agentIds: string[];
    reasoning: string;
    confidence: number;
    taskCategory?: string;
  }> {
    if (!this.unifiedClient || !this.config) {
      throw new Error('Agent selector service is not initialized');
    }

    const providerId = this.config.getProvider();
    const selectionSchemaRaw = convertJsonSchemaToZod(AGENT_SELECTION_SCHEMA.schema);
    if (!(selectionSchemaRaw instanceof z.ZodObject)) {
      throw new Error('Agent selection schema must resolve to a Zod object.');
    }
    const selectionSchema = selectionSchemaRaw as z.ZodObject<{
      agentIds: z.ZodArray<z.ZodString, 'many'>;
      reasoning: z.ZodString;
      confidence: z.ZodNumber;
      taskCategory: z.ZodOptional<z.ZodString>;
    }>;
    const dispatcherInstructions = [
      'You are the Ouroboros agent dispatcher. Select the ideal specialists to solve the task.',
      'Return only the structured object that matches the documented schema—no prose, markdown, or additional keys.',
      'Choose between three and ten distinct agent IDs and justify the selection succinctly.',
    ].join('\n\n');

    const userInput = `${this.buildSelectionPrompt(userPrompt)}\n\nUSER PROMPT:
${userPrompt}`;

    const { runResult } = await this.unifiedClient.runAgentOnce({
      sessionConfig: {
        providerId,
        model,
        systemPrompt: dispatcherInstructions,
        metadata: {
          agentId: 'auto-dispatcher',
          agentName: 'Auto Agent Dispatcher',
        },
      },
      buildAgent: ({ session, modelSettings }) =>
        new Agent({
          name: 'auto-dispatcher',
          instructions: dispatcherInstructions,
          model: session.modelHandle!,
          modelSettings,
          tools: [],
          outputType: selectionSchema,
        }),
      input: userInput,
      parallelToolCalls: false,
    });

    const parsed = this.parseSelectionPayload(runResult.finalOutput, model);
    const rawAgentIds = parsed['agentIds'];

    const candidateIds = normalizeAgentIds(rawAgentIds);
    if (candidateIds.length === 0) {
      throw new Error(`Model ${model} returned no agent IDs`);
    }

    const uniqueAgentIds = Array.from(new Set(candidateIds));

    let clampedAgentIds = uniqueAgentIds.slice(0, 10);
    if (clampedAgentIds.length === 0) {
      throw new Error(`Model ${model} returned invalid agent IDs`);
    }

    if (clampedAgentIds.length < 3) {
      const supplements = this.fallbackAgents.filter((id) =>
        !clampedAgentIds.includes(id),
      );
      const expanded = clampedAgentIds.concat(supplements);
      clampedAgentIds = Array.from(new Set(expanded)).slice(0, Math.max(3, expanded.length));
    }

    const reasoning =
      typeof parsed['reasoning'] === 'string'
        ? parsed['reasoning']
        : 'No reasoning provided.';
    const confidenceValue =
      typeof parsed['confidence'] === 'number'
        ? parsed['confidence']
        : typeof parsed['confidence'] === 'string'
          ? Number.parseFloat(parsed['confidence'] as string)
          : 0;
    const confidence =
      Number.isFinite(confidenceValue) && !Number.isNaN(confidenceValue)
        ? Math.min(1, Math.max(0, confidenceValue))
        : 0;
    const taskCategory =
      typeof parsed['taskCategory'] === 'string'
        ? parsed['taskCategory']
        : undefined;

    return {
      agentIds: clampedAgentIds,
      reasoning,
      confidence,
      taskCategory,
    };
  }

  private parseSelectionPayload(raw: unknown, model: string): Record<string, unknown> {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }

    if (raw && typeof (raw as { toJSON?: () => unknown }).toJSON === 'function') {
      const candidate = (raw as { toJSON: () => unknown }).toJSON();
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        return candidate as Record<string, unknown>;
      }
    }

    if (typeof raw === 'string') {
      const attempts = [raw, extractFirstJsonObject(raw)]
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

      for (const attempt of attempts) {
        try {
          const parsed = JSON.parse(attempt);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
          }
        } catch (_error) {
          // proceed to next attempt
        }
      }
    }

    throw new Error(
      `Selection model ${model} did not return parsable structured output`,
    );
  }

  async executeWithSelectedAgents(
    userPrompt: string,
    agents: AgentPersona[],
    hooks?: MultiAgentExecutionHooks,
  ): Promise<MultiAgentExecutionResult | null> {
    if (!this.multiAgentExecutor || agents.length === 0) {
      return null;
    }

    this.cancelActiveExecution('replacing-active-execution');

    const controller = new AbortController();
    this.activeExecutionAbortController = controller;

    try {
      const execution = await this.multiAgentExecutor.execute(
        userPrompt,
        agents,
        hooks,
        { abortSignal: controller.signal },
      );

      if (this.activeExecutionAbortController === controller) {
        this.activeExecutionAbortController = null;
      }

      this.lastExecutionSummary = execution;

      const latestEntry = this.selectionHistory[this.selectionHistory.length - 1];
      if (latestEntry) {
        latestEntry.aggregateReasoning = execution.aggregateReasoning;
        latestEntry.toolSummary = execution.agentResults.reduce<
          Record<string, number>
        >((acc, result) => {
          acc[result.agent.id] = result.toolEvents?.length ?? 0;
          return acc;
        }, {});
      }

      return execution;
    } catch (error) {
      if (error instanceof MultiAgentAbortedError) {
        return null;
      }
      throw error;
    } finally {
      if (this.activeExecutionAbortController === controller) {
        this.activeExecutionAbortController = null;
      }
    }
  }

  /**
   * Temporarily activate selected agents for a single conversation turn
   */
  async temporarilyActivateAgents(agents: AgentPersona[]): Promise<{
    previouslyActive: string[];
    activatedAgents: string[];
  }> {
    if (!this.agentManager) {
      throw new Error('AgentManager not available');
    }

    // Store currently active agents
    const previouslyActive = this.agentManager
      .getActiveAgents()
      .map((a) => a.id);

    // Deactivate all current agents
    await this.agentManager.deactivateAllAgents();

    // Activate selected agents
    const activatedAgents: string[] = [];
    for (const agent of agents) {
      const result = await this.agentManager.activateAgent(agent.id);
      if (result.success) {
        activatedAgents.push(agent.id);
      }
    }

    return { previouslyActive, activatedAgents };
  }

  /**
   * Restore previous agent state
   */
  async restorePreviousAgentState(previouslyActive: string[]): Promise<void> {
    if (!this.agentManager) return;

    // Deactivate temporary agents
    await this.agentManager.deactivateAllAgents();

    // Restore previously active agents
    for (const agentId of previouslyActive) {
      await this.agentManager.activateAgent(agentId);
    }
  }

  /**
   * Get selection history for analysis and debugging
   */
  getSelectionHistory(limit = 10): Array<{
    prompt: string;
    selectedAgents: string[];
    reasoning: string;
    timestamp: number;
  }> {
    return this.selectionHistory.slice(-limit);
  }

  cancelActiveExecution(reason?: string): void {
    if (!this.activeExecutionAbortController) {
      return;
    }
    if (reason) {
      console.debug('[AgentSelectorService] Cancelling active execution:', reason);
    }
    try {
      this.activeExecutionAbortController.abort();
    } finally {
      this.activeExecutionAbortController = null;
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  hasInitializedWith(config: Config): boolean {
    return this.initialized && this.initializedConfigRef === config;
  }

  /**
   * Build the specialized prompt for GPT-5-nano agent selection
   */
  private buildSelectionPrompt(userPrompt: string): string {
    const agentSummaries = AGENT_PERSONAS.map(
      (agent) =>
        `${agent.id}: ${agent.category} - ${agent.description} (${agent.specialties.slice(0, 3).join(', ')})`,
    ).join('\n');

    return `You are an AI agent dispatcher for a software engineering assistant. Your job is to analyze user prompts and select the 1-3 most appropriate specialist agents from our team of 50+ experts.

AVAILABLE AGENTS:
${agentSummaries}

SELECTION CRITERIA:
1. Choose agents whose specialties directly match the user's request
2. For complex tasks, select complementary agents (e.g., architect + specialist)
3. Default to 1-2 agents unless the task clearly needs more perspectives
4. For ambiguous requests, favor general-purpose agents like systems-architect
5. Consider the full context and intent, not just keywords

OUTPUT REQUIREMENTS:
- Select 1-10 agent IDs from the available agents list above
- Provide clear reasoning for your selection explaining why these agents are best suited
- Include a confidence score (0.0 to 1.0) for your selection
- Optionally categorize the task type
- Respond with JSON: {"agentIds":["id"], "reasoning":"...", "confidence":0.0-1.0, "taskCategory":"optional"}
- Do not include any prose outside the JSON object

EXAMPLES:
User: "Optimize my React component rendering performance"
→ ["react-specialist", "web-performance-specialist"]

User: "Design a microservices API for user authentication"
→ ["api-designer", "microservices-architect", "security-auditor"]

User: "My database queries are slow"
→ ["database-optimizer"]

User: "Review this Python code"
→ ["python-specialist", "code-quality-analyst"]

Select the most appropriate agents for this user request:`;
  }

  /**
   * Validate selection and apply intelligent fallbacks
   */
  private validateAndEnhanceSelection(
    selectedAgents: AgentPersona[],
    userPrompt: string,
  ): AgentPersona[] {
    const uniqueAgents = selectedAgents.filter((agent, index, array) =>
      array.findIndex((candidate) => candidate.id === agent.id) === index,
    );

    if (uniqueAgents.length === 0) {
      return this.fallbackSelection(userPrompt);
    }

    if (uniqueAgents.length > 3) {
      return uniqueAgents.slice(0, 3);
    }

    return uniqueAgents;
  }

  /**
   * Fallback agent selection using simple heuristics
   */
  private fallbackSelection(userPrompt: string): AgentPersona[] {
    const promptLower = userPrompt.toLowerCase();
    const results: AgentPersona[] = [];
    const ensureAgent = (agentId: string | undefined) => {
      if (!agentId) return;
      const agent = getAgentById(agentId);
      if (!agent) return;
      if (!results.some((entry) => entry.id === agent.id)) {
        results.push(agent);
      }
    };

    // Always include a generalist coordinator first
    ensureAgent('systems-architect');

    // Simple keyword-based fallback matching
    const keywordMatches = [
      {
        keywords: ['react', 'frontend', 'ui', 'component'],
        agent: 'react-specialist',
      },
      {
        keywords: ['database', 'sql', 'query', 'db'],
        agent: 'database-optimizer',
      },
      {
        keywords: ['api', 'rest', 'graphql', 'endpoint'],
        agent: 'api-designer',
      },
      {
        keywords: ['security', 'vulnerability', 'auth'],
        agent: 'security-auditor',
      },
      {
        keywords: ['performance', 'slow', 'optimize'],
        agent: 'performance-engineer',
      },
      {
        keywords: ['kubernetes', 'k8s', 'container'],
        agent: 'kubernetes-operator',
      },
      { keywords: ['python'], agent: 'python-specialist' },
      {
        keywords: ['node', 'nodejs', 'javascript'],
        agent: 'node-js-specialist',
      },
      { keywords: ['documentation', 'doc', 'docs'], agent: 'technical-writer' },
      {
        keywords: ['design', 'architecture', 'architect'],
        agent: 'systems-architect',
      },
      { keywords: ['machine learning', 'ml', 'ai'], agent: 'ml-engineer' },
    ];

    for (const match of keywordMatches) {
      if (match.keywords.some((keyword) => promptLower.includes(keyword))) {
        ensureAgent(match.agent);
      }
    }

    if (results.length < 2) {
      ensureAgent('code-quality-analyst');
    }

    if (results.length < 2) {
      for (const fallbackId of this.fallbackAgents) {
        ensureAgent(fallbackId);
        if (results.length >= 2) {
          break;
        }
      }
    }

    return results.slice(0, 3);
  }

  /**
   * Record selection for history and analysis
   */
  private recordSelection(
    prompt: string,
    selectedAgentIds: string[],
    reasoning: string,
    confidence: number,
  ): void {
    this.selectionHistory.push({
      prompt: prompt.length > 100 ? prompt.substring(0, 100) + '...' : prompt,
      selectedAgents: selectedAgentIds,
      reasoning,
      confidence,
      timestamp: Date.now(),
    });

    // Keep only last 50 selections
    if (this.selectionHistory.length > 50) {
      this.selectionHistory = this.selectionHistory.slice(-50);
    }
  }

  /**
   * Get statistics about agent selection patterns
   */
  getSelectionStats(): {
    totalSelections: number;
    averageAgentsPerSelection: number;
    mostSelectedAgents: Array<{ agentId: string; count: number }>;
    averageConfidence: number;
    averageToolCallsPerSelection: number;
    toolUsageByAgent: Array<{ agentId: string; toolCalls: number }>;
    lastExecutionSummary: MultiAgentExecutionResult | null;
  } {
    if (this.selectionHistory.length === 0) {
      return {
        totalSelections: 0,
        averageAgentsPerSelection: 0,
        mostSelectedAgents: [],
        averageConfidence: 0,
        averageToolCallsPerSelection: 0,
        toolUsageByAgent: [],
        lastExecutionSummary: null,
      };
    }

    const agentCounts: Record<string, number> = {};
    let totalAgents = 0;
    let totalConfidence = 0;
    let totalToolCalls = 0;
    const toolCounts: Record<string, number> = {};

    for (const selection of this.selectionHistory) {
      totalAgents += selection.selectedAgents.length;
      totalConfidence += selection.confidence ?? 0;
      for (const agentId of selection.selectedAgents) {
        agentCounts[agentId] = (agentCounts[agentId] || 0) + 1;
      }
      if (selection.toolSummary) {
        for (const [agentId, count] of Object.entries(selection.toolSummary)) {
          totalToolCalls += count;
          toolCounts[agentId] = (toolCounts[agentId] || 0) + count;
        }
      }
    }

    const mostSelectedAgents = Object.entries(agentCounts)
      .map(([agentId, count]) => ({ agentId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalSelections: this.selectionHistory.length,
      averageAgentsPerSelection: totalAgents / this.selectionHistory.length,
      mostSelectedAgents,
      averageConfidence: totalConfidence / this.selectionHistory.length,
      averageToolCallsPerSelection:
        this.selectionHistory.length === 0
          ? 0
          : totalToolCalls / this.selectionHistory.length,
      toolUsageByAgent: Object.entries(toolCounts)
        .map(([agentId, toolCalls]) => ({ agentId, toolCalls }))
        .sort((a, b) => b.toolCalls - a.toolCalls),
      lastExecutionSummary: this.lastExecutionSummary,
    };
  }
}

function normalizeAgentIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return normalizeAgentIds(parsed);
        }
      } catch (_error) {
        // fall back to delimiter parsing below
      }
    }

    return trimmed
      .split(/[,\n]/)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
  }

  return [];
}

function extractFirstJsonObject(text: string | undefined): string | null {
  if (!text) {
    return null;
  }

  let depth = 0;
  let startIndex = -1;
  let inString = false;
  let isEscaped = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (char === '\\') {
        isEscaped = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        startIndex = index;
      }
      depth += 1;
      continue;
    }

    if (char === '}') {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && startIndex !== -1) {
          return text.slice(startIndex, index + 1);
        }
      }
      continue;
    }
  }

  return null;
}
