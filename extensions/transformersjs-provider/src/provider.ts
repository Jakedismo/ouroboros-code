/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { pipeline, env } from '@xenova/transformers';
import { homedir } from 'os';
import { join } from 'path';

// Extension-compatible types - minimal interface for Transformers.js provider
export interface LLMProviderConfig {
  model?: string;
  defaultModel?: string;
  apiKey?: string;
  baseUrl?: string;
  maxRetries?: number;
  timeout?: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface CoreChatResponse {
  content: string;
  role: 'assistant';
  finish_reason?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  tool_calls?: ToolCall[];
}

export interface Tool {
  name: string;
  description: string;
  parameters: any;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface StreamingChatResponse {
  content?: string;
  role?: 'assistant';
  finish_reason?: string | null;
  tool_calls?: ToolCall[];
}

export interface EmbeddingRequest {
  input: string;
  model?: string;
}

export interface EmbeddingResponse {
  embeddings: number[][];
  model: string;
  usage?: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

// Base provider interface for extensions
export abstract class BaseLLMProvider {
  protected config: LLMProviderConfig;
  
  constructor(config: LLMProviderConfig) {
    this.config = config;
  }
  
  abstract initialize(): Promise<void>;
  abstract chat(messages: ChatMessage[], tools?: Tool[]): Promise<CoreChatResponse>;
  abstract streamChat(messages: ChatMessage[], tools?: Tool[]): Promise<AsyncGenerator<StreamingChatResponse, void, unknown>>;
  abstract getAvailableModels(): Promise<string[]>;
  abstract dispose(): Promise<void>;
}

export interface TransformersJSConfig extends LLMProviderConfig {
  task?: string;
  modelCache?: string;
  maxLength?: number;
  temperature?: number;
  topK?: number;
  topP?: number;
  doSample?: boolean;
  numBeams?: number;
  repetitionPenalty?: number;
  quantized?: boolean;
  device?: string;
  progress_callback?: boolean;
}

export class TransformersJSProvider extends BaseLLMProvider {
  protected config: TransformersJSConfig;
  private pipeline: any = null;
  private availableModels: Set<string> = new Set();
  private isInitialized = false;

  // Popular pre-trained models by task
  private static readonly RECOMMENDED_MODELS = {
    'text-generation': [
      'Xenova/gpt2',
      'Xenova/distilgpt2',
      'microsoft/DialoGPT-medium'
    ],
    'text-classification': [
      'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
      'cardiffnlp/twitter-roberta-base-sentiment-latest'
    ],
    'question-answering': [
      'Xenova/distilbert-base-uncased-distilled-squad',
      'deepset/roberta-base-squad2'
    ],
    'summarization': [
      'Xenova/distilbart-cnn-6-6',
      'facebook/bart-large-cnn'
    ],
    'feature-extraction': [
      'Xenova/all-MiniLM-L6-v2',
      'sentence-transformers/all-mpnet-base-v2'
    ],
    'translation': [
      'Xenova/nllb-200-distilled-600M',
      'Helsinki-NLP/opus-mt-en-de'
    ]
  };

  constructor(config: TransformersJSConfig) {
    super(config);
    this.config = config;
    
    // Configure model cache location
    if (config.modelCache) {
      env.cacheDir = config.modelCache;
    } else {
      env.cacheDir = join(homedir(), '.cache', 'transformers-js');
    }
    
    // Set other environment options
    env.allowRemoteModels = true;
    env.allowLocalModels = true;
    
    // Populate available models list with recommended models
    this.populateAvailableModels();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      const model = this.config.model || this.config.defaultModel || 'Xenova/distilbert-base-uncased-distilled-squad';
      const task = this.config.task || this.inferTaskFromModel(model) || 'text-generation';
      
      console.log(`🔄 Loading Transformers.js model '${model}' for task '${task}'...`);
      
      // Create pipeline with progress callback
      const pipelineOptions: any = {
        quantized: this.config.quantized !== false,
        progress_callback: this.config.progress_callback !== false ? this.progressCallback : undefined,
        device: this.config.device || 'auto',
      };

      this.pipeline = await pipeline(task as any, model, pipelineOptions);
      
      this.isInitialized = true;
      console.log(`✅ Transformers.js provider initialized with '${model}'`);
      console.log(`📦 Task: ${task}, Device: ${this.config.device || 'auto'}`);
      
    } catch (error) {
      throw new Error(`Failed to initialize Transformers.js provider: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private progressCallback = (progress: any) => {
    if (progress.status === 'downloading') {
      const percent = progress.progress ? Math.round(progress.progress * 100) : 0;
      console.log(`📥 Downloading model: ${percent}% (${progress.file || ''})`);
    } else if (progress.status === 'loading') {
      console.log(`⚡ Loading model into memory...`);
    } else if (progress.status === 'ready') {
      console.log(`🎉 Model ready for inference!`);
    }
  };

  private populateAvailableModels(): void {
    // Add all recommended models to available list
    Object.values(TransformersJSProvider.RECOMMENDED_MODELS).forEach(models => {
      models.forEach(model => this.availableModels.add(model));
    });
  }

  private inferTaskFromModel(model: string): string | null {
    const modelLower = model.toLowerCase();
    
    if (modelLower.includes('gpt') || modelLower.includes('dialbo')) {
      return 'text-generation';
    } else if (modelLower.includes('bert') && modelLower.includes('squad')) {
      return 'question-answering';
    } else if (modelLower.includes('sentiment') || modelLower.includes('classification')) {
      return 'text-classification';
    } else if (modelLower.includes('bart') && (modelLower.includes('cnn') || modelLower.includes('summariz'))) {
      return 'summarization';
    } else if (modelLower.includes('minilm') || modelLower.includes('sentence-transformer')) {
      return 'feature-extraction';
    }
    
    return null;
  }

  async chat(messages: ChatMessage[], tools?: Tool[]): Promise<CoreChatResponse> {
    if (!this.isInitialized || !this.pipeline) {
      await this.initialize();
    }

    try {
      // Extract user input from messages
      const userMessage = messages.find(msg => msg.role === 'user')?.content || '';
      if (!userMessage) {
        throw new Error('No user message found in chat request');
      }

      let response: any;
      const task = this.config.task || 'text-generation';

      switch (task) {
        case 'text-generation':
          response = await this.handleTextGeneration(userMessage);
          break;
        case 'question-answering':
          response = await this.handleQuestionAnswering(messages, userMessage);
          break;
        case 'text-classification':
          response = await this.handleTextClassification(userMessage);
          break;
        case 'summarization':
          response = await this.handleSummarization(userMessage);
          break;
        case 'feature-extraction':
          throw new Error('Feature extraction should use embeddings() method');
        default:
          throw new Error(`Unsupported task: ${task}`);
      }

      return this.formatChatResponse(response, task);
      
    } catch (error) {
      throw new Error(`Transformers.js chat request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleTextGeneration(input: string): Promise<any> {
    return await this.pipeline!(input, {
      max_new_tokens: Math.min(this.config.maxLength || 100, 512),
      temperature: this.config.temperature || 1.0,
      top_k: this.config.topK || 50,
      top_p: this.config.topP || 0.9,
      do_sample: this.config.doSample !== false,
      num_beams: this.config.numBeams || 1,
      repetition_penalty: this.config.repetitionPenalty || 1.0,
    });
  }

  private async handleQuestionAnswering(messages: ChatMessage[], question: string): Promise<any> {
    // Try to find context in previous messages or use the question itself
    const context = messages
      .filter(msg => msg.role !== 'user')
      .map(msg => msg.content)
      .join(' ') || question;

    return await this.pipeline!({
      question,
      context,
    });
  }

  private async handleTextClassification(text: string): Promise<any> {
    return await this.pipeline!(text);
  }

  private async handleSummarization(text: string): Promise<any> {
    return await this.pipeline!(text, {
      max_length: Math.min(this.config.maxLength || 142, 512),
      min_length: 30,
      do_sample: false,
    });
  }

  private formatChatResponse(response: any, task: string): CoreChatResponse {
    let content = '';
    
    switch (task) {
      case 'text-generation':
        content = Array.isArray(response) ? response[0]?.generated_text || '' : response?.generated_text || '';
        break;
      case 'question-answering':
        content = `Answer: ${response.answer}\nConfidence: ${(response.score * 100).toFixed(1)}%`;
        break;
      case 'text-classification':
        const results = Array.isArray(response) ? response : [response];
        content = results
          .map(r => `${r.label}: ${(r.score * 100).toFixed(1)}%`)
          .join('\n');
        break;
      case 'summarization':
        content = Array.isArray(response) ? response[0]?.summary_text || '' : response?.summary_text || '';
        break;
      default:
        content = JSON.stringify(response);
    }

    return {
      content: content.trim(),
      role: 'assistant',
      finish_reason: 'stop',
      usage: {
        prompt_tokens: 0, // Transformers.js doesn't provide token counts
        completion_tokens: 0,
        total_tokens: 0,
      },
    };
  }

  async streamChat(messages: ChatMessage[], tools?: Tool[]): Promise<AsyncGenerator<StreamingChatResponse, void, unknown>> {
    // Transformers.js doesn't support streaming, so we'll simulate it
    const response = await this.chat(messages, tools);
    
    async function* simulateStreaming(): AsyncGenerator<StreamingChatResponse, void, unknown> {
      const words = response.content.split(' ');
      
      for (let i = 0; i < words.length; i++) {
        yield {
          content: words[i] + (i < words.length - 1 ? ' ' : ''),
          role: 'assistant',
          finish_reason: null,
        };
        
        // Small delay to simulate streaming
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      yield {
        content: '',
        role: 'assistant',
        finish_reason: 'stop',
      };
    }

    return simulateStreaming();
  }

  async embeddings(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    // Initialize with feature extraction pipeline if needed
    if (!this.isInitialized || !this.pipeline || this.config.task !== 'feature-extraction') {
      const embeddingModel = request.model || 'Xenova/all-MiniLM-L6-v2';
      
      this.pipeline = await pipeline('feature-extraction' as any, embeddingModel, {
        quantized: this.config.quantized !== false,
        progress_callback: this.config.progress_callback !== false ? this.progressCallback : undefined,
      });
    }

    try {
      const result = await this.pipeline!(request.input, { pooling: 'mean', normalize: true });
      
      // Convert tensor to array
      const embeddings = Array.isArray(result.data) ? result.data : Array.from(result.data);
      
      return {
        embeddings: [embeddings],
        model: request.model || 'Xenova/all-MiniLM-L6-v2',
        usage: {
          prompt_tokens: 0,
          total_tokens: 0,
        },
      };
    } catch (error) {
      throw new Error(`Transformers.js embeddings request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getAvailableModels(): Promise<string[]> {
    return Array.from(this.availableModels);
  }

  async dispose(): Promise<void> {
    if (this.pipeline) {
      // Transformers.js doesn't have explicit dispose methods
      this.pipeline = null;
    }
    this.isInitialized = false;
    console.log('🔄 Transformers.js provider disposed');
  }
}

// Export the provider class as default for dynamic loading
export default TransformersJSProvider;