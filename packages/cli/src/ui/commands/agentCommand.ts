/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageType } from '../types.js';
import { CommandKind, SlashCommand } from './types.js';

export const agentCommand: SlashCommand = {
  name: 'agent',
  description: 'Agent management commands (list, activate, deactivate, status, browse)',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    {
      name: 'list',
      altNames: ['ls'],
      description: 'List all available agents',
      kind: CommandKind.BUILT_IN,
      action: async (context, args) => {
        try {
          const { getAgentManager } = await import('../../agents/integration/index.js');
          const agentManager = getAgentManager();
          await agentManager.initialize();

          // Parse simple flags
          const argParts = args?.trim().split(/\s+/) || [];
          const hasVerbose = argParts.includes('-v') || argParts.includes('--verbose');
          const categoryIndex = argParts.findIndex(arg => arg === '-c' || arg === '--category');
          const category = categoryIndex >= 0 && categoryIndex + 1 < argParts.length 
            ? argParts[categoryIndex + 1] as 'built-in' | 'custom' | 'all' 
            : 'all';
          const searchIndex = argParts.findIndex(arg => arg === '-s' || arg === '--search');
          const search = searchIndex >= 0 && searchIndex + 1 < argParts.length 
            ? argParts[searchIndex + 1] 
            : undefined;

          let agents;
          if (search) {
            agents = await agentManager.searchAgents(search);
          } else if (category === 'all') {
            agents = await agentManager.listAgents();
          } else {
            agents = await agentManager.getAgentsByCategory(category);
          }

          if (agents.length === 0) {
            const message = search 
              ? `🔍 No agents found matching '${search}'`
              : '📦 No agents available';
            
            context.ui.addItem({
              type: MessageType.INFO,
              text: message
            }, Date.now());
            return;
          }

          // Display results
          const builtInAgents = agents.filter(agent => agent.category === 'built-in');
          const customAgents = agents.filter(agent => agent.category === 'custom');
          const activeAgent = agents.find(agent => agent.isActive);

          let output = '╔══════════════════════════════════════════════════════════════════════════════╗\n';
          output += '║                           🤖 OUROBOROS AGENT REGISTRY                        ║\n';
          output += '╟──────────────────────────────────────────────────────────────────────────────╢\n';
          output += '║                                                                              ║\n';

          // Currently active agent
          if (activeAgent) {
            output += `║  📍 CURRENTLY ACTIVE: ${activeAgent.name.padEnd(49)} ║\n`;
            output += `║      ${activeAgent.description.substring(0, 60).padEnd(60)} ║\n`;
          } else {
            output += '║  📍 NO AGENT CURRENTLY ACTIVE                                                ║\n';
          }
          output += '║                                                                              ║\n';

          // Built-in agents
          if (builtInAgents.length > 0) {
            output += '╟──────────────────────────────────────────────────────────────────────────────╢\n';
            output += '║  🏭 BUILT-IN AGENTS                                                         ║\n';
            output += '╟──────────────────────────────────────────────────────────────────────────────╢\n';

            for (const agent of builtInAgents) {
              const activeIndicator = agent.isActive ? ' [ACTIVE]' : '';
              const emoji = getAgentEmoji(agent);
              
              output += '║                                                                              ║\n';
              output += `║  ┌─ ${emoji} ${agent.name}${activeIndicator}`.padEnd(79) + '┐ ║\n';
              
              if (hasVerbose) {
                output += `║  │  ID: ${agent.id.padEnd(60)} │ ║\n`;
                output += `║  │  Version: ${agent.version.padEnd(55)} │ ║\n`;
                output += `║  │  Author: ${agent.author.padEnd(56)} │ ║\n`;
                output += `║  │  Description: ${agent.description.substring(0, 51).padEnd(51)} │ ║\n`;
                output += `║  │  Tools: ${agent.toolCount} available`.padEnd(62) + '│ ║\n';
                
                if (agent.specialBehaviors.length > 0) {
                  const behaviors = agent.specialBehaviors.slice(0, 3).join(', ');
                  output += `║  │  Specialties: ${behaviors.substring(0, 49).padEnd(49)} │ ║\n`;
                }
                
                if (agent.lastUsed) {
                  const lastUsed = new Date(agent.lastUsed).toLocaleDateString();
                  output += `║  │  Last used: ${lastUsed.padEnd(53)} │ ║\n`;
                }
                
                const effectiveness = Math.round(agent.effectiveness * 100);
                output += `║  │  Effectiveness: ${effectiveness}%`.padEnd(62) + '│ ║\n';
              } else {
                // Compact display
                output += `║  │  ${agent.description.substring(0, 60).padEnd(60)} │ ║\n`;
                output += `║  │  Tools: ${agent.toolCount} • Specialties: ${agent.specialBehaviors.length}`.padEnd(62) + '│ ║\n';
              }
              
              output += `║  └${'─'.repeat(67)}┘ ║\n`;
            }
          }

          // Custom agents
          if (customAgents.length > 0) {
            output += '╟──────────────────────────────────────────────────────────────────────────────╢\n';
            output += `║  👤 CUSTOM AGENTS (${customAgents.length})                                                       ║\n`;
            output += '╟──────────────────────────────────────────────────────────────────────────────╢\n';

            for (const agent of customAgents) {
              const activeIndicator = agent.isActive ? ' [ACTIVE]' : '';
              const emoji = getAgentEmoji(agent);
              
              output += '║                                                                              ║\n';
              output += `║  ┌─ ${emoji} ${agent.name}${activeIndicator}`.padEnd(79) + '┐ ║\n';
              
              if (hasVerbose) {
                output += `║  │  ID: ${agent.id.padEnd(60)} │ ║\n`;
                output += `║  │  Version: ${agent.version.padEnd(55)} │ ║\n`;
                output += `║  │  Author: ${agent.author.padEnd(56)} │ ║\n`;
                output += `║  │  Description: ${agent.description.substring(0, 51).padEnd(51)} │ ║\n`;
                output += `║  │  Tools: ${agent.toolCount} available`.padEnd(62) + '│ ║\n';
                
                if (agent.specialBehaviors.length > 0) {
                  const behaviors = agent.specialBehaviors.slice(0, 3).join(', ');
                  output += `║  │  Specialties: ${behaviors.substring(0, 49).padEnd(49)} │ ║\n`;
                }
                
                if (agent.lastUsed) {
                  const lastUsed = new Date(agent.lastUsed).toLocaleDateString();
                  output += `║  │  Last used: ${lastUsed.padEnd(53)} │ ║\n`;
                }
                
                const effectiveness = Math.round(agent.effectiveness * 100);
                output += `║  │  Effectiveness: ${effectiveness}%`.padEnd(62) + '│ ║\n';
              } else {
                // Compact display
                output += `║  │  ${agent.description.substring(0, 60).padEnd(60)} │ ║\n`;
                output += `║  │  Tools: ${agent.toolCount} • Specialties: ${agent.specialBehaviors.length}`.padEnd(62) + '│ ║\n';
              }
              
              output += `║  └${'─'.repeat(67)}┘ ║\n`;
            }
          }

          output += '╚══════════════════════════════════════════════════════════════════════════════╝\n';

          // Usage hints
          if (!hasVerbose) {
            output += '\n💡 Use /agent list --verbose for detailed information\n';
          }
          output += '💡 Use /agent activate <agent-id> to switch agents';

          context.ui.addItem({
            type: MessageType.INFO,
            text: output
          }, Date.now());

        } catch (error) {
          context.ui.addItem({
            type: MessageType.ERROR,
            text: `❌ Failed to list agents: ${error}`
          }, Date.now());
        }
      }
    },
    {
      name: 'activate',
      description: 'Activate an agent by ID',
      kind: CommandKind.BUILT_IN,
      action: async (context, args) => {
        try {
          const { getAgentManager } = await import('../../agents/integration/index.js');
          const agentManager = getAgentManager();
          await agentManager.initialize();

          const agentId = args?.trim();
          if (!agentId) {
            // Show interactive selection
            const agents = await agentManager.listAgents();
            const currentAgent = await agentManager.getActiveAgent();

            let output = '╔══════════════════════════════════════════════════════════════════════════════╗\n';
            output += '║                         🔄 AGENT ACTIVATION SELECTOR                         ║\n';
            output += '╟──────────────────────────────────────────────────────────────────────────────╢\n';
            output += '║                                                                              ║\n';

            if (currentAgent) {
              output += `║  📍 Currently Active: ${currentAgent.name.padEnd(47)} ║\n`;
              output += '║                                                                              ║\n';
            }

            output += '║  Select an agent to activate:                                               ║\n';
            output += '║                                                                              ║\n';

            // Built-in agents
            const builtInAgents = agents.filter(agent => agent.category === 'built-in');
            if (builtInAgents.length > 0) {
              output += '║  🏭 BUILT-IN AGENTS                                                         ║\n';
              output += '║                                                                              ║\n';
              
              builtInAgents.forEach((agent, index) => {
                const activeIndicator = agent.isActive ? ' [CURRENTLY ACTIVE]' : '';
                const prefix = agent.isActive ? '▶' : ` ${index + 1}.`;
                const emoji = getAgentEmoji(agent);
                output += `║  ${prefix} ${emoji} ${agent.name}${activeIndicator}`.padEnd(78) + '║\n';
              });
              output += '║                                                                              ║\n';
            }

            // Custom agents
            const customAgents = agents.filter(agent => agent.category === 'custom');
            if (customAgents.length > 0) {
              output += '║  👤 CUSTOM AGENTS                                                           ║\n';
              output += '║                                                                              ║\n';
              
              customAgents.forEach((agent, index) => {
                const activeIndicator = agent.isActive ? ' [CURRENTLY ACTIVE]' : '';
                const prefix = agent.isActive ? '▶' : ` ${builtInAgents.length + index + 1}.`;
                const emoji = getAgentEmoji(agent);
                output += `║  ${prefix} ${emoji} ${agent.name}${activeIndicator}`.padEnd(78) + '║\n';
              });
              output += '║                                                                              ║\n';
            }

            output += '╟──────────────────────────────────────────────────────────────────────────────╢\n';
            output += '║  💡 ACTIVATION COMMANDS:                                                      ║\n';
            
            agents.forEach((agent) => {
              if (!agent.isActive) {
                output += `║     /agent activate ${agent.id}`.padEnd(78) + '║\n';
              }
            });

            output += '║                                                                              ║\n';
            output += '║  📋 Use "/agent list -v" for detailed agent information                      ║\n';
            output += '╚══════════════════════════════════════════════════════════════════════════════╝';

            context.ui.addItem({
              type: MessageType.INFO,
              text: output
            }, Date.now());
            return;
          }

          // Activate specific agent
          const agent = await agentManager.getAgent(agentId);
          if (!agent) {
            // Show available agents as suggestion
            const agents = await agentManager.listAgents();
            let errorMsg = `❌ Agent with ID '${agentId}' not found\n\n💡 Available agents:\n`;
            agents.forEach((agent) => {
              const activeIndicator = agent.isActive ? ' (currently active)' : '';
              errorMsg += `   • ${agent.id} - ${agent.name}${activeIndicator}\n`;
            });
            
            context.ui.addItem({
              type: MessageType.ERROR,
              text: errorMsg
            }, Date.now());
            return;
          }

          // Check if already active
          const currentAgent = await agentManager.getActiveAgent();
          if (currentAgent?.id === agentId) {
            context.ui.addItem({
              type: MessageType.INFO,
              text: `⚠️  Agent '${agent.name}' is already active`
            }, Date.now());
            return;
          }

          // Activate the agent
          let output = `🔄 Activating agent: ${agent.name}\n`;
          output += `   Description: ${agent.description}\n`;
          output += `   Version: ${agent.version}\n`;
          output += `   Tools: ${agent.toolConfiguration.enabledTools.length} available\n\n`;

          await agentManager.activateAgent(agentId);

          output += `✅ Successfully activated: ${agent.name}\n`;
          output += `🎯 Agent is now ready to assist you with specialized capabilities\n\n`;

          // Show agent-specific usage hints
          output += showAgentUsageHints(agent);

          context.ui.addItem({
            type: MessageType.INFO,
            text: output
          }, Date.now());

        } catch (error) {
          context.ui.addItem({
            type: MessageType.ERROR,
            text: `❌ Failed to activate agent: ${error}`
          }, Date.now());
        }
      }
    },
    {
      name: 'status',
      description: 'Show current agent status and system information',
      kind: CommandKind.BUILT_IN,
      action: async (context) => {
        try {
          const { getAgentManager } = await import('../../agents/integration/index.js');
          const agentManager = getAgentManager();
          await agentManager.initialize();

          const status = await agentManager.getSystemStatus();

          let output = '╔══════════════════════════════════════════════════════════════════════════════╗\n';
          output += '║                           🤖 AGENT SYSTEM STATUS                             ║\n';
          output += '╟──────────────────────────────────────────────────────────────────────────────╢\n';
          output += '║                                                                              ║\n';

          // System status
          const statusIcon = status.initialized ? '✅' : '❌';
          output += `║  System Status: ${statusIcon} ${status.initialized ? 'Initialized' : 'Not Initialized'}`.padEnd(78) + '║\n';
          output += `║  Registry Version: ${status.registryVersion}`.padEnd(78) + '║\n';
          output += '║                                                                              ║\n';

          // Agent counts
          output += `║  📊 AGENT STATISTICS:                                                        ║\n`;
          output += `║     Built-in Agents: ${status.agentCount.builtIn}`.padEnd(78) + '║\n';
          output += `║     Custom Agents: ${status.agentCount.custom}`.padEnd(78) + '║\n';
          output += `║     Total Agents: ${status.agentCount.builtIn + status.agentCount.custom}`.padEnd(78) + '║\n';
          output += '║                                                                              ║\n';

          // Active agent
          if (status.activeAgent) {
            output += `║  🎯 ACTIVE AGENT:                                                            ║\n`;
            output += `║     Name: ${status.activeAgent.name}`.padEnd(78) + '║\n';
            output += `║     ID: ${status.activeAgent.id}`.padEnd(78) + '║\n';
            output += `║     Version: ${status.activeAgent.version}`.padEnd(78) + '║\n';
            output += `║     Category: ${status.activeAgent.category}`.padEnd(78) + '║\n';
          } else {
            output += `║  🎯 ACTIVE AGENT: None`.padEnd(78) + '║\n';
          }
          output += '║                                                                              ║\n';

          // Recent agents
          if (status.recentAgents.length > 0) {
            output += `║  RECENTLY USED AGENTS:                                                       ║\n`;
            status.recentAgents.forEach(agent => {
              const lastUsed = new Date(agent.lastUsed).toLocaleDateString();
              output += `║     ${agent.name} (${lastUsed})`.padEnd(78) + '║\n';
            });
            output += '║                                                                              ║\n';
          }

          output += '╚══════════════════════════════════════════════════════════════════════════════╝';

          context.ui.addItem({
            type: MessageType.INFO,
            text: output
          }, Date.now());

        } catch (error) {
          context.ui.addItem({
            type: MessageType.ERROR,
            text: `❌ Failed to get agent status: ${error}`
          }, Date.now());
        }
      }
    },
    {
      name: 'deactivate',
      description: 'Deactivate the current agent',
      kind: CommandKind.BUILT_IN,
      action: async (context) => {
        try {
          const { getAgentManager } = await import('../../agents/integration/index.js');
          const agentManager = getAgentManager();
          await agentManager.initialize();

          const currentAgent = await agentManager.getActiveAgent();
          if (!currentAgent) {
            context.ui.addItem({
              type: MessageType.INFO,
              text: '⚠️  No agent is currently active'
            }, Date.now());
            return;
          }

          let output = `🔄 Deactivating agent: ${currentAgent.name}\n`;
          await agentManager.deactivateCurrentAgent();
          output += '✅ Agent deactivated successfully\n';
          output += '💡 Use "/agent activate" to activate a different agent';

          context.ui.addItem({
            type: MessageType.INFO,
            text: output
          }, Date.now());

        } catch (error) {
          context.ui.addItem({
            type: MessageType.ERROR,
            text: `❌ Failed to deactivate agent: ${error}`
          }, Date.now());
        }
      }
    },
    {
      name: 'browse',
      altNames: ['interactive', 'tui', 'ui'],
      description: 'Open interactive agent browser with selection and preview',
      kind: CommandKind.BUILT_IN,
      action: async (context) => {
        try {
          const { getAgentManager } = await import('../../agents/integration/index.js');
          const agentManager = getAgentManager();
          await agentManager.initialize();

          // Load agent infos and convert to full configs for TUI
          const agentInfos = await agentManager.listAgents();
          const currentAgent = await agentManager.getActiveAgent();

          // Convert AgentInfo to AgentConfig format
          const tuiAgents = await Promise.all(
            agentInfos.map(async (agentInfo) => {
              const fullAgent = await agentManager.getAgent(agentInfo.id);
              if (!fullAgent) {
                // Fallback for incomplete agents
                return {
                  id: agentInfo.id,
                  name: agentInfo.name,
                  version: agentInfo.version,
                  category: agentInfo.category,
                  description: agentInfo.description,
                  author: agentInfo.author,
                  created: new Date().toISOString(),
                  modified: new Date().toISOString(),
                  systemPrompt: 'System prompt not available',
                  capabilities: {
                    tools: {
                      fileOperations: false,
                      shellCommands: false,
                      webResearch: false,
                      appleControl: false,
                      emailCalendar: false,
                      dockerManagement: false,
                    },
                    specialBehaviors: agentInfo.specialBehaviors || []
                  },
                  toolConfiguration: {
                    enabledTools: [],
                    customToolOptions: {}
                  },
                  metadata: {
                    usageCount: 0,
                    lastUsed: agentInfo.lastUsed,
                    effectiveness: agentInfo.effectiveness,
                    userRating: agentInfo.effectiveness * 5 // Convert to 0-5 scale
                  }
                };
              }
              return fullAgent;
            })
          );

          // Provide a text-based agent browser
          let output = '================================================================================\n';
          output += '                     INTERACTIVE AGENT BROWSER [BETA]                          \n';
          output += '================================================================================\n\n';

          if (currentAgent) {
            output += `  CURRENTLY ACTIVE: ${currentAgent.name}\n\n`;
          }

          output += '  AVAILABLE AGENTS FOR ACTIVATION:\n\n';

          // Group and display agents
          const builtInAgents = tuiAgents.filter(agent => agent.category === 'built-in');
          const customAgents = tuiAgents.filter(agent => agent.category === 'custom');

          // Built-in agents
          if (builtInAgents.length > 0) {
            output += '  BUILT-IN AGENTS:\n';
            output += '  ----------------\n';
            
            builtInAgents.forEach((agent, index) => {
              const isActive = currentAgent?.id === agent.id;
              const prefix = isActive ? '>' : ` ${index + 1}.`;
              const activeIndicator = isActive ? ' [ACTIVE]' : '';
              const emoji = getAgentEmoji(agent);
              
              output += `  ${prefix} [${emoji}] ${agent.name}${activeIndicator}\n`;
              output += `     DESC: ${agent.description.substring(0, 60)}\n`;
              output += `     TOOLS: ${Object.values(agent.capabilities.tools).filter(Boolean).length} | BEHAVIORS: ${agent.capabilities.specialBehaviors.length}\n`;
              output += `     RATING: ${'*'.repeat(Math.round(agent.metadata.userRating))} (${agent.metadata.userRating.toFixed(1)})\n\n`;
            });
          }

          // Custom agents
          if (customAgents.length > 0) {
            output += '  CUSTOM AGENTS:\n';
            output += '  --------------\n';
            
            customAgents.forEach((agent, index) => {
              const isActive = currentAgent?.id === agent.id;
              const prefix = isActive ? '>' : ` ${builtInAgents.length + index + 1}.`;
              const activeIndicator = isActive ? ' [ACTIVE]' : '';
              const emoji = getAgentEmoji(agent);
              
              output += `  ${prefix} [${emoji}] ${agent.name}${activeIndicator}\n`;
              output += `     DESC: ${agent.description.substring(0, 60)}\n`;
              output += `     TOOLS: ${Object.values(agent.capabilities.tools).filter(Boolean).length} | BEHAVIORS: ${agent.capabilities.specialBehaviors.length}\n`;
              output += `     RATING: ${'*'.repeat(Math.round(agent.metadata.userRating))} (${agent.metadata.userRating.toFixed(1)})\n\n`;
            });
          }

          output += '================================================================================\n';
          output += '  ACTION COMMANDS:\n\n';

          tuiAgents.forEach((agent) => {
            if (!currentAgent || currentAgent.id !== agent.id) {
              output += `     /agent activate ${agent.id}\n`;
            }
          });

          output += '\n  TIP: Use /agent activate <id> to switch agents\n';
          output += '       Use /agent list -v for detailed technical information\n';
          output += '================================================================================';

          context.ui.addItem({
            type: MessageType.INFO,
            text: output
          }, Date.now());

        } catch (error) {
          context.ui.addItem({
            type: MessageType.ERROR,
            text: `❌ Failed to open agent browser: ${error}`
          }, Date.now());
        }
      }
    },
    {
      name: 'create',
      altNames: ['new', 'add', 'wizard'],
      description: 'Create a new custom agent with guided wizard',
      kind: CommandKind.BUILT_IN,
      action: async (context) => {
        try {
          const { getAgentManager } = await import('../../agents/integration/index.js');
          const agentManager = getAgentManager();
          await agentManager.initialize();

          // Simple text-based wizard for now
          // TODO: Implement full interactive TUI wizard when in appropriate mode
          let output = '================================================================================\n';
          output += '                        AGENT CREATION WIZARD                                  \n';
          output += '================================================================================\n\n';

          output += 'Welcome to the Agent Creation Wizard!\n\n';
          
          output += 'To create a new custom agent, you\'ll need to provide:\n';
          output += '  1. Agent Name - A descriptive name for your agent\n';
          output += '  2. Description - What your agent specializes in\n';
          output += '  3. Tools - Which capabilities your agent should have\n';
          output += '  4. Behaviors - Special behaviors and characteristics\n';
          output += '  5. System Prompt - The instructions that define your agent\n\n';

          output += 'QUICK START EXAMPLE:\n';
          output += '--------------------------------------------------------------------------------\n';
          output += 'Here\'s an example agent configuration you can customize:\n\n';

          const exampleAgent = {
            name: 'Code Reviewer',
            description: 'Specialized in code review, best practices, and quality assurance',
            tools: ['fileOperations', 'shellCommands'],
            behaviors: ['Detailed explanations', 'Security awareness', 'Testing emphasis'],
            systemPrompt: `You are a specialized code review assistant.

Your responsibilities:
- Review code for quality, security, and best practices
- Suggest improvements and optimizations
- Identify potential bugs and edge cases
- Ensure proper documentation and testing

Always:
- Provide constructive feedback
- Explain the reasoning behind suggestions
- Consider performance implications
- Follow project conventions`
          };

          output += 'EXAMPLE AGENT CONFIGURATION:\n';
          output += '```json\n';
          output += JSON.stringify(exampleAgent, null, 2);
          output += '\n```\n\n';

          output += 'To create this agent, save the configuration to a file and use:\n';
          output += '  /agent import <config-file.json>\n\n';

          output += 'Or create manually with these steps:\n';
          output += '  1. Create a JSON file with your agent configuration\n';
          output += '  2. Include all required fields (name, description, tools, behaviors, systemPrompt)\n';
          output += '  3. Save to ~/.ouroboros-code/agents/custom/your-agent.json\n';
          output += '  4. Use /agent activate <agent-id> to activate your new agent\n\n';

          output += 'AVAILABLE TOOLS:\n';
          output += '  - fileOperations: Read, write, and manipulate files\n';
          output += '  - shellCommands: Execute shell commands\n';
          output += '  - webResearch: Search and fetch web content\n';
          output += '  - appleControl: Control macOS applications (Mac only)\n';
          output += '  - emailCalendar: Manage email and calendar (Mac only)\n';
          output += '  - dockerManagement: Manage Docker containers\n\n';

          output += 'SUGGESTED BEHAVIORS:\n';
          output += '  - Proactive suggestions\n';
          output += '  - Detailed explanations\n';
          output += '  - Code review focus\n';
          output += '  - Testing emphasis\n';
          output += '  - Security awareness\n';
          output += '  - Performance optimization\n';
          output += '  - Documentation generation\n';
          output += '  - Error prevention\n';
          output += '  - Best practices enforcement\n';
          output += '  - Learning from feedback\n\n';

          output += 'PROMPT ENGINEERING TIPS:\n';
          output += '  1. Define clear role and responsibilities\n';
          output += '  2. Specify output format requirements\n';
          output += '  3. Include error handling instructions\n';
          output += '  4. Add context awareness guidelines\n';
          output += '  5. Set communication style preferences\n';
          output += '  6. Define decision-making criteria\n';
          output += '  7. Include learning and adaptation rules\n';
          output += '  8. Specify tool usage guidelines\n\n';

          output += '================================================================================';

          context.ui.addItem({
            type: MessageType.INFO,
            text: output
          }, Date.now());

        } catch (error) {
          context.ui.addItem({
            type: MessageType.ERROR,
            text: `Failed to open agent creation wizard: ${error}`
          }, Date.now());
        }
      }
    },
    {
      name: 'delete',
      altNames: ['remove', 'rm'],
      description: 'Delete a custom agent',
      kind: CommandKind.BUILT_IN,
      action: async (context, args) => {
        try {
          const { getAgentManager } = await import('../../agents/integration/index.js');
          const agentManager = getAgentManager();
          await agentManager.initialize();

          const agentId = args?.trim();
          if (!agentId) {
            context.ui.addItem({
              type: MessageType.ERROR,
              text: 'Please provide an agent ID to delete\nUsage: /agent delete <agent-id>'
            }, Date.now());
            return;
          }

          // Check if agent exists and is custom
          const agent = await agentManager.getAgent(agentId);
          if (!agent) {
            context.ui.addItem({
              type: MessageType.ERROR,
              text: `Agent with ID '${agentId}' not found`
            }, Date.now());
            return;
          }

          if (agent.category !== 'custom') {
            context.ui.addItem({
              type: MessageType.ERROR,
              text: 'Cannot delete built-in agents. Only custom agents can be deleted.'
            }, Date.now());
            return;
          }

          // Delete the agent
          await agentManager.deleteAgent(agentId);

          context.ui.addItem({
            type: MessageType.INFO,
            text: `Successfully deleted agent: ${agent.name}`
          }, Date.now());

        } catch (error) {
          context.ui.addItem({
            type: MessageType.ERROR,
            text: `Failed to delete agent: ${error}`
          }, Date.now());
        }
      }
    },
    {
      name: 'switch',
      altNames: ['sw', 'change'],
      description: 'Interactive agent switcher with preview',
      kind: CommandKind.BUILT_IN,
      action: async (context, args) => {
        try {
          const { getAgentManager } = await import('../../agents/integration/index.js');
          const agentManager = getAgentManager();
          await agentManager.initialize();
          
          const agents = await agentManager.listAgents();
          const currentAgent = await agentManager.getActiveAgent();
          
          // Display interactive switcher interface
          let output = '╔══════════════════════════════════════════════════════════════════════════════╗\n';
          output += '║                        🔄 INTERACTIVE AGENT SWITCHER                         ║\n';
          output += '╟──────────────────────────────────────────────────────────────────────────────╢\n';
          output += '║                                                                              ║\n';
          
          if (currentAgent) {
            output += `║  📍 Currently Active: ${currentAgent.name.padEnd(47)} ║\n`;
            output += `║     ID: ${currentAgent.id.padEnd(61)} ║\n`;
            output += '║                                                                              ║\n';
          }
          
          output += '║  🎯 QUICK SWITCH OPTIONS:                                                    ║\n';
          output += '║                                                                              ║\n';
          
          // Show top agents for quick switching
          const topAgents = agents.slice(0, 5);
          topAgents.forEach((agent, index) => {
            const emoji = getAgentEmoji(agent);
            const marker = agent.id === currentAgent?.id ? ' (active)' : '';
            output += `║  ${index + 1}. [${emoji}] ${agent.name}${marker}`.padEnd(78) + '║\n';
            output += `║     ID: ${agent.id} | Category: ${agent.category}`.padEnd(78) + '║\n';
          });
          
          output += '║                                                                              ║\n';
          output += '║  💡 USAGE:                                                                   ║\n';
          output += '║     • Use /agent activate <agent-id> to switch agents                       ║\n';
          output += '║     • Use /agent browse for full interactive browser                        ║\n';
          output += '║     • Use /agent compare <id1> <id2> to compare agents                      ║\n';
          output += '║                                                                              ║\n';
          output += '╚══════════════════════════════════════════════════════════════════════════════╝';
          
          context.ui.addItem({
            type: MessageType.INFO,
            text: output
          }, Date.now());
          
          // If an agent ID was provided, switch to it immediately
          if (args) {
            const agentId = args.trim();
            const agent = await agentManager.activateAgent(agentId);
            context.ui.addItem({
              type: MessageType.INFO,
              text: `✅ Successfully switched to agent: ${agent.name}`
            }, Date.now());
          }
          
        } catch (error) {
          context.ui.addItem({
            type: MessageType.ERROR,
            text: `Failed to switch agent: ${error}`
          }, Date.now());
        }
      }
    },
    {
      name: 'compare',
      altNames: ['diff'],
      description: 'Compare two agents side by side',
      kind: CommandKind.BUILT_IN,
      action: async (context, args) => {
        try {
          const { getAgentManager } = await import('../../agents/integration/index.js');
          const agentManager = getAgentManager();
          await agentManager.initialize();
          
          const [id1, id2] = (args || '').split(' ').map(s => s.trim());
          
          if (!id1 || !id2) {
            context.ui.addItem({
              type: MessageType.ERROR,
              text: 'Please provide two agent IDs to compare\nUsage: /agent compare <agent-id-1> <agent-id-2>'
            }, Date.now());
            return;
          }
          
          const agent1 = await agentManager.getAgent(id1);
          const agent2 = await agentManager.getAgent(id2);
          
          if (!agent1) {
            context.ui.addItem({
              type: MessageType.ERROR,
              text: `Agent with ID '${id1}' not found`
            }, Date.now());
            return;
          }
          
          if (!agent2) {
            context.ui.addItem({
              type: MessageType.ERROR,
              text: `Agent with ID '${id2}' not found`
            }, Date.now());
            return;
          }
          
          // Display comparison
          let output = '╔══════════════════════════════════════════════════════════════════════════════╗\n';
          output += '║                           AGENT COMPARISON                                   ║\n';
          output += '╟────────────────────────────────┬─────────────────────────────────────────────╢\n';
          
          // Names
          output += `║ ${agent1.name.padEnd(30)} │ ${agent2.name.padEnd(43)} ║\n`;
          output += '╟────────────────────────────────┼─────────────────────────────────────────────╢\n';
          
          // Category
          output += `║ Category: ${agent1.category.padEnd(20)} │ Category: ${agent2.category.padEnd(33)} ║\n`;
          
          // Version
          output += `║ Version: ${agent1.version.padEnd(21)} │ Version: ${agent2.version.padEnd(34)} ║\n`;
          
          // Tools
          const tools1 = agent1.toolConfiguration?.enabledTools?.length || 0;
          const tools2 = agent2.toolConfiguration?.enabledTools?.length || 0;
          output += `║ Tools: ${tools1.toString().padEnd(23)} │ Tools: ${tools2.toString().padEnd(36)} ║\n`;
          
          // Behaviors
          const behaviors1 = 0; // Behaviors not available in current AgentConfig
          const behaviors2 = 0;
          output += `║ Behaviors: ${behaviors1.toString().padEnd(19)} │ Behaviors: ${behaviors2.toString().padEnd(32)} ║\n`;
          
          // Rating
          const rating1 = 'N/A'; // Metrics not available in current AgentConfig
          const rating2 = 'N/A';
          output += `║ Rating: ${rating1.toString().padEnd(22)} │ Rating: ${rating2.toString().padEnd(35)} ║\n`;
          
          output += '╟────────────────────────────────┴─────────────────────────────────────────────╢\n';
          output += '║                           KEY DIFFERENCES                                    ║\n';
          output += '╟──────────────────────────────────────────────────────────────────────────────╢\n';
          
          // Highlight differences
          if (agent1.category !== agent2.category) {
            output += `║ • Different categories: ${agent1.category} vs ${agent2.category}`.padEnd(78) + '║\n';
          }
          if (tools1 !== tools2) {
            output += `║ • Tool count difference: ${tools1} vs ${tools2}`.padEnd(78) + '║\n';
          }
          if (behaviors1 !== behaviors2) {
            output += `║ • Behavior count difference: ${behaviors1} vs ${behaviors2}`.padEnd(78) + '║\n';
          }
          
          output += '╚══════════════════════════════════════════════════════════════════════════════╝';
          
          context.ui.addItem({
            type: MessageType.INFO,
            text: output
          }, Date.now());
          
        } catch (error) {
          context.ui.addItem({
            type: MessageType.ERROR,
            text: `Failed to compare agents: ${error}`
          }, Date.now());
        }
      }
    }
  ]
};

/**
 * Get emoji for agent based on its characteristics
 */
function getAgentEmoji(agent: any): string {
  if (agent.id.includes('automation')) return 'A';
  if (agent.id.includes('development') || agent.id.includes('dev')) return 'D';
  if (agent.id.includes('creative')) return 'C';
  if (agent.id.includes('business') || agent.id.includes('analyst')) return 'B';
  if (agent.id.includes('research')) return 'R';
  if (agent.id.includes('frontend') || agent.id.includes('react')) return 'F';
  if (agent.id.includes('backend') || agent.id.includes('api')) return 'K';
  if (agent.id.includes('devops') || agent.id.includes('deploy')) return 'O';
  if (agent.id.includes('writer') || agent.id.includes('technical')) return 'W';
  
  // Default for custom agents
  return agent.category === 'custom' ? 'U' : 'G';
}

/**
 * Show agent-specific usage hints
 */
function showAgentUsageHints(agent: any): string {
  let hints = '💡 Agent-Specific Features:\n';

  switch (agent.id) {
    case 'automation-specialist':
      hints += '   • Use /apple-control:automate to create visual workflows\n';
      hints += '   • I generate ASCII diagrams for every workflow\n';
      hints += '   • Perfect for Mac system automation and AppleScript control\n';
      break;

    case 'development-assistant':
      hints += '   • Specialized in code generation and debugging\n';
      hints += '   • Provides production-ready, secure code solutions\n';
      hints += '   • Includes testing strategies and best practices\n';
      break;

    case 'creative-assistant':
      hints += '   • Excellent for content creation and brainstorming\n';
      hints += '   • Provides multiple creative options and variations\n';
      hints += '   • Focuses on marketing, writing, and brand strategy\n';
      break;

    case 'business-analyst':
      hints += '   • Data analysis and business intelligence\n';
      hints += '   • KPI tracking and strategic planning\n';
      hints += '   • Provides actionable business insights\n';
      break;

    case 'research-assistant':
      hints += '   • Comprehensive information gathering and analysis\n';
      hints += '   • Academic writing and proper citations\n';
      hints += '   • Fact-checking and source verification\n';
      break;

    default:
      if (agent.specialBehaviors && agent.specialBehaviors.length > 0) {
        hints += `   • Specializes in: ${agent.specialBehaviors.slice(0, 3).join(', ')}\n`;
      }
      hints += `   • ${agent.toolConfiguration.enabledTools.length} specialized tools available\n`;
      break;
  }

  return hints;
}