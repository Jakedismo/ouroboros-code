/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { URL } from 'url';
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
export class WebToolSecurity {
    allowedDomains;
    blockedDomains;
    maxTimeout;
    maxContentLength;
    enableRateLimiting;
    // Default security configurations
    static DEFAULT_TIMEOUT_MS = 10000; // 10 seconds
    static DEFAULT_MAX_CONTENT_LENGTH = 100000; // 100KB
    static MAX_URL_LENGTH = 2048;
    static MAX_REDIRECTS = 5;
    // Private IP ranges (RFC 1918, RFC 3927, RFC 4193)
    static PRIVATE_IP_PATTERNS = [
        /^10\./, // 10.0.0.0/8
        /^172\.(1[6-9]|2[0-9]|3[01])\./, // 172.16.0.0/12
        /^192\.168\./, // 192.168.0.0/16
        /^169\.254\./, // 169.254.0.0/16 (link-local)
        /^fc[0-9a-f]{2}:/, // fc00::/7 (IPv6 ULA)
        /^fe[89ab][0-9a-f]:/, // fe80::/10 (IPv6 link-local)
    ];
    // Localhost patterns
    static LOCALHOST_PATTERNS = [
        /^localhost$/i,
        /^127\./, // 127.0.0.0/8
        /^0\.0\.0\.0$/,
        /^::1$/, // IPv6 localhost
        /^::$/,
    ];
    // Suspicious URL patterns that might indicate malicious intent
    static SUSPICIOUS_PATTERNS = [
        /[<>"']/, // HTML/script injection characters
        /javascript:/i, // JavaScript protocol
        /data:/i, // Data URLs can contain malicious content
        /vbscript:/i, // VBScript protocol
        /file:/i, // Local file access
        /ftp:/i, // FTP protocol (often unsecured)
        /\.\.\//, // Path traversal attempts
        /%2e%2e%2f/i, // URL-encoded path traversal
        /%3c%3e/i, // URL-encoded < >
        /eval\(/i, // Code execution attempts
        /base64/i, // Base64 encoding (potential obfuscation)
    ];
    // Known malicious or risky TLDs
    static RISKY_TLDS = new Set([
        '.tk', '.ml', '.ga', '.cf', // Free domains often used maliciously
        '.bit', // Namecoin domains (hard to track)
        '.onion', // Tor hidden services
    ]);
    // Default blocked domains (can be extended via configuration)
    static DEFAULT_BLOCKED_DOMAINS = new Set([
        'localhost',
        '0.0.0.0',
        'example.com',
        'example.org',
        'example.net',
        'test.com',
    ]);
    // Allowed protocols
    static ALLOWED_PROTOCOLS = new Set([
        'http:',
        'https:',
    ]);
    // Rate limiting storage (in-memory for simplicity)
    static requestCounts = new Map();
    static RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
    static MAX_REQUESTS_PER_MINUTE = 30;
    constructor(allowedDomains, blockedDomains, maxTimeout, maxContentLength, enableRateLimiting = true) {
        this.allowedDomains = allowedDomains;
        this.blockedDomains = blockedDomains;
        this.maxTimeout = maxTimeout;
        this.maxContentLength = maxContentLength;
        this.enableRateLimiting = enableRateLimiting;
        // Merge default blocked domains with custom ones
        this.blockedDomains = new Set([
            ...WebToolSecurity.DEFAULT_BLOCKED_DOMAINS,
            ...(blockedDomains || [])
        ]);
    }
    /**
     * Validates a URL for security and returns detailed validation result
     */
    validateUrl(url, _context) {
        const securityConcerns = [];
        let riskLevel = 'SAFE';
        const allowed = true;
        let reason = 'URL validation passed';
        // Basic URL format validation
        if (!url || typeof url !== 'string') {
            return this.createBlockedResult('URL is empty or invalid', ['Invalid URL format'], 'CRITICAL');
        }
        // URL length check
        if (url.length > WebToolSecurity.MAX_URL_LENGTH) {
            return this.createBlockedResult('URL exceeds maximum length', ['Excessive URL length'], 'HIGH');
        }
        // Parse URL
        let parsedUrl;
        try {
            parsedUrl = new URL(url);
        }
        catch {
            return this.createBlockedResult('URL format is invalid', ['Malformed URL'], 'CRITICAL');
        }
        // Protocol validation
        if (!WebToolSecurity.ALLOWED_PROTOCOLS.has(parsedUrl.protocol)) {
            return this.createBlockedResult(`Protocol '${parsedUrl.protocol}' is not allowed`, [`Disallowed protocol: ${parsedUrl.protocol}`], 'CRITICAL');
        }
        // Check for suspicious patterns
        for (const pattern of WebToolSecurity.SUSPICIOUS_PATTERNS) {
            if (pattern.test(url)) {
                securityConcerns.push(`Suspicious pattern detected: ${pattern.source}`);
                riskLevel = 'HIGH';
                if (pattern.source.includes('javascript') || pattern.source.includes('vbscript')) {
                    return this.createBlockedResult('Script injection attempt detected', securityConcerns, 'CRITICAL');
                }
            }
        }
        // Hostname validation
        const hostname = parsedUrl.hostname.toLowerCase();
        // Check for private networks
        const isPrivate = this.isPrivateNetwork(hostname);
        const isLocalhost = this.isLocalhost(hostname);
        if (isPrivate || isLocalhost) {
            securityConcerns.push(isLocalhost ? 'Localhost access detected' : 'Private network access detected');
            riskLevel = 'MODERATE';
            reason = 'Private network or localhost access requires confirmation';
        }
        // Domain blocklist check
        if (this.blockedDomains?.has(hostname) || this.isSubdomainBlocked(hostname)) {
            return this.createBlockedResult(`Domain '${hostname}' is blocked`, [`Blocked domain: ${hostname}`], 'HIGH');
        }
        // Domain allowlist check (if configured)
        if (this.allowedDomains && this.allowedDomains.size > 0) {
            if (!this.allowedDomains.has(hostname) && !this.isSubdomainAllowed(hostname)) {
                return this.createBlockedResult(`Domain '${hostname}' is not in allowlist`, [`Domain not in allowlist: ${hostname}`], 'MODERATE');
            }
        }
        // TLD risk check
        const tld = this.extractTLD(hostname);
        if (tld && WebToolSecurity.RISKY_TLDS.has(tld)) {
            securityConcerns.push(`Risky TLD detected: ${tld}`);
            riskLevel = 'MODERATE';
        }
        // Rate limiting check
        if (this.enableRateLimiting && !this.checkRateLimit(hostname)) {
            return this.createBlockedResult('Rate limit exceeded for this domain', ['Rate limiting violation'], 'MODERATE');
        }
        // Determine timeout and content limits based on risk
        const recommendedTimeout = this.getRecommendedTimeout(riskLevel);
        const maxContentLength = this.getMaxContentLength(riskLevel);
        // Determine if confirmation is required
        const requiresConfirmation = riskLevel !== 'SAFE' || isPrivate || isLocalhost;
        return {
            allowed,
            riskLevel,
            reason,
            securityConcerns,
            requiresConfirmation,
            recommendedTimeout,
            maxContentLength,
            parsedUrl: {
                protocol: parsedUrl.protocol,
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || null,
                pathname: parsedUrl.pathname,
                search: parsedUrl.search,
                isPrivate,
                isLocalhost,
            }
        };
    }
    /**
     * Validates multiple URLs from a text prompt
     */
    validateUrlsFromPrompt(prompt, context) {
        const urls = this.extractUrlsFromText(prompt);
        const validationResults = urls.map(url => this.validateUrl(url, context));
        const overallAllowed = validationResults.every(result => result.allowed);
        const highestRiskLevel = this.getHighestRiskLevel(validationResults.map(r => r.riskLevel));
        return {
            urls,
            validationResults,
            overallAllowed,
            highestRiskLevel,
        };
    }
    /**
     * Check rate limiting for a domain
     */
    checkRateLimit(domain) {
        const now = Date.now();
        const key = `rate_limit_${domain}`;
        const current = WebToolSecurity.requestCounts.get(key);
        if (!current) {
            WebToolSecurity.requestCounts.set(key, { count: 1, lastReset: now });
            return true;
        }
        // Reset counter if window has passed
        if (now - current.lastReset > WebToolSecurity.RATE_LIMIT_WINDOW_MS) {
            WebToolSecurity.requestCounts.set(key, { count: 1, lastReset: now });
            return true;
        }
        // Check if under limit
        if (current.count < WebToolSecurity.MAX_REQUESTS_PER_MINUTE) {
            current.count++;
            return true;
        }
        return false;
    }
    /**
     * Extract URLs from text content
     */
    extractUrlsFromText(text) {
        const urlRegex = /(https?:\/\/[^\s<>"']+)/gi;
        return text.match(urlRegex) || [];
    }
    /**
     * Check if hostname is a private network address
     */
    isPrivateNetwork(hostname) {
        // Remove port if present
        const cleanHostname = hostname.split(':')[0];
        return WebToolSecurity.PRIVATE_IP_PATTERNS.some(pattern => pattern.test(cleanHostname));
    }
    /**
     * Check if hostname is localhost
     */
    isLocalhost(hostname) {
        const cleanHostname = hostname.split(':')[0];
        return WebToolSecurity.LOCALHOST_PATTERNS.some(pattern => pattern.test(cleanHostname));
    }
    /**
     * Check if domain is blocked via subdomain matching
     */
    isSubdomainBlocked(hostname) {
        if (!this.blockedDomains)
            return false;
        const parts = hostname.split('.');
        for (let i = 0; i < parts.length; i++) {
            const domain = parts.slice(i).join('.');
            if (this.blockedDomains.has(domain)) {
                return true;
            }
        }
        return false;
    }
    /**
     * Check if domain is allowed via subdomain matching
     */
    isSubdomainAllowed(hostname) {
        if (!this.allowedDomains)
            return false;
        const parts = hostname.split('.');
        for (let i = 0; i < parts.length; i++) {
            const domain = parts.slice(i).join('.');
            if (this.allowedDomains.has(domain)) {
                return true;
            }
        }
        return false;
    }
    /**
     * Extract TLD from hostname
     */
    extractTLD(hostname) {
        const parts = hostname.split('.');
        if (parts.length < 2)
            return null;
        return '.' + parts[parts.length - 1];
    }
    /**
     * Get recommended timeout based on risk level
     */
    getRecommendedTimeout(riskLevel) {
        const baseTimeout = this.maxTimeout || WebToolSecurity.DEFAULT_TIMEOUT_MS;
        switch (riskLevel) {
            case 'SAFE':
                return baseTimeout;
            case 'LOW':
                return Math.max(5000, baseTimeout * 0.8);
            case 'MODERATE':
                return Math.max(3000, baseTimeout * 0.6);
            case 'HIGH':
                return Math.max(2000, baseTimeout * 0.4);
            case 'CRITICAL':
                return 1000; // Very short timeout for critical risks
            default:
                return baseTimeout;
        }
    }
    /**
     * Get maximum content length based on risk level
     */
    getMaxContentLength(riskLevel) {
        const baseLength = this.maxContentLength || WebToolSecurity.DEFAULT_MAX_CONTENT_LENGTH;
        switch (riskLevel) {
            case 'SAFE':
                return baseLength;
            case 'LOW':
                return Math.max(50000, baseLength * 0.8);
            case 'MODERATE':
                return Math.max(25000, baseLength * 0.5);
            case 'HIGH':
                return Math.max(10000, baseLength * 0.25);
            case 'CRITICAL':
                return 5000; // Very small limit for critical risks
            default:
                return baseLength;
        }
    }
    /**
     * Get the highest risk level from an array of risk levels
     */
    getHighestRiskLevel(riskLevels) {
        const priorities = { 'CRITICAL': 5, 'HIGH': 4, 'MODERATE': 3, 'LOW': 2, 'SAFE': 1 };
        return riskLevels.reduce((highest, current) => priorities[current] > priorities[highest] ? current : highest, 'SAFE');
    }
    /**
     * Create a blocked result with standard format
     */
    createBlockedResult(reason, securityConcerns, riskLevel) {
        return {
            allowed: false,
            riskLevel,
            reason,
            securityConcerns,
            requiresConfirmation: false, // Blocked URLs don't need confirmation
            recommendedTimeout: 1000,
            maxContentLength: 0,
        };
    }
    /**
     * Sanitize URL by removing potentially dangerous components
     */
    sanitizeUrl(url) {
        try {
            const parsed = new URL(url);
            // Remove fragment (hash) for security
            parsed.hash = '';
            // Basic cleanup of dangerous characters in pathname
            parsed.pathname = parsed.pathname.replace(/[<>"']/g, '');
            // Remove potentially dangerous query parameters
            const dangerousParams = ['callback', 'jsonp', 'redirect', 'return', 'goto'];
            dangerousParams.forEach(param => {
                parsed.searchParams.delete(param);
            });
            return parsed.toString();
        }
        catch {
            return url; // Return original if parsing fails
        }
    }
    /**
     * Get security headers for web requests
     */
    getSecurityHeaders(context) {
        const headers = {
            'User-Agent': context?.userAgent || 'Gemini-CLI/1.0 (Security Scanner)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'DNT': '1', // Do Not Track
            'Connection': 'close', // Don't keep connections alive
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
        };
        // Add custom headers if provided
        if (context?.headers) {
            Object.assign(headers, context.headers);
        }
        return headers;
    }
    /**
     * Validate web request context
     */
    validateRequestContext(context) {
        const errors = [];
        if (context.maxRedirects && context.maxRedirects > WebToolSecurity.MAX_REDIRECTS) {
            errors.push(`Max redirects (${context.maxRedirects}) exceeds limit (${WebToolSecurity.MAX_REDIRECTS})`);
        }
        if (context.userAgent && context.userAgent.length > 200) {
            errors.push('User agent string is too long');
        }
        // Check for suspicious patterns in headers
        if (context.headers) {
            for (const [key, value] of Object.entries(context.headers)) {
                if (WebToolSecurity.SUSPICIOUS_PATTERNS.some(pattern => pattern.test(value))) {
                    errors.push(`Suspicious pattern in header '${key}': ${value}`);
                }
            }
        }
        return {
            valid: errors.length === 0,
            errors,
        };
    }
    /**
     * Reset rate limiting for testing or administrative purposes
     */
    static resetRateLimiting() {
        WebToolSecurity.requestCounts.clear();
    }
    /**
     * Get current rate limiting status for a domain
     */
    static getRateLimitStatus(domain) {
        const key = `rate_limit_${domain}`;
        const current = WebToolSecurity.requestCounts.get(key);
        if (!current) {
            return {
                remaining: WebToolSecurity.MAX_REQUESTS_PER_MINUTE,
                resetTime: Date.now() + WebToolSecurity.RATE_LIMIT_WINDOW_MS,
            };
        }
        return {
            remaining: Math.max(0, WebToolSecurity.MAX_REQUESTS_PER_MINUTE - current.count),
            resetTime: current.lastReset + WebToolSecurity.RATE_LIMIT_WINDOW_MS,
        };
    }
}
/**
 * Default web security instance with conservative settings
 */
export const defaultWebSecurity = new WebToolSecurity();
/**
 * Utility function to validate a single URL quickly
 */
export function validateWebUrl(url, context) {
    return defaultWebSecurity.validateUrl(url, context);
}
/**
 * Utility function to extract and validate URLs from text
 */
export function validateWebUrls(prompt, context) {
    return defaultWebSecurity.validateUrlsFromPrompt(prompt, context);
}
//# sourceMappingURL=web-tool-security.js.map