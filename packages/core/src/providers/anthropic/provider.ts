/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
} from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import { BaseLLMProvider } from '../base.js';
import { AnthropicFormatConverter } from './converter.js';
import {
  LLMProviderConfig,
  LLMProvider,
  UnifiedGenerateRequest,
  UnifiedGenerateResponse,
  FormatConverter,
  ProviderError,
  ProviderAuthError,
  ProviderRateLimitError,
  ProviderQuotaError,
  ThinkingContent,
  PROVIDER_CAPABILITIES,
} from '../types.js';

/**
 * Anthropic provider implementation
 */
export class AnthropicProvider extends BaseLLMProvider {
  private client: Anthropic;

  constructor(config: LLMProviderConfig) {
    super(config);
    
    // Initialize Anthropic client with real SDK
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
  }

  /**
   * Create format converter for Anthropic
   */
  protected createConverter(): FormatConverter {
    return new AnthropicFormatConverter();
  }

  /**
   * Initialize the Anthropic provider
   */
  async initialize(): Promise<void> {
    try {
      // Validate the connection with a simple API call
      await this.client.messages.create({
        model: this.config.model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hello' }],
      });
      
      console.log('Anthropic provider initialized successfully');
    } catch (error: unknown) {
      throw this.wrapProviderError(error as Error, 'initialize');
    }
  }

  /**
   * Generate content using Anthropic API
   */
  protected async generateUnifiedContent(
    request: UnifiedGenerateRequest,
    _userPromptId: string,
  ): Promise<UnifiedGenerateResponse> {
    try {
      // Convert to Anthropic format
      const anthropicRequest = this.converter.toProviderFormat(request);

      // Set model
      anthropicRequest.model = this.config.model;

      // Make the API call
      const response = await this.client.messages.create(anthropicRequest);

      // Convert back to unified format
      return this.converter.fromProviderResponse(response);
    } catch (error: unknown) {
      throw this.wrapProviderError(error as Error, 'generateUnifiedContent');
    }
  }

  /**
   * Generate streaming content
   */
  protected async *generateUnifiedContentStream(
    request: UnifiedGenerateRequest,
    _userPromptId: string,
  ): AsyncGenerator<UnifiedGenerateResponse> {
    try {
      // Convert to Anthropic format
      const anthropicRequest = this.converter.toProviderFormat(request);

      // Set model and enable streaming
      anthropicRequest.model = this.config.model;
      anthropicRequest.stream = true;

      // Make streaming API call
      const stream = await this.client.messages.stream(anthropicRequest);

      // Process stream events
      for await (const event of stream) {
        const converter = this.converter as AnthropicFormatConverter;
        const unifiedChunk = converter.convertStreamEvent(event);

        // Only yield chunks with actual content
        if (
          unifiedChunk.content ||
          unifiedChunk.functionCalls ||
          unifiedChunk.finishReason
        ) {
          yield unifiedChunk;
        }
      }
    } catch (error: unknown) {
      throw this.handleAnthropicError(error);
    }
  }

  /**
   * Count tokens using Anthropic's approach
   * Note: Anthropic doesn't have a direct token counting API, so we estimate
   */
  protected async countUnifiedTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    // For Anthropic, we need to estimate token count
    // This is a simplified implementation - Claude uses a different tokenizer
    // than GPT models, but this provides a rough estimate

    let totalTokens = 0;

    if (request.contents) {
      const contents = Array.isArray(request.contents) ? request.contents : [request.contents];
      for (const content of contents) {
        if (typeof content === 'object' && 'parts' in content && content.parts) {
          for (const part of content.parts) {
            if ('text' in part && part.text) {
              // Rough estimation: ~3.5 characters per token for English (Claude tokenizer)
              totalTokens += Math.ceil(part.text.length / 3.5);
            }
          }
        }
      }
    }

    // Add overhead for system messages, tools, etc.
    totalTokens += 100; // Base overhead

    return {
      totalTokens,
    };
  }

  /**
   * Anthropic doesn't support embeddings natively
   */
  protected async embedUnifiedContent(
    _request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    throw new ProviderError(
      'Anthropic does not support embeddings. Use OpenAI or Gemini for embedding functionality.',
      LLMProvider.ANTHROPIC,
    );
  }

  /**
   * Handle Anthropic-specific errors
   */
  private handleAnthropicError(error: unknown): Error {
    // Check for specific Anthropic error types
    if ((error as any)?.error || (error as any)?.type) {
      const errorType = (error as any).type || (error as any).error?.type;
      const errorCode = (error as any).error?.code;
      const statusCode = (error as any).status;

      // Authentication errors
      if (statusCode === 401 || errorType === 'authentication_error') {
        return new ProviderAuthError(LLMProvider.ANTHROPIC, error as Error);
      }

      // Rate limit errors
      if (statusCode === 429 || errorType === 'rate_limit_error') {
        const retryAfter = (error as any).headers?.['retry-after']
          ? parseInt((error as any).headers['retry-after'], 10)
          : undefined;
        return new ProviderRateLimitError(LLMProvider.ANTHROPIC, retryAfter);
      }

      // Overloaded errors (Anthropic returns 529 for overloaded)
      if (statusCode === 529 || errorType === 'overloaded_error') {
        return new ProviderRateLimitError(LLMProvider.ANTHROPIC);
      }

      // Permission errors
      if (statusCode === 403 || errorType === 'permission_error') {
        return new ProviderAuthError(LLMProvider.ANTHROPIC, error as Error);
      }

      // Quota/billing errors
      if (errorType === 'billing_error' || errorCode === 'insufficient_quota') {
        return new ProviderQuotaError(LLMProvider.ANTHROPIC, 'API quota');
      }

      // Model errors
      if (
        errorType === 'invalid_request_error' &&
        (error as any).message?.includes('model')
      ) {
        return new ProviderError(
          `Model ${this.config.model} not found or not accessible`,
          LLMProvider.ANTHROPIC,
          error as Error,
        );
      }

      // Content filter errors
      if (
        errorType === 'invalid_request_error' &&
        ((error as any).message?.includes('harmful') ||
          (error as any).message?.includes('unsafe'))
      ) {
        return new ProviderError(
          'Content filtered by Anthropic safety systems',
          LLMProvider.ANTHROPIC,
          error as Error,
        );
      }

      // API errors
      if (statusCode >= 500 || errorType === 'api_error') {
        return new ProviderError(
          'Anthropic API error - service temporarily unavailable',
          LLMProvider.ANTHROPIC,
          error as Error,
        );
      }
    }

    // Network errors
    if ((error as any).code === 'ECONNREFUSED' || (error as any).code === 'ENOTFOUND') {
      return new ProviderError(
        'Network error: Unable to connect to Anthropic API',
        LLMProvider.ANTHROPIC,
        error as Error,
      );
    }

    // Timeout errors
    if ((error as any).code === 'ETIMEDOUT' || (error as any).message?.includes('timeout')) {
      return new ProviderError(
        'Request timed out while calling Anthropic API',
        LLMProvider.ANTHROPIC,
        error as Error,
      );
    }

    // Generic error handling
    return this.wrapProviderError(error as Error, 'Anthropic API call');
  }

  /**
   * Override auth error detection for Anthropic specifics
   */
  protected override isAuthError(error: unknown): boolean {
    if (super.isAuthError(error)) {
      return true;
    }

    // Anthropic-specific auth error patterns
    return !!(
      (error as any)?.type === 'authentication_error' ||
      (error as any)?.error?.type === 'authentication_error' ||
      (error as any)?.status === 401 ||
      ((error as any)?.status === 403 && (error as any)?.type === 'permission_error')
    );
  }

  /**
   * Override rate limit error detection for Anthropic specifics
   */
  protected override isRateLimitError(error: unknown): boolean {
    if (super.isRateLimitError(error)) {
      return true;
    }

    // Anthropic-specific rate limit patterns
    return !!(
      (error as any)?.type === 'rate_limit_error' ||
      (error as any)?.type === 'overloaded_error' ||
      (error as any)?.error?.type === 'rate_limit_error' ||
      (error as any)?.status === 429 ||
      (error as any)?.status === 529 // Anthropic uses 529 for overloaded
    );
  }

  /**
   * Get list of available models
   */
  async getAvailableModels(): Promise<string[]> {
    // Anthropic doesn't have a models list endpoint, so return known models
    return [
      'claude-opus-4-1-20250805',
      'claude-4-sonnet-20250514',
    ];
  }

  /**
   * Get model information (limited for Anthropic)
   */
  async getModelInfo(): Promise<any> {
    // Anthropic doesn't provide detailed model info via API
    const knownModels: Record<string, any> = {
      'claude-opus-4-1-20250805': {
        id: 'claude-opus-4-1-20250805',
        name: 'Claude Opus 4.1',
        max_tokens: 8192,
        max_context_tokens: 500000,
        supports_tools: true,
        supports_vision: true,
      },
      'claude-4-sonnet-20250514': {
        id: 'claude-4-sonnet-20250514',
        name: 'Claude 4 Sonnet',
        max_tokens: 8192,
        max_context_tokens: 500000,
        supports_tools: true,
        supports_vision: true,
      },
    };

    return (
      knownModels[this.config.model] || {
        id: this.config.model,
        name: this.config.model,
        max_tokens: 4096,
        max_context_tokens: 200000,
      }
    );
  }

  /**
   * Override health check with Anthropic-specific implementation
   */
  override async healthCheck(): Promise<boolean> {
    try {
      if (!this.client) {
        await this.initialize();
      }

      // Simple completion test
      await this.generateUnifiedContent(
        {
          messages: [
            {
              role: 'user',
              content: 'Hi',
            },
          ],
        },
        'health-check',
      );
      return true;
    } catch (error) {
      console.debug('Anthropic health check failed:', error);
      return false;
    }
  }

  /**
   * Check if model supports specific capability
   */
  supportsCapability(capability: string): boolean {
    const capabilities = this.getCapabilities();

    switch (capability) {
      case 'streaming':
        return capabilities.supportsStreaming;
      case 'tools':
        return capabilities.supportsTools && this.isModernClaudeModel();
      case 'vision':
        return capabilities.supportsVision && this.isModernClaudeModel();
      case 'embedding':
        return capabilities.supportsEmbedding; // Always false for Anthropic
      default:
        return false;
    }
  }

  /**
   * Check if current model is a modern Claude model (3.0+)
   */
  private isModernClaudeModel(): boolean {
    const model = this.config.model.toLowerCase();
    return (
      model.includes('claude-4') ||
      model.includes('opus') ||
      model.includes('sonnet')
    );
  }

  /**
   * Get model context window size
   */
  getContextWindow(): number {
    // Use known model values
    const knownModels: Record<string, number> = {
      'claude-opus-4-1-20250805': 500000,
      'claude-4-sonnet-20250514': 200000,
      'claude-3-haiku-20240307': 200000,
    };
    return knownModels[this.config.model] || 200000;
  }

  /**
   * Get maximum output tokens
   */
  getMaxOutputTokens(): number {
    // Use known model values
    const knownModels: Record<string, number> = {
      'claude-opus-4-1-20250805': 8192,
      'claude-4-sonnet-20250514': 4096,
      'claude-3-haiku-20240307': 4096,
    };
    return knownModels[this.config.model] || 4096;
  }

  /**
   * Check if provider supports thinking mode
   */
  protected override supportsThinkingMode(): boolean {
    const capabilities = PROVIDER_CAPABILITIES[LLMProvider.ANTHROPIC];
    return capabilities.thinking?.supportsThinking || false;
  }

  /**
   * Generate content with thinking capabilities (Claude 4/Opus 4.1 specific)
   */
  protected override async generateContentWithThinking(
    request: UnifiedGenerateRequest,
    onThinking?: (thinkingContent: ThinkingContent) => void,
  ): Promise<UnifiedGenerateResponse> {
    const capabilities = PROVIDER_CAPABILITIES[LLMProvider.ANTHROPIC];
    if (!capabilities.thinking?.supportsThinking) {
      return this.generateUnifiedContent(request, 'thinking-fallback');
    }

    try {
      // For Claude models, thinking happens with budget_tokens
      // The converter will automatically set budget_tokens: 64000
      if (onThinking) {
        onThinking({
          type: 'thinking',
          content: 'Activating extended thinking mode (64k tokens)...',
          isComplete: false,
          metadata: {
            modelType: this.config.model,
            usedThinking: true,
            tokenCount: 64000,
          },
        });
      }

      // Convert to Anthropic format (budget_tokens will be added automatically)
      const anthropicRequest = this.converter.toProviderFormat(request);
      anthropicRequest.model = this.config.model;

      const startTime = Date.now();
      const response = await this.client.messages.create(anthropicRequest);
      const thinkingTime = Date.now() - startTime;

      // Final thinking indicator
      if (onThinking) {
        onThinking({
          type: 'thinking',
          content: 'Extended thinking complete - presenting response...',
          isComplete: true,
          metadata: {
            thinkingTime,
            modelType: this.config.model,
            usedThinking: true,
            tokenCount: 64000,
          },
        });
      }

      return this.converter.fromProviderResponse(response);
    } catch (error: unknown) {
      throw this.handleAnthropicError(error);
    }
  }

  /**
   * Generate streaming content with thinking_delta support
   */
  protected override async *generateContentStreamWithThinking(
    request: UnifiedGenerateRequest,
    onThinking?: (thinkingContent: ThinkingContent) => void,
  ): AsyncGenerator<UnifiedGenerateResponse> {
    const capabilities = PROVIDER_CAPABILITIES[LLMProvider.ANTHROPIC];
    if (!capabilities.thinking?.supportsThinking) {
      yield* this.generateUnifiedContentStream(request, 'thinking-fallback');
      return;
    }

    try {
      // Initial thinking indicator
      if (onThinking) {
        onThinking({
          type: 'thinking',
          content: 'Initializing extended thinking (64k token budget)...',
          isComplete: false,
          metadata: {
            modelType: this.config.model,
            usedThinking: true,
            tokenCount: 64000,
          },
        });
      }

      // Convert to Anthropic format and enable streaming
      const anthropicRequest = this.converter.toProviderFormat(request);
      anthropicRequest.model = this.config.model;
      anthropicRequest.stream = true;

      const startTime = Date.now();
      const stream = await this.client.messages.stream(anthropicRequest);
      
      let isThinking = true;
      let hasStartedResponse = false;

      // Process stream events
      for await (const event of stream) {
        const converter = this.converter as AnthropicFormatConverter;
        const unifiedChunk = converter.convertStreamEvent(event);

        // Handle thinking_delta events (if supported by Anthropic SDK)
        if ((event as any).type === 'thinking_delta') {
          if (onThinking) {
            onThinking({
              type: 'thinking',
              content: (event as any).delta?.content || '',
              isComplete: false,
              metadata: {
                modelType: this.config.model,
                usedThinking: true,
                tokenCount: 64000,
              },
            });
          }
          continue;
        }

        // If this is the first response chunk after thinking, indicate completion
        if (isThinking && (unifiedChunk.content || unifiedChunk.functionCalls) && !hasStartedResponse) {
          isThinking = false;
          hasStartedResponse = true;
          if (onThinking) {
            onThinking({
              type: 'thinking',
              content: 'Thinking complete - streaming response...',
              isComplete: true,
              metadata: {
                thinkingTime: Date.now() - startTime,
                modelType: this.config.model,
                usedThinking: true,
                tokenCount: 64000,
              },
            });
          }
        }

        // Only yield chunks with actual content
        if (
          unifiedChunk.content ||
          unifiedChunk.functionCalls ||
          unifiedChunk.finishReason
        ) {
          yield unifiedChunk;
        }
      }
    } catch (error: unknown) {
      throw this.handleAnthropicError(error);
    }
  }

  /**
   * Check if thinking mode is enabled for this provider
   */
  isThinkingEnabled(): boolean {
    const capabilities = PROVIDER_CAPABILITIES[LLMProvider.ANTHROPIC];
    return capabilities.thinking?.supportsThinking || false;
  }

  /**
   * Get thinking capabilities for this provider
   */
  getThinkingCapabilities() {
    return PROVIDER_CAPABILITIES[LLMProvider.ANTHROPIC].thinking;
  }
}
