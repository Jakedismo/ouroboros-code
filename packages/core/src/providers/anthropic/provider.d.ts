/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { CountTokensParameters, CountTokensResponse, EmbedContentParameters, EmbedContentResponse } from '@google/genai';
import { BaseLLMProvider } from '../base.js';
import { LLMProviderConfig, UnifiedGenerateRequest, UnifiedGenerateResponse, FormatConverter } from '../types.js';
/**
 * Anthropic provider implementation
 */
export declare class AnthropicProvider extends BaseLLMProvider {
    private client?;
    private Anthropic?;
    constructor(config: LLMProviderConfig);
    /**
     * Create format converter for Anthropic
     */
    protected createConverter(): FormatConverter;
    /**
     * Initialize the Anthropic provider
     */
    initialize(): Promise<void>;
    /**
     * Generate content using Anthropic API
     */
    protected generateUnifiedContent(request: UnifiedGenerateRequest, _userPromptId: string): Promise<UnifiedGenerateResponse>;
    /**
     * Generate streaming content
     */
    protected generateUnifiedContentStream(request: UnifiedGenerateRequest, _userPromptId: string): AsyncGenerator<UnifiedGenerateResponse>;
    /**
     * Count tokens using Anthropic's approach
     * Note: Anthropic doesn't have a direct token counting API, so we estimate
     */
    protected countUnifiedTokens(request: CountTokensParameters): Promise<CountTokensResponse>;
    /**
     * Anthropic doesn't support embeddings natively
     */
    protected embedUnifiedContent(_request: EmbedContentParameters): Promise<EmbedContentResponse>;
    /**
     * Get effective API key from config or environment
     */
    private getEffectiveApiKey;
    /**
     * Validate connection to Anthropic API
     */
    private validateConnection;
    /**
     * Handle Anthropic-specific errors
     */
    private handleAnthropicError;
    /**
     * Override auth error detection for Anthropic specifics
     */
    protected isAuthError(error: unknown): boolean;
    /**
     * Override rate limit error detection for Anthropic specifics
     */
    protected isRateLimitError(error: unknown): boolean;
    /**
     * Get list of available models
     */
    getAvailableModels(): Promise<string[]>;
    /**
     * Get model information (limited for Anthropic)
     */
    getModelInfo(): Promise<any>;
    /**
     * Override health check with Anthropic-specific implementation
     */
    healthCheck(): Promise<boolean>;
    /**
     * Check if model supports specific capability
     */
    supportsCapability(capability: string): boolean;
    /**
     * Check if current model is a modern Claude model (3.0+)
     */
    private isModernClaudeModel;
    /**
     * Get model context window size
     */
    getContextWindow(): number;
    /**
     * Get maximum output tokens
     */
    getMaxOutputTokens(): number;
}
