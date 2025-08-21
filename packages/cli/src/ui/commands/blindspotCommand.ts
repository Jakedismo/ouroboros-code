/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, SlashCommand, MessageActionReturn } from './types.js';

interface ProviderResponse {
  provider: 'gemini' | 'openai' | 'anthropic';
  response: string;
  error?: string;
}

interface BlindspotAnalysis {
  analyzer: 'gemini' | 'openai' | 'anthropic';
  targetProvider: 'gemini' | 'openai' | 'anthropic';
  missedElements: string[];
  analysis: string;
}

export const blindspotCommand: SlashCommand = {
  name: 'blindspot',
  description: 'Detect blindspots across provider responses',
  kind: CommandKind.BUILT_IN,
  
  action: async (context, args): Promise<void | MessageActionReturn> => {
    if (!args.trim()) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Please provide a query. Usage: `/blindspot "Your question"`',
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

    const query = args.trim();
    const originalProvider = config.getProvider();

    // Check which providers have API keys
    const activeProviders: ('gemini' | 'openai' | 'anthropic')[] = [];
    
    // Always include gemini (default)
    activeProviders.push('gemini');
    
    if (config.getOpenaiApiKey()) {
      activeProviders.push('openai');
    }
    
    if (config.getAnthropicApiKey()) {
      activeProviders.push('anthropic');
    }

    if (activeProviders.length < 2) {
      return {
        type: 'message',
        messageType: 'error',
        content: `🔍 **Blindspot Detection Requires Multiple Providers**

You need at least 2 providers configured to detect blindspots.

**Currently available:** ${activeProviders.join(', ')}

**To add providers:**
• Set OPENAI_API_KEY environment variable for OpenAI
• Set ANTHROPIC_API_KEY environment variable for Anthropic

Example: \`export OPENAI_API_KEY=your_key_here\``,
      };
    }

    context.ui.addItem(
      {
        type: 'info',
        text: `🔍 **Starting Blindspot Analysis**

**Query:** "${query}"
**Analyzing with:** ${activeProviders.join(', ')}

**Phase 1:** Collecting initial responses from all providers...`,
      },
      Date.now(),
    );

    try {
      // Phase 1: Get responses from all providers
      const responses: ProviderResponse[] = [];
      
      for (const provider of activeProviders) {
        try {
          await config.setProvider(provider);
          const contentGenerator = await config.getContentGenerator();
          
          if (contentGenerator) {
            const response = await contentGenerator.generateContent(
              { 
                contents: [{ parts: [{ text: query }] }],
                model: config.getModel()
              },
              `blindspot-${provider}-${Date.now()}`
            );
            const responseText = response.candidates?.[0]?.content?.parts?.map(part => part.text).join('') || '';
            responses.push({
              provider,
              response: responseText,
            });
          } else {
            responses.push({
              provider,
              response: '',
              error: `Failed to initialize ${provider} content generator`,
            });
          }
        } catch (error) {
          responses.push({
            provider,
            response: '',
            error: `${provider} error: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }

      context.ui.addItem(
        {
          type: 'info', 
          text: `**Phase 2:** Analyzing blindspots - each provider examines what others missed...`,
        },
        Date.now(),
      );

      // Phase 2: Each provider analyzes what others missed
      const blindspotAnalyses: BlindspotAnalysis[] = [];
      
      for (const analyzer of activeProviders) {
        const successfulResponses = responses.filter(r => !r.error && r.response);
        const otherResponses = successfulResponses.filter(r => r.provider !== analyzer);
        
        if (otherResponses.length === 0) continue;

        try {
          await config.setProvider(analyzer);
          const contentGenerator = await config.getContentGenerator();
          
          if (contentGenerator) {
            const analysisPrompt = `Analyze the following responses to the query "${query}" and identify what important elements, perspectives, or insights each response might have missed or overlooked.

${otherResponses.map(r => `**${r.provider.toUpperCase()} Response:**
${r.response}

`).join('')}

For each response, identify:
1. Key concepts or aspects that were not addressed
2. Missing perspectives or viewpoints  
3. Incomplete explanations or gaps in reasoning
4. Important details or nuances overlooked
5. Potential biases or limitations in the approach

Format your analysis clearly for each provider, focusing on what they MISSED rather than what they got right.`;

            const analysis = await contentGenerator.generateContent(
              { 
                contents: [{ parts: [{ text: analysisPrompt }] }],
                model: config.getModel()
              },
              `blindspot-analysis-${analyzer}-${Date.now()}`
            );
            const analysisText = analysis.candidates?.[0]?.content?.parts?.map(part => part.text).join('') || '';
            
            for (const targetResponse of otherResponses) {
              blindspotAnalyses.push({
                analyzer,
                targetProvider: targetResponse.provider,
                missedElements: [], // Could parse this from analysis if needed
                analysis: analysisText,
              });
            }
          }
        } catch (error) {
          // Skip failed analyses
          console.error(`Blindspot analysis failed for ${analyzer}:`, error);
        }
      }

      // Phase 3: Synthesize with OpenAI if available, or use best available provider
      let synthesizer: 'gemini' | 'openai' | 'anthropic' = 'gemini';
      if (activeProviders.includes('openai')) {
        synthesizer = 'openai';
      } else if (activeProviders.includes('anthropic')) {
        synthesizer = 'anthropic';
      }

      context.ui.addItem(
        {
          type: 'info',
          text: `**Phase 3:** Synthesizing comprehensive blindspot report with ${synthesizer.toUpperCase()}...`,
        },
        Date.now(),
      );

      await config.setProvider(synthesizer);
      const contentGenerator = await config.getContentGenerator();

      let finalReport = `🔍 **Blindspot Analysis Complete**\n\nQuery: "${query}"\n\n`;

      if (contentGenerator && blindspotAnalyses.length > 0) {
        const synthesisPrompt = `Create a comprehensive blindspot analysis report based on the following cross-provider analyses.

Original Query: "${query}"

Provider Responses:
${responses.map(r => r.error ? `**${r.provider.toUpperCase()}:** Error - ${r.error}` : `**${r.provider.toUpperCase()}:**\n${r.response}`).join('\n\n')}

Cross-Provider Blindspot Analyses:
${blindspotAnalyses.map(a => `**${a.analyzer.toUpperCase()} analyzing ${a.targetProvider.toUpperCase()}:**\n${a.analysis}`).join('\n\n')}

Please synthesize this into a clear, comprehensive report that:
1. Identifies the most significant blindspots across all providers
2. Highlights patterns in what different providers tend to miss
3. Provides actionable insights about each provider's strengths and weaknesses
4. Suggests what a complete answer should include

Format the report professionally with clear sections and bullet points.`;

        const synthesis = await contentGenerator.generateContent(
          { 
            contents: [{ parts: [{ text: synthesisPrompt }] }],
            model: config.getModel()
          },
          `blindspot-synthesis-${Date.now()}`
        );
        const synthesisText = synthesis.candidates?.[0]?.content?.parts?.map(part => part.text).join('') || '';
        finalReport += synthesisText;
      } else {
        // Fallback manual report
        finalReport += `**Individual Responses:**\n\n`;
        for (const response of responses) {
          if (response.error) {
            finalReport += `**${response.provider.toUpperCase()}:** ❌ ${response.error}\n\n`;
          } else {
            finalReport += `**${response.provider.toUpperCase()}:**\n${response.response}\n\n`;
          }
        }

        if (blindspotAnalyses.length > 0) {
          finalReport += `**Blindspot Analyses:**\n\n`;
          for (const analysis of blindspotAnalyses) {
            finalReport += `**${analysis.analyzer.toUpperCase()} → ${analysis.targetProvider.toUpperCase()}:**\n${analysis.analysis}\n\n`;
          }
        }
      }

      // Restore original provider
      await config.setProvider(originalProvider);

      context.ui.addItem(
        {
          type: 'info',
          text: finalReport,
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
        content: `Blindspot analysis failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },

  completion: async (_context, partial) => {
    const completions = [
      '--providers all',
      '--providers gemini,openai', 
      '--providers gemini,anthropic',
      '--providers openai,anthropic',
      '--format detailed',
      '--format summary',
    ];
    
    return completions.filter(c => c.startsWith(partial));
  },
};