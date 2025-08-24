/**
 * @license
 * Copyright 2025 Ouroboros (Originally Google LLC)
 * SPDX-License-Identifier: Apache-2.0
 */

import { EnhancedAnthropicOAuthManager, EnhancedOAuthConfig } from './oauth-manager-enhanced.js';
import { ClaudeOAuthTokens } from './token-storage.js';

/**
 * Legacy OAuth configuration for backward compatibility
 */
export interface AnthropicOAuthConfig {
  useOAuth?: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  credentialsPath?: string;
  autoRefresh?: boolean;
}

/**
 * Legacy AnthropicOAuthManager for backward compatibility
 * Wraps the enhanced OAuth manager to maintain existing API
 * 
 * @deprecated Use EnhancedAnthropicOAuthManager directly for new code
 */
export class AnthropicOAuthManager {
  private enhancedManager: EnhancedAnthropicOAuthManager;
  private config: AnthropicOAuthConfig;

  constructor(config: AnthropicOAuthConfig = {}) {
    this.config = config;
    
    // Convert legacy config to enhanced config
    const enhancedConfig: EnhancedOAuthConfig = {
      autoRefresh: config.autoRefresh ?? true,
      // If manual tokens provided, we can't do full OAuth flow
      // but we can store them for use
    };

    this.enhancedManager = new EnhancedAnthropicOAuthManager(enhancedConfig);
  }

  /**
   * Initialize OAuth authentication
   */
  async initialize(): Promise<void> {
    // If manual tokens were provided in config, use them
    if (this.config.accessToken) {
      const tokens: ClaudeOAuthTokens = {
        access_token: this.config.accessToken,
        refresh_token: this.config.refreshToken,
        expires_at: this.config.expiresAt,
        token_type: 'Bearer',
        created_at: Date.now()
      };
      
      // Save to storage for the enhanced manager to use
      const tokenStorage = await import('./token-storage.js');
      const storage = new tokenStorage.ClaudeTokenStorage();
      await storage.saveTokens(tokens);
    }

    // Initialize enhanced manager
    await this.enhancedManager.initialize();
  }

  /**
   * Get the current access token, refreshing if necessary
   */
  async getAccessToken(): Promise<string> {
    try {
      return await this.enhancedManager.getAccessToken();
    } catch (error) {
      // Legacy behavior - throw specific error message
      throw new Error('No OAuth access token available. Please authenticate with Claude first.');
    }
  }

  /**
   * Save credentials to storage
   * @deprecated Tokens are automatically saved by enhanced manager
   */
  async saveCredentials(): Promise<void> {
    // No-op - enhanced manager handles saving automatically
    console.log('[OAuth Manager] Credentials are automatically saved by enhanced manager');
  }

  /**
   * Refresh the access token using refresh token
   */
  async refreshAccessToken(): Promise<void> {
    await this.enhancedManager.refreshAccessToken();
  }

  /**
   * Import credentials from Claude CLI or web
   */
  async importClaudeCredentials(credentialsPath?: string): Promise<void> {
    if (credentialsPath) {
      await this.enhancedManager.importTokens(credentialsPath);
    } else {
      // Try to find credentials in standard locations
      const status = await this.enhancedManager.getStorageStatus();
      const legacyLocation = status.find(s => s.format === 'legacy' && s.hasTokens);
      const pythonSDKLocation = status.find(s => s.format === 'python_sdk' && s.hasTokens);
      
      if (legacyLocation) {
        await this.enhancedManager.importTokens(legacyLocation.path);
      } else if (pythonSDKLocation) {
        await this.enhancedManager.importTokens(pythonSDKLocation.path);
      } else {
        throw new Error('No Claude credentials found in standard locations');
      }
    }
  }

  /**
   * Clear stored OAuth credentials
   */
  async clearCredentials(): Promise<void> {
    await this.enhancedManager.clearTokens();
  }

  /**
   * Check if OAuth is configured and valid
   */
  isConfigured(): boolean {
    return this.enhancedManager.isAuthenticated();
  }

  /**
   * Get token expiry information
   */
  getTokenExpiry(): Date | null {
    return this.enhancedManager.getTokenExpiry();
  }

  /**
   * Manual token update (for user-provided tokens)
   */
  async updateTokens(tokens: ClaudeOAuthTokens): Promise<void> {
    // Save tokens using token storage
    const tokenStorage = await import('./token-storage.js');
    const storage = new tokenStorage.ClaudeTokenStorage();
    await storage.saveTokens(tokens);
    
    // Reinitialize manager to pick up new tokens
    await this.enhancedManager.initialize();
  }

  /**
   * Get enhanced manager instance for advanced features
   */
  getEnhancedManager(): EnhancedAnthropicOAuthManager {
    return this.enhancedManager;
  }
}

// Re-export types and new manager for convenience
export { ClaudeOAuthTokens } from './token-storage.js';
export { 
  EnhancedAnthropicOAuthManager, 
  EnhancedOAuthConfig,
  OAuthStatus 
} from './oauth-manager-enhanced.js';