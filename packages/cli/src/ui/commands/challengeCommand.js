/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { CommandKind } from './types.js';
export const challengeCommand = {
    name: 'challenge',
    description: 'Challenge responses with adversarial questions',
    kind: CommandKind.BUILT_IN,
    action: async (_context) => {
        return {
            type: 'message',
            messageType: 'info',
            content: `⚔️ Adversarial Challenge

This command uses multiple LLM providers to challenge and critique each other's responses, helping identify weaknesses and improve answer quality.

Usage:
  /challenge "Explain quantum computing"
  /challenge --target gemini --rounds 2 "What is AGI?"
  
Options:
  --target <provider>  Target provider to challenge (default: gemini)
  --rounds <n>        Number of challenge rounds (1-3, default: 1)
  --focus <area>      Focus area: accuracy, completeness, clarity, bias
  
Available providers: Gemini, OpenAI, Anthropic

Note: This feature requires API keys for multiple providers to be configured.`,
        };
    },
};
//# sourceMappingURL=challengeCommand.js.map