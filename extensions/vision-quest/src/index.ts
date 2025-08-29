/**
 * Vision Quest Extension for Ouroboros Code
 * Multi-phase development workflow from natural language to validated implementation
 */

import type { ExtensionContext, CommandContext } from '@ouroboros/ouroboros-code-core';
import { SagaCommand } from './commands/sagaCommand';
import { SagaService } from './services/sagaService';
import { SagaStateMachine } from './state/sagaStateMachine';
import { StorageManager } from './storage/storageManager';

export class VisionQuestExtension {
  private sagaService?: SagaService;
  private storageManager?: StorageManager;

  async activate(context: ExtensionContext): Promise<void> {
    // Initialize storage manager
    this.storageManager = new StorageManager(context.workspaceRoot);
    await this.storageManager.initialize();

    // Initialize saga service
    this.sagaService = new SagaService(
      context.providers,
      context.tools,
      this.storageManager,
      context.config
    );

    // Register the /saga command
    context.registerCommand({
      name: 'saga',
      description: 'Start a Vision Quest development workflow',
      aliases: ['quest', 'vision'],
      action: async (cmdContext: CommandContext, args: string) => {
        const command = new SagaCommand(this.sagaService!, cmdContext);
        return command.execute(args);
      }
    });

    console.log('✨ Vision Quest extension activated');
  }

  async deactivate(): Promise<void> {
    if (this.sagaService) {
      await this.sagaService.cleanup();
    }
    console.log('Vision Quest extension deactivated');
  }
}

// Extension entry point
export default VisionQuestExtension;