/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageType } from '../types.js';
import { CommandKind, type SlashCommand } from './types.js';

// Dynamic imports for agent services
let AgentSelectorService: any;
let AgentManager: any;

// Get AgentSelectorService instance
async function getAgentSelectorService() {
  if (!AgentSelectorService) {
    try {
      const module = await import('@ouroboros/ouroboros-code-core/dist/src/agents/agentSelectorService.js');
      AgentSelectorService = module.AgentSelectorService;
    } catch (error) {
      console.warn('AgentSelectorService not available:', error);
      return null;
    }
  }
  return AgentSelectorService ? AgentSelectorService.getInstance() : null;
}

async function getAgentManager() {
  if (!AgentManager) {
    try {
      const module = await import('@ouroboros/ouroboros-code-core/dist/src/agents/agentManager.js');
      AgentManager = module.AgentManager;
    } catch (error) {
      console.warn('AgentManager not available:', error);
      return null;
    }
  }
  return AgentManager ? AgentManager.getInstance() : null;
}

export const agentsCommand: SlashCommand = {
  name: 'agents',
  description: 'Automatic agent selection - AI chooses the best specialist for each prompt',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    {
      name: 'on',
      altNames: ['enable', 'start'],
      description: 'Enable automatic agent selection for all prompts',
      kind: CommandKind.BUILT_IN,
      action: async (context, args) => {
        const selectorService = await getAgentSelectorService();
        
        if (!selectorService) {
          context.ui.addItem({
            type: MessageType.ERROR,
            text: `❌ **Agent Selector Service Unavailable**

The automatic agent selection service is not available. This could be due to:
• Missing OpenAI API key configuration
• Service initialization failure
• Build or import issues

Please check your OpenAI API key configuration and try again.`,
          }, Date.now());
          return;
        }

        // Enable automatic mode
        selectorService.setAutoMode(true);

        context.ui.addItem({
          type: MessageType.INFO,
          text: `🤖 **Automatic Agent Selection ENABLED**

🎯 **How it works:**
• Every prompt will be analyzed by GPT-5-nano
• The most appropriate specialist(s) will be automatically selected
• Agents are temporarily activated for each conversation turn
• You'll see which agents were selected and why

🔧 **Features:**
• ⚡ Fast selection using GPT-5-nano (2-3 second overhead)
• 🧠 Intelligent fallbacks if selection fails
• 📊 Selection history and analytics
• 🔄 Seamless context preservation between turns
• 🎯 1-3 agents selected per prompt for optimal focus

**Try it now:** Send any prompt and watch the AI automatically select the best specialists!

**Commands:**
• \`/agents off\` - Disable automatic selection
• \`/agents status\` - Check current mode and statistics
• \`/agents history\` - View recent agent selections
• \`/agents test "your prompt"\` - Test agent selection without execution`,
        }, Date.now());
      },
    },
    {
      name: 'off',
      altNames: ['disable', 'stop'],
      description: 'Disable automatic agent selection',
      kind: CommandKind.BUILT_IN,
      action: async (context, _args) => {
        const selectorService = await getAgentSelectorService();
        
        if (!selectorService) {
          context.ui.addItem({
            type: MessageType.ERROR,
            text: '❌ Agent selector service is not available.',
          }, Date.now());
          return;
        }

        // Disable automatic mode
        selectorService.setAutoMode(false);

        context.ui.addItem({
          type: MessageType.INFO,
          text: `🔄 **Automatic Agent Selection DISABLED**

The system will now operate in manual mode:
• No automatic agent selection for new prompts
• Previously active agents remain active
• You can still use \`/agent\` commands for manual control

**To re-enable:** Use \`/agents on\`
**Manual control:** Use \`/agent activate <agent-id>\` for specific agents`,
        }, Date.now());
      },
    },
    {
      name: 'status',
      altNames: ['info'],
      description: 'Show automatic agent selection status and statistics',
      kind: CommandKind.BUILT_IN,
      action: async (context, _args) => {
        const selectorService = await getAgentSelectorService();
        const agentManager = await getAgentManager();
        
        if (!selectorService) {
          context.ui.addItem({
            type: MessageType.ERROR,
            text: '❌ Agent selector service is not available.',
          }, Date.now());
          return;
        }

        const isAutoEnabled = selectorService.isAutoModeEnabled();
        const stats = selectorService.getSelectionStats();
        const currentlyActive = agentManager?.getActiveAgents() || [];

        let statusText = `📊 **Automatic Agent Selection Status**

**Mode:** ${isAutoEnabled ? '🟢 ENABLED' : '🔴 DISABLED'}
**Service:** ${selectorService ? '✅ Available' : '❌ Unavailable'}

`;

        if (currentlyActive.length > 0) {
          statusText += `**Currently Active Agents (${currentlyActive.length}):**
${currentlyActive.map((a: any) => `• ${a.emoji} ${a.name} (${a.id})`).join('\n')}

`;
        }

        if (stats.totalSelections > 0) {
          statusText += `**Selection Statistics:**
• Total automatic selections: ${stats.totalSelections}
• Average agents per selection: ${stats.averageAgentsPerSelection.toFixed(1)}
• Most selected agents:
${stats.mostSelectedAgents.slice(0, 5).map((s: any) => `  • ${s.agentId}: ${s.count} times`).join('\n')}

`;
        }

        statusText += `**Commands:**
• \`/agents on\` - Enable automatic selection
• \`/agents off\` - Disable automatic selection  
• \`/agents history\` - View selection history
• \`/agents test "prompt"\` - Test selection logic`;

        context.ui.addItem({
          type: MessageType.INFO,
          text: statusText,
        }, Date.now());
      },
    },
    {
      name: 'history',
      altNames: ['log'],
      description: 'Show recent automatic agent selections',
      kind: CommandKind.BUILT_IN,
      action: async (context, args) => {
        const selectorService = await getAgentSelectorService();
        
        if (!selectorService) {
          context.ui.addItem({
            type: MessageType.ERROR,
            text: '❌ Agent selector service is not available.',
          }, Date.now());
          return;
        }

        const limit = args?.trim() ? parseInt(args.trim()) : 10;
        const history = selectorService.getSelectionHistory(limit);

        if (history.length === 0) {
          context.ui.addItem({
            type: MessageType.INFO,
            text: `📜 **Agent Selection History**

No automatic selections recorded yet.

Enable automatic selection with \`/agents on\` and start sending prompts to see the AI select appropriate specialists for your tasks.`,
          }, Date.now());
          return;
        }

        const historyText = history
          .reverse() // Show most recent first
          .map((entry: any, index: number) => {
            const timeAgo = new Date(Date.now() - (Date.now() - entry.timestamp)).toLocaleTimeString();
            return `**${index + 1}. ${timeAgo}**
**Prompt:** "${entry.prompt}"
**Selected:** ${entry.selectedAgents.join(', ')}
**Reasoning:** ${entry.reasoning}
`;
          }).join('\n');

        context.ui.addItem({
          type: MessageType.INFO,
          text: `📜 **Agent Selection History (Last ${history.length})**

${historyText}

**Note:** History shows the most recent ${limit} automatic agent selections.
Use \`/agents history <number>\` to see more entries.`,
        }, Date.now());
      },
    },
    {
      name: 'test',
      altNames: ['analyze', 'preview'],
      description: 'Test automatic agent selection without execution',
      kind: CommandKind.BUILT_IN,
      action: async (context, args) => {
        const testPrompt = args?.trim();
        
        if (!testPrompt) {
          context.ui.addItem({
            type: MessageType.ERROR,
            text: `❌ **Test Prompt Required**

Please provide a prompt to test agent selection.

**Usage:** \`/agents test "your prompt here"\`

**Examples:**
• \`/agents test "Optimize my React component performance"\`
• \`/agents test "Design a REST API for user management"\`  
• \`/agents test "My database queries are too slow"\`
• \`/agents test "Review this Python code for security issues"\``,
          }, Date.now());
          return;
        }

        const selectorService = await getAgentSelectorService();
        
        if (!selectorService) {
          context.ui.addItem({
            type: MessageType.ERROR,
            text: '❌ Agent selector service is not available.',
          }, Date.now());
          return;
        }

        // Test agent selection without actually activating agents
        context.ui.addItem({
          type: MessageType.INFO,
          text: `🔍 **Testing Agent Selection...**

**Prompt:** "${testPrompt}"

Analyzing with GPT-5-nano... This may take a few seconds.`,
        }, Date.now());

        try {
          const result = await selectorService.analyzeAndSelectAgents(testPrompt);
          
          const selectedAgentsList = result.selectedAgents
            .map((agent: any) => `• ${agent.emoji} **${agent.name}** (${agent.id}) - ${agent.description}`)
            .join('\n');

          context.ui.addItem({
            type: MessageType.INFO,
            text: `🎯 **Agent Selection Results**

**Selected Agents (${result.selectedAgents.length}):**
${selectedAgentsList}

**AI Reasoning:**
${result.reasoning}

**Selection Details:**
• Confidence: ${(result.confidence * 100).toFixed(0)}%
• Processing Time: ${result.processingTime}ms
• Model: GPT-5-nano

**Note:** This was a test run. No agents were actually activated.
Enable automatic mode with \`/agents on\` to use this for real prompts.`,
          }, Date.now());

        } catch (error) {
          context.ui.addItem({
            type: MessageType.ERROR,
            text: `❌ **Agent Selection Test Failed**

Error: ${error instanceof Error ? error.message : 'Unknown error'}

This could be due to:
• OpenAI API issues or rate limits
• Network connectivity problems  
• Invalid API key or insufficient credits

Please check your OpenAI configuration and try again.`,
          }, Date.now());
        }
      },
    },
    {
      name: 'stats',
      altNames: ['analytics'],
      description: 'Show detailed agent selection analytics',
      kind: CommandKind.BUILT_IN,
      action: async (context, _args) => {
        const selectorService = await getAgentSelectorService();
        
        if (!selectorService) {
          context.ui.addItem({
            type: MessageType.ERROR,
            text: '❌ Agent selector service is not available.',
          }, Date.now());
          return;
        }

        const stats = selectorService.getSelectionStats();
        const history = selectorService.getSelectionHistory(50);

        if (stats.totalSelections === 0) {
          context.ui.addItem({
            type: MessageType.INFO,
            text: `📊 **Agent Selection Analytics**

No data available yet. Enable automatic selection with \`/agents on\` and start sending prompts to generate analytics.`,
          }, Date.now());
          return;
        }

        // Calculate additional analytics
        const recentSelections = history.slice(-10);

        const topAgents = stats.mostSelectedAgents
          .slice(0, 8)
          .map((s: any, i: number) => `${i + 1}. **${s.agentId}**: ${s.count} times`)
          .join('\n');

        context.ui.addItem({
          type: MessageType.INFO,
          text: `📊 **Detailed Agent Selection Analytics**

**Overall Statistics:**
• Total automatic selections: ${stats.totalSelections}
• Average agents per selection: ${stats.averageAgentsPerSelection.toFixed(1)}
• Average confidence: ${(stats.averageConfidence * 100).toFixed(0)}%

**Most Selected Agents:**
${topAgents}

**Recent Patterns (Last 10 selections):**
${recentSelections.map((s: any) => `• ${s.selectedAgents.join(', ')}`).join('\n')}

**Performance Insights:**
• Single agent selections: ${history.filter((h: any) => h.selectedAgents.length === 1).length}
• Multi-agent selections: ${history.filter((h: any) => h.selectedAgents.length > 1).length}
• Average selection time: ~2-3 seconds (GPT-5-nano)

This data helps optimize the agent selection system and understand usage patterns.`,
        }, Date.now());
      },
    },
  ],
};