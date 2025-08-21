/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { GenerateContentParameters, GenerateContentResponse, CountTokensParameters, CountTokensResponse, EmbedContentParameters, EmbedContentResponse } from '@google/genai';
import { ContentGenerator } from '../../core/contentGenerator.js';
import { UserTierId } from '../../code_assist/types.js';
import { Config } from '../../config/config.js';
import { AnthropicToolUse } from './tool-adapter.js';
/**
 * Complete Anthropic provider with full built-in tools integration.
 * This provider enables Anthropic models to use all of Gemini CLI's built-in tools
 * while maintaining the same behavior, security, and confirmation flows.
 *
 * Features:
 * - Full conversation management with multi-round tool execution
 * - All 11 built-in tools available with identical behavior
 * - Security boundaries and confirmation flows
 * - Streaming and non-streaming responses
 * - Token counting and usage tracking
 * - Error handling and recovery
 * - Native Anthropic tool_use format support
 */
export declare class AnthropicCompleteProvider implements ContentGenerator {
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
     * Handles multi-round conversations with tool use automatically.
     */
    generateContent(request: GenerateContentParameters, userPromptId: string): Promise<GenerateContentResponse>;
    /**
     * Execute the conversation loop with automatic tool use.
     *
     * @private
     */
    private executeConversationLoop;
    /**
     * Extract tool use blocks from Anthropic response.
     *
     * @private
     */
    private extractToolUseBlocks;
    /**
     * Create a confirmation handler for tool execution.
     *
     * @private
     */
    private createConfirmationHandler;
    /**
     * Convert Gemini request to Anthropic messages format.
     *
     * @private
     */
    private convertToAnthropicMessages;
    /**
     * Convert Anthropic response to Gemini format.
     *
     * @private
     */
    private convertToGeminiResponse;
    /**
     * Convert Anthropic stop reason to Gemini format.
     *
     * @private
     */
    private convertStopReason;
    /**
     * Create a mock Anthropic client for development.
     * In production, this would be replaced with the actual Anthropic SDK.
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
     * Not implemented for Anthropic provider yet.
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
            toolUse: boolean;
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
    /**
     * Validate a batch of tool use blocks before execution.
     */
    validateToolUseBatch(toolUseBlocks: AnthropicToolUse[]): {
        toolUse: AnthropicToolUse;
        valid: boolean;
        error?: string;
        warnings?: string[];
    }[];
    /**
     * Check if all tools in a batch are safe for automatic execution.
     */
    areToolsSafeForAuto(toolUseBlocks: AnthropicToolUse[]): boolean;
    /**
     * Get the estimated timeout for executing a batch of tools.
     */
    getBatchExecutionTimeout(toolUseBlocks: AnthropicToolUse[]): number;
}
