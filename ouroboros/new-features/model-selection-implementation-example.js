/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Multi-Provider Model Selection - Implementation Example
 *
 * This file demonstrates how the core components work together
 * to enable model selection across all providers.
 */
import { LLMProvider } from '../providers/types';
// ============================================================================
// 1. Model Registry Implementation Example
// ============================================================================
class ModelRegistry {
    models = new Map();
    currentModels = new Map();
    equivalencies = new Map();
    constructor() {
        this.initializeModels();
        this.initializeEquivalencies();
    }
    initializeModels() {
        // Register Gemini models
        this.models.set(LLMProvider.GEMINI, [
            {
                id: 'gemini-1.5-pro',
                name: 'Gemini 1.5 Pro',
                capabilities: {
                    maxTokens: 8192,
                    contextWindow: 1048576,
                    supportsFunctions: true,
                    supportsVision: true,
                    supportsStreaming: true,
                },
                pricing: { input: 0.0035, output: 0.0105 },
            },
            {
                id: 'gemini-1.5-flash',
                name: 'Gemini 1.5 Flash',
                capabilities: {
                    maxTokens: 8192,
                    contextWindow: 100000,
                    supportsFunctions: true,
                    supportsVision: true,
                    supportsStreaming: true,
                },
                pricing: { input: 0.00035, output: 0.00105 },
            },
        ]);
        // Register OpenAI models
        this.models.set(LLMProvider.OPENAI, [
            {
                id: 'gpt-4-turbo',
                name: 'GPT-4 Turbo',
                capabilities: {
                    maxTokens: 4096,
                    contextWindow: 128000,
                    supportsFunctions: true,
                    supportsVision: true,
                    supportsStreaming: true,
                },
                pricing: { input: 0.01, output: 0.03 },
            },
            {
                id: 'gpt-4',
                name: 'GPT-4',
                capabilities: {
                    maxTokens: 4096,
                    contextWindow: 32768,
                    supportsFunctions: true,
                    supportsVision: false,
                    supportsStreaming: true,
                },
                pricing: { input: 0.03, output: 0.06 },
            },
            {
                id: 'gpt-3.5-turbo',
                name: 'GPT-3.5 Turbo',
                capabilities: {
                    maxTokens: 4096,
                    contextWindow: 16384,
                    supportsFunctions: true,
                    supportsVision: false,
                    supportsStreaming: true,
                },
                pricing: { input: 0.0005, output: 0.0015 },
            },
        ]);
        // Register Anthropic models
        this.models.set(LLMProvider.ANTHROPIC, [
            {
                id: 'claude-3-opus-20240229',
                name: 'Claude 3 Opus',
                capabilities: {
                    maxTokens: 4096,
                    contextWindow: 200000,
                    supportsFunctions: true,
                    supportsVision: true,
                    supportsStreaming: true,
                },
                pricing: { input: 0.015, output: 0.075 },
            },
            {
                id: 'claude-3-sonnet-20240229',
                name: 'Claude 3 Sonnet',
                capabilities: {
                    maxTokens: 4096,
                    contextWindow: 100000,
                    supportsFunctions: true,
                    supportsVision: true,
                    supportsStreaming: true,
                },
                pricing: { input: 0.003, output: 0.015 },
            },
        ]);
    }
    initializeEquivalencies() {
        // Best performance models
        this.equivalencies.set('best-available', new Map([
            [LLMProvider.GEMINI, 'gemini-1.5-pro'],
            [LLMProvider.OPENAI, 'gpt-4-turbo'],
            [LLMProvider.ANTHROPIC, 'claude-3-opus-20240229'],
        ]));
        // Fastest models
        this.equivalencies.set('fastest', new Map([
            [LLMProvider.GEMINI, 'gemini-1.5-flash'],
            [LLMProvider.OPENAI, 'gpt-3.5-turbo'],
            [LLMProvider.ANTHROPIC, 'claude-3-haiku-20240307'],
        ]));
        // Balanced models
        this.equivalencies.set('balanced', new Map([
            [LLMProvider.GEMINI, 'gemini-1.5-flash'],
            [LLMProvider.OPENAI, 'gpt-4'],
            [LLMProvider.ANTHROPIC, 'claude-3-sonnet-20240229'],
        ]));
    }
    async getAvailableModels(provider) {
        return this.models.get(provider) || [];
    }
    async isModelAvailable(provider, modelId) {
        const models = await this.getAvailableModels(provider);
        return models.some((m) => m.id === modelId);
    }
    async setModel(provider, modelId) {
        if (!(await this.isModelAvailable(provider, modelId))) {
            throw new Error(`Model ${modelId} not available for ${provider}`);
        }
        this.currentModels.set(provider, modelId);
    }
    getCurrentModel(provider) {
        return this.currentModels.get(provider) || this.getDefaultModel(provider);
    }
    getDefaultModel(provider) {
        const defaults = {
            [LLMProvider.GEMINI]: 'gemini-1.5-pro',
            [LLMProvider.OPENAI]: 'gpt-3.5-turbo',
            [LLMProvider.ANTHROPIC]: 'claude-3-sonnet-20240229',
        };
        return defaults[provider];
    }
    findEquivalents(modelSpec) {
        // Check if it's a special keyword
        if (this.equivalencies.has(modelSpec)) {
            return this.equivalencies.get(modelSpec);
        }
        // Try to find similar models across providers
        const result = new Map();
        // Simple heuristic: if it contains "4", use tier-1 models
        if (modelSpec.includes('4') ||
            modelSpec.includes('opus') ||
            modelSpec.includes('pro')) {
            result.set(LLMProvider.GEMINI, 'gemini-1.5-pro');
            result.set(LLMProvider.OPENAI, 'gpt-4');
            result.set(LLMProvider.ANTHROPIC, 'claude-3-opus-20240229');
        }
        else {
            result.set(LLMProvider.GEMINI, 'gemini-1.5-flash');
            result.set(LLMProvider.OPENAI, 'gpt-3.5-turbo');
            result.set(LLMProvider.ANTHROPIC, 'claude-3-sonnet-20240229');
        }
        return result;
    }
}
class ModelCommandParser {
    parse(input) {
        // Remove '/model' prefix if present
        const cleanInput = input.replace(/^\/model\s*/, '').trim();
        // Check for subcommands
        if (cleanInput.startsWith('--list') || cleanInput === '-l') {
            return this.parseListCommand(cleanInput);
        }
        if (cleanInput.startsWith('--show') || cleanInput === '--current') {
            return { action: 'get', scope: 'all' };
        }
        if (cleanInput.startsWith('--reset')) {
            return this.parseResetCommand(cleanInput);
        }
        if (cleanInput.startsWith('--all')) {
            return this.parseGlobalCommand(cleanInput);
        }
        // Check for provider:model syntax
        if (cleanInput.includes(':')) {
            return this.parseProviderSpecific(cleanInput);
        }
        // Default: set model for current provider
        return {
            action: 'set',
            scope: 'provider',
            model: cleanInput,
        };
    }
    parseProviderSpecific(input) {
        const parts = input.split(/\s+/);
        const requests = [];
        for (const part of parts) {
            if (part.includes(':')) {
                const [providerStr, model] = part.split(':');
                const provider = this.parseProvider(providerStr);
                if (provider && model) {
                    return {
                        action: 'set',
                        scope: 'provider',
                        provider,
                        model,
                    };
                }
            }
        }
        throw new Error(`Invalid provider:model syntax: ${input}`);
    }
    parseProvider(str) {
        const normalized = str.toLowerCase();
        if (normalized === 'gemini')
            return LLMProvider.GEMINI;
        if (normalized === 'openai' || normalized === 'gpt')
            return LLMProvider.OPENAI;
        if (normalized === 'anthropic' || normalized === 'claude')
            return LLMProvider.ANTHROPIC;
        return null;
    }
    parseListCommand(input) {
        const parts = input.split(/\s+/);
        if (parts.length > 1) {
            const provider = this.parseProvider(parts[1]);
            if (provider) {
                return { action: 'list', scope: 'provider', provider };
            }
        }
        return { action: 'list', scope: 'all' };
    }
    parseResetCommand(input) {
        const parts = input.split(/\s+/);
        if (parts.length > 1) {
            const provider = this.parseProvider(parts[1]);
            if (provider) {
                return { action: 'reset', scope: 'provider', provider };
            }
        }
        return { action: 'reset', scope: 'all' };
    }
    parseGlobalCommand(input) {
        const modelMatch = input.match(/--all\s+(.+)/);
        if (modelMatch) {
            return {
                action: 'set',
                scope: 'all',
                model: modelMatch[1].trim(),
            };
        }
        throw new Error('Model name required after --all');
    }
}
// ============================================================================
// 3. Runtime Model Manager Implementation Example
// ============================================================================
class RuntimeModelManager {
    registry;
    providers; // Provider instances
    config;
    constructor() {
        this.registry = new ModelRegistry();
        this.providers = new Map();
        this.config = new ModelConfigPersistence();
    }
    async switchModel(provider, newModel) {
        // 1. Validate model
        const isAvailable = await this.registry.isModelAvailable(provider, newModel);
        if (!isAvailable) {
            return {
                success: false,
                error: `Model ${newModel} not available for ${provider}`,
            };
        }
        // 2. Get current model
        const previousModel = this.registry.getCurrentModel(provider);
        // 3. Update registry
        await this.registry.setModel(provider, newModel);
        // 4. Reconfigure provider if it exists
        const providerInstance = this.providers.get(provider);
        if (providerInstance) {
            try {
                await providerInstance.reconfigure({ model: newModel });
            }
            catch (error) {
                // Rollback on failure
                await this.registry.setModel(provider, previousModel);
                return {
                    success: false,
                    error: `Failed to reconfigure provider: ${error.message}`,
                };
            }
        }
        // 5. Persist configuration
        await this.config.saveModel(provider, newModel);
        return {
            success: true,
            previousModel,
            currentModel: newModel,
        };
    }
    async switchAllModels(modelSpec) {
        const results = new Map();
        // Find equivalent models for each provider
        const equivalents = this.registry.findEquivalents(modelSpec);
        // Switch each provider
        for (const [provider, model] of equivalents) {
            const result = await this.switchModel(provider, model);
            results.set(provider, result);
        }
        return results;
    }
    async getCurrentConfiguration() {
        const config = new Map();
        for (const provider of [
            LLMProvider.GEMINI,
            LLMProvider.OPENAI,
            LLMProvider.ANTHROPIC,
        ]) {
            const modelId = this.registry.getCurrentModel(provider);
            const models = await this.registry.getAvailableModels(provider);
            const modelInfo = models.find((m) => m.id === modelId);
            if (modelInfo) {
                config.set(provider, modelInfo);
            }
        }
        return config;
    }
}
// ============================================================================
// 4. Model Command Executor Implementation Example
// ============================================================================
class ModelCommandExecutor {
    parser;
    manager;
    ui;
    constructor() {
        this.parser = new ModelCommandParser();
        this.manager = new RuntimeModelManager();
        this.ui = new ModelCommandUI();
    }
    async execute(input) {
        try {
            // Parse command
            const request = this.parser.parse(input);
            // Execute based on action
            switch (request.action) {
                case 'set':
                    await this.handleSet(request);
                    break;
                case 'list':
                    await this.handleList(request);
                    break;
                case 'get':
                    await this.handleGet(request);
                    break;
                case 'reset':
                    await this.handleReset(request);
                    break;
            }
        }
        catch (error) {
            this.ui.showError(error.message);
        }
    }
    async handleSet(request) {
        if (request.scope === 'all' && request.model) {
            // Set for all providers
            const results = await this.manager.switchAllModels(request.model);
            this.ui.showBatchResults(results);
        }
        else if (request.provider && request.model) {
            // Set for specific provider
            const result = await this.manager.switchModel(request.provider, request.model);
            this.ui.showSwitchResult(request.provider, result);
        }
        else if (request.model) {
            // Set for current provider (default to Gemini for this example)
            const result = await this.manager.switchModel(LLMProvider.GEMINI, request.model);
            this.ui.showSwitchResult(LLMProvider.GEMINI, result);
        }
    }
    async handleList(request) {
        if (request.provider) {
            // List for specific provider
            const models = await this.manager.registry.getAvailableModels(request.provider);
            this.ui.showProviderModels(request.provider, models);
        }
        else {
            // List all
            this.ui.showAllModels(this.manager.registry);
        }
    }
    async handleGet(request) {
        const config = await this.manager.getCurrentConfiguration();
        this.ui.showCurrentConfiguration(config);
    }
    async handleReset(request) {
        // Reset logic would go here
        this.ui.showMessage('Models reset to defaults');
    }
}
// ============================================================================
// 5. UI Component Implementation Example
// ============================================================================
class ModelCommandUI {
    showSwitchResult(provider, result) {
        if (result.success) {
            console.log(`✅ Model updated for ${provider}`);
            console.log(`Previous: ${result.previousModel}`);
            console.log(`Current: ${result.currentModel}`);
        }
        else {
            console.log(`❌ Failed to update model for ${provider}`);
            console.log(`Error: ${result.error}`);
        }
    }
    showBatchResults(results) {
        console.log('🔄 Updating models for all providers...\n');
        for (const [provider, result] of results) {
            if (result.success) {
                console.log(`✅ ${provider}: ${result.currentModel}`);
            }
            else {
                console.log(`❌ ${provider}: ${result.error}`);
            }
        }
    }
    showProviderModels(provider, models) {
        console.log(`\n📋 Available models for ${provider}:\n`);
        for (const model of models) {
            const context = this.formatTokens(model.capabilities.contextWindow);
            const price = `$${model.pricing?.input}/1K`;
            console.log(`  • ${model.name} (${context} context, ${price})`);
        }
    }
    showAllModels(registry) {
        console.log('\n📋 Available Models by Provider:\n');
        for (const provider of [
            LLMProvider.GEMINI,
            LLMProvider.OPENAI,
            LLMProvider.ANTHROPIC,
        ]) {
            const models = registry.getAvailableModels(provider);
            this.showProviderModels(provider, models);
        }
    }
    showCurrentConfiguration(config) {
        console.log('\n Current Model Configuration:');
        console.log('╔═══════════╤═════════════════╤══════════╗');
        console.log('║ Provider  │ Current Model   │ Context  ║');
        console.log('╟───────────┼─────────────────┼──────────╢');
        for (const [provider, model] of config) {
            const context = this.formatTokens(model.capabilities.contextWindow);
            console.log(`║ ${provider.padEnd(9)} │ ${model.id.padEnd(15)} │ ${context.padEnd(8)} ║`);
        }
        console.log('╚═══════════╧═════════════════╧══════════╝');
    }
    showError(message) {
        console.log(`❌ Error: ${message}`);
    }
    showMessage(message) {
        console.log(message);
    }
    formatTokens(tokens) {
        if (tokens >= 1000000) {
            return `${(tokens / 1000000).toFixed(1)}M`;
        }
        if (tokens >= 1000) {
            return `${(tokens / 1000).toFixed(0)}K`;
        }
        return `${tokens}`;
    }
}
// ============================================================================
// 6. Configuration Persistence Implementation Example
// ============================================================================
class ModelConfigPersistence {
    configPath = '~/.gemini-cli/model-config.json';
    config;
    async saveModel(provider, model) {
        if (!this.config) {
            this.config = await this.load();
        }
        this.config.models[provider] = model;
        // Add to history
        if (this.config.history.enabled) {
            this.config.history.recentModels.push({
                provider,
                model,
                timestamp: new Date(),
            });
            // Trim history if too long
            if (this.config.history.recentModels.length >
                this.config.history.maxHistorySize) {
                this.config.history.recentModels.shift();
            }
        }
        await this.save(this.config);
    }
    async load() {
        // In a real implementation, this would read from disk
        return {
            models: {
                [LLMProvider.GEMINI]: 'gemini-1.5-pro',
                [LLMProvider.OPENAI]: 'gpt-3.5-turbo',
                [LLMProvider.ANTHROPIC]: 'claude-3-sonnet-20240229',
            },
            defaults: {
                [LLMProvider.GEMINI]: 'gemini-1.5-pro',
                [LLMProvider.OPENAI]: 'gpt-3.5-turbo',
                [LLMProvider.ANTHROPIC]: 'claude-3-sonnet-20240229',
            },
            preferences: {
                autoSelectBest: false,
                preferLatestModels: true,
                costOptimization: 'balanced',
                validateOnStartup: true,
                showModelWarnings: true,
            },
            aliases: {},
            history: {
                enabled: true,
                recentModels: [],
                maxHistorySize: 10,
            },
        };
    }
    async save(config) {
        // In a real implementation, this would write to disk
        console.log('Saving configuration:', config);
    }
}
// ============================================================================
// 7. Usage Example
// ============================================================================
async function main() {
    const executor = new ModelCommandExecutor();
    // Example commands
    await executor.execute('/model --list');
    await executor.execute('/model gpt-4');
    await executor.execute('/model openai:gpt-4-turbo');
    await executor.execute('/model --all best-available');
    await executor.execute('/model --show');
}
// Export for use in other modules
export { ModelRegistry, ModelCommandParser, RuntimeModelManager, ModelCommandExecutor, ModelCommandUI, ModelConfigPersistence, };
//# sourceMappingURL=model-selection-implementation-example.js.map