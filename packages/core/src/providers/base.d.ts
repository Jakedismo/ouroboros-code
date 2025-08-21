/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { GenerateContentParameters, GenerateContentResponse, CountTokensParameters, CountTokensResponse, EmbedContentParameters, EmbedContentResponse } from '@google/genai';
import { ContentGenerator } from '../core/contentGenerator.js';
import { UserTierId } from '../code_assist/types.js';
import { LLMProviderConfig, UnifiedGenerateRequest, UnifiedGenerateResponse, FormatConverter } from './types.js';
/**
 * Abstract base class for all LLM providers
 * Implements the ContentGenerator interface and provides common functionality
 */
export declare abstract class BaseLLMProvider implements ContentGenerator {
    protected config: LLMProviderConfig;
    protected converter: FormatConverter;
    userTier?: UserTierId;
    constructor(config: LLMProviderConfig);
    /**
     * Each provider must implement its own format converter
     */
    protected abstract createConverter(): FormatConverter;
    /**
     * Provider-specific initialization (connect to API, validate credentials, etc.)
     */
    abstract initialize(): Promise<void>;
    /**
     * Main content generation method - calls provider-specific implementation
     */
    generateContent(request: GenerateContentParameters, userPromptId: string): Promise<GenerateContentResponse>;
    /**
     * Streaming content generation
     */
    generateContentStream(request: GenerateContentParameters, userPromptId: string): Promise<AsyncGenerator<GenerateContentResponse>>;
    /**
     * Token counting - may need provider-specific implementation
     */
    countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;
    /**
     * Content embedding - may not be supported by all providers
     */
    embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;
    /**
     * Provider-specific methods that subclasses must implement
     */
    protected abstract generateUnifiedContent(request: UnifiedGenerateRequest, userPromptId: string): Promise<UnifiedGenerateResponse>;
    protected abstract generateUnifiedContentStream(request: UnifiedGenerateRequest, userPromptId: string): AsyncGenerator<UnifiedGenerateResponse>;
    protected abstract countUnifiedTokens(request: CountTokensParameters): Promise<CountTokensResponse>;
    protected abstract embedUnifiedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;
    /**
     * Helper method to convert unified stream back to Gemini format
     */
    private convertStreamToGemini;
    /**
     * Validate provider configuration
     */
    protected validateConfig(): void;
    /**
     * Check if provider requires an API key
     */
    protected requiresApiKey(): boolean;
    /**
     * Wrap provider-specific errors with context
     */
    protected wrapProviderError(error: any, operation: string): Error;
    /**
     * Check if error is authentication-related
     */
    protected isAuthError(error: any): boolean;
    /**
     * Check if error is rate limit-related
     */
    protected isRateLimitError(error: any): boolean;
    /**
     * Extract retry-after value from rate limit error
     */
    protected extractRetryAfter(error: any): number | undefined;
    /**
     * Get provider capabilities
     */
    getCapabilities(): import("./types.js").ProviderCapabilities;
    /**
     * Get provider configuration
     */
    getConfig(): LLMProviderConfig;
    /**
     * Update provider configuration
     */
    updateConfig(updates: Partial<LLMProviderConfig>): void;
    /**
     * Health check for the provider
     */
    healthCheck(): Promise<boolean>;
    /**
     * Get provider display name
     */
    getDisplayName(): string;
}
