/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { WebToolSecurity, UrlValidationResult, WebRequestContext } from './web-tool-security.js';
/**
 * Enhanced web fetch result with security information
 */
export interface EnhancedFetchResult {
    /** The fetch response */
    response: Response;
    /** Security validation result */
    securityInfo: UrlValidationResult;
    /** Actual timeout used for the request */
    timeoutUsed: number;
    /** Whether the request was redirected */
    wasRedirected: boolean;
    /** Final URL after redirects */
    finalUrl: string;
}
/**
 * Enhanced web fetch options
 */
export interface EnhancedFetchOptions {
    /** Custom timeout in milliseconds (will be capped by security settings) */
    timeout?: number;
    /** Web request context */
    context?: WebRequestContext;
    /** Whether to follow redirects (default: true) */
    followRedirects?: boolean;
    /** Custom web security instance (uses default if not provided) */
    webSecurity?: WebToolSecurity;
    /** Whether to bypass some security checks (use with caution) */
    bypassSecurityChecks?: boolean;
    /** AbortController signal */
    signal?: AbortSignal;
    /** Maximum response size in bytes */
    maxResponseSize?: number;
    /** Whether to validate SSL certificates (default: true) */
    validateSSL?: boolean;
}
/**
 * Enhanced web fetch with comprehensive security validation and safety features.
 * Provides secure HTTP(S) request handling across all providers.
 */
export declare class EnhancedWebFetch {
    private webSecurity;
    constructor(webSecurity?: WebToolSecurity);
    /**
     * Perform a secure web fetch with comprehensive validation
     */
    fetch(url: string, options?: EnhancedFetchOptions): Promise<EnhancedFetchResult>;
    /**
     * Validate response headers for security concerns
     */
    private validateResponseHeaders;
    /**
     * Convenience method to fetch and read text content safely
     */
    fetchText(url: string, options?: EnhancedFetchOptions): Promise<{
        content: string;
        securityInfo: UrlValidationResult;
        truncated: boolean;
    }>;
    /**
     * Safely read response body with size limits
     */
    private readResponseSafely;
    /**
     * Validate multiple URLs from a prompt
     */
    validateUrls(prompt: string, context?: WebRequestContext): {
        urls: string[];
        validationResults: UrlValidationResult[];
        overallAllowed: boolean;
        highestRiskLevel: UrlValidationResult["riskLevel"];
    };
    /**
     * Get recommended security settings for a URL
     */
    getSecuritySettings(url: string, context?: WebRequestContext): {
        timeout: number;
        maxContentLength: number;
        requiresConfirmation: boolean;
        securityHeaders: Record<string, string>;
    };
}
/**
 * Default enhanced web fetch instance
 */
export declare const defaultEnhancedWebFetch: EnhancedWebFetch;
/**
 * Utility function for simple secure fetch
 */
export declare function secureFetch(url: string, options?: EnhancedFetchOptions): Promise<EnhancedFetchResult>;
/**
 * Utility function for secure text fetch
 */
export declare function secureFetchText(url: string, options?: EnhancedFetchOptions): Promise<{
    content: string;
    securityInfo: UrlValidationResult;
    truncated: boolean;
}>;
