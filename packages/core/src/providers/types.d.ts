/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { GenerateContentParameters, GenerateContentResponse, FunctionCall, UsageMetadata } from '@google/genai';
import { MultiProviderMCPConfig } from '../config/multi-provider-mcp-config.js';
import { UnifiedTool, UnifiedToolCall, UnifiedToolResult } from './tools/unified-tool-interface.js';
import { MCPToolManager } from './tools/mcp-tool-manager.js';
/**
 * Supported LLM providers for multi-provider architecture
 */
export declare enum LLMProvider {
    GEMINI = "gemini",
    OPENAI = "openai",
    ANTHROPIC = "anthropic"
}
/**
 * Configuration for LLM provider instances
 */
export interface LLMProviderConfig {
    provider: LLMProvider;
    apiKey?: string;
    baseUrl?: string;
    model: string;
    embeddingModel?: string;
    maxRetries?: number;
    timeout?: number;
    enableMCP?: boolean;
    enableBuiltinTools?: boolean;
    configInstance?: any;
    mcpConfig?: Partial<MultiProviderMCPConfig>;
}
/**
 * Unified message format that can be converted to any provider format
 */
export interface UnifiedMessage {
    role: 'user' | 'assistant' | 'system' | 'function';
    content: string | Array<TextPart | ImagePart | FunctionCallPart>;
}
export interface TextPart {
    text: string;
}
export interface ImagePart {
    inlineData?: {
        mimeType: string;
        data: string;
    };
    fileData?: {
        mimeType: string;
        fileUri: string;
    };
}
export interface FunctionCallPart {
    functionCall: {
        name: string;
        args: Record<string, any>;
    };
}
/**
 * Unified generation request that can be converted to any provider format
 */
export interface UnifiedGenerateRequest {
    messages: UnifiedMessage[];
    systemInstruction?: string;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
    tools?: UnifiedTool[];
    toolChoice?: 'auto' | 'none' | 'required';
    stream?: boolean;
}
/**
 * Unified generation response that normalizes provider responses
 */
export interface UnifiedGenerateResponse {
    content: string;
    functionCalls?: FunctionCall[];
    finishReason?: string;
    usage?: UsageMetadata;
}
export type { UnifiedTool, UnifiedToolCall, UnifiedToolResult } from './tools/unified-tool-interface.js';
export interface UnifiedToolParameters {
    type: 'object';
    properties: Record<string, UnifiedParameterSchema>;
    required?: string[];
}
export interface UnifiedParameterSchema {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    description?: string;
    enum?: any[];
    items?: UnifiedParameterSchema;
    properties?: Record<string, UnifiedParameterSchema>;
    default?: any;
}
/**
 * Provider conversion capabilities interface
 */
export interface FormatConverter {
    /**
     * Convert Gemini format to unified format
     */
    fromGeminiFormat(request: GenerateContentParameters): UnifiedGenerateRequest;
    /**
     * Convert unified format to provider-specific format
     */
    toProviderFormat(request: UnifiedGenerateRequest): any;
    /**
     * Convert provider response to unified format
     */
    fromProviderResponse(response: any): UnifiedGenerateResponse;
    /**
     * Convert unified response back to Gemini format
     */
    toGeminiFormat(response: UnifiedGenerateResponse): GenerateContentResponse;
}
/**
 * Provider-specific error types
 */
export declare class ProviderError extends Error {
    provider: LLMProvider;
    originalError?: Error | undefined;
    constructor(message: string, provider: LLMProvider, originalError?: Error | undefined);
}
export declare class ProviderAuthError extends ProviderError {
    constructor(provider: LLMProvider, originalError?: Error);
}
export declare class ProviderRateLimitError extends ProviderError {
    constructor(provider: LLMProvider, retryAfter?: number);
    retryAfter?: number;
}
export declare class ProviderQuotaError extends ProviderError {
    constructor(provider: LLMProvider, quotaType: string);
}
/**
 * Default model mappings for each provider
 */
export declare const DEFAULT_MODELS: Record<LLMProvider, string>;
/**
 * Provider capability matrix
 */
export interface ProviderCapabilities {
    supportsStreaming: boolean;
    supportsTools: boolean;
    supportsFunctionCalling: boolean;
    supportsVision: boolean;
    supportsEmbedding: boolean;
    maxTokens: number;
    maxContextTokens: number;
    supportsSystemMessage: boolean;
    supportsToolChoice: boolean;
}
export declare const PROVIDER_CAPABILITIES: Record<LLMProvider, ProviderCapabilities>;
/**
 * Interface that all MCP-capable providers must implement
 * Extends the base provider functionality with MCP-specific capabilities
 */
export interface MCPCapableProvider {
    /**
     * Get the MCP tool manager instance for this provider
     */
    getMCPToolManager(): MCPToolManager;
    /**
     * Execute multiple tool calls using MCP integration
     * @param calls Array of unified tool calls to execute
     * @returns Promise resolving to array of tool results
     */
    executeToolsWithMCP(calls: UnifiedToolCall[]): Promise<UnifiedToolResult[]>;
    /**
     * Discover available MCP tools from connected servers
     * @returns Promise resolving to array of available tools
     */
    discoverMCPTools(): Promise<UnifiedTool[]>;
    /**
     * Synchronize tools across all providers in the system
     * This ensures consistent tool availability across different providers
     * @returns Promise that resolves when synchronization is complete
     */
    syncToolsAcrossProviders(): Promise<void>;
    /**
     * Check if MCP integration is enabled and functional
     * @returns True if MCP is available, false otherwise
     */
    isMCPEnabled(): boolean;
    /**
     * Get health status of MCP connections
     * @returns Promise resolving to health status map (server name -> healthy)
     */
    getMCPConnectionHealth(): Promise<Record<string, boolean>>;
    /**
     * Refresh MCP connections and rediscover tools
     * @returns Promise that resolves when refresh is complete
     */
    refreshMCPConnections(): Promise<void>;
}
