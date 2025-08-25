/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandModule } from 'yargs';
import { join } from 'path';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { homedir } from 'os';

interface ListArgs {
  verbose?: boolean;
  providers?: boolean;
}

export const listExtensions: CommandModule<{}, ListArgs> = {
  command: 'list',
  describe: 'List installed extensions',
  builder: (yargs) =>
    yargs
      .option('verbose', {
        alias: 'v',
        type: 'boolean',
        describe: 'Show detailed information about each extension',
        default: false,
      })
      .option('providers', {
        alias: 'p',
        type: 'boolean',
        describe: 'Show only provider extensions',
        default: false,
      }),
  handler: async (argv: ListArgs) => {
    try {
      const extensionsDir = join(homedir(), '.ouroboros-code', 'extensions');

      if (!existsSync(extensionsDir)) {
        console.log('📦 No extensions installed yet.');
        console.log(`\nTo install an extension, use:`);
        console.log(`   ouroboros-code extension install <path-to-extension>`);
        return;
      }

      const extensionDirs = readdirSync(extensionsDir).filter(dir => {
        const dirPath = join(extensionsDir, dir);
        return existsSync(dirPath) && readdirSync(dirPath).length > 0;
      });

      if (extensionDirs.length === 0) {
        console.log('📦 No extensions installed yet.');
        return;
      }

      console.log(`📦 Installed Extensions (${extensionDirs.length}):`);
      console.log('═'.repeat(50));

      for (const dirName of extensionDirs) {
        const extensionPath = join(extensionsDir, dirName);
        let config: any = {};
        
        // Try to read extension config
        const configFiles = ['gemini-extension.json', 'ouroboros-extension.json', 'extension.json'];
        
        for (const fileName of configFiles) {
          const configPath = join(extensionPath, fileName);
          if (existsSync(configPath)) {
            try {
              config = JSON.parse(readFileSync(configPath, 'utf-8'));
              break;
            } catch (error) {
              // Ignore JSON parse errors and continue
            }
          }
        }

        const extensionName = config.name || dirName;
        const version = config.version || 'unknown';
        const description = config.description || 'No description available';
        
        // Filter for provider extensions if requested
        if (argv.providers && !config.providers) {
          continue;
        }

        console.log(`\n📁 ${extensionName}`);
        
        if (argv.verbose) {
          console.log(`   Version: ${version}`);
          console.log(`   Description: ${description}`);
          console.log(`   Path: ${extensionPath}`);
          
          if (config.providers) {
            const providerNames = Object.keys(config.providers);
            console.log(`   Providers: ${providerNames.length}`);
            
            for (const [providerName, providerConfig] of Object.entries(config.providers)) {
              const provider = providerConfig as any;
              console.log(`     • ${provider.displayName || providerName}: ${provider.description || 'No description'}`);
            }
          }

          // Check if extension is built
          const distPath = join(extensionPath, 'dist');
          const isBuilt = existsSync(distPath);
          console.log(`   Built: ${isBuilt ? '✅' : '❌'}`);
          
          if (!isBuilt) {
            console.log(`   ⚠️  Extension not built. Run 'npm run build' in the extension directory.`);
          }
        } else {
          console.log(`   v${version} - ${description}`);
          
          if (config.providers) {
            const providerNames = Object.keys(config.providers);
            console.log(`   🔌 Providers: ${providerNames.join(', ')}`);
          }
        }
      }

      if (!argv.verbose) {
        console.log(`\n💡 Use --verbose for detailed information`);
      }

      if (!argv.providers) {
        console.log(`💡 Use --providers to show only provider extensions`);
      }

      console.log(`\n🚀 Usage examples:`);
      console.log(`   ouroboros-code extension list --verbose`);
      console.log(`   ouroboros-code extension list --providers`);

      // Show provider usage examples if any provider extensions are found
      const providerExtensions = extensionDirs.filter(dirName => {
        const extensionPath = join(extensionsDir, dirName);
        const configFiles = ['gemini-extension.json', 'ouroboros-extension.json', 'extension.json'];
        
        for (const fileName of configFiles) {
          const configPath = join(extensionPath, fileName);
          if (existsSync(configPath)) {
            try {
              const config = JSON.parse(readFileSync(configPath, 'utf-8'));
              return config.providers && Object.keys(config.providers).length > 0;
            } catch (error) {
              continue;
            }
          }
        }
        return false;
      });

      if (providerExtensions.length > 0) {
        console.log(`\n🤖 Use installed providers:`);
        for (const dirName of providerExtensions) {
          const extensionPath = join(extensionsDir, dirName);
          const configFiles = ['gemini-extension.json', 'ouroboros-extension.json', 'extension.json'];
          
          for (const fileName of configFiles) {
            const configPath = join(extensionPath, fileName);
            if (existsSync(configPath)) {
              try {
                const config = JSON.parse(readFileSync(configPath, 'utf-8'));
                if (config.providers) {
                  const providerNames = Object.keys(config.providers);
                  for (const providerName of providerNames) {
                    console.log(`   ouroboros-code --provider ${providerName} "your prompt"`);
                  }
                }
                break;
              } catch (error) {
                continue;
              }
            }
          }
        }
      }

    } catch (error) {
      console.error(`❌ Failed to list extensions: ${error}`);
      process.exit(1);
    }
  },
};