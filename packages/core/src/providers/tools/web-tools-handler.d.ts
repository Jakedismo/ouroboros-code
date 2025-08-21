/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Config } from '../../config/config.js';
import { UrlValidationResult, WebRequestContext } from './web-tool-security.js';
import { PartListUnion } from '@google/genai';
import { ToolResultDisplay } from '../../tools/tools.js';
/**
 * Web tool execution result with security information
 */
export interface WebToolResult {
    /** Content for LLM */
    llmContent: PartListUnion;
    /** Display content for user */
    returnDisplay: ToolResultDisplay;
    /** Security validation results */
    securityInfo?: UrlValidationResult[];
    /** Whether any URLs were blocked */
    hasBlockedUrls?: boolean;
    /** URLs that were processed */
    processedUrls?: string[];
    /** Sources for search results */
    sources?: unknown[];
    /** Whether content was truncated for security */
    contentTruncated?: boolean;
}
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
export declare class WebToolsHandler {
    private config;
    private webSearchTool;
    private webFetchTool;
    private webSecurity;
    private enhancedFetch;
    constructor(config: Config);
    /**
     * Execute web search with security validation
     */
    executeWebSearch(query: string, context?: WebRequestContext, signal?: AbortSignal): Promise<WebToolResult>;
    /**
     * Execute web fetch with comprehensive security validation
     */
    executeWebFetch(prompt: string, context?: WebRequestContext, signal?: AbortSignal): Promise<WebToolResult>;
    /**
     * Execute enhanced web fetch with security controls
     */
    private executeEnhancedWebFetch;
    /**
     * Fallback fetch mechanism for when primary methods fail
     */
    private executeFallbackFetch;
    /**
     * Validate URLs in a prompt and return security information
     */
    validatePromptUrls(prompt: string, context?: WebRequestContext): {
        urls: string[];
        validationResults: UrlValidationResult[];
        overallAllowed: boolean;
        highestRiskLevel: UrlValidationResult["riskLevel"];
    };
    /**
     * Get security recommendations for web requests
     */
    getSecurityRecommendations(url: string, context?: WebRequestContext): {
        validation: UrlValidationResult;
        recommendations: string[];
    };
    /**
     * Generate human-readable security recommendations
     */
    private generateSecurityRecommendations;
    /**
     * Get configured allowed domains from config
     */
    private getConfiguredAllowedDomains;
    /**
     * Get configured blocked domains from config
     */
    private getConfiguredBlockedDomains;
    /**
     * Check if web tools are enabled in configuration
     */
    isWebToolsEnabled(): boolean;
    /**
     * Get web tool configuration summary
     */
    getWebToolConfig(): {
        enabled: boolean;
        maxTimeout: number;
        maxContentLength: number;
        rateLimitingEnabled: boolean;
        securityLevel: string;
    };
}
