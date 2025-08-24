/**
 * @license
 * Copyright 2025 Ouroboros
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Storage } from '../../config/storage.js';
import { getErrorMessage } from '../../utils/errors.js';

/**
 * Claude OAuth tokens structure
 */
export interface ClaudeOAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number; // Seconds until expiration (from OAuth response)
  expires_at?: number; // Absolute expiration timestamp
  token_type?: string;
  scope?: string;
  
  // Additional metadata
  created_at?: number; // When tokens were created/updated
  user_email?: string; // Associated user email if available
  user_id?: string; // Associated user ID if available
}

/**
 * Legacy Claude credentials format (from ~/.claude/.credentials.json)
 */
export interface LegacyClaudeCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  email?: string;
  subscription?: string;
}

/**
 * Python SDK token format (from ~/.claude_code/tokens.json)
 */
export interface PythonSDKTokens {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  token_type?: string;
  scope?: string;
}

/**
 * Token storage locations with priorities
 */
export interface TokenStorageLocation {
  path: string;
  name: string;
  description: string;
  writable: boolean;
  format: 'ouroboros' | 'legacy' | 'python_sdk';
}

/**
 * Manages secure storage and retrieval of Claude OAuth tokens
 */
export class ClaudeTokenStorage {
  private readonly primaryPath: string;
  private readonly storageLocations: TokenStorageLocation[];

  constructor() {
    // Primary storage location for Ouroboros
    this.primaryPath = path.join(Storage.getConfigDir(), 'claude-oauth-tokens.json');
    
    // Define all possible storage locations in priority order
    this.storageLocations = [
      {
        path: this.primaryPath,
        name: 'Ouroboros OAuth',
        description: 'Ouroboros OAuth token storage',
        writable: true,
        format: 'ouroboros'
      },
      {
        path: path.join(os.homedir(), '.claude_code', 'tokens.json'),
        name: 'Python SDK',
        description: 'Claude Code SDK Python token storage',
        writable: false, // Read-only to avoid conflicts
        format: 'python_sdk'
      },
      {
        path: path.join(os.homedir(), '.claude', '.credentials.json'),
        name: 'Legacy Claude',
        description: 'Legacy Claude CLI credentials',
        writable: false, // Read-only to avoid conflicts
        format: 'legacy'
      }
    ];
  }

  /**
   * Save tokens to primary storage location
   */
  async saveTokens(tokens: ClaudeOAuthTokens): Promise<void> {
    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(this.primaryPath), { recursive: true });

      // Add metadata
      const tokensWithMetadata: ClaudeOAuthTokens = {
        ...tokens,
        created_at: Date.now(),
        // Calculate expires_at if not provided but expires_in is available
        expires_at: tokens.expires_at || 
                   (tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined)
      };

      // Write tokens with secure permissions
      const tokenJson = JSON.stringify(tokensWithMetadata, null, 2);
      await fs.writeFile(this.primaryPath, tokenJson, { 
        mode: 0o600, // Owner read/write only
        encoding: 'utf8'
      });

      console.log(`[Token Storage] Tokens saved to ${this.primaryPath}`);
    } catch (error) {
      throw new Error(`Failed to save OAuth tokens: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Load tokens from any available location
   */
  async loadTokens(): Promise<ClaudeOAuthTokens | null> {
    for (const location of this.storageLocations) {
      try {
        const tokens = await this.loadFromLocation(location);
        if (tokens) {
          console.log(`[Token Storage] Loaded tokens from ${location.name}`);
          
          // If loaded from non-primary location, optionally migrate to primary
          if (location.path !== this.primaryPath) {
            console.log(`[Token Storage] Consider migrating tokens to primary location`);
          }
          
          return tokens;
        }
      } catch (error) {
        console.log(`[Token Storage] Could not load from ${location.name}: ${(error as Error).message}`);
        // Continue to next location
      }
    }

    console.log('[Token Storage] No tokens found in any location');
    return null;
  }

  /**
   * Load tokens from a specific location
   */
  private async loadFromLocation(location: TokenStorageLocation): Promise<ClaudeOAuthTokens | null> {
    try {
      const content = await fs.readFile(location.path, 'utf8');
      const parsed = JSON.parse(content);

      // Convert based on format
      switch (location.format) {
        case 'ouroboros':
          return this.validateOuroborosTokens(parsed);
        case 'python_sdk':
          return this.convertPythonSDKTokens(parsed);
        case 'legacy':
          return this.convertLegacyTokens(parsed);
        default:
          throw new Error(`Unknown token format: ${location.format}`);
      }
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return null; // File doesn't exist
      }
      throw error;
    }
  }

  /**
   * Validate and normalize Ouroboros token format
   */
  private validateOuroborosTokens(data: any): ClaudeOAuthTokens | null {
    if (!data || typeof data !== 'object') {
      return null;
    }

    if (!data.access_token || typeof data.access_token !== 'string') {
      return null;
    }

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      expires_at: data.expires_at,
      token_type: data.token_type || 'Bearer',
      scope: data.scope,
      created_at: data.created_at,
      user_email: data.user_email,
      user_id: data.user_id
    };
  }

  /**
   * Convert Python SDK token format to Ouroboros format
   */
  private convertPythonSDKTokens(data: any): ClaudeOAuthTokens | null {
    if (!data || typeof data !== 'object') {
      return null;
    }

    if (!data.access_token || typeof data.access_token !== 'string') {
      return null;
    }

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      token_type: data.token_type || 'Bearer',
      scope: data.scope,
      created_at: Date.now() // Add current timestamp as fallback
    };
  }

  /**
   * Convert legacy Claude credentials to OAuth token format
   */
  private convertLegacyTokens(data: any): ClaudeOAuthTokens | null {
    if (!data || typeof data !== 'object') {
      return null;
    }

    const accessToken = data.accessToken || data.access_token;
    if (!accessToken || typeof accessToken !== 'string') {
      return null;
    }

    return {
      access_token: accessToken,
      refresh_token: data.refreshToken || data.refresh_token,
      expires_at: data.expiresAt || data.expires_at,
      token_type: 'Bearer',
      user_email: data.email,
      created_at: Date.now()
    };
  }

  /**
   * Check if tokens exist in any location
   */
  async hasTokens(): Promise<boolean> {
    const tokens = await this.loadTokens();
    return tokens !== null;
  }

  /**
   * Check if tokens are expired
   */
  isExpired(tokens: ClaudeOAuthTokens): boolean {
    if (!tokens.expires_at) {
      return false; // No expiry info, assume valid
    }

    // Add 5-minute buffer for token refresh
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    return Date.now() + bufferTime >= tokens.expires_at;
  }

  /**
   * Get token expiry information
   */
  getTokenExpiry(tokens: ClaudeOAuthTokens): Date | null {
    if (!tokens.expires_at) {
      return null;
    }
    return new Date(tokens.expires_at);
  }

  /**
   * Clear tokens from primary storage
   */
  async clearTokens(): Promise<void> {
    try {
      await fs.rm(this.primaryPath, { force: true });
      console.log('[Token Storage] Tokens cleared from primary storage');
    } catch (error) {
      throw new Error(`Failed to clear OAuth tokens: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Migrate tokens from another location to primary storage
   */
  async migrateTokens(fromPath: string): Promise<void> {
    const location = this.storageLocations.find(loc => loc.path === fromPath);
    if (!location) {
      throw new Error(`Unknown token location: ${fromPath}`);
    }

    const tokens = await this.loadFromLocation(location);
    if (!tokens) {
      throw new Error(`No tokens found at ${fromPath}`);
    }

    await this.saveTokens(tokens);
    console.log(`[Token Storage] Migrated tokens from ${location.name} to primary storage`);
  }

  /**
   * List all available token storage locations and their status
   */
  async getStorageStatus(): Promise<Array<TokenStorageLocation & { hasTokens: boolean; error?: string }>> {
    const results = [];

    for (const location of this.storageLocations) {
      try {
        const tokens = await this.loadFromLocation(location);
        results.push({
          ...location,
          hasTokens: tokens !== null
        });
      } catch (error) {
        results.push({
          ...location,
          hasTokens: false,
          error: getErrorMessage(error)
        });
      }
    }

    return results;
  }

  /**
   * Get primary storage path
   */
  getPrimaryPath(): string {
    return this.primaryPath;
  }

  /**
   * Get all storage locations
   */
  getStorageLocations(): TokenStorageLocation[] {
    return [...this.storageLocations];
  }
}