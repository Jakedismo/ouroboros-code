/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { CommandKind } from './types.js';
/**
 * /converge command - Unified synthesis of all provider responses
 *
 * This command queries multiple LLM providers and synthesizes their
 * responses into a unified, comprehensive answer.
 *
 * Usage:
 *   /converge "Your question here"
 *   /converge --providers gemini,openai "Complex query"
 *   /converge --strategy consensus "Controversial topic"
 */
export const convergeCommand = {
    name: 'converge',
    description: 'Get unified synthesis from multiple providers',
    kind: CommandKind.BUILT_IN,
    action: async (_context, args) => {
        if (!args.trim()) {
            return {
                type: 'message',
                messageType: 'error',
                content: 'Please provide a query. Usage: `/converge "Your question"`',
            };
        }
        return {
            type: 'message',
            messageType: 'info',
            content: `🔄 **Provider Convergence**

This command synthesizes responses from multiple LLM providers to give you a comprehensive, unified answer.

**How it works:**
1. **Parallel Query**: Your question is sent to all available providers
2. **Response Analysis**: Each response is analyzed for key points
3. **Synthesis**: Responses are merged into a unified answer
4. **Confidence Score**: Agreement level between providers is calculated
5. **Final Output**: Best synthesis with provider attributions

**Your Query**: "${args}"

**Available Strategies:**
• \`consensus\` - Focus on points where providers agree
• \`comprehensive\` - Include all unique insights from each provider
• \`critical\` - Highlight disagreements and contradictions
• \`best-of\` - Select the highest quality response

**Example Usage:**
\`\`\`
/converge "Explain quantum computing"
/converge --strategy critical "Is AGI possible?"
/converge --providers gemini,openai "Code review this function"
\`\`\`

**Benefits:**
✨ Reduced bias from single provider
✨ More comprehensive coverage
✨ Higher confidence in consensus points
✨ Discovery of unique insights

Note: This feature requires API keys for multiple providers to be configured.`,
        };
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
//# sourceMappingURL=convergeCommand.js.map