/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { CommandKind } from './types.js';
export const blindspotCommand = {
    name: 'blindspot',
    description: 'Detect blindspots across provider responses',
    kind: CommandKind.BUILT_IN,
    action: async (_context) => {
        return {
            type: 'message',
            messageType: 'info',
            content: `🔍 Blindspot Detection

This command analyzes responses from multiple LLM providers to identify potential gaps or blindspots in their responses.

Usage:
  /blindspot "What are the security implications?"
  
Available providers: Gemini, OpenAI, Anthropic

Note: This feature requires API keys for multiple providers to be configured.`,
        };
    },
};
//# sourceMappingURL=blindspotCommand.js.map