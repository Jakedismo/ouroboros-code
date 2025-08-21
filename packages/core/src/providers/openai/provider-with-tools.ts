/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GenerateContentParameters,
  GenerateContentResponse,
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  Part,
} from '@google/genai';
import OpenAI from 'openai';
import { BaseMCPProvider, MCPProviderConfig } from '../base-mcp.js';
import { FormatConverter, UnifiedGenerateRequest, UnifiedGenerateResponse } from '../types.js';
import { OpenAIToolAdapter } from './tool-adapter.js';
import { UnifiedToolCall, UnifiedToolResult } from '../tools/unified-tool-interface.js';

/**
 * OpenAI provider with advanced MCP integration
 * Extends BaseMCPProvider to provide OpenAI-specific MCP functionality
 */
export class OpenAIProviderWithMCP extends BaseMCPProvider {
  private toolAdapter: OpenAIToolAdapter;
  private client: OpenAI;

  constructor(config: MCPProviderConfig) {
    super(config);
    this.toolAdapter = new OpenAIToolAdapter();
    
    // Initialize OpenAI client with real SDK
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
  }

  /**
   * Initialize the OpenAI MCP provider
   */
  async initialize(): Promise<void> {
    // Initialize MCP functionality first
    await this.initializeMCP();

    // Validate OpenAI client configuration
    try {
      // Test the connection with a simple request
      await this.client.models.list();
      console.log('OpenAI MCP provider initialized successfully');
    } catch (error) {
      throw new Error(`Failed to initialize OpenAI client: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create OpenAI-specific format converter
   */
  protected createConverter(): FormatConverter {
    return {
      fromGeminiFormat: (request: GenerateContentParameters): UnifiedGenerateRequest => {
        // Convert Gemini format to unified - this shouldn't normally be called for OpenAI
        const contents = Array.isArray(request.contents) ? request.contents : [request.contents];
        return {
          messages: contents.map((content: any) => ({
            role: content.role === 'model' ? 'assistant' : content.role,
            content: content.parts?.map((part: any) => ('text' in part ? part.text : '')).join('') || '',
          })),
          temperature: (request as any).generationConfig?.temperature,
          maxTokens: (request as any).generationConfig?.maxOutputTokens,
        };
      },
      toProviderFormat: (request: UnifiedGenerateRequest): any => {
        // Convert unified request to OpenAI format
        return {
          model: this.config.model,
          messages: request.messages,
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          tools: request.tools,
        };
      },
      fromProviderResponse: (response: any): UnifiedGenerateResponse => {
        // Convert OpenAI response to unified format
        return {
          content: response.choices?.[0]?.message?.content || '',
          functionCalls: response.choices?.[0]?.message?.tool_calls || [],
          finishReason: response.choices?.[0]?.finish_reason,
          usage: response.usage,
        };
      },
      toGeminiFormat: (response: UnifiedGenerateResponse): GenerateContentResponse => {
        // Convert unified response back to Gemini format
        const parts: Part[] = [];
        
        if (response.content) {
          parts.push({ text: response.content });
        }
        
        if (response.functionCalls && response.functionCalls.length > 0) {
          response.functionCalls.forEach((call: any) => {
            parts.push({ 
              functionCall: {
                name: call.name,
                args: call.args || call.arguments || {},
              }
            });
          });
        }
        
        const geminiResponse = new GenerateContentResponse();
        geminiResponse.candidates = [{
          content: {
            parts,
            role: 'model',
          },
          finishReason: response.finishReason as any,
          index: 0,
        }];
        geminiResponse.usageMetadata = response.usage;
        
        return geminiResponse;
      },
    };
  }

  /**
   * Generate content using OpenAI with MCP tool support
   */
  override async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    // Convert request to unified format
    const unifiedRequest = this.converter.fromGeminiFormat(request);
    
    // Convert tools to OpenAI format if MCP is enabled
    let openaiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [];
    
    if (this.isMCPEnabled()) {
      const mcpTools = await this.discoverMCPTools();
      openaiTools = mcpTools.map(tool => this.toolAdapter.toProviderFormat(tool));
    }

    // Make OpenAI API call with MCP tools
    const openaiRequest = this.converter.toProviderFormat(unifiedRequest);
    openaiRequest.tools = openaiTools.length > 0 ? openaiTools : undefined;

    const response = await this.client.chat.completions.create(openaiRequest);
    
    // Convert back to unified format and then to Gemini format
    const unifiedResponse = this.converter.fromProviderResponse(response);
    return this.converter.toGeminiFormat(unifiedResponse);
  }

  /**
   * Generate streaming content using OpenAI with MCP tool support
   */
  override async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    // Convert request to unified format
    const unifiedRequest = this.converter.fromGeminiFormat(request);
    unifiedRequest.stream = true;
    
    // Convert tools to OpenAI format if MCP is enabled
    let openaiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [];
    
    if (this.isMCPEnabled()) {
      const mcpTools = await this.discoverMCPTools();
      openaiTools = mcpTools.map(tool => this.toolAdapter.toProviderFormat(tool));
    }

    // Make OpenAI streaming API call with MCP tools
    const openaiRequest = this.converter.toProviderFormat(unifiedRequest);
    openaiRequest.tools = openaiTools.length > 0 ? openaiTools : undefined;
    openaiRequest.stream = true;

    const stream = await this.client.chat.completions.create(openaiRequest);
    
    async function* convertStream(stream: any, converter: FormatConverter) {
      for await (const chunk of stream) {
        const unifiedResponse = converter.fromProviderResponse(chunk);
        yield converter.toGeminiFormat(unifiedResponse);
      }
    }
    
    return convertStream(stream, this.converter);
  }

  /**
   * Count tokens using OpenAI tokenizer
   */
  override async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // Convert request and estimate tokens based on text content
    const contents = Array.isArray(request.contents) ? request.contents : [request.contents];
    const textLength = contents
      .flatMap(content => (content as any).parts || [])
      .filter((part): part is Part & { text: string } => 'text' in part)
      .map(part => part.text)
      .join('')
      .length;
    
    // Rough approximation for OpenAI models: 1 token per 4 characters
    const estimatedTokens = Math.ceil(textLength / 4);
    
    return {
      totalTokens: estimatedTokens,
    };
  }

  /**
   * Embed content using OpenAI embeddings
   */
  override async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    // Extract text content from contents array
    const contents = Array.isArray(request.contents) ? request.contents : [request.contents];
    const textContent = contents
      .flatMap(content => (content as any).parts || [])
      .filter((part: any) => 'text' in part)
      .map((part: any) => part.text)
      .join(' ');

    if (!textContent.trim()) {
      throw new Error('No text content found for embedding');
    }

    // Use OpenAI embeddings API
    const response = await this.client.embeddings.create({
      model: 'text-embedding-3-small', // Use a default OpenAI embedding model
      input: textContent,
    });

    return {
      embeddings: [{
        values: response.data[0].embedding,
      }],
    };
  }

  /**
   * Execute tools with OpenAI-specific handling
   */
  override async executeToolsWithMCP(calls: UnifiedToolCall[]): Promise<UnifiedToolResult[]> {
    if (!this.isMCPEnabled()) {
      throw new Error('MCP is not enabled for this OpenAI provider');
    }

    console.log(`Executing ${calls.length} tool calls with OpenAI MCP integration`);

    // Use the base class implementation but add OpenAI-specific processing
    const results = await super.executeToolsWithMCP(calls);

    // Apply OpenAI-specific post-processing if needed
    return results.map(result => ({
      ...result,
      // Add OpenAI-specific metadata or formatting
    }));
  }

  /**
   * Get OpenAI-specific tools in OpenAI format
   */
  async getOpenAITools(): Promise<any[]> {
    if (!this.isMCPEnabled()) {
      return [];
    }

    const unifiedTools = await this.discoverMCPTools();
    return unifiedTools.map(tool => this.toolAdapter.toProviderFormat(tool));
  }

  /**
   * Handle OpenAI tool calls and convert to unified format
   */
  async handleOpenAIToolCalls(toolCalls: any[]): Promise<UnifiedToolResult[]> {
    if (!this.isMCPEnabled()) {
      return [];
    }

    // Convert OpenAI tool calls to unified format
    const unifiedCalls = toolCalls.map(call => 
      this.toolAdapter.fromProviderToolCall(call)
    );

    // Execute using MCP integration
    return await this.executeToolsWithMCP(unifiedCalls);
  }

  /**
   * Get provider-specific diagnostics
   */
  getDiagnostics(): any {
    return {
      ...this.getMCPStats(),
      provider: 'openai',
      model: this.config.model,
      toolAdapter: this.toolAdapter.constructor.name,
      // Add other OpenAI-specific diagnostics
    };
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    await this.disposeMCP();
    // No specific cleanup needed for OpenAI client
    console.log('OpenAI MCP provider disposed');
  }

  /**
   * Generate unified content (required abstract method)
   */
  protected async generateUnifiedContent(
    request: UnifiedGenerateRequest,
    userPromptId: string,
  ): Promise<UnifiedGenerateResponse> {
    // Convert unified request to OpenAI format and make API call
    const openaiRequest = this.converter.toProviderFormat(request);
    const response = await this.client.chat.completions.create(openaiRequest);
    
    // Convert OpenAI response back to unified format
    return this.converter.fromProviderResponse(response);
  }

  /**
   * Generate unified content stream (required abstract method)
   */
  protected async *generateUnifiedContentStream(
    request: UnifiedGenerateRequest,
    userPromptId: string,
  ): AsyncGenerator<UnifiedGenerateResponse, void, unknown> {
    // Convert unified request to OpenAI format with streaming enabled
    const openaiRequest = this.converter.toProviderFormat(request);
    openaiRequest.stream = true;
    
    // When stream is true, OpenAI SDK returns an AsyncIterable directly
    const stream = await this.client.chat.completions.create(openaiRequest);
    
    // TypeScript doesn't recognize the stream type properly, so we cast it
    for await (const chunk of stream as any) {
      yield this.converter.fromProviderResponse(chunk);
    }
  }

  /**
   * Count unified tokens (required abstract method)
   */
  protected async countUnifiedTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    // Use the same token counting logic as the public method
    return await this.countTokens(request);
  }

  /**
   * Embed unified content (required abstract method)
   */
  protected async embedUnifiedContent(
    request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    // Use the same embedding logic as the public method
    return await this.embedContent(request);
  }
}