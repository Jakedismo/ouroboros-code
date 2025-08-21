/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, SlashCommand, MessageActionReturn } from './types.js';

interface ProviderVision {
  provider: 'gemini' | 'openai' | 'anthropic';
  round: number;
  vision: string;
  error?: string;
}

export const challengeCommand: SlashCommand = {
  name: 'challenge',
  description: 'Challenge responses with adversarial questions',
  kind: CommandKind.BUILT_IN,
  
  action: async (context, args): Promise<void | MessageActionReturn> => {
    if (!args.trim()) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Please provide a query. Usage: `/challenge "Your question"`',
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

    // Parse arguments
    const argsMatch = args.match(/^(?:--target\s+(\S+)\s+)?(?:--rounds\s+(\d+)\s+)?(.+)$/);
    if (!argsMatch || !argsMatch[3]) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Invalid arguments. Usage: `/challenge [--target provider] [--rounds n] "Your question"`',
      };
    }

    const targetProviderArg = argsMatch[1]?.toLowerCase() as 'gemini' | 'openai' | 'anthropic' | undefined;
    const roundsArg = argsMatch[2] ? parseInt(argsMatch[2], 10) : 3;
    const query = argsMatch[3].trim();

    // Validate rounds (1-5 max for practical limits)
    const rounds = Math.min(Math.max(1, roundsArg), 5);

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
        content: `⚔️ **Challenge Mode Requires Multiple Providers**

You need at least 2 providers configured for adversarial challenges.

**Currently available:** ${activeProviders.join(', ')}

**To add providers:**
• Set OPENAI_API_KEY environment variable for OpenAI
• Set ANTHROPIC_API_KEY environment variable for Anthropic

Example: \`export OPENAI_API_KEY=your_key_here\``,
      };
    }

    // Determine target provider (default to current or first available)
    let targetProvider = targetProviderArg || originalProvider;
    if (!activeProviders.includes(targetProvider)) {
      targetProvider = activeProviders[0];
    }

    const challengers = activeProviders.filter(p => p !== targetProvider);

    context.ui.addItem(
      {
        type: 'info',
        text: `⚔️ **Starting Adversarial Challenge**

**Query:** "${query}"
**Target Provider:** ${targetProvider.toUpperCase()}
**Challengers:** ${challengers.map(c => c.toUpperCase()).join(', ')}
**Rounds:** ${rounds}

**Phase 1:** Getting initial vision from ${targetProvider.toUpperCase()}...`,
      },
      Date.now(),
    );

    try {
      // Phase 1: Get initial response from target provider
      await config.setProvider(targetProvider);
      const contentGenerator = await config.getContentGenerator();
      
      let originalVision = '';
      if (contentGenerator) {
        const response = await contentGenerator.generateContent(
          { 
            contents: [{ parts: [{ text: query }] }],
            model: config.getModel()
          },
          `challenge-original-${targetProvider}-${Date.now()}`
        );
        originalVision = response.candidates?.[0]?.content?.parts?.map(part => part.text).join('') || '';
      }

      if (!originalVision) {
        context.ui.addItem(
          {
            type: 'error',
            text: `Failed to get initial response from ${targetProvider}`,
          },
          Date.now(),
        );
        await config.setProvider(originalProvider);
        return;
      }

      // Phase 2: Challenge rounds - each challenger creates competing visions
      const allVisions: ProviderVision[] = [{
        provider: targetProvider,
        round: 0,
        vision: originalVision,
      }];

      for (let round = 1; round <= rounds; round++) {
        context.ui.addItem(
          {
            type: 'info',
            text: `**Round ${round}:** Challengers creating competing visions...`,
          },
          Date.now(),
        );

        for (const challenger of challengers) {
          try {
            await config.setProvider(challenger);
            const challengerGen = await config.getContentGenerator();
            
            if (challengerGen) {
              const challengePrompt = `You are participating in an adversarial challenge. The original query was: "${query}"

The current leading vision/design is:
${originalVision}

Your task is to create a COMPETING vision/design that:
1. Offers a fundamentally different approach or perspective
2. Addresses the same query but with alternative assumptions or methodologies
3. Highlights potential weaknesses in the current approach
4. Provides concrete improvements or innovations

Create your competing vision now. Be bold, creative, and comprehensive. This is round ${round} of ${rounds}.`;

              const challengeResponse = await challengerGen.generateContent(
                { 
                  contents: [{ parts: [{ text: challengePrompt }] }],
                  model: config.getModel()
                },
                `challenge-round${round}-${challenger}-${Date.now()}`
              );
              
              const competingVision = challengeResponse.candidates?.[0]?.content?.parts?.map(part => part.text).join('') || '';
              
              if (competingVision) {
                allVisions.push({
                  provider: challenger,
                  round,
                  vision: competingVision,
                });
                
                // Update the "current leading vision" for next round to be the most recent competing vision
                // This creates more dynamic competition
                originalVision = competingVision;
              }
            }
          } catch (error) {
            console.error(`Challenge round ${round} failed for ${challenger}:`, error);
            allVisions.push({
              provider: challenger,
              round,
              vision: '',
              error: `Failed: ${error instanceof Error ? error.message : String(error)}`,
            });
          }
        }
      }

      // Phase 3: Synthesis - prefer OpenAI/GPT-5 for final analysis
      context.ui.addItem(
        {
          type: 'info',
          text: `**Phase 3:** Synthesizing comprehensive analysis of all competing visions...`,
        },
        Date.now(),
      );

      let synthesizer: 'gemini' | 'openai' | 'anthropic' = 'gemini';
      if (activeProviders.includes('openai')) {
        synthesizer = 'openai';
      } else if (activeProviders.includes('anthropic')) {
        synthesizer = 'anthropic';
      }

      await config.setProvider(synthesizer);
      const synthesizerGen = await config.getContentGenerator();

      let finalReport = `⚔️ **Adversarial Challenge Complete**\n\n`;
      finalReport += `**Query:** "${query}"\n`;
      finalReport += `**Target Provider:** ${targetProvider.toUpperCase()}\n`;
      finalReport += `**Rounds:** ${rounds}\n\n`;

      if (synthesizerGen && allVisions.length > 0) {
        const synthesisPrompt = `Analyze and compare the following competing visions/designs for the query: "${query}"

${allVisions.map((v, i) => `
**Vision ${i + 1} - ${v.provider.toUpperCase()} (Round ${v.round}):**
${v.error ? `ERROR: ${v.error}` : v.vision}
`).join('\n---\n')}

Create a comprehensive comparative analysis that:

1. **Strengths & Innovations**: What unique value does each vision bring?
2. **Weaknesses & Gaps**: What limitations or issues does each vision have?
3. **Key Differentiators**: What fundamentally distinguishes each approach?
4. **Synthesis Opportunities**: How could the best elements be combined?
5. **Winner Assessment**: Which vision(s) best address the original query and why?
6. **Recommendations**: What would be the optimal approach considering all visions?

Format your analysis professionally with clear sections, bullet points, and actionable insights.`;

        const synthesis = await synthesizerGen.generateContent(
          { 
            contents: [{ parts: [{ text: synthesisPrompt }] }],
            model: config.getModel()
          },
          `challenge-synthesis-${Date.now()}`
        );
        
        const synthesisText = synthesis.candidates?.[0]?.content?.parts?.map(part => part.text).join('') || '';
        
        if (synthesisText) {
          finalReport += synthesisText;
        } else {
          finalReport += '**Synthesis failed - showing raw visions:**\n\n';
          for (const vision of allVisions) {
            finalReport += `**${vision.provider.toUpperCase()} (Round ${vision.round}):**\n`;
            finalReport += vision.error ? `❌ ${vision.error}\n\n` : `${vision.vision.substring(0, 500)}...\n\n`;
          }
        }
      } else {
        // Fallback: show raw visions
        finalReport += '**Competing Visions:**\n\n';
        for (const vision of allVisions) {
          finalReport += `**${vision.provider.toUpperCase()} (Round ${vision.round}):**\n`;
          finalReport += vision.error ? `❌ ${vision.error}\n\n` : `${vision.vision}\n\n---\n\n`;
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
        content: `Challenge failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },

  completion: async (_context, partial) => {
    const completions = [
      '--target gemini',
      '--target openai',
      '--target anthropic',
      '--rounds 1',
      '--rounds 2',
      '--rounds 3',
      '--rounds 4',
      '--rounds 5',
    ];
    
    return completions.filter(c => c.startsWith(partial));
  },
};