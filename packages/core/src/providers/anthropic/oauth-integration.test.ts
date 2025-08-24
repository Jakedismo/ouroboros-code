/**
 * @license
 * Copyright 2025 Ouroboros
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EnhancedAnthropicOAuthManager } from './oauth-manager-enhanced.js';
import { ClaudeOAuthFlow } from './oauth-flow.js';
import { ClaudeTokenStorage } from './token-storage.js';

// Mock the OAuth flow
vi.mock('./oauth-flow.js', () => ({
  ClaudeOAuthFlow: vi.fn(),
  findAvailablePort: vi.fn().mockResolvedValue(54545)
}));

// Mock token storage
vi.mock('./token-storage.js', () => ({
  ClaudeTokenStorage: vi.fn()
}));

// Mock fetch for token refresh
global.fetch = vi.fn();

describe('OAuth Integration Tests', () => {
  let manager: EnhancedAnthropicOAuthManager;
  let mockOAuthFlow: any;
  let mockTokenStorage: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock OAuth flow
    mockOAuthFlow = {
      startAuthFlow: vi.fn(),
      exchangeCodeForTokens: vi.fn(),
      revokeToken: vi.fn(),
      cleanup: vi.fn()
    };
    (ClaudeOAuthFlow as any).mockImplementation(() => mockOAuthFlow);

    // Setup mock token storage
    mockTokenStorage = {
      loadTokens: vi.fn(),
      saveTokens: vi.fn(),
      clearTokens: vi.fn(),
      isExpired: vi.fn(),
      getTokenExpiry: vi.fn(),
      getStorageStatus: vi.fn(),
      migrateTokens: vi.fn()
    };
    (ClaudeTokenStorage as any).mockImplementation(() => mockTokenStorage);

    manager = new EnhancedAnthropicOAuthManager({
      clientId: 'test-client',
      autoRefresh: true
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('authentication flow', () => {
    it('should complete full OAuth authentication flow', async () => {
      const mockTokens = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'claude_code:read claude_code:write'
      };

      const mockFlowResult = {
        tokens: mockTokens,
        state: 'test-state'
      };

      mockOAuthFlow.startAuthFlow.mockResolvedValue({
        authUrl: 'https://console.anthropic.com/oauth/authorize?...',
        flowPromise: Promise.resolve(mockFlowResult)
      });

      mockTokenStorage.loadTokens.mockResolvedValue(null); // No existing tokens

      const authUrl = await manager.authenticate(true); // noBrowser = true

      expect(authUrl).toBe('https://console.anthropic.com/oauth/authorize?...');
      expect(mockOAuthFlow.startAuthFlow).toHaveBeenCalled();
      expect(mockTokenStorage.saveTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          token_type: 'Bearer',
          scope: 'claude_code:read claude_code:write'
        })
      );
    });

    it('should handle authentication errors gracefully', async () => {
      mockOAuthFlow.startAuthFlow.mockRejectedValue(new Error('Port in use'));
      mockTokenStorage.loadTokens.mockResolvedValue(null);

      await expect(manager.authenticate(true))
        .rejects.toThrow('OAuth authentication failed: Port in use');
    });
  });

  describe('token refresh', () => {
    it('should refresh tokens when needed', async () => {
      const existingTokens = {
        access_token: 'old-access-token',
        refresh_token: 'refresh-token',
        expires_at: Date.now() - 1000, // Expired
        token_type: 'Bearer'
      };

      const newTokens = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
        token_type: 'Bearer'
      };

      mockTokenStorage.loadTokens.mockResolvedValue(existingTokens);
      mockTokenStorage.isExpired.mockReturnValue(true);
      
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => newTokens
      });

      await manager.initialize();
      
      // Should have refreshed automatically during initialization
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String), // token URL
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded'
          }),
          body: expect.stringContaining('grant_type=refresh_token')
        })
      );

      expect(mockTokenStorage.saveTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token'
        })
      );
    });

    it('should handle refresh failures', async () => {
      // Create manager with autoRefresh disabled for this test
      const testManager = new EnhancedAnthropicOAuthManager({
        clientId: 'test-client',
        autoRefresh: false // Disable auto-refresh to control when refresh happens
      });

      const existingTokens = {
        access_token: 'old-access-token',
        refresh_token: 'refresh-token',
        expires_at: Date.now() - 1000,
        token_type: 'Bearer'
      };

      mockTokenStorage.loadTokens.mockResolvedValue(existingTokens);
      mockTokenStorage.isExpired.mockReturnValue(true);

      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Refresh token expired'
        })
      });

      // Initialize manager without auto-refresh
      await testManager.initialize();

      // Now manually trigger refresh which should fail
      await expect(testManager.refreshAccessToken())
        .rejects.toThrow('Token refresh failed after 3 attempts');
    });
  });

  describe('token management', () => {
    it('should get access token when valid', async () => {
      const validTokens = {
        access_token: 'valid-access-token',
        refresh_token: 'refresh-token',
        expires_at: Date.now() + 10 * 60 * 1000, // 10 minutes from now
        token_type: 'Bearer'
      };

      mockTokenStorage.loadTokens.mockResolvedValue(validTokens);
      mockTokenStorage.isExpired.mockReturnValue(false);

      await manager.initialize();
      const token = await manager.getAccessToken();

      expect(token).toBe('valid-access-token');
    });

    it('should throw error when not authenticated', async () => {
      mockTokenStorage.loadTokens.mockResolvedValue(null);

      await manager.initialize();

      await expect(manager.getAccessToken())
        .rejects.toThrow('Not authenticated. Please run authentication first.');
    });

    it('should revoke tokens', async () => {
      const tokens = {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_at: Date.now() + 3600 * 1000,
        token_type: 'Bearer'
      };

      mockTokenStorage.loadTokens.mockResolvedValue(tokens);
      await manager.initialize();

      await manager.revokeTokens();

      expect(mockOAuthFlow.revokeToken).toHaveBeenCalledWith('access-token', 'access_token');
      expect(mockOAuthFlow.revokeToken).toHaveBeenCalledWith('refresh-token', 'refresh_token');
      expect(mockTokenStorage.clearTokens).toHaveBeenCalled();
    });
  });

  describe('status reporting', () => {
    it('should report authentication status correctly', async () => {
      const tokens = {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_at: Date.now() + 3600 * 1000,
        token_type: 'Bearer',
        scope: 'claude_code:read claude_code:write',
        user_email: 'test@example.com'
      };

      mockTokenStorage.loadTokens.mockResolvedValue(tokens);
      mockTokenStorage.isExpired.mockReturnValue(false);
      mockTokenStorage.getTokenExpiry.mockReturnValue(new Date(tokens.expires_at));

      const status = await manager.getStatus();

      expect(status).toEqual({
        isAuthenticated: true,
        isExpired: false,
        expiresAt: new Date(tokens.expires_at),
        hasRefreshToken: true,
        userEmail: 'test@example.com',
        scopes: ['claude_code:read', 'claude_code:write'],
        tokenSource: 'ouroboros'
      });
    });

    it('should report not authenticated when no tokens', async () => {
      mockTokenStorage.loadTokens.mockResolvedValue(null);

      const status = await manager.getStatus();

      expect(status).toEqual({
        isAuthenticated: false,
        isExpired: true,
        hasRefreshToken: false
      });
    });
  });

  describe('token import', () => {
    it('should import tokens from specified path', async () => {
      const importPath = '/test/tokens.json';
      
      await manager.importTokens(importPath);

      expect(mockTokenStorage.migrateTokens).toHaveBeenCalledWith(importPath);
      expect(mockTokenStorage.loadTokens).toHaveBeenCalled();
    });

    it('should get storage status', async () => {
      const mockStatus = [
        { path: '/primary/path', hasTokens: true, name: 'Primary', format: 'ouroboros' as const },
        { path: '/legacy/path', hasTokens: false, name: 'Legacy', format: 'legacy' as const }
      ];

      mockTokenStorage.getStorageStatus.mockResolvedValue(mockStatus);

      const status = await manager.getStorageStatus();

      expect(status).toEqual(mockStatus);
      expect(mockTokenStorage.getStorageStatus).toHaveBeenCalled();
    });
  });
});