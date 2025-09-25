/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ContentGenerator } from '../core/contentGenerator.js';
import type { Config } from '../config/config.js';
import { AgentManager } from './agentManager.js';
import { AGENT_PERSONAS, getAgentById, type AgentPersona } from './personas.js';
import { MultiAgentExecutor, type MultiAgentExecutionResult } from './multiAgentExecutor.js';

/**
 * JSON Schema for OpenAI Structured Outputs - Agent Selection Response
 */
const AGENT_SELECTION_SCHEMA = {
  name: "agent_selection_response",
  schema: {
    type: "object",
    properties: {
      agentIds: {
        type: "array",
        items: {
          type: "string"
        },
        description: "Array of selected agent IDs"
      },
      reasoning: {
        type: "string",
        description: "Clear explanation of why these agents were selected"
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Confidence score between 0 and 1"
      },
      taskCategory: {
        type: "string",
        description: "Category of the task"
      }
    },
    required: ["agentIds", "reasoning", "confidence"],
    additionalProperties: false
  }
} as const;

/**
 * Service for automatically selecting the most appropriate agents for user prompts
 * using GPT-5-nano as an intelligent dispatcher
 */
export class AgentSelectorService {
  private static instance: AgentSelectorService | null = null;
  private contentGenerator: ContentGenerator | null = null;
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
  private readonly fallbackAgents = ['systems-architect', 'code-quality-analyst'];
  private multiAgentExecutor: MultiAgentExecutor | null = null;
  private lastExecutionSummary: MultiAgentExecutionResult | null = null;

  private constructor() {}

  static getInstance(): AgentSelectorService {
    if (!AgentSelectorService.instance) {
      AgentSelectorService.instance = new AgentSelectorService();
    }
    return AgentSelectorService.instance;
  }


  /**
   * Initialize the agent selector service with the same ContentGenerator as regular chat
   * @param config - The Config instance that contains the GeminiClient with ContentGenerator
   */
  async initialize(config: Config): Promise<void> {
    // Check if GeminiClient exists first
    const geminiClient = config.getGeminiClient();
    if (!geminiClient) {
      throw new Error('GeminiClient not initialized yet. Please ensure refreshAuth is called before initializing AgentSelectorService');
    }
    this.config = config;

    // Use the SAME ContentGenerator that regular chat uses - this ensures unified behavior
    this.contentGenerator = geminiClient.getContentGenerator();

    // Store the current model from config
    this.selectedModel = config.getModel();

    this.agentManager = AgentManager.getInstance();
    if (this.contentGenerator) {
      const defaultModel = this.selectedModel || config.getModel() || 'gpt-5-nano';
      this.multiAgentExecutor = new MultiAgentExecutor(this.contentGenerator, config, {
        defaultModel,
      });
    }
  }

  /**
   * Toggle automatic agent selection mode
   */
  setAutoMode(enabled: boolean): void {
    this.isAutoModeActive = enabled;
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
    console.log('[AgentSelector] DEBUG - analyzeAndSelectAgentsStream (STREAMING) called - REDIRECTING TO NON-STREAMING');
    
    // Redirect to the non-streaming version to avoid JSON parsing issues
    try {
      yield { type: 'progress', message: '⚡ **Evaluating specialist expertise...**' };
      yield { type: 'progress', message: '✅ **Finalizing specialist selection...**' };
      
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
    console.log('[AgentSelector] DEBUG - analyzeAndSelectAgents (NON-STREAMING) called');
    const startTime = Date.now();

    if (!this.isAutoModeActive || !this.contentGenerator) {
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

        const finalSelection = this.validateAndEnhanceSelection(selectedAgents, userPrompt);

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

    const attemptedSummary = attemptedModels.length ? attemptedModels.join(', ') : 'none';
    const lastError = selectionErrors[selectionErrors.length - 1]?.error;
    const errorDetails =
      lastError instanceof Error ? lastError.message : lastError ? String(lastError) : 'unknown error';

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

    if (provider === 'openai') {
      candidates.push('gpt-5-nano');
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
        candidates.filter((model) => typeof model === 'string' && model.trim().length > 0),
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
    if (!this.contentGenerator) {
      throw new Error('Agent selector service is not initialized');
    }

    const selectionPrompt = this.buildSelectionPrompt(userPrompt);
    const generationConfig: {
      temperature?: number;
      maxOutputTokens?: number;
      responseJsonSchema: typeof AGENT_SELECTION_SCHEMA.schema;
      responseMimeType: 'application/json';
    } = {
      responseJsonSchema: AGENT_SELECTION_SCHEMA.schema,
      responseMimeType: 'application/json',
    };

    if (this.config?.getProvider() !== 'openai') {
      generationConfig.temperature = 0.1;
      generationConfig.maxOutputTokens = 32000;
    }

    const contents = [
      {
        role: 'user',
        parts: [{ text: `${selectionPrompt}\n\nUser prompt: ${userPrompt}` }],
      },
    ];

    const response = await this.contentGenerator.generateContent(
      {
        model,
        contents,
        config: generationConfig as any,
      },
      'agent-selection',
    );

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    console.log(
      `[Agent Selector] Raw response for model ${model}:`,
      text.substring(0, 200),
    );

    if (!text.trim()) {
      throw new Error('Empty response from selection model');
    }

    const parsed = this.parseSelectionResponse(text);

    if (!parsed.agentIds || parsed.agentIds.length === 0) {
      throw new Error(`Model ${model} returned no agent IDs`);
    }

    return parsed;
  }

  async executeWithSelectedAgents(
    userPrompt: string,
    agents: AgentPersona[],
  ): Promise<MultiAgentExecutionResult | null> {
    if (!this.multiAgentExecutor || agents.length === 0) {
      return null;
    }

    const execution = await this.multiAgentExecutor.execute(userPrompt, agents);
    this.lastExecutionSummary = execution;

    const latestEntry = this.selectionHistory[this.selectionHistory.length - 1];
    if (latestEntry) {
      latestEntry.aggregateReasoning = execution.aggregateReasoning;
      latestEntry.toolSummary = execution.agentResults.reduce<Record<string, number>>((acc, result) => {
        acc[result.agent.id] = result.toolEvents?.length ?? 0;
        return acc;
      }, {});
    }

    return execution;
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
    const previouslyActive = this.agentManager.getActiveAgents().map(a => a.id);
    
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

  /**
   * Build the specialized prompt for GPT-5-nano agent selection
   */
  private buildSelectionPrompt(userPrompt: string): string {
    const agentSummaries = AGENT_PERSONAS.map(agent => 
      `${agent.id}: ${agent.category} - ${agent.description} (${agent.specialties.slice(0, 3).join(', ')})`
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
- Select 1-3 agent IDs from the available agents list above
- Provide clear reasoning for your selection explaining why these agents are best suited
- Include a confidence score (0.0 to 1.0) for your selection
- Optionally categorize the task type

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
   * Parse the GPT-5-nano response for agent selection
   */
  private parseSelectionResponse(response: string): {
    agentIds: string[];
    reasoning: string;
    confidence: number;
    taskCategory?: string;
  } {
    // Clean the response - trim whitespace and remove potential markdown formatting
    let cleanedResponse = response.trim();
    
    // Try to extract JSON if wrapped in markdown code blocks
    const codeBlockMatch = cleanedResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      cleanedResponse = codeBlockMatch[1];
    }
    
    // Try to find JSON object in the response
    const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanedResponse = jsonMatch[0];
    }
    
    try {
      // Try to parse JSON response
      const parsed = JSON.parse(cleanedResponse);
      
      // Validate and extract fields with defaults
      const agentIds = Array.isArray(parsed.agentIds) ? parsed.agentIds.filter((id: any) => typeof id === 'string') : [];
      
      if (agentIds.length === 0) {
        throw new Error('No valid agent IDs found in JSON response');
      }
      
      return {
        agentIds: agentIds,
        reasoning: parsed.reasoning || 'Agent selection completed',
        confidence: typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0.75,
        taskCategory: parsed.taskCategory,
      };
    } catch (error) {
      // Enhanced fallback parsing for non-JSON responses
      console.warn('Failed to parse JSON response, attempting enhanced text parsing');
      console.debug('Parse error:', error);
      console.debug('Raw response (first 300 chars):', response.substring(0, 300));
      
      // Look for agent IDs mentioned in the text
      const agentIds: string[] = [];
      const responseLower = response.toLowerCase();
      
      // First, try to find exact agent IDs
      for (const agent of AGENT_PERSONAS) {
        // Check for exact ID match or agent name mention
        if (responseLower.includes(agent.id.toLowerCase()) || 
            responseLower.includes(agent.name.toLowerCase().replace(' specialist', '').replace(' engineer', ''))) {
          agentIds.push(agent.id);
        }
      }
      
      // If still no agents, look for specialty keywords
      if (agentIds.length === 0) {
        const words = responseLower.split(/\s+/);
        for (const agent of AGENT_PERSONAS) {
          const specialtyKeywords = agent.specialties.join(' ').toLowerCase().split(/\s+/);
          if (words.some(word => specialtyKeywords.includes(word) && word.length > 4)) {
            agentIds.push(agent.id);
            if (agentIds.length >= 2) break;
          }
        }
      }

      return {
        agentIds: agentIds.length > 0 ? agentIds.slice(0, 3) : ['systems-architect'], // Default to systems-architect if nothing found
        reasoning: 'Parsed from text response due to JSON formatting issue',
        confidence: 0.3,
        taskCategory: undefined,
      };
    }
  }

  /**
   * Validate selection and apply intelligent fallbacks
   */
  private validateAndEnhanceSelection(selectedAgents: AgentPersona[], userPrompt: string): AgentPersona[] {
    // If no agents selected, use fallback heuristics
    if (selectedAgents.length === 0) {
      return this.fallbackSelection(userPrompt);
    }

    // Limit to maximum 3 agents to avoid overwhelming the system
    if (selectedAgents.length > 3) {
      return selectedAgents.slice(0, 3);
    }

    return selectedAgents;
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
      { keywords: ['react', 'frontend', 'ui', 'component'], agent: 'react-specialist' },
      { keywords: ['database', 'sql', 'query', 'db'], agent: 'database-optimizer' },
      { keywords: ['api', 'rest', 'graphql', 'endpoint'], agent: 'api-designer' },
      { keywords: ['security', 'vulnerability', 'auth'], agent: 'security-auditor' },
      { keywords: ['performance', 'slow', 'optimize'], agent: 'performance-engineer' },
      { keywords: ['kubernetes', 'k8s', 'container'], agent: 'kubernetes-operator' },
      { keywords: ['python'], agent: 'python-specialist' },
      { keywords: ['node', 'nodejs', 'javascript'], agent: 'node-js-specialist' },
      { keywords: ['documentation', 'doc', 'docs'], agent: 'technical-writer' },
      { keywords: ['design', 'architecture', 'architect'], agent: 'systems-architect' },
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
        this.selectionHistory.length === 0 ? 0 : totalToolCalls / this.selectionHistory.length,
      toolUsageByAgent: Object.entries(toolCounts)
        .map(([agentId, toolCalls]) => ({ agentId, toolCalls }))
        .sort((a, b) => b.toolCalls - a.toolCalls),
      lastExecutionSummary: this.lastExecutionSummary,
    };
  }
}
