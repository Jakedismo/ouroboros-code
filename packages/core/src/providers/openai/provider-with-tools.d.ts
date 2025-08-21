/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { GenerateContentParameters, GenerateContentResponse, CountTokensParameters, CountTokensResponse, EmbedContentParameters, EmbedContentResponse } from '@google/genai';
import { BaseMCPProvider, MCPProviderConfig } from '../base-mcp.js';
import { FormatConverter } from '../types.js';
import { UnifiedToolCall, UnifiedToolResult } from '../tools/unified-tool-interface.js';
/**
 * OpenAI provider with advanced MCP integration
 * Extends BaseMCPProvider to provide OpenAI-specific MCP functionality
 */
export declare class OpenAIProviderWithMCP extends BaseMCPProvider {
    private toolAdapter;
    constructor(config: MCPProviderConfig);
    /**
     * Initialize the OpenAI MCP provider
     */
    initialize(): Promise<void>;
    /**
     * Create OpenAI-specific format converter
     */
    protected createConverter(): FormatConverter;
    /**
     * Generate content using OpenAI with MCP tool support
     */
    generateContent(request: GenerateContentParameters, userPromptId: string): Promise<GenerateContentResponse>;
    /**
     * Generate streaming content using OpenAI with MCP tool support
     */
    generateContentStream(request: GenerateContentParameters, userPromptId: string): Promise<AsyncGenerator<GenerateContentResponse>>;
    /**
     * Count tokens using OpenAI tokenizer
     */
    countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;
    /**
     * Embed content using OpenAI embeddings
     */
    embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;
    /**
     * Execute tools with OpenAI-specific handling
     */
    executeToolsWithMCP(calls: UnifiedToolCall[]): Promise<UnifiedToolResult[]>;
    /**
     * Get OpenAI-specific tools in OpenAI format
     */
    getOpenAITools(): Promise<any[]>;
    /**
     * Handle OpenAI tool calls and convert to unified format
     */
    handleOpenAIToolCalls(toolCalls: any[]): Promise<UnifiedToolResult[]>;
    /**
     * Get provider-specific diagnostics
     */
    getDiagnostics(): any;
    /**
     * Cleanup resources
     */
    dispose(): Promise<void>;
}
