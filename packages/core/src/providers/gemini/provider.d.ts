/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { CountTokensParameters, CountTokensResponse, EmbedContentParameters, EmbedContentResponse } from '@google/genai';
import { BaseLLMProvider } from '../base.js';
import { LLMProviderConfig, UnifiedGenerateRequest, UnifiedGenerateResponse, FormatConverter } from '../types.js';
import { ContentGenerator } from '../../core/contentGenerator.js';
/**
 * Gemini provider implementation that wraps existing Gemini functionality
 * Maintains backward compatibility while fitting into the new provider architecture
 */
export declare class GeminiProvider extends BaseLLMProvider {
    private actualGenerator?;
    private useCodeAssist;
    constructor(config: LLMProviderConfig);
    /**
     * Create format converter for Gemini
     */
    protected createConverter(): FormatConverter;
    /**
     * Initialize the Gemini provider
     */
    initialize(): Promise<void>;
    /**
     * Generate content using the actual Gemini generator
     */
    protected generateUnifiedContent(request: UnifiedGenerateRequest, userPromptId: string): Promise<UnifiedGenerateResponse>;
    /**
     * Generate streaming content
     */
    protected generateUnifiedContentStream(request: UnifiedGenerateRequest, userPromptId: string): AsyncGenerator<UnifiedGenerateResponse>;
    /**
     * Count tokens using actual Gemini generator
     */
    protected countUnifiedTokens(request: CountTokensParameters): Promise<CountTokensResponse>;
    /**
     * Embed content using actual Gemini generator
     */
    protected embedUnifiedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;
    /**
     * Determine authentication type based on configuration and environment
     */
    private determineAuthType;
    /**
     * Get effective API key from various sources
     */
    private getEffectiveApiKey;
    /**
     * Determine if we should use Vertex AI
     */
    private shouldUseVertexAI;
    /**
     * Create user agent headers for requests
     */
    private createUserAgentHeaders;
    /**
     * Override health check to use actual generator
     */
    healthCheck(): Promise<boolean>;
    /**
     * Get the underlying generator for backward compatibility
     */
    getUnderlyingGenerator(): ContentGenerator | undefined;
    /**
     * Override requiresApiKey for Gemini-specific logic
     */
    protected requiresApiKey(): boolean;
    /**
     * Get model name with fallback to config
     */
    getModelName(): string;
    /**
     * Check if provider supports specific capability
     */
    supportsCapability(capability: string): boolean;
}
