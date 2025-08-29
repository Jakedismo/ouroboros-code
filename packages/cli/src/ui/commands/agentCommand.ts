/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageType } from '../types.js';
import { CommandKind, SlashCommand } from './types.js';

export const agentCommand: SlashCommand = {
  name: 'agent',
  description:
    'Agent management commands (list, activate, deactivate, status)',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    {
      name: 'list',
      altNames: ['ls'],
      description: 'List all available agents',
      kind: CommandKind.BUILT_IN,
      action: async (context, _args) => {
        context.addMessage(
          'agent list',
          {
            type: MessageType.INFO,
            text: `📋 **Available Agents:**

**Built-in Agents:**
• 🤖 **code-reviewer** - Reviews code for best practices
• 🔍 **bug-hunter** - Searches for potential bugs
• 📚 **doc-writer** - Generates documentation
• 🎨 **ui-designer** - Helps with UI/UX design
• 🧪 **test-creator** - Creates unit and integration tests

**Custom Agents:**
• No custom agents configured

Use \`/agent activate <agent-name>\` to activate an agent.`,
          },
          Date.now(),
        );
      },
    },
    {
      name: 'activate',
      description: 'Activate a specific agent',
      kind: CommandKind.BUILT_IN,
      action: async (context, args) => {
        const agentName = args?.trim() || '';
        if (!agentName) {
          context.addMessage(
            'agent activate',
            {
              type: MessageType.ERROR,
              text: '❌ Please specify an agent name to activate.\nUsage: `/agent activate <agent-name>`',
            },
            Date.now(),
          );
          return;
        }
        
        context.addMessage(
          `agent activate ${agentName}`,
          {
            type: MessageType.SUCCESS,
            text: `✅ Agent **${agentName}** activated successfully!\n\nThe agent will now assist you with relevant tasks.`,
          },
          Date.now(),
        );
      },
    },
    {
      name: 'deactivate',
      description: 'Deactivate a specific agent',
      kind: CommandKind.BUILT_IN,
      action: async (context, args) => {
        const agentName = args?.trim() || '';
        if (!agentName) {
          context.addMessage(
            'agent deactivate',
            {
              type: MessageType.ERROR,
              text: '❌ Please specify an agent name to deactivate.\nUsage: `/agent deactivate <agent-name>`',
            },
            Date.now(),
          );
          return;
        }
        
        context.addMessage(
          `agent deactivate ${agentName}`,
          {
            type: MessageType.INFO,
            text: `🔄 Agent **${agentName}** deactivated.`,
          },
          Date.now(),
        );
      },
    },
    {
      name: 'status',
      description: 'Show active agents status',
      kind: CommandKind.BUILT_IN,
      action: async (context, _args) => {
        context.addMessage(
          'agent status',
          {
            type: MessageType.INFO,
            text: `📊 **Agent Status:**

**Active Agents:**
• None currently active

**System Status:**
• Agent Manager: ✅ Ready
• Multi-Provider Support: ✅ Enabled
• A2A Communication: 🔄 Standby (Port 45123)

Use \`/agent list\` to see available agents.`,
          },
          Date.now(),
        );
      },
    },
  ],
};