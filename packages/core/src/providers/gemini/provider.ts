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
  GoogleGenAI,
} from '@google/genai';
import { BaseLLMProvider } from '../base.js';
import { GeminiFormatConverter } from './converter.js';
import {
  LLMProviderConfig,
  UnifiedGenerateRequest,
  UnifiedGenerateResponse,
  FormatConverter,
  ThinkingContent,
} from '../types.js';
import { ContentGenerator, AuthType } from '../../core/contentGenerator.js';
import { createCodeAssistContentGenerator } from '../../code_assist/codeAssist.js';
import { LoggingContentGenerator } from '../../core/loggingContentGenerator.js';
import { InstallationManager } from '../../utils/installationManager.js';

/**
 * Gemini provider implementation that wraps existing Gemini functionality
 * Maintains backward compatibility while fitting into the new provider architecture
 */
export class GeminiProvider extends BaseLLMProvider {
  private actualGenerator?: ContentGenerator;
  private useCodeAssist: boolean = false;

  constructor(config: LLMProviderConfig) {
    super(config);

    // Determine if we should use Code Assist or direct API
    const authType = this.determineAuthType();
    this.useCodeAssist =
      authType === AuthType.LOGIN_WITH_GOOGLE ||
      authType === AuthType.CLOUD_SHELL;
  }

  /**
   * Create format converter for Gemini
   */
  protected createConverter(): FormatConverter {
    return new GeminiFormatConverter();
  }

  /**
   * Initialize the Gemini provider
   */
  async initialize(): Promise<void> {
    try {
      const authType = this.determineAuthType();

      if (this.useCodeAssist) {
        // Use Code Assist (OAuth flow)
        const httpOptions = {
          headers: this.createUserAgentHeaders(),
        };

        this.actualGenerator = new LoggingContentGenerator(
          await createCodeAssistContentGenerator(
            httpOptions,
            authType,
            this.config.configInstance,
            undefined, // sessionId
          ),
          this.config.configInstance,
        );
      } else {
        // Use direct API key
        const httpOptions = {
          headers: this.createUserAgentHeaders(),
        };

        if (this.config.configInstance?.getUsageStatisticsEnabled()) {
          const installationManager = new InstallationManager();
          const installationId = installationManager.getInstallationId();
          httpOptions.headers = {
            ...httpOptions.headers,
            'x-gemini-api-privileged-user-id': `${installationId}`,
          };
        }

        const googleGenAI = new GoogleGenAI({
          apiKey: this.getEffectiveApiKey(),
          vertexai: this.shouldUseVertexAI(),
          httpOptions,
        });

        this.actualGenerator = new LoggingContentGenerator(
          googleGenAI.models,
          this.config.configInstance,
        );
      }

      // Set user tier if available
      if (this.actualGenerator.userTier) {
        this.userTier = this.actualGenerator.userTier;
      }
    } catch (error) {
      throw this.wrapProviderError(error, 'initialize');
    }
  }

  /**
   * Generate content using the actual Gemini generator
   */
  protected async generateUnifiedContent(
    request: UnifiedGenerateRequest,
    userPromptId: string,
  ): Promise<UnifiedGenerateResponse> {
    if (!this.actualGenerator) {
      throw new Error('Gemini provider not initialized');
    }

    // Add thinking configuration if enabled
    if (this.config.configInstance?.getEnableThinking?.() && this.supportsThinkingMode()) {
      request.thinkingConfig = {
        thinkingBudget: -1, // Dynamic thinking
        includeThoughts: true,
      };
      console.log(`[GEMINI THINKING] Enabled with dynamic budget for prompt: ${userPromptId}`);
    }

    // Convert unified request back to Gemini format
    const geminiRequest = this.converter.toProviderFormat(request);

    // Call the actual Gemini generator
    const geminiResponse = await this.actualGenerator.generateContent(
      geminiRequest,
      userPromptId,
    );

    // Convert response to unified format
    return this.converter.fromProviderResponse(geminiResponse);
  }

  /**
   * Generate streaming content
   */
  protected async *generateUnifiedContentStream(
    request: UnifiedGenerateRequest,
    userPromptId: string,
  ): AsyncGenerator<UnifiedGenerateResponse> {
    if (!this.actualGenerator) {
      throw new Error('Gemini provider not initialized');
    }

    // Add thinking configuration if enabled
    if (this.config.configInstance?.getEnableThinking?.() && this.supportsThinkingMode()) {
      request.thinkingConfig = {
        thinkingBudget: -1, // Dynamic thinking
        includeThoughts: true,
      };
      console.log(`[GEMINI THINKING STREAM] Enabled with dynamic budget for prompt: ${userPromptId}`);
    }

    // Convert unified request back to Gemini format
    const geminiRequest = this.converter.toProviderFormat(request);

    // Get streaming generator from actual Gemini generator
    const streamGenerator = await this.actualGenerator.generateContentStream(
      geminiRequest,
      userPromptId,
    );

    // Yield each response after conversion
    for await (const geminiResponse of streamGenerator) {
      // Check if response contains thinking/thought parts
      if (geminiResponse.candidates?.[0]?.content?.parts) {
        for (const part of geminiResponse.candidates[0].content.parts) {
          // Check for thought parts (Gemini's thinking format)
          if ((part as any).thought) {
            // Emit thinking event through the callback
            const thinkingCallback = this.createThinkingCallback?.(userPromptId);
            if (thinkingCallback) {
              thinkingCallback({
                type: 'thinking',
                content: (part as any).text || 'Thinking...',
                isComplete: false,
                metadata: {
                  modelType: 'gemini-2.5',
                  usedThinking: true,
                }
              });
            }
          }
        }
      }
      
      yield this.converter.fromProviderResponse(geminiResponse);
    }
  }

  /**
   * Count tokens using actual Gemini generator
   */
  protected async countUnifiedTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    if (!this.actualGenerator) {
      throw new Error('Gemini provider not initialized');
    }

    return await this.actualGenerator.countTokens(request);
  }

  /**
   * Embed content using actual Gemini generator
   */
  protected async embedUnifiedContent(
    request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    if (!this.actualGenerator) {
      throw new Error('Gemini provider not initialized');
    }

    return await this.actualGenerator.embedContent(request);
  }

  /**
   * Determine authentication type based on configuration and environment
   */
  private determineAuthType(): AuthType {
    // Check for explicit auth type in provider config first (highest priority)
    if (this.config.authType) {
      return this.config.authType;
    }

    // Check for explicit auth type in config instance
    if (this.config.configInstance?.getAuthType) {
      const configAuthType = this.config.configInstance.getAuthType();
      if (configAuthType) {
        return configAuthType;
      }
    }

    // Check for Cloud Shell environment
    if (
      process.env['CLOUD_SHELL'] === 'true' ||
      process.env['GOOGLE_CLOUD_SHELL'] === 'true'
    ) {
      return AuthType.CLOUD_SHELL;
    }

    // Check for API keys
    if (this.getEffectiveApiKey()) {
      return this.shouldUseVertexAI()
        ? AuthType.USE_VERTEX_AI
        : AuthType.USE_GEMINI;
    }

    // Default to OAuth for interactive use
    return AuthType.LOGIN_WITH_GOOGLE;
  }

  /**
   * Get effective API key from various sources
   */
  private getEffectiveApiKey(): string | undefined {
    return (
      this.config.apiKey ||
      process.env['GEMINI_API_KEY'] ||
      process.env['GOOGLE_API_KEY'] ||
      undefined
    );
  }

  /**
   * Determine if we should use Vertex AI
   */
  private shouldUseVertexAI(): boolean {
    const hasVertexConfig = !!(
      process.env['GOOGLE_CLOUD_PROJECT'] && process.env['GOOGLE_CLOUD_LOCATION']
    );

    const hasGoogleApiKey = !!process.env['GOOGLE_API_KEY'];

    // Use Vertex AI if we have the config or Google API key
    return hasVertexConfig || hasGoogleApiKey;
  }

  /**
   * Create user agent headers for requests
   */
  private createUserAgentHeaders(): Record<string, string> {
    const version = process.env['CLI_VERSION'] || process.version;
    const userAgent = `GeminiCLI/${version} (${process.platform}; ${process.arch})`;

    return {
      'User-Agent': userAgent,
    };
  }

  /**
   * Override health check to use actual generator
   */
  override async healthCheck(): Promise<boolean> {
    try {
      if (!this.actualGenerator) {
        await this.initialize();
      }

      if (!this.actualGenerator) {
        return false;
      }

      // Simple test request
      await this.actualGenerator.generateContent(
        {
          model: 'gemini-1.5-pro',
          contents: [
            {
              role: 'user',
              parts: [{ text: 'Hello' }],
            },
          ],
        } as any,
        'health-check',
      );
      return true;
    } catch (error) {
      console.debug('Gemini health check failed:', error);
      return false;
    }
  }

  /**
   * Get the underlying generator for backward compatibility
   */
  getUnderlyingGenerator(): ContentGenerator | undefined {
    return this.actualGenerator;
  }

  /**
   * Override requiresApiKey for Gemini-specific logic
   */
  protected override requiresApiKey(): boolean {
    // Gemini can work without API key if using OAuth
    const authType = this.determineAuthType();
    return (
      authType !== AuthType.LOGIN_WITH_GOOGLE &&
      authType !== AuthType.CLOUD_SHELL
    );
  }

  /**
   * Get model name with fallback to config
   */
  getModelName(): string {
    return this.config.model || 'gemini-1.5-pro';
  }

  /**
   * Check if provider supports specific capability
   */
  supportsCapability(capability: string): boolean {
    const capabilities = this.getCapabilities();

    switch (capability) {
      case 'streaming':
        return capabilities.supportsStreaming;
      case 'tools':
        return capabilities.supportsTools;
      case 'vision':
        return capabilities.supportsVision;
      case 'embedding':
        return capabilities.supportsEmbedding;
      default:
        return false;
    }
  }

  /**
   * Override thinking methods for Gemini-specific implementation
   */
  protected override async generateContentWithThinking(
    request: UnifiedGenerateRequest,
    onThinking?: (thinkingContent: ThinkingContent) => void,
  ): Promise<UnifiedGenerateResponse> {
    // Add thinking configuration
    request.thinkingConfig = {
      thinkingBudget: -1, // Dynamic thinking
      includeThoughts: true,
    };
    
    // Log thinking activation
    if (onThinking) {
      onThinking({
        type: 'thinking',
        content: 'Activating Gemini 2.5 thinking mode...',
        isComplete: false,
        metadata: {
          modelType: 'gemini-2.5',
          usedThinking: true,
        }
      });
    }
    
    return this.generateUnifiedContent(request, 'thinking-mode');
  }

  protected override async *generateContentStreamWithThinking(
    request: UnifiedGenerateRequest,
    onThinking?: (thinkingContent: ThinkingContent) => void,
  ): AsyncGenerator<UnifiedGenerateResponse> {
    // Add thinking configuration
    request.thinkingConfig = {
      thinkingBudget: -1, // Dynamic thinking
      includeThoughts: true,
    };
    
    // Store the callback for use in stream processing
    if (onThinking) {
      // Store callback temporarily for stream processing
      (this as any)._thinkingCallback = onThinking;
      
      // Initial thinking notification
      onThinking({
        type: 'thinking',
        content: 'Initializing Gemini 2.5 thinking stream...',
        isComplete: false,
        metadata: {
          modelType: 'gemini-2.5',
          usedThinking: true,
        }
      });
    }
    
    yield* this.generateUnifiedContentStream(request, 'thinking-stream');
  }
}
