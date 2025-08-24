/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Storage } from '../../config/storage.js';
import { getErrorMessage } from '../../utils/errors.js';

/**
 * Claude OAuth token structure
 */
export interface ClaudeOAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number; // Seconds until expiration (from OAuth response)
  token_type?: string;
  scope?: string;
}

/**
 * Claude credentials file structure (from ~/.claude/.credentials.json)
 */
export interface ClaudeCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  email?: string;
  subscription?: string;
}

/**
 * OAuth configuration for Anthropic/Claude
 */
export interface AnthropicOAuthConfig {
  useOAuth?: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  credentialsPath?: string; // Path to Claude credentials file
  autoRefresh?: boolean;
}

/**
 * Manages OAuth authentication for Anthropic/Claude
 */
export class AnthropicOAuthManager {
  private config: AnthropicOAuthConfig;
  private tokens: ClaudeOAuthTokens | null = null;
  private credentialsPath: string;
  
  // Claude-specific OAuth endpoints (hypothetical - actual endpoints would need discovery)
  // private readonly CLAUDE_TOKEN_URL = 'https://claude.ai/api/oauth/token';
  private readonly CLAUDE_REFRESH_URL = 'https://claude.ai/api/oauth/refresh';
  
  constructor(config: AnthropicOAuthConfig = {}) {
    this.config = config;
    // Default to Claude's standard credentials location
    this.credentialsPath = config.credentialsPath || 
      path.join(os.homedir(), '.claude', '.credentials.json');
  }

  /**
   * Initialize OAuth authentication
   */
  async initialize(): Promise<void> {
    // Try to load tokens from various sources
    if (this.config.accessToken) {
      // Use provided tokens
      this.tokens = {
        access_token: this.config.accessToken,
        refresh_token: this.config.refreshToken,
        expires_at: this.config.expiresAt,
      };
    } else {
      // Try to load from Claude credentials file or cached tokens
      await this.loadStoredCredentials();
    }

    // Check if tokens need refresh
    if (this.config.autoRefresh && this.needsRefresh()) {
      await this.refreshAccessToken();
    }
  }

  /**
   * Get the current access token, refreshing if necessary
   */
  async getAccessToken(): Promise<string> {
    if (!this.tokens) {
      console.log('[OAuth Manager] No tokens in memory, initializing...');
      await this.initialize();
    }

    if (!this.tokens?.access_token) {
      throw new Error('No OAuth access token available. Please authenticate with Claude first.');
    }

    // Log token info (first 10 chars only for security)
    console.log('[OAuth Manager] Access token found:', {
      tokenPrefix: this.tokens.access_token.substring(0, 10) + '...',
      hasRefreshToken: !!this.tokens.refresh_token,
      expiresAt: this.tokens.expires_at,
      needsRefresh: this.needsRefresh(),
    });

    // Auto-refresh if enabled and needed
    if (this.config.autoRefresh && this.needsRefresh()) {
      console.log('[OAuth Manager] Token needs refresh, refreshing...');
      await this.refreshAccessToken();
    }

    return this.tokens.access_token;
  }

  /**
   * Load stored credentials from file system
   */
  private async loadStoredCredentials(): Promise<void> {
    const pathsToTry = [
      this.credentialsPath, // Claude's default location
      Storage.getAnthropicOAuthPath(), // Our storage location
      path.join(Storage.getConfigDir(), 'anthropic-oauth.json'), // Alternative location
    ];

    console.log('[OAuth Manager] Looking for credentials in:', pathsToTry);

    for (const credPath of pathsToTry) {
      try {
        const content = await fs.readFile(credPath, 'utf-8');
        const credentials = JSON.parse(content);
        
        console.log('[OAuth Manager] Found credentials file at:', credPath);
        console.log('[OAuth Manager] Credential structure:', {
          hasAccessToken: !!(credentials.accessToken || credentials.access_token),
          hasRefreshToken: !!(credentials.refreshToken || credentials.refresh_token),
          hasExpiresAt: !!(credentials.expiresAt || credentials.expires_at),
          keys: Object.keys(credentials),
        });
        
        // Handle different credential formats
        if (credentials.accessToken || credentials.access_token) {
          this.tokens = {
            access_token: credentials.accessToken || credentials.access_token,
            refresh_token: credentials.refreshToken || credentials.refresh_token,
            expires_at: credentials.expiresAt || credentials.expires_at,
          };
          
          console.log(`[OAuth Manager] Successfully loaded Claude OAuth credentials from ${credPath}`);
          return;
        }
      } catch (error) {
        console.log(`[OAuth Manager] Could not read ${credPath}:`, (error as Error).message);
        // Continue to next path
        continue;
      }
    }
    
    console.log('[OAuth Manager] No stored credentials found in any location');
    throw new Error('No OAuth credentials found. Please authenticate with Claude first or use API key authentication.');
  }

  /**
   * Save credentials to storage
   */
  async saveCredentials(): Promise<void> {
    if (!this.tokens) {
      return;
    }

    const storagePath = Storage.getAnthropicOAuthPath();
    await fs.mkdir(path.dirname(storagePath), { recursive: true });
    
    const credentials: ClaudeCredentials = {
      accessToken: this.tokens.access_token,
      refreshToken: this.tokens.refresh_token,
      expiresAt: this.tokens.expires_at,
    };

    await fs.writeFile(
      storagePath,
      JSON.stringify(credentials, null, 2),
      { mode: 0o600 } // Secure file permissions
    );
  }

  /**
   * Check if token needs refresh
   */
  private needsRefresh(): boolean {
    if (!this.tokens?.expires_at) {
      return false; // No expiry info, assume valid
    }

    // Refresh if token expires in less than 5 minutes
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    return Date.now() + bufferTime >= this.tokens.expires_at;
  }

  /**
   * Refresh the access token using refresh token
   */
  async refreshAccessToken(): Promise<void> {
    if (!this.tokens?.refresh_token) {
      throw new Error('No refresh token available for OAuth token refresh');
    }

    try {
      // Note: This is a hypothetical implementation
      // Actual Claude OAuth refresh would need proper endpoint discovery
      const response = await fetch(this.CLAUDE_REFRESH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: this.tokens.refresh_token,
        }),
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status} ${response.statusText}`);
      }

      const newTokens = await response.json() as ClaudeOAuthTokens;
      
      // Update tokens
      this.tokens = {
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token || this.tokens.refresh_token,
        expires_at: newTokens.expires_at || 
          (newTokens.expires_in ? Date.now() + newTokens.expires_in * 1000 : undefined),
      };

      // Save updated credentials
      await this.saveCredentials();
      
      console.log('Claude OAuth tokens refreshed successfully');
    } catch (error) {
      throw new Error(`Failed to refresh Claude OAuth tokens: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Import credentials from Claude CLI or web
   */
  async importClaudeCredentials(credentialsPath?: string): Promise<void> {
    const importPath = credentialsPath || this.credentialsPath;
    
    try {
      const content = await fs.readFile(importPath, 'utf-8');
      const credentials = JSON.parse(content);
      
      if (!credentials.accessToken && !credentials.access_token) {
        throw new Error('Invalid Claude credentials file: missing access token');
      }

      this.tokens = {
        access_token: credentials.accessToken || credentials.access_token,
        refresh_token: credentials.refreshToken || credentials.refresh_token,
        expires_at: credentials.expiresAt || credentials.expires_at,
      };

      // Save to our storage location
      await this.saveCredentials();
      
      console.log('Claude credentials imported successfully');
    } catch (error) {
      throw new Error(`Failed to import Claude credentials: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Clear stored OAuth credentials
   */
  async clearCredentials(): Promise<void> {
    this.tokens = null;
    
    try {
      await fs.rm(Storage.getAnthropicOAuthPath(), { force: true });
      console.log('Claude OAuth credentials cleared');
    } catch (error) {
      console.error('Failed to clear credentials:', error);
    }
  }

  /**
   * Check if OAuth is configured and valid
   */
  isConfigured(): boolean {
    return !!(this.tokens?.access_token);
  }

  /**
   * Get token expiry information
   */
  getTokenExpiry(): Date | null {
    if (!this.tokens?.expires_at) {
      return null;
    }
    return new Date(this.tokens.expires_at);
  }

  /**
   * Manual token update (for user-provided tokens)
   */
  async updateTokens(tokens: ClaudeOAuthTokens): Promise<void> {
    this.tokens = tokens;
    await this.saveCredentials();
  }
}