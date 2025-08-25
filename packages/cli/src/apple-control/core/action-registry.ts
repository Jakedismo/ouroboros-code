/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppleScriptResult, PermissionLevel } from './applescript-engine.js';

/**
 * Action execution context
 */
export interface ActionContext {
  userInput: string;
  parameters: Record<string, any>;
  requiresConfirmation?: boolean;
}

/**
 * Action definition
 */
export interface ActionDefinition {
  id: string;
  name: string;
  description: string;
  category: ActionCategory;
  permissionLevel: PermissionLevel;
  parameters: ActionParameter[];
  examples: ActionExample[];
  execute: (context: ActionContext) => Promise<AppleScriptResult>;
}

/**
 * Action parameter definition
 */
export interface ActionParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  required: boolean;
  description: string;
  defaultValue?: any;
}

/**
 * Action example
 */
export interface ActionExample {
  description: string;
  input: string;
  expectedBehavior: string;
}

/**
 * Action categories
 */
export enum ActionCategory {
  NOTES = 'notes',
  MAIL = 'mail', 
  CALENDAR = 'calendar',
  TERMINAL = 'terminal',
  DOCKER = 'docker',
  SYSTEM = 'system'
}

/**
 * Apple Control action registry
 */
export class ActionRegistry {
  private actions = new Map<string, ActionDefinition>();

  constructor() {
    // Constructor is synchronous, initialize async in a separate method
    this.initializeAsync();
  }

  /**
   * Initialize registry with async action loading
   */
  private async initializeAsync(): Promise<void> {
    await this.registerBuiltInActions();
  }

  /**
   * Register an action
   */
  registerAction(action: ActionDefinition): void {
    this.actions.set(action.id, action);
  }

  /**
   * Get action by ID
   */
  getAction(actionId: string): ActionDefinition | undefined {
    return this.actions.get(actionId);
  }

  /**
   * List all actions
   */
  listActions(): ActionDefinition[] {
    return Array.from(this.actions.values());
  }

  /**
   * List actions by category
   */
  listActionsByCategory(category: ActionCategory): ActionDefinition[] {
    return this.listActions().filter(action => action.category === category);
  }

  /**
   * Search actions by description or name
   */
  searchActions(query: string): ActionDefinition[] {
    const lowerQuery = query.toLowerCase();
    return this.listActions().filter(action => 
      action.name.toLowerCase().includes(lowerQuery) ||
      action.description.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Execute an action
   */
  async executeAction(
    actionId: string,
    userInput: string,
    parameters: Record<string, any> = {}
  ): Promise<AppleScriptResult> {
    const action = this.getAction(actionId);
    if (!action) {
      return {
        success: false,
        output: '',
        error: `Action '${actionId}' not found`,
        executionTime: 0
      };
    }

    try {
      console.log(`🍎 Executing Apple Control action: ${action.name}`);
      console.log(`📝 Description: ${action.description}`);
      console.log(`🔒 Permission Level: ${action.permissionLevel}`);
      
      const context: ActionContext = {
        userInput,
        parameters,
        requiresConfirmation: action.permissionLevel === PermissionLevel.FULL_ACCESS
      };

      const result = await action.execute(context);
      
      if (result.success) {
        console.log(`✅ Action completed in ${result.executionTime}ms`);
      } else {
        console.log(`❌ Action failed: ${result.error}`);
      }

      return result;

    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
        executionTime: 0
      };
    }
  }

  /**
   * Get action documentation
   */
  getActionDocumentation(actionId: string): string {
    const action = this.getAction(actionId);
    if (!action) {
      return `Action '${actionId}' not found.`;
    }

    let doc = `# ${action.name}\n\n`;
    doc += `**Category:** ${action.category}\n`;
    doc += `**Permission Level:** ${action.permissionLevel}\n\n`;
    doc += `${action.description}\n\n`;

    if (action.parameters.length > 0) {
      doc += `## Parameters\n\n`;
      action.parameters.forEach(param => {
        const required = param.required ? ' *(required)*' : ' *(optional)*';
        const defaultVal = param.defaultValue !== undefined ? ` (default: ${param.defaultValue})` : '';
        doc += `- **${param.name}** (${param.type})${required}${defaultVal}: ${param.description}\n`;
      });
      doc += '\n';
    }

    if (action.examples.length > 0) {
      doc += `## Examples\n\n`;
      action.examples.forEach((example, index) => {
        doc += `### Example ${index + 1}: ${example.description}\n\n`;
        doc += `**Input:** \`${example.input}\`\n\n`;
        doc += `**Behavior:** ${example.expectedBehavior}\n\n`;
      });
    }

    return doc;
  }

  /**
   * Generate comprehensive documentation
   */
  generateDocumentation(): string {
    let doc = '# Apple Control Actions\n\n';
    doc += 'Available actions for Mac system control via AppleScript.\n\n';

    // Group by category
    const categories = Object.values(ActionCategory);
    categories.forEach(category => {
      const categoryActions = this.listActionsByCategory(category);
      if (categoryActions.length === 0) return;

      doc += `## ${category.toUpperCase()} Actions\n\n`;
      categoryActions.forEach(action => {
        doc += `### ${action.name} (\`${action.id}\`)\n\n`;
        doc += `${action.description}\n\n`;
        doc += `**Permission Level:** ${action.permissionLevel}\n\n`;
        
        if (action.examples.length > 0) {
          doc += `**Example:** \`${action.examples[0].input}\`\n\n`;
        }
      });
    });

    return doc;
  }

  /**
   * Register built-in actions
   */
  private async registerBuiltInActions(): Promise<void> {
    // Import and register Notes actions
    try {
      const { registerNotesActions } = await import('../modules/notes.js');
      const notesActions = registerNotesActions();
      notesActions.forEach(action => this.registerAction(action));
    } catch (error) {
      console.warn('⚠️  Failed to register Notes actions:', error);
    }

    // Import and register Mail actions
    try {
      const { registerMailActions } = await import('../modules/mail.js');
      const mailActions = registerMailActions();
      mailActions.forEach(action => this.registerAction(action));
    } catch (error) {
      console.warn('⚠️  Failed to register Mail actions:', error);
    }

    // Import and register Calendar actions
    try {
      const { registerCalendarActions } = await import('../modules/calendar.js');
      const calendarActions = registerCalendarActions();
      calendarActions.forEach(action => this.registerAction(action));
    } catch (error) {
      console.warn('⚠️  Failed to register Calendar actions:', error);
    }

    // Import and register Terminal and Docker actions
    try {
      const { registerTerminalActions } = await import('../modules/terminal.js');
      const terminalActions = registerTerminalActions();
      terminalActions.forEach(action => this.registerAction(action));
    } catch (error) {
      console.warn('⚠️  Failed to register Terminal and Docker actions:', error);
    }

    // Import and register System control actions
    try {
      const { registerSystemActions } = await import('../modules/system.js');
      const systemActions = registerSystemActions();
      systemActions.forEach(action => this.registerAction(action));
    } catch (error) {
      console.warn('⚠️  Failed to register System control actions:', error);
    }
    
    console.log(`🍎 Apple Control Registry initialized with ${this.actions.size} actions`);
  }
}

/**
 * Global action registry instance
 */
let globalActionRegistry: ActionRegistry | null = null;

/**
 * Get the global action registry
 */
export function getActionRegistry(): ActionRegistry {
  if (!globalActionRegistry) {
    globalActionRegistry = new ActionRegistry();
  }
  return globalActionRegistry;
}

/**
 * Initialize the global action registry
 */
export async function initializeActionRegistry(): Promise<ActionRegistry> {
  globalActionRegistry = new ActionRegistry();
  // Give the async initialization a moment to complete
  await new Promise(resolve => setTimeout(resolve, 100));
  return globalActionRegistry;
}