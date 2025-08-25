/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { ContentGenerator } from '../core/contentGenerator.js';
import {
  LLMProvider,
  LLMProviderConfig,
  DEFAULT_MODELS,
  ProviderError,
} from './types.js';
import { BaseLLMProvider } from './base.js';
import { BuiltinToolManager } from './tools/builtin-tool-manager.js';
import { MCPToolManager } from './tools/mcp-tool-manager.js';
import {
  MultiProviderMCPConfigMerger,
  DEFAULT_MULTI_PROVIDER_MCP_CONFIG,
} from '../config/multi-provider-mcp-config.js';

/**
 * Factory class for creating LLM provider instances
 * Supports dynamic loading of providers and proper error handling
 * Also supports extension-based providers for local inference
 */
export class LLMProviderFactory {
  private static providerCache = new Map<string, typeof BaseLLMProvider>();
  private static extensionProviderRegistry: any = null;

  /**
   * Create a provider instance based on configuration
   * Supports both builtin tools and advanced MCP integration
   */
  static async create(config: LLMProviderConfig): Promise<ContentGenerator> {
    console.log(`[LLMProviderFactory.create] Creating provider:`, {
      provider: config.provider,
      model: config.model,
      hasApiKey: !!config.apiKey,
      enableBuiltinTools: config.enableBuiltinTools,
      enableMCP: config.enableMCP,
    });
    
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
    } catch (error) {
      throw new ProviderError(
        `Failed to create provider ${config.provider}: ${error instanceof Error ? error.message : String(error)}`,
        config.provider,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Create multiple providers for comparison or fallback
   */
  static async createMultiple(
    configs: LLMProviderConfig[],
  ): Promise<ContentGenerator[]> {
    const providers = await Promise.allSettled(
      configs.map((config) => this.create(config)),
    );

    const successful: ContentGenerator[] = [];
    const failed: Array<{ config: LLMProviderConfig; error: Error }> = [];

    providers.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successful.push(result.value);
      } else {
        failed.push({
          config: configs[index],
          error: result.reason,
        });
      }
    });

    if (successful.length === 0) {
      throw new Error(
        `All providers failed to initialize: ${failed.map((f) => `${f.config.provider}: ${f.error.message}`).join(', ')}`,
      );
    }

    // Log failed providers for debugging
    if (failed.length > 0) {
      console.warn(
        `Some providers failed to initialize: ${failed.map((f) => `${f.config.provider}: ${f.error.message}`).join(', ')}`,
      );
    }

    return successful;
  }


  /**
   * Create a provider with automatic fallback
   */
  static async createWithFallback(
    primaryConfig: LLMProviderConfig,
    fallbackConfigs: LLMProviderConfig[] = [],
  ): Promise<ContentGenerator> {
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
              console.warn(
                `Primary provider ${primaryConfig.provider} failed, using fallback ${config.provider}`,
              );
            }
            return provider;
          }
        } else {
          // For non-BaseLLMProvider instances, assume they're healthy
          return provider;
        }
      } catch (error) {
        console.debug(`Provider ${config.provider} failed:`, error);
        // Continue to next fallback
      }
    }

    throw new Error(
      `All providers failed: ${allConfigs.map((c) => c.provider).join(', ')}`,
    );
  }

  /**
   * Create basic provider instance
   * First checks extension providers, then falls back to core providers
   */
  private static async createBasicProvider(
    config: LLMProviderConfig,
  ): Promise<BaseLLMProvider> {
    // First, try extension providers
    const extensionProvider = await this.tryCreateExtensionProvider(config);
    if (extensionProvider) {
      return extensionProvider;
    }

    // Fall back to core providers
    switch (config.provider) {
      case LLMProvider.GEMINI:
        const { GeminiProvider } = await import('./gemini/provider.js');
        return new GeminiProvider(config);
      
      case LLMProvider.OPENAI:
        // Use OpenAI provider
        const { OpenAIProvider } = await import('./openai/provider.js');
        return new OpenAIProvider(config);
      
      case LLMProvider.ANTHROPIC:
        // Use Anthropic provider
        const { AnthropicProvider } = await import('./anthropic/provider.js');
        return new AnthropicProvider(config);
      
      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }
  }

  /**
   * Try to create provider from extension registry
   */
  private static async tryCreateExtensionProvider(
    config: LLMProviderConfig,
  ): Promise<BaseLLMProvider | null> {
    // Dynamically import the extension registry to avoid circular dependencies
    if (!this.extensionProviderRegistry) {
      try {
        const { ExtensionProviderRegistry } = await import('../config/extension-provider-registry.js');
        this.extensionProviderRegistry = ExtensionProviderRegistry.getInstance();
      } catch (error) {
        // Extension system not available, return null
        return null;
      }
    }

    if (!this.extensionProviderRegistry.isProviderRegistered(config.provider)) {
      return null;
    }

    const providerInfo = this.extensionProviderRegistry.getProvider(config.provider);
    if (!providerInfo) {
      return null;
    }

    // Load provider class if not already loaded
    if (!providerInfo.providerClass) {
      try {
        const providerPath = require.resolve(
          path.resolve(providerInfo.extension.path, providerInfo.config.entryPoint)
        );
        const ProviderModule = await import(providerPath);
        const ProviderClass = ProviderModule.default || ProviderModule;
        
        // Validate provider class
        if (!this.isValidProviderClass(ProviderClass)) {
          throw new Error(`Invalid provider class in ${config.provider}`);
        }

        // Cache the provider class
        providerInfo.providerClass = ProviderClass;
      } catch (error) {
        console.error(`Failed to load extension provider ${config.provider}:`, error);
        return null;
      }
    }

    // Create provider instance
    return new providerInfo.providerClass(config);
  }

  /**
   * Check if provider is available (core or extension)
   */
  static async isProviderAvailable(provider: string): Promise<boolean> {
    // Check core providers
    try {
      if (Object.values(LLMProvider).includes(provider as LLMProvider)) {
        await this.loadProviderClass(provider as LLMProvider);
        return true;
      }
    } catch {
      // Core provider not available, continue to check extensions
    }

    // Check extension providers
    try {
      const { ExtensionProviderRegistry } = await import('../config/extension-provider-registry.js');
      const registry = ExtensionProviderRegistry.getInstance();
      return registry.isProviderRegistered(provider);
    } catch {
      return false;
    }
  }

  /**
   * Get list of all available providers (core + extensions)
   */
  static async getAvailableProviders(): Promise<string[]> {
    const coreProviders = Object.values(LLMProvider);
    
    try {
      const { ExtensionProviderRegistry } = await import('../config/extension-provider-registry.js');
      const registry = ExtensionProviderRegistry.getInstance();
      const extensionProviders = registry.getAvailableProviderIds();
      return [...coreProviders, ...extensionProviders];
    } catch {
      return coreProviders;
    }
  }

  /**
   * Validate if class is a valid provider class
   */
  private static isValidProviderClass(ProviderClass: any): boolean {
    return (
      typeof ProviderClass === 'function' &&
      ProviderClass.prototype &&
      (ProviderClass.prototype instanceof BaseLLMProvider ||
        typeof ProviderClass.prototype.generateContent === 'function')
    );
  }

  /**
   * Load provider class dynamically
   */
  private static async loadProviderClass(
    provider: LLMProvider,
  ): Promise<typeof BaseLLMProvider> {
    const cacheKey = provider;

    // Check cache first
    if (this.providerCache.has(cacheKey)) {
      return this.providerCache.get(cacheKey)!;
    }

    let ProviderClass: typeof BaseLLMProvider;

    switch (provider) {
      case LLMProvider.GEMINI:
        try {
          const { GeminiProvider } = await import('./gemini/provider.js');
          ProviderClass = GeminiProvider;
        } catch (error) {
          throw new Error(
            `Failed to load Gemini provider: ${error instanceof Error ? error.message : String(error)}. Ensure the Gemini provider is properly implemented.`,
          );
        }
        break;

      case LLMProvider.OPENAI:
        try {
          const { OpenAIProvider } = await import('./openai/provider.js');
          ProviderClass = OpenAIProvider;
        } catch (error) {
          throw new Error(
            `Failed to load OpenAI provider: ${error instanceof Error ? error.message : String(error)}. Ensure the OpenAI SDK is installed: npm install openai`,
          );
        }
        break;

      case LLMProvider.ANTHROPIC:
        try {
          const { AnthropicProvider } = await import('./anthropic/provider.js');
          ProviderClass = AnthropicProvider;
        } catch (error) {
          throw new Error(
            `Failed to load Anthropic provider: ${error instanceof Error ? error.message : String(error)}. Ensure the Anthropic SDK is installed: npm install @anthropic-ai/sdk`,
          );
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
  private static async loadCompleteProvider(
    config: LLMProviderConfig,
  ): Promise<ContentGenerator> {
    const toolManager = new BuiltinToolManager(config.configInstance);
    await toolManager.initialize();

    switch (config.provider) {
      case LLMProvider.OPENAI:
        try {
          // For now, use the basic OpenAI provider since complete provider doesn't exist yet
          const { OpenAIProvider } = await import('./openai/provider.js');
          const provider = new OpenAIProvider(config);
          await provider.initialize();
          return provider;
        } catch (error) {
          throw new Error(
            `Failed to load OpenAI provider: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

      case LLMProvider.ANTHROPIC:
        try {
          // For now, use the basic Anthropic provider since complete provider doesn't exist yet
          const { AnthropicProvider } = await import('./anthropic/provider.js');
          const provider = new AnthropicProvider(config);
          await provider.initialize();
          return provider;
        } catch (error) {
          throw new Error(
            `Failed to load Anthropic provider: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

      case LLMProvider.GEMINI:
        try {
          // For Gemini, use the regular provider with builtin tools support
          // The toolManager will be used by the provider internally
          const { GeminiProvider } = await import('./gemini/provider.js');
          const provider = new GeminiProvider(config);
          await provider.initialize();
          return provider;
        } catch (error) {
          throw new Error(
            `Failed to load Gemini provider with builtin tools: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

      default:
        throw new Error(`Builtin tools not supported for provider: ${config.provider}`);
    }
  }

  /**
   * Validate provider configuration
   */
  private static validateProviderConfig(config: LLMProviderConfig): void {
    if (!config.provider) {
      throw new Error('Provider is required in configuration');
    }

    if (!Object.values(LLMProvider).includes(config.provider)) {
      throw new Error(`Unsupported provider: ${config.provider}`);
    }

    // Provider-specific validation
    switch (config.provider) {
      case LLMProvider.OPENAI:
        if (!config.apiKey && !process.env['OPENAI_API_KEY']) {
          console.warn(
            '[OPENAI] No API key provided. Using test mode. Set OPENAI_API_KEY environment variable for actual API calls.',
          );
          // Set a test API key to allow initialization
          config.apiKey = 'test-openai-key';
        }
        break;

      case LLMProvider.ANTHROPIC:
        if (!config.apiKey && !process.env['ANTHROPIC_API_KEY']) {
          console.warn(
            '[ANTHROPIC] No API key provided. Using test mode. Set ANTHROPIC_API_KEY environment variable for actual API calls.',
          );
          // Set a test API key to allow initialization
          config.apiKey = 'test-anthropic-key';
        }
        break;

      case LLMProvider.GEMINI:
        // Gemini can work with API key or OAuth, so more flexible validation
        if (
          !config.apiKey &&
          !process.env['GEMINI_API_KEY'] &&
          !process.env['GOOGLE_API_KEY']
        ) {
          console.warn(
            'No Gemini API key provided. Ensure you have authenticated via OAuth or provide an API key.',
          );
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
    if (
      config.maxRetries !== undefined &&
      (config.maxRetries < 0 || config.maxRetries > 10)
    ) {
      throw new Error('maxRetries must be between 0 and 10');
    }

    if (
      config.timeout !== undefined &&
      (config.timeout < 1000 || config.timeout > 300000)
    ) {
      throw new Error(
        'timeout must be between 1000ms and 300000ms (5 minutes)',
      );
    }
  }

  /**
   * Create provider with advanced MCP integration
   */
  private static async createMCPEnabledProvider(
    config: LLMProviderConfig,
  ): Promise<ContentGenerator> {
    // Merge user MCP configuration with defaults
    const mcpConfig = MultiProviderMCPConfigMerger.merge(
      config.mcpConfig || {},
      DEFAULT_MULTI_PROVIDER_MCP_CONFIG,
    );

    // Initialize the advanced MCP tool manager
    const mcpToolManager = new MCPToolManager(config.configInstance);
    await mcpToolManager.initialize();

    switch (config.provider) {
      case LLMProvider.GEMINI:
        // Create Gemini provider with MCP integration
        const { GeminiProvider } = await import('./gemini/provider.js');
        const geminiProvider = new GeminiProvider({
          ...config,
          mcpConfig: MultiProviderMCPConfigMerger.getProviderConfig(mcpConfig, 'gemini'),
        });
        await geminiProvider.initialize();
        return geminiProvider;

      case LLMProvider.OPENAI:
        // Try to load MCP-enabled OpenAI provider
        try {
          const { OpenAIProviderWithMCP } = await import('./openai/provider-with-tools.js');
          const provider = new OpenAIProviderWithMCP({
            ...config,
            mcpConfig: MultiProviderMCPConfigMerger.getProviderConfig(mcpConfig, 'openai'),
          });
          await provider.initialize();
          return provider;
        } catch (error) {
          console.warn(`Failed to load MCP-enabled OpenAI provider: ${(error as Error).message}`);
          // Fallback to builtin-tools integration if available
          if (config.enableBuiltinTools) {
            return await this.loadCompleteProvider({ ...config, enableMCP: false });
          }
          throw new Error(`OpenAI MCP integration not available: ${(error as Error).message}`);
        }

      case LLMProvider.ANTHROPIC:
        // Try to load MCP-enabled Anthropic provider  
        try {
          const { AnthropicProviderWithMCP } = await import('./anthropic/provider-with-tools.js');
          const provider = new AnthropicProviderWithMCP({
            ...config,
            mcpConfig: MultiProviderMCPConfigMerger.getProviderConfig(mcpConfig, 'anthropic'),
          });
          await provider.initialize();
          return provider;
        } catch (error) {
          console.warn(`Failed to load MCP-enabled Anthropic provider: ${(error as Error).message}`);
          // Fallback to builtin-tools integration if available
          if (config.enableBuiltinTools) {
            return await this.loadCompleteProvider({ ...config, enableMCP: false });
          }
          throw new Error(`Anthropic MCP integration not available: ${(error as Error).message}`);
        }

      default:
        throw new Error(`MCP integration not supported for provider: ${config.provider}`);
    }
  }

  /**
   * Create a test configuration for a provider
   */
  static createTestConfig(
    provider: LLMProvider,
    overrides: Partial<LLMProviderConfig> = {},
  ): LLMProviderConfig {
    const baseConfig: LLMProviderConfig = {
      provider,
      model: DEFAULT_MODELS[provider],
      maxRetries: 3,
      timeout: 30000,
      enableMCP: true,
      enableBuiltinTools: true,
      ...overrides,
    };

    // Set test API keys if available
    switch (provider) {
      case LLMProvider.OPENAI:
        baseConfig.apiKey =
          overrides.apiKey || process.env['OPENAI_API_KEY'] || 'test-key';
        break;
      case LLMProvider.ANTHROPIC:
        baseConfig.apiKey =
          overrides.apiKey || process.env['ANTHROPIC_API_KEY'] || 'test-key';
        break;
      case LLMProvider.GEMINI:
        baseConfig.apiKey =
          overrides.apiKey ||
          process.env['GEMINI_API_KEY'] ||
          process.env['GOOGLE_API_KEY'];
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
  static clearCache(): void {
    this.providerCache.clear();
  }
}
