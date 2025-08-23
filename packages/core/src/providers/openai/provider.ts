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
import { BaseLLMProvider } from '../base.js';
import { OpenAIFormatConverter } from './converter.js';
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

// OpenAI SDK types (will be imported dynamically)
type OpenAI = any;

/**
 * OpenAI provider implementation
 */
export class OpenAIProvider extends BaseLLMProvider {
  private client?: OpenAI;
  private OpenAI?: any; // OpenAI constructor

  constructor(config: LLMProviderConfig) {
    super(config);
  }

  /**
   * Create format converter for OpenAI
   */
  protected createConverter(): FormatConverter {
    return new OpenAIFormatConverter();
  }

  /**
   * Initialize the OpenAI provider
   */
  async initialize(): Promise<void> {
    console.log(`[OpenAI Provider] Initializing with model: ${this.config.model}`);
    try {
      // Dynamically import OpenAI SDK
      console.log(`[OpenAI Provider] Loading OpenAI SDK...`);
      const openaiModule = await import('openai');
      this.OpenAI = openaiModule.default;

      // Create client instance
      const apiKey = this.getEffectiveApiKey();
      console.log(`[OpenAI Provider] Creating client with API key: ${apiKey ? apiKey.substring(0, 10) + '...' : 'undefined'}`);
      this.client = new this.OpenAI({
        apiKey: apiKey,
        baseURL: this.config.baseUrl,
        timeout: this.config.timeout || 30000,
        maxRetries: this.config.maxRetries || 3,
      });

      // Skip validation for now to avoid timeout
      console.log(`[OpenAI Provider] Skipping connection validation to avoid timeout`);
      // await this.validateConnection();
      console.log(`[OpenAI Provider] Initialization complete`);
    } catch (error: any) {
      if (error.code === 'MODULE_NOT_FOUND') {
        throw new ProviderError(
          'OpenAI SDK not installed. Run: npm install openai',
          LLMProvider.OPENAI,
          error,
        );
      }
      throw this.wrapProviderError(error, 'initialize');
    }
  }

  /**
   * Generate content using OpenAI API
   */
  protected async generateUnifiedContent(
    request: UnifiedGenerateRequest,
    userPromptId: string,
  ): Promise<UnifiedGenerateResponse> {
    if (!this.client) {
      throw new Error('OpenAI provider not initialized');
    }

    // Debug logging for thinking mode
    const enableThinking = this.config.configInstance?.getEnableThinking?.();
    console.log(`[OPENAI DEBUG ${userPromptId}] enableThinking from config: ${enableThinking}`);
    console.log(`[OPENAI DEBUG ${userPromptId}] supportsThinkingMode: ${this.supportsThinkingMode()}`);
    console.log(`[OPENAI DEBUG ${userPromptId}] model: ${this.config.model}`);

    try {
      // Convert to OpenAI format
      const openaiRequest = this.converter.toProviderFormat(request);

      // Set model
      openaiRequest.model = this.config.model;

      // Make the API call
      const response = await this.client.chat.completions.create(openaiRequest);

      // Convert back to unified format
      return this.converter.fromProviderResponse(response);
    } catch (error: any) {
      throw this.handleOpenAIError(error);
    }
  }

  /**
   * Generate streaming content
   */
  protected async *generateUnifiedContentStream(
    request: UnifiedGenerateRequest,
    userPromptId: string,
  ): AsyncGenerator<UnifiedGenerateResponse> {
    if (!this.client) {
      throw new Error('OpenAI provider not initialized');
    }

    try {
      // Convert to OpenAI format
      const openaiRequest = this.converter.toProviderFormat(request);

      // Set model and enable streaming
      openaiRequest.model = this.config.model;
      openaiRequest.stream = true;

      // Make streaming API call
      const stream = await this.client.chat.completions.create(openaiRequest);

      // Process stream chunks
      for await (const chunk of stream) {
        const converter = this.converter as OpenAIFormatConverter;
        const unifiedChunk = converter.convertStreamChunk(chunk);

        // Only yield chunks with actual content
        if (
          unifiedChunk.content ||
          unifiedChunk.functionCalls ||
          unifiedChunk.finishReason
        ) {
          yield unifiedChunk;
        }
      }
    } catch (error: any) {
      throw this.handleOpenAIError(error);
    }
  }

  /**
   * Count tokens using OpenAI's approach
   * Note: OpenAI doesn't have a direct token counting API, so we estimate
   */
  protected async countUnifiedTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    // For OpenAI, we need to estimate token count
    // This is a simplified implementation - in practice, you might want to use
    // a library like 'tiktoken' for accurate token counting

    let totalTokens = 0;

    if (request.contents) {
      const contents = Array.isArray(request.contents) ? request.contents : [request.contents];
      for (const content of contents) {
        if ((content as any).parts) {
          for (const part of (content as any).parts) {
            if ('text' in part && part.text) {
              // Rough estimation: ~4 characters per token for English
              totalTokens += Math.ceil(part.text.length / 4);
            }
          }
        }
      }
    }

    // Add overhead for system messages, tools, etc.
    totalTokens += 50; // Base overhead

    return {
      totalTokens,
    };
  }

  /**
   * Embed content using OpenAI embeddings API
   */
  protected async embedUnifiedContent(
    request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    if (!this.client) {
      throw new Error('OpenAI provider not initialized');
    }

    try {
      let textToEmbed = '';

      // Extract text from contents
      const contents = Array.isArray(request.contents) ? request.contents : [request.contents];
      const textParts = contents
        .flatMap(content => (content as any).parts || [])
        .filter((part) => 'text' in part)
        .map((part) => (part as any).text);
      textToEmbed = textParts.join(' ');

      if (!textToEmbed.trim()) {
        throw new Error('No text content found to embed');
      }

      // Use OpenAI embeddings API
      const response = await this.client.embeddings.create({
        model: this.config.embeddingModel || 'text-embedding-3-small',
        input: textToEmbed,
        encoding_format: 'float',
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No embeddings returned from OpenAI API');
      }

      return {
        embeddings: [{
          values: response.data[0].embedding,
        }],
      };
    } catch (error: any) {
      throw this.handleOpenAIError(error);
    }
  }

  /**
   * Get effective API key from config or environment
   */
  private getEffectiveApiKey(): string {
    const apiKey = this.config.apiKey || process.env['OPENAI_API_KEY'];
    if (!apiKey) {
      throw new ProviderAuthError(LLMProvider.OPENAI);
    }
    return apiKey;
  }


  /**
   * Handle OpenAI-specific errors
   */
  private handleOpenAIError(error: any): Error {
    // Check for specific OpenAI error types
    if (error?.error) {
      const errorType = error.error.type;
      const errorCode = error.error.code;
      const statusCode = error.status;

      // Authentication errors
      if (statusCode === 401 || errorType === 'invalid_api_key') {
        return new ProviderAuthError(LLMProvider.OPENAI, error);
      }

      // Rate limit errors
      if (statusCode === 429 || errorType === 'rate_limit_exceeded') {
        const retryAfter = error.headers?.['retry-after']
          ? parseInt(error.headers['retry-after'], 10)
          : undefined;
        return new ProviderRateLimitError(LLMProvider.OPENAI, retryAfter);
      }

      // Quota errors
      if (
        errorType === 'insufficient_quota' ||
        errorCode === 'quota_exceeded'
      ) {
        return new ProviderQuotaError(LLMProvider.OPENAI, 'API quota');
      }

      // Model errors
      if (errorType === 'model_not_found' || errorCode === 'model_not_found') {
        return new ProviderError(
          `Model ${this.config.model} not found or not accessible`,
          LLMProvider.OPENAI,
          error,
        );
      }

      // Content filter errors
      if (
        errorType === 'content_filter' ||
        errorCode === 'content_policy_violation'
      ) {
        return new ProviderError(
          'Content filtered by OpenAI safety systems',
          LLMProvider.OPENAI,
          error,
        );
      }
    }

    // Network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return new ProviderError(
        'Network error: Unable to connect to OpenAI API',
        LLMProvider.OPENAI,
        error,
      );
    }

    // Timeout errors
    if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      return new ProviderError(
        'Request timed out while calling OpenAI API',
        LLMProvider.OPENAI,
        error,
      );
    }

    // Generic error handling
    return this.wrapProviderError(error, 'OpenAI API call');
  }

  /**
   * Override auth error detection for OpenAI specifics
   */
  protected override isAuthError(error: any): boolean {
    if (super.isAuthError(error)) {
      return true;
    }

    // OpenAI-specific auth error patterns
    return !!(
      error?.error?.type === 'invalid_api_key' ||
      error?.error?.code === 'invalid_api_key' ||
      (error?.status === 401 && error?.error?.message?.includes('api key'))
    );
  }

  /**
   * Override rate limit error detection for OpenAI specifics
   */
  protected override isRateLimitError(error: any): boolean {
    if (super.isRateLimitError(error)) {
      return true;
    }

    // OpenAI-specific rate limit patterns
    return !!(
      error?.error?.type === 'rate_limit_exceeded' ||
      error?.error?.code === 'rate_limit_exceeded' ||
      error?.status === 429
    );
  }

  /**
   * Get list of available models
   */
  async getAvailableModels(): Promise<string[]> {
    if (!this.client) {
      throw new Error('OpenAI provider not initialized');
    }

    try {
      const response = await this.client.models.list();
      return response.data
        .filter((model: any) => model.id.startsWith('gpt-'))
        .map((model: any) => model.id)
        .sort();
    } catch (error: any) {
      console.debug('Failed to list OpenAI models:', error);
      // Return common models as fallback
      return [
        'gpt-5',
        'o3',
        'gpt-5-mini',
        'gpt-5-nano',
      ];
    }
  }

  /**
   * Get model information
   */
  async getModelInfo(): Promise<any> {
    if (!this.client) {
      throw new Error('OpenAI provider not initialized');
    }

    try {
      const response = await this.client.models.retrieve(this.config.model);
      return response;
    } catch (error: any) {
      console.debug(
        `Failed to get info for model ${this.config.model}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Generate content with thinking capabilities (GPT-5 specific)
   */
  protected override async generateContentWithThinking(
    request: UnifiedGenerateRequest,
    onThinking?: (thinkingContent: ThinkingContent) => void,
  ): Promise<UnifiedGenerateResponse> {
    if (!this.client) {
      throw new Error('OpenAI provider not initialized');
    }

    const capabilities = PROVIDER_CAPABILITIES[LLMProvider.OPENAI];
    if (!capabilities.thinking?.supportsThinking) {
      return this.generateUnifiedContent(request, 'thinking-fallback');
    }

    try {
      // For GPT-5, thinking happens internally with reasoning_effort
      // We provide progress indicators since thinking tokens aren't exposed
      if (onThinking) {
        onThinking({
          type: 'thinking',
          content: 'Engaging high-effort reasoning mode...',
          isComplete: false,
          metadata: {
            effortLevel: 'high',
            modelType: 'gpt-5',
            usedThinking: true,
          },
        });
      }

      // Convert to OpenAI format (reasoning_effort will be added automatically)
      const openaiRequest = this.converter.toProviderFormat(request);
      openaiRequest.model = this.config.model;

      // Simulate thinking progress for GPT-5
      if (onThinking) {
        setTimeout(() => {
          onThinking({
            type: 'thinking',
            content: 'Processing complex reasoning patterns...',
            isComplete: false,
            metadata: {
              effortLevel: 'high',
              modelType: 'gpt-5',
              usedThinking: true,
            },
          });
        }, 500);
      }

      const startTime = Date.now();
      const response = await this.client.chat.completions.create(openaiRequest);
      const thinkingTime = Date.now() - startTime;

      // Final thinking indicator
      if (onThinking) {
        onThinking({
          type: 'thinking',
          content: 'Reasoning complete - generating response...',
          isComplete: true,
          metadata: {
            thinkingTime,
            effortLevel: 'high',
            modelType: 'gpt-5',
            usedThinking: true,
          },
        });
      }

      return this.converter.fromProviderResponse(response);
    } catch (error: any) {
      throw this.handleOpenAIError(error);
    }
  }

  /**
   * Generate streaming content with thinking progress indicators
   */
  protected override async *generateContentStreamWithThinking(
    request: UnifiedGenerateRequest,
    onThinking?: (thinkingContent: ThinkingContent) => void,
  ): AsyncGenerator<UnifiedGenerateResponse> {
    if (!this.client) {
      throw new Error('OpenAI provider not initialized');
    }

    const capabilities = PROVIDER_CAPABILITIES[LLMProvider.OPENAI];
    if (!capabilities.thinking?.supportsThinking) {
      yield* this.generateUnifiedContentStream(request, 'thinking-fallback');
      return;
    }

    try {
      // Initial thinking indicator
      if (onThinking) {
        onThinking({
          type: 'thinking',
          content: 'Initializing high-effort reasoning...',
          isComplete: false,
          metadata: {
            effortLevel: 'high',
            modelType: 'gpt-5',
            usedThinking: true,
          },
        });
      }

      // Convert to OpenAI format and enable streaming
      const openaiRequest = this.converter.toProviderFormat(request);
      openaiRequest.model = this.config.model;
      openaiRequest.stream = true;

      const startTime = Date.now();
      const stream = await this.client.chat.completions.create(openaiRequest);

      // Progress tracking
      let hasStartedResponse = false;
      
      for await (const chunk of stream) {
        const converter = this.converter as OpenAIFormatConverter;
        const unifiedChunk = converter.convertStreamChunk(chunk);

        // If this is the first response chunk, indicate thinking is complete
        if (!hasStartedResponse && (unifiedChunk.content || unifiedChunk.functionCalls)) {
          hasStartedResponse = true;
          if (onThinking) {
            onThinking({
              type: 'thinking',
              content: 'Reasoning complete - streaming response...',
              isComplete: true,
              metadata: {
                thinkingTime: Date.now() - startTime,
                effortLevel: 'high',
                modelType: 'gpt-5',
                usedThinking: true,
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
    } catch (error: any) {
      throw this.handleOpenAIError(error);
    }
  }

  /**
   * Check if thinking mode is enabled for this provider
   */
  isThinkingEnabled(): boolean {
    const capabilities = PROVIDER_CAPABILITIES[LLMProvider.OPENAI];
    return capabilities.thinking?.supportsThinking || false;
  }

  /**
   * Get thinking capabilities for this provider
   */
  getThinkingCapabilities() {
    return PROVIDER_CAPABILITIES[LLMProvider.OPENAI].thinking;
  }

  /**
   * Check if provider supports thinking mode
   */
  protected override supportsThinkingMode(): boolean {
    const capabilities = PROVIDER_CAPABILITIES[LLMProvider.OPENAI];
    return capabilities.thinking?.supportsThinking || false;
  }

  /**
   * Override health check with OpenAI-specific implementation
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
              content: 'Hello',
            },
          ],
        },
        'health-check',
      );
      return true;
    } catch (error) {
      console.debug('OpenAI health check failed:', error);
      return false;
    }
  }
}
