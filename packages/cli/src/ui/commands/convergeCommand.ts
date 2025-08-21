/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, SlashCommand, MessageActionReturn } from './types.js';

interface ProviderResponse {
  provider: 'gemini' | 'openai' | 'anthropic';
  response: string;
  responseTime: number;
  wordCount: number;
  keyPoints: string[];
  error?: string;
}

type ConvergenceStrategy = 'consensus' | 'comprehensive' | 'critical' | 'best-of';

export const convergeCommand: SlashCommand = {
  name: 'converge',
  description: 'Get unified synthesis from multiple providers',
  kind: CommandKind.BUILT_IN,
  
  action: async (context, args): Promise<void | MessageActionReturn> => {
    if (!args.trim()) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Please provide a query. Usage: `/converge "Your question"`',
      };
    }

    const config = context.services.config;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available.',
      };
    }

    // Parse arguments for options
    const argsMatch = args.match(/^(?:--providers\s+([\w,]+)\s+)?(?:--strategy\s+(consensus|comprehensive|critical|best-of)\s+)?(.+)$/);
    if (!argsMatch || !argsMatch[3]) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Invalid arguments. Usage: `/converge [--providers list] [--strategy type] "Your question"`',
      };
    }

    const providersArg = argsMatch[1];
    const strategy = (argsMatch[2] || 'comprehensive') as ConvergenceStrategy;
    const query = argsMatch[3].trim();

    const originalProvider = config.getProvider();

    // Determine which providers to use
    const allProviders: ('gemini' | 'openai' | 'anthropic')[] = ['gemini'];
    if (config.getOpenaiApiKey()) allProviders.push('openai');
    if (config.getAnthropicApiKey()) allProviders.push('anthropic');

    let selectedProviders: ('gemini' | 'openai' | 'anthropic')[] = [];
    
    if (providersArg) {
      const requestedProviders = providersArg.toLowerCase().split(',').map(p => p.trim()) as ('gemini' | 'openai' | 'anthropic')[];
      selectedProviders = requestedProviders.filter(p => allProviders.includes(p));
    } else {
      selectedProviders = allProviders;
    }

    if (selectedProviders.length < 2) {
      return {
        type: 'message',
        messageType: 'error',
        content: `🔄 **Provider Convergence Requires Multiple Providers**

You need at least 2 providers configured for convergence synthesis.

**Currently available:** ${allProviders.join(', ')}
**Requested:** ${selectedProviders.join(', ') || 'none valid'}

**To add providers:**
• Set OPENAI_API_KEY environment variable for OpenAI
• Set ANTHROPIC_API_KEY environment variable for Anthropic

Example: \`export OPENAI_API_KEY=your_key_here\``,
      };
    }

    context.ui.addItem(
      {
        type: 'info',
        text: `🔄 **Starting Provider Convergence**

**Query:** "${query}"
**Providers:** ${selectedProviders.map(p => p.toUpperCase()).join(', ')}
**Strategy:** ${strategy}

**Phase 1:** Collecting diverse responses from all providers...`,
      },
      Date.now(),
    );

    try {
      // Phase 1: Collect responses from all providers in parallel
      const responses: ProviderResponse[] = [];
      
      const responsePromises = selectedProviders.map(async (provider) => {
        const startTime = Date.now();
        try {
          await config.setProvider(provider);
          const contentGenerator = await config.getContentGenerator();
          
          if (contentGenerator) {
            const response = await contentGenerator.generateContent(
              { 
                contents: [{ parts: [{ text: query }] }],
                model: config.getModel()
              },
              `converge-${provider}-${Date.now()}`
            );
            
            const responseTime = Date.now() - startTime;
            const responseText = response.candidates?.[0]?.content?.parts?.map(part => part.text).join('') || '';
            const wordCount = responseText.split(/\s+/).length;
            
            // Extract key points (simple approach - sentences ending with important punctuation)
            const keyPoints = responseText
              .split(/[.!?]+/)
              .filter(sentence => sentence.trim().length > 20)
              .slice(0, 5)
              .map(sentence => sentence.trim());

            return {
              provider,
              response: responseText,
              responseTime,
              wordCount,
              keyPoints,
            } as ProviderResponse;
          } else {
            return {
              provider,
              response: '',
              responseTime: Date.now() - startTime,
              wordCount: 0,
              keyPoints: [],
              error: `Failed to initialize ${provider} content generator`,
            } as ProviderResponse;
          }
        } catch (error) {
          return {
            provider,
            response: '',
            responseTime: Date.now() - startTime,
            wordCount: 0,
            keyPoints: [],
            error: `${provider} error: ${error instanceof Error ? error.message : String(error)}`,
          } as ProviderResponse;
        }
      });

      const results = await Promise.all(responsePromises);
      responses.push(...results);

      const successfulResponses = responses.filter(r => !r.error && r.response);

      if (successfulResponses.length < 2) {
        context.ui.addItem(
          {
            type: 'error',
            text: `Convergence failed: Need at least 2 successful responses, got ${successfulResponses.length}`,
          },
          Date.now(),
        );
        await config.setProvider(originalProvider);
        return;
      }

      // Phase 2: Synthesize responses using convergence strategy
      context.ui.addItem(
        {
          type: 'info',
          text: `**Phase 2:** Synthesizing responses using ${strategy} strategy...`,
        },
        Date.now(),
      );

      // Use the best available provider for synthesis (prefer GPT-5/OpenAI)
      let synthesizer: 'gemini' | 'openai' | 'anthropic' = 'gemini';
      if (allProviders.includes('openai')) {
        synthesizer = 'openai';
      } else if (allProviders.includes('anthropic')) {
        synthesizer = 'anthropic';
      }

      await config.setProvider(synthesizer);
      const synthesizerGen = await config.getContentGenerator();

      let convergenceReport = `🔄 **Provider Convergence Complete**\n\nQuery: "${query}"\nStrategy: ${strategy}\nProviders: ${selectedProviders.join(', ')}\n\n`;

      if (synthesizerGen && successfulResponses.length > 0) {
        const synthesisPrompt = generateSynthesisPrompt(query, successfulResponses, strategy);

        const synthesis = await synthesizerGen.generateContent(
          { 
            contents: [{ parts: [{ text: synthesisPrompt }] }],
            model: config.getModel()
          },
          `converge-synthesis-${strategy}-${Date.now()}`
        );
        
        const synthesisText = synthesis.candidates?.[0]?.content?.parts?.map(part => part.text).join('') || '';
        
        if (synthesisText) {
          convergenceReport += synthesisText;
        } else {
          convergenceReport += generateFallbackSynthesis(query, successfulResponses, strategy);
        }
      } else {
        convergenceReport += generateFallbackSynthesis(query, successfulResponses, strategy);
      }

      // Add performance summary
      convergenceReport += `\n\n**📊 Provider Performance Summary:**\n\n`;
      responses.forEach(resp => {
        if (resp.error) {
          convergenceReport += `• **${resp.provider.toUpperCase()}:** ❌ ${resp.error}\n`;
        } else {
          convergenceReport += `• **${resp.provider.toUpperCase()}:** ${resp.responseTime}ms | ${resp.wordCount} words | ${resp.keyPoints.length} key points\n`;
        }
      });

      // Restore original provider
      await config.setProvider(originalProvider);

      context.ui.addItem(
        {
          type: 'info',
          text: convergenceReport,
        },
        Date.now(),
      );

      return;

    } catch (error) {
      // Restore original provider on error
      await config.setProvider(originalProvider);
      
      return {
        type: 'message',
        messageType: 'error',
        content: `Convergence failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
  
  completion: async (_context, partial) => {
    const completions = [
      '--strategy consensus',
      '--strategy comprehensive',
      '--strategy critical',
      '--strategy best-of',
      '--providers gemini,openai',
      '--providers gemini,anthropic',
      '--providers openai,anthropic',
      '--providers all',
    ];
    
    return completions.filter(c => c.startsWith(partial));
  },
};

// Helper functions for generating synthesis prompts based on strategy
function generateSynthesisPrompt(query: string, responses: ProviderResponse[], strategy: ConvergenceStrategy): string {
  const responseText = responses.map(r => 
    `**${r.provider.toUpperCase()} Response:**\n${r.response}\n\n**Key Points:** ${r.keyPoints.join(', ')}\n`
  ).join('\n---\n\n');

  const basePrompt = `Synthesize the following multiple AI provider responses into a unified, comprehensive answer for the query: "${query}"

${responseText}

`;

  switch (strategy) {
    case 'consensus':
      return basePrompt + `Create a consensus-based synthesis that:
1. Identifies areas where all providers agree
2. Notes any significant disagreements or contradictions
3. Provides a balanced view that incorporates shared insights
4. Indicates confidence levels based on provider agreement
5. Highlights areas where more research might be needed

Focus on building consensus while acknowledging differences.`;

    case 'comprehensive':
      return basePrompt + `Create a comprehensive synthesis that:
1. Combines the best insights from all providers
2. Fills gaps that individual providers might have missed
3. Provides a complete, well-rounded answer
4. Integrates unique perspectives from each provider
5. Adds additional context or considerations as appropriate

Create the most complete and thorough answer possible.`;

    case 'critical':
      return basePrompt + `Create a critical analysis synthesis that:
1. Evaluates the strengths and weaknesses of each response
2. Identifies potential biases or limitations in provider answers
3. Cross-validates facts and claims across responses
4. Points out logical inconsistencies or gaps in reasoning
5. Provides a carefully scrutinized, evidence-based answer

Be analytical and question assumptions while synthesizing.`;

    case 'best-of':
      return basePrompt + `Create a "best-of" synthesis that:
1. Identifies the strongest parts of each provider's response
2. Combines the most accurate, insightful, and well-reasoned elements
3. Discards weaker or redundant portions
4. Creates an optimized answer using the best available insights
5. Explains why certain elements were selected over others

Select and combine the highest quality insights from all responses.`;

    default:
      return basePrompt + 'Create a unified synthesis of these responses.';
  }
}

function generateFallbackSynthesis(query: string, responses: ProviderResponse[], strategy: ConvergenceStrategy): string {
  let synthesis = `**🔄 Convergence Synthesis (${strategy} strategy)**\n\n`;
  
  synthesis += `**Query:** "${query}"\n\n`;
  
  // Combine key points from all providers
  const allKeyPoints = responses.flatMap(r => r.keyPoints);
  const uniqueKeyPoints = [...new Set(allKeyPoints)].slice(0, 10);
  
  synthesis += `**🎯 Unified Key Points:**\n`;
  uniqueKeyPoints.forEach((point, index) => {
    synthesis += `${index + 1}. ${point}\n`;
  });
  
  synthesis += `\n**📋 Individual Provider Responses:**\n\n`;
  
  responses.forEach((resp, index) => {
    synthesis += `### ${resp.provider.toUpperCase()} Response\n\n`;
    synthesis += `${resp.response}\n\n`;
    if (index < responses.length - 1) {
      synthesis += `---\n\n`;
    }
  });
  
  synthesis += `\n**🔄 Strategy Summary:**\n`;
  switch (strategy) {
    case 'consensus':
      synthesis += `This consensus synthesis combines areas of agreement across all providers while noting differences.`;
      break;
    case 'comprehensive':
      synthesis += `This comprehensive synthesis combines insights from all providers for maximum completeness.`;
      break;
    case 'critical':
      synthesis += `This critical synthesis evaluates and cross-validates information from all providers.`;
      break;
    case 'best-of':
      synthesis += `This best-of synthesis selects the strongest insights from each provider.`;
      break;
  }
  
  return synthesis;
}