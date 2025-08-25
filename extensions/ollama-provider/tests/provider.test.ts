/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaProvider } from '../src/provider.js';

// Mock the ollama module
vi.mock('ollama', () => ({
  Ollama: vi.fn().mockImplementation(() => ({
    list: vi.fn(),
    chat: vi.fn(),
    pull: vi.fn(),
    embeddings: vi.fn(),
  })),
}));

describe('OllamaProvider', () => {
  let provider: OllamaProvider;
  let mockOllamaClient: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Mock Ollama client
    const { Ollama } = await import('ollama');
    mockOllamaClient = {
      list: vi.fn(),
      chat: vi.fn(),
      pull: vi.fn(),
      embeddings: vi.fn(),
    };
    
    vi.mocked(Ollama).mockImplementation(() => mockOllamaClient);
    
    provider = new OllamaProvider({
      model: 'llama3.1:8b',
      baseUrl: 'http://localhost:11434',
      pullOnDemand: true,
      temperature: 0.7,
    });
  });

  describe('initialization', () => {
    it('should initialize successfully when Ollama is available', async () => {
      mockOllamaClient.list.mockResolvedValue({
        models: [
          { name: 'llama3.1:8b', size: 4700000000 },
          { name: 'codellama:7b', size: 3800000000 },
        ]
      });

      await provider.initialize();
      
      expect(mockOllamaClient.list).toHaveBeenCalled();
    });

    it('should throw error when Ollama is not available', async () => {
      mockOllamaClient.list.mockRejectedValue(new Error('Connection failed'));

      await expect(provider.initialize()).rejects.toThrow('Failed to initialize Ollama provider');
    });
  });

  describe('getAvailableModels', () => {
    it('should return list of available models', async () => {
      mockOllamaClient.list.mockResolvedValue({
        models: [
          { name: 'llama3.1:8b' },
          { name: 'codellama:7b' },
          { name: 'phi3:mini' },
        ]
      });

      const models = await provider.getAvailableModels();
      
      expect(models).toEqual(['llama3.1:8b', 'codellama:7b', 'phi3:mini']);
    });
  });

  describe('chat', () => {
    beforeEach(async () => {
      // Setup available models
      mockOllamaClient.list.mockResolvedValue({
        models: [{ name: 'llama3.1:8b' }]
      });
      await provider.initialize();
    });

    it('should handle basic chat request', async () => {
      const mockResponse = {
        message: {
          content: 'Hello! How can I help you today?',
        },
        done: true,
        prompt_eval_count: 10,
        eval_count: 8,
      };
      
      mockOllamaClient.chat.mockResolvedValue(mockResponse);

      const messages = [
        { role: 'user', content: 'Hello!' }
      ];

      const response = await provider.chat(messages);

      expect(response).toEqual({
        content: 'Hello! How can I help you today?',
        role: 'assistant',
        finish_reason: 'stop',
        usage: {
          prompt_tokens: 10,
          completion_tokens: 8,
          total_tokens: 18,
        },
      });
    });

    it('should handle chat request with tools', async () => {
      const mockResponse = {
        message: {
          content: '',
          tool_calls: [{
            function: {
              name: 'get_weather',
              arguments: { location: 'San Francisco' }
            }
          }]
        },
        done: true,
        prompt_eval_count: 15,
        eval_count: 5,
      };
      
      mockOllamaClient.chat.mockResolvedValue(mockResponse);

      const messages = [
        { role: 'user', content: 'What\'s the weather like in San Francisco?' }
      ];
      
      const tools = [{
        name: 'get_weather',
        description: 'Get weather information',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'string' }
          },
          required: ['location']
        }
      }];

      const response = await provider.chat(messages, tools);

      expect(response.tool_calls).toBeDefined();
      expect(response.tool_calls[0].function.name).toBe('get_weather');
    });

    it('should pull model if not available and pullOnDemand is true', async () => {
      // Create a new provider with pullOnDemand enabled
      const pullProvider = new OllamaProvider({
        model: 'llama3.1:8b',
        baseUrl: 'http://localhost:11434',
        pullOnDemand: true,
        temperature: 0.7,
      });
      
      // Model not in initial list
      mockOllamaClient.list.mockResolvedValue({ models: [] });
      
      // Mock pull stream
      const pullStream = {
        [Symbol.asyncIterator]: async function* () {
          yield { status: 'downloading' };
          yield { status: 'complete' };
        }
      };
      mockOllamaClient.pull.mockResolvedValue(pullStream);
      
      // Set up mock sequence: empty initially, then model available after pull
      mockOllamaClient.list
        .mockResolvedValueOnce({ models: [] }) // First call during init
        .mockResolvedValueOnce({ models: [] }) // Second call when checking in ensureModelAvailable
        .mockResolvedValueOnce({ models: [{ name: 'llama3.1:8b' }] }); // After pull

      mockOllamaClient.chat.mockResolvedValue({
        message: { content: 'Hello!' },
        done: true,
      });

      await pullProvider.initialize();
      const messages = [{ role: 'user', content: 'Hello!' }];
      await pullProvider.chat(messages);

      expect(mockOllamaClient.pull).toHaveBeenCalledWith({ model: 'llama3.1:8b', stream: true });
    });
  });

  describe('streamChat', () => {
    beforeEach(async () => {
      mockOllamaClient.list.mockResolvedValue({
        models: [{ name: 'llama3.1:8b' }]
      });
      await provider.initialize();
    });

    it('should handle streaming chat response', async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield { message: { content: 'Hello' }, done: false };
          yield { message: { content: '!' }, done: false };
          yield { message: { content: '' }, done: true };
        }
      };
      
      mockOllamaClient.chat.mockResolvedValue(mockStream);

      const messages = [{ role: 'user', content: 'Hello!' }];
      const responseStream = await provider.streamChat(messages);

      const chunks = [];
      for await (const chunk of responseStream) {
        chunks.push(chunk);
      }

      // Now we expect 3 chunks including empty content with done=true
      expect(chunks).toHaveLength(3);
      expect(chunks[0].content).toBe('Hello');
      expect(chunks[0].finish_reason).toBe(null);
      expect(chunks[1].content).toBe('!');
      expect(chunks[1].finish_reason).toBe(null);
      expect(chunks[2].content).toBe('');
      expect(chunks[2].finish_reason).toBe('stop');
    });
  });

  describe('embeddings', () => {
    beforeEach(async () => {
      mockOllamaClient.list.mockResolvedValue({
        models: [{ name: 'nomic-embed-text' }]
      });
      await provider.initialize();
    });

    it('should generate embeddings', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3, -0.1, 0.5];
      mockOllamaClient.embeddings.mockResolvedValue({
        embedding: mockEmbedding
      });

      const request = {
        input: 'Hello world',
        model: 'nomic-embed-text'
      };

      const response = await provider.embeddings(request);

      expect(response.embeddings).toEqual([mockEmbedding]);
      expect(response.model).toBe('nomic-embed-text');
    });
  });

  describe('dispose', () => {
    it('should dispose cleanly', async () => {
      await expect(provider.dispose()).resolves.not.toThrow();
    });
  });
});