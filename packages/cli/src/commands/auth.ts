/**
 * @license
 * Copyright 2025 Ouroboros
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule, Argv } from 'yargs';
import { EnhancedAnthropicOAuthManager } from '../../../core/src/providers/anthropic/oauth-manager-enhanced.js';

// Claude OAuth subcommands
const claudeLoginCommand: CommandModule = {
  command: 'login',
  describe: 'Authenticate with Claude using OAuth',
  builder: (yargs: Argv) =>
    yargs
      .option('no-browser', {
        type: 'boolean',
        description: 'Skip automatic browser opening',
        default: false,
      })
      .option('client-id', {
        type: 'string',
        description: 'Override OAuth client ID',
      })
      .option('port', {
        type: 'number',
        description: 'Override callback port',
      }),
  handler: async (argv: any) => {
    await AuthCommand.handleClaudeLogin(argv);
  },
};

const claudeStatusCommand: CommandModule = {
  command: 'status',
  describe: 'Show Claude authentication status',
  builder: (yargs: Argv) =>
    yargs.option('verbose', {
      type: 'boolean',
      description: 'Show detailed token information',
      default: false,
    }),
  handler: async (argv: any) => {
    await AuthCommand.handleClaudeStatus(argv);
  },
};

const claudeLogoutCommand: CommandModule = {
  command: 'logout',
  describe: 'Logout from Claude (revoke tokens)',
  builder: (yargs: Argv) =>
    yargs.option('local-only', {
      type: 'boolean',
      description: 'Only clear local tokens, skip server revocation',
      default: false,
    }),
  handler: async (argv: any) => {
    await AuthCommand.handleClaudeLogout(argv);
  },
};

const claudeImportCommand: CommandModule = {
  command: 'import',
  describe: 'Import Claude credentials from file or standard locations',
  builder: (yargs: Argv) =>
    yargs
      .option('from', {
        type: 'string',
        description: 'Import from specific credentials file',
      })
      .option('list-sources', {
        type: 'boolean',
        description: 'List available credential sources',
        default: false,
      }),
  handler: async (argv: any) => {
    await AuthCommand.handleClaudeImport(argv);
  },
};

const claudeCommand: CommandModule = {
  command: 'claude',
  describe: 'Manage Claude OAuth authentication',
  builder: (yargs: Argv) =>
    yargs
      .command(claudeLoginCommand)
      .command(claudeStatusCommand)
      .command(claudeLogoutCommand)
      .command(claudeImportCommand)
      .demandCommand(1, 'You need to specify a Claude subcommand.')
      .version(false),
  handler: () => {
    // yargs will automatically show help if no subcommand is provided
  },
};

export const authCommand: CommandModule = {
  command: 'auth',
  describe: 'Manage authentication with AI providers',
  builder: (yargs: Argv) =>
    yargs
      .command(claudeCommand)
      .demandCommand(1, 'You need to specify an authentication provider.')
      .version(false),
  handler: () => {
    // yargs will automatically show help if no subcommand is provided
  },
};

/**
 * Authentication command handler
 */
export class AuthCommand {

  /**
   * Handle Claude login command
   */
  public static async handleClaudeLogin(options: {
    noBrowser?: boolean;
    clientId?: string;
    port?: number;
  }): Promise<void> {
    try {
      console.log('🔐 Starting Claude OAuth authentication...');

      // Create OAuth manager with options
      const config: any = {};
      if (options.clientId) {
        config.clientId = options.clientId;
      }
      if (options.port) {
        config.callbackPort = options.port;
      }

      const manager = new EnhancedAnthropicOAuthManager(config);

      // Check if already authenticated
      const status = await manager.getStatus();
      if (status.isAuthenticated && !status.isExpired) {
        console.log('✅ Already authenticated with Claude');
        console.log(`   Email: ${status.userEmail || 'Unknown'}`);
        console.log(`   Expires: ${status.expiresAt ? status.expiresAt.toLocaleString() : 'Never'}`);
        console.log('   Use "ouroboros-code auth claude logout" to re-authenticate');
        return;
      }

      // Start authentication flow
      console.log('🌐 Opening browser for authentication...');
      if (options.noBrowser) {
        console.log('   (Browser opening disabled)');
      }

      const authUrl = await manager.authenticate(options.noBrowser);

      if (options.noBrowser) {
        console.log('\n📋 Manual authentication required:');
        console.log(`   Please visit: ${authUrl}`);
        console.log('   Complete the authentication and return here.');
      }

      // Authentication completed
      const finalStatus = await manager.getStatus();
      
      console.log('\n✅ Claude authentication successful!');
      console.log(`   Email: ${finalStatus.userEmail || 'Unknown'}`);
      console.log(`   Scopes: ${finalStatus.scopes?.join(', ') || 'Unknown'}`);
      console.log(`   Expires: ${finalStatus.expiresAt ? finalStatus.expiresAt.toLocaleString() : 'Never'}`);
      console.log('\n🚀 You can now use Ouroboros with Claude without API keys!');

    } catch (error) {
      console.error('❌ Claude authentication failed:');
      console.error(`   ${(error as Error).message}`);
      
      if ((error as Error).message.includes('Port') && (error as Error).message.includes('in use')) {
        console.log('\n💡 Try using a different port:');
        console.log('   ouroboros-code auth claude login --port 54546');
      } else if ((error as Error).message.includes('Browser')) {
        console.log('\n💡 Try without automatic browser opening:');
        console.log('   ouroboros-code auth claude login --no-browser');
      }
      
      process.exit(1);
    }
  }

  /**
   * Handle Claude status command
   */
  public static async handleClaudeStatus(options: {
    verbose?: boolean;
  }): Promise<void> {
    try {
      const manager = new EnhancedAnthropicOAuthManager();
      const status = await manager.getStatus();

      if (!status.isAuthenticated) {
        console.log('❌ Not authenticated with Claude');
        console.log('\n🔐 To authenticate, run:');
        console.log('   ouroboros-code auth claude login');
        return;
      }

      // Show basic status
      console.log('✅ Authenticated with Claude');
      console.log(`   Status: ${status.isExpired ? '🔴 Expired' : '🟢 Active'}`);
      
      if (status.userEmail) {
        console.log(`   Email: ${status.userEmail}`);
      }
      
      if (status.expiresAt) {
        console.log(`   Expires: ${status.expiresAt.toLocaleString()}`);
        const timeLeft = status.expiresAt.getTime() - Date.now();
        if (timeLeft > 0) {
          const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
          const minutesLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
          console.log(`   Time left: ${hoursLeft}h ${minutesLeft}m`);
        }
      }

      if (status.scopes && status.scopes.length > 0) {
        console.log(`   Scopes: ${status.scopes.join(', ')}`);
      }

      console.log(`   Refresh token: ${status.hasRefreshToken ? '✅ Available' : '❌ Missing'}`);

      // Show verbose information
      if (options.verbose) {
        console.log('\n📊 Token Storage Locations:');
        const storageStatus = await manager.getStorageStatus();
        
        for (const location of storageStatus) {
          const hasTokens = location.hasTokens ? '✅' : '❌';
          console.log(`   ${hasTokens} ${location.name}`);
          console.log(`      Path: ${location.path}`);
          console.log(`      Format: ${location.format}`);
          console.log(`      Writable: ${location.writable ? 'Yes' : 'No'}`);
          if (location.error) {
            console.log(`      Error: ${location.error}`);
          }
        }
      }

      // Show helpful messages
      if (status.isExpired) {
        console.log('\n⚠️  Your authentication has expired.');
        if (status.hasRefreshToken) {
          console.log('   It will be automatically refreshed on next use.');
        } else {
          console.log('   Please re-authenticate:');
          console.log('   ouroboros-code auth claude login');
        }
      }

    } catch (error) {
      console.error('❌ Failed to check Claude authentication status:');
      console.error(`   ${(error as Error).message}`);
      process.exit(1);
    }
  }

  /**
   * Handle Claude logout command
   */
  public static async handleClaudeLogout(options: {
    localOnly?: boolean;
  }): Promise<void> {
    try {
      const manager = new EnhancedAnthropicOAuthManager();
      const status = await manager.getStatus();

      if (!status.isAuthenticated) {
        console.log('ℹ️  Not currently authenticated with Claude');
        return;
      }

      console.log('🔓 Logging out from Claude...');

      if (options.localOnly) {
        // Only clear local tokens
        await manager.clearTokens();
        console.log('✅ Local tokens cleared');
        console.log('   (Server tokens not revoked - use without --local-only for complete logout)');
      } else {
        // Full logout with server revocation
        try {
          await manager.revokeTokens();
          console.log('✅ Successfully logged out from Claude');
          console.log('   Tokens revoked on server and cleared locally');
        } catch (error) {
          console.warn('⚠️  Server revocation failed, clearing local tokens only');
          console.warn(`   Error: ${(error as Error).message}`);
          await manager.clearTokens();
          console.log('✅ Local tokens cleared');
        }
      }

      console.log('\n🔐 To re-authenticate, run:');
      console.log('   ouroboros-code auth claude login');

    } catch (error) {
      console.error('❌ Failed to logout from Claude:');
      console.error(`   ${(error as Error).message}`);
      process.exit(1);
    }
  }

  /**
   * Handle Claude import command
   */
  public static async handleClaudeImport(options: {
    from?: string;
    listSources?: boolean;
  }): Promise<void> {
    try {
      const manager = new EnhancedAnthropicOAuthManager();

      // List available sources
      if (options.listSources) {
        console.log('📋 Available credential sources:');
        const storageStatus = await manager.getStorageStatus();
        
        for (const location of storageStatus) {
          const hasTokens = location.hasTokens ? '✅' : '❌';
          const writable = location.writable ? '📝' : '👁️ ';
          console.log(`   ${hasTokens} ${writable} ${location.name}`);
          console.log(`      Path: ${location.path}`);
          console.log(`      Description: ${location.description}`);
          if (location.error && !location.hasTokens) {
            console.log(`      Status: ${location.error}`);
          }
        }
        
        console.log('\n💡 To import from a specific source:');
        console.log('   ouroboros-code auth claude import --from /path/to/credentials.json');
        return;
      }

      // Import from specific path
      if (options.from) {
        console.log(`📥 Importing Claude credentials from: ${options.from}`);
        await manager.importTokens(options.from);
        console.log('✅ Credentials imported successfully');
      } else {
        // Auto-import from available sources
        console.log('🔍 Looking for Claude credentials in standard locations...');
        const storageStatus = await manager.getStorageStatus();
        const availableSources = storageStatus.filter(s => s.hasTokens && !s.error);
        
        if (availableSources.length === 0) {
          console.log('❌ No credentials found in standard locations');
          console.log('\n💡 Available options:');
          console.log('   • Use --list-sources to see all locations');
          console.log('   • Use --from <path> to import from specific file');
          console.log('   • Run "ouroboros-code auth claude login" for new authentication');
          return;
        }

        // Import from first available non-primary source
        const sourceToImport = availableSources.find(s => s.format !== 'ouroboros') || availableSources[0];
        
        console.log(`📥 Found credentials at: ${sourceToImport.name}`);
        console.log(`   Path: ${sourceToImport.path}`);
        
        await manager.importTokens(sourceToImport.path);
        console.log('✅ Credentials imported successfully');
      }

      // Show status after import
      const status = await manager.getStatus();
      console.log('\n📊 Authentication Status:');
      console.log(`   Status: ${status.isExpired ? '🔴 Expired' : '🟢 Active'}`);
      console.log(`   Email: ${status.userEmail || 'Unknown'}`);
      console.log(`   Expires: ${status.expiresAt ? status.expiresAt.toLocaleString() : 'Never'}`);

      if (status.isExpired && !status.hasRefreshToken) {
        console.log('\n⚠️  Imported credentials are expired and cannot be refreshed.');
        console.log('   Consider running: ouroboros-code auth claude login');
      }

    } catch (error) {
      console.error('❌ Failed to import Claude credentials:');
      console.error(`   ${(error as Error).message}`);
      process.exit(1);
    }
  }
}