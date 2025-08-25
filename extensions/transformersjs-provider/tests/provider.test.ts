/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransformersJSProvider } from '../src/provider.js';

// Mock the @xenova/transformers module
vi.mock('@xenova/transformers', () => ({
  pipeline: vi.fn(),
  env: {
    cacheDir: '/mock/.cache/transformers-js',
    allowRemoteModels: true,
    allowLocalModels: true,
    version: '2.17.1'
  }
}));

describe('TransformersJSProvider', () => {
  let provider: TransformersJSProvider;
  let mockPipeline: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Mock pipeline function
    const { pipeline } = await import('@xenova/transformers');
    mockPipeline = vi.fn();
    vi.mocked(pipeline).mockResolvedValue(mockPipeline);
    
    provider = new TransformersJSProvider({
      model: 'Xenova/distilbert-base-uncased-distilled-squad',
      task: 'question-answering',
      quantized: true,
      temperature: 0.7,
      maxLength: 512,
    });
  });

  describe('initialization', () => {
    it('should initialize successfully with question-answering task', async () => {
      const { pipeline } = await import('@xenova/transformers');
      
      await provider.initialize();
      
      expect(pipeline).toHaveBeenCalledWith(
        'question-answering',
        'Xenova/distilbert-base-uncased-distilled-squad',
        expect.objectContaining({
          quantized: true,
          device: 'auto'
        })
      );
    });

    it('should infer task from model name', async () => {
      const gptProvider = new TransformersJSProvider({
        model: 'Xenova/gpt2',
      });
      
      const { pipeline } = await import('@xenova/transformers');
      
      await gptProvider.initialize();
      
      expect(pipeline).toHaveBeenCalledWith(
        'text-generation',
        'Xenova/gpt2',
        expect.any(Object)
      );
    });

    it('should handle initialization failure', async () => {
      const { pipeline } = await import('@xenova/transformers');
      vi.mocked(pipeline).mockRejectedValue(new Error('Model not found'));

      await expect(provider.initialize()).rejects.toThrow('Failed to initialize Transformers.js provider');
    });
  });

  describe('getAvailableModels', () => {
    it('should return list of pre-configured models', async () => {
      const models = await provider.getAvailableModels();
      
      expect(models.length).toBeGreaterThan(0);
      expect(models).toContain('Xenova/gpt2');
      expect(models).toContain('Xenova/distilbert-base-uncased-finetuned-sst-2-english');
      expect(models).toContain('Xenova/all-MiniLM-L6-v2');
    });
  });

  describe('chat - question answering', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should handle question answering task', async () => {
      const mockResponse = {
        answer: 'Transformers.js is a JavaScript library',
        score: 0.95
      };
      
      mockPipeline.mockResolvedValue(mockResponse);

      const messages = [
        { role: 'user', content: 'What is Transformers.js?' }
      ];

      const response = await provider.chat(messages);

      expect(response).toEqual({
        content: 'Answer: Transformers.js is a JavaScript library\nConfidence: 95.0%',
        role: 'assistant',
        finish_reason: 'stop',
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      });

      expect(mockPipeline).toHaveBeenCalledWith({
        question: 'What is Transformers.js?',
        context: 'What is Transformers.js?'
      });
    });
  });

  describe('chat - text generation', () => {
    beforeEach(async () => {
      const genProvider = new TransformersJSProvider({
        model: 'Xenova/gpt2',
        task: 'text-generation',
        maxLength: 100,
        temperature: 0.8,
        topK: 40
      });
      provider = genProvider;
      await provider.initialize();
    });

    it('should handle text generation task', async () => {
      const mockResponse = [{
        generated_text: 'Hello world! This is a generated response from the AI.'
      }];
      
      mockPipeline.mockResolvedValue(mockResponse);

      const messages = [
        { role: 'user', content: 'Hello world!' }
      ];

      const response = await provider.chat(messages);

      expect(response).toEqual({
        content: 'Hello world! This is a generated response from the AI.',
        role: 'assistant',
        finish_reason: 'stop',
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      });

      expect(mockPipeline).toHaveBeenCalledWith(
        'Hello world!',
        expect.objectContaining({
          max_new_tokens: 100,
          temperature: 0.8,
          top_k: 40,
          do_sample: true
        })
      );
    });
  });

  describe('chat - text classification', () => {
    beforeEach(async () => {
      const classProvider = new TransformersJSProvider({
        model: 'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
        task: 'text-classification',
      });
      provider = classProvider;
      await provider.initialize();
    });

    it('should handle text classification task', async () => {
      const mockResponse = [
        { label: 'POSITIVE', score: 0.9 },
        { label: 'NEGATIVE', score: 0.1 }
      ];
      
      mockPipeline.mockResolvedValue(mockResponse);

      const messages = [
        { role: 'user', content: 'I love this product!' }
      ];

      const response = await provider.chat(messages);

      expect(response.content).toBe('POSITIVE: 90.0%\nNEGATIVE: 10.0%');
      expect(mockPipeline).toHaveBeenCalledWith('I love this product!');
    });

    it('should handle single classification result', async () => {
      const mockResponse = { label: 'POSITIVE', score: 0.85 };
      
      mockPipeline.mockResolvedValue(mockResponse);

      const messages = [
        { role: 'user', content: 'Great job!' }
      ];

      const response = await provider.chat(messages);

      expect(response.content).toBe('POSITIVE: 85.0%');
    });
  });

  describe('chat - summarization', () => {
    beforeEach(async () => {
      const summaryProvider = new TransformersJSProvider({
        model: 'Xenova/distilbart-cnn-6-6',
        task: 'summarization',
      });
      provider = summaryProvider;
      await provider.initialize();
    });

    it('should handle summarization task', async () => {
      const mockResponse = [{
        summary_text: 'This is a concise summary of the input text.'
      }];
      
      mockPipeline.mockResolvedValue(mockResponse);

      const messages = [
        { role: 'user', content: 'This is a very long text that needs to be summarized. It contains a lot of information about various topics and should be condensed into a shorter format.' }
      ];

      const response = await provider.chat(messages);

      expect(response.content).toBe('This is a concise summary of the input text.');
      expect(mockPipeline).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          max_length: expect.any(Number),
          min_length: 30,
          do_sample: false
        })
      );
    });
  });

  describe('streamChat', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should simulate streaming for question answering', async () => {
      const mockResponse = {
        answer: 'This is a test answer',
        score: 0.9
      };
      
      mockPipeline.mockResolvedValue(mockResponse);

      const messages = [
        { role: 'user', content: 'Test question?' }
      ];

      const responseStream = await provider.streamChat(messages);

      const chunks = [];
      for await (const chunk of responseStream) {
        chunks.push(chunk);
      }

      // Should break response into word chunks plus final chunk
      expect(chunks.length).toBeGreaterThan(1);
      
      // First chunks should have content
      expect(chunks[0].content).toBeTruthy();
      expect(chunks[0].finish_reason).toBeNull();
      
      // Last chunk should indicate completion
      const lastChunk = chunks[chunks.length - 1];
      expect(lastChunk.finish_reason).toBe('stop');
    });
  });

  describe('embeddings', () => {
    it('should handle embeddings request', async () => {
      const { pipeline } = await import('@xenova/transformers');
      
      // Mock embeddings pipeline
      const mockEmbeddingPipeline = vi.fn();
      const mockResult = {
        data: [0.1, 0.2, -0.1, 0.5, 0.3]
      };
      mockEmbeddingPipeline.mockResolvedValue(mockResult);
      vi.mocked(pipeline).mockResolvedValue(mockEmbeddingPipeline);

      const request = {
        input: 'Hello world',
        model: 'Xenova/all-MiniLM-L6-v2'
      };

      const response = await provider.embeddings(request);

      expect(response).toEqual({
        embeddings: [[0.1, 0.2, -0.1, 0.5, 0.3]],
        model: 'Xenova/all-MiniLM-L6-v2',
        usage: {
          prompt_tokens: 0,
          total_tokens: 0,
        },
      });

      expect(pipeline).toHaveBeenCalledWith(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
        expect.objectContaining({
          quantized: true
        })
      );

      expect(mockEmbeddingPipeline).toHaveBeenCalledWith(
        'Hello world',
        { pooling: 'mean', normalize: true }
      );
    });

    it('should handle tensor-like embeddings result', async () => {
      const { pipeline } = await import('@xenova/transformers');
      
      const mockEmbeddingPipeline = vi.fn();
      const mockResult = {
        data: new Float32Array([0.1, 0.2, -0.1, 0.5, 0.3])
      };
      mockEmbeddingPipeline.mockResolvedValue(mockResult);
      vi.mocked(pipeline).mockResolvedValue(mockEmbeddingPipeline);

      const request = {
        input: 'Test embeddings'
      };

      const response = await provider.embeddings(request);

      expect(response.embeddings).toHaveLength(1);
      expect(response.embeddings[0]).toHaveLength(5);
      expect(response.embeddings[0][0]).toBeCloseTo(0.1);
      expect(response.embeddings[0][1]).toBeCloseTo(0.2);
    });
  });

  describe('error handling', () => {
    it('should handle chat with no user message', async () => {
      await provider.initialize();

      const messages = [
        { role: 'system', content: 'System message' }
      ];

      await expect(provider.chat(messages)).rejects.toThrow('No user message found');
    });

    it('should handle unsupported task', async () => {
      const unsupportedProvider = new TransformersJSProvider({
        model: 'test-model',
        task: 'unsupported-task',
      });

      await unsupportedProvider.initialize();

      const messages = [
        { role: 'user', content: 'Test' }
      ];

      await expect(unsupportedProvider.chat(messages)).rejects.toThrow('Unsupported task: unsupported-task');
    });

    it('should handle feature extraction in chat', async () => {
      const extractProvider = new TransformersJSProvider({
        model: 'Xenova/all-MiniLM-L6-v2',
        task: 'feature-extraction',
      });

      await extractProvider.initialize();

      const messages = [
        { role: 'user', content: 'Test' }
      ];

      await expect(extractProvider.chat(messages)).rejects.toThrow('Feature extraction should use embeddings() method');
    });
  });

  describe('dispose', () => {
    it('should dispose cleanly', async () => {
      await provider.initialize();
      await expect(provider.dispose()).resolves.not.toThrow();
    });
  });
});