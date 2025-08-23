/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GenerateContentParameters,
  GenerateContentResponse,
  FunctionCall,
  UsageMetadata,
} from '@google/genai';
import { MultiProviderMCPConfig } from '../config/multi-provider-mcp-config.js';
import { UnifiedTool, UnifiedToolCall, UnifiedToolResult } from './tools/unified-tool-interface.js';
import { MCPToolManager } from './tools/mcp-tool-manager.js';
import { AuthType } from '../core/contentGenerator.js';

/**
 * Supported LLM providers for multi-provider architecture
 */
export enum LLMProvider {
  GEMINI = 'gemini',
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
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
  configInstance?: any; // Reference to Config instance for tool integration
  mcpConfig?: Partial<MultiProviderMCPConfig>; // Advanced MCP configuration
  authType?: AuthType; // Authentication type for OAuth vs API key handling
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
  model?: string;
  systemInstruction?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  tools?: UnifiedTool[];
  toolChoice?: 'auto' | 'none' | 'required';
  stream?: boolean;
  thinkingConfig?: {
    thinkingBudget?: number;
    includeThoughts?: boolean;
  };
}

/**
 * Unified generation response that normalizes provider responses
 */
export interface UnifiedGenerateResponse {
  content: string;
  functionCalls?: FunctionCall[];
  finishReason?: string;
  usage?: UsageMetadata;
  thinkingContent?: {
    type: 'thinking';
    content: string;
    isComplete: boolean;
  };
}

// Re-export the unified tool types from unified-tool-interface
export type { UnifiedTool, UnifiedToolCall, UnifiedToolResult } from './tools/unified-tool-interface.js';

// Additional parameter types not in unified-tool-interface
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
export class ProviderError extends Error {
  constructor(
    message: string,
    public provider: LLMProvider,
    public originalError?: Error,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export class ProviderAuthError extends ProviderError {
  constructor(provider: LLMProvider, originalError?: Error) {
    super(`Authentication failed for provider ${provider}`, provider, originalError);
    this.name = 'ProviderAuthError';
  }
}

export class ProviderRateLimitError extends ProviderError {
  constructor(provider: LLMProvider, retryAfter?: number) {
    super(`Rate limit exceeded for provider ${provider}`, provider);
    this.name = 'ProviderRateLimitError';
    this.retryAfter = retryAfter;
  }
  
  retryAfter?: number;
}

export class ProviderQuotaError extends ProviderError {
  constructor(provider: LLMProvider, quotaType: string) {
    super(`Quota exceeded for provider ${provider}: ${quotaType}`, provider);
    this.name = 'ProviderQuotaError';
  }
}

/**
 * Default model mappings for each provider
 */
export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  [LLMProvider.GEMINI]: 'gemini-2.5-pro',
  [LLMProvider.OPENAI]: 'gpt-5',
  [LLMProvider.ANTHROPIC]: 'claude-opus-4-1-20250805',
};

/**
 * Thinking/reasoning content for streaming
 */
export interface ThinkingContent {
  type: 'thinking' | 'response';
  content: string;
  isComplete: boolean;
  metadata?: {
    thinkingTime?: number;
    effortLevel?: string;
    tokenCount?: number;
    modelType?: string;
    usedThinking?: boolean;
    summaryMode?: boolean;
    thinkingTokens?: number;
  };
}

/**
 * Thinking capabilities for each provider
 */
export interface ThinkingCapabilities {
  supportsThinking: boolean;
  supportsThinkingStream: boolean;
  thinkingParameterName?: string; // 'budget_tokens' | 'reasoning_effort'
  maxThinkingTokens?: number;
  defaultThinkingConfig?: any;
}

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
  // Thinking capabilities
  thinking?: ThinkingCapabilities;
}

export const PROVIDER_CAPABILITIES: Record<LLMProvider, ProviderCapabilities> = {
  [LLMProvider.GEMINI]: {
    supportsStreaming: true,
    supportsTools: true,
    supportsFunctionCalling: true,
    supportsVision: true,
    supportsEmbedding: true,
    maxTokens: 8192,
    maxContextTokens: 2097152, // 2M tokens for Gemini 2.5
    supportsSystemMessage: true,
    supportsToolChoice: true,
    // Gemini 2.5 supports thinking mode
    thinking: {
      supportsThinking: true,
      supportsThinkingStream: true,
      thinkingParameterName: 'thinkingBudget',
      defaultThinkingConfig: {
        thinkingBudget: -1, // Dynamic thinking by default
        includeThoughts: true // Include thought summaries
      }
    },
  },
  [LLMProvider.OPENAI]: {
    supportsStreaming: true,
    supportsTools: true,
    supportsFunctionCalling: true,
    supportsVision: true,
    supportsEmbedding: true,
    maxTokens: 8192,
    maxContextTokens: 256000, // 256K tokens for GPT-5
    supportsSystemMessage: true,
    supportsToolChoice: true,
    thinking: {
      supportsThinking: true,
      supportsThinkingStream: false, // GPT-5 doesn't expose thinking tokens
      thinkingParameterName: 'reasoning_effort',
      defaultThinkingConfig: {
        reasoning_effort: 'high',
        verbosity: 'medium'
      }
    },
  },
  [LLMProvider.ANTHROPIC]: {
    supportsStreaming: true,
    supportsTools: true,
    supportsFunctionCalling: true,
    supportsVision: true,
    supportsEmbedding: false,
    maxTokens: 8192,
    maxContextTokens: 500000, // 500K tokens for Claude Opus 4.1
    supportsSystemMessage: true,
    supportsToolChoice: false,
    thinking: {
      supportsThinking: true,
      supportsThinkingStream: true, // Claude 4/Opus 4.1 support full thinking stream
      thinkingParameterName: 'budget_tokens',
      maxThinkingTokens: 64000, // Max 64k thinking tokens
      defaultThinkingConfig: {
        budget_tokens: 64000 // Maximum performance as requested
      }
    },
  },
};

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