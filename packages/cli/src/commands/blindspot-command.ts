/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SlashCommand, CommandKind, CommandContext, MessageActionReturn } from '../ui/commands/types.js';
import {
  BlindspotDetector,
  formatBlindspotAnalysis,
  MultiProviderOrchestrator,
  type BlindspotAnalysis,
} from '@ouroboros/code-cli-core';
import { LLMProvider } from '@ouroboros/code-cli-core';

/**
 * /blindspot command - Detect blindspots across provider responses
 *
 * Usage:
 *   /blindspot "What are the security implications?"
 *   /blindspot --providers gemini,openai "Analyze this design"
 *   /blindspot --input response.txt "Check this response for gaps"
 */
export class BlindspotCommand implements SlashCommand {
  name = 'blindspot';
  description = 'Detect blindspots and gaps across provider responses';
  kind = CommandKind.BUILT_IN;

  private detector: BlindspotDetector;

  constructor(private _orchestrator: MultiProviderOrchestrator) {
    this.detector = new BlindspotDetector(this._orchestrator);
  }

  action = async (_context: CommandContext, argsStr: string): Promise<MessageActionReturn> => {
    const args = argsStr.split(' ').filter(Boolean);
    try {
      // Parse command arguments
      const options = this.parseArguments(args);

      // Show processing indicator
      console.log('🔍 Analyzing for blindspots...');

      // Run blindspot detection
      const analysis = await this.detector.detectBlindspots(
        options.query,
        options.providers,
      );

      // Format and return results
      const formatted = formatBlindspotAnalysis(analysis);

      // Add summary statistics
      const summary = this.createSummary(analysis);

      return {
        type: 'message',
        messageType: 'info',
        content: formatted + '\n\n' + summary,
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `❌ Blindspot analysis failed: ${(error as Error).message}`,
      };
    }
  };

  /**
   * Parse command arguments
   */
  private parseArguments(args: string[]): BlindspotOptions {
    const options: BlindspotOptions = {
      query: '',
      providers: undefined,
    };

    let i = 0;
    while (i < args.length) {
      const arg = args[i];

      if (arg === '--providers' && i + 1 < args.length) {
        // Parse provider list
        const providerList = args[i + 1].split(',').map((p) => p.trim());
        options.providers = providerList as LLMProvider[];
        i += 2;
      } else if (arg === '--input' && i + 1 < args.length) {
        // Read input from file
        // In real implementation, would read file content
        options.query = `[Content from ${args[i + 1]}]`;
        i += 2;
      } else if (!arg.startsWith('--')) {
        // Regular query text
        options.query += (options.query ? ' ' : '') + arg;
        i++;
      } else {
        // Unknown flag, skip
        i++;
      }
    }

    // If no query provided, show help
    if (!options.query) {
      throw new Error(
        'No query provided. Usage: /blindspot "your question or input"',
      );
    }

    return options;
  }

  /**
   * Create summary statistics
   */
  private createSummary(analysis: BlindspotAnalysis): string {
    const stats = {
      totalAnalyzers: analysis.analyzers.length,
      commonBlindspots: analysis.commonBlindspots.length,
      uniqueInsights: Array.from(analysis.uniqueInsights.values()).flat()
        .length,
      confidence: Math.round(analysis.overallConfidence * 100),
    };

    return `📊 **Summary**
- Analyzers: ${stats.totalAnalyzers} providers
- Common Blindspots Found: ${stats.commonBlindspots}
- Unique Insights: ${stats.uniqueInsights}
- Overall Confidence: ${stats.confidence}%

💡 **Tip**: Run with --providers to specify which providers to use for analysis.`;
  }

  /**
   * Get help text for the command
   */
  getHelp(): string {
    return `
# /blindspot - Blindspot Detection

Analyzes responses from multiple providers to identify gaps, missing perspectives, and overlooked considerations.

## Usage

\`\`\`
/blindspot "your question or analysis target"
/blindspot --providers gemini,openai "specific providers to use"
/blindspot --input file.txt "analyze content from file"
\`\`\`

## Examples

### Basic Blindspot Detection
\`\`\`
/blindspot "What are the security implications of this design?"
\`\`\`

### With Specific Providers
\`\`\`
/blindspot --providers gemini,anthropic "Analyze the scalability"
\`\`\`

### Analyze Existing Response
\`\`\`
/blindspot --input previous-response.txt "Check for gaps"
\`\`\`

## What It Does

1. **Multi-Provider Analysis**: Each provider analyzes others' responses
2. **Gap Detection**: Identifies what providers commonly miss
3. **Unique Insights**: Highlights valuable insights only some mention
4. **Criticality Assessment**: Rates importance of each blindspot
5. **Recommendations**: Provides actionable suggestions

## Output Includes

- Critical blindspots (high priority gaps)
- Moderate blindspots (should be addressed)
- Minor blindspots (nice to have)
- Unique insights by provider
- Confidence scores
- Actionable recommendations

## Best For

- Risk assessment and mitigation
- Comprehensive analysis
- Finding edge cases
- Identifying assumptions
- Improving solution completeness
`;
  }
}

interface BlindspotOptions {
  query: string;
  providers?: LLMProvider[];
}
