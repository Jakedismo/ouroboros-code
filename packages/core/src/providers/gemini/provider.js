/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, } from '@google/genai';
import { BaseLLMProvider } from '../base.js';
import { GeminiFormatConverter } from './converter.js';
import { AuthType } from '../../core/contentGenerator.js';
import { createCodeAssistContentGenerator } from '../../code_assist/codeAssist.js';
import { LoggingContentGenerator } from '../../core/loggingContentGenerator.js';
import { InstallationManager } from '../../utils/installationManager.js';
/**
 * Gemini provider implementation that wraps existing Gemini functionality
 * Maintains backward compatibility while fitting into the new provider architecture
 */
export class GeminiProvider extends BaseLLMProvider {
    actualGenerator;
    useCodeAssist = false;
    constructor(config) {
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
    createConverter() {
        return new GeminiFormatConverter();
    }
    /**
     * Initialize the Gemini provider
     */
    async initialize() {
        try {
            const authType = this.determineAuthType();
            if (this.useCodeAssist) {
                // Use Code Assist (OAuth flow)
                const httpOptions = {
                    headers: this.createUserAgentHeaders(),
                };
                this.actualGenerator = new LoggingContentGenerator(await createCodeAssistContentGenerator(httpOptions, authType, this.config.configInstance, undefined), this.config.configInstance);
            }
            else {
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
                this.actualGenerator = new LoggingContentGenerator(googleGenAI.models, this.config.configInstance);
            }
            // Set user tier if available
            if (this.actualGenerator.userTier) {
                this.userTier = this.actualGenerator.userTier;
            }
        }
        catch (error) {
            throw this.wrapProviderError(error, 'initialize');
        }
    }
    /**
     * Generate content using the actual Gemini generator
     */
    async generateUnifiedContent(request, userPromptId) {
        if (!this.actualGenerator) {
            throw new Error('Gemini provider not initialized');
        }
        // Convert unified request back to Gemini format
        const geminiRequest = this.converter.toProviderFormat(request);
        // Call the actual Gemini generator
        const geminiResponse = await this.actualGenerator.generateContent(geminiRequest, userPromptId);
        // Convert response to unified format
        return this.converter.fromProviderResponse(geminiResponse);
    }
    /**
     * Generate streaming content
     */
    async *generateUnifiedContentStream(request, userPromptId) {
        if (!this.actualGenerator) {
            throw new Error('Gemini provider not initialized');
        }
        // Convert unified request back to Gemini format
        const geminiRequest = this.converter.toProviderFormat(request);
        // Get streaming generator from actual Gemini generator
        const streamGenerator = await this.actualGenerator.generateContentStream(geminiRequest, userPromptId);
        // Yield each response after conversion
        for await (const geminiResponse of streamGenerator) {
            yield this.converter.fromProviderResponse(geminiResponse);
        }
    }
    /**
     * Count tokens using actual Gemini generator
     */
    async countUnifiedTokens(request) {
        if (!this.actualGenerator) {
            throw new Error('Gemini provider not initialized');
        }
        return await this.actualGenerator.countTokens(request);
    }
    /**
     * Embed content using actual Gemini generator
     */
    async embedUnifiedContent(request) {
        if (!this.actualGenerator) {
            throw new Error('Gemini provider not initialized');
        }
        return await this.actualGenerator.embedContent(request);
    }
    /**
     * Determine authentication type based on configuration and environment
     */
    determineAuthType() {
        // Check for explicit auth type in config
        if (this.config.configInstance?.getAuthType) {
            const configAuthType = this.config.configInstance.getAuthType();
            if (configAuthType) {
                return configAuthType;
            }
        }
        // Check for Cloud Shell environment
        if (process.env.CLOUD_SHELL === 'true' ||
            process.env.GOOGLE_CLOUD_SHELL === 'true') {
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
    getEffectiveApiKey() {
        return (this.config.apiKey ||
            process.env.GEMINI_API_KEY ||
            process.env.GOOGLE_API_KEY ||
            undefined);
    }
    /**
     * Determine if we should use Vertex AI
     */
    shouldUseVertexAI() {
        const hasVertexConfig = !!(process.env.GOOGLE_CLOUD_PROJECT && process.env.GOOGLE_CLOUD_LOCATION);
        const hasGoogleApiKey = !!process.env.GOOGLE_API_KEY;
        // Use Vertex AI if we have the config or Google API key
        return hasVertexConfig || hasGoogleApiKey;
    }
    /**
     * Create user agent headers for requests
     */
    createUserAgentHeaders() {
        const version = process.env.CLI_VERSION || process.version;
        const userAgent = `GeminiCLI/${version} (${process.platform}; ${process.arch})`;
        return {
            'User-Agent': userAgent,
        };
    }
    /**
     * Override health check to use actual generator
     */
    async healthCheck() {
        try {
            if (!this.actualGenerator) {
                await this.initialize();
            }
            if (!this.actualGenerator) {
                return false;
            }
            // Simple test request
            await this.actualGenerator.generateContent({
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: 'Hello' }],
                    },
                ],
            }, 'health-check');
            return true;
        }
        catch (error) {
            console.debug('Gemini health check failed:', error);
            return false;
        }
    }
    /**
     * Get the underlying generator for backward compatibility
     */
    getUnderlyingGenerator() {
        return this.actualGenerator;
    }
    /**
     * Override requiresApiKey for Gemini-specific logic
     */
    requiresApiKey() {
        // Gemini can work without API key if using OAuth
        const authType = this.determineAuthType();
        return (authType !== AuthType.LOGIN_WITH_GOOGLE &&
            authType !== AuthType.CLOUD_SHELL);
    }
    /**
     * Get model name with fallback to config
     */
    getModelName() {
        return this.config.model || 'gemini-1.5-pro';
    }
    /**
     * Check if provider supports specific capability
     */
    supportsCapability(capability) {
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
}
//# sourceMappingURL=provider.js.map