/**
 * @license
 * Copyright 2025 Ouroboros
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClaudeOAuthFlow, ClaudeOAuthConfig, OAuthTokenResponse, findAvailablePort } from './oauth-flow.js';
import { ClaudeTokenStorage, ClaudeOAuthTokens } from './token-storage.js';
import { getErrorMessage } from '../../utils/errors.js';

/**
 * Enhanced OAuth manager configuration
 */
export interface EnhancedOAuthConfig extends Partial<ClaudeOAuthConfig> {
  autoRefresh?: boolean;
  tokenRefreshBuffer?: number; // Minutes before expiry to refresh
  maxRetries?: number;
  retryDelay?: number;
}

/**
 * OAuth authentication status
 */
export interface OAuthStatus {
  isAuthenticated: boolean;
  isExpired: boolean;
  expiresAt?: Date;
  hasRefreshToken: boolean;
  userEmail?: string;
  scopes?: string[];
  tokenSource?: string;
}

/**
 * Enhanced OAuth manager for Claude authentication
 * Combines OAuth flow, token storage, and automatic refresh capabilities
 */
export class EnhancedAnthropicOAuthManager {
  private readonly config: EnhancedOAuthConfig;
  private readonly tokenStorage: ClaudeTokenStorage;
  private tokens: ClaudeOAuthTokens | null = null;
  private refreshPromise: Promise<void> | null = null;

  // Default configuration
  private static readonly DEFAULT_CONFIG: EnhancedOAuthConfig = {
    clientId: 'ouroboros-code-cli',
    authorizeUrl: 'https://console.anthropic.com/oauth/authorize',
    tokenUrl: 'https://api.anthropic.com/oauth/token',
    revokeUrl: 'https://api.anthropic.com/oauth/revoke',
    callbackPort: 54545,
    timeout: 300000, // 5 minutes
    scopes: [
      'profile',
      'email',
      'claude_code:read',
      'claude_code:write',
      'claude_code:execute',
      'tools:read',
      'tools:write',
      'workspace:read'
    ],
    autoRefresh: true,
    tokenRefreshBuffer: 5, // Refresh 5 minutes before expiry
    maxRetries: 3,
    retryDelay: 1000 // 1 second
  };

  constructor(config: EnhancedOAuthConfig = {}) {
    this.config = {
      ...EnhancedAnthropicOAuthManager.DEFAULT_CONFIG,
      ...config
    };
    
    this.tokenStorage = new ClaudeTokenStorage();
  }

  /**
   * Initialize the OAuth manager
   * Loads existing tokens and validates them
   */
  async initialize(): Promise<void> {
    try {
      // Load tokens from storage
      this.tokens = await this.tokenStorage.loadTokens();
      
      if (this.tokens) {
        console.log(`[OAuth Manager] Loaded existing tokens`);
        
        // Check if tokens need refresh
        if (this.config.autoRefresh && this.needsRefresh()) {
          console.log(`[OAuth Manager] Tokens need refresh, starting automatic refresh`);
          await this.refreshAccessToken();
        }
      } else {
        console.log(`[OAuth Manager] No existing tokens found`);
      }
    } catch (error) {
      console.error(`[OAuth Manager] Failed to initialize:`, error);
      throw new Error(`OAuth manager initialization failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Start the OAuth authentication flow
   * 
   * @param noBrowser - If true, won't attempt to open browser automatically
   * @returns Authorization URL for manual browser opening
   */
  async authenticate(noBrowser: boolean = false): Promise<string> {
    try {
      // Find available port if default is in use
      const port = await findAvailablePort(this.config.callbackPort!);
      if (port !== this.config.callbackPort) {
        console.log(`[OAuth Manager] Port ${this.config.callbackPort} in use, using ${port}`);
      }

      // Create OAuth flow with actual port
      const oauthFlow = new ClaudeOAuthFlow({
        ...this.config,
        callbackPort: port
      });

      // Start auth flow
      const { authUrl, flowPromise } = await oauthFlow.startAuthFlow();
      
      console.log(`[OAuth Manager] OAuth flow started`);
      console.log(`[OAuth Manager] Authorization URL: ${authUrl}`);
      
      if (!noBrowser) {
        // Try to open browser automatically
        try {
          const open = await import('open');
          await open.default(authUrl);
          console.log(`[OAuth Manager] Browser opened for authentication`);
        } catch (error) {
          console.warn(`[OAuth Manager] Could not open browser automatically:`, error);
          console.log(`[OAuth Manager] Please open the URL manually: ${authUrl}`);
        }
      }

      // Wait for flow completion
      const result = await flowPromise;
      
      // Convert OAuth response to our token format
      const tokens: ClaudeOAuthTokens = {
        access_token: result.tokens.access_token,
        refresh_token: result.tokens.refresh_token,
        expires_in: result.tokens.expires_in,
        expires_at: result.tokens.expires_in ? 
          Date.now() + result.tokens.expires_in * 1000 : undefined,
        token_type: result.tokens.token_type || 'Bearer',
        scope: result.tokens.scope,
        created_at: Date.now()
      };

      // Save tokens
      await this.tokenStorage.saveTokens(tokens);
      this.tokens = tokens;

      console.log(`[OAuth Manager] Authentication successful`);
      return authUrl;
    } catch (error) {
      console.error(`[OAuth Manager] Authentication failed:`, error);
      throw new Error(`OAuth authentication failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Get current access token, refreshing if necessary
   */
  async getAccessToken(): Promise<string> {
    if (!this.tokens) {
      throw new Error('Not authenticated. Please run authentication first.');
    }

    // Check if token needs refresh and auto-refresh is enabled
    if (this.config.autoRefresh && this.needsRefresh()) {
      await this.refreshAccessToken();
    }

    if (!this.tokens.access_token) {
      throw new Error('No valid access token available');
    }

    return this.tokens.access_token;
  }

  /**
   * Refresh the access token using refresh token
   */
  async refreshAccessToken(): Promise<void> {
    // Prevent concurrent refresh attempts
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    if (!this.tokens?.refresh_token) {
      throw new Error('Cannot refresh token: no refresh token available');
    }

    this.refreshPromise = this.doRefreshToken();
    
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  /**
   * Perform the actual token refresh with retries
   */
  private async doRefreshToken(): Promise<void> {
    const maxRetries = this.config.maxRetries!;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[OAuth Manager] Refreshing token (attempt ${attempt}/${maxRetries})`);
        
        const response = await fetch(this.config.tokenUrl!, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: this.tokens!.refresh_token!,
            client_id: this.config.clientId!,
            ...(this.config.clientSecret && { client_secret: this.config.clientSecret })
          }).toString(),
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorInfo;
          try {
            errorInfo = JSON.parse(errorText);
          } catch {
            errorInfo = { error: 'unknown', error_description: errorText };
          }
          
          throw new Error(`Token refresh failed: ${errorInfo.error} - ${errorInfo.error_description}`);
        }

        const newTokens: OAuthTokenResponse = await response.json();
        
        // Update tokens
        const updatedTokens: ClaudeOAuthTokens = {
          ...this.tokens!,
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token || this.tokens!.refresh_token,
          expires_in: newTokens.expires_in,
          expires_at: newTokens.expires_in ? 
            Date.now() + newTokens.expires_in * 1000 : undefined,
          token_type: newTokens.token_type || this.tokens!.token_type,
          scope: newTokens.scope || this.tokens!.scope,
          created_at: Date.now()
        };

        // Save updated tokens
        await this.tokenStorage.saveTokens(updatedTokens);
        this.tokens = updatedTokens;

        console.log(`[OAuth Manager] Token refresh successful`);
        return;
        
      } catch (error) {
        lastError = error as Error;
        console.warn(`[OAuth Manager] Token refresh attempt ${attempt} failed:`, error);
        
        if (attempt < maxRetries) {
          const delay = this.config.retryDelay! * attempt; // Exponential backoff
          console.log(`[OAuth Manager] Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`Token refresh failed after ${maxRetries} attempts: ${lastError?.message}`);
  }

  /**
   * Revoke current tokens
   */
  async revokeTokens(): Promise<void> {
    if (!this.tokens) {
      console.log(`[OAuth Manager] No tokens to revoke`);
      return;
    }

    try {
      const oauthFlow = new ClaudeOAuthFlow(this.config);
      
      // Revoke access token
      if (this.tokens.access_token) {
        await oauthFlow.revokeToken(this.tokens.access_token, 'access_token');
      }
      
      // Revoke refresh token if available
      if (this.tokens.refresh_token) {
        await oauthFlow.revokeToken(this.tokens.refresh_token, 'refresh_token');
      }
      
      console.log(`[OAuth Manager] Tokens revoked successfully`);
    } catch (error) {
      console.warn(`[OAuth Manager] Token revocation failed:`, error);
      // Continue with local cleanup even if revocation fails
    }

    // Clear local tokens
    await this.clearTokens();
  }

  /**
   * Clear stored tokens
   */
  async clearTokens(): Promise<void> {
    this.tokens = null;
    await this.tokenStorage.clearTokens();
    console.log(`[OAuth Manager] Tokens cleared locally`);
  }

  /**
   * Check if tokens need refresh
   */
  private needsRefresh(): boolean {
    if (!this.tokens?.expires_at) {
      return false; // No expiry info, assume valid
    }

    const bufferTime = (this.config.tokenRefreshBuffer! * 60 * 1000); // Convert minutes to ms
    return Date.now() + bufferTime >= this.tokens.expires_at;
  }

  /**
   * Get current OAuth status
   */
  async getStatus(): Promise<OAuthStatus> {
    await this.initialize();

    if (!this.tokens) {
      return {
        isAuthenticated: false,
        isExpired: true,
        hasRefreshToken: false
      };
    }

    const isExpired = this.tokenStorage.isExpired(this.tokens);
    const expiresAt = this.tokenStorage.getTokenExpiry(this.tokens);

    return {
      isAuthenticated: true,
      isExpired,
      expiresAt: expiresAt || undefined,
      hasRefreshToken: !!this.tokens.refresh_token,
      userEmail: this.tokens.user_email,
      scopes: this.tokens.scope?.split(' '),
      tokenSource: 'ouroboros' // Could be enhanced to show actual source
    };
  }

  /**
   * Import tokens from another location
   */
  async importTokens(fromPath: string): Promise<void> {
    await this.tokenStorage.migrateTokens(fromPath);
    
    // Reload tokens after migration
    this.tokens = await this.tokenStorage.loadTokens();
    console.log(`[OAuth Manager] Tokens imported successfully`);
  }

  /**
   * Get storage status information
   */
  async getStorageStatus() {
    return await this.tokenStorage.getStorageStatus();
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.tokens !== null && !!this.tokens.access_token;
  }

  /**
   * Check if tokens are expired
   */
  isExpired(): boolean {
    if (!this.tokens) return true;
    return this.tokenStorage.isExpired(this.tokens);
  }

  /**
   * Get token expiry date
   */
  getTokenExpiry(): Date | null {
    if (!this.tokens) return null;
    return this.tokenStorage.getTokenExpiry(this.tokens);
  }

  /**
   * Get current configuration
   */
  getConfig(): EnhancedOAuthConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<EnhancedOAuthConfig>): void {
    Object.assign(this.config, newConfig);
  }
}