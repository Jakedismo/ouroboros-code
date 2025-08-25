/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandModule } from 'yargs';
import { join, resolve, isAbsolute } from 'path';
import { existsSync, readFileSync, mkdirSync, cpSync, rmSync } from 'fs';
import { homedir } from 'os';

interface InstallArgs {
  path: string;
  force?: boolean;
}

export const installExtension: CommandModule<{}, InstallArgs> = {
  command: 'install <path>',
  describe: 'Install an extension from a local path',
  builder: (yargs) =>
    yargs
      .positional('path', {
        type: 'string',
        describe: 'Path to the extension directory',
        demandOption: true,
      })
      .option('force', {
        type: 'boolean',
        describe: 'Force installation even if extension already exists',
        default: false,
      }),
  handler: async (argv: InstallArgs) => {
    try {
      const extensionPath = isAbsolute(argv.path) ? argv.path : resolve(process.cwd(), argv.path);
      
      if (!existsSync(extensionPath)) {
        console.error(`❌ Extension path does not exist: ${extensionPath}`);
        process.exit(1);
      }

      // Check for extension config file
      const configFiles = ['gemini-extension.json', 'ouroboros-extension.json', 'extension.json'];
      let configFile = '';
      let config: any;

      for (const fileName of configFiles) {
        const configPath = join(extensionPath, fileName);
        if (existsSync(configPath)) {
          configFile = configPath;
          try {
            config = JSON.parse(readFileSync(configPath, 'utf-8'));
            break;
          } catch (error) {
            console.error(`❌ Invalid JSON in ${fileName}: ${error}`);
            process.exit(1);
          }
        }
      }

      if (!configFile) {
        console.error(`❌ No extension configuration found. Expected one of: ${configFiles.join(', ')}`);
        process.exit(1);
      }

      if (!config.name) {
        console.error('❌ Extension configuration missing "name" field');
        process.exit(1);
      }

      if (!config.version) {
        console.error('❌ Extension configuration missing "version" field');
        process.exit(1);
      }

      // Get extensions directory (using the existing storage structure)
      const extensionsDir = join(homedir(), '.ouroboros-code', 'extensions');
      const targetDir = join(extensionsDir, config.name);

      // Check if extension already exists
      if (existsSync(targetDir) && !argv.force) {
        console.error(`❌ Extension '${config.name}' is already installed. Use --force to overwrite.`);
        process.exit(1);
      }

      // Create extensions directory if it doesn't exist
      if (!existsSync(extensionsDir)) {
        mkdirSync(extensionsDir, { recursive: true });
      }

      // Remove existing extension if force is enabled
      if (existsSync(targetDir) && argv.force) {
        console.log(`🗑️  Removing existing extension '${config.name}'...`);
        rmSync(targetDir, { recursive: true, force: true });
      }

      // Copy extension to target directory
      console.log(`📦 Installing extension '${config.name}' v${config.version}...`);
      cpSync(extensionPath, targetDir, { recursive: true });

      // Validate installation by checking for essential files
      const distPath = join(targetDir, 'dist');
      if (!existsSync(distPath)) {
        console.warn('⚠️  Warning: Extension does not have a "dist" directory. Make sure to build the extension first.');
      }

      // Show provider information if this is a provider extension
      if (config.providers) {
        const providerNames = Object.keys(config.providers);
        console.log(`🔌 Providers: ${providerNames.join(', ')}`);
        
        for (const [providerName, providerConfig] of Object.entries(config.providers)) {
          const provider = providerConfig as any;
          console.log(`   • ${provider.displayName || providerName}: ${provider.description || 'No description'}`);
        }
      }

      console.log(`✅ Extension '${config.name}' installed successfully!`);
      console.log(`📁 Location: ${targetDir}`);
      
      if (config.providers) {
        console.log(`\n💡 You can now use the installed providers:`);
        const providerNames = Object.keys(config.providers);
        for (const providerName of providerNames) {
          console.log(`   ouroboros-code --provider ${providerName} "your prompt"`);
        }
      }

    } catch (error) {
      console.error(`❌ Failed to install extension: ${error}`);
      process.exit(1);
    }
  },
};