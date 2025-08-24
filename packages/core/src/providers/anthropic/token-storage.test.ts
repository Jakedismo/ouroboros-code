/**
 * @license
 * Copyright 2025 Ouroboros
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ClaudeTokenStorage, ClaudeOAuthTokens } from './token-storage.js';

// Mock the Storage class
vi.mock('../../config/storage.js', () => ({
  Storage: {
    getConfigDir: () => '/test/.ouroboros-code'
  }
}));

// Mock filesystem operations
vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return {
    ...actual,
    promises: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
      rm: vi.fn(),
    }
  };
});

vi.mock('node:os', () => ({
  homedir: () => '/test/home'
}));

const mockFs = fs as any;

describe('ClaudeTokenStorage', () => {
  let storage: ClaudeTokenStorage;

  beforeEach(() => {
    storage = new ClaudeTokenStorage();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct primary path', () => {
      expect(storage.getPrimaryPath()).toBe('/test/.ouroboros-code/claude-oauth-tokens.json');
    });

    it('should have correct storage locations', () => {
      const locations = storage.getStorageLocations();
      
      expect(locations).toHaveLength(3);
      expect(locations[0].path).toBe('/test/.ouroboros-code/claude-oauth-tokens.json');
      expect(locations[1].path).toBe('/test/home/.claude_code/tokens.json');
      expect(locations[2].path).toBe('/test/home/.claude/.credentials.json');
    });
  });

  describe('saveTokens', () => {
    const sampleTokens: ClaudeOAuthTokens = {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'claude_code:read claude_code:write',
    };

    it('should save tokens with metadata', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const startTime = Date.now();
      await storage.saveTokens(sampleTokens);
      const endTime = Date.now();

      expect(mockFs.mkdir).toHaveBeenCalledWith('/test/.ouroboros-code', { recursive: true });
      expect(mockFs.writeFile).toHaveBeenCalledTimes(1);

      const [filePath, content, options] = mockFs.writeFile.mock.calls[0];
      expect(filePath).toBe('/test/.ouroboros-code/claude-oauth-tokens.json');
      expect(options).toEqual({ mode: 0o600, encoding: 'utf8' });

      const savedTokens = JSON.parse(content);
      expect(savedTokens.access_token).toBe('test-access-token');
      expect(savedTokens.refresh_token).toBe('test-refresh-token');
      expect(savedTokens.created_at).toBeGreaterThanOrEqual(startTime);
      expect(savedTokens.created_at).toBeLessThanOrEqual(endTime);
      expect(savedTokens.expires_at).toBe(savedTokens.created_at + 3600 * 1000);
    });

    it('should handle write errors', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockRejectedValue(new Error('Permission denied'));

      await expect(storage.saveTokens(sampleTokens))
        .rejects.toThrow('Failed to save OAuth tokens: Permission denied');
    });
  });

  describe('loadTokens', () => {
    it('should load tokens from primary location', async () => {
      const sampleTokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_at: Date.now() + 3600 * 1000,
        token_type: 'Bearer',
        scope: 'claude_code:read',
        created_at: Date.now()
      };

      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(sampleTokens));

      const result = await storage.loadTokens();

      expect(result).toEqual(sampleTokens);
      expect(mockFs.readFile).toHaveBeenCalledWith(
        '/test/.ouroboros-code/claude-oauth-tokens.json',
        'utf8'
      );
    });

    it('should fallback to Python SDK location', async () => {
      const pythonSDKTokens = {
        access_token: 'python-sdk-token',
        refresh_token: 'python-refresh',
        expires_at: Date.now() + 3600 * 1000,
        token_type: 'Bearer',
        scope: 'claude_code:read'
      };

      mockFs.readFile
        .mockRejectedValueOnce({ code: 'ENOENT' }) // Primary location not found
        .mockResolvedValueOnce(JSON.stringify(pythonSDKTokens)); // Python SDK found

      const result = await storage.loadTokens();

      expect(result).toEqual({
        ...pythonSDKTokens,
        created_at: expect.any(Number)
      });
      expect(mockFs.readFile).toHaveBeenCalledWith(
        '/test/home/.claude_code/tokens.json',
        'utf8'
      );
    });

    it('should convert legacy credentials format', async () => {
      const legacyCredentials = {
        accessToken: 'legacy-access-token',
        refreshToken: 'legacy-refresh-token',
        expiresAt: Date.now() + 3600 * 1000,
        email: 'test@example.com'
      };

      mockFs.readFile
        .mockRejectedValueOnce({ code: 'ENOENT' }) // Primary not found
        .mockRejectedValueOnce({ code: 'ENOENT' }) // Python SDK not found
        .mockResolvedValueOnce(JSON.stringify(legacyCredentials)); // Legacy found

      const result = await storage.loadTokens();

      expect(result).toEqual({
        access_token: 'legacy-access-token',
        refresh_token: 'legacy-refresh-token',
        expires_at: legacyCredentials.expiresAt,
        token_type: 'Bearer',
        user_email: 'test@example.com',
        created_at: expect.any(Number)
      });
    });

    it('should return null when no tokens found anywhere', async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });

      const result = await storage.loadTokens();

      expect(result).toBeNull();
    });

    it('should return null for invalid token format', async () => {
      mockFs.readFile.mockResolvedValue('{"invalid": "data"}');

      const result = await storage.loadTokens();

      expect(result).toBeNull();
    });
  });

  describe('hasTokens', () => {
    it('should return true when tokens exist', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify({
        access_token: 'test-token'
      }));

      const result = await storage.hasTokens();

      expect(result).toBe(true);
    });

    it('should return false when no tokens exist', async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });

      const result = await storage.hasTokens();

      expect(result).toBe(false);
    });
  });

  describe('isExpired', () => {
    it('should return false when no expires_at', () => {
      const tokens: ClaudeOAuthTokens = {
        access_token: 'test-token'
      };

      const result = storage.isExpired(tokens);

      expect(result).toBe(false);
    });

    it('should return true when expired', () => {
      const tokens: ClaudeOAuthTokens = {
        access_token: 'test-token',
        expires_at: Date.now() - 1000 // 1 second ago
      };

      const result = storage.isExpired(tokens);

      expect(result).toBe(true);
    });

    it('should return true when expiring soon (within buffer)', () => {
      const tokens: ClaudeOAuthTokens = {
        access_token: 'test-token',
        expires_at: Date.now() + 2 * 60 * 1000 // 2 minutes from now (within 5 min buffer)
      };

      const result = storage.isExpired(tokens);

      expect(result).toBe(true);
    });

    it('should return false when not expired', () => {
      const tokens: ClaudeOAuthTokens = {
        access_token: 'test-token',
        expires_at: Date.now() + 10 * 60 * 1000 // 10 minutes from now
      };

      const result = storage.isExpired(tokens);

      expect(result).toBe(false);
    });
  });

  describe('getTokenExpiry', () => {
    it('should return Date when expires_at is set', () => {
      const expiryTime = Date.now() + 3600 * 1000;
      const tokens: ClaudeOAuthTokens = {
        access_token: 'test-token',
        expires_at: expiryTime
      };

      const result = storage.getTokenExpiry(tokens);

      expect(result).toEqual(new Date(expiryTime));
    });

    it('should return null when no expires_at', () => {
      const tokens: ClaudeOAuthTokens = {
        access_token: 'test-token'
      };

      const result = storage.getTokenExpiry(tokens);

      expect(result).toBeNull();
    });
  });

  describe('clearTokens', () => {
    it('should remove tokens file', async () => {
      mockFs.rm.mockResolvedValue(undefined);

      await storage.clearTokens();

      expect(mockFs.rm).toHaveBeenCalledWith(
        '/test/.ouroboros-code/claude-oauth-tokens.json',
        { force: true }
      );
    });

    it('should handle removal errors gracefully', async () => {
      mockFs.rm.mockRejectedValue(new Error('Permission denied'));

      await expect(storage.clearTokens())
        .rejects.toThrow('Failed to clear OAuth tokens: Permission denied');
    });
  });

  describe('getStorageStatus', () => {
    it('should return status for all locations', async () => {
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify({ access_token: 'token1' })) // Primary
        .mockRejectedValueOnce({ code: 'ENOENT' }) // Python SDK
        .mockResolvedValueOnce(JSON.stringify({ accessToken: 'token2' })); // Legacy

      const result = await storage.getStorageStatus();

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        path: '/test/.ouroboros-code/claude-oauth-tokens.json',
        name: 'Ouroboros OAuth',
        description: 'Ouroboros OAuth token storage',
        writable: true,
        format: 'ouroboros',
        hasTokens: true
      });
      expect(result[1]).toEqual({
        path: '/test/home/.claude_code/tokens.json',
        name: 'Python SDK',
        description: 'Claude Code SDK Python token storage',
        writable: false,
        format: 'python_sdk',
        hasTokens: false
      });
      expect(result[2]).toEqual({
        path: '/test/home/.claude/.credentials.json',
        name: 'Legacy Claude',
        description: 'Legacy Claude CLI credentials',
        writable: false,
        format: 'legacy',
        hasTokens: true
      });
    });

    it('should include error information', async () => {
      mockFs.readFile.mockRejectedValue(new Error('Permission denied'));

      const result = await storage.getStorageStatus();

      result.forEach(location => {
        expect(location.hasTokens).toBe(false);
        expect(location.error).toBe('Permission denied');
      });
    });
  });
});