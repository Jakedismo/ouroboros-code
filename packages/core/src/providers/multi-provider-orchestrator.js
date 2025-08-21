/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { LLMProvider } from './types.js';
import { LLMProviderFactory } from './factory.js';
/**
 * Multi-provider orchestrator for managing multiple LLM providers
 * Enables parallel execution, fallback strategies, and response aggregation
 */
export class MultiProviderOrchestrator {
    providers = new Map();
    config;
    constructor(config = { providers: [LLMProvider.GEMINI] }) {
        this.config = {
            parallelExecution: true,
            timeout: 30000,
            ...config
        };
    }
    /**
     * Initialize the orchestrator by creating provider instances
     */
    async initialize() {
        for (const providerType of this.config.providers) {
            try {
                const providerConfig = this.config.providerConfigs?.get(providerType) || {
                    provider: providerType,
                    model: undefined, // Will use default
                    configInstance: this.config.configInstance,
                    enableBuiltinTools: true,
                };
                const provider = await LLMProviderFactory.create(providerConfig);
                this.providers.set(providerType, provider);
            }
            catch (error) {
                console.warn(`Failed to initialize provider ${providerType}:`, error);
            }
        }
        if (this.providers.size === 0) {
            throw new Error('No providers could be initialized');
        }
    }
    /**
     * Execute request across multiple providers in parallel
     */
    async executeParallel(request, providers) {
        // Ensure providers are initialized
        if (this.providers.size === 0) {
            await this.initialize();
        }
        const targetProviders = providers || this.config.providers;
        const promises = targetProviders.map(async (providerType) => {
            const startTime = Date.now();
            const provider = this.providers.get(providerType);
            if (!provider) {
                return {
                    provider: providerType,
                    response: undefined,
                    latency: Date.now() - startTime,
                    error: new Error(`Provider ${providerType} not initialized`),
                };
            }
            try {
                // Convert UnifiedGenerateRequest to format expected by ContentGenerator
                const generateRequest = {
                    contents: request.messages?.map(msg => ({
                        role: msg.role === 'assistant' ? 'model' : msg.role,
                        parts: typeof msg.content === 'string'
                            ? [{ text: msg.content }]
                            : msg.content.map(part => {
                                if ('text' in part)
                                    return { text: part.text };
                                if ('functionCall' in part)
                                    return { functionCall: part.functionCall };
                                if ('inlineData' in part)
                                    return { inlineData: part.inlineData };
                                if ('fileData' in part)
                                    return { fileData: part.fileData };
                                return part;
                            })
                    })) || [{
                            role: 'user',
                            parts: [{ text: request.prompt || '' }]
                        }],
                    generationConfig: {
                        temperature: request.temperature,
                        maxOutputTokens: request.maxTokens,
                        topP: request.topP,
                        topK: request.topK,
                    },
                    systemInstruction: request.systemInstruction,
                    tools: request.tools, // Type conversion needed
                };
                // Call the provider's generateContent method
                const response = await provider.generateContent(generateRequest);
                // Convert response to UnifiedGenerateResponse
                const unifiedResponse = {
                    content: response.candidates?.[0]?.content?.parts
                        ?.map(part => part.text || '')
                        .filter(Boolean)
                        .join('') || '',
                    functionCalls: response.candidates?.[0]?.content?.parts
                        ?.filter(part => part.functionCall)
                        .map(part => part.functionCall),
                    finishReason: response.candidates?.[0]?.finishReason,
                    usage: response.usageMetadata,
                };
                return {
                    provider: providerType,
                    response: unifiedResponse,
                    latency: Date.now() - startTime,
                    error: undefined,
                };
            }
            catch (error) {
                return {
                    provider: providerType,
                    response: undefined,
                    latency: Date.now() - startTime,
                    error: error,
                };
            }
        });
        if (this.config.parallelExecution) {
            return Promise.all(promises);
        }
        else {
            const results = [];
            for (const promise of promises) {
                results.push(await promise);
            }
            return results;
        }
    }
    /**
     * Execute request with fallback strategy
     */
    async executeWithFallback(request, primaryProvider, fallbackProviders) {
        // Try primary provider first
        const primaryResponse = await this.executeParallel(request, [primaryProvider]);
        if (primaryResponse[0] && !primaryResponse[0].error && primaryResponse[0].response) {
            return primaryResponse[0];
        }
        // Log primary failure for debugging
        if (primaryResponse[0]?.error) {
            console.warn(`Primary provider ${primaryProvider} failed:`, primaryResponse[0].error.message);
        }
        // Try fallback providers in order
        for (const fallback of fallbackProviders) {
            const response = await this.executeParallel(request, [fallback]);
            if (response[0] && !response[0].error && response[0].response) {
                console.info(`Using fallback provider ${fallback} after primary failure`);
                return response[0];
            }
            if (response[0]?.error) {
                console.warn(`Fallback provider ${fallback} failed:`, response[0].error.message);
            }
        }
        // All providers failed
        const allProviders = [primaryProvider, ...fallbackProviders];
        throw new Error(`All providers failed: ${allProviders.join(', ')}`);
    }
    /**
     * Query a specific provider directly
     */
    async queryProvider(provider, request) {
        const responses = await this.executeParallel(request, [provider]);
        if (responses[0]?.error) {
            throw responses[0].error;
        }
        if (!responses[0]?.response) {
            throw new Error(`Provider ${provider} returned no response`);
        }
        return responses[0];
    }
    /**
     * Get initialized providers
     */
    getProviders() {
        return Array.from(this.providers.keys());
    }
    /**
     * Alias for getProviders for backward compatibility
     */
    getAllProviders() {
        return this.getProviders();
    }
    /**
     * Check if a provider is available
     */
    hasProvider(provider) {
        return this.providers.has(provider);
    }
    /**
     * Clear all providers (useful for testing)
     */
    clear() {
        this.providers.clear();
    }
}
//# sourceMappingURL=multi-provider-orchestrator.js.map