/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { LLMProvider, LLMProviderConfig, UnifiedGenerateRequest as BaseUnifiedRequest, UnifiedGenerateResponse } from './types.js';
export interface OrchestratorConfig {
    providers: LLMProvider[];
    providerConfigs?: Map<LLMProvider, LLMProviderConfig>;
    parallelExecution?: boolean;
    timeout?: number;
    configInstance?: any;
}
export interface UnifiedGenerateRequest extends BaseUnifiedRequest {
    prompt?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
}
export interface ProviderResponse {
    provider: LLMProvider;
    response?: UnifiedGenerateResponse;
    error?: Error;
    latency: number;
}
/**
 * Multi-provider orchestrator for managing multiple LLM providers
 * Enables parallel execution, fallback strategies, and response aggregation
 */
export declare class MultiProviderOrchestrator {
    private providers;
    private config;
    constructor(config?: OrchestratorConfig);
    /**
     * Initialize the orchestrator by creating provider instances
     */
    initialize(): Promise<void>;
    /**
     * Execute request across multiple providers in parallel
     */
    executeParallel(request: UnifiedGenerateRequest, providers?: LLMProvider[]): Promise<ProviderResponse[]>;
    /**
     * Execute request with fallback strategy
     */
    executeWithFallback(request: UnifiedGenerateRequest, primaryProvider: LLMProvider, fallbackProviders: LLMProvider[]): Promise<ProviderResponse>;
    /**
     * Query a specific provider directly
     */
    queryProvider(provider: LLMProvider, request: UnifiedGenerateRequest): Promise<ProviderResponse>;
    /**
     * Get initialized providers
     */
    getProviders(): LLMProvider[];
    /**
     * Alias for getProviders for backward compatibility
     */
    getAllProviders(): LLMProvider[];
    /**
     * Check if a provider is available
     */
    hasProvider(provider: LLMProvider): boolean;
    /**
     * Clear all providers (useful for testing)
     */
    clear(): void;
}
