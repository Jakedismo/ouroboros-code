/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  ExtensionProviderRegistry,
  Extension,
  ProviderExtensionConfig,
  ExtensionConfig,
} from '@ouroboros/code-cli-core';
import { showProviderInfo, validateProvider } from './config.js';

// Mock console methods
const consoleSpy = {
  log: vi.spyOn(console, 'log').mockImplementation(() => {}),
  error: vi.spyOn(console, 'error').mockImplementation(() => {}),
};

describe('ExtensionProviderRegistry', () => {
  let registry: ExtensionProviderRegistry;
  
  beforeEach(() => {
    // Get fresh instance for each test
    registry = ExtensionProviderRegistry.getInstance();
    
    // Clear any existing providers
    registry.getAllProviders().clear();
    
    // Reset console spies
    consoleSpy.log.mockClear();
    consoleSpy.error.mockClear();
  });

  describe('provider registration', () => {
    it('should register a provider successfully', async () => {
      const extension: Extension = {
        path: '/test/ollama-extension',
        config: {
          name: 'ollama-provider',
          version: '1.0.0',
        } as ExtensionConfig,
        contextFiles: [],
      };

      const providerConfig: ProviderExtensionConfig = {
        type: 'local',
        displayName: 'Ollama Local LLM',
        description: 'Local inference with Ollama',
        entryPoint: 'dist/provider.js',
        defaultModel: 'llama3.1:8b',
        capabilities: {
          supportsStreaming: true,
          supportsTools: true,
          supportsFunctionCalling: true,
          supportsVision: false,
          supportsEmbedding: false,
          maxTokens: 4096,
          maxContextTokens: 32768,
          supportsSystemMessage: true,
          supportsToolChoice: true,
        },
      };

      await registry.registerProvider('ollama', extension, providerConfig);
      
      expect(registry.isProviderRegistered('ollama')).toBe(true);
      expect(registry.getAvailableProviderIds()).toContain('ollama');
    });

    it('should get provider info after registration', async () => {
      const extension: Extension = {
        path: '/test/ollama-extension',
        config: {
          name: 'ollama-provider',
          version: '1.0.0',
          description: 'Local LLM provider for Ollama',
        } as ExtensionConfig,
        contextFiles: [],
      };

      const providerConfig: ProviderExtensionConfig = {
        type: 'local',
        displayName: 'Ollama Local LLM',
        description: 'Local inference with Ollama',
        entryPoint: 'dist/provider.js',
        defaultModel: 'llama3.1:8b',
        capabilities: {
          supportsStreaming: true,
          supportsTools: true,
          supportsFunctionCalling: true,
          supportsVision: false,
          supportsEmbedding: false,
          maxTokens: 4096,
          maxContextTokens: 32768,
          supportsSystemMessage: true,
          supportsToolChoice: true,
        },
      };

      await registry.registerProvider('ollama', extension, providerConfig);
      
      const providerInfo = registry.getProvider('ollama');
      expect(providerInfo).toBeDefined();
      expect(providerInfo?.extension.config.name).toBe('ollama-provider');
      expect(providerInfo?.config.displayName).toBe('Ollama Local LLM');
    });

    it('should unregister a provider', async () => {
      const extension: Extension = {
        path: '/test/ollama-extension',
        config: {
          name: 'ollama-provider',
          version: '1.0.0',
        } as ExtensionConfig,
        contextFiles: [],
      };

      const providerConfig: ProviderExtensionConfig = {
        type: 'local',
        displayName: 'Ollama Local LLM',
        description: 'Local inference with Ollama',
        entryPoint: 'dist/provider.js',
        defaultModel: 'llama3.1:8b',
        capabilities: {
          supportsStreaming: true,
          supportsTools: true,
          supportsFunctionCalling: true,
          supportsVision: false,
          supportsEmbedding: false,
          maxTokens: 4096,
          maxContextTokens: 32768,
          supportsSystemMessage: true,
          supportsToolChoice: true,
        },
      };

      await registry.registerProvider('ollama', extension, providerConfig);
      expect(registry.isProviderRegistered('ollama')).toBe(true);

      await registry.unregisterProvider('ollama');
      expect(registry.isProviderRegistered('ollama')).toBe(false);
    });
  });

  describe('multiple providers', () => {
    it('should handle multiple providers from same extension', async () => {
      const extension: Extension = {
        path: '/test/multi-provider-extension',
        config: {
          name: 'multi-llm-provider',
          version: '1.0.0',
          providers: {
            'ollama': {
              type: 'local',
              displayName: 'Ollama',
              description: 'Ollama local models',
              entryPoint: 'dist/ollama.js',
              defaultModel: 'llama3.1:8b',
              capabilities: {
                supportsStreaming: true,
                supportsTools: true,
                supportsFunctionCalling: true,
                supportsVision: false,
                supportsEmbedding: false,
                maxTokens: 4096,
                maxContextTokens: 32768,
                supportsSystemMessage: true,
                supportsToolChoice: true,
              },
            },
            'vllm': {
              type: 'api',
              displayName: 'vLLM',
              description: 'vLLM high-performance inference',
              entryPoint: 'dist/vllm.js',
              defaultModel: 'meta-llama/Llama-3.1-8B-Instruct',
              capabilities: {
                supportsStreaming: true,
                supportsTools: true,
                supportsFunctionCalling: true,
                supportsVision: false,
                supportsEmbedding: false,
                maxTokens: 8192,
                maxContextTokens: 32768,
                supportsSystemMessage: true,
                supportsToolChoice: true,
              },
            },
          },
        } as ExtensionConfig,
        contextFiles: [],
      };

      await registry.registerProvidersFromExtensions([extension]);
      
      expect(registry.isProviderRegistered('ollama')).toBe(true);
      expect(registry.isProviderRegistered('vllm')).toBe(true);
      expect(registry.getAvailableProviderIds()).toContain('ollama');
      expect(registry.getAvailableProviderIds()).toContain('vllm');
    });
  });
});

describe('Provider validation and info', () => {
  beforeEach(() => {
    consoleSpy.log.mockClear();
    consoleSpy.error.mockClear();
  });

  describe('validateProvider', () => {
    it('should validate core providers', async () => {
      expect(await validateProvider('gemini')).toBe(true);
      expect(await validateProvider('openai')).toBe(true);
      expect(await validateProvider('anthropic')).toBe(true);
    });

    it('should reject invalid providers', async () => {
      expect(await validateProvider('invalid-provider')).toBe(false);
    });

    it('should validate extension providers when registered', async () => {
      const registry = ExtensionProviderRegistry.getInstance();
      const extension: Extension = {
        path: '/test/test-extension',
        config: {
          name: 'test-provider',
          version: '1.0.0',
        } as ExtensionConfig,
        contextFiles: [],
      };

      const providerConfig: ProviderExtensionConfig = {
        type: 'local',
        displayName: 'Test Provider',
        description: 'Test provider for validation',
        entryPoint: 'dist/provider.js',
        defaultModel: 'test-model',
        capabilities: {
          supportsStreaming: true,
          supportsTools: true,
          supportsFunctionCalling: true,
          supportsVision: false,
          supportsEmbedding: false,
          maxTokens: 4096,
          maxContextTokens: 32768,
          supportsSystemMessage: true,
          supportsToolChoice: true,
        },
      };

      await registry.registerProvider('test-provider', extension, providerConfig);
      
      expect(await validateProvider('test-provider')).toBe(true);
    });
  });

  describe('showProviderInfo', () => {
    it('should show core provider info', async () => {
      await showProviderInfo('gemini', []);
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('📋 Core Provider: gemini')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining("Google's Gemini AI models")
      );
    });

    it('should show extension provider info when registered', async () => {
      const registry = ExtensionProviderRegistry.getInstance();
      const extension: Extension = {
        path: '/test/ollama-extension',
        config: {
          name: 'ollama-provider',
          version: '1.0.0',
          description: 'Local LLM provider',
          author: 'Test Author',
        } as ExtensionConfig,
        contextFiles: [],
      };

      const providerConfig: ProviderExtensionConfig = {
        type: 'local',
        displayName: 'Ollama Local LLM',
        description: 'Local inference with Ollama',
        entryPoint: 'dist/provider.js',
        defaultModel: 'llama3.1:8b',
        capabilities: {
          supportsStreaming: true,
          supportsTools: true,
          supportsFunctionCalling: true,
          supportsVision: false,
          supportsEmbedding: false,
          maxTokens: 4096,
          maxContextTokens: 32768,
          supportsSystemMessage: true,
          supportsToolChoice: true,
        },
      };

      await registry.registerProvider('ollama', extension, providerConfig);
      
      await showProviderInfo('ollama', []);
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('🔌 Extension Provider: ollama')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('ollama-provider (v1.0.0)')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Ollama Local LLM')
      );
    });

    it('should show error for unknown provider', async () => {
      await showProviderInfo('unknown-provider', []);
      
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining("❌ Provider 'unknown-provider' not found")
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('📋 Core providers: gemini, openai, anthropic')
      );
    });
  });
});