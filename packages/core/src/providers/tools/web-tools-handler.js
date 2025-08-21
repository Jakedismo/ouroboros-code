/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { WebSearchTool } from '../../tools/web-search.js';
import { WebFetchTool } from '../../tools/web-fetch.js';
import { getResponseText } from '../../utils/generateContentResponseUtilities.js';
import { getErrorMessage } from '../../utils/errors.js';
import { convert } from 'html-to-text';
import { WebToolSecurity } from './web-tool-security.js';
import { EnhancedWebFetch } from './enhanced-web-fetch.js';
/**
 * Provider-agnostic web tools handler that manages secure web operations
 * across all LLM providers. Provides consistent security policies and
 * behavior for web_fetch and google_web_search tools.
 *
 * Features:
 * - Unified security validation for all web requests
 * - Provider-agnostic web fetch and search operations
 * - Comprehensive URL validation and sanitization
 * - Rate limiting and timeout management
 * - Content filtering and size limits
 * - Fallback mechanisms for blocked content
 */
export class WebToolsHandler {
    config;
    webSearchTool;
    webFetchTool;
    webSecurity;
    enhancedFetch;
    constructor(config) {
        this.config = config;
        this.webSearchTool = new WebSearchTool(config);
        this.webFetchTool = new WebFetchTool(config);
        // Create web security with custom settings
        const allowedDomains = this.getConfiguredAllowedDomains();
        const blockedDomains = this.getConfiguredBlockedDomains();
        const maxTimeout = 10000; // Default web request timeout
        const maxContentLength = 100000; // Default web content limit
        this.webSecurity = new WebToolSecurity(allowedDomains, blockedDomains, maxTimeout, maxContentLength, true // Enable rate limiting
        );
        this.enhancedFetch = new EnhancedWebFetch(this.webSecurity);
    }
    /**
     * Execute web search with security validation
     */
    async executeWebSearch(query, context, signal) {
        console.debug(`[WebToolsHandler] Executing web search for query: "${query}"`);
        try {
            // Create tool invocation and execute
            const invocation = this.webSearchTool.build({ query });
            const result = await invocation.execute(signal || new AbortController().signal);
            // No additional URL validation needed for search queries
            // The search service handles URL validation internally
            return {
                llmContent: result.llmContent,
                returnDisplay: result.returnDisplay,
                sources: result.sources,
            };
        }
        catch (error) {
            const errorMessage = `Web search failed: ${getErrorMessage(error)}`;
            console.error(`[WebToolsHandler] ${errorMessage}`, error);
            return {
                llmContent: `Error: ${errorMessage}`,
                returnDisplay: `Error: Web search failed`,
            };
        }
    }
    /**
     * Execute web fetch with comprehensive security validation
     */
    async executeWebFetch(prompt, context, signal) {
        console.debug(`[WebToolsHandler] Executing web fetch for prompt: "${prompt.substring(0, 100)}..."`);
        // Validate URLs in the prompt first
        const urlValidation = this.webSecurity.validateUrlsFromPrompt(prompt, context);
        if (!urlValidation.overallAllowed) {
            const blockedUrls = urlValidation.validationResults
                .filter(result => !result.allowed)
                .map((result, index) => urlValidation.urls[index]);
            return {
                llmContent: `Error: Some URLs were blocked by security policy. Blocked URLs: ${blockedUrls.join(', ')}`,
                returnDisplay: 'Error: URLs blocked by security policy',
                securityInfo: urlValidation.validationResults,
                hasBlockedUrls: true,
                processedUrls: urlValidation.urls,
            };
        }
        // Check if any URLs require confirmation
        const requiresConfirmation = urlValidation.validationResults.some(result => result.requiresConfirmation);
        if (requiresConfirmation && !context?.headers?.['x-confirmed']) {
            // For provider integration, this should be handled at the provider level
            console.warn('[WebToolsHandler] URLs require confirmation but no confirmation header found');
        }
        try {
            // Use original web fetch tool if all URLs are safe
            if (urlValidation.highestRiskLevel === 'SAFE') {
                const invocation = this.webFetchTool.build({ prompt });
                const result = await invocation.execute(signal || new AbortController().signal);
                return {
                    llmContent: result.llmContent,
                    returnDisplay: result.returnDisplay,
                    securityInfo: urlValidation.validationResults,
                    processedUrls: urlValidation.urls,
                };
            }
            // Use enhanced fetch for risky URLs
            return await this.executeEnhancedWebFetch(prompt, urlValidation, context, signal);
        }
        catch (error) {
            const errorMessage = `Web fetch failed: ${getErrorMessage(error)}`;
            console.error(`[WebToolsHandler] ${errorMessage}`, error);
            // Try fallback fetch for single URL
            if (urlValidation.urls.length === 1) {
                return await this.executeFallbackFetch(urlValidation.urls[0], prompt, signal);
            }
            return {
                llmContent: `Error: ${errorMessage}`,
                returnDisplay: 'Error: Web fetch failed',
                securityInfo: urlValidation.validationResults,
                processedUrls: urlValidation.urls,
            };
        }
    }
    /**
     * Execute enhanced web fetch with security controls
     */
    async executeEnhancedWebFetch(prompt, urlValidation, context, signal) {
        const results = [];
        const processedUrls = [];
        let contentTruncated = false;
        for (let i = 0; i < urlValidation.urls.length; i++) {
            const url = urlValidation.urls[i];
            const validation = urlValidation.validationResults[i];
            if (!validation.allowed) {
                results.push(`URL blocked: ${url} - ${validation.reason}`);
                continue;
            }
            try {
                const fetchOptions = {
                    context,
                    signal,
                    timeout: validation.recommendedTimeout,
                    maxResponseSize: validation.maxContentLength,
                };
                const fetchResult = await this.enhancedFetch.fetchText(url, fetchOptions);
                // Convert HTML to text for better LLM processing
                const textContent = convert(fetchResult.content, {
                    wordwrap: false,
                    selectors: [
                        { selector: 'a', options: { ignoreHref: true } },
                        { selector: 'img', format: 'skip' },
                    ],
                });
                results.push(`Content from ${url}:\n${textContent}`);
                processedUrls.push(url);
                if (fetchResult.truncated) {
                    contentTruncated = true;
                    results.push(`[Content truncated for security - exceeded ${validation.maxContentLength} characters]`);
                }
            }
            catch (error) {
                const errorMessage = `Failed to fetch ${url}: ${getErrorMessage(error)}`;
                results.push(errorMessage);
                console.error(`[WebToolsHandler] ${errorMessage}`, error);
            }
        }
        // Use Gemini to process the collected content
        const geminiClient = this.config.getGeminiClient();
        const combinedContent = results.join('\n\n');
        const geminiPrompt = `The user requested: "${prompt}"

I have fetched content from the URLs in the request. Please process this content according to the user's instructions:

${combinedContent}`;
        try {
            const response = await geminiClient.generateContent([{ role: 'user', parts: [{ text: geminiPrompt }] }], {}, signal || new AbortController().signal);
            const responseText = getResponseText(response) || 'No response generated';
            return {
                llmContent: responseText,
                returnDisplay: `Processed content from ${processedUrls.length} URL(s)`,
                securityInfo: urlValidation.validationResults,
                processedUrls,
                contentTruncated,
            };
        }
        catch (error) {
            const errorMessage = `Content processing failed: ${getErrorMessage(error)}`;
            console.error(`[WebToolsHandler] ${errorMessage}`, error);
            return {
                llmContent: combinedContent,
                returnDisplay: `Raw content from ${processedUrls.length} URL(s)`,
                securityInfo: urlValidation.validationResults,
                processedUrls,
                contentTruncated,
            };
        }
    }
    /**
     * Fallback fetch mechanism for when primary methods fail
     */
    async executeFallbackFetch(url, originalPrompt, signal) {
        console.debug(`[WebToolsHandler] Attempting fallback fetch for: ${url}`);
        try {
            const fetchOptions = {
                timeout: 5000, // Short timeout for fallback
                maxResponseSize: 50000, // Smaller size limit
                bypassSecurityChecks: true, // Allow bypass for fallback
                signal,
            };
            const result = await this.enhancedFetch.fetchText(url, fetchOptions);
            // Convert to text
            const textContent = convert(result.content, {
                wordwrap: false,
                selectors: [
                    { selector: 'a', options: { ignoreHref: true } },
                    { selector: 'img', format: 'skip' },
                ],
            });
            return {
                llmContent: `Fallback fetch successful for ${url}:\n\n${textContent}`,
                returnDisplay: `Fallback fetch completed for ${url}`,
                processedUrls: [url],
                contentTruncated: result.truncated,
            };
        }
        catch (error) {
            const errorMessage = `Fallback fetch failed for ${url}: ${getErrorMessage(error)}`;
            console.error(`[WebToolsHandler] ${errorMessage}`, error);
            return {
                llmContent: `Error: ${errorMessage}`,
                returnDisplay: 'Error: Fallback fetch failed',
            };
        }
    }
    /**
     * Validate URLs in a prompt and return security information
     */
    validatePromptUrls(prompt, context) {
        return this.webSecurity.validateUrlsFromPrompt(prompt, context);
    }
    /**
     * Get security recommendations for web requests
     */
    getSecurityRecommendations(url, context) {
        const validation = this.webSecurity.validateUrl(url, context);
        return {
            validation,
            recommendations: this.generateSecurityRecommendations(validation),
        };
    }
    /**
     * Generate human-readable security recommendations
     */
    generateSecurityRecommendations(validation) {
        const recommendations = [];
        if (!validation.allowed) {
            recommendations.push(`This URL is blocked: ${validation.reason}`);
            return recommendations;
        }
        if (validation.riskLevel !== 'SAFE') {
            recommendations.push(`Risk level: ${validation.riskLevel}`);
        }
        if (validation.securityConcerns.length > 0) {
            recommendations.push(`Security concerns: ${validation.securityConcerns.join(', ')}`);
        }
        if (validation.requiresConfirmation) {
            recommendations.push('This request requires user confirmation');
        }
        if (validation.recommendedTimeout < 10000) {
            recommendations.push(`Reduced timeout: ${validation.recommendedTimeout}ms due to security concerns`);
        }
        if (validation.maxContentLength < 100000) {
            recommendations.push(`Content limit: ${validation.maxContentLength} characters due to security concerns`);
        }
        return recommendations;
    }
    /**
     * Get configured allowed domains from config
     */
    getConfiguredAllowedDomains() {
        // This would be configurable via config
        // For now, return undefined to use default behavior
        return undefined;
    }
    /**
     * Get configured blocked domains from config
     */
    getConfiguredBlockedDomains() {
        // This would be configurable via config
        // For now, return undefined to use default behavior
        return undefined;
    }
    /**
     * Check if web tools are enabled in configuration
     */
    isWebToolsEnabled() {
        // Check if web tools are disabled in config
        const coreTools = this.config.getCoreTools() || [];
        const excludeTools = this.config.getExcludeTools() || [];
        const webToolNames = ['web_fetch', 'google_web_search'];
        // If explicitly excluded, return false
        if (webToolNames.some(name => excludeTools.includes(name))) {
            return false;
        }
        // If core tools is empty or contains web tools, return true
        if (coreTools.length === 0 || webToolNames.some(name => coreTools.includes(name))) {
            return true;
        }
        return false;
    }
    /**
     * Get web tool configuration summary
     */
    getWebToolConfig() {
        return {
            enabled: this.isWebToolsEnabled(),
            maxTimeout: 10000, // Default web request timeout
            maxContentLength: 100000, // Default web content limit
            rateLimitingEnabled: true,
            securityLevel: 'COMPREHENSIVE',
        };
    }
}
//# sourceMappingURL=web-tools-handler.js.map