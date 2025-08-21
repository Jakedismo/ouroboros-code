/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * URL validation result with detailed information about the URL safety
 */
export interface UrlValidationResult {
    /** Whether the URL is allowed to be accessed */
    allowed: boolean;
    /** Security risk level of the URL */
    riskLevel: 'SAFE' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
    /** Human-readable reason for the decision */
    reason: string;
    /** Array of specific security concerns found */
    securityConcerns: string[];
    /** Whether this requires user confirmation */
    requiresConfirmation: boolean;
    /** Recommended timeout in milliseconds */
    recommendedTimeout: number;
    /** Maximum content length to retrieve */
    maxContentLength: number;
    /** Parsed URL components for reference */
    parsedUrl?: {
        protocol: string;
        hostname: string;
        port: string | null;
        pathname: string;
        search: string;
        isPrivate: boolean;
        isLocalhost: boolean;
    };
}
/**
 * Web request context information
 */
export interface WebRequestContext {
    /** The original request prompt or query */
    prompt?: string;
    /** User agent to use for the request */
    userAgent?: string;
    /** Maximum number of redirects to follow */
    maxRedirects?: number;
    /** Whether to validate SSL certificates */
    validateSSL?: boolean;
    /** Additional headers to include */
    headers?: Record<string, string>;
}
/**
 * Comprehensive web security handler for validating URLs and web requests
 * across all LLM providers. Provides consistent security policies for
 * web_fetch and google_web_search tools.
 *
 * Features:
 * - URL validation and sanitization
 * - Private network and localhost detection
 * - Domain-based allowlisting and blocklisting
 * - Protocol restrictions and validation
 * - Rate limiting and request throttling
 * - Content size limits and timeout handling
 * - Malicious URL pattern detection
 * - SSL/TLS validation requirements
 */
export declare class WebToolSecurity {
    private allowedDomains?;
    private blockedDomains?;
    private maxTimeout?;
    private maxContentLength?;
    private enableRateLimiting;
    private static readonly DEFAULT_TIMEOUT_MS;
    private static readonly DEFAULT_MAX_CONTENT_LENGTH;
    private static readonly MAX_URL_LENGTH;
    private static readonly MAX_REDIRECTS;
    private static readonly PRIVATE_IP_PATTERNS;
    private static readonly LOCALHOST_PATTERNS;
    private static readonly SUSPICIOUS_PATTERNS;
    private static readonly RISKY_TLDS;
    private static readonly DEFAULT_BLOCKED_DOMAINS;
    private static readonly ALLOWED_PROTOCOLS;
    private static requestCounts;
    private static readonly RATE_LIMIT_WINDOW_MS;
    private static readonly MAX_REQUESTS_PER_MINUTE;
    constructor(allowedDomains?: Set<string> | undefined, blockedDomains?: Set<string> | undefined, maxTimeout?: number | undefined, maxContentLength?: number | undefined, enableRateLimiting?: boolean);
    /**
     * Validates a URL for security and returns detailed validation result
     */
    validateUrl(url: string, _context?: WebRequestContext): UrlValidationResult;
    /**
     * Validates multiple URLs from a text prompt
     */
    validateUrlsFromPrompt(prompt: string, context?: WebRequestContext): {
        urls: string[];
        validationResults: UrlValidationResult[];
        overallAllowed: boolean;
        highestRiskLevel: UrlValidationResult['riskLevel'];
    };
    /**
     * Check rate limiting for a domain
     */
    private checkRateLimit;
    /**
     * Extract URLs from text content
     */
    private extractUrlsFromText;
    /**
     * Check if hostname is a private network address
     */
    private isPrivateNetwork;
    /**
     * Check if hostname is localhost
     */
    private isLocalhost;
    /**
     * Check if domain is blocked via subdomain matching
     */
    private isSubdomainBlocked;
    /**
     * Check if domain is allowed via subdomain matching
     */
    private isSubdomainAllowed;
    /**
     * Extract TLD from hostname
     */
    private extractTLD;
    /**
     * Get recommended timeout based on risk level
     */
    private getRecommendedTimeout;
    /**
     * Get maximum content length based on risk level
     */
    private getMaxContentLength;
    /**
     * Get the highest risk level from an array of risk levels
     */
    private getHighestRiskLevel;
    /**
     * Create a blocked result with standard format
     */
    private createBlockedResult;
    /**
     * Sanitize URL by removing potentially dangerous components
     */
    sanitizeUrl(url: string): string;
    /**
     * Get security headers for web requests
     */
    getSecurityHeaders(context?: WebRequestContext): Record<string, string>;
    /**
     * Validate web request context
     */
    validateRequestContext(context: WebRequestContext): {
        valid: boolean;
        errors: string[];
    };
    /**
     * Reset rate limiting for testing or administrative purposes
     */
    static resetRateLimiting(): void;
    /**
     * Get current rate limiting status for a domain
     */
    static getRateLimitStatus(domain: string): {
        remaining: number;
        resetTime: number;
    } | null;
}
/**
 * Default web security instance with conservative settings
 */
export declare const defaultWebSecurity: WebToolSecurity;
/**
 * Utility function to validate a single URL quickly
 */
export declare function validateWebUrl(url: string, context?: WebRequestContext): UrlValidationResult;
/**
 * Utility function to extract and validate URLs from text
 */
export declare function validateWebUrls(prompt: string, context?: WebRequestContext): {
    urls: string[];
    validationResults: UrlValidationResult[];
    overallAllowed: boolean;
    highestRiskLevel: UrlValidationResult["riskLevel"];
};
