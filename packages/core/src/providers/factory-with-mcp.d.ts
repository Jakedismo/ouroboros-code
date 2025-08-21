/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { ContentGenerator } from '../core/contentGenerator.js';
import { Config } from '../config/config.js';
import { MultiProviderMCPConfig } from '../config/multi-provider-mcp-config.js';
/**
 * LLM Provider types supported by the factory.
 */
export declare enum LLMProvider {
    GEMINI = "gemini",
    OPENAI = "openai",
    ANTHROPIC = "anthropic"
}
/**
 * Base configuration for LLM providers.
 */
export interface LLMProviderConfig {
    provider: LLMProvider;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    configInstance?: Config;
    mcpConfig?: Partial<MultiProviderMCPConfig>;
    enableMCP?: boolean;
    [key: string]: unknown;
}
/**
 * Factory for creating MCP-enabled LLM providers.
 * This factory creates providers with full MCP tool support.
 */
export declare class MCPEnabledProviderFactory {
    /**
     * Create an MCP-enabled content generator for the specified provider.
     * @param config Provider configuration.
     * @param enableMCP Whether to enable MCP support (default: true).
     * @returns Promise resolving to configured content generator.
     */
    static create(config: LLMProviderConfig, enableMCP?: boolean): Promise<ContentGenerator>;
    /**
     * Create a standard provider without MCP enhancements.
     * Falls back to existing provider implementations.
     */
    private static createStandardProvider;
    /**
     * Create Gemini provider (uses existing MCP-enabled implementation).
     */
    private static createGeminiProvider;
    /**
     * Create OpenAI provider with MCP support.
     */
    private static createOpenAIProviderWithMCP;
    /**
     * Create Anthropic provider with MCP support.
     */
    private static createAnthropicProviderWithMCP;
    /**
     * Create a Config instance from provider configuration.
     * This is a helper for cases where no Config instance is provided.
     */
    private static createConfigFromProviderConfig;
    /**
     * Validate provider configuration before creation.
     * @param config Provider configuration to validate.
     * @returns Array of validation errors (empty if valid).
     */
    static validateConfig(config: LLMProviderConfig): Promise<string[]>;
    /**
     * Get default configuration for a provider.
     * @param provider Provider type.
     * @returns Default configuration for the provider.
     */
    static getDefaultConfig(provider: LLMProvider): Partial<LLMProviderConfig>;
    /**
     * Create multiple providers for comparison or fallback scenarios.
     * @param configs Array of provider configurations.
     * @returns Promise resolving to array of content generators.
     */
    static createMultiple(configs: LLMProviderConfig[]): Promise<ContentGenerator[]>;
    /**
     * Create a provider with automatic fallback to alternatives.
     * @param primaryConfig Primary provider configuration.
     * @param fallbackConfigs Fallback provider configurations.
     * @returns Promise resolving to the first successfully created provider.
     */
    static createWithFallback(primaryConfig: LLMProviderConfig, fallbackConfigs?: LLMProviderConfig[]): Promise<ContentGenerator>;
    /**
     * Check if a provider is available and can be created.
     * @param provider Provider type to check.
     * @returns Promise resolving to availability status.
     */
    static isProviderAvailable(provider: LLMProvider): Promise<boolean>;
    /**
     * List all available providers.
     * @returns Promise resolving to array of available provider types.
     */
    static listAvailableProviders(): Promise<LLMProvider[]>;
}
