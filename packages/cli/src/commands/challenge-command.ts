/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SlashCommand, CommandKind, CommandContext, MessageActionReturn } from '../ui/commands/types.js';
import {
  AdversarialChallenger,
  formatChallengeReport,
  MultiProviderOrchestrator,
  type ChallengeReport,
} from '@ouroboros/code-cli-core';
import { LLMProvider } from '@ouroboros/code-cli-core';

/**
 * /challenge command - Run adversarial challenges between providers
 *
 * Usage:
 *   /challenge "Can AI be conscious?"
 *   /challenge --target openai "Explain quantum computing"
 *   /challenge --target gemini --challengers openai,anthropic "Is P=NP?"
 *   /challenge --rounds 2 --focus logic "Prove this theorem"
 */
export class ChallengeCommand implements SlashCommand {
  name = 'challenge';
  description =
    'Run adversarial challenges where providers critique each other';
  kind = CommandKind.BUILT_IN;

  private challenger: AdversarialChallenger;

  constructor(private _orchestrator: MultiProviderOrchestrator) {
    this.challenger = new AdversarialChallenger(this._orchestrator);
  }

  action = async (_context: CommandContext, argsStr: string): Promise<MessageActionReturn> => {
    const args = argsStr.split(' ').filter(Boolean);
    try {
      // Parse command arguments
      const options = this.parseArguments(args);

      // Show processing indicator with details
      console.log('⚔️ Running adversarial challenge...');
      if (options.targetProvider) {
        console.log(`   Target: ${options.targetProvider}`);
      }
      if (options.challengers) {
        console.log(`   Challengers: ${options.challengers.join(', ')}`);
      }

      // Run the challenge
      const report = await this.challenger.runChallenge(options.query, {
        targetProvider: options.targetProvider,
        challengers: options.challengers,
        rounds: options.rounds,
        focus: options.focus,
      });

      // Format and return results
      const formatted = formatChallengeReport(report);

      // Add insights summary
      const insights = this.createInsightsSummary(report);

      return {
        type: 'message',
        messageType: 'info',
        content: formatted + '\n\n' + insights,
      };
    } catch (error) {
      return {
        type: 'message', 
        messageType: 'error',
        content: `❌ Challenge failed: ${(error as Error).message}`,
      };
    }
  };

  /**
   * Parse command arguments
   */
  private parseArguments(args: string[]): ChallengeOptions {
    const options: ChallengeOptions = {
      query: '',
      targetProvider: undefined,
      challengers: undefined,
      rounds: 1,
      focus: undefined,
    };

    let i = 0;
    while (i < args.length) {
      const arg = args[i];

      if (arg === '--target' && i + 1 < args.length) {
        options.targetProvider = args[i + 1] as LLMProvider;
        i += 2;
      } else if (arg === '--challengers' && i + 1 < args.length) {
        const challengerList = args[i + 1].split(',').map((p) => p.trim());
        options.challengers = challengerList as LLMProvider[];
        i += 2;
      } else if (arg === '--rounds' && i + 1 < args.length) {
        options.rounds = parseInt(args[i + 1], 10);
        i += 2;
      } else if (arg === '--focus' && i + 1 < args.length) {
        options.focus = args[i + 1] as ChallengeFocus;
        i += 2;
      } else if (!arg.startsWith('--')) {
        options.query += (options.query ? ' ' : '') + arg;
        i++;
      } else {
        i++;
      }
    }

    // Validate query
    if (!options.query) {
      throw new Error('No query provided. Usage: /challenge "your question"');
    }

    // Validate rounds
    if (!options.rounds || options.rounds < 1 || options.rounds > 3) {
      options.rounds = 1; // Default to 1 round
    }

    return options;
  }

  /**
   * Create insights summary from the challenge report
   */
  private createInsightsSummary(report: ChallengeReport): string {
    // Count critiques by severity
    const critiqueCounts = {
      critical: 0,
      moderate: 0,
      minor: 0,
    };

    // Analyze challenges for patterns
    report.challenges.forEach((challenge: any) => {
      // Simple heuristic - count mentions of severity keywords
      const critique = challenge.critique.toLowerCase();
      if (critique.includes('critical') || critique.includes('major')) {
        critiqueCounts.critical++;
      } else if (critique.includes('moderate') || critique.includes('should')) {
        critiqueCounts.moderate++;
      } else {
        critiqueCounts.minor++;
      }
    });

    const consensusCount = report.metaAnalysis.consensusCritiques?.length || 0;
    const validCount = report.metaAnalysis.validCritiques?.length || 0;

    return `📈 **Challenge Insights**

**Critique Summary**:
- Critical Issues: ${critiqueCounts.critical}
- Moderate Issues: ${critiqueCounts.moderate}  
- Minor Issues: ${critiqueCounts.minor}

**Consensus Analysis**:
- Consensus Critiques: ${consensusCount}
- Valid Critiques: ${validCount}
- Defense Provided: ${report.defense ? 'Yes' : 'No'}

**Key Takeaway**:
${this.generateTakeaway(critiqueCounts, report)}

💡 **Tip**: Use --focus to concentrate critique on specific aspects (logic, facts, completeness, assumptions, practical)`;
  }

  /**
   * Generate key takeaway based on analysis
   */
  private generateTakeaway(
    critiqueCounts: { critical: number; moderate: number; minor: number },
    _report: ChallengeReport,
  ): string {
    const total =
      critiqueCounts.critical + critiqueCounts.moderate + critiqueCounts.minor;

    if (critiqueCounts.critical > 0) {
      return '⚠️ Critical issues identified. The response needs significant improvements.';
    } else if (critiqueCounts.moderate > total / 2) {
      return '📝 Several moderate issues found. The response is generally sound but could be improved.';
    } else if (total === 0) {
      return '✅ Response withstood challenges well. Few substantive issues identified.';
    } else {
      return '👍 Mostly minor issues. The response is fundamentally strong.';
    }
  }

  /**
   * Get help text for the command
   */
  getHelp(): string {
    return `
# /challenge - Adversarial Challenge

Runs adversarial challenges where providers critique each other's responses to improve quality and identify weaknesses.

## Usage

\`\`\`
/challenge "your question"
/challenge --target [provider] "question"
/challenge --target [provider] --challengers [provider,provider] "question"
/challenge --rounds [1-3] "question"
/challenge --focus [logic|facts|completeness|assumptions|practical] "question"
\`\`\`

## Examples

### Basic Challenge
\`\`\`
/challenge "Can AI be conscious?"
\`\`\`
Randomly selects target and challengers.

### Target Specific Provider
\`\`\`
/challenge --target openai "Explain quantum computing"
\`\`\`

### Full Configuration
\`\`\`
/challenge --target gemini --challengers openai,anthropic --rounds 2 --focus logic "Is P=NP?"
\`\`\`

## Focus Options

- **logic**: Logical consistency and reasoning
- **facts**: Factual accuracy and verification
- **completeness**: Missing information and gaps
- **assumptions**: Unstated assumptions and biases  
- **practical**: Real-world applicability

## Process

1. **Target Response**: Get initial answer from target provider
2. **Challenges**: Other providers critique the response
3. **Defense** (if rounds > 1): Target defends against critiques
4. **Meta-Analysis**: Neutral analysis of the debate
5. **Synthesis**: Final assessment with improvements

## Output Includes

- Original response summary
- Challenges from each provider
- Defense (if applicable)
- Meta-analysis by neutral arbitrator
- Consensus critiques
- Valid improvements identified
- Overall assessment

## Best For

- Testing response robustness
- Identifying logical flaws
- Fact-checking claims
- Finding missing perspectives
- Improving answer quality
- Educational debates
`;
  }
}

interface ChallengeOptions {
  query: string;
  targetProvider?: LLMProvider;
  challengers?: LLMProvider[];
  rounds?: number;
  focus?: ChallengeFocus;
}

type ChallengeFocus =
  | 'logic'
  | 'facts'
  | 'completeness'
  | 'assumptions'
  | 'practical';
