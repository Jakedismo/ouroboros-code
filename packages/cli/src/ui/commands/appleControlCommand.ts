/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageType } from '../types.js';
import { CommandKind, SlashCommand } from './types.js';

export const appleControlCommand: SlashCommand = {
  name: 'apple-control',
  altNames: ['apple', 'mac'],
  description: 'Mac system control via AppleScript automation',
  kind: CommandKind.BUILT_IN,
  
  action: async (context, args) => {
    // Parse action from args
    const parts = args?.trim().split(/\s+/) || [];
    
    if (parts.length === 0) {
      // Show available actions
      return await showAppleControlMenu(context);
    }

    const actionId = parts[0];
    const remainingArgs = parts.slice(1).join(' ');

    try {
      const { getActionRegistry } = await import('../../apple-control/core/action-registry.js');
      const registry = getActionRegistry();
      
      // Handle special commands
      if (actionId === 'list' || actionId === 'help') {
        return await showAvailableActions(context, registry);
      }

      if (actionId === 'permissions' || actionId === 'test') {
        return await testPermissions(context);
      }

      if (actionId === 'docs' && parts.length > 1) {
        return await showActionDocumentation(context, registry, parts[1]);
      }

      // Execute action
      const result = await registry.executeAction(actionId, remainingArgs, {});
      
      if (result.success) {
        context.ui.addItem({
          type: MessageType.INFO,
          text: `✅ Apple Control Action: ${actionId}\n\n${result.output}\n\n⏱️ Completed in ${result.executionTime}ms`
        }, Date.now());
      } else {
        context.ui.addItem({
          type: MessageType.ERROR,
          text: `❌ Apple Control Action Failed: ${actionId}\n\nError: ${result.error}`
        }, Date.now());
      }

    } catch (error) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: `❌ Apple Control Error: ${error}`
      }, Date.now());
    }
  },
  
  subCommands: [
    {
      name: 'list',
      description: 'List all available Apple Control actions',
      kind: CommandKind.BUILT_IN,
      action: async (context) => {
        try {
          const { getActionRegistry } = await import('../../apple-control/core/action-registry.js');
          const registry = getActionRegistry();
          return await showAvailableActions(context, registry);
        } catch (error) {
          context.ui.addItem({
            type: MessageType.ERROR,
            text: `❌ Failed to load Apple Control actions: ${error}`
          }, Date.now());
        }
      }
    },
    {
      name: 'permissions',
      altNames: ['test'],
      description: 'Test Apple Control permissions and setup',
      kind: CommandKind.BUILT_IN,
      action: async (context) => {
        return await testPermissions(context);
      }
    },
    {
      name: 'automate',
      description: 'Create and execute automated workflows (Automation Specialist feature)',
      kind: CommandKind.BUILT_IN,
      action: async (context, args) => {
        // This will be the main automation workflow feature
        const workflowDescription = args?.trim();
        
        if (!workflowDescription) {
          context.ui.addItem({
            type: MessageType.INFO,
            text: `🤖 Automation Workflow Creator

**Usage:** \`/apple-control automate <workflow description>\`

**Examples:**
- \`/apple-control automate "Summarize today's emails and create a note"\`
- \`/apple-control automate "Create a secure Docker environment for Python development"\`
- \`/apple-control automate "Find emails about project X and add calendar reminders"\`

**Features:**
🎯 Natural language workflow description
📊 ASCII workflow diagrams  
✅ User confirmation before execution
🔄 Step-by-step progress tracking
⚡ Parallel and sequential execution

**Note:** This feature is designed to work best with the **Automation Specialist** agent.
Use \`/agent activate automation-specialist\` to switch to the automation agent.`
          }, Date.now());
          return;
        }

        // Check if automation specialist is active
        try {
          const { getAgentManager } = await import('../../agents/integration/index.js');
          const agentManager = getAgentManager();
          const activeAgent = await agentManager.getActiveAgent();
          
          if (!activeAgent || activeAgent.id !== 'automation-specialist') {
            context.ui.addItem({
              type: MessageType.INFO,
              text: `🤖 **Automation Workflow Request**

**Description:** ${workflowDescription}

⚠️  **Recommendation:** For best results, activate the **Automation Specialist** agent:
\`/agent activate automation-specialist\`

The Automation Specialist is specifically designed to:
- Generate ASCII workflow diagrams
- Plan complex multi-step automations  
- Execute workflows with proper error handling
- Provide real-time progress updates

**Continue anyway?** You can proceed with the current agent, but the automation specialist provides specialized capabilities for workflow planning and execution.`
            }, Date.now());
          } else {
            context.ui.addItem({
              type: MessageType.INFO,
              text: `🤖 **Automation Workflow Request** 

**Active Agent:** ${activeAgent.name} ✅
**Description:** ${workflowDescription}

🎯 The Automation Specialist will now:
1. Analyze your workflow requirements
2. Generate an ASCII workflow diagram  
3. Present the execution plan for your approval
4. Execute the workflow with real-time progress

**Note:** This feature will be fully implemented in Phase 3 of development.
For now, you can use individual actions like:
- \`/apple-control notes:create title="Test" content="Hello"\`
- \`/apple-control mail:read count=5\`
- \`/apple-control calendar:create-event title="Meeting" date="2025-08-26"\``
            }, Date.now());
          }
        } catch (error) {
          context.ui.addItem({
            type: MessageType.ERROR,
            text: `❌ Error checking agent status: ${error}`
          }, Date.now());
        }
      }
    }
  ]
};

/**
 * Show the main Apple Control menu
 */
async function showAppleControlMenu(context: any): Promise<void> {
  const menuText = `
╔══════════════════════════════════════════════════════════════════════════════╗
║                           🍎 APPLE CONTROL SYSTEM                            ║
╟──────────────────────────────────────────────────────────────────────────────╢
║                                                                              ║
║  Mac System Automation via AppleScript                                      ║
║                                                                              ║
║  🎯 MAIN COMMANDS:                                                           ║
║     /apple-control list                     - List all available actions    ║
║     /apple-control permissions              - Test system permissions       ║
║     /apple-control automate <workflow>      - Create automated workflows    ║
║                                                                              ║
║  📱 QUICK ACTIONS:                                                           ║
║     /apple-control notes:create             - Create a new note             ║
║     /apple-control mail:read                - Read recent emails            ║
║     /apple-control calendar:create-event    - Create calendar event         ║
║     /apple-control terminal:new-tab         - Open terminal tab             ║
║     /apple-control docker:create-container  - Create Docker container       ║
║                                                                              ║
║  🤖 AUTOMATION SPECIALIST:                                                   ║
║     This system works best with the Automation Specialist agent.            ║
║     Use: /agent activate automation-specialist                              ║
║                                                                              ║
║  ⚠️  PERMISSIONS REQUIRED:                                                   ║
║     • Accessibility access for System Events                                ║
║     • App control permissions for automation                                ║
║     • Full Disk Access for comprehensive file operations                    ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

💡 **Quick Start:**
1. Run \`/apple-control permissions\` to check your setup
2. Try \`/apple-control list\` to see all available actions
3. Activate automation specialist: \`/agent activate automation-specialist\`
4. Create workflows: \`/apple-control automate "your workflow description"\`
`;

  context.ui.addItem({
    type: MessageType.INFO,
    text: menuText.trim()
  }, Date.now());
}

/**
 * Show available actions
 */
async function showAvailableActions(context: any, registry: any): Promise<void> {
  const actions = registry.listActions();
  
  let output = `🍎 **Apple Control Actions** (${actions.length} available)\n\n`;
  
  // Group by category
  const categorySet = new Set<string>();
  actions.forEach((a: any) => {
    if (a.category) {
      categorySet.add(a.category);
    }
  });
  const categories = Array.from(categorySet);
  
  categories.forEach((category: string) => {
    const categoryActions = actions.filter((a: any) => a.category === category);
    output += `## ${category.toUpperCase()} (${categoryActions.length})\n\n`;
    
    categoryActions.forEach((action: any) => {
      const permissionIcon = action.permissionLevel === 'read-only' ? '👁️' : 
                             action.permissionLevel === 'safe-write' ? '✏️' : '🔒';
      
      output += `**${action.id}** ${permissionIcon}\n`;
      output += `${action.description}\n`;
      if (action.examples.length > 0) {
        output += `*Example:* \`/apple-control ${action.examples[0].input.replace('/apple-control:', '')}\`\n`;
      }
      output += '\n';
    });
  });
  
  output += `\n💡 Use \`/apple-control docs <action-id>\` for detailed documentation\n`;
  output += `⚠️  Icons: 👁️ = Read-only, ✏️ = Safe write, 🔒 = Full access`;

  context.ui.addItem({
    type: MessageType.INFO,
    text: output
  }, Date.now());
}

/**
 * Test Apple Control permissions
 */
async function testPermissions(context: any): Promise<void> {
  try {
    const { AppleScriptEngine } = await import('../../apple-control/core/applescript-engine.js');
    
    context.ui.addItem({
      type: MessageType.INFO,
      text: '🔍 Testing Apple Control permissions...\n\nThis may take a few seconds...'
    }, Date.now());
    
    const permissions = await AppleScriptEngine.testPermissions();
    
    let output = '🍎 **Apple Control Permissions Test Results**\n\n';
    
    output += `**Accessibility Access:** ${permissions.hasAccessibility ? '✅ Enabled' : '❌ Disabled'}\n`;
    output += `**App Control:** ${permissions.canControlApps ? '✅ Enabled' : '❌ Disabled'}\n`;
    output += `**Full Disk Access:** ${permissions.hasFullDiskAccess ? '✅ Enabled' : '⚠️ Limited'}\n\n`;
    
    if (permissions.recommendations.length > 0) {
      output += '## Setup Recommendations\n\n';
      permissions.recommendations.forEach((rec, index) => {
        output += `${index + 1}. ${rec}\n`;
      });
      output += '\n';
    }
    
    const overallStatus = permissions.hasAccessibility && permissions.canControlApps;
    output += `**Overall Status:** ${overallStatus ? '🟢 Ready for automation' : '🟡 Setup needed'}\n\n`;
    
    if (overallStatus) {
      output += '🎉 Your system is ready for Apple Control automation!\n';
      output += 'Try: `/apple-control list` to see available actions.';
    } else {
      output += '⚠️ Some permissions are missing. Please follow the setup recommendations above.\n';
      output += 'After setup, restart ouroboros-code and test again.';
    }

    context.ui.addItem({
      type: MessageType.INFO,
      text: output
    }, Date.now());

  } catch (error) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: `❌ Permission test failed: ${error}`
    }, Date.now());
  }
}

/**
 * Show documentation for a specific action
 */
async function showActionDocumentation(context: any, registry: any, actionId: string): Promise<void> {
  const documentation = registry.getActionDocumentation(actionId);
  
  context.ui.addItem({
    type: MessageType.INFO,
    text: `📚 **Apple Control Documentation**\n\n${documentation}`
  }, Date.now());
}