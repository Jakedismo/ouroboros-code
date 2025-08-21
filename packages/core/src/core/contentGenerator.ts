/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
} from '@google/genai';
import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';
import { Config } from '../config/config.js';
import { LLMProviderFactory } from '../providers/factory.js';
import { LLMProvider, LLMProviderConfig } from '../providers/types.js';

import { UserTierId } from '../code_assist/types.js';
import { LoggingContentGenerator } from './loggingContentGenerator.js';

/**
 * Interface abstracting the core functionalities for generating content and counting tokens.
 */
export interface ContentGenerator {
  generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;

  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;

  userTier?: UserTierId;
}

export enum AuthType {
  LOGIN_WITH_GOOGLE = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
  CLOUD_SHELL = 'cloud-shell',
}

export type ContentGeneratorConfig = {
  model: string;
  apiKey?: string;
  vertexai?: boolean;
  authType?: AuthType | undefined;
  proxy?: string | undefined;
  // Multi-LLM provider configuration
  provider?: 'gemini' | 'openai' | 'anthropic';
  openaiApiKey?: string;
  anthropicApiKey?: string;
};

export function createContentGeneratorConfig(
  config: Config,
  authType: AuthType | undefined,
): ContentGeneratorConfig {
  const geminiApiKey = process.env['GEMINI_API_KEY'] || undefined;
  const googleApiKey = process.env['GOOGLE_API_KEY'] || undefined;
  const googleCloudProject = process.env['GOOGLE_CLOUD_PROJECT'] || undefined;
  const googleCloudLocation = process.env['GOOGLE_CLOUD_LOCATION'] || undefined;

  // Use runtime model from config if available; otherwise, fall back to parameter or default
  const effectiveModel = config.getModel() || DEFAULT_GEMINI_MODEL;

  const contentGeneratorConfig: ContentGeneratorConfig = {
    model: effectiveModel,
    authType,
    proxy: config?.getProxy(),
    // Multi-LLM provider configuration
    provider: config?.getProvider(),
    openaiApiKey: config?.getOpenaiApiKey(),
    anthropicApiKey: config?.getAnthropicApiKey(),
  };

  // If we are using Google auth or we are in Cloud Shell, there is nothing else to validate for now
  if (
    authType === AuthType.LOGIN_WITH_GOOGLE ||
    authType === AuthType.CLOUD_SHELL
  ) {
    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_GEMINI && geminiApiKey) {
    contentGeneratorConfig.apiKey = geminiApiKey;
    contentGeneratorConfig.vertexai = false;

    return contentGeneratorConfig;
  }

  if (
    authType === AuthType.USE_VERTEX_AI &&
    (googleApiKey || (googleCloudProject && googleCloudLocation))
  ) {
    contentGeneratorConfig.apiKey = googleApiKey;
    contentGeneratorConfig.vertexai = true;

    return contentGeneratorConfig;
  }

  return contentGeneratorConfig;
}

export async function createContentGenerator(
  config: ContentGeneratorConfig,
  gcConfig: Config,
  sessionId?: string,
): Promise<ContentGenerator> {
  const version = process.env['CLI_VERSION'] || process.version;
  const userAgent = `GeminiCLI/${version} (${process.platform}; ${process.arch})`;
  const baseHeaders: Record<string, string> = {
    'User-Agent': userAgent,
  };

  // Handle traditional Gemini auth methods (cloud-based authentication)
  if (
    config.authType === AuthType.LOGIN_WITH_GOOGLE ||
    config.authType === AuthType.CLOUD_SHELL
  ) {
    const httpOptions = { headers: baseHeaders };
    return new LoggingContentGenerator(
      await createCodeAssistContentGenerator(
        httpOptions,
        config.authType,
        gcConfig,
        sessionId,
      ),
      gcConfig,
    );
  }

  // Handle multi-provider configuration (API key-based authentication)
  if (
    config.authType === AuthType.USE_GEMINI ||
    config.authType === AuthType.USE_VERTEX_AI ||
    config.provider // Support multi-provider configuration
  ) {
    // Determine the provider to use
    const effectiveProvider = config.provider || 'gemini';

    // Create provider configuration with MCP support
    const providerConfig: LLMProviderConfig = {
      provider: effectiveProvider as LLMProvider,
      model: config.model,
      timeout: 60000,
      maxRetries: 3,
      enableBuiltinTools: true, // Enable builtin tools integration
      enableMCP: gcConfig.getMultiProviderMCPConfig().mcpServers && 
                Object.keys(gcConfig.getMultiProviderMCPConfig().mcpServers).length > 0, // Enable MCP if servers are configured
      mcpConfig: gcConfig.getMultiProviderMCPConfig(), // Pass MCP configuration
      configInstance: gcConfig, // Pass config instance for tool integration
    };

    // Set API key based on provider
    switch (effectiveProvider) {
      case 'gemini':
        providerConfig.apiKey =
          config.apiKey === '' ? undefined : config.apiKey;
        if (config.vertexai) {
          providerConfig.baseUrl = process.env['GOOGLE_CLOUD_LOCATION'] 
            ? `https://${process.env['GOOGLE_CLOUD_LOCATION']}-aiplatform.googleapis.com`
            : undefined;
        }
        break;
      case 'openai':
        providerConfig.apiKey = config.openaiApiKey;
        break;
      case 'anthropic':
        providerConfig.apiKey = config.anthropicApiKey;
        break;
      default:
        throw new Error(`Unsupported provider: ${effectiveProvider}`);
    }

    // Always use the provider factory for consistency
    // This ensures all providers go through their proper implementations
    // rather than bypassing to direct GoogleGenAI

    try {
      // Use the new provider factory for multi-provider support
      const provider = await LLMProviderFactory.create(providerConfig);
      return new LoggingContentGenerator(provider, gcConfig);
    } catch (error) {
      // Fallback to Gemini if other providers fail and no explicit provider was requested
      if (!config.provider && effectiveProvider !== 'gemini') {
        console.warn(
          `Failed to create ${effectiveProvider} provider, falling back to Gemini:`,
          error,
        );

        const geminiConfig: LLMProviderConfig = {
          provider: LLMProvider.GEMINI,
          model: config.model,
          apiKey: config.apiKey === '' ? undefined : config.apiKey,
          timeout: 60000,
          maxRetries: 3,
          enableBuiltinTools: true, // Enable builtin tools integration
          enableMCP: gcConfig.getMultiProviderMCPConfig().mcpServers && 
                    Object.keys(gcConfig.getMultiProviderMCPConfig().mcpServers).length > 0, // Enable MCP if servers are configured
          mcpConfig: gcConfig.getMultiProviderMCPConfig(), // Pass MCP configuration
          configInstance: gcConfig, // Pass config instance for tool integration
        };

        const geminiProvider = await LLMProviderFactory.create(geminiConfig);
        return new LoggingContentGenerator(geminiProvider, gcConfig);
      }
      throw error;
    }
  }

  throw new Error(
    `Error creating contentGenerator: Unsupported authType: ${config.authType}`,
  );
}
