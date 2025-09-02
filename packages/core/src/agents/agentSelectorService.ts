/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { OpenAIProvider } from '../providers/openai/index.js';
import { AnthropicProvider } from '../providers/anthropic/index.js';
import { GeminiProvider } from '../providers/gemini/index.js';
import type { Provider } from '../providers/types.js';
import { AgentManager } from './agentManager.js';
import { AGENT_PERSONAS, getAgentById, type AgentPersona } from './personas.js';

/**
 * Service for automatically selecting the most appropriate agents for user prompts
 * using GPT-5-nano as an intelligent dispatcher
 */
export class AgentSelectorService {
  private static instance: AgentSelectorService | null = null;
  private selectorProvider: Provider | null = null;
  private agentManager: AgentManager | null = null;
  private isAutoModeActive = false;
  private selectionHistory: Array<{
    prompt: string;
    selectedAgents: string[];
    reasoning: string;
    timestamp: number;
  }> = [];
  private readonly fallbackAgents = ['systems-architect', 'code-quality-analyst'];

  private constructor() {}

  static getInstance(): AgentSelectorService {
    if (!AgentSelectorService.instance) {
      AgentSelectorService.instance = new AgentSelectorService();
    }
    return AgentSelectorService.instance;
  }

  /**
   * Initialize the agent selector service with provider configuration
   * @param provider - The provider type ('openai', 'anthropic', 'gemini')
   * @param apiKey - The API key for the provider
   * @param model - Optional model override for agent selection
   */
  async initialize(provider: string = 'openai', apiKey?: string, model?: string): Promise<void> {
    // For backward compatibility, if provider is actually an API key string, treat it as OpenAI
    if (provider && !['openai', 'anthropic', 'gemini'].includes(provider) && !apiKey) {
      // Legacy call with just API key
      apiKey = provider;
      provider = 'openai';
    }

    if (!apiKey) {
      throw new Error(`${provider} API key is required for agent selection service`);
    }

    // Create the appropriate provider instance
    switch (provider) {
      case 'openai':
        this.selectorProvider = new OpenAIProvider({
          apiKey,
          model: model || 'gpt-5-nano', // Fast, lightweight model for agent selection
        });
        break;
      case 'anthropic':
        this.selectorProvider = new AnthropicProvider({
          apiKey,
          model: model || 'claude-3-5-haiku-20241022', // Haiku for fast agent selection
        });
        break;
      case 'gemini':
        this.selectorProvider = new GeminiProvider({
          apiKey,
          model: model || 'gemini-2.0-flash-thinking-exp-1219', // Flash thinking for reasoning
        });
        break;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    this.agentManager = AgentManager.getInstance();
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
    console.log('[AgentSelector] DEBUG - analyzeAndSelectAgentsStream (STREAMING) called - THIS SHOULD NOT BE CALLED!');
    const startTime = Date.now();

    if (!this.isAutoModeActive || !this.selectorProvider) {
      yield {
        type: 'complete',
        selectedAgents: [],
        reasoning: 'Auto mode disabled or service not initialized',
        confidence: 0,
        processingTime: Date.now() - startTime,
      };
      return;
    }

    try {
      yield { type: 'progress', message: '🤖 **Analyzing request for specialist selection...**' };
      
      // Create the agent selection prompt
      const selectionPrompt = this.buildSelectionPrompt(userPrompt);
      
      yield { type: 'progress', message: '🧠 **AI reasoning about optimal specialist combination...**' };
      
      // Stream the GPT-5-nano agent selection process
      // Show progress before making the selection
      yield { type: 'progress', message: '⚡ **Evaluating specialist expertise...**' };
      
      // For OpenAI provider, we need to add response_format to ensure JSON output
      const providerOptions: any = {
        model: 'gpt-5-nano',
        temperature: 0.1, // Low temperature for consistent selection
        maxTokens: 300,
      };
      
      // Add response_format for OpenAI to ensure JSON output
      // This forces the model to output valid JSON
      if (this.selectorProvider.name === 'OpenAI') {
        providerOptions.response_format = { type: 'json_object' };
      }
      
      // Use generateCompletion for complete JSON response (non-streaming)
      const completeResponse = await this.selectorProvider.generateCompletion([
        { role: 'system', content: selectionPrompt },
        { role: 'user', content: userPrompt },
      ], providerOptions);

      yield { type: 'progress', message: '✅ **Finalizing specialist selection...**' };

      // Parse the complete response
      const selection = this.parseSelectionResponse(completeResponse);
      const selectedAgents = selection.agentIds
        .map(id => getAgentById(id))
        .filter(Boolean) as AgentPersona[];

      // Validate selection and apply fallbacks
      const finalSelection = this.validateAndEnhanceSelection(selectedAgents, userPrompt);

      // Record selection history
      this.recordSelection(userPrompt, finalSelection.map(a => a.id), selection.reasoning);

      yield {
        type: 'complete',
        selectedAgents: finalSelection,
        reasoning: selection.reasoning,
        confidence: selection.confidence,
        processingTime: Date.now() - startTime,
      };

    } catch (error) {
      console.error('Agent selection failed:', error);
      
      yield { type: 'progress', message: '⚠️ **Using fallback specialist selection...**' };
      
      // Fallback to heuristic-based selection
      const fallbackAgents = this.fallbackSelection(userPrompt);
      
      yield {
        type: 'complete',
        selectedAgents: fallbackAgents,
        reasoning: `AI selection failed, using fallback heuristics: ${error instanceof Error ? error.message : 'Unknown error'}`,
        confidence: 0.3,
        processingTime: Date.now() - startTime,
      };
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

    if (!this.isAutoModeActive || !this.selectorProvider) {
      return {
        selectedAgents: [],
        reasoning: 'Auto mode disabled or service not initialized',
        confidence: 0,
        processingTime: Date.now() - startTime,
      };
    }

    try {
      // Create the agent selection prompt
      const selectionPrompt = this.buildSelectionPrompt(userPrompt);
      
      // Query GPT-5-nano for agent selection
      const providerOptions: any = {
        model: 'gpt-5-nano',
        temperature: 0.1, // Low temperature for consistent selection
        maxTokens: 300,
      };
      
      // Add response_format for OpenAI to ensure JSON output
      if (this.selectorProvider.name === 'OpenAI') {
        providerOptions.response_format = { type: 'json_object' };
        console.log('[Agent Selector] Using JSON mode for OpenAI provider');
      }
      
      console.log('[Agent Selector] Provider:', this.selectorProvider.name, 'Options:', providerOptions);
      
      const response = await this.selectorProvider.generateCompletion([
        { role: 'system', content: selectionPrompt },
        { role: 'user', content: userPrompt },
      ], providerOptions);

      console.log('[Agent Selector] Raw response:', response.substring(0, 200));

      // Parse the response
      const selection = this.parseSelectionResponse(response);
      const selectedAgents = selection.agentIds
        .map(id => getAgentById(id))
        .filter(Boolean) as AgentPersona[];

      // Validate selection and apply fallbacks
      const finalSelection = this.validateAndEnhanceSelection(selectedAgents, userPrompt);

      // Record selection history
      this.recordSelection(userPrompt, finalSelection.map(a => a.id), selection.reasoning);

      return {
        selectedAgents: finalSelection,
        reasoning: selection.reasoning,
        confidence: selection.confidence,
        processingTime: Date.now() - startTime,
      };

    } catch (error) {
      console.error('Agent selection failed:', error);
      
      // Fallback to heuristic-based selection
      const fallbackAgents = this.fallbackSelection(userPrompt);
      
      return {
        selectedAgents: fallbackAgents,
        reasoning: `AI selection failed, using fallback heuristics: ${error instanceof Error ? error.message : 'Unknown error'}`,
        confidence: 0.3,
        processingTime: Date.now() - startTime,
      };
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

OUTPUT FORMAT:
You must respond with a valid JSON object containing these fields:
{
  "agentIds": ["agent-id-1", "agent-id-2"],
  "reasoning": "Clear explanation of why these agents were selected",
  "confidence": 0.8,
  "taskCategory": "category-name"
}

CRITICAL: You MUST output valid JSON. The response will be parsed as JSON, so ensure:
- agentIds is an array of strings (agent IDs from the list above)
- reasoning is a string explaining your selection
- confidence is a number between 0 and 1
- taskCategory is an optional string
- Do not include any text outside the JSON object

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
    const fallbackAgents: AgentPersona[] = [];

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
      { keywords: ['machine learning', 'ml', 'ai'], agent: 'ml-engineer' },
    ];

    // Find matching agents
    for (const match of keywordMatches) {
      if (match.keywords.some(keyword => promptLower.includes(keyword))) {
        const agent = getAgentById(match.agent);
        if (agent && fallbackAgents.length < 2) {
          fallbackAgents.push(agent);
        }
      }
    }

    // If still no matches, use default fallback agents
    if (fallbackAgents.length === 0) {
      for (const fallbackId of this.fallbackAgents) {
        const agent = getAgentById(fallbackId);
        if (agent) {
          fallbackAgents.push(agent);
          break; // Only one fallback agent
        }
      }
    }

    return fallbackAgents;
  }

  /**
   * Record selection for history and analysis
   */
  private recordSelection(prompt: string, selectedAgentIds: string[], reasoning: string): void {
    this.selectionHistory.push({
      prompt: prompt.length > 100 ? prompt.substring(0, 100) + '...' : prompt,
      selectedAgents: selectedAgentIds,
      reasoning,
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
  } {
    if (this.selectionHistory.length === 0) {
      return {
        totalSelections: 0,
        averageAgentsPerSelection: 0,
        mostSelectedAgents: [],
        averageConfidence: 0,
      };
    }

    const agentCounts: Record<string, number> = {};
    let totalAgents = 0;

    for (const selection of this.selectionHistory) {
      totalAgents += selection.selectedAgents.length;
      for (const agentId of selection.selectedAgents) {
        agentCounts[agentId] = (agentCounts[agentId] || 0) + 1;
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
      averageConfidence: 0.7, // Would need to track confidence in history
    };
  }
}