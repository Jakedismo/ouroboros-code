/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { LLMProvider, ProviderError, ProviderAuthError, ProviderRateLimitError, PROVIDER_CAPABILITIES, } from './types.js';
/**
 * Abstract base class for all LLM providers
 * Implements the ContentGenerator interface and provides common functionality
 */
export class BaseLLMProvider {
    config;
    converter;
    userTier;
    constructor(config) {
        this.config = config;
        this.converter = this.createConverter();
        this.validateConfig();
    }
    /**
     * Main content generation method - calls provider-specific implementation
     */
    async generateContent(request, userPromptId) {
        try {
            // Convert to unified format
            const unifiedRequest = this.converter.fromGeminiFormat(request);
            // Call provider-specific implementation
            const unifiedResponse = await this.generateUnifiedContent(unifiedRequest, userPromptId);
            // Convert back to Gemini format
            return this.converter.toGeminiFormat(unifiedResponse);
        }
        catch (error) {
            throw this.wrapProviderError(error, 'generateContent');
        }
    }
    /**
     * Streaming content generation
     */
    async generateContentStream(request, userPromptId) {
        try {
            const unifiedRequest = this.converter.fromGeminiFormat(request);
            unifiedRequest.stream = true;
            const unifiedStream = this.generateUnifiedContentStream(unifiedRequest, userPromptId);
            return this.convertStreamToGemini(unifiedStream);
        }
        catch (error) {
            throw this.wrapProviderError(error, 'generateContentStream');
        }
    }
    /**
     * Token counting - may need provider-specific implementation
     */
    async countTokens(request) {
        try {
            return await this.countUnifiedTokens(request);
        }
        catch (error) {
            throw this.wrapProviderError(error, 'countTokens');
        }
    }
    /**
     * Content embedding - may not be supported by all providers
     */
    async embedContent(request) {
        const capabilities = PROVIDER_CAPABILITIES[this.config.provider];
        if (!capabilities.supportsEmbedding) {
            throw new ProviderError(`Provider ${this.config.provider} does not support embeddings`, this.config.provider);
        }
        try {
            return await this.embedUnifiedContent(request);
        }
        catch (error) {
            throw this.wrapProviderError(error, 'embedContent');
        }
    }
    /**
     * Helper method to convert unified stream back to Gemini format
     */
    async *convertStreamToGemini(unifiedStream) {
        for await (const unifiedResponse of unifiedStream) {
            yield this.converter.toGeminiFormat(unifiedResponse);
        }
    }
    /**
     * Validate provider configuration
     */
    validateConfig() {
        if (!this.config.model) {
            throw new Error(`Model is required for provider ${this.config.provider}`);
        }
        if (!this.config.apiKey && this.requiresApiKey()) {
            throw new ProviderAuthError(this.config.provider);
        }
        // Validate model capabilities
        const capabilities = PROVIDER_CAPABILITIES[this.config.provider];
        if (!capabilities) {
            throw new Error(`Unsupported provider: ${this.config.provider}`);
        }
    }
    /**
     * Check if provider requires an API key
     */
    requiresApiKey() {
        // Gemini may use OAuth, others typically require API keys
        return this.config.provider !== LLMProvider.GEMINI;
    }
    /**
     * Wrap provider-specific errors with context
     */
    wrapProviderError(error, operation) {
        if (error instanceof ProviderError) {
            return error;
        }
        // Check for common error patterns
        if (this.isAuthError(error)) {
            return new ProviderAuthError(this.config.provider, error);
        }
        if (this.isRateLimitError(error)) {
            const retryAfter = this.extractRetryAfter(error);
            return new ProviderRateLimitError(this.config.provider, retryAfter);
        }
        // Generic provider error
        return new ProviderError(`${operation} failed for provider ${this.config.provider}: ${error.message}`, this.config.provider, error);
    }
    /**
     * Check if error is authentication-related
     */
    isAuthError(error) {
        const message = error.message?.toLowerCase() || '';
        const statusCode = error.status || error.statusCode;
        return (statusCode === 401 ||
            statusCode === 403 ||
            message.includes('unauthorized') ||
            message.includes('authentication') ||
            message.includes('api key') ||
            message.includes('invalid key'));
    }
    /**
     * Check if error is rate limit-related
     */
    isRateLimitError(error) {
        const message = error.message?.toLowerCase() || '';
        const statusCode = error.status || error.statusCode;
        return (statusCode === 429 ||
            message.includes('rate limit') ||
            message.includes('too many requests') ||
            message.includes('quota exceeded'));
    }
    /**
     * Extract retry-after value from rate limit error
     */
    extractRetryAfter(error) {
        if (error.headers && error.headers['retry-after']) {
            return parseInt(error.headers['retry-after'], 10);
        }
        if (error.response &&
            error.response.headers &&
            error.response.headers['retry-after']) {
            return parseInt(error.response.headers['retry-after'], 10);
        }
        return undefined;
    }
    /**
     * Get provider capabilities
     */
    getCapabilities() {
        return PROVIDER_CAPABILITIES[this.config.provider];
    }
    /**
     * Get provider configuration
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Update provider configuration
     */
    updateConfig(updates) {
        this.config = { ...this.config, ...updates };
        this.validateConfig();
    }
    /**
     * Health check for the provider
     */
    async healthCheck() {
        try {
            // Simple test request to verify provider is working
            await this.generateContent({
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: 'Hello' }],
                    },
                ],
            }, 'health-check');
            return true;
        }
        catch (error) {
            console.debug(`Health check failed for provider ${this.config.provider}:`, error);
            return false;
        }
    }
    /**
     * Get provider display name
     */
    getDisplayName() {
        switch (this.config.provider) {
            case LLMProvider.GEMINI:
                return 'Google Gemini';
            case LLMProvider.OPENAI:
                return 'OpenAI';
            case LLMProvider.ANTHROPIC:
                return 'Anthropic Claude';
            default:
                return this.config.provider;
        }
    }
}
//# sourceMappingURL=base.js.map