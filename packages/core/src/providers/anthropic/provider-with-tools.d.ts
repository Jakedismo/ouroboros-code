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
 * Anthropic provider with advanced MCP integration
 * Extends BaseMCPProvider to provide Anthropic-specific MCP functionality
 */
export declare class AnthropicProviderWithMCP extends BaseMCPProvider {
    private toolAdapter;
    constructor(config: MCPProviderConfig);
    /**
     * Initialize the Anthropic MCP provider
     */
    initialize(): Promise<void>;
    /**
     * Create Anthropic-specific format converter
     */
    protected createConverter(): FormatConverter;
    /**
     * Generate content using Anthropic with MCP tool support
     */
    generateContent(request: GenerateContentParameters, userPromptId: string): Promise<GenerateContentResponse>;
    /**
     * Generate streaming content using Anthropic with MCP tool support
     */
    generateContentStream(request: GenerateContentParameters, userPromptId: string): Promise<AsyncGenerator<GenerateContentResponse>>;
    /**
     * Count tokens using Anthropic tokenizer
     */
    countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;
    /**
     * Embed content using Anthropic (not supported)
     */
    embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;
    /**
     * Execute tools with Anthropic-specific handling
     */
    executeToolsWithMCP(calls: UnifiedToolCall[]): Promise<UnifiedToolResult[]>;
    /**
     * Get Anthropic-specific tools in Anthropic format
     */
    getAnthropicTools(): Promise<any[]>;
    /**
     * Handle Anthropic tool use blocks and convert to unified format
     */
    handleAnthropicToolUse(toolUseBlocks: any[]): Promise<UnifiedToolResult[]>;
    /**
     * Get provider-specific diagnostics
     */
    getDiagnostics(): any;
    /**
     * Get Anthropic-specific configuration optimizations
     */
    getAnthropicOptimizations(): any;
    /**
     * Handle Anthropic-specific error cases
     */
    handleAnthropicError(error: any): Error;
    /**
     * Cleanup resources
     */
    dispose(): Promise<void>;
}
