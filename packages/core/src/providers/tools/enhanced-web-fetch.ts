/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FetchError } from '../../utils/fetch.js';
import { getErrorMessage, isNodeError } from '../../utils/errors.js';
import { 
  WebToolSecurity, 
  UrlValidationResult, 
  WebRequestContext 
} from './web-tool-security.js';

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
export class EnhancedWebFetch {
  private webSecurity: WebToolSecurity;
  
  constructor(webSecurity?: WebToolSecurity) {
    this.webSecurity = webSecurity || new WebToolSecurity();
  }
  
  /**
   * Perform a secure web fetch with comprehensive validation
   */
  async fetch(url: string, options: EnhancedFetchOptions = {}): Promise<EnhancedFetchResult> {
    // Validate the URL first
    const securityInfo = this.webSecurity.validateUrl(url, options.context);
    
    // Check if URL is blocked
    if (!securityInfo.allowed && !options.bypassSecurityChecks) {
      throw new FetchError(
        `URL blocked by security policy: ${securityInfo.reason}`,
        'SECURITY_BLOCKED'
      );
    }
    
    // Use security-recommended timeout
    const timeoutUsed = Math.min(
      options.timeout || securityInfo.recommendedTimeout,
      securityInfo.recommendedTimeout
    );
    
    // Sanitize URL
    const sanitizedUrl = this.webSecurity.sanitizeUrl(url);
    
    // Prepare security headers
    const securityHeaders = this.webSecurity.getSecurityHeaders(options.context);
    
    // Validate request context
    if (options.context) {
      const contextValidation = this.webSecurity.validateRequestContext(options.context);
      if (!contextValidation.valid && !options.bypassSecurityChecks) {
        throw new FetchError(
          `Request context validation failed: ${contextValidation.errors.join(', ')}`,
          'CONTEXT_INVALID'
        );
      }
    }
    
    // Create abort controller with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutUsed);
    
    // Combine signals if external signal provided
    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        controller.abort();
      });
    }
    
    let response: Response;
    let wasRedirected = false;
    let finalUrl = sanitizedUrl;
    
    try {
      // Prepare fetch options
      const fetchOptions: RequestInit = {
        signal: controller.signal,
        headers: securityHeaders,
        redirect: options.followRedirects !== false ? 'follow' : 'manual',
        // Security-conscious defaults
        mode: 'cors',
        cache: 'no-cache',
        credentials: 'omit', // Don't send credentials
        referrerPolicy: 'no-referrer',
      };
      
      // Override SSL validation if specified
      if (options.validateSSL === false) {
        // Note: This is a Node.js specific setting and may not work in all environments
        // @ts-ignore - rejectUnauthorized is Node.js specific
        fetchOptions.rejectUnauthorized = false;
      }
      
      console.debug(`[EnhancedWebFetch] Fetching URL: ${sanitizedUrl} with timeout: ${timeoutUsed}ms`);
      
      response = await fetch(sanitizedUrl, fetchOptions);
      
      // Check for redirects
      if (response.redirected) {
        wasRedirected = true;
        finalUrl = response.url;
        
        // Validate the final URL after redirects
        const finalUrlValidation = this.webSecurity.validateUrl(finalUrl, options.context);
        if (!finalUrlValidation.allowed && !options.bypassSecurityChecks) {
          throw new FetchError(
            `Final URL after redirect blocked by security policy: ${finalUrlValidation.reason}`,
            'REDIRECT_BLOCKED'
          );
        }
      }
      
      // Check response size if specified
      const contentLength = response.headers.get('content-length');
      const maxSize = options.maxResponseSize || securityInfo.maxContentLength;
      
      if (contentLength && parseInt(contentLength) > maxSize) {
        throw new FetchError(
          `Response size (${contentLength} bytes) exceeds maximum allowed (${maxSize} bytes)`,
          'SIZE_EXCEEDED'
        );
      }
      
      // Validate response headers for security concerns
      this.validateResponseHeaders(response, options.bypassSecurityChecks || false);
      
      console.debug(`[EnhancedWebFetch] Successfully fetched ${finalUrl} (${response.status})`);
      
      return {
        response,
        securityInfo,
        timeoutUsed,
        wasRedirected,
        finalUrl,
      };
      
    } catch (error) {
      if (isNodeError(error) && error.name === 'AbortError') {
        throw new FetchError(
          `Request timed out after ${timeoutUsed}ms`,
          'ETIMEDOUT'
        );
      }
      
      if (error instanceof FetchError) {
        throw error;
      }
      
      throw new FetchError(
        `Fetch failed: ${getErrorMessage(error)}`,
        'FETCH_ERROR'
      );
      
    } finally {
      clearTimeout(timeoutId);
    }
  }
  
  /**
   * Validate response headers for security concerns
   */
  private validateResponseHeaders(response: Response, bypassChecks: boolean): void {
    if (bypassChecks) return;
    
    const securityConcerns: string[] = [];
    
    // Check Content-Type for potentially dangerous content
    const contentType = response.headers.get('content-type')?.toLowerCase();
    if (contentType) {
      const dangerousTypes = [
        'application/x-executable',
        'application/octet-stream', // Could be malicious binary
        'text/html', // Could contain scripts (but common for web pages)
        'application/javascript',
        'text/javascript',
      ];
      
      // Only warn for explicitly dangerous types
      if (dangerousTypes.includes(contentType) && !contentType.includes('html')) {
        securityConcerns.push(`Potentially dangerous content type: ${contentType}`);
      }
    }
    
    // Check for suspicious headers
    const suspiciousHeaders = [
      'x-frame-options', // Could indicate embedding restrictions
      'x-xss-protection', // XSS protection settings
      'content-security-policy', // CSP headers
    ];
    
    // This is actually informational - these are GOOD security headers
    // But we want to log them for awareness
    suspiciousHeaders.forEach(header => {
      const value = response.headers.get(header);
      if (value) {
        console.debug(`[EnhancedWebFetch] Security header found: ${header}: ${value}`);
      }
    });
    
    // Check for potentially malicious headers
    const maliciousPatterns = [
      /refresh.*url=/i, // Meta refresh redirects
      /location.*javascript:/i, // JavaScript in location header
    ];
    
    for (const [name, value] of response.headers.entries()) {
      for (const pattern of maliciousPatterns) {
        if (pattern.test(`${name}: ${value}`)) {
          throw new FetchError(
            `Malicious header pattern detected: ${name}: ${value}`,
            'MALICIOUS_HEADER'
          );
        }
      }
    }
  }
  
  /**
   * Convenience method to fetch and read text content safely
   */
  async fetchText(url: string, options: EnhancedFetchOptions = {}): Promise<{
    content: string;
    securityInfo: UrlValidationResult;
    truncated: boolean;
  }> {
    const result = await this.fetch(url, options);
    const maxLength = result.securityInfo.maxContentLength;
    
    // Read response body with size limit
    const responseText = await this.readResponseSafely(result.response, maxLength);
    
    return {
      content: responseText.content,
      securityInfo: result.securityInfo,
      truncated: responseText.truncated,
    };
  }
  
  /**
   * Safely read response body with size limits
   */
  private async readResponseSafely(
    response: Response, 
    maxLength: number
  ): Promise<{ content: string; truncated: boolean }> {
    const reader = response.body?.getReader();
    if (!reader) {
      return { content: '', truncated: false };
    }
    
    const decoder = new TextDecoder();
    let content = '';
    let totalLength = 0;
    let truncated = false;
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        totalLength += chunk.length;
        
        if (totalLength > maxLength) {
          // Truncate content to max length
          const remainingLength = maxLength - content.length;
          if (remainingLength > 0) {
            content += chunk.substring(0, remainingLength);
          }
          truncated = true;
          break;
        }
        
        content += chunk;
      }
    } finally {
      reader.releaseLock();
    }
    
    return { content, truncated };
  }
  
  /**
   * Validate multiple URLs from a prompt
   */
  validateUrls(prompt: string, context?: WebRequestContext) {
    return this.webSecurity.validateUrlsFromPrompt(prompt, context);
  }
  
  /**
   * Get recommended security settings for a URL
   */
  getSecuritySettings(url: string, context?: WebRequestContext): {
    timeout: number;
    maxContentLength: number;
    requiresConfirmation: boolean;
    securityHeaders: Record<string, string>;
  } {
    const validation = this.webSecurity.validateUrl(url, context);
    return {
      timeout: validation.recommendedTimeout,
      maxContentLength: validation.maxContentLength,
      requiresConfirmation: validation.requiresConfirmation,
      securityHeaders: this.webSecurity.getSecurityHeaders(context),
    };
  }
}

/**
 * Default enhanced web fetch instance
 */
export const defaultEnhancedWebFetch = new EnhancedWebFetch();

/**
 * Utility function for simple secure fetch
 */
export async function secureFetch(
  url: string, 
  options: EnhancedFetchOptions = {}
): Promise<EnhancedFetchResult> {
  return defaultEnhancedWebFetch.fetch(url, options);
}

/**
 * Utility function for secure text fetch
 */
export async function secureFetchText(
  url: string,
  options: EnhancedFetchOptions = {}
): Promise<{ content: string; securityInfo: UrlValidationResult; truncated: boolean }> {
  return defaultEnhancedWebFetch.fetchText(url, options);
}