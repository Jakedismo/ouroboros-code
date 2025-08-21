/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Supported LLM providers for multi-provider architecture
 */
export var LLMProvider;
(function (LLMProvider) {
    LLMProvider["GEMINI"] = "gemini";
    LLMProvider["OPENAI"] = "openai";
    LLMProvider["ANTHROPIC"] = "anthropic";
})(LLMProvider || (LLMProvider = {}));
/**
 * Provider-specific error types
 */
export class ProviderError extends Error {
    provider;
    originalError;
    constructor(message, provider, originalError) {
        super(message);
        this.provider = provider;
        this.originalError = originalError;
        this.name = 'ProviderError';
    }
}
export class ProviderAuthError extends ProviderError {
    constructor(provider, originalError) {
        super(`Authentication failed for provider ${provider}`, provider, originalError);
        this.name = 'ProviderAuthError';
    }
}
export class ProviderRateLimitError extends ProviderError {
    constructor(provider, retryAfter) {
        super(`Rate limit exceeded for provider ${provider}`, provider);
        this.name = 'ProviderRateLimitError';
        this.retryAfter = retryAfter;
    }
    retryAfter;
}
export class ProviderQuotaError extends ProviderError {
    constructor(provider, quotaType) {
        super(`Quota exceeded for provider ${provider}: ${quotaType}`, provider);
        this.name = 'ProviderQuotaError';
    }
}
/**
 * Default model mappings for each provider
 */
export const DEFAULT_MODELS = {
    [LLMProvider.GEMINI]: 'gemini-2.5-pro',
    [LLMProvider.OPENAI]: 'gpt-5',
    [LLMProvider.ANTHROPIC]: 'claude-opus-4-1-20250805',
};
export const PROVIDER_CAPABILITIES = {
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
    },
};
//# sourceMappingURL=types.js.map