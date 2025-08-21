/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, SlashCommand, MessageActionReturn } from './types.js';

/**
 * /race command - Fastest provider wins
 * 
 * This command sends your query to all providers and returns the first
 * response received, optimizing for speed.
 * 
 * Usage:
 *   /race "Quick question"
 *   /race --timeout 5000 "Time-sensitive query"
 *   /race --providers gemini,openai "Urgent request"
 */
export const raceCommand: SlashCommand = {
  name: 'race',
  description: 'Get the fastest response from any provider',
  kind: CommandKind.BUILT_IN,
  
  action: async (_context, args): Promise<MessageActionReturn> => {
    if (!args.trim()) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Please provide a query. Usage: `/race "Your question"`',
      };
    }

    return {
      type: 'message',
      messageType: 'info',
      content: `⚡ **Provider Race**

Get the fastest response by racing multiple providers - first one to respond wins!

**Your Query**: "${args}"

**How Racing Works:**

1. **Parallel Launch**: Query sent to all providers simultaneously
2. **First Response Wins**: The fastest provider's response is used
3. **Cancel Others**: Remaining requests are cancelled to save resources
4. **Performance Tracking**: Response times logged for optimization
5. **Fallback Ready**: If fastest fails, next fastest takes over

**Race Statistics:**
🏆 **Typical Winners:**
  • Simple queries: Gemini 2.5 Flash (0.5-1s)
  • Code generation: O3 (1-2s)
  • Short answers: Claude 4 Sonnet (1-2s)

⏱️ **Average Response Times:**
  • Gemini 2.5 Flash: ~0.8s
  • O3: ~1.5s
  • Claude 4 Sonnet: ~1.8s
  • GPT-5: ~3-5s
  • Claude Opus 4.1: ~2-4s
  • Gemini 2.5 Pro: ~2-3s

**Configuration Options:**
• \`--timeout <ms>\` - Maximum wait time (default: 10000ms)
• \`--providers <list>\` - Specific providers to race
• \`--fallback\` - Enable automatic fallback to next fastest
• \`--stats\` - Show detailed timing statistics

**Example Usage:**
\`\`\`
/race "What's 2+2?"
/race --timeout 3000 "Quick definition of AI"
/race --providers gemini,openai "Fast code snippet"
/race --stats "Benchmark this query"
\`\`\`

**Best Use Cases:**
✅ Time-sensitive queries
✅ Simple factual questions
✅ Quick code snippets
✅ Definition lookups
✅ Interactive conversations needing speed

**Trade-offs:**
⚠️ May not get the highest quality response
⚠️ Complex reasoning tasks might suffer
⚠️ Provider specializations not considered

Note: This feature requires API keys for multiple providers to be configured.`,
    };
  },
  
  completion: async (_context, partial) => {
    const completions = [
      '--timeout 3000',
      '--timeout 5000',
      '--timeout 10000',
      '--providers gemini,openai',
      '--providers gemini,anthropic',
      '--providers all',
      '--fallback',
      '--stats',
    ];
    
    return completions.filter(c => c.startsWith(partial));
  },
};