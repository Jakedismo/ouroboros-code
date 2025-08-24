# Extension Management System Design - Plug & Play Architecture

## Overview

This document outlines the design for a **complete plug & play extension system** that allows users to install, uninstall, and manage local inference provider extensions via CLI commands. Each provider will be distributed as a self-contained extension package.

## User Experience Goals

```bash
# Discover available extensions
ouroboros-code extension list --available

# Install a provider extension
ouroboros-code extension install ollama-provider

# Use the installed provider
ouroboros-code --provider ollama "Hello"

# Uninstall when no longer needed
ouroboros-code extension uninstall ollama-provider
```

## Architecture Design

### Extension Management Flow

```
┌─────────────────────────────────────────────────────────┐
│                Extension Registry                        │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────┐│
│  │ ollama-provider │ │  vllm-provider  │ │transformers │││
│  │     v1.0.0      │ │     v1.0.0     │ │  -provider  │││
│  └─────────────────┘ └─────────────────┘ │    v1.0.0   │││
└─────────────────────────────────────────────┘─────────────┘│
                    │                         └─────────────┘
                    ▼
┌─────────────────────────────────────────────────────────────┐
│              Extension Manager                               │
│  • Install/Uninstall                                       │
│  • Dependency Resolution                                    │
│  • Version Management                                       │
│  • Provider Registration                                    │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│            Local Extensions Directory                       │
│  ~/.gemini/extensions/                                      │
│  ├── ollama-provider/                                       │
│  │   ├── gemini-extension.json                            │
│  │   ├── provider.js                                       │
│  │   ├── package.json                                      │
│  │   └── node_modules/                                     │
│  └── vllm-provider/                                         │
│      ├── gemini-extension.json                             │
│      └── ...                                               │
└─────────────────────────────────────────────────────────────┘
```

## Enhanced Extension Configuration

### Extended Extension Config

```typescript
export interface ExtensionConfig {
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  
  // Provider registration (NEW)
  providers?: Record<string, ProviderExtensionConfig>;
  
  // Dependencies and requirements (NEW)
  dependencies?: ExtensionDependencies;
  requirements?: ExtensionRequirements;
  
  // Installation hooks (NEW)
  scripts?: ExtensionScripts;
  
  // Existing functionality
  mcpServers?: Record<string, MCPServerConfig>;
  contextFileName?: string | string[];
  excludeTools?: string[];
}

export interface ProviderExtensionConfig {
  type: 'local' | 'api' | 'hybrid';
  displayName: string;
  description: string;
  entryPoint: string;                    // Relative path to provider implementation
  defaultModel: string;
  capabilities: ProviderCapabilities;
  configuration?: ProviderConfigSchema;
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
```

### Example Extension Package Structure

```
ollama-provider/
├── gemini-extension.json              # Extension metadata
├── package.json                       # NPM package metadata
├── README.md                          # Installation and usage guide
├── LICENSE                            # License file
├── CHANGELOG.md                       # Version history
├── src/                               # Source code
│   ├── provider.ts                    # Main provider implementation
│   ├── ollama-client.ts               # Ollama API client
│   ├── model-manager.ts               # Model management
│   ├── format-converter.ts            # Format conversion
│   └── types.ts                       # Type definitions
├── dist/                              # Compiled JavaScript
│   ├── provider.js
│   └── ...
├── tests/                             # Test files
│   ├── provider.test.ts
│   └── ...
├── docs/                              # Documentation
│   ├── SETUP.md
│   └── API.md
├── scripts/                           # Installation scripts
│   ├── install.js
│   └── uninstall.js
└── node_modules/                      # Dependencies (after install)
```

## Extension Management CLI Commands

### Core Extension Commands

```typescript
// packages/cli/src/commands/extension.ts
export interface ExtensionCommand {
  install(name: string, options?: InstallOptions): Promise<void>;
  uninstall(name: string, options?: UninstallOptions): Promise<void>;
  list(options?: ListOptions): Promise<void>;
  info(name: string): Promise<void>;
  update(name?: string): Promise<void>;
  enable(name: string): Promise<void>;
  disable(name: string): Promise<void>;
  search(query: string): Promise<void>;
}
```

### Command Implementations

```bash
# Extension management commands
ouroboros-code extension list                    # List installed extensions
ouroboros-code extension list --available        # List available extensions
ouroboros-code extension install ollama-provider # Install extension
ouroboros-code extension uninstall ollama-provider # Uninstall extension
ouroboros-code extension info ollama-provider    # Show extension info
ouroboros-code extension update                  # Update all extensions
ouroboros-code extension update ollama-provider  # Update specific extension
ouroboros-code extension enable ollama-provider  # Enable extension
ouroboros-code extension disable ollama-provider # Disable extension
ouroboros-code extension search llm              # Search for extensions

# Provider management (after extension installation)
ouroboros-code --list-providers                  # List all providers (built-in + extensions)
ouroboros-code --provider ollama "Hello"         # Use extension provider
ouroboros-code --provider-info ollama            # Show provider info
```

## Extension Registry and Distribution

### Extension Registry Structure

```json
{
  "name": "ouroboros-extensions-registry",
  "version": "1.0.0",
  "description": "Official Ouroboros extension registry",
  "registry": {
    "ollama-provider": {
      "name": "ollama-provider",
      "displayName": "Ollama Provider",
      "description": "Local inference with Ollama",
      "version": "1.0.0",
      "author": "Ouroboros Team",
      "category": "provider",
      "tags": ["local", "inference", "ollama", "privacy"],
      "downloadUrl": "https://registry.ouroboros.ai/extensions/ollama-provider-1.0.0.tgz",
      "checksums": {
        "sha256": "abc123...",
        "md5": "def456..."
      },
      "compatibility": {
        "minCoreVersion": "1.0.0-alpha.6",
        "maxCoreVersion": "2.0.0",
        "platforms": ["win32", "darwin", "linux"],
        "architectures": ["x64", "arm64"]
      },
      "requirements": {
        "memory": 4096,
        "storage": 1024,
        "network": false,
        "gpu": false
      },
      "dependencies": {
        "system": ["ollama"]
      },
      "screenshots": [
        "https://registry.ouroboros.ai/screenshots/ollama-1.png"
      ],
      "documentation": "https://docs.ouroboros.ai/extensions/ollama-provider",
      "repository": "https://github.com/ouroboros-ai/ollama-provider",
      "bugs": "https://github.com/ouroboros-ai/ollama-provider/issues",
      "homepage": "https://ouroboros.ai/extensions/ollama-provider",
      "license": "Apache-2.0",
      "publishedAt": "2025-01-01T00:00:00Z",
      "downloads": {
        "total": 1234,
        "monthly": 456,
        "weekly": 123
      },
      "rating": {
        "average": 4.8,
        "count": 42
      }
    },
    "vllm-provider": {
      "name": "vllm-provider",
      "displayName": "vLLM Provider",
      "description": "High-performance local inference with vLLM",
      "version": "1.0.0",
      "author": "Ouroboros Team",
      "category": "provider",
      "tags": ["local", "inference", "vllm", "performance", "gpu"],
      "requirements": {
        "memory": 8192,
        "gpu": true,
        "storage": 2048
      },
      "dependencies": {
        "python": ["vllm", "torch"]
      }
    },
    "transformers-provider": {
      "name": "transformers-provider",
      "displayName": "Transformers.js Provider",
      "description": "Browser-compatible local inference with Transformers.js",
      "version": "1.0.0",
      "author": "Ouroboros Team",
      "category": "provider",
      "tags": ["local", "inference", "browser", "offline", "javascript"],
      "requirements": {
        "memory": 2048,
        "storage": 512,
        "network": false
      },
      "dependencies": {
        "npm": ["@xenova/transformers"]
      }
    }
  }
}
```

### Distribution Methods

1. **Official Registry**: Hosted extensions with verification
2. **NPM Packages**: Extensions distributed as NPM packages
3. **Git Repositories**: Direct installation from Git repos
4. **Local Files**: Install from local directories or archives
5. **URLs**: Install from direct download URLs

## Extension Manager Implementation

### Core Extension Manager

```typescript
export class ExtensionManager {
  private extensionsDir: string;
  private registry: ExtensionRegistry;
  private installedExtensions: Map<string, Extension>;

  constructor(baseDir: string) {
    const storage = new Storage(baseDir);
    this.extensionsDir = storage.getExtensionsDir();
    this.registry = new ExtensionRegistry();
    this.installedExtensions = new Map();
  }

  async install(extensionName: string, options: InstallOptions = {}): Promise<void> {
    console.log(`🔍 Finding extension: ${extensionName}`);
    
    // 1. Resolve extension source
    const source = await this.resolveExtensionSource(extensionName, options);
    
    // 2. Download extension package
    const packagePath = await this.downloadExtension(source);
    
    // 3. Validate extension
    await this.validateExtension(packagePath);
    
    // 4. Check requirements
    await this.checkRequirements(packagePath);
    
    // 5. Install dependencies
    await this.installDependencies(packagePath);
    
    // 6. Extract to extensions directory
    const installPath = await this.extractExtension(packagePath, extensionName);
    
    // 7. Run post-install scripts
    await this.runInstallScript(installPath, 'postinstall');
    
    // 8. Register extension
    await this.registerExtension(installPath);
    
    console.log(`✅ Extension ${extensionName} installed successfully`);
  }

  async uninstall(extensionName: string, options: UninstallOptions = {}): Promise<void> {
    console.log(`🗑️ Uninstalling extension: ${extensionName}`);
    
    const extension = this.installedExtensions.get(extensionName);
    if (!extension) {
      throw new Error(`Extension ${extensionName} is not installed`);
    }

    // 1. Run pre-uninstall script
    await this.runInstallScript(extension.path, 'preuninstall');
    
    // 2. Unregister extension providers
    await this.unregisterExtension(extension);
    
    // 3. Remove extension directory
    if (!options.keepData) {
      await fs.promises.rm(extension.path, { recursive: true, force: true });
    }
    
    // 4. Run post-uninstall script
    await this.runInstallScript(extension.path, 'postuninstall');
    
    console.log(`✅ Extension ${extensionName} uninstalled successfully`);
  }

  async listInstalled(): Promise<Extension[]> {
    return Array.from(this.installedExtensions.values());
  }

  async listAvailable(): Promise<RegistryExtension[]> {
    return this.registry.getAvailableExtensions();
  }

  async searchExtensions(query: string): Promise<RegistryExtension[]> {
    return this.registry.searchExtensions(query);
  }

  async getExtensionInfo(extensionName: string): Promise<ExtensionInfo> {
    // Check if installed locally
    const installed = this.installedExtensions.get(extensionName);
    if (installed) {
      return this.getInstalledExtensionInfo(installed);
    }

    // Check registry
    return this.registry.getExtensionInfo(extensionName);
  }

  async updateExtension(extensionName?: string): Promise<void> {
    if (extensionName) {
      await this.updateSingleExtension(extensionName);
    } else {
      await this.updateAllExtensions();
    }
  }

  private async resolveExtensionSource(name: string, options: InstallOptions): Promise<ExtensionSource> {
    // Handle different source types
    if (options.fromGit) {
      return { type: 'git', url: options.fromGit };
    }
    
    if (options.fromUrl) {
      return { type: 'url', url: options.fromUrl };
    }
    
    if (options.fromLocal) {
      return { type: 'local', path: options.fromLocal };
    }

    if (options.fromNpm) {
      return { type: 'npm', package: name };
    }

    // Default: registry lookup
    const registryEntry = await this.registry.getExtensionInfo(name);
    return { type: 'registry', info: registryEntry };
  }

  private async installDependencies(packagePath: string): Promise<void> {
    const config = await this.readExtensionConfig(packagePath);
    
    if (config.dependencies) {
      // Install NPM dependencies
      if (config.dependencies.npm) {
        await this.installNpmDependencies(packagePath, config.dependencies.npm);
      }

      // Check system dependencies
      if (config.dependencies.system) {
        await this.checkSystemDependencies(config.dependencies.system);
      }

      // Check Python dependencies
      if (config.dependencies.python) {
        await this.checkPythonDependencies(config.dependencies.python);
      }
    }
  }

  private async registerExtension(installPath: string): Promise<void> {
    const extension = await this.loadExtension(installPath);
    
    // Register with provider factory if it provides providers
    if (extension.config.providers) {
      for (const [providerId, providerConfig] of Object.entries(extension.config.providers)) {
        await LLMProviderFactory.registerExtensionProvider(providerId, extension, providerConfig);
        console.log(`✅ Registered provider: ${providerId}`);
      }
    }

    this.installedExtensions.set(extension.config.name, extension);
  }

  private async unregisterExtension(extension: Extension): Promise<void> {
    // Unregister providers
    if (extension.config.providers) {
      for (const providerId of Object.keys(extension.config.providers)) {
        await LLMProviderFactory.unregisterExtensionProvider(providerId);
        console.log(`🗑️ Unregistered provider: ${providerId}`);
      }
    }

    this.installedExtensions.delete(extension.config.name);
  }
}
```

### Enhanced Provider Factory

```typescript
export class LLMProviderFactory {
  private static extensionProviders = new Map<string, ExtensionProviderInfo>();
  
  static async registerExtensionProvider(
    providerId: string,
    extension: Extension,
    config: ProviderExtensionConfig
  ): Promise<void> {
    // Validate requirements
    const isCompatible = await this.validateProviderRequirements(config);
    if (!isCompatible) {
      throw new Error(`Provider ${providerId} requirements not met`);
    }

    // Load provider class
    const providerPath = path.resolve(extension.path, config.entryPoint);
    const ProviderModule = await import(providerPath);
    const ProviderClass = ProviderModule.default || ProviderModule;

    // Validate provider class
    if (!this.isValidProviderClass(ProviderClass)) {
      throw new Error(`Invalid provider class in ${providerId}`);
    }

    // Register provider
    this.extensionProviders.set(providerId, {
      extension,
      config,
      providerClass: ProviderClass,
      registeredAt: Date.now(),
    });

    console.log(`✅ Provider ${providerId} registered from extension ${extension.config.name}`);
  }

  static async unregisterExtensionProvider(providerId: string): Promise<void> {
    this.extensionProviders.delete(providerId);
    console.log(`🗑️ Provider ${providerId} unregistered`);
  }

  static getAvailableProviders(): string[] {
    const coreProviders = Object.values(LLMProvider);
    const extensionProviders = Array.from(this.extensionProviders.keys());
    return [...coreProviders, ...extensionProviders];
  }

  static getProviderInfo(providerId: string): ProviderInfo | null {
    const extensionProvider = this.extensionProviders.get(providerId);
    if (extensionProvider) {
      return {
        id: providerId,
        name: extensionProvider.config.displayName,
        description: extensionProvider.config.description,
        type: 'extension',
        source: extensionProvider.extension.config.name,
        capabilities: extensionProvider.config.capabilities,
      };
    }

    // Check core providers
    if (Object.values(LLMProvider).includes(providerId as LLMProvider)) {
      return {
        id: providerId,
        name: this.getCoreProviderName(providerId),
        description: `Built-in ${providerId} provider`,
        type: 'core',
        capabilities: PROVIDER_CAPABILITIES[providerId as LLMProvider],
      };
    }

    return null;
  }

  private static async createBasicProvider(config: LLMProviderConfig): Promise<BaseLLMProvider> {
    // Check extension providers first
    if (this.extensionProviders.has(config.provider)) {
      const extensionProvider = this.extensionProviders.get(config.provider)!;
      const ProviderClass = extensionProvider.providerClass;
      return new ProviderClass(config);
    }

    // Fall back to core providers
    switch (config.provider) {
      case LLMProvider.GEMINI:
        const { GeminiProvider } = await import('./gemini/provider.js');
        return new GeminiProvider(config);
      
      case LLMProvider.OPENAI:
        const { OpenAIProvider } = await import('./openai/provider.js');
        return new OpenAIProvider(config);
      
      case LLMProvider.ANTHROPIC:
        const { AnthropicProvider } = await import('./anthropic/provider.js');
        return new AnthropicProvider(config);
      
      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }
  }
}
```

## CLI Integration

### Extension Command Implementation

```typescript
// packages/cli/src/commands/extension.ts
export class ExtensionCommandHandler {
  private extensionManager: ExtensionManager;

  constructor(workspaceDir: string) {
    this.extensionManager = new ExtensionManager(workspaceDir);
  }

  async handleExtensionCommand(args: string[]): Promise<void> {
    const [subcommand, ...rest] = args;

    switch (subcommand) {
      case 'list':
        await this.handleList(rest);
        break;
      case 'install':
        await this.handleInstall(rest);
        break;
      case 'uninstall':
        await this.handleUninstall(rest);
        break;
      case 'info':
        await this.handleInfo(rest);
        break;
      case 'update':
        await this.handleUpdate(rest);
        break;
      case 'search':
        await this.handleSearch(rest);
        break;
      default:
        this.showExtensionHelp();
    }
  }

  private async handleList(args: string[]): Promise<void> {
    const showAvailable = args.includes('--available');
    
    if (showAvailable) {
      const available = await this.extensionManager.listAvailable();
      this.displayAvailableExtensions(available);
    } else {
      const installed = await this.extensionManager.listInstalled();
      this.displayInstalledExtensions(installed);
    }
  }

  private async handleInstall(args: string[]): Promise<void> {
    if (args.length === 0) {
      console.error('Error: Extension name required');
      return;
    }

    const extensionName = args[0];
    const options = this.parseInstallOptions(args.slice(1));

    try {
      await this.extensionManager.install(extensionName, options);
      console.log(`\n🎉 Extension ${extensionName} installed successfully!`);
      console.log('\nNew providers available:');
      await this.showNewProviders(extensionName);
    } catch (error) {
      console.error(`❌ Failed to install extension ${extensionName}:`, error.message);
      process.exit(1);
    }
  }

  private async handleUninstall(args: string[]): Promise<void> {
    if (args.length === 0) {
      console.error('Error: Extension name required');
      return;
    }

    const extensionName = args[0];
    const options = this.parseUninstallOptions(args.slice(1));

    try {
      await this.extensionManager.uninstall(extensionName, options);
      console.log(`\n🎉 Extension ${extensionName} uninstalled successfully!`);
    } catch (error) {
      console.error(`❌ Failed to uninstall extension ${extensionName}:`, error.message);
      process.exit(1);
    }
  }

  private displayInstalledExtensions(extensions: Extension[]): void {
    if (extensions.length === 0) {
      console.log('📦 No extensions installed');
      console.log('\n💡 Discover extensions with: ouroboros-code extension list --available');
      return;
    }

    console.log(`📦 Installed Extensions (${extensions.length}):\n`);
    
    for (const ext of extensions) {
      console.log(`  📋 ${ext.config.name} v${ext.config.version}`);
      if (ext.config.description) {
        console.log(`     ${ext.config.description}`);
      }
      
      if (ext.config.providers) {
        const providers = Object.keys(ext.config.providers);
        console.log(`     🔌 Providers: ${providers.join(', ')}`);
      }
      
      console.log();
    }
  }

  private displayAvailableExtensions(extensions: RegistryExtension[]): void {
    console.log(`📦 Available Extensions (${extensions.length}):\n`);
    
    for (const ext of extensions) {
      console.log(`  📋 ${ext.name} v${ext.version}`);
      console.log(`     ${ext.description}`);
      console.log(`     📊 Downloads: ${ext.downloads.total} | ⭐ Rating: ${ext.rating.average}/5`);
      console.log(`     🏷️  Tags: ${ext.tags.join(', ')}`);
      console.log();
    }

    console.log('💡 Install with: ouroboros-code extension install <extension-name>');
  }

  private async showNewProviders(extensionName: string): Promise<void> {
    const extension = await this.extensionManager.getInstalledExtension(extensionName);
    if (extension?.config.providers) {
      for (const [providerId, providerConfig] of Object.entries(extension.config.providers)) {
        console.log(`  🔌 ${providerId} - ${providerConfig.displayName}`);
        console.log(`     ${providerConfig.description}`);
      }
      console.log(`\n💡 Try it: ouroboros-code --provider ${Object.keys(extension.config.providers)[0]} "Hello"`);
    }
  }

  private showExtensionHelp(): void {
    console.log(`
📦 Ouroboros Extension Manager

USAGE:
  ouroboros-code extension <command> [options]

COMMANDS:
  list                     List installed extensions
  list --available         List available extensions from registry
  install <name>           Install an extension
  uninstall <name>         Uninstall an extension
  info <name>             Show extension information
  update [name]           Update extensions (all if no name specified)
  search <query>          Search for extensions

INSTALL OPTIONS:
  --from-git <url>        Install from git repository
  --from-url <url>        Install from download URL
  --from-local <path>     Install from local directory
  --from-npm <package>    Install from NPM package

EXAMPLES:
  ouroboros-code extension list
  ouroboros-code extension install ollama-provider
  ouroboros-code extension install --from-git https://github.com/user/my-provider
  ouroboros-code extension uninstall ollama-provider
  ouroboros-code extension search llm
`);
  }
}
```

This design provides a complete plug & play system where:

1. **Users can discover extensions** via `extension list --available`
2. **Install extensions cleanly** with `extension install ollama-provider`
3. **Use providers immediately** after installation with `--provider ollama`
4. **Uninstall completely** with `extension uninstall ollama-provider`
5. **Manage dependencies automatically** during install/uninstall
6. **Update extensions** with `extension update`

Each provider will be a self-contained package with all its dependencies, and the system handles registration/unregistration automatically.

Let me start implementing this system step by step.