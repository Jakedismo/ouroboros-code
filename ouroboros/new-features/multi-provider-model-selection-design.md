# Multi-Provider Model Selection Feature Design

## Executive Summary

This design extends the `/model` command to support model selection across all LLM providers while maintaining backward compatibility. Users can select models for individual providers or all providers simultaneously, with intelligent validation, runtime switching, and seamless integration with the convergence feature.

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Design Goals](#design-goals)
3. [Architecture Overview](#architecture-overview)
4. [Command Syntax Design](#command-syntax-design)
5. [Model Registry System](#model-registry-system)
6. [Runtime Model Management](#runtime-model-management)
7. [Provider Model Compatibility](#provider-model-compatibility)
8. [Configuration & Persistence](#configuration--persistence)
9. [UI/UX Design](#uiux-design)
10. [Integration Points](#integration-points)
11. [Error Handling](#error-handling)
12. [Implementation Plan](#implementation-plan)

## Current State Analysis

### Existing Behavior

- `/model` command currently sets model for the main provider only
- Model selection happens at startup via `--model` flag
- Each provider has hardcoded default models
- No runtime model switching capability
- No visibility into available models per provider

### Limitations

1. Cannot set different models for different providers
2. No validation of model availability
3. No way to discover available models
4. Model changes require restart in some cases
5. Convergence features use default models only

## Design Goals

### Primary Objectives

1. **Backward Compatibility**: Existing `/model` usage continues to work
2. **Provider Flexibility**: Set models per provider or globally
3. **Runtime Switching**: Change models without restart
4. **Discovery**: List available models per provider
5. **Validation**: Verify model availability before selection
6. **Persistence**: Remember model preferences across sessions

### User Experience Goals

- Intuitive syntax that scales from simple to complex use cases
- Clear feedback on model changes
- Helpful error messages for invalid models
- Visual indication of current model selections

## Architecture Overview

### Component Diagram

```
┌─────────────────────────────────────────┐
│         Model Command Parser            │
│  (Extended /model command handler)      │
└─────────────┬───────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│         Model Selection Router          │
│  (Routes to appropriate handler)        │
└──┬──────────┬──────────┬────────────────┘
   ↓          ↓          ↓
┌──────┐  ┌──────┐  ┌──────────┐
│Global│  │Single│  │Discovery │
│Mode  │  │Mode  │  │Mode      │
└──┬───┘  └──┬───┘  └────┬─────┘
   ↓         ↓           ↓
┌─────────────────────────────────────────┐
│         Model Registry Manager          │
│  (Validates and tracks models)          │
└─────────────┬───────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│      Provider Model Adapters            │
├──────────┬──────────┬───────────────────┤
│  Gemini  │  OpenAI  │   Anthropic       │
│  Adapter │  Adapter │   Adapter         │
└──────────┴──────────┴───────────────────┘
              ↓
┌─────────────────────────────────────────┐
│    Runtime Model Configuration          │
│  (Updates provider instances)           │
└─────────────────────────────────────────┘
```

### Core Components

#### 1. Model Command Parser (`packages/cli/src/commands/model-command.ts`)

```typescript
interface ModelCommand {
  parse(input: string): ModelCommandRequest;
  execute(request: ModelCommandRequest): Promise<ModelCommandResult>;
  validate(request: ModelCommandRequest): ValidationResult;
}

interface ModelCommandRequest {
  action: 'set' | 'get' | 'list' | 'reset';
  scope: 'global' | 'provider' | 'all';
  provider?: LLMProvider;
  model?: string;
  options?: ModelOptions;
}

interface ModelOptions {
  persist?: boolean;
  validate?: boolean;
  fallback?: string;
}
```

#### 2. Model Registry Manager (`packages/core/src/providers/model-registry.ts`)

```typescript
interface ModelRegistry {
  // Model discovery
  getAvailableModels(provider: LLMProvider): Promise<ModelInfo[]>;
  isModelAvailable(provider: LLMProvider, model: string): Promise<boolean>;
  getModelCapabilities(provider: LLMProvider, model: string): ModelCapabilities;

  // Model selection
  setModel(provider: LLMProvider, model: string): Promise<void>;
  getModel(provider: LLMProvider): string;
  getCurrentModels(): Map<LLMProvider, string>;

  // Batch operations
  setAllModels(model: string): Promise<Map<LLMProvider, boolean>>;
  resetToDefaults(): void;

  // Validation
  validateModel(
    provider: LLMProvider,
    model: string,
  ): Promise<ValidationResult>;
  getSupportedModels(provider: LLMProvider): string[];
}

interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  capabilities: ModelCapabilities;
  pricing?: ModelPricing;
  deprecated?: boolean;
  successor?: string;
}

interface ModelCapabilities {
  maxTokens: number;
  supportsFunctions: boolean;
  supportsVision: boolean;
  supportsStreaming: boolean;
  contextWindow: number;
  trainingDataCutoff?: Date;
}
```

#### 3. Provider Model Adapters

```typescript
interface ProviderModelAdapter {
  // Model discovery
  listModels(): Promise<ModelInfo[]>;
  getModelInfo(modelId: string): Promise<ModelInfo>;

  // Model validation
  validateModel(modelId: string): Promise<boolean>;
  checkModelAccess(modelId: string): Promise<AccessStatus>;

  // Model switching
  switchModel(modelId: string): Promise<void>;
  getCurrentModel(): string;

  // Model-specific configuration
  getModelConfig(modelId: string): ModelConfig;
  applyModelConfig(config: ModelConfig): void;
}
```

## Command Syntax Design

### Basic Syntax Patterns

#### 1. Current Behavior (Maintained)

```bash
# Set model for current/default provider
/model gpt-4
/model claude-3-opus
/model gemini-1.5-pro
```

#### 2. Provider-Specific Selection

```bash
# Set model for specific provider
/model openai:gpt-4
/model anthropic:claude-3-opus
/model gemini:gemini-1.5-pro

# Alternative syntax with --provider flag
/model gpt-4 --provider openai
/model claude-3-opus --provider anthropic
```

#### 3. Global Model Selection

```bash
# Set same model for all providers (where available)
/model --all gpt-4
/model --global best-available

# Set with fallback options
/model --all gpt-4 --fallback gpt-3.5-turbo
```

#### 4. Discovery Commands

```bash
# List all available models
/model --list
/model -l

# List models for specific provider
/model --list openai
/model --list anthropic
/model --list gemini

# Show current model configuration
/model --show
/model --current
```

#### 5. Advanced Options

```bash
# Set multiple models at once
/model openai:gpt-4 anthropic:claude-3-opus gemini:gemini-1.5-pro

# Reset to defaults
/model --reset
/model --reset openai

# Validate model availability
/model --validate gpt-4
/model --check-access claude-3-opus
```

### Command Examples with Output

#### Example 1: Simple Model Change

```bash
> /model gpt-4

✅ Model updated for OpenAI
Previous: gpt-3.5-turbo
Current: gpt-4
Token Limit: 8,192 → 32,768
Cost: $0.03/1K → $0.06/1K tokens
```

#### Example 2: Provider-Specific Selection

```bash
> /model anthropic:claude-3-opus

✅ Model updated for Anthropic
Previous: claude-3-sonnet
Current: claude-3-opus
Context: 100K → 200K tokens
Capabilities: +Advanced reasoning, +Creative writing
```

#### Example 3: List Available Models

```bash
> /model --list

📋 Available Models by Provider:

🔷 Gemini:
  • gemini-1.5-pro ← current
    - 1M token context
    - Multimodal support
    - Best for: General tasks

  • gemini-1.5-flash
    - 100K token context
    - Faster responses
    - Best for: Quick tasks

  • gemini-1.0-pro [legacy]
    - 32K token context

🟢 OpenAI:
  • gpt-4-turbo ← current
    - 128K token context
    - Latest training data
    - Best for: Complex reasoning

  • gpt-4
    - 32K token context
    - Stable performance

  • gpt-3.5-turbo
    - 16K token context
    - Fast & economical

🟣 Anthropic:
  • claude-3-opus
    - 200K token context
    - Best performance
    - Best for: Complex analysis

  • claude-3-sonnet ← current
    - 100K token context
    - Balanced performance

  • claude-3-haiku
    - 100K token context
    - Fastest responses
```

#### Example 4: Set All Providers

```bash
> /model --all best-available

🔄 Setting optimal models for all providers...

✅ Gemini: gemini-1.5-pro
✅ OpenAI: gpt-4-turbo
✅ Anthropic: claude-3-opus

All providers updated to best available models.
Total context available: 1.3M tokens
Estimated cost increase: ~2.5x
```

## Model Registry System

### Model Database Structure

```typescript
interface ModelDatabase {
  providers: {
    [LLMProvider.GEMINI]: {
      models: GeminiModel[];
      default: string;
      aliases: Map<string, string>;
    };
    [LLMProvider.OPENAI]: {
      models: OpenAIModel[];
      default: string;
      aliases: Map<string, string>;
    };
    [LLMProvider.ANTHROPIC]: {
      models: AnthropicModel[];
      default: string;
      aliases: Map<string, string>;
    };
  };

  // Cross-provider model mappings
  equivalencies: ModelEquivalency[];

  // Model categories
  categories: {
    'best-performance': Map<LLMProvider, string>;
    'best-value': Map<LLMProvider, string>;
    fastest: Map<LLMProvider, string>;
    'largest-context': Map<LLMProvider, string>;
  };
}

interface ModelEquivalency {
  category: string;
  models: {
    [LLMProvider.GEMINI]: string;
    [LLMProvider.OPENAI]: string;
    [LLMProvider.ANTHROPIC]: string;
  };
}
```

### Model Validation Logic

```typescript
class ModelValidator {
  async validate(
    provider: LLMProvider,
    modelId: string,
    apiKey?: string,
  ): Promise<ValidationResult> {
    // 1. Check if model exists in registry
    if (!this.registry.hasModel(provider, modelId)) {
      return {
        valid: false,
        error: `Model ${modelId} not found for ${provider}`,
        suggestion: this.findSimilarModel(provider, modelId),
      };
    }

    // 2. Check if model is deprecated
    const modelInfo = this.registry.getModel(provider, modelId);
    if (modelInfo.deprecated) {
      return {
        valid: true,
        warning: `Model ${modelId} is deprecated. Consider ${modelInfo.successor}`,
      };
    }

    // 3. Check API access (if API key provided)
    if (apiKey) {
      const hasAccess = await this.checkApiAccess(provider, modelId, apiKey);
      if (!hasAccess) {
        return {
          valid: false,
          error: `No access to ${modelId}. Upgrade your plan or use ${this.suggestAlternative(provider, modelId)}`,
        };
      }
    }

    return { valid: true };
  }

  private findSimilarModel(provider: LLMProvider, modelId: string): string {
    // Fuzzy matching logic
    const models = this.registry.getModels(provider);
    return this.fuzzyMatch(modelId, models);
  }
}
```

## Runtime Model Management

### Dynamic Model Switching

```typescript
class RuntimeModelManager {
  private providerInstances: Map<LLMProvider, BaseLLMProvider>;
  private modelConfigs: Map<LLMProvider, ModelConfig>;

  async switchModel(
    provider: LLMProvider,
    newModel: string,
  ): Promise<SwitchResult> {
    // 1. Validate new model
    const validation = await this.validator.validate(provider, newModel);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // 2. Get provider instance
    const instance = this.providerInstances.get(provider);
    if (!instance) {
      return { success: false, error: 'Provider not initialized' };
    }

    // 3. Create new configuration
    const newConfig = this.createModelConfig(provider, newModel);

    // 4. Apply configuration
    try {
      await instance.reconfigure(newConfig);
      this.modelConfigs.set(provider, newConfig);

      // 5. Verify switch was successful
      const currentModel = await instance.getCurrentModel();
      if (currentModel !== newModel) {
        throw new Error('Model switch verification failed');
      }

      return {
        success: true,
        previousModel: this.modelConfigs.get(provider)?.model,
        currentModel: newModel,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to switch model: ${error.message}`,
      };
    }
  }

  async switchAllModels(
    modelSpec: string,
  ): Promise<Map<LLMProvider, SwitchResult>> {
    const results = new Map<LLMProvider, SwitchResult>();

    // Determine target model for each provider
    const targetModels = this.resolveModelSpec(modelSpec);

    // Switch models in parallel
    const promises = Array.from(targetModels.entries()).map(
      async ([provider, model]) => {
        const result = await this.switchModel(provider, model);
        results.set(provider, result);
      },
    );

    await Promise.all(promises);
    return results;
  }

  private resolveModelSpec(spec: string): Map<LLMProvider, string> {
    // Handle special keywords
    if (spec === 'best-available') {
      return new Map([
        [LLMProvider.GEMINI, 'gemini-1.5-pro'],
        [LLMProvider.OPENAI, 'gpt-4-turbo'],
        [LLMProvider.ANTHROPIC, 'claude-3-opus'],
      ]);
    }

    if (spec === 'fastest') {
      return new Map([
        [LLMProvider.GEMINI, 'gemini-1.5-flash'],
        [LLMProvider.OPENAI, 'gpt-3.5-turbo'],
        [LLMProvider.ANTHROPIC, 'claude-3-haiku'],
      ]);
    }

    // Try to map to equivalent models
    return this.findEquivalentModels(spec);
  }
}
```

### Hot-Reload Capability

```typescript
interface HotReloadConfig {
  provider: LLMProvider;
  model: string;
  preserveContext: boolean;
  migrateHistory: boolean;
}

class HotReloadManager {
  async reloadWithModel(config: HotReloadConfig): Promise<void> {
    // 1. Save current context if requested
    const context = config.preserveContext
      ? await this.saveContext(config.provider)
      : null;

    // 2. Save conversation history if requested
    const history = config.migrateHistory
      ? await this.saveHistory(config.provider)
      : null;

    // 3. Dispose current provider instance
    await this.disposeProvider(config.provider);

    // 4. Create new instance with new model
    const newInstance = await this.createProvider(
      config.provider,
      config.model,
    );

    // 5. Restore context and history
    if (context) {
      await newInstance.loadContext(context);
    }
    if (history) {
      await newInstance.loadHistory(history);
    }

    // 6. Update registry
    this.registry.updateProvider(config.provider, newInstance);
  }
}
```

## Provider Model Compatibility

### Gemini Models

```typescript
const GEMINI_MODELS: ModelInfo[] = [
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    capabilities: {
      maxTokens: 16384,
      contextWindow: 2097152, // 2M tokens
      supportsFunctions: true,
      supportsVision: true,
      supportsStreaming: true,
    },
    pricing: { input: 0.0025, output: 0.0075 }, // per 1K tokens
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    capabilities: {
      maxTokens: 8192,
      contextWindow: 200000,
      supportsFunctions: true,
      supportsVision: true,
      supportsStreaming: true,
    },
    pricing: { input: 0.00025, output: 0.00075 },
  },
];
```

### OpenAI Models

```typescript
const OPENAI_MODELS: ModelInfo[] = [
  {
    id: 'gpt-5',
    name: 'GPT-5',
    capabilities: {
      maxTokens: 8192,
      contextWindow: 256000,
      supportsFunctions: true,
      supportsVision: true,
      supportsStreaming: true,
      trainingDataCutoff: new Date('2025-01-01'),
    },
    pricing: { input: 0.015, output: 0.045 },
  },
  {
    id: 'gpt-5-mini',
    name: 'GPT-5 Mini',
    capabilities: {
      maxTokens: 4096,
      contextWindow: 128000,
      supportsFunctions: true,
      supportsVision: true,
      supportsStreaming: true,
      trainingDataCutoff: new Date('2025-01-01'),
    },
    pricing: { input: 0.005, output: 0.015 },
  },
  {
    id: 'gpt-5-nano',
    name: 'GPT-5 Nano',
    capabilities: {
      maxTokens: 4096,
      contextWindow: 32768,
      supportsFunctions: true,
      supportsVision: false,
      supportsStreaming: true,
    },
    pricing: { input: 0.0002, output: 0.0006 },
  },
  {
    id: 'o3',
    name: 'O3',
    capabilities: {
      maxTokens: 32768,
      contextWindow: 512000,
      supportsFunctions: true,
      supportsVision: true,
      supportsStreaming: true,
      supportsReasoning: true, // New capability
    },
    pricing: { input: 0.025, output: 0.075 },
  },
];
```

### Anthropic Models

```typescript
const ANTHROPIC_MODELS: ModelInfo[] = [
  {
    id: 'claude-4-1-opus-20250805',
    name: 'Claude 4.1 Opus',
    capabilities: {
      maxTokens: 8192,
      contextWindow: 500000,
      supportsFunctions: true,
      supportsVision: true,
      supportsStreaming: true,
    },
    pricing: { input: 0.012, output: 0.06 },
  },
  {
    id: 'claude-4-sonnet-20250514',
    name: 'Claude 4 Sonnet',
    capabilities: {
      maxTokens: 4096,
      contextWindow: 200000,
      supportsFunctions: true,
      supportsVision: true,
      supportsStreaming: true,
    },
    pricing: { input: 0.002, output: 0.01 },
  },
];
```

### Cross-Provider Compatibility Matrix

```typescript
const MODEL_EQUIVALENCIES: ModelEquivalency[] = [
  {
    category: 'flagship',
    models: {
      [LLMProvider.GEMINI]: 'gemini-2.5-pro',
      [LLMProvider.OPENAI]: 'o3',
      [LLMProvider.ANTHROPIC]: 'claude-4-1-opus-20250805',
    },
  },
  {
    category: 'balanced',
    models: {
      [LLMProvider.GEMINI]: 'gemini-2.5-flash',
      [LLMProvider.OPENAI]: 'gpt-5',
      [LLMProvider.ANTHROPIC]: 'claude-4-sonnet-20250514',
    },
  },
  {
    category: 'fast-economical',
    models: {
      [LLMProvider.GEMINI]: 'gemini-2.5-flash',
      [LLMProvider.OPENAI]: 'gpt-5-nano',
      [LLMProvider.ANTHROPIC]: 'claude-4-sonnet-20250514',
    },
  },
];
```

## Configuration & Persistence

### Settings Schema

```typescript
interface ModelSelectionConfig {
  // Current model selections
  models: {
    [LLMProvider.GEMINI]: string;
    [LLMProvider.OPENAI]: string;
    [LLMProvider.ANTHROPIC]: string;
  };

  // Default models (fallback)
  defaults: {
    [LLMProvider.GEMINI]: string;
    [LLMProvider.OPENAI]: string;
    [LLMProvider.ANTHROPIC]: string;
  };

  // User preferences
  preferences: {
    autoSelectBest: boolean;
    preferLatestModels: boolean;
    costOptimization: 'performance' | 'balanced' | 'economical';
    validateOnStartup: boolean;
    showModelWarnings: boolean;
  };

  // Model aliases (user-defined shortcuts)
  aliases: {
    [key: string]: {
      provider: LLMProvider;
      model: string;
    };
  };

  // History tracking
  history: {
    enabled: boolean;
    recentModels: Array<{
      provider: LLMProvider;
      model: string;
      timestamp: Date;
      reason?: string;
    }>;
    maxHistorySize: number;
  };
}
```

### Persistence Layer

```typescript
class ModelConfigPersistence {
  private configPath = '~/.gemini-cli/model-config.json';

  async save(config: ModelSelectionConfig): Promise<void> {
    // 1. Validate configuration
    this.validateConfig(config);

    // 2. Create backup of current config
    await this.backupConfig();

    // 3. Write new configuration
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));

    // 4. Update in-memory cache
    this.cache.set('model-config', config);
  }

  async load(): Promise<ModelSelectionConfig> {
    // 1. Try to load from cache
    const cached = this.cache.get('model-config');
    if (cached && !this.isStale(cached)) {
      return cached;
    }

    // 2. Load from disk
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      const config = JSON.parse(content);

      // 3. Migrate if needed
      const migrated = await this.migrateConfig(config);

      // 4. Validate
      this.validateConfig(migrated);

      // 5. Update cache
      this.cache.set('model-config', migrated);

      return migrated;
    } catch (error) {
      // Return defaults if no config exists
      return this.getDefaultConfig();
    }
  }

  private async migrateConfig(config: any): Promise<ModelSelectionConfig> {
    // Handle migration from older config formats
    const version = config.version || 1;

    if (version < 2) {
      // Migrate from v1 to v2 format
      config = this.migrateV1ToV2(config);
    }

    return config;
  }
}
```

## UI/UX Design

### Interactive Model Selection

```typescript
class InteractiveModelSelector {
  async selectModel(): Promise<ModelSelection> {
    // 1. Show current configuration
    console.log(chalk.blue('Current Model Configuration:'));
    this.displayCurrentModels();

    // 2. Present options
    const choice = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          'Change model for specific provider',
          'Set same model for all providers',
          'Use recommended models',
          'View available models',
          'Reset to defaults',
          'Cancel',
        ],
      },
    ]);

    // 3. Handle selection
    switch (choice.action) {
      case 'Change model for specific provider':
        return this.selectProviderModel();
      case 'Set same model for all providers':
        return this.selectGlobalModel();
      case 'Use recommended models':
        return this.applyRecommended();
      // ... etc
    }
  }

  private async selectProviderModel(): Promise<ModelSelection> {
    // 1. Select provider
    const provider = await this.selectProvider();

    // 2. Show available models for that provider
    const models = await this.registry.getAvailableModels(provider);

    // 3. Display with rich information
    const choices = models.map((model) => ({
      name: this.formatModelChoice(model),
      value: model.id,
      short: model.name,
    }));

    // 4. Let user select
    const selected = await inquirer.prompt([
      {
        type: 'list',
        name: 'model',
        message: `Select model for ${provider}:`,
        choices,
        pageSize: 10,
      },
    ]);

    return { provider, model: selected.model };
  }

  private formatModelChoice(model: ModelInfo): string {
    const status = model.deprecated ? chalk.yellow(' [deprecated]') : '';
    const context = chalk.gray(
      ` (${this.formatTokens(model.capabilities.contextWindow)} context)`,
    );
    const price = chalk.green(` $${model.pricing?.input}/1K`);

    return `${model.name}${status}${context}${price}`;
  }
}
```

### Visual Feedback

```typescript
class ModelChangeFeedback {
  displayModelChange(result: ModelChangeResult): void {
    if (result.success) {
      this.showSuccess(result);
    } else {
      this.showError(result);
    }
  }

  private showSuccess(result: ModelChangeResult): void {
    console.log(chalk.green('✅ Model successfully updated'));

    // Show comparison table
    const table = new Table({
      head: ['Provider', 'Previous', 'Current', 'Change'],
      style: { head: ['cyan'] },
    });

    for (const [provider, change] of result.changes) {
      table.push([
        provider,
        change.previous,
        chalk.green(change.current),
        this.getChangeIndicator(change),
      ]);
    }

    console.log(table.toString());

    // Show impact summary
    this.showImpactSummary(result);
  }

  private showImpactSummary(result: ModelChangeResult): void {
    console.log(chalk.blue('\n📊 Impact Summary:'));

    const impacts = [];

    // Context window change
    if (result.contextChange) {
      const change =
        result.contextChange > 0
          ? chalk.green(`+${this.formatTokens(result.contextChange)}`)
          : chalk.red(`${this.formatTokens(result.contextChange)}`);
      impacts.push(`Context: ${change}`);
    }

    // Cost change
    if (result.costChange) {
      const change =
        result.costChange > 0
          ? chalk.red(`+${result.costChange}%`)
          : chalk.green(`${result.costChange}%`);
      impacts.push(`Cost: ${change}`);
    }

    // Speed change
    if (result.speedChange) {
      const change =
        result.speedChange > 0
          ? chalk.green(`+${result.speedChange}% faster`)
          : chalk.yellow(`${Math.abs(result.speedChange)}% slower`);
      impacts.push(`Speed: ${change}`);
    }

    console.log(impacts.join(' | '));
  }
}
```

## Integration Points

### Integration with Convergence Feature

```typescript
class ConvergenceModelIntegration {
  async executeWithModelOverrides(
    command: string,
    input: string,
    modelOverrides?: Map<LLMProvider, string>,
  ): Promise<ConvergenceResult> {
    // 1. Save current models
    const originalModels = await this.saveCurrentModels();

    try {
      // 2. Apply model overrides if provided
      if (modelOverrides) {
        for (const [provider, model] of modelOverrides) {
          await this.modelManager.switchModel(provider, model);
        }
      }

      // 3. Execute convergence command
      const result = await this.convergenceEngine.execute(command, input);

      // 4. Add model information to result
      result.modelsUsed = await this.getCurrentModels();

      return result;
    } finally {
      // 5. Restore original models
      await this.restoreModels(originalModels);
    }
  }
}

// Usage in slash commands
class EnhancedConvergeCommand {
  async execute(
    input: string,
    options: CommandOptions,
  ): Promise<CommandResult> {
    // Check for model overrides in options
    const modelOverrides = this.parseModelOverrides(options);

    if (modelOverrides) {
      // Use specific models for this convergence
      return this.convergenceIntegration.executeWithModelOverrides(
        'converge',
        input,
        modelOverrides,
      );
    }

    // Use current models
    return this.standardExecute(input, options);
  }

  private parseModelOverrides(
    options: CommandOptions,
  ): Map<LLMProvider, string> | null {
    // Parse options like:
    // /converge --models gemini:gemini-1.5-pro,openai:gpt-4 "question"
    if (!options.models) return null;

    const overrides = new Map<LLMProvider, string>();
    const specs = options.models.split(',');

    for (const spec of specs) {
      const [provider, model] = spec.split(':');
      overrides.set(provider as LLMProvider, model);
    }

    return overrides;
  }
}
```

### Integration with Existing Provider System

```typescript
// Extend BaseLLMProvider
abstract class EnhancedBaseLLMProvider extends BaseLLMProvider {
  protected currentModel: string;
  protected modelConfig: ModelConfig;

  async reconfigure(config: ModelConfig): Promise<void> {
    // Validate new configuration
    await this.validateModelConfig(config);

    // Update internal state
    this.modelConfig = config;
    this.currentModel = config.model;

    // Reinitialize client if needed
    if (this.requiresReinit(config)) {
      await this.reinitializeClient(config);
    }
  }

  async getCurrentModel(): Promise<string> {
    return this.currentModel;
  }

  async getAvailableModels(): Promise<ModelInfo[]> {
    // Provider-specific implementation
    return this.fetchModelList();
  }

  protected abstract validateModelConfig(config: ModelConfig): Promise<void>;
  protected abstract requiresReinit(config: ModelConfig): boolean;
  protected abstract reinitializeClient(config: ModelConfig): Promise<void>;
  protected abstract fetchModelList(): Promise<ModelInfo[]>;
}
```

## Error Handling

### Comprehensive Error Strategy

```typescript
enum ModelErrorType {
  MODEL_NOT_FOUND = 'MODEL_NOT_FOUND',
  ACCESS_DENIED = 'ACCESS_DENIED',
  INVALID_API_KEY = 'INVALID_API_KEY',
  MODEL_DEPRECATED = 'MODEL_DEPRECATED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
}

class ModelError extends Error {
  constructor(
    public type: ModelErrorType,
    public provider: LLMProvider,
    public model: string,
    message: string,
    public suggestion?: string,
  ) {
    super(message);
    this.name = 'ModelError';
  }
}

class ModelErrorHandler {
  handle(error: ModelError): ErrorResponse {
    switch (error.type) {
      case ModelErrorType.MODEL_NOT_FOUND:
        return this.handleModelNotFound(error);

      case ModelErrorType.ACCESS_DENIED:
        return this.handleAccessDenied(error);

      case ModelErrorType.MODEL_DEPRECATED:
        return this.handleDeprecated(error);

      case ModelErrorType.QUOTA_EXCEEDED:
        return this.handleQuotaExceeded(error);

      default:
        return this.handleGenericError(error);
    }
  }

  private handleModelNotFound(error: ModelError): ErrorResponse {
    // Find similar models
    const similar = this.findSimilarModels(error.provider, error.model);

    return {
      message: `Model "${error.model}" not found for ${error.provider}`,
      suggestions: similar,
      actions: [
        'Run `/model --list ${error.provider}` to see available models',
        'Try one of these similar models: ${similar.join(", ")}',
      ],
    };
  }

  private handleAccessDenied(error: ModelError): ErrorResponse {
    // Suggest alternatives based on user's plan
    const alternatives = this.getAccessibleAlternatives(
      error.provider,
      error.model,
    );

    return {
      message: `You don't have access to ${error.model}`,
      suggestions: alternatives,
      actions: [
        'Upgrade your API plan for access',
        `Use ${alternatives[0]} as an alternative`,
        'Contact support for access requests',
      ],
    };
  }
}
```

### Graceful Fallbacks

```typescript
class ModelFallbackStrategy {
  async applyFallback(
    provider: LLMProvider,
    requestedModel: string,
    error: ModelError,
  ): Promise<string> {
    // 1. Try user-defined fallback
    const userFallback = this.config.getFallback(provider, requestedModel);
    if (userFallback && (await this.isAvailable(provider, userFallback))) {
      return userFallback;
    }

    // 2. Try category-based fallback
    const category = this.getModelCategory(requestedModel);
    const categoryFallback = this.getCategoryFallback(provider, category);
    if (
      categoryFallback &&
      (await this.isAvailable(provider, categoryFallback))
    ) {
      return categoryFallback;
    }

    // 3. Use provider default
    return this.getProviderDefault(provider);
  }
}
```

## Implementation Plan

### Phase 1: Foundation (Days 1-3)

- [ ] Implement ModelRegistry system
- [ ] Create model database with all provider models
- [ ] Build ModelValidator with availability checking
- [ ] Develop model compatibility matrix

### Phase 2: Command Enhancement (Days 4-6)

- [ ] Extend `/model` command parser
- [ ] Implement provider-specific syntax
- [ ] Add `--list`, `--show`, `--reset` subcommands
- [ ] Create interactive model selector

### Phase 3: Runtime Management (Days 7-9)

- [ ] Build RuntimeModelManager
- [ ] Implement hot-reload capability
- [ ] Add model switching without restart
- [ ] Create model configuration persistence

### Phase 4: Provider Integration (Days 10-12)

- [ ] Update GeminiProvider with model selection
- [ ] Update OpenAIProvider with model selection
- [ ] Update AnthropicProvider with model selection
- [ ] Test model switching across all providers

### Phase 5: Convergence Integration (Days 13-14)

- [ ] Integrate with convergence commands
- [ ] Add model override options
- [ ] Test multi-provider model combinations
- [ ] Optimize performance

### Phase 6: Polish & Testing (Days 15-16)

- [ ] Comprehensive error handling
- [ ] Visual feedback improvements
- [ ] Unit and integration tests
- [ ] Documentation and examples

## Usage Examples

### Basic Usage

```bash
# Set model for current provider
/model gpt-4

# Set model for specific provider
/model openai:gpt-4-turbo

# Set model for all providers
/model --all best-available
```

### Advanced Usage

```bash
# Set different models for each provider
/model gemini:gemini-1.5-pro openai:gpt-4 anthropic:claude-3-opus

# Use with convergence
/converge --models gemini:gemini-1.5-flash,openai:gpt-3.5-turbo "Quick question"

# Interactive selection
/model --interactive

# Show current configuration
/model --show
╔═══════════╤═════════════════╤══════════╗
║ Provider  │ Current Model   │ Context  ║
╟───────────┼─────────────────┼──────────╢
║ Gemini    │ gemini-1.5-pro  │ 1M       ║
║ OpenAI    │ gpt-4-turbo     │ 128K     ║
║ Anthropic │ claude-3-sonnet │ 100K     ║
╚═══════════╧═════════════════╧══════════╝
```

### Aliases and Shortcuts

```bash
# Create aliases for common configurations
/model --alias fast="gemini:flash,openai:gpt-3.5,anthropic:haiku"
/model --alias best="gemini:pro,openai:gpt-4,anthropic:opus"

# Use aliases
/model --use fast
/model --use best
```

## Testing Strategy

### Unit Tests

```typescript
describe('ModelRegistry', () => {
  it('should validate model availability', async () => {
    const available = await registry.isModelAvailable(
      LLMProvider.OPENAI,
      'gpt-4',
    );
    expect(available).toBe(true);
  });

  it('should find equivalent models across providers', () => {
    const equivalents = registry.findEquivalents('gpt-4');
    expect(equivalents.get(LLMProvider.GEMINI)).toBe('gemini-1.5-pro');
    expect(equivalents.get(LLMProvider.ANTHROPIC)).toBe('claude-3-opus');
  });
});
```

### Integration Tests

```typescript
describe('Model Selection E2E', () => {
  it('should switch models at runtime', async () => {
    const manager = new RuntimeModelManager();

    // Switch model
    const result = await manager.switchModel(LLMProvider.OPENAI, 'gpt-4-turbo');

    expect(result.success).toBe(true);

    // Verify model is active
    const response = await provider.generateContent('test');
    expect(response.model).toBe('gpt-4-turbo');
  });
});
```

## Conclusion

This multi-provider model selection feature seamlessly extends the existing `/model` command while adding powerful new capabilities for managing models across all LLM providers. The design prioritizes:

1. **Backward Compatibility** - Existing usage patterns continue to work
2. **Flexibility** - Multiple syntax options for different use cases
3. **Discovery** - Easy exploration of available models
4. **Validation** - Robust checking of model availability
5. **Integration** - Seamless fit with convergence features
6. **User Experience** - Clear feedback and helpful error messages

The implementation provides a foundation for sophisticated model management strategies, enabling users to optimize for performance, cost, or specific capabilities across their multi-provider setup.
