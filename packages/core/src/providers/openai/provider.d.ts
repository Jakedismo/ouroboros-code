/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { CountTokensParameters, CountTokensResponse, EmbedContentParameters, EmbedContentResponse } from '@google/genai';
import { BaseLLMProvider } from '../base.js';
import { LLMProviderConfig, UnifiedGenerateRequest, UnifiedGenerateResponse, FormatConverter } from '../types.js';
/**
 * OpenAI provider implementation
 */
export declare class OpenAIProvider extends BaseLLMProvider {
    private client?;
    private OpenAI?;
    constructor(config: LLMProviderConfig);
    /**
     * Create format converter for OpenAI
     */
    protected createConverter(): FormatConverter;
    /**
     * Initialize the OpenAI provider
     */
    initialize(): Promise<void>;
    /**
     * Generate content using OpenAI API
     */
    protected generateUnifiedContent(request: UnifiedGenerateRequest, userPromptId: string): Promise<UnifiedGenerateResponse>;
    /**
     * Generate streaming content
     */
    protected generateUnifiedContentStream(request: UnifiedGenerateRequest, userPromptId: string): AsyncGenerator<UnifiedGenerateResponse>;
    /**
     * Count tokens using OpenAI's approach
     * Note: OpenAI doesn't have a direct token counting API, so we estimate
     */
    protected countUnifiedTokens(request: CountTokensParameters): Promise<CountTokensResponse>;
    /**
     * Embed content using OpenAI embeddings API
     */
    protected embedUnifiedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;
    /**
     * Get effective API key from config or environment
     */
    private getEffectiveApiKey;
    /**
     * Validate connection to OpenAI API
     */
    private validateConnection;
    /**
     * Handle OpenAI-specific errors
     */
    private handleOpenAIError;
    /**
     * Override auth error detection for OpenAI specifics
     */
    protected isAuthError(error: any): boolean;
    /**
     * Override rate limit error detection for OpenAI specifics
     */
    protected isRateLimitError(error: any): boolean;
    /**
     * Get list of available models
     */
    getAvailableModels(): Promise<string[]>;
    /**
     * Get model information
     */
    getModelInfo(): Promise<any>;
    /**
     * Override health check with OpenAI-specific implementation
     */
    healthCheck(): Promise<boolean>;
}
