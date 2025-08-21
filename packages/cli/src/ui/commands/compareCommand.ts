/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, SlashCommand, MessageActionReturn } from './types.js';

interface ProviderComparison {
  provider: 'gemini' | 'openai' | 'anthropic';
  response: string;
  responseTime: number;
  characterCount: number;
  wordCount: number;
  error?: string;
}

export const compareCommand: SlashCommand = {
  name: 'compare',
  description: 'Compare responses from multiple providers side-by-side',
  kind: CommandKind.BUILT_IN,
  
  action: async (context, args): Promise<void | MessageActionReturn> => {
    if (!args.trim()) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Please provide a query. Usage: `/compare "Your question"`',
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
    const argsMatch = args.match(/^(?:--providers\s+([\w,]+)\s+)?(?:--format\s+(side-by-side|sequential|table|diff)\s+)?(.+)$/);
    if (!argsMatch || !argsMatch[3]) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Invalid arguments. Usage: `/compare [--providers list] [--format type] "Your question"`',
      };
    }

    const providersArg = argsMatch[1];
    const format = (argsMatch[2] || 'side-by-side') as 'side-by-side' | 'sequential' | 'table' | 'diff';
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
        content: `📊 **Provider Comparison Requires Multiple Providers**

You need at least 2 providers configured for comparison.

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
        text: `📊 **Starting Provider Comparison**

**Query:** "${query}"
**Comparing:** ${selectedProviders.map(p => p.toUpperCase()).join(' vs ')}
**Format:** ${format}

**Phase 1:** Collecting responses from all providers simultaneously...`,
      },
      Date.now(),
    );

    try {
      // Phase 1: Collect responses from all providers in parallel
      const comparisons: ProviderComparison[] = [];
      
      const comparisonPromises = selectedProviders.map(async (provider) => {
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
              `compare-${provider}-${Date.now()}`
            );
            
            const responseTime = Date.now() - startTime;
            const responseText = response.candidates?.[0]?.content?.parts?.map(part => part.text).join('') || '';
            const wordCount = responseText.split(/\s+/).length;
            
            return {
              provider,
              response: responseText,
              responseTime,
              characterCount: responseText.length,
              wordCount,
            } as ProviderComparison;
          } else {
            return {
              provider,
              response: '',
              responseTime: Date.now() - startTime,
              characterCount: 0,
              wordCount: 0,
              error: `Failed to initialize ${provider} content generator`,
            } as ProviderComparison;
          }
        } catch (error) {
          return {
            provider,
            response: '',
            responseTime: Date.now() - startTime,
            characterCount: 0,
            wordCount: 0,
            error: `${provider} error: ${error instanceof Error ? error.message : String(error)}`,
          } as ProviderComparison;
        }
      });

      const results = await Promise.all(comparisonPromises);
      comparisons.push(...results);

      // Phase 2: Format and display comparison
      context.ui.addItem(
        {
          type: 'info',
          text: `**Phase 2:** Formatting comparison in ${format} layout...`,
        },
        Date.now(),
      );

      let comparisonReport = `📊 **Provider Comparison Complete**\n\nQuery: "${query}"\nProviders: ${selectedProviders.join(', ')}\nFormat: ${format}\n\n`;

      // Add performance metrics
      comparisonReport += `**⏱️ Performance Metrics:**\n\n`;
      comparisons.forEach(c => {
        if (c.error) {
          comparisonReport += `• **${c.provider.toUpperCase()}:** ❌ ${c.error}\n`;
        } else {
          comparisonReport += `• **${c.provider.toUpperCase()}:** ${c.responseTime}ms | ${c.wordCount} words | ${c.characterCount} chars\n`;
        }
      });
      comparisonReport += '\n';

      // Format responses based on requested format
      if (format === 'side-by-side') {
        comparisonReport += formatSideBySide(comparisons);
      } else if (format === 'sequential') {
        comparisonReport += formatSequential(comparisons);
      } else if (format === 'table') {
        comparisonReport += formatTable(comparisons);
      } else if (format === 'diff') {
        comparisonReport += formatDiff(comparisons);
      }

      // Restore original provider
      await config.setProvider(originalProvider);

      context.ui.addItem(
        {
          type: 'info',
          text: comparisonReport,
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
        content: `Comparison failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
  
  completion: async (_context, partial) => {
    const completions = [
      '--providers gemini,openai',
      '--providers gemini,anthropic',
      '--providers openai,anthropic',
      '--providers all',
      '--format side-by-side',
      '--format sequential',
      '--format table',
      '--format diff',
    ];
    
    return completions.filter(c => c.startsWith(partial));
  },
};

// Formatting functions for different display modes
function formatSideBySide(comparisons: ProviderComparison[]): string {
  let output = `**📋 Side-by-Side Comparison:**\n\n`;
  
  const successfulComparisons = comparisons.filter(c => !c.error);
  if (successfulComparisons.length === 0) {
    output += `No successful responses to compare.\n`;
    return output;
  }

  // Create side-by-side columns
  const columns = successfulComparisons.map(c => ({
    provider: c.provider.toUpperCase(),
    lines: c.response.split('\n'),
  }));

  const maxLines = Math.max(...columns.map(col => col.lines.length));
  
  // Header
  output += columns.map(col => `**${col.provider}**`).join(' | ') + '\n';
  output += columns.map(() => '---').join(' | ') + '\n';
  
  // Content rows
  for (let i = 0; i < maxLines; i++) {
    const row = columns.map(col => 
      (col.lines[i] || '').substring(0, 60).padEnd(60)
    ).join(' | ');
    output += row + '\n';
  }
  
  return output;
}

function formatSequential(comparisons: ProviderComparison[]): string {
  let output = `**📝 Sequential Comparison:**\n\n`;
  
  comparisons.forEach((comp, index) => {
    output += `### ${comp.provider.toUpperCase()} Response\n\n`;
    if (comp.error) {
      output += `❌ **Error:** ${comp.error}\n\n`;
    } else {
      output += `${comp.response}\n\n`;
    }
    
    if (index < comparisons.length - 1) {
      output += `---\n\n`;
    }
  });
  
  return output;
}

function formatTable(comparisons: ProviderComparison[]): string {
  let output = `**📊 Table Comparison:**\n\n`;
  
  output += `| Provider | Response Time | Words | Preview |\n`;
  output += `|----------|---------------|-------|----------|\n`;
  
  comparisons.forEach(comp => {
    const preview = comp.error 
      ? `❌ ${comp.error}` 
      : `${comp.response.substring(0, 50).replace(/\n/g, ' ')}...`;
    
    output += `| **${comp.provider.toUpperCase()}** | ${comp.responseTime}ms | ${comp.wordCount} | ${preview} |\n`;
  });
  
  output += `\n**Full Responses:**\n\n`;
  comparisons.forEach(comp => {
    if (!comp.error) {
      output += `**${comp.provider.toUpperCase()}:**\n${comp.response}\n\n---\n\n`;
    }
  });
  
  return output;
}

function formatDiff(comparisons: ProviderComparison[]): string {
  let output = `**🔍 Difference Analysis:**\n\n`;
  
  const successfulComparisons = comparisons.filter(c => !c.error);
  if (successfulComparisons.length < 2) {
    output += `Need at least 2 successful responses for difference analysis.\n`;
    return output;
  }

  // Analyze key differences
  output += `**Key Differences Detected:**\n\n`;
  
  const responses = successfulComparisons.map(c => ({
    provider: c.provider.toUpperCase(),
    words: c.response.toLowerCase().split(/\s+/),
    sentences: c.response.split(/[.!?]+/).filter(s => s.trim()),
  }));
  
  // Find unique concepts mentioned by each provider
  responses.forEach((resp, index) => {
    const otherWords = responses
      .filter((_, i) => i !== index)
      .flatMap(r => r.words);
    
    const uniqueWords = resp.words.filter(word => 
      word.length > 4 && !otherWords.includes(word)
    ).slice(0, 10);
    
    if (uniqueWords.length > 0) {
      output += `**${resp.provider} Unique Concepts:** ${uniqueWords.join(', ')}\n\n`;
    }
  });
  
  // Length comparison
  output += `**Response Length Analysis:**\n`;
  responses.forEach(resp => {
    output += `• **${resp.provider}:** ${resp.sentences.length} sentences, ${resp.words.length} words\n`;
  });
  
  output += `\n**Full Responses:**\n\n`;
  successfulComparisons.forEach(comp => {
    output += `**${comp.provider.toUpperCase()}:**\n${comp.response}\n\n---\n\n`;
  });
  
  return output;
}