/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, SlashCommand, MessageActionReturn } from './types.js';

interface RaceResult {
  provider: 'gemini' | 'openai' | 'anthropic';
  response: string;
  responseTime: number;
  position: number; // 1 = winner, 2 = second, etc.
  error?: string;
  cancelled?: boolean;
}


export const raceCommand: SlashCommand = {
  name: 'race',
  description: 'Get the fastest response from any provider',
  kind: CommandKind.BUILT_IN,
  
  action: async (context, args): Promise<void | MessageActionReturn> => {
    if (!args.trim()) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Please provide a query. Usage: `/race "Your question"`',
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
    const argsMatch = args.match(/^(?:--timeout\s+(\d+)\s+)?(?:--providers\s+([\w,]+)\s+)?(--fallback\s+)?(--stats\s+)?(.+)$/);
    if (!argsMatch || !argsMatch[5]) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Invalid arguments. Usage: `/race [--timeout ms] [--providers list] [--fallback] [--stats] "Your question"`',
      };
    }

    const timeoutMs = argsMatch[1] ? parseInt(argsMatch[1], 10) : 10000;
    const providersArg = argsMatch[2];
    const enableFallback = !!argsMatch[3];
    const showStats = !!argsMatch[4];
    const query = argsMatch[5].trim();

    const originalProvider = config.getProvider();

    // Determine which providers to race
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
        content: `⚡ **Provider Race Requires Multiple Providers**

You need at least 2 providers configured for racing.

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
        text: `⚡ **Starting Provider Race**

**Query:** "${query}"
**Racers:** ${selectedProviders.map(p => p.toUpperCase()).join(', ')}
**Timeout:** ${timeoutMs}ms
**Fallback:** ${enableFallback ? 'Enabled' : 'Disabled'}

🏁 **Race in progress...** First to finish wins!`,
      },
      Date.now(),
    );

    const raceStartTime = Date.now();

    try {
      // Start race: Create promises for all providers
      const racePromises = selectedProviders.map(async (provider) => {
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
              `race-${provider}-${Date.now()}`
            );
            
            const responseTime = Date.now() - startTime;
            const responseText = response.candidates?.[0]?.content?.parts?.map(part => part.text).join('') || '';
            
            return {
              provider,
              response: responseText,
              responseTime,
              position: 0, // Will be set later based on completion order
            } as RaceResult;
          } else {
            return {
              provider,
              response: '',
              responseTime: Date.now() - startTime,
              position: 999,
              error: `Failed to initialize ${provider} content generator`,
            } as RaceResult;
          }
        } catch (error) {
          return {
            provider,
            response: '',
            responseTime: Date.now() - startTime,
            position: 999,
            error: `${provider} error: ${error instanceof Error ? error.message : String(error)}`,
          } as RaceResult;
        }
      });

      // Add timeout wrapper
      const timeoutPromise = new Promise<RaceResult>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Race timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      const raceResults: RaceResult[] = [];
      let winner: RaceResult | null = null;

      // Use Promise.race for the first result, then collect others
      try {
        // Wait for first successful response
        const firstResult = await Promise.race([
          ...racePromises,
          timeoutPromise
        ]);
        
        if (!firstResult.error && firstResult.response) {
          winner = { ...firstResult, position: 1 };
          raceResults.push(winner);
          
          context.ui.addItem(
            {
              type: 'info',
              text: `🏆 **${winner.provider.toUpperCase()} WINS!** (${winner.responseTime}ms)

**Winner Response:**

${winner.response}`,
            },
            Date.now(),
          );
        }

        // If we have a winner and fallback is not needed, we can finish here
        // But for stats, let's wait a bit longer for other results
        if (showStats || !winner) {
          // Wait for other results (with shorter timeout)
          const remainingTimeout = Math.max(1000, timeoutMs - (Date.now() - raceStartTime));
          
          try {
            await Promise.race([
              Promise.allSettled(racePromises).then(results => {
                results.forEach((result, index) => {
                  if (result.status === 'fulfilled' && result.value.provider !== winner?.provider) {
                    const raceResult = { ...result.value, position: raceResults.length + 1 };
                    raceResults.push(raceResult);
                  }
                });
              }),
              new Promise(resolve => setTimeout(resolve, remainingTimeout))
            ]);
          } catch {
            // Ignore timeout for remaining results
          }
        }

      } catch (error) {
        // If first attempt fails and fallback is enabled, try next fastest
        if (enableFallback) {
          context.ui.addItem(
            {
              type: 'info',
              text: `⚠️ **First attempt failed, trying fallback...** ${error instanceof Error ? error.message : String(error)}`,
            },
            Date.now(),
          );

          // Wait for any successful result
          const settledResults = await Promise.allSettled(racePromises);
          const successfulResults = settledResults
            .map((result, index) => ({
              result: result.status === 'fulfilled' ? result.value : null,
              provider: selectedProviders[index]
            }))
            .filter(item => item.result && !item.result.error && item.result.response)
            .sort((a, b) => (a.result?.responseTime || 0) - (b.result?.responseTime || 0));

          if (successfulResults.length > 0) {
            winner = { ...successfulResults[0].result!, position: 1 };
            raceResults.push(winner);
          }
        }
        
        if (!winner) {
          throw error;
        }
      }

      // Generate final race report
      const totalRaceTime = Date.now() - raceStartTime;

      let raceReport = `⚡ **Race Complete!**\n\n`;
      
      if (winner) {
        raceReport += `🥇 **Winner:** ${winner.provider.toUpperCase()} (${winner.responseTime}ms)\n\n`;
        
        if (!showStats) {
          raceReport += `**Winning Response:**\n${winner.response}\n\n`;
        }
      }

      // Add detailed stats if requested
      if (showStats && raceResults.length > 0) {
        raceReport += `**📊 Detailed Race Statistics:**\n\n`;
        raceReport += `**Total Race Time:** ${totalRaceTime}ms\n`;
        raceReport += `**Participants:** ${selectedProviders.length}\n`;
        raceReport += `**Completed:** ${raceResults.filter(r => !r.error).length}\n\n`;
        
        raceReport += `**Leaderboard:**\n`;
        raceResults
          .filter(r => !r.error)
          .sort((a, b) => a.responseTime - b.responseTime)
          .forEach((result, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  ';
            raceReport += `${medal} **${result.provider.toUpperCase()}:** ${result.responseTime}ms\n`;
          });

        const failedResults = raceResults.filter(r => r.error);
        if (failedResults.length > 0) {
          raceReport += `\n**❌ Failed:**\n`;
          failedResults.forEach(result => {
            raceReport += `• **${result.provider.toUpperCase()}:** ${result.error}\n`;
          });
        }

        if (winner && !showStats) {
          raceReport += `\n**Winning Response:**\n${winner.response}\n`;
        }
      }

      // Restore original provider
      await config.setProvider(originalProvider);

      context.ui.addItem(
        {
          type: 'info',
          text: raceReport,
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
        content: `Race failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
  
  completion: async (_context, partial) => {
    const completions = [
      '--timeout 3000',
      '--timeout 5000',
      '--timeout 10000',
      '--providers gemini,openai',
      '--providers gemini,anthropic',
      '--providers openai,anthropic',
      '--providers all',
      '--fallback',
      '--stats',
    ];
    
    return completions.filter(c => c.startsWith(partial));
  },
};