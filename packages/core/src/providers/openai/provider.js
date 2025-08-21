/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { BaseLLMProvider } from '../base.js';
import { OpenAIFormatConverter } from './converter.js';
import { LLMProvider, ProviderError, ProviderAuthError, ProviderRateLimitError, ProviderQuotaError, } from '../types.js';
/**
 * OpenAI provider implementation
 */
export class OpenAIProvider extends BaseLLMProvider {
    client;
    OpenAI; // OpenAI constructor
    constructor(config) {
        super(config);
    }
    /**
     * Create format converter for OpenAI
     */
    createConverter() {
        return new OpenAIFormatConverter();
    }
    /**
     * Initialize the OpenAI provider
     */
    async initialize() {
        try {
            // Dynamically import OpenAI SDK
            const openaiModule = await import('openai');
            this.OpenAI = openaiModule.default;
            // Create client instance
            this.client = new this.OpenAI({
                apiKey: this.getEffectiveApiKey(),
                baseURL: this.config.baseUrl,
                timeout: this.config.timeout || 30000,
                maxRetries: this.config.maxRetries || 3,
            });
            // Validate the connection
            await this.validateConnection();
        }
        catch (error) {
            if (error.code === 'MODULE_NOT_FOUND') {
                throw new ProviderError('OpenAI SDK not installed. Run: npm install openai', LLMProvider.OPENAI, error);
            }
            throw this.wrapProviderError(error, 'initialize');
        }
    }
    /**
     * Generate content using OpenAI API
     */
    async generateUnifiedContent(request, userPromptId) {
        if (!this.client) {
            throw new Error('OpenAI provider not initialized');
        }
        try {
            // Convert to OpenAI format
            const openaiRequest = this.converter.toProviderFormat(request);
            // Set model
            openaiRequest.model = this.config.model;
            // Make the API call
            const response = await this.client.chat.completions.create(openaiRequest);
            // Convert back to unified format
            return this.converter.fromProviderResponse(response);
        }
        catch (error) {
            throw this.handleOpenAIError(error);
        }
    }
    /**
     * Generate streaming content
     */
    async *generateUnifiedContentStream(request, userPromptId) {
        if (!this.client) {
            throw new Error('OpenAI provider not initialized');
        }
        try {
            // Convert to OpenAI format
            const openaiRequest = this.converter.toProviderFormat(request);
            // Set model and enable streaming
            openaiRequest.model = this.config.model;
            openaiRequest.stream = true;
            // Make streaming API call
            const stream = await this.client.chat.completions.create(openaiRequest);
            // Process stream chunks
            for await (const chunk of stream) {
                const converter = this.converter;
                const unifiedChunk = converter.convertStreamChunk(chunk);
                // Only yield chunks with actual content
                if (unifiedChunk.content ||
                    unifiedChunk.functionCalls ||
                    unifiedChunk.finishReason) {
                    yield unifiedChunk;
                }
            }
        }
        catch (error) {
            throw this.handleOpenAIError(error);
        }
    }
    /**
     * Count tokens using OpenAI's approach
     * Note: OpenAI doesn't have a direct token counting API, so we estimate
     */
    async countUnifiedTokens(request) {
        // For OpenAI, we need to estimate token count
        // This is a simplified implementation - in practice, you might want to use
        // a library like 'tiktoken' for accurate token counting
        let totalTokens = 0;
        if (request.contents) {
            for (const content of request.contents) {
                if (content.parts) {
                    for (const part of content.parts) {
                        if ('text' in part && part.text) {
                            // Rough estimation: ~4 characters per token for English
                            totalTokens += Math.ceil(part.text.length / 4);
                        }
                    }
                }
            }
        }
        // Add overhead for system messages, tools, etc.
        totalTokens += 50; // Base overhead
        return {
            totalTokens,
        };
    }
    /**
     * Embed content using OpenAI embeddings API
     */
    async embedUnifiedContent(request) {
        if (!this.client) {
            throw new Error('OpenAI provider not initialized');
        }
        try {
            let textToEmbed = '';
            // Extract text from content
            if (request.content?.parts) {
                const textParts = request.content.parts
                    .filter((part) => 'text' in part)
                    .map((part) => part.text);
                textToEmbed = textParts.join(' ');
            }
            if (!textToEmbed.trim()) {
                throw new Error('No text content found to embed');
            }
            // Use OpenAI embeddings API
            const response = await this.client.embeddings.create({
                model: this.config.embeddingModel || 'text-embedding-3-small',
                input: textToEmbed,
                encoding_format: 'float',
            });
            if (!response.data || response.data.length === 0) {
                throw new Error('No embeddings returned from OpenAI API');
            }
            return {
                embedding: {
                    values: response.data[0].embedding,
                },
            };
        }
        catch (error) {
            throw this.handleOpenAIError(error);
        }
    }
    /**
     * Get effective API key from config or environment
     */
    getEffectiveApiKey() {
        const apiKey = this.config.apiKey || process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new ProviderAuthError(LLMProvider.OPENAI);
        }
        return apiKey;
    }
    /**
     * Validate connection to OpenAI API
     */
    async validateConnection() {
        if (!this.client) {
            throw new Error('Client not initialized');
        }
        try {
            // Simple validation call
            await this.client.models.list();
        }
        catch (error) {
            if (this.isAuthError(error)) {
                throw new ProviderAuthError(LLMProvider.OPENAI, error);
            }
            throw this.wrapProviderError(error, 'validateConnection');
        }
    }
    /**
     * Handle OpenAI-specific errors
     */
    handleOpenAIError(error) {
        // Check for specific OpenAI error types
        if (error?.error) {
            const errorType = error.error.type;
            const errorCode = error.error.code;
            const statusCode = error.status;
            // Authentication errors
            if (statusCode === 401 || errorType === 'invalid_api_key') {
                return new ProviderAuthError(LLMProvider.OPENAI, error);
            }
            // Rate limit errors
            if (statusCode === 429 || errorType === 'rate_limit_exceeded') {
                const retryAfter = error.headers?.['retry-after']
                    ? parseInt(error.headers['retry-after'], 10)
                    : undefined;
                return new ProviderRateLimitError(LLMProvider.OPENAI, retryAfter);
            }
            // Quota errors
            if (errorType === 'insufficient_quota' ||
                errorCode === 'quota_exceeded') {
                return new ProviderQuotaError(LLMProvider.OPENAI, 'API quota');
            }
            // Model errors
            if (errorType === 'model_not_found' || errorCode === 'model_not_found') {
                return new ProviderError(`Model ${this.config.model} not found or not accessible`, LLMProvider.OPENAI, error);
            }
            // Content filter errors
            if (errorType === 'content_filter' ||
                errorCode === 'content_policy_violation') {
                return new ProviderError('Content filtered by OpenAI safety systems', LLMProvider.OPENAI, error);
            }
        }
        // Network errors
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            return new ProviderError('Network error: Unable to connect to OpenAI API', LLMProvider.OPENAI, error);
        }
        // Timeout errors
        if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
            return new ProviderError('Request timed out while calling OpenAI API', LLMProvider.OPENAI, error);
        }
        // Generic error handling
        return this.wrapProviderError(error, 'OpenAI API call');
    }
    /**
     * Override auth error detection for OpenAI specifics
     */
    isAuthError(error) {
        if (super.isAuthError(error)) {
            return true;
        }
        // OpenAI-specific auth error patterns
        return !!(error?.error?.type === 'invalid_api_key' ||
            error?.error?.code === 'invalid_api_key' ||
            (error?.status === 401 && error?.error?.message?.includes('api key')));
    }
    /**
     * Override rate limit error detection for OpenAI specifics
     */
    isRateLimitError(error) {
        if (super.isRateLimitError(error)) {
            return true;
        }
        // OpenAI-specific rate limit patterns
        return !!(error?.error?.type === 'rate_limit_exceeded' ||
            error?.error?.code === 'rate_limit_exceeded' ||
            error?.status === 429);
    }
    /**
     * Get list of available models
     */
    async getAvailableModels() {
        if (!this.client) {
            throw new Error('OpenAI provider not initialized');
        }
        try {
            const response = await this.client.models.list();
            return response.data
                .filter((model) => model.id.startsWith('gpt-'))
                .map((model) => model.id)
                .sort();
        }
        catch (error) {
            console.debug('Failed to list OpenAI models:', error);
            // Return common models as fallback
            return [
                'gpt-5',
                'o3',
                'gpt-5-mini',
                'gpt-5-nano',
            ];
        }
    }
    /**
     * Get model information
     */
    async getModelInfo() {
        if (!this.client) {
            throw new Error('OpenAI provider not initialized');
        }
        try {
            const response = await this.client.models.retrieve(this.config.model);
            return response;
        }
        catch (error) {
            console.debug(`Failed to get info for model ${this.config.model}:`, error);
            return null;
        }
    }
    /**
     * Override health check with OpenAI-specific implementation
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
                        content: 'Hello',
                    },
                ],
            }, 'health-check');
            return true;
        }
        catch (error) {
            console.debug('OpenAI health check failed:', error);
            return false;
        }
    }
}
//# sourceMappingURL=provider.js.map