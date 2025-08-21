/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { MultiProviderMCPConfigMerger, DEFAULT_MULTI_PROVIDER_MCP_CONFIG, } from '../config/multi-provider-mcp-config.js';
/**
 * LLM Provider types supported by the factory.
 */
export var LLMProvider;
(function (LLMProvider) {
    LLMProvider["GEMINI"] = "gemini";
    LLMProvider["OPENAI"] = "openai";
    LLMProvider["ANTHROPIC"] = "anthropic";
})(LLMProvider || (LLMProvider = {}));
/**
 * Factory for creating MCP-enabled LLM providers.
 * This factory creates providers with full MCP tool support.
 */
export class MCPEnabledProviderFactory {
    /**
     * Create an MCP-enabled content generator for the specified provider.
     * @param config Provider configuration.
     * @param enableMCP Whether to enable MCP support (default: true).
     * @returns Promise resolving to configured content generator.
     */
    static async create(config, enableMCP = true) {
        // If MCP is disabled, fall back to standard provider creation
        if (!enableMCP) {
            return this.createStandardProvider(config);
        }
        // Merge MCP configuration
        const mcpConfig = MultiProviderMCPConfigMerger.merge(config.mcpConfig || {}, DEFAULT_MULTI_PROVIDER_MCP_CONFIG);
        let provider;
        switch (config.provider) {
            case LLMProvider.GEMINI:
                // Gemini already has MCP support in the existing system
                provider = await this.createGeminiProvider(config, mcpConfig);
                break;
            case LLMProvider.OPENAI:
                provider = await this.createOpenAIProviderWithMCP(config, mcpConfig);
                break;
            case LLMProvider.ANTHROPIC:
                provider = await this.createAnthropicProviderWithMCP(config, mcpConfig);
                break;
            default:
                throw new Error(`Unsupported provider: ${config.provider}`);
        }
        return provider;
    }
    /**
     * Create a standard provider without MCP enhancements.
     * Falls back to existing provider implementations.
     */
    static async createStandardProvider(config) {
        switch (config.provider) {
            case LLMProvider.GEMINI:
                return this.createGeminiProvider(config);
            default:
                throw new Error(`Standard provider creation not yet implemented for: ${config.provider}`);
        }
    }
    /**
     * Create Gemini provider (uses existing MCP-enabled implementation).
     */
    static async createGeminiProvider(config, _mcpConfig) {
        // Import existing Gemini implementation
        const { createGeminiContentGenerator } = await import('../core/contentGenerator.js');
        // Use the existing Config instance or create based on configuration
        const configInstance = config.configInstance || this.createConfigFromProviderConfig(config);
        // Create standard Gemini provider (already has MCP support)
        return createGeminiContentGenerator(configInstance);
    }
    /**
     * Create OpenAI provider with MCP support.
     */
    static async createOpenAIProviderWithMCP(config, mcpConfig) {
        // Dynamically import OpenAI provider when it's available
        try {
            const { OpenAIProviderWithMCP } = await import('./openai/provider-with-tools.js');
            const providerInstance = new OpenAIProviderWithMCP({
                ...config,
                mcpConfig: MultiProviderMCPConfigMerger.getProviderConfig(mcpConfig, 'openai'),
            });
            await providerInstance.initialize();
            return providerInstance;
        }
        catch (error) {
            console.error('Failed to load OpenAI provider with MCP:', error);
            throw new Error(`OpenAI provider with MCP is not yet available. Error: ${error.message}`);
        }
    }
    /**
     * Create Anthropic provider with MCP support.
     */
    static async createAnthropicProviderWithMCP(config, mcpConfig) {
        // Dynamically import Anthropic provider when it's available
        try {
            const { AnthropicProviderWithMCP } = await import('./anthropic/provider-with-tools.js');
            const providerInstance = new AnthropicProviderWithMCP({
                ...config,
                mcpConfig: MultiProviderMCPConfigMerger.getProviderConfig(mcpConfig, 'anthropic'),
            });
            await providerInstance.initialize();
            return providerInstance;
        }
        catch (error) {
            console.error('Failed to load Anthropic provider with MCP:', error);
            throw new Error(`Anthropic provider with MCP is not yet available. Error: ${error.message}`);
        }
    }
    /**
     * Create a Config instance from provider configuration.
     * This is a helper for cases where no Config instance is provided.
     */
    static async createConfigFromProviderConfig(_config) {
        // Import the Config constructor
        const { Config: ConfigClass } = await import('../config/config.js');
        // Create a basic config instance
        // Note: This is a simplified version - in practice, you'd want to
        // properly configure the Config with all necessary settings
        const configInstance = new ConfigClass.Config();
        return configInstance;
    }
    /**
     * Validate provider configuration before creation.
     * @param config Provider configuration to validate.
     * @returns Array of validation errors (empty if valid).
     */
    static async validateConfig(config) {
        const errors = [];
        // Validate provider type
        if (!Object.values(LLMProvider).includes(config.provider)) {
            errors.push(`Invalid provider: ${config.provider}`);
        }
        // Provider-specific validation
        switch (config.provider) {
            case LLMProvider.OPENAI:
                if (!config.apiKey && !process.env.OPENAI_API_KEY) {
                    errors.push('OpenAI API key is required');
                }
                break;
            case LLMProvider.ANTHROPIC:
                if (!config.apiKey && !process.env.ANTHROPIC_API_KEY) {
                    errors.push('Anthropic API key is required');
                }
                break;
            case LLMProvider.GEMINI:
                // Gemini validation handled by existing Config system
                break;
            default:
                errors.push(`Unsupported provider: ${config.provider}`);
                break;
        }
        // Validate MCP configuration if provided
        if (config.mcpConfig) {
            const { MultiProviderMCPConfigValidator } = await import('../config/multi-provider-mcp-config.js');
            const mcpErrors = MultiProviderMCPConfigValidator.validate(config.mcpConfig);
            errors.push(...mcpErrors);
        }
        return errors;
    }
    /**
     * Get default configuration for a provider.
     * @param provider Provider type.
     * @returns Default configuration for the provider.
     */
    static getDefaultConfig(provider) {
        const baseConfig = {
            provider,
            enableMCP: true,
            mcpConfig: DEFAULT_MULTI_PROVIDER_MCP_CONFIG,
        };
        switch (provider) {
            case LLMProvider.OPENAI:
                return {
                    ...baseConfig,
                    model: 'gpt-4',
                    baseUrl: 'https://api.openai.com/v1',
                };
            case LLMProvider.ANTHROPIC:
                return {
                    ...baseConfig,
                    model: 'claude-3-5-sonnet-20241022',
                    baseUrl: 'https://api.anthropic.com',
                };
            case LLMProvider.GEMINI:
                return {
                    ...baseConfig,
                    model: 'gemini-1.5-pro-latest',
                };
            default:
                return baseConfig;
        }
    }
    /**
     * Create multiple providers for comparison or fallback scenarios.
     * @param configs Array of provider configurations.
     * @returns Promise resolving to array of content generators.
     */
    static async createMultiple(configs) {
        const creationPromises = configs.map((config) => this.create(config));
        const results = await Promise.allSettled(creationPromises);
        const providers = [];
        const errors = [];
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            if (result.status === 'fulfilled') {
                providers.push(result.value);
            }
            else {
                errors.push(`Failed to create provider ${configs[i].provider}: ${result.reason}`);
            }
        }
        if (errors.length > 0) {
            console.warn('Some providers failed to initialize:', errors);
        }
        return providers;
    }
    /**
     * Create a provider with automatic fallback to alternatives.
     * @param primaryConfig Primary provider configuration.
     * @param fallbackConfigs Fallback provider configurations.
     * @returns Promise resolving to the first successfully created provider.
     */
    static async createWithFallback(primaryConfig, fallbackConfigs = []) {
        const allConfigs = [primaryConfig, ...fallbackConfigs];
        for (const config of allConfigs) {
            try {
                const provider = await this.create(config);
                return provider;
            }
            catch (error) {
                console.warn(`Failed to create provider ${config.provider}:`, error);
                // Continue to next fallback
            }
        }
        throw new Error('All provider creation attempts failed');
    }
    /**
     * Check if a provider is available and can be created.
     * @param provider Provider type to check.
     * @returns Promise resolving to availability status.
     */
    static async isProviderAvailable(provider) {
        try {
            switch (provider) {
                case LLMProvider.GEMINI:
                    return true; // Always available
                case LLMProvider.OPENAI:
                    // Check if OpenAI provider implementation exists
                    await import('./openai/provider-with-tools.js');
                    return true;
                case LLMProvider.ANTHROPIC:
                    // Check if Anthropic provider implementation exists
                    await import('./anthropic/provider-with-tools.js');
                    return true;
                default:
                    return false;
            }
        }
        catch {
            return false;
        }
    }
    /**
     * List all available providers.
     * @returns Promise resolving to array of available provider types.
     */
    static async listAvailableProviders() {
        const availableProviders = [];
        for (const provider of Object.values(LLMProvider)) {
            if (await this.isProviderAvailable(provider)) {
                availableProviders.push(provider);
            }
        }
        return availableProviders;
    }
}
//# sourceMappingURL=factory-with-mcp.js.map