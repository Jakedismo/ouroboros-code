/**
 * Vision Quest Extension for Ouroboros Code
 * Main entry point and extension registration
 */

import type { Extension, CommandContext } from '@ouroboros/ouroboros-code-core';
import { SagaService } from './src/services/sagaService';
import { StorageManager } from './src/storage/storageManager';
import { SagaCommand } from './src/commands/sagaCommand';

export class VisionQuestExtension implements Extension {
  public readonly id = 'vision-quest';
  public readonly name = 'Vision Quest';
  public readonly version = '1.0.0';
  public readonly description = 'Multi-phase development workflow with AI orchestration';
  
  private sagaService?: SagaService;
  private storageManager?: StorageManager;

  async initialize(context: CommandContext): Promise<void> {
    // Initialize storage manager
    const workspacePath = context.services.config?.getTargetDir() || process.cwd();
    this.storageManager = new StorageManager(workspacePath);

    // Initialize saga service with providers and tools
    this.sagaService = new SagaService(
      context.services.providers,
      context.services.tools,
      this.storageManager,
      context.services.config
    );

    // Register the /saga command
    context.commands.register({
      name: 'saga',
      description: 'Start a Vision Quest development workflow',
      aliases: ['quest', 'vision'],
      handler: async (args: string) => {
        const command = new SagaCommand(this.sagaService!, context);
        return await command.execute(args);
      }
    });

    // Register /saga-history command to view past sessions
    context.commands.register({
      name: 'saga-history',
      description: 'View Vision Quest session history',
      aliases: ['quest-history'],
      handler: async () => {
        const sessions = await this.storageManager!.listSessions();
        
        if (sessions.length === 0) {
          return {
            type: 'message',
            messageType: 'info',
            content: 'No Vision Quest sessions found.'
          };
        }

        const sessionList = sessions
          .slice(0, 10) // Show last 10 sessions
          .map(({ sessionId, metadata }) => {
            const date = new Date(metadata.timestamp).toLocaleString();
            const status = metadata.status || 'unknown';
            const statusIcon = {
              success: '✅',
              failed: '❌',
              abandoned: '⚠️',
              unknown: '❓'
            }[status];
            
            return `${statusIcon} ${date} - ${metadata.userGoal.substring(0, 50)}...`;
          })
          .join('\n');

        return {
          type: 'message',
          messageType: 'info',
          content: `# Recent Vision Quest Sessions\n\n${sessionList}\n\nUse /saga-load <session-id> to reload a session.`
        };
      }
    });

    // Clean up old sessions on startup
    await this.storageManager.cleanupOldSessions();
  }

  async cleanup(): Promise<void> {
    if (this.sagaService) {
      await this.sagaService.cleanup();
    }
  }

  getCapabilities(): string[] {
    return [
      'multi-provider-orchestration',
      'design-synthesis',
      'automated-implementation',
      'ephemeral-workspaces',
      'validation-gates',
      'interactive-tui',
      'session-persistence'
    ];
  }
}

// Export for dynamic loading
export default VisionQuestExtension;