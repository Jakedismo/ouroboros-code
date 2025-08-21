/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { BaseLLMProvider } from '../base.js';
import { AnthropicFormatConverter } from './converter.js';
import { LLMProvider, ProviderError, ProviderAuthError, ProviderRateLimitError, ProviderQuotaError, } from '../types.js';
/**
 * Anthropic provider implementation
 */
export class AnthropicProvider extends BaseLLMProvider {
    client;
    Anthropic; // Anthropic constructor
    constructor(config) {
        super(config);
    }
    /**
     * Create format converter for Anthropic
     */
    createConverter() {
        return new AnthropicFormatConverter();
    }
    /**
     * Initialize the Anthropic provider
     */
    async initialize() {
        try {
            // Dynamically import Anthropic SDK
            const anthropicModule = await import('@anthropic-ai/sdk');
            this.Anthropic = anthropicModule.default;
            // Create client instance
            this.client = new this.Anthropic({
                apiKey: this.getEffectiveApiKey(),
                baseURL: this.config.baseUrl,
                timeout: this.config.timeout || 60000,
                maxRetries: this.config.maxRetries || 3,
            });
            // Validate the connection
            await this.validateConnection();
        }
        catch (error) {
            if (error.code === 'MODULE_NOT_FOUND') {
                throw new ProviderError('Anthropic SDK not installed. Run: npm install @anthropic-ai/sdk', LLMProvider.ANTHROPIC, error);
            }
            throw this.wrapProviderError(error, 'initialize');
        }
    }
    /**
     * Generate content using Anthropic API
     */
    async generateUnifiedContent(request, _userPromptId) {
        if (!this.client) {
            throw new Error('Anthropic provider not initialized');
        }
        try {
            // Convert to Anthropic format
            const anthropicRequest = this.converter.toProviderFormat(request);
            // Set model
            anthropicRequest.model = this.config.model;
            // Make the API call
            const response = await this.client.messages.create(anthropicRequest);
            // Convert back to unified format
            return this.converter.fromProviderResponse(response);
        }
        catch (error) {
            throw this.handleAnthropicError(error);
        }
    }
    /**
     * Generate streaming content
     */
    async *generateUnifiedContentStream(request, _userPromptId) {
        if (!this.client) {
            throw new Error('Anthropic provider not initialized');
        }
        try {
            // Convert to Anthropic format
            const anthropicRequest = this.converter.toProviderFormat(request);
            // Set model and enable streaming
            anthropicRequest.model = this.config.model;
            anthropicRequest.stream = true;
            // Make streaming API call
            const stream = await this.client.messages.create(anthropicRequest);
            // Process stream events
            for await (const event of stream) {
                const converter = this.converter;
                const unifiedChunk = converter.convertStreamEvent(event);
                // Only yield chunks with actual content
                if (unifiedChunk.content ||
                    unifiedChunk.functionCalls ||
                    unifiedChunk.finishReason) {
                    yield unifiedChunk;
                }
            }
        }
        catch (error) {
            throw this.handleAnthropicError(error);
        }
    }
    /**
     * Count tokens using Anthropic's approach
     * Note: Anthropic doesn't have a direct token counting API, so we estimate
     */
    async countUnifiedTokens(request) {
        // For Anthropic, we need to estimate token count
        // This is a simplified implementation - Claude uses a different tokenizer
        // than GPT models, but this provides a rough estimate
        let totalTokens = 0;
        if (request.contents) {
            for (const content of request.contents) {
                if (content.parts) {
                    for (const part of content.parts) {
                        if ('text' in part && part.text) {
                            // Rough estimation: ~3.5 characters per token for English (Claude tokenizer)
                            totalTokens += Math.ceil(part.text.length / 3.5);
                        }
                    }
                }
            }
        }
        // Add overhead for system messages, tools, etc.
        totalTokens += 100; // Base overhead
        return {
            totalTokens,
        };
    }
    /**
     * Anthropic doesn't support embeddings natively
     */
    async embedUnifiedContent(_request) {
        throw new ProviderError('Anthropic does not support embeddings. Use OpenAI or Gemini for embedding functionality.', LLMProvider.ANTHROPIC);
    }
    /**
     * Get effective API key from config or environment
     */
    getEffectiveApiKey() {
        const apiKey = this.config.apiKey || process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new ProviderAuthError(LLMProvider.ANTHROPIC);
        }
        return apiKey;
    }
    /**
     * Validate connection to Anthropic API
     */
    async validateConnection() {
        if (!this.client) {
            throw new Error('Client not initialized');
        }
        try {
            // Simple validation call - create a very short message
            await this.client.messages.create({
                model: this.config.model,
                max_tokens: 1,
                messages: [
                    {
                        role: 'user',
                        content: 'Hi',
                    },
                ],
            });
        }
        catch (error) {
            if (this.isAuthError(error)) {
                throw new ProviderAuthError(LLMProvider.ANTHROPIC, error);
            }
            throw this.wrapProviderError(error, 'validateConnection');
        }
    }
    /**
     * Handle Anthropic-specific errors
     */
    handleAnthropicError(error) {
        // Check for specific Anthropic error types
        if (error?.error || error?.type) {
            const errorType = error.type || error.error?.type;
            const errorCode = error.error?.code;
            const statusCode = error.status;
            // Authentication errors
            if (statusCode === 401 || errorType === 'authentication_error') {
                return new ProviderAuthError(LLMProvider.ANTHROPIC, error);
            }
            // Rate limit errors
            if (statusCode === 429 || errorType === 'rate_limit_error') {
                const retryAfter = error.headers?.['retry-after']
                    ? parseInt(error.headers['retry-after'], 10)
                    : undefined;
                return new ProviderRateLimitError(LLMProvider.ANTHROPIC, retryAfter);
            }
            // Overloaded errors (Anthropic returns 529 for overloaded)
            if (statusCode === 529 || errorType === 'overloaded_error') {
                return new ProviderRateLimitError(LLMProvider.ANTHROPIC);
            }
            // Permission errors
            if (statusCode === 403 || errorType === 'permission_error') {
                return new ProviderAuthError(LLMProvider.ANTHROPIC, error);
            }
            // Quota/billing errors
            if (errorType === 'billing_error' || errorCode === 'insufficient_quota') {
                return new ProviderQuotaError(LLMProvider.ANTHROPIC, 'API quota');
            }
            // Model errors
            if (errorType === 'invalid_request_error' &&
                error.message?.includes('model')) {
                return new ProviderError(`Model ${this.config.model} not found or not accessible`, LLMProvider.ANTHROPIC, error);
            }
            // Content filter errors
            if (errorType === 'invalid_request_error' &&
                (error.message?.includes('harmful') ||
                    error.message?.includes('unsafe'))) {
                return new ProviderError('Content filtered by Anthropic safety systems', LLMProvider.ANTHROPIC, error);
            }
            // API errors
            if (statusCode >= 500 || errorType === 'api_error') {
                return new ProviderError('Anthropic API error - service temporarily unavailable', LLMProvider.ANTHROPIC, error);
            }
        }
        // Network errors
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            return new ProviderError('Network error: Unable to connect to Anthropic API', LLMProvider.ANTHROPIC, error);
        }
        // Timeout errors
        if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
            return new ProviderError('Request timed out while calling Anthropic API', LLMProvider.ANTHROPIC, error);
        }
        // Generic error handling
        return this.wrapProviderError(error, 'Anthropic API call');
    }
    /**
     * Override auth error detection for Anthropic specifics
     */
    isAuthError(error) {
        if (super.isAuthError(error)) {
            return true;
        }
        // Anthropic-specific auth error patterns
        return !!(error?.type === 'authentication_error' ||
            error?.error?.type === 'authentication_error' ||
            error?.status === 401 ||
            (error?.status === 403 && error?.type === 'permission_error'));
    }
    /**
     * Override rate limit error detection for Anthropic specifics
     */
    isRateLimitError(error) {
        if (super.isRateLimitError(error)) {
            return true;
        }
        // Anthropic-specific rate limit patterns
        return !!(error?.type === 'rate_limit_error' ||
            error?.type === 'overloaded_error' ||
            error?.error?.type === 'rate_limit_error' ||
            error?.status === 429 ||
            error?.status === 529 // Anthropic uses 529 for overloaded
        );
    }
    /**
     * Get list of available models
     */
    async getAvailableModels() {
        // Anthropic doesn't have a models list endpoint, so return known models
        return [
            'claude-opus-4-1-20250805',
            'claude-4-sonnet-20250514',
        ];
    }
    /**
     * Get model information (limited for Anthropic)
     */
    async getModelInfo() {
        // Anthropic doesn't provide detailed model info via API
        const knownModels = {
            'claude-opus-4-1-20250805': {
                id: 'claude-opus-4-1-20250805',
                name: 'Claude Opus 4.1',
                max_tokens: 8192,
                max_context_tokens: 500000,
                supports_tools: true,
                supports_vision: true,
            },
            'claude-4-sonnet-20250514': {
                id: 'claude-4-sonnet-20250514',
                name: 'Claude 4 Sonnet',
                max_tokens: 8192,
                max_context_tokens: 500000,
                supports_tools: true,
                supports_vision: true,
            },
        };
        return (knownModels[this.config.model] || {
            id: this.config.model,
            name: this.config.model,
            max_tokens: 4096,
            max_context_tokens: 200000,
        });
    }
    /**
     * Override health check with Anthropic-specific implementation
     */
    async healthCheck() {
        try {
            if (!this.client) {
                await this.initialize();
            }
            // Simple completion test
            await this.generateUnifiedContent({
                messages: [
                    {
                        role: 'user',
                        content: 'Hi',
                    },
                ],
            }, 'health-check');
            return true;
        }
        catch (error) {
            console.debug('Anthropic health check failed:', error);
            return false;
        }
    }
    /**
     * Check if model supports specific capability
     */
    supportsCapability(capability) {
        const capabilities = this.getCapabilities();
        switch (capability) {
            case 'streaming':
                return capabilities.supportsStreaming;
            case 'tools':
                return capabilities.supportsTools && this.isModernClaudeModel();
            case 'vision':
                return capabilities.supportsVision && this.isModernClaudeModel();
            case 'embedding':
                return capabilities.supportsEmbedding; // Always false for Anthropic
            default:
                return false;
        }
    }
    /**
     * Check if current model is a modern Claude model (3.0+)
     */
    isModernClaudeModel() {
        const model = this.config.model.toLowerCase();
        return (model.includes('claude-4') ||
            model.includes('opus') ||
            model.includes('sonnet'));
    }
    /**
     * Get model context window size
     */
    getContextWindow() {
        const modelInfo = this.getModelInfo();
        return modelInfo?.max_context_tokens || 200000;
    }
    /**
     * Get maximum output tokens
     */
    getMaxOutputTokens() {
        const modelInfo = this.getModelInfo();
        return modelInfo?.max_tokens || 4096;
    }
}
//# sourceMappingURL=provider.js.map