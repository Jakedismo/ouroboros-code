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
} from '@google/genai';
import { ContentGenerator } from '../core/contentGenerator.js';
import { UserTierId } from '../code_assist/types.js';
import {
  LLMProviderConfig,
  LLMProvider,
  UnifiedGenerateRequest,
  UnifiedGenerateResponse,
  FormatConverter,
  ProviderError,
  ProviderAuthError,
  ProviderRateLimitError,
  ThinkingContent,
  PROVIDER_CAPABILITIES,
} from './types.js';

/**
 * Abstract base class for all LLM providers
 * Implements the ContentGenerator interface and provides common functionality
 */
export abstract class BaseLLMProvider implements ContentGenerator {
  protected config: LLMProviderConfig;
  protected converter: FormatConverter;
  userTier?: UserTierId;
  private thinkingEventQueue: ThinkingContent[] = [];

  constructor(config: LLMProviderConfig) {
    this.config = config;
    this.converter = this.createConverter();
    this.validateConfig();
  }

  /**
   * Each provider must implement its own format converter
   */
  protected abstract createConverter(): FormatConverter;

  /**
   * Provider-specific initialization (connect to API, validate credentials, etc.)
   */
  abstract initialize(): Promise<void>;

  /**
   * Main content generation method - calls provider-specific implementation
   */
  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    try {
      // Convert to unified format
      const unifiedRequest = this.converter.fromGeminiFormat(request);

      // Check if thinking mode is enabled and supported by this provider
      const enableThinking = this.config.configInstance?.getEnableThinking?.();
      const supportsThinking = this.supportsThinkingMode();
      
      if (enableThinking && supportsThinking && this.generateContentWithThinking) {
        // Use thinking-enabled generation
        const unifiedResponse = await this.generateContentWithThinking(
          unifiedRequest,
          this.createThinkingCallback(userPromptId),
        );
        return this.converter.toGeminiFormat(unifiedResponse);
      } else {
        // Call standard provider-specific implementation
        const unifiedResponse = await this.generateUnifiedContent(
          unifiedRequest,
          userPromptId,
        );
        return this.converter.toGeminiFormat(unifiedResponse);
      }
    } catch (error) {
      throw this.wrapProviderError(error, 'generateContent');
    }
  }

  /**
   * Streaming content generation
   */
  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    try {
      const unifiedRequest = this.converter.fromGeminiFormat(request);
      unifiedRequest.stream = true;

      // Check if thinking mode is enabled and supported by this provider
      const enableThinking = this.config.configInstance?.getEnableThinking?.();
      const supportsThinking = this.supportsThinkingMode();
      
      if (enableThinking && supportsThinking && this.generateContentStreamWithThinking) {
        // Use thinking-enabled streaming generation
        const unifiedStream = this.generateContentStreamWithThinking(
          unifiedRequest,
          this.createThinkingCallback(userPromptId),
        );
        return this.convertStreamToGemini(unifiedStream);
      } else {
        // Call standard streaming implementation
        const unifiedStream = this.generateUnifiedContentStream(
          unifiedRequest,
          userPromptId,
        );
        return this.convertStreamToGemini(unifiedStream);
      }
    } catch (error) {
      throw this.wrapProviderError(error, 'generateContentStream');
    }
  }

  /**
   * Token counting - may need provider-specific implementation
   */
  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    try {
      return await this.countUnifiedTokens(request);
    } catch (error) {
      throw this.wrapProviderError(error, 'countTokens');
    }
  }

  /**
   * Content embedding - may not be supported by all providers
   */
  async embedContent(
    request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    const capabilities = PROVIDER_CAPABILITIES[this.config.provider];
    if (!capabilities.supportsEmbedding) {
      throw new ProviderError(
        `Provider ${this.config.provider} does not support embeddings`,
        this.config.provider,
      );
    }

    try {
      return await this.embedUnifiedContent(request);
    } catch (error) {
      throw this.wrapProviderError(error, 'embedContent');
    }
  }

  /**
   * Provider-specific methods that subclasses must implement
   */
  protected abstract generateUnifiedContent(
    request: UnifiedGenerateRequest,
    userPromptId: string,
  ): Promise<UnifiedGenerateResponse>;

  protected abstract generateUnifiedContentStream(
    request: UnifiedGenerateRequest,
    userPromptId: string,
  ): AsyncGenerator<UnifiedGenerateResponse>;

  protected abstract countUnifiedTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse>;

  protected abstract embedUnifiedContent(
    request: EmbedContentParameters,
  ): Promise<EmbedContentResponse>;

  /**
   * Thinking mode support methods - providers can override these
   */
  protected supportsThinkingMode(): boolean {
    const capabilities = PROVIDER_CAPABILITIES[this.config.provider];
    return capabilities.thinking?.supportsThinking || false;
  }

  protected createThinkingCallback(userPromptId: string): ((thinkingContent: ThinkingContent) => void) | undefined {
    return (thinkingContent: ThinkingContent) => {
      // Enhanced thinking event with provider and prompt context
      const enhancedEvent: ThinkingContent = {
        ...thinkingContent,
        metadata: thinkingContent.metadata,
      };
      
      // Queue the thinking event for emission in the stream
      this.thinkingEventQueue.push(enhancedEvent);
      
      // Also log for debugging (only if debug mode is enabled)
      const debugMode = this.config.configInstance?.getDebugMode?.() || false;
      if (debugMode) {
        console.log(`[THINKING ${userPromptId}] ${thinkingContent.type}: ${thinkingContent.content} (complete: ${thinkingContent.isComplete})`);
        if (thinkingContent.metadata) {
          console.log(`[THINKING ${userPromptId}] Metadata:`, thinkingContent.metadata);
        }
      }
    };
  }

  // Optional thinking methods that providers can override
  protected async generateContentWithThinking?(
    request: UnifiedGenerateRequest,
    onThinking?: (thinkingContent: ThinkingContent) => void,
  ): Promise<UnifiedGenerateResponse> {
    // Default implementation falls back to non-thinking mode
    return this.generateUnifiedContent(request, 'thinking-fallback');
  }

  protected async *generateContentStreamWithThinking?(
    request: UnifiedGenerateRequest,
    onThinking?: (thinkingContent: ThinkingContent) => void,
  ): AsyncGenerator<UnifiedGenerateResponse> {
    // Default implementation falls back to non-thinking mode
    yield* this.generateUnifiedContentStream(request, 'thinking-fallback');
  }

  /**
   * Helper method to convert unified stream back to Gemini format with thinking event interleaving
   */
  private async *convertStreamToGemini(
    unifiedStream: AsyncGenerator<UnifiedGenerateResponse>,
  ): AsyncGenerator<GenerateContentResponse> {
    for await (const unifiedResponse of unifiedStream) {
      // First, emit any queued thinking events before the content
      while (this.thinkingEventQueue.length > 0) {
        const thinkingEvent = this.thinkingEventQueue.shift()!;
        
        // Convert thinking event to a special GenerateContentResponse for the stream
        const thinkingResponse: GenerateContentResponse = {
          candidates: [{
            content: {
              role: 'model',
              parts: [{
                text: '', // No regular content
                functionCall: undefined,
                functionResponse: undefined,
                executableCode: undefined,
                codeExecutionResult: undefined,
                thought: undefined, // This is for Gemini's thought format
              }]
            },
            finishReason: undefined,
            citationMetadata: undefined,
            safetyRatings: undefined,
            tokenCount: undefined,
            logprobs: undefined,
            avgLogprobs: undefined
          }],
          promptFeedback: undefined,
          usageMetadata: undefined,
          // Add thinking event as custom property for Turn class detection
          thinkingContent: thinkingEvent
        } as any; // Use 'as any' to allow custom thinkingContent property
        
        yield thinkingResponse;
      }
      
      // Then yield the regular content response
      yield this.converter.toGeminiFormat(unifiedResponse);
    }
    
    // After the stream ends, emit any remaining thinking events
    while (this.thinkingEventQueue.length > 0) {
      const thinkingEvent = this.thinkingEventQueue.shift()!;
      
      const thinkingResponse: GenerateContentResponse = {
        candidates: [{
          content: {
            role: 'model',
            parts: [{
              text: '',
              functionCall: undefined,
              functionResponse: undefined,
              executableCode: undefined,
              codeExecutionResult: undefined,
              thought: undefined,
            }]
          },
          finishReason: undefined,
          citationMetadata: undefined,
          safetyRatings: undefined,
          tokenCount: undefined,
          logprobs: undefined,
          avgLogprobs: undefined
        }],
        promptFeedback: undefined,
        usageMetadata: undefined,
        thinkingContent: thinkingEvent
      } as any; // Use 'as any' to allow custom thinkingContent property
      
      yield thinkingResponse;
    }
  }

  /**
   * Validate provider configuration
   */
  protected validateConfig(): void {
    if (!this.config.model) {
      throw new Error(`Model is required for provider ${this.config.provider}`);
    }

    if (!this.config.apiKey && this.requiresApiKey()) {
      throw new ProviderAuthError(this.config.provider);
    }

    // Validate model capabilities
    const capabilities = PROVIDER_CAPABILITIES[this.config.provider];
    if (!capabilities) {
      throw new Error(`Unsupported provider: ${this.config.provider}`);
    }
  }

  /**
   * Check if provider requires an API key
   */
  protected requiresApiKey(): boolean {
    // Gemini may use OAuth, others typically require API keys
    return this.config.provider !== LLMProvider.GEMINI;
  }

  /**
   * Wrap provider-specific errors with context
   */
  protected wrapProviderError(error: any, operation: string): Error {
    if (error instanceof ProviderError) {
      return error;
    }

    // Check for common error patterns
    if (this.isAuthError(error)) {
      return new ProviderAuthError(this.config.provider, error);
    }

    if (this.isRateLimitError(error)) {
      const retryAfter = this.extractRetryAfter(error);
      return new ProviderRateLimitError(this.config.provider, retryAfter);
    }

    // Generic provider error
    return new ProviderError(
      `${operation} failed for provider ${this.config.provider}: ${error.message}`,
      this.config.provider,
      error,
    );
  }

  /**
   * Check if error is authentication-related
   */
  protected isAuthError(error: any): boolean {
    const message = error.message?.toLowerCase() || '';
    const statusCode = error.status || error.statusCode;

    return (
      statusCode === 401 ||
      statusCode === 403 ||
      message.includes('unauthorized') ||
      message.includes('authentication') ||
      message.includes('api key') ||
      message.includes('invalid key')
    );
  }

  /**
   * Check if error is rate limit-related
   */
  protected isRateLimitError(error: any): boolean {
    const message = error.message?.toLowerCase() || '';
    const statusCode = error.status || error.statusCode;

    return (
      statusCode === 429 ||
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('quota exceeded')
    );
  }

  /**
   * Extract retry-after value from rate limit error
   */
  protected extractRetryAfter(error: any): number | undefined {
    if (error.headers && error.headers['retry-after']) {
      return parseInt(error.headers['retry-after'], 10);
    }

    if (
      error.response &&
      error.response.headers &&
      error.response.headers['retry-after']
    ) {
      return parseInt(error.response.headers['retry-after'], 10);
    }

    return undefined;
  }

  /**
   * Get provider capabilities
   */
  getCapabilities() {
    return PROVIDER_CAPABILITIES[this.config.provider];
  }

  /**
   * Get provider configuration
   */
  getConfig(): LLMProviderConfig {
    return { ...this.config };
  }

  /**
   * Update provider configuration
   */
  updateConfig(updates: Partial<LLMProviderConfig>): void {
    this.config = { ...this.config, ...updates };
    this.validateConfig();
  }

  /**
   * Health check for the provider
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Simple test request to verify provider is working
      await this.generateContent(
        {
          model: this.config.model,
          contents: [
            {
              role: 'user',
              parts: [{ text: 'Hello' }],
            },
          ],
        },
        'health-check',
      );
      return true;
    } catch (error) {
      console.debug(
        `Health check failed for provider ${this.config.provider}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Get provider display name
   */
  getDisplayName(): string {
    switch (this.config.provider) {
      case LLMProvider.GEMINI:
        return 'Google Gemini';
      case LLMProvider.OPENAI:
        return 'OpenAI';
      case LLMProvider.ANTHROPIC:
        return 'Anthropic Claude';
      default:
        return this.config.provider;
    }
  }
}
