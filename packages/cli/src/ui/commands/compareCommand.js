/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { CommandKind } from './types.js';
/**
 * /compare command - Side-by-side provider comparison
 *
 * This command queries multiple providers and presents their responses
 * side-by-side for easy comparison.
 *
 * Usage:
 *   /compare "Your question"
 *   /compare --providers gemini,openai "Complex problem"
 *   /compare --format table "Technical question"
 */
export const compareCommand = {
    name: 'compare',
    description: 'Compare responses from multiple providers side-by-side',
    kind: CommandKind.BUILT_IN,
    action: async (_context, args) => {
        if (!args.trim()) {
            return {
                type: 'message',
                messageType: 'error',
                content: 'Please provide a query. Usage: `/compare "Your question"`',
            };
        }
        return {
            type: 'message',
            messageType: 'info',
            content: `📊 **Provider Comparison**

Compare responses from multiple LLM providers side-by-side to understand different perspectives and approaches.

**Your Query**: "${args}"

**How Comparison Works:**

1. **Parallel Execution**: Query sent to all selected providers simultaneously
2. **Response Collection**: Each provider's complete response is captured
3. **Structured Display**: Responses shown in organized format
4. **Analysis Metrics**: Response time, token count, and quality indicators
5. **Difference Highlighting**: Key variations between responses marked

**Display Formats:**
• \`side-by-side\` - Traditional column view (default)
• \`sequential\` - One after another with separators
• \`table\` - Structured comparison table
• \`diff\` - Highlight differences between responses

**Comparison Metrics:**
📏 **Length**: Token/character count comparison
⏱️ **Speed**: Response time for each provider
🎯 **Accuracy**: Fact-checking where applicable
💡 **Creativity**: Unique insights per provider
🔍 **Detail**: Depth of explanation

**Example Usage:**
\`\`\`
/compare "What is recursion?"
/compare --providers gemini,openai "Best sorting algorithm"
/compare --format table "Pros and cons of microservices"
/compare --metric speed "Quick math problem"
\`\`\`

**Benefits of Comparison:**
• See different reasoning approaches
• Identify provider strengths/weaknesses
• Make informed choice for specific tasks
• Validate critical information
• Discover unique perspectives

Note: This feature requires API keys for multiple providers to be configured.`,
        };
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
            '--metric speed',
            '--metric accuracy',
            '--metric detail',
        ];
        return completions.filter(c => c.startsWith(partial));
    },
};
//# sourceMappingURL=compareCommand.js.map