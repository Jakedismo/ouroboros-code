/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VLLMProvider } from '../src/provider.js';

// Mock the OpenAI module
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      models: {
        list: vi.fn(),
      },
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
    })),
  };
});

describe('VLLMProvider', () => {
  let provider: VLLMProvider;
  let mockOpenAIClient: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Mock OpenAI client
    const { default: OpenAI } = await import('openai');
    mockOpenAIClient = {
      models: {
        list: vi.fn(),
      },
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
    };
    
    vi.mocked(OpenAI).mockImplementation(() => mockOpenAIClient);
    
    provider = new VLLMProvider({
      model: 'microsoft/DialoGPT-medium',
      baseUrl: 'http://localhost:8000',
      temperature: 0.7,
      maxTokens: 2048,
    });
  });

  describe('initialization', () => {
    it('should initialize successfully when vLLM server is available', async () => {
      mockOpenAIClient.models.list.mockResolvedValue({
        data: [
          { id: 'microsoft/DialoGPT-medium', object: 'model' },
          { id: 'meta-llama/Llama-2-7b-chat-hf', object: 'model' },
        ]
      });

      await provider.initialize();
      
      expect(mockOpenAIClient.models.list).toHaveBeenCalled();
    });

    it('should throw error when vLLM server is not available', async () => {
      mockOpenAIClient.models.list.mockRejectedValue(new Error('Connection failed'));

      await expect(provider.initialize()).rejects.toThrow('Failed to initialize vLLM provider');
    });
  });

  describe('getAvailableModels', () => {
    it('should return list of available models', async () => {
      mockOpenAIClient.models.list.mockResolvedValue({
        data: [
          { id: 'microsoft/DialoGPT-medium', object: 'model' },
          { id: 'meta-llama/Llama-2-7b-chat-hf', object: 'model' },
          { id: 'codellama/CodeLlama-7b-Python-hf', object: 'model' },
        ]
      });

      const models = await provider.getAvailableModels();
      
      expect(models).toEqual([
        'microsoft/DialoGPT-medium',
        'meta-llama/Llama-2-7b-chat-hf', 
        'codellama/CodeLlama-7b-Python-hf'
      ]);
    });
  });

  describe('chat', () => {
    beforeEach(async () => {
      // Setup available models
      mockOpenAIClient.models.list.mockResolvedValue({
        data: [{ id: 'microsoft/DialoGPT-medium', object: 'model' }]
      });
      await provider.initialize();
    });

    it('should handle basic chat request', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Hello! How can I help you today?',
            role: 'assistant',
          },
          finish_reason: 'stop',
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 8,
          total_tokens: 18,
        },
      };
      
      mockOpenAIClient.chat.completions.create.mockResolvedValue(mockResponse);

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
        choices: [{
          message: {
            content: '',
            role: 'assistant',
            tool_calls: [{
              id: 'call_123',
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: '{"location": "San Francisco"}'
              }
            }]
          },
          finish_reason: 'tool_calls',
        }],
        usage: {
          prompt_tokens: 15,
          completion_tokens: 5,
          total_tokens: 20,
        },
      };
      
      mockOpenAIClient.chat.completions.create.mockResolvedValue(mockResponse);

      const messages = [
        { role: 'user', content: "What's the weather like in San Francisco?" }
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
      expect(response.tool_calls[0].function.arguments).toBe('{"location": "San Francisco"}');
    });

    it('should throw error when model is not available', async () => {
      // Model not in server list
      mockOpenAIClient.models.list.mockResolvedValue({
        data: [{ id: 'other-model', object: 'model' }]
      });

      const testProvider = new VLLMProvider({
        model: 'nonexistent-model',
        baseUrl: 'http://localhost:8000',
      });

      await testProvider.initialize();
      
      const messages = [{ role: 'user', content: 'Hello!' }];
      
      await expect(testProvider.chat(messages)).rejects.toThrow('not available on vLLM server');
    });
  });

  describe('streamChat', () => {
    beforeEach(async () => {
      mockOpenAIClient.models.list.mockResolvedValue({
        data: [{ id: 'microsoft/DialoGPT-medium', object: 'model' }]
      });
      await provider.initialize();
    });

    it('should handle streaming chat response', async () => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { choices: [{ delta: { content: 'Hello' }, finish_reason: null }] };
          yield { choices: [{ delta: { content: ' there!' }, finish_reason: null }] };
          yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
        }
      };
      
      mockOpenAIClient.chat.completions.create.mockResolvedValue(mockStream);

      const messages = [{ role: 'user', content: 'Hello!' }];
      const responseStream = await provider.streamChat(messages);

      const chunks = [];
      for await (const chunk of responseStream) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(3);
      expect(chunks[0].content).toBe('Hello');
      expect(chunks[1].content).toBe(' there!');
      expect(chunks[2].finish_reason).toBe('stop');
    });

    it('should handle streaming with tool calls', async () => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { 
            choices: [{ 
              delta: { 
                tool_calls: [{
                  id: 'call_123',
                  function: { name: 'get_weather', arguments: '{"location": "SF"}' }
                }]
              },
              finish_reason: null 
            }] 
          };
          yield { choices: [{ delta: {}, finish_reason: 'tool_calls' }] };
        }
      };
      
      mockOpenAIClient.chat.completions.create.mockResolvedValue(mockStream);

      const messages = [{ role: 'user', content: 'Weather in SF?' }];
      const tools = [{
        name: 'get_weather',
        description: 'Get weather',
        parameters: { type: 'object', properties: { location: { type: 'string' } } }
      }];

      const responseStream = await provider.streamChat(messages, tools);

      const chunks = [];
      for await (const chunk of responseStream) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0].tool_calls).toBeDefined();
      expect(chunks[0].tool_calls[0].function.name).toBe('get_weather');
      expect(chunks[1].finish_reason).toBe('tool_calls');
    });
  });

  describe('configuration', () => {
    it('should respect temperature setting', async () => {
      mockOpenAIClient.models.list.mockResolvedValue({
        data: [{ id: 'test-model', object: 'model' }]
      });

      const testProvider = new VLLMProvider({
        model: 'test-model',
        temperature: 1.2,
      });

      await testProvider.initialize();

      mockOpenAIClient.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'test', role: 'assistant' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      });

      await testProvider.chat([{ role: 'user', content: 'test' }]);

      const callArgs = mockOpenAIClient.chat.completions.create.mock.calls[0][0];
      expect(callArgs.temperature).toBe(1.2);
    });

    it('should respect maxTokens setting', async () => {
      mockOpenAIClient.models.list.mockResolvedValue({
        data: [{ id: 'test-model', object: 'model' }]
      });

      const testProvider = new VLLMProvider({
        model: 'test-model',
        maxTokens: 1000,
      });

      await testProvider.initialize();

      mockOpenAIClient.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'test', role: 'assistant' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      });

      await testProvider.chat([{ role: 'user', content: 'test' }]);

      const callArgs = mockOpenAIClient.chat.completions.create.mock.calls[0][0];
      expect(callArgs.max_tokens).toBe(1000);
    });

    it('should use default values when not specified', async () => {
      mockOpenAIClient.models.list.mockResolvedValue({
        data: [{ id: 'microsoft/DialoGPT-medium', object: 'model' }]
      });

      const testProvider = new VLLMProvider({
        model: 'microsoft/DialoGPT-medium',
      });

      await testProvider.initialize();

      mockOpenAIClient.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'test', role: 'assistant' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      });

      await testProvider.chat([{ role: 'user', content: 'test' }]);

      const callArgs = mockOpenAIClient.chat.completions.create.mock.calls[0][0];
      expect(callArgs.model).toBe('microsoft/DialoGPT-medium');
    });
  });

  describe('dispose', () => {
    it('should dispose cleanly', async () => {
      await expect(provider.dispose()).resolves.not.toThrow();
    });
  });
});