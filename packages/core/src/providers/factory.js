/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { LLMProvider, DEFAULT_MODELS, ProviderError, } from './types.js';
import { BaseLLMProvider } from './base.js';
import { BuiltinToolManager } from './tools/builtin-tool-manager.js';
import { MCPToolManager } from './tools/mcp-tool-manager.js';
/**
 * Factory class for creating LLM provider instances
 * Supports dynamic loading of providers and proper error handling
 */
export class LLMProviderFactory {
    static providerCache = new Map();
    /**
     * Create a provider instance based on configuration
     * Supports both builtin tools and advanced MCP integration
     */
    static async create(config) {
        // Validate configuration
        this.validateProviderConfig(config);
        // Ensure model is set with default fallback
        if (!config.model) {
            config.model = DEFAULT_MODELS[config.provider];
        }
        try {
            // Check if advanced MCP integration is requested
            if (config.enableMCP && config.mcpConfig && config.configInstance) {
                return await this.createMCPEnabledProvider(config);
            }
            // Use complete providers when builtin tools are enabled
            if (config.enableBuiltinTools && config.configInstance) {
                return await this.loadCompleteProvider(config);
            }
            // Use basic providers for standard API usage
            const provider = await this.createBasicProvider(config);
            // Initialize the provider
            await provider.initialize();
            return provider;
        }
        catch (error) {
            throw new ProviderError(`Failed to create provider ${config.provider}: ${error instanceof Error ? error.message : String(error)}`, config.provider, error instanceof Error ? error : undefined);
        }
    }
    /**
     * Create multiple providers for comparison or fallback
     */
    static async createMultiple(configs) {
        const providers = await Promise.allSettled(configs.map((config) => this.create(config)));
        const successful = [];
        const failed = [];
        providers.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                successful.push(result.value);
            }
            else {
                failed.push({
                    config: configs[index],
                    error: result.reason,
                });
            }
        });
        if (successful.length === 0) {
            throw new Error(`All providers failed to initialize: ${failed.map((f) => `${f.config.provider}: ${f.error.message}`).join(', ')}`);
        }
        // Log failed providers for debugging
        if (failed.length > 0) {
            console.warn(`Some providers failed to initialize: ${failed.map((f) => `${f.config.provider}: ${f.error.message}`).join(', ')}`);
        }
        return successful;
    }
    /**
     * Check if a provider is available
     */
    static async isProviderAvailable(provider) {
        try {
            await this.loadProviderClass(provider);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Get list of available providers
     */
    static async getAvailableProviders() {
        const providers = Object.values(LLMProvider);
        const available = [];
        for (const provider of providers) {
            if (await this.isProviderAvailable(provider)) {
                available.push(provider);
            }
        }
        return available;
    }
    /**
     * Create a provider with automatic fallback
     */
    static async createWithFallback(primaryConfig, fallbackConfigs = []) {
        const allConfigs = [primaryConfig, ...fallbackConfigs];
        for (let i = 0; i < allConfigs.length; i++) {
            const config = allConfigs[i];
            try {
                const provider = await this.create(config);
                // Test the provider with a health check
                if (provider instanceof BaseLLMProvider) {
                    const isHealthy = await provider.healthCheck();
                    if (isHealthy) {
                        if (i > 0) {
                            console.warn(`Primary provider ${primaryConfig.provider} failed, using fallback ${config.provider}`);
                        }
                        return provider;
                    }
                }
                else {
                    // For non-BaseLLMProvider instances, assume they're healthy
                    return provider;
                }
            }
            catch (error) {
                console.debug(`Provider ${config.provider} failed:`, error);
                // Continue to next fallback
            }
        }
        throw new Error(`All providers failed: ${allConfigs.map((c) => c.provider).join(', ')}`);
    }
    /**
     * Create basic provider instance
     */
    static async createBasicProvider(config) {
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
    /**
     * Load provider class dynamically
     */
    static async loadProviderClass(provider) {
        const cacheKey = provider;
        // Check cache first
        if (this.providerCache.has(cacheKey)) {
            return this.providerCache.get(cacheKey);
        }
        let ProviderClass;
        switch (provider) {
            case LLMProvider.GEMINI:
                try {
                    const { GeminiProvider } = await import('./gemini/provider.js');
                    ProviderClass = GeminiProvider;
                }
                catch (error) {
                    throw new Error(`Failed to load Gemini provider: ${error instanceof Error ? error.message : String(error)}. Ensure the Gemini provider is properly implemented.`);
                }
                break;
            case LLMProvider.OPENAI:
                try {
                    const { OpenAIProvider } = await import('./openai/provider.js');
                    ProviderClass = OpenAIProvider;
                }
                catch (error) {
                    throw new Error(`Failed to load OpenAI provider: ${error instanceof Error ? error.message : String(error)}. Ensure the OpenAI SDK is installed: npm install openai`);
                }
                break;
            case LLMProvider.ANTHROPIC:
                try {
                    const { AnthropicProvider } = await import('./anthropic/provider.js');
                    ProviderClass = AnthropicProvider;
                }
                catch (error) {
                    throw new Error(`Failed to load Anthropic provider: ${error instanceof Error ? error.message : String(error)}. Ensure the Anthropic SDK is installed: npm install @anthropic-ai/sdk`);
                }
                break;
            default:
                throw new Error(`Unsupported provider: ${provider}`);
        }
        // Cache the loaded class
        this.providerCache.set(cacheKey, ProviderClass);
        return ProviderClass;
    }
    /**
     * Load complete provider with builtin-tools integration
     */
    static async loadCompleteProvider(config) {
        const toolManager = new BuiltinToolManager(config.configInstance);
        await toolManager.initialize();
        switch (config.provider) {
            case LLMProvider.OPENAI:
                try {
                    const { OpenAICompleteProvider } = await import('./openai/provider-complete.js');
                    const provider = new OpenAICompleteProvider(config, toolManager);
                    await provider.initialize();
                    return provider;
                }
                catch (error) {
                    throw new Error(`Failed to load OpenAI complete provider: ${error instanceof Error ? error.message : String(error)}. Ensure the OpenAI SDK is installed: npm install openai`);
                }
            case LLMProvider.ANTHROPIC:
                try {
                    const { AnthropicCompleteProvider } = await import('./anthropic/provider-complete.js');
                    const provider = new AnthropicCompleteProvider(config, toolManager);
                    await provider.initialize();
                    return provider;
                }
                catch (error) {
                    throw new Error(`Failed to load Anthropic complete provider: ${error instanceof Error ? error.message : String(error)}. Ensure the Anthropic SDK is installed: npm install @anthropic-ai/sdk`);
                }
            case LLMProvider.GEMINI:
                try {
                    // For Gemini, we'll use the existing toolManager directly
                    // since it's already the native implementation
                    return toolManager;
                }
                catch (error) {
                    throw new Error(`Failed to load Gemini builtin tools: ${error instanceof Error ? error.message : String(error)}`);
                }
            default:
                throw new Error(`Builtin tools not supported for provider: ${config.provider}`);
        }
    }
    /**
     * Validate provider configuration
     */
    static validateProviderConfig(config) {
        if (!config.provider) {
            throw new Error('Provider is required in configuration');
        }
        if (!Object.values(LLMProvider).includes(config.provider)) {
            throw new Error(`Unsupported provider: ${config.provider}`);
        }
        // Provider-specific validation
        switch (config.provider) {
            case LLMProvider.OPENAI:
                if (!config.apiKey && !process.env.OPENAI_API_KEY) {
                    throw new ProviderError('OpenAI API key is required. Set OPENAI_API_KEY environment variable or provide apiKey in config.', config.provider);
                }
                break;
            case LLMProvider.ANTHROPIC:
                if (!config.apiKey && !process.env.ANTHROPIC_API_KEY) {
                    throw new ProviderError('Anthropic API key is required. Set ANTHROPIC_API_KEY environment variable or provide apiKey in config.', config.provider);
                }
                break;
            case LLMProvider.GEMINI:
                // Gemini can work with API key or OAuth, so more flexible validation
                if (!config.apiKey &&
                    !process.env.GEMINI_API_KEY &&
                    !process.env.GOOGLE_API_KEY) {
                    console.warn('No Gemini API key provided. Ensure you have authenticated via OAuth or provide an API key.');
                }
                break;
            default:
                // No additional validation needed for other providers
                break;
        }
        // Validate model name format if provided
        if (config.model && typeof config.model !== 'string') {
            throw new Error('Model must be a string');
        }
        // Validate numeric configurations
        if (config.maxRetries !== undefined &&
            (config.maxRetries < 0 || config.maxRetries > 10)) {
            throw new Error('maxRetries must be between 0 and 10');
        }
        if (config.timeout !== undefined &&
            (config.timeout < 1000 || config.timeout > 300000)) {
            throw new Error('timeout must be between 1000ms and 300000ms (5 minutes)');
        }
    }
    /**
     * Create provider with advanced MCP integration
     */
    static async createMCPEnabledProvider(config) {
        // Merge user MCP configuration with defaults
        const mcpConfig = MultiProviderMCPConfigMerger.merge(config.mcpConfig || {}, DEFAULT_MULTI_PROVIDER_MCP_CONFIG);
        // Initialize the advanced MCP tool manager
        const mcpToolManager = new MCPToolManager(config.configInstance);
        await mcpToolManager.initialize();
        switch (config.provider) {
            case LLMProvider.GEMINI:
                // Gemini already has built-in MCP support, but enhance it with advanced features
                const { createGeminiContentGenerator } = await import('../core/contentGenerator.js');
                const geminiProvider = createGeminiContentGenerator(config.configInstance);
                // Add MCP tool manager to the Gemini provider if possible
                if (typeof geminiProvider === 'object' && geminiProvider !== null) {
                    geminiProvider.mcpToolManager = mcpToolManager;
                }
                return geminiProvider;
            case LLMProvider.OPENAI:
                // Try to load MCP-enabled OpenAI provider
                try {
                    const { OpenAIProviderWithMCP } = await import('./openai/provider-with-tools.js');
                    const provider = new OpenAIProviderWithMCP({
                        ...config,
                        mcpConfig: MultiProviderMCPConfigMerger.getProviderConfig(mcpConfig, 'openai'),
                        mcpToolManager,
                    });
                    await provider.initialize();
                    return provider;
                }
                catch (error) {
                    console.warn(`Failed to load MCP-enabled OpenAI provider: ${error.message}`);
                    // Fallback to builtin-tools integration if available
                    if (config.enableBuiltinTools) {
                        return await this.loadCompleteProvider({ ...config, enableMCP: false });
                    }
                    throw new Error(`OpenAI MCP integration not available: ${error.message}`);
                }
            case LLMProvider.ANTHROPIC:
                // Try to load MCP-enabled Anthropic provider  
                try {
                    const { AnthropicProviderWithMCP } = await import('./anthropic/provider-with-tools.js');
                    const provider = new AnthropicProviderWithMCP({
                        ...config,
                        mcpConfig: MultiProviderMCPConfigMerger.getProviderConfig(mcpConfig, 'anthropic'),
                        mcpToolManager,
                    });
                    await provider.initialize();
                    return provider;
                }
                catch (error) {
                    console.warn(`Failed to load MCP-enabled Anthropic provider: ${error.message}`);
                    // Fallback to builtin-tools integration if available
                    if (config.enableBuiltinTools) {
                        return await this.loadCompleteProvider({ ...config, enableMCP: false });
                    }
                    throw new Error(`Anthropic MCP integration not available: ${error.message}`);
                }
            default:
                throw new Error(`MCP integration not supported for provider: ${config.provider}`);
        }
    }
    /**
     * Create a test configuration for a provider
     */
    static createTestConfig(provider, overrides = {}) {
        const baseConfig = {
            provider,
            model: DEFAULT_MODELS[provider],
            maxRetries: 3,
            timeout: 30000,
            enableMCP: false,
            enableBuiltinTools: true,
            ...overrides,
        };
        // Set test API keys if available
        switch (provider) {
            case LLMProvider.OPENAI:
                baseConfig.apiKey =
                    overrides.apiKey || process.env.OPENAI_API_KEY || 'test-key';
                break;
            case LLMProvider.ANTHROPIC:
                baseConfig.apiKey =
                    overrides.apiKey || process.env.ANTHROPIC_API_KEY || 'test-key';
                break;
            case LLMProvider.GEMINI:
                baseConfig.apiKey =
                    overrides.apiKey ||
                        process.env.GEMINI_API_KEY ||
                        process.env.GOOGLE_API_KEY;
                break;
            default:
                // No default API key for other providers
                break;
        }
        return baseConfig;
    }
    /**
     * Clear provider cache (useful for testing)
     */
    static clearCache() {
        this.providerCache.clear();
    }
}
//# sourceMappingURL=factory.js.map