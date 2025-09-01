/**
 * Vision Quest /saga command
 * Temporary implementation until full extension system is ready
 */

import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import { MessageType, type HistoryItemInfo } from '../types.js';

export const sagaCommand: SlashCommand = {
  name: 'saga',
  altNames: ['quest', 'vision'],
  kind: CommandKind.BUILT_IN,
  description: 'Start a Vision Quest development workflow',
  action: async (context, args) => {
    const goal = args?.trim();
    
    if (!goal) {
      const infoItem: Omit<HistoryItemInfo, 'id'> = {
        type: MessageType.INFO,
        text: `🚀 **Vision Quest** - Multi-Phase AI Development Workflow

**Usage:**
\`/saga "your development goal"\`

**Examples:**
• \`/saga "create a REST API for user management"\`
• \`/saga "add unit tests with 90% coverage"\`
• \`/saga "refactor to use repository pattern"\`

**Three-Phase Workflow:**
1. **Narrator Phase** - Multi-provider design generation
2. **Sage Phase** - Automated implementation  
3. **CodePress Phase** - Interactive review

**Requirements:**
• API keys for OpenAI, Anthropic, or Gemini
• Node.js 18+ and Git

**Note:** Full extension implementation coming soon!
See \`extensions/vision-quest/\` for details.`,
      };
      context.ui.addItem(infoItem, Date.now());
      return;
    }

    const goalItem: Omit<HistoryItemInfo, 'id'> = {
      type: MessageType.INFO,
      text: `🎯 **Vision Quest Started**

**Goal:** ${goal}

**Status:** The Vision Quest extension system is being integrated.

**What would happen:**
1. **Narrator Phase** - GPT-5, Claude, and Gemini would generate designs in parallel
2. **Arbiter** - Best ideas would be synthesized into a unified design
3. **Design Review** - You would review and edit the design document
4. **Sage Phase** - Automated implementation with validation loops
5. **CodePress Review** - Interactive diff review before applying changes

**Current Status:**
The Vision Quest extension is fully implemented at \`extensions/vision-quest/\` but requires the extension loading system to be integrated with Ouroboros Code.

**Available Files:**
• Service layer (NarratorService, ArbiterService, SageService)
• TUI components (SagaFrame, DesignViewer, CodePressReview)
• State machine workflow (XState)
• Storage persistence (.ouroboros/saga/)

To explore the implementation, check \`extensions/vision-quest/README.md\``,
    };
    context.ui.addItem(goalItem, Date.now());
  },
};

export const sagaHistoryCommand: SlashCommand = {
  name: 'saga-history',
  altNames: ['quest-history'],
  kind: CommandKind.BUILT_IN,
  description: 'View Vision Quest session history',
  action: async (context) => {
    const historyItem: Omit<HistoryItemInfo, 'id'> = {
      type: MessageType.INFO,
      text: `📜 **Vision Quest History**

Session history will be available once the extension system is fully integrated.

**Future Features:**
• View past Vision Quest sessions
• Reload previous designs
• Export session data
• Session statistics

Sessions will be stored in \`.ouroboros/saga/\``,
    };
    context.ui.addItem(historyItem, Date.now());
  },
};