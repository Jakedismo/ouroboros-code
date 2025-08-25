/**
 * @license
 * Copyright 2025 Ouroboros
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, SlashCommand, CommandContext, MessageActionReturn, SubmitPromptActionReturn } from './types.js';
import { Config, LLMProvider } from '@ouroboros/code-cli-core';

/**
 * Task categories for routing
 */
enum TaskCategory {
  LARGE_ANALYSIS = 'large_analysis',
  DESIGN = 'design', 
  ADVANCED_CODING = 'advanced_coding',
  ARCHITECTURE = 'architecture',
  OTHER = 'other'
}

/**
 * Simple heuristic task classifier
 */
function classifyTask(question: string): { category: TaskCategory; confidence: number; rationale: string } {
  const text = question.toLowerCase();
  
  // Architecture keywords
  if (text.includes('architecture') || text.includes('system design') || text.includes('microservices') || text.includes('scalability')) {
    return {
      category: TaskCategory.ARCHITECTURE,
      confidence: 0.9,
      rationale: 'Contains architecture/system design keywords'
    };
  }
  
  // Large analysis keywords
  if (text.includes('analyze') || text.includes('review') || text.includes('audit') || text.includes('large') || text.includes('comprehensive')) {
    return {
      category: TaskCategory.LARGE_ANALYSIS,
      confidence: 0.8,
      rationale: 'Contains analysis/review keywords'
    };
  }
  
  // Design keywords
  if (text.includes('design') || text.includes('ui') || text.includes('ux') || text.includes('interface') || text.includes('mockup')) {
    return {
      category: TaskCategory.DESIGN,
      confidence: 0.8,
      rationale: 'Contains design/UI keywords'
    };
  }
  
  // Advanced coding keywords
  if (text.includes('algorithm') || text.includes('optimize') || text.includes('performance') || text.includes('complex') || text.includes('implement')) {
    return {
      category: TaskCategory.ADVANCED_CODING,
      confidence: 0.7,
      rationale: 'Contains advanced coding keywords'
    };
  }
  
  return {
    category: TaskCategory.OTHER,
    confidence: 0.6,
    rationale: 'No specific category signals detected'
  };
}

/**
 * Simple provider router based on task category
 */
function routeProvider(category: TaskCategory, includeLocal: boolean, config: Config): { provider: LLMProvider; model: string; rationale: string } {
  // Check what providers are available
  const hasOpenAI = !!config.getOpenaiApiKey();
  const hasAnthropic = !!config.getAnthropicApiKey() || !!config.getClaudeUseOauth();
  const hasGemini = !!(process.env['GEMINI_API_KEY'] || process.env['GOOGLE_API_KEY']);
  
  switch (category) {
    case TaskCategory.LARGE_ANALYSIS:
      if (hasGemini) {
        return {
          provider: LLMProvider.GEMINI,
          model: 'gemini-1.5-pro',
          rationale: 'Gemini excels at large-scale analysis with extensive context window'
        };
      }
      break;
      
    case TaskCategory.DESIGN:
      if (hasAnthropic) {
        return {
          provider: LLMProvider.ANTHROPIC,
          model: 'claude-3-5-sonnet-20241022',
          rationale: 'Claude provides excellent structured thinking for design problems'
        };
      }
      break;
      
    case TaskCategory.ADVANCED_CODING:
      if (hasOpenAI) {
        return {
          provider: LLMProvider.OPENAI,
          model: 'gpt-4o',
          rationale: 'OpenAI GPT-4 excels at complex coding and algorithm tasks'
        };
      }
      break;
      
    case TaskCategory.ARCHITECTURE:
      if (hasAnthropic) {
        return {
          provider: LLMProvider.ANTHROPIC,
          model: 'claude-3-5-sonnet-20241022',
          rationale: 'Claude provides systematic architectural thinking'
        };
      }
      break;
  }
  
  // Fallback to any available provider
  if (hasGemini) {
    return {
      provider: LLMProvider.GEMINI,
      model: 'gemini-1.5-pro',
      rationale: 'Fallback to available Gemini provider'
    };
  }
  
  if (hasAnthropic) {
    return {
      provider: LLMProvider.ANTHROPIC,
      model: 'claude-3-5-sonnet-20241022',
      rationale: 'Fallback to available Anthropic provider'
    };
  }
  
  if (hasOpenAI) {
    return {
      provider: LLMProvider.OPENAI,
      model: 'gpt-4o',
      rationale: 'Fallback to available OpenAI provider'
    };
  }
  
  // Default fallback
  return {
    provider: LLMProvider.GEMINI,
    model: 'gemini-1.5-pro',
    rationale: 'Default fallback (API key may be missing)'
  };
}

/**
 * Optimal routing slash command implementation
 * Routes tasks to the most suitable LLM and model using classification
 */
export const optimalRoutingCommand: SlashCommand = {
  name: 'optimal-routing',
  altNames: ['route', 'optimal'],
  kind: CommandKind.BUILT_IN,
  description: 'Route your task to the optimal LLM provider and model',
  action: async (context: CommandContext, args: string): Promise<SubmitPromptActionReturn | MessageActionReturn> => {
    const { services } = context;
    const config = services.config;
    
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available'
      };
    }
    
    // Parse arguments
    const { includeLocal, question } = parseOptimalRoutingArgs(args);
    
    if (!question) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'Usage: /optimal-routing [local] "your question"\n\nExamples:\n• /optimal-routing "Design a user authentication system"\n• /optimal-routing local "Optimize this sorting algorithm"\n• /optimal-routing "What is the best architecture for microservices?"'
      };
    }

    try {
      // Step 1: Classify the task
      const classification = classifyTask(question);
      console.log('[OptimalRouting] Classification result:', classification);

      // Step 2: Route to optimal provider
      const routing = routeProvider(classification.category, includeLocal, config);
      console.log('[OptimalRouting] Routing result:', routing);

      // Step 3: Switch to optimal provider temporarily
      const originalProvider = config.getProvider();
      const originalModel = config.getModel();

      try {
        // Switch to optimal provider
        config.setProvider(routing.provider);
        config.setModel(routing.model);

        // Format routing information
        const routingInfo = formatRoutingDecision(classification, routing);
        
        // Submit the optimally routed prompt
        const promptWithRouting = `${routingInfo}\n\n**Original Question:** ${question}`;
        
        return {
          type: 'submit_prompt',
          content: promptWithRouting
        };

      } finally {
        // Restore original provider settings after a short delay
        setTimeout(() => {
          try {
            config.setProvider(originalProvider);
            config.setModel(originalModel);
          } catch (error) {
            console.warn('[OptimalRouting] Failed to restore original settings:', error);
          }
        }, 1000);
      }

    } catch (error) {
      console.error('[OptimalRouting] Command failed:', error);
      return {
        type: 'message',
        messageType: 'error',
        content: `Optimal routing failed: ${(error as Error).message}\n\n💡 Try specifying a provider manually with /switch or check your API keys`
      };
    }
  },
};

/**
 * Parse command arguments
 */
function parseOptimalRoutingArgs(args: string): { includeLocal: boolean; question: string } {
  const trimmed = args.trim();
  
  // Check if starts with 'local'
  const localMatch = trimmed.match(/^local\s+(.+)$/i);
  if (localMatch) {
    return {
      includeLocal: true,
      question: extractQuotedText(localMatch[1])
    };
  }

  return {
    includeLocal: false,
    question: extractQuotedText(trimmed)
  };
}

/**
 * Extract quoted text from input
 */
function extractQuotedText(input: string): string {
  const quoted = input.match(/^["'](.+?)["']$/);
  return quoted ? quoted[1] : input;
}

/**
 * Format routing decision for display
 */
function formatRoutingDecision(classification: any, routing: any): string {
  const confidenceEmoji = classification.confidence > 0.8 ? '🎯' : 
                         classification.confidence > 0.6 ? '✅' : '⚠️';

  return `🎯 **Optimal Routing Decision**

**Task Category:** ${classification.category} ${confidenceEmoji} (${Math.round(classification.confidence * 100)}% confidence)
**Classification Rationale:** ${classification.rationale}

**Selected Provider:** ☁️ ${routing.provider}/${routing.model}
**Routing Rationale:** ${routing.rationale}

---`;
}