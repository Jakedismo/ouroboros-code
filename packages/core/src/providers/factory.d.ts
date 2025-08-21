/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { ContentGenerator } from '../core/contentGenerator.js';
import { LLMProvider, LLMProviderConfig } from './types.js';
/**
 * Factory class for creating LLM provider instances
 * Supports dynamic loading of providers and proper error handling
 */
export declare class LLMProviderFactory {
    private static providerCache;
    /**
     * Create a provider instance based on configuration
     * Supports both builtin tools and advanced MCP integration
     */
    static create(config: LLMProviderConfig): Promise<ContentGenerator>;
    /**
     * Create multiple providers for comparison or fallback
     */
    static createMultiple(configs: LLMProviderConfig[]): Promise<ContentGenerator[]>;
    /**
     * Check if a provider is available
     */
    static isProviderAvailable(provider: LLMProvider): Promise<boolean>;
    /**
     * Get list of available providers
     */
    static getAvailableProviders(): Promise<LLMProvider[]>;
    /**
     * Create a provider with automatic fallback
     */
    static createWithFallback(primaryConfig: LLMProviderConfig, fallbackConfigs?: LLMProviderConfig[]): Promise<ContentGenerator>;
    /**
     * Create basic provider instance
     */
    private static createBasicProvider;
    /**
     * Load provider class dynamically
     */
    private static loadProviderClass;
    /**
     * Load complete provider with builtin-tools integration
     */
    private static loadCompleteProvider;
    /**
     * Validate provider configuration
     */
    private static validateProviderConfig;
    /**
     * Create provider with advanced MCP integration
     */
    private static createMCPEnabledProvider;
    /**
     * Create a test configuration for a provider
     */
    static createTestConfig(provider: LLMProvider, overrides?: Partial<LLMProviderConfig>): LLMProviderConfig;
    /**
     * Clear provider cache (useful for testing)
     */
    static clearCache(): void;
}
