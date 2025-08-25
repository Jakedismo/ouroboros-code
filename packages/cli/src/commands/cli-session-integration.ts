/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { SessionCommands } from './session-commands.js';

/**
 * CLI integration for session management commands
 */
export class CLISessionIntegration {
  private sessionCommands = new SessionCommands();

  /**
   * Handle /session command
   */
  async handleSessionCommand(args: string[]): Promise<boolean> {
    const [subcommand, ...subArgs] = args;

    switch (subcommand) {
      case 'list':
      case 'ls':
        return await this.handleListCommand(subArgs);
      
      case 'recover':
      case 'restore':
        return await this.handleRecoverCommand(subArgs);
      
      case 'status':
        await this.sessionCommands.showStatus();
        return true;
      
      case 'checkpoint':
      case 'cp':
        return await this.handleCheckpointCommand(subArgs);
      
      case 'stats':
      case 'statistics':
        await this.sessionCommands.showStats();
        return true;
      
      case 'help':
      case '?':
        this.showHelp();
        return true;
      
      default:
        console.log(`❌ Unknown session subcommand: ${subcommand}`);
        console.log('💡 Use /session help for available commands');
        return false;
    }
  }

  /**
   * Handle list subcommand
   */
  private async handleListCommand(args: string[]): Promise<boolean> {
    const options: {
      projectPath?: string;
      interactive?: boolean;
      detailed?: boolean;
    } = {};

    // Parse arguments
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      if (arg === '--interactive' || arg === '-i') {
        options.interactive = true;
      } else if (arg === '--detailed' || arg === '-d') {
        options.detailed = true;
      } else if (arg === '--project' || arg === '-p') {
        options.projectPath = args[++i];
      } else if (!arg.startsWith('-')) {
        // Assume it's a project path
        options.projectPath = arg;
      }
    }

    await this.sessionCommands.listSessions(options);
    return true;
  }

  /**
   * Handle recover subcommand
   */
  private async handleRecoverCommand(args: string[]): Promise<boolean> {
    if (args.length === 0) {
      // Default to interactive recovery
      await this.sessionCommands.recoverInteractive();
      return true;
    }

    const [firstArg, ...restArgs] = args;

    if (firstArg === '--quick' || firstArg === '-q') {
      const projectPath = restArgs[0];
      await this.sessionCommands.quickRecover(projectPath);
      return true;
    }

    if (firstArg === '--interactive' || firstArg === '-i') {
      const projectPath = restArgs[0];
      await this.sessionCommands.recoverInteractive(projectPath);
      return true;
    }

    // Assume it's a session ID
    const sessionId = firstArg;
    const options: any = {};

    // Parse recovery options
    for (let i = 0; i < restArgs.length; i++) {
      const arg = restArgs[i];
      
      switch (arg) {
        case '--workflows':
          options.restoreWorkflows = true;
          break;
        case '--no-workflows':
          options.restoreWorkflows = false;
          break;
        case '--agent':
          options.restoreAgent = true;
          break;
        case '--no-agent':
          options.restoreAgent = false;
          break;
        case '--environment':
          options.restoreEnvironment = true;
          break;
        case '--files':
          options.restoreOpenFiles = true;
          break;
        case '--terminal':
          options.restoreTerminalSessions = true;
          break;
        case '--clipboard':
          options.restoreClipboard = true;
          break;
      }
    }

    await this.sessionCommands.recoverById(sessionId, options);
    return true;
  }

  /**
   * Handle checkpoint subcommand
   */
  private async handleCheckpointCommand(args: string[]): Promise<boolean> {
    const description = args.join(' ') || undefined;
    await this.sessionCommands.createCheckpoint(description);
    return true;
  }

  /**
   * Show help for session commands
   */
  private showHelp(): void {
    console.log('\n📋 SESSION MANAGEMENT COMMANDS');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('📝 LIST SESSIONS:');
    console.log('  /session list [--interactive|-i] [--detailed|-d] [--project|-p PATH]');
    console.log('  /session ls');
    console.log('    --interactive  Launch interactive session browser');
    console.log('    --detailed     Show detailed dashboard');
    console.log('    --project      Filter by project path');
    console.log('');
    console.log('🔄 RECOVER SESSIONS:');
    console.log('  /session recover [SESSION_ID] [OPTIONS]');
    console.log('  /session restore [--quick|-q] [--interactive|-i] [PROJECT_PATH]');
    console.log('    --quick        Auto-select best session');
    console.log('    --interactive  Interactive recovery (default)');
    console.log('');
    console.log('  Recovery options:');
    console.log('    --workflows     Restore active workflows (default: true)');
    console.log('    --no-workflows  Skip workflow restoration');
    console.log('    --agent         Restore agent context (default: true)');
    console.log('    --no-agent      Use default agent');
    console.log('    --environment   Restore environment variables');
    console.log('    --files         Restore open files');
    console.log('    --terminal      Restore terminal sessions');
    console.log('    --clipboard     Restore clipboard contents');
    console.log('');
    console.log('📊 SESSION INFO:');
    console.log('  /session status     Show current session status');
    console.log('  /session stats      Show session statistics');
    console.log('');
    console.log('📍 CHECKPOINTING:');
    console.log('  /session checkpoint [DESCRIPTION]');
    console.log('  /session cp [DESCRIPTION]');
    console.log('');
    console.log('❓ HELP:');
    console.log('  /session help       Show this help');
    console.log('');
    console.log('💡 EXAMPLES:');
    console.log('  /session list --interactive');
    console.log('  /session recover --quick');
    console.log('  /session recover abc123 --no-workflows --environment');
    console.log('  /session checkpoint "Before major refactor"');
    console.log('  /session status');
  }

  /**
   * Handle session recovery shortcuts
   */
  async handleRecoveryShortcuts(command: string, args: string[]): Promise<boolean> {
    switch (command) {
      case '/recover':
      case '/restore':
        await this.sessionCommands.recoverInteractive(args[0]);
        return true;
      
      case '/quick-recover':
      case '/qr':
        await this.sessionCommands.quickRecover(args[0]);
        return true;
      
      case '/sessions':
        await this.sessionCommands.listSessions({ 
          interactive: args.includes('--interactive') || args.includes('-i')
        });
        return true;
      
      default:
        return false;
    }
  }

  /**
   * Auto-suggest session commands
   */
  suggestSessionCommands(input: string): string[] {
    const suggestions = [];
    
    if (input.startsWith('/session')) {
      const subcommands = ['list', 'recover', 'status', 'stats', 'checkpoint', 'help'];
      const partial = input.split(' ')[1] || '';
      
      suggestions.push(...subcommands
        .filter(cmd => cmd.startsWith(partial))
        .map(cmd => `/session ${cmd}`));
    }
    
    if (input.startsWith('/recover') || input.startsWith('/restore')) {
      suggestions.push('/recover --quick', '/recover --interactive');
    }
    
    if (input.startsWith('/sessions')) {
      suggestions.push('/sessions --interactive');
    }
    
    return suggestions;
  }

  /**
   * Get session command completions
   */
  getCompletions(input: string): string[] {
    const completions = [];
    
    // Session subcommands
    if (input === '/session ' || input.endsWith(' ')) {
      completions.push('list', 'recover', 'status', 'stats', 'checkpoint', 'help');
    }
    
    // Recovery options
    if (input.includes('recover') && input.endsWith(' ')) {
      completions.push('--quick', '--interactive', '--workflows', '--no-workflows', '--agent', '--environment');
    }
    
    // List options
    if (input.includes('list') && input.endsWith(' ')) {
      completions.push('--interactive', '--detailed', '--project');
    }
    
    return completions;
  }
}

/**
 * Create global session command integration
 */
export const sessionCLI = new CLISessionIntegration();