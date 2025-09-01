/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageType } from '../types.js';
import { CommandKind, type SlashCommand } from './types.js';
import { 
  AGENT_PERSONAS, 
  AGENT_CATEGORIES,
  getAgentById,
  getAgentsByCategory,
  type AgentPersona
} from '@ouroboros/ouroboros-code-core';

// Import AgentManager for actual agent management
let AgentManager: any;
try {
  AgentManager = require('@ouroboros/ouroboros-code-core/dist/src/agents/agentManager.js').AgentManager;
} catch (error) {
  console.warn('AgentManager not available:', error);
}

// Get AgentManager instance
function getAgentManager() {
  return AgentManager ? AgentManager.getInstance() : null;
}

// Format agent list for display
function formatAgentList(agents: AgentPersona[]): string {
  const agentManager = getAgentManager();
  const grouped = agents.reduce((acc, agent) => {
    if (!acc[agent.category]) {
      acc[agent.category] = [];
    }
    acc[agent.category].push(agent);
    return acc;
  }, {} as Record<string, AgentPersona[]>);

  let output = '';
  for (const [category, categoryAgents] of Object.entries(grouped)) {
    output += `\n**${category}:**\n`;
    for (const agent of categoryAgents) {
      const active = agentManager?.isAgentActive(agent.id) ? ' ✅' : '';
      output += `• ${agent.emoji} **${agent.id}**${active} - ${agent.description}\n`;
    }
  }
  return output;
}

// Format detailed agent info
function formatAgentDetails(agent: AgentPersona): string {
  const agentManager = getAgentManager();
  const active = agentManager?.isAgentActive(agent.id) ? '✅ Active' : '⭕ Inactive';
  return `${agent.emoji} **${agent.name}** (${agent.id})
${active}

**Category:** ${agent.category}
**Description:** ${agent.description}

**Specialties:**
${agent.specialties.map(s => `• ${s}`).join('\n')}

**Temperature:** ${agent.temperature || 0.7}

${agent.suggestedTools ? `**Suggested Tools:** ${agent.suggestedTools.join(', ')}\n` : ''}
Use \`/agent activate ${agent.id}\` to activate this agent.`;
}

export const agentCommand: SlashCommand = {
  name: 'agent',
  description:
    'Agent management commands (list, activate, deactivate, status, info)',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    {
      name: 'list',
      altNames: ['ls'],
      description: 'List all available agents',
      kind: CommandKind.BUILT_IN,
      action: async (context, args) => {
        const category = args?.trim();
        
        if (category) {
          // List agents in specific category
          const categoryAgents = getAgentsByCategory(category);
          if (categoryAgents.length === 0) {
            context.ui.addItem(
              {
                type: MessageType.ERROR,
                text: `❌ No agents found in category: ${category}\n\nAvailable categories:\n${Object.values(AGENT_CATEGORIES).map(c => `• ${c}`).join('\n')}`,
              },
              Date.now(),
            );
            return;
          }
          
          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: `📋 **Agents in ${category}:**\n${formatAgentList(categoryAgents)}`,
            },
            Date.now(),
          );
        } else {
          // List all agents
          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: `📋 **Available Specialist Agents (${AGENT_PERSONAS.length} total):**
${formatAgentList(AGENT_PERSONAS)}

**Usage:**
• \`/agent info <agent-id>\` - Get detailed info about an agent
• \`/agent activate <agent-id>\` - Activate an agent
• \`/agent list <category>\` - List agents in specific category

**Categories:**
${Object.values(AGENT_CATEGORIES).map(c => `• ${c}`).join('\n')}`,
            },
            Date.now(),
          );
        }
      },
    },
    {
      name: 'info',
      altNames: ['show', 'describe'],
      description: 'Show detailed information about a specific agent',
      kind: CommandKind.BUILT_IN,
      action: async (context, args) => {
        const agentId = args?.trim();
        if (!agentId) {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: '❌ Please specify an agent ID.\nUsage: `/agent info <agent-id>`\n\nUse `/agent list` to see available agents.',
            },
            Date.now(),
          );
          return;
        }
        
        const agent = getAgentById(agentId);
        if (!agent) {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `❌ Agent not found: ${agentId}\n\nUse \`/agent list\` to see available agents.`,
            },
            Date.now(),
          );
          return;
        }
        
        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: formatAgentDetails(agent),
          },
          Date.now(),
        );
      },
    },
    {
      name: 'activate',
      altNames: ['enable', 'on'],
      description: 'Activate a specific agent',
      kind: CommandKind.BUILT_IN,
      action: async (context, args) => {
        const agentId = args?.trim();
        if (!agentId) {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: '❌ Please specify an agent ID to activate.\nUsage: `/agent activate <agent-id>`',
            },
            Date.now(),
          );
          return;
        }
        
        const agent = getAgentById(agentId);
        if (!agent) {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `❌ Agent not found: ${agentId}\n\nUse \`/agent list\` to see available agents.`,
            },
            Date.now(),
          );
          return;
        }
        
        const agentManager = getAgentManager();
        if (!agentManager) {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `❌ Agent manager not available. Agent activation requires proper system integration.`,
            },
            Date.now(),
          );
          return;
        }

        const result = await agentManager.activateAgent(agentId);
        
        if (result.success) {
          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: `✅ **${result.agent!.name}** activated!

${result.agent!.emoji} The ${result.agent!.name} is now assisting you with:
${result.agent!.specialties.slice(0, 3).map((s: string) => `• ${s}`).join('\n')}

The agent's expertise has been integrated into the system prompt and will affect all subsequent interactions.`,
            },
            Date.now(),
          );
        } else {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `❌ ${result.message}`,
            },
            Date.now(),
          );
        }
      },
    },
    {
      name: 'deactivate',
      altNames: ['disable', 'off'],
      description: 'Deactivate a specific agent',
      kind: CommandKind.BUILT_IN,
      action: async (context, args) => {
        const agentId = args?.trim();
        if (!agentId) {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: '❌ Please specify an agent ID to deactivate.\nUsage: `/agent deactivate <agent-id>`',
            },
            Date.now(),
          );
          return;
        }
        
        const agent = getAgentById(agentId);
        if (!agent) {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `❌ Agent not found: ${agentId}`,
            },
            Date.now(),
          );
          return;
        }
        
        const agentManager = getAgentManager();
        if (!agentManager) {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `❌ Agent manager not available.`,
            },
            Date.now(),
          );
          return;
        }

        const result = await agentManager.deactivateAgent(agentId);
        
        if (result.success) {
          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: `🔄 **${result.agent!.name}** deactivated.\n\nThe agent's expertise has been removed from the system prompt.`,
            },
            Date.now(),
          );
        } else {
          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: `ℹ️ ${result.message}`,
            },
            Date.now(),
          );
        }
      },
    },
    {
      name: 'status',
      altNames: ['active'],
      description: 'Show active agents status',
      kind: CommandKind.BUILT_IN,
      action: async (context, _args) => {
        const agentManager = getAgentManager();
        const activeAgentsList = agentManager?.getActiveAgents() || [];
        
        if (activeAgentsList.length === 0) {
          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: `📊 **Agent Status:**

**Active Agents:** None

**System Status:**
• Agent Manager: ${agentManager ? '✅ Ready' : '❌ Not Available'}
• Available Agents: ${AGENT_PERSONAS.length}
• Categories: ${Object.keys(AGENT_CATEGORIES).length}

Use \`/agent activate <agent-id>\` to activate an agent.
Use \`/agent list\` to see all available agents.`,
            },
            Date.now(),
          );
        } else {
          const agentInfo = activeAgentsList
            .map((a: AgentPersona) => `• ${a.emoji} **${a.name}** (${a.id}) - ${a.category}`)
            .join('\n');
          
          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: `📊 **Agent Status:**

**Active Agents (${activeAgentsList.length}):**
${agentInfo}

**Combined Expertise:**
${(() => {
  const combinedSpecialties: string[] = Array.from(new Set(activeAgentsList.flatMap((a: AgentPersona) => a.specialties.slice(0, 2))));
  return combinedSpecialties.slice(0, 10).map((s: string) => `• ${s}`).join('\n');
})()}

Use \`/agent deactivate <agent-id>\` to deactivate an agent.`,
            },
            Date.now(),
          );
        }
      },
    },
    {
      name: 'search',
      description: 'Search agents by specialty or keyword',
      kind: CommandKind.BUILT_IN,
      action: async (context, args) => {
        const searchTerm = args?.trim();
        if (!searchTerm) {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: '❌ Please specify a search term.\nUsage: `/agent search <keyword>`',
            },
            Date.now(),
          );
          return;
        }
        
        const searchLower = searchTerm.toLowerCase();
        const matches = AGENT_PERSONAS.filter(agent => 
          agent.id.includes(searchLower) ||
          agent.name.toLowerCase().includes(searchLower) ||
          agent.description.toLowerCase().includes(searchLower) ||
          agent.specialties.some(s => s.toLowerCase().includes(searchLower))
        );
        
        if (matches.length === 0) {
          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: `🔍 No agents found matching "${searchTerm}".\n\nTry searching for technologies, skills, or domains.`,
            },
            Date.now(),
          );
          return;
        }
        
        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: `🔍 **Agents matching "${searchTerm}" (${matches.length} found):**\n${formatAgentList(matches)}`,
          },
          Date.now(),
        );
      },
    },
    {
      name: 'recommend',
      altNames: ['suggest'],
      description: 'Get agent recommendations for a task',
      kind: CommandKind.BUILT_IN,
      action: async (context, args) => {
        const task = args?.trim();
        if (!task) {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: '❌ Please describe your task.\nUsage: `/agent recommend <task description>`\n\nExample: `/agent recommend optimize database queries`',
            },
            Date.now(),
          );
          return;
        }
        
        // Simple keyword-based recommendation
        const taskLower = task.toLowerCase();
        const recommendations: AgentPersona[] = [];
        
        // Check for keywords and recommend agents
        if (taskLower.includes('database') || taskLower.includes('query') || taskLower.includes('sql')) {
          const dbOptimizer = getAgentById('database-optimizer');
          const dbArchitect = getAgentById('database-architect');
          if (dbOptimizer) recommendations.push(dbOptimizer);
          if (dbArchitect) recommendations.push(dbArchitect);
        }
        
        if (taskLower.includes('api') || taskLower.includes('rest') || taskLower.includes('graphql')) {
          const apiDesigner = getAgentById('api-designer');
          if (apiDesigner) recommendations.push(apiDesigner);
        }
        
        if (taskLower.includes('performance') || taskLower.includes('optimize') || taskLower.includes('slow')) {
          const perfEngineer = getAgentById('performance-engineer');
          if (perfEngineer) recommendations.push(perfEngineer);
        }
        
        if (taskLower.includes('security') || taskLower.includes('vulnerability') || taskLower.includes('audit')) {
          const secAuditor = getAgentById('security-auditor');
          if (secAuditor) recommendations.push(secAuditor);
        }
        
        if (taskLower.includes('react') || taskLower.includes('frontend') || taskLower.includes('ui')) {
          const reactSpec = getAgentById('react-specialist');
          if (reactSpec) recommendations.push(reactSpec);
        }
        
        if (taskLower.includes('kubernetes') || taskLower.includes('k8s') || taskLower.includes('container')) {
          const k8sOp = getAgentById('kubernetes-operator');
          if (k8sOp) recommendations.push(k8sOp);
        }
        
        if (taskLower.includes('machine learning') || taskLower.includes('ml') || taskLower.includes('ai')) {
          const mlEng = getAgentById('ml-engineer');
          const llmExpert = getAgentById('llm-integration-expert');
          if (mlEng) recommendations.push(mlEng);
          if (llmExpert) recommendations.push(llmExpert);
        }
        
        if (recommendations.length === 0) {
          // Fallback to general recommendations
          const sysArch = getAgentById('systems-architect');
          const codeReviewer = getAgentById('code-quality-analyst');
          if (sysArch) recommendations.push(sysArch);
          if (codeReviewer) recommendations.push(codeReviewer);
        }
        
        const recText = recommendations
          .slice(0, 5)
          .map(a => `• ${a.emoji} **${a.id}** - ${a.description}\n  Specialties: ${a.specialties.slice(0, 3).join(', ')}`)
          .join('\n\n');
        
        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: `🎯 **Recommended Agents for: "${task}"**

${recText}

**To activate an agent:**
\`/agent activate <agent-id>\`

**To see more details:**
\`/agent info <agent-id>\``,
          },
          Date.now(),
        );
      },
    },
  ],
};