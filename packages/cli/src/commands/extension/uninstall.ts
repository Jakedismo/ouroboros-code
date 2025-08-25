/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandModule } from 'yargs';
import { join } from 'path';
import { existsSync, readFileSync, rmSync } from 'fs';
import { homedir } from 'os';

interface UninstallArgs {
  name: string;
  force?: boolean;
}

export const uninstallExtension: CommandModule<{}, UninstallArgs> = {
  command: 'uninstall <name>',
  describe: 'Uninstall an extension',
  builder: (yargs) =>
    yargs
      .positional('name', {
        type: 'string',
        describe: 'Name of the extension to uninstall',
        demandOption: true,
      })
      .option('force', {
        type: 'boolean',
        describe: 'Force uninstallation without confirmation',
        default: false,
      }),
  handler: async (argv: UninstallArgs) => {
    try {
      const extensionsDir = join(homedir(), '.ouroboros-code', 'extensions');
      const targetDir = join(extensionsDir, argv.name);

      if (!existsSync(targetDir)) {
        console.error(`❌ Extension '${argv.name}' is not installed`);
        process.exit(1);
      }

      // Read extension info for confirmation
      let config: any = {};
      const configFiles = ['gemini-extension.json', 'ouroboros-extension.json', 'extension.json'];
      
      for (const fileName of configFiles) {
        const configPath = join(targetDir, fileName);
        if (existsSync(configPath)) {
          try {
            config = JSON.parse(readFileSync(configPath, 'utf-8'));
            break;
          } catch (error) {
            // Ignore JSON parse errors for uninstall
          }
        }
      }

      // Show what will be uninstalled
      console.log(`🗑️  Uninstalling extension: ${config.name || argv.name}`);
      if (config.version) {
        console.log(`📦 Version: ${config.version}`);
      }
      if (config.providers) {
        const providerNames = Object.keys(config.providers);
        console.log(`🔌 Providers: ${providerNames.join(', ')}`);
      }
      console.log(`📁 Location: ${targetDir}`);

      // Confirmation (unless force is used)
      if (!argv.force) {
        // Simple confirmation since we're in a CLI context
        console.log('\n⚠️  This will permanently delete the extension files.');
        console.log('Use --force to skip this confirmation in the future.');
        
        // For automated testing, we'll proceed if OUROBOROS_SKIP_CONFIRM is set
        if (!process.env['OUROBOROS_SKIP_CONFIRM']) {
          console.log('\n❌ Uninstallation cancelled. Use --force to proceed without confirmation.');
          return;
        }
      }

      // Remove the extension directory
      console.log(`🗑️  Removing extension files...`);
      rmSync(targetDir, { recursive: true, force: true });

      console.log(`✅ Extension '${argv.name}' uninstalled successfully!`);

      if (config.providers) {
        console.log(`\n💡 The following providers are no longer available:`);
        const providerNames = Object.keys(config.providers);
        for (const providerName of providerNames) {
          console.log(`   • ${providerName}`);
        }
      }

    } catch (error) {
      console.error(`❌ Failed to uninstall extension: ${error}`);
      process.exit(1);
    }
  },
};