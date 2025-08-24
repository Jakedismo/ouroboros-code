/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extension Provider Registry - manages provider registration from extensions
 * 
 * This registry is in the core package to avoid circular dependencies
 * between core and cli packages.
 */

export interface Extension {
  path: string;
  config: ExtensionConfig;
  contextFiles: string[];
}

export interface ExtensionConfig {
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  
  // Provider registration
  providers?: Record<string, ProviderExtensionConfig>;
  
  // Dependencies and requirements
  dependencies?: ExtensionDependencies;
  requirements?: ExtensionRequirements;
  
  // Installation hooks
  scripts?: ExtensionScripts;
  
  // Existing functionality
  mcpServers?: Record<string, any>;
  contextFileName?: string | string[];
  excludeTools?: string[];
}

export interface ProviderExtensionConfig {
  type: 'local' | 'api' | 'hybrid';
  displayName: string;
  description: string;
  entryPoint: string;                    // Relative path to provider implementation
  defaultModel: string;
  capabilities: {
    supportsStreaming: boolean;
    supportsTools: boolean;
    supportsFunctionCalling: boolean;
    supportsVision: boolean;
    supportsEmbedding: boolean;
    maxTokens: number;
    maxContextTokens: number;
    supportsSystemMessage: boolean;
    supportsToolChoice: boolean;
  };
  configuration?: Record<string, any>;   // Provider-specific config schema
}

export interface ExtensionDependencies {
  npm?: string[];                        // NPM packages
  python?: string[];                     // Python packages
  system?: string[];                     // System binaries
  optional?: string[];                   // Optional dependencies
}

export interface ExtensionRequirements {
  platform?: ('win32' | 'darwin' | 'linux')[];
  arch?: ('x64' | 'arm64')[];
  memory?: number;                       // Minimum memory in MB
  gpu?: boolean;                         // GPU required
  network?: boolean;                     // Network access required
  storage?: number;                      // Storage space required in MB
}

export interface ExtensionScripts {
  preinstall?: string;                   // Run before installation
  postinstall?: string;                  // Run after installation
  preuninstall?: string;                 // Run before uninstallation
  postuninstall?: string;                // Run after uninstallation
  test?: string;                         // Run tests
}

export interface ExtensionProviderInfo {
  extension: Extension;
  config: ProviderExtensionConfig;
  providerClass?: any;
  registeredAt: number;
}

export class ExtensionProviderRegistry {
  private static instance: ExtensionProviderRegistry;
  private registeredProviders: Map<string, ExtensionProviderInfo> = new Map();

  static getInstance(): ExtensionProviderRegistry {
    if (!ExtensionProviderRegistry.instance) {
      ExtensionProviderRegistry.instance = new ExtensionProviderRegistry();
    }
    return ExtensionProviderRegistry.instance;
  }

  async registerProvider(
    providerId: string,
    extension: Extension,
    config: ProviderExtensionConfig
  ): Promise<void> {
    // Validate requirements
    await this.validateProviderRequirements(extension.config.requirements);

    // Store provider info
    this.registeredProviders.set(providerId, {
      extension,
      config,
      registeredAt: Date.now(),
    });

    console.log(`✅ Registered provider: ${providerId} from extension ${extension.config.name}`);
  }

  async unregisterProvider(providerId: string): Promise<void> {
    if (this.registeredProviders.has(providerId)) {
      this.registeredProviders.delete(providerId);
      console.log(`🗑️ Unregistered provider: ${providerId}`);
    }
  }

  getProvider(providerId: string): ExtensionProviderInfo | undefined {
    return this.registeredProviders.get(providerId);
  }

  getAllProviders(): Map<string, ExtensionProviderInfo> {
    return new Map(this.registeredProviders);
  }

  isProviderRegistered(providerId: string): boolean {
    return this.registeredProviders.has(providerId);
  }

  getAvailableProviderIds(): string[] {
    return Array.from(this.registeredProviders.keys());
  }

  private async validateProviderRequirements(requirements?: ExtensionRequirements): Promise<void> {
    if (!requirements) return;

    // Check platform
    if (requirements.platform && !requirements.platform.includes(process.platform as any)) {
      throw new Error(`Platform ${process.platform} is not supported`);
    }

    // Check architecture
    if (requirements.arch && !requirements.arch.includes(process.arch as any)) {
      throw new Error(`Architecture ${process.arch} is not supported`);
    }

    // Check memory (simplified check)
    if (requirements.memory && requirements.memory > 0) {
      const os = await import('os');
      const totalMemory = os.totalmem() / (1024 * 1024); // Convert to MB
      if (totalMemory < requirements.memory) {
        throw new Error(`Insufficient memory: required ${requirements.memory}MB, available ${Math.round(totalMemory)}MB`);
      }
    }

    // Additional requirement checks can be added here
  }

  async registerProvidersFromExtensions(extensions: Extension[]): Promise<void> {
    for (const extension of extensions) {
      if (extension.config.providers) {
        for (const [providerId, providerConfig] of Object.entries(extension.config.providers)) {
          try {
            await this.registerProvider(providerId, extension, providerConfig);
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`Failed to register provider ${providerId} from extension ${extension.config.name}: ${errorMessage}`);
          }
        }
      }
    }
  }
}