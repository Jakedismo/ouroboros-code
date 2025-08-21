/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { GenerateContentParameters, GenerateContentResponse, CountTokensParameters, CountTokensResponse, EmbedContentParameters, EmbedContentResponse } from '@google/genai';
import { ContentGenerator } from '../../core/contentGenerator.js';
import { UserTierId } from '../../code_assist/types.js';
import { Config } from '../../config/config.js';
/**
 * Complete OpenAI provider with full built-in tools integration.
 * This provider enables OpenAI models to use all of Gemini CLI's built-in tools
 * while maintaining the same behavior, security, and confirmation flows.
 *
 * Features:
 * - Full conversation management with multi-round tool execution
 * - All 11 built-in tools available with identical behavior
 * - Security boundaries and confirmation flows
 * - Streaming and non-streaming responses
 * - Token counting and usage tracking
 * - Error handling and recovery
 */
export declare class OpenAICompleteProvider implements ContentGenerator {
    private client;
    private builtinTools;
    private model;
    userTier?: UserTierId;
    constructor(config: {
        apiKey: string;
        model: string;
        configInstance: Config;
        baseURL?: string;
    });
    /**
     * Initialize the provider and its tool integration.
     */
    initialize(): Promise<void>;
    /**
     * Generate content with full tool integration support.
     * Handles multi-round conversations with tool calls automatically.
     */
    generateContent(request: GenerateContentParameters, userPromptId: string): Promise<GenerateContentResponse>;
    /**
     * Execute the conversation loop with automatic tool calling.
     *
     * @private
     */
    private executeConversationLoop;
    /**
     * Create a confirmation handler for tool execution.
     *
     * @private
     */
    private createConfirmationHandler;
    /**
     * Convert Gemini request to OpenAI messages format.
     *
     * @private
     */
    private convertToOpenAIMessages;
    /**
     * Convert OpenAI response to Gemini format.
     *
     * @private
     */
    private convertToGeminiResponse;
    /**
     * Convert OpenAI finish reason to Gemini format.
     *
     * @private
     */
    private convertFinishReason;
    /**
     * Create a mock OpenAI client for development.
     * In production, this would be replaced with the actual OpenAI SDK.
     *
     * @private
     */
    private createMockClient;
    /**
     * Generate streaming content.
     * Currently returns a single response wrapped in an async generator.
     */
    generateContentStream(request: GenerateContentParameters, userPromptId: string): Promise<AsyncGenerator<GenerateContentResponse>>;
    /**
     * Count tokens in the request.
     * Mock implementation for now.
     */
    countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;
    /**
     * Generate embeddings.
     * Not implemented for OpenAI provider yet.
     */
    embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;
    /**
     * Get information about the provider and its capabilities.
     */
    getProviderInfo(): {
        provider: string;
        model: string;
        toolsAvailable: {
            totalTools: number;
            toolNames: string[];
            toolsByCategory: Record<string, string[]>;
        };
        capabilities: {
            streaming: boolean;
            toolCalls: boolean;
            embeddings: boolean;
            tokenCounting: boolean;
        };
    };
    /**
     * Test the provider connection and tool integration.
     */
    testConnection(): Promise<{
        success: boolean;
        error?: string;
        toolsInitialized: boolean;
        toolCount: number;
    }>;
}
