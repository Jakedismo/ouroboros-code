/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { Ollama, ChatResponse } from 'ollama';

// Extension-compatible types - minimal interface for Ollama provider
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

export interface OllamaConfig extends LLMProviderConfig {
  baseUrl?: string;
  pullOnDemand?: boolean;
  requestTimeout?: number;
  maxRetries?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  repeatPenalty?: number;
  seed?: number;
  numCtx?: number;
  numGpu?: number;
  numThread?: number;
  numa?: boolean;
  lowVram?: boolean;
  f16Kv?: boolean;
  vocab_only?: boolean;
  use_mmap?: boolean;
  use_mlock?: boolean;
  embedding_only?: boolean;
}

export class OllamaProvider extends BaseLLMProvider {
  private client: Ollama;
  protected config: OllamaConfig;
  private availableModels: Set<string> = new Set();

  constructor(config: OllamaConfig) {
    super(config);
    this.config = config;
    
    this.client = new Ollama({
      host: config.baseUrl || 'http://localhost:11434',
    });
  }

  async initialize(): Promise<void> {
    try {
      // Test connection to Ollama server
      await this.client.list();
      
      // Load available models
      await this.loadAvailableModels();
      
      console.log(`✅ Ollama provider initialized (${this.config.baseUrl || 'http://localhost:11434'})`);
    } catch (error) {
      throw new Error(`Failed to initialize Ollama provider: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async loadAvailableModels(): Promise<void> {
    try {
      const response = await this.client.list();
      this.availableModels.clear();
      
      response.models.forEach(model => {
        this.availableModels.add(model.name);
      });
      
      console.log(`📋 Loaded ${this.availableModels.size} Ollama models`);
    } catch (error) {
      console.warn(`Warning: Could not load Ollama models: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async chat(messages: ChatMessage[], tools?: Tool[]): Promise<CoreChatResponse> {
    const model = this.config.model || this.config.defaultModel || 'llama3.1:8b';
    
    // Check if model is available or pull if needed
    await this.ensureModelAvailable(model);
    
    try {
      const ollamaMessages = this.convertMessages(messages);
      const options = this.buildRequestOptions();

      let response: ChatResponse;
      
      if (tools && tools.length > 0) {
        // Handle function calling
        response = await this.client.chat({
          model,
          messages: ollamaMessages,
          tools: this.convertTools(tools),
          options,
        });
      } else {
        // Standard chat
        response = await this.client.chat({
          model,
          messages: ollamaMessages,
          options,
        });
      }

      return this.convertResponse(response);
    } catch (error) {
      throw new Error(`Ollama chat request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async streamChat(
    messages: ChatMessage[],
    tools?: Tool[]
  ): Promise<AsyncGenerator<StreamingChatResponse, void, unknown>> {
    const model = this.config.model || this.config.defaultModel || 'llama3.1:8b';
    
    await this.ensureModelAvailable(model);
    
    const ollamaMessages = this.convertMessages(messages);
    const options = this.buildRequestOptions();

    try {
      const stream = await this.client.chat({
        model,
        messages: ollamaMessages,
        tools: tools ? this.convertTools(tools) : undefined,
        options,
        stream: true,
      });

      return this.convertStreamResponse(stream);
    } catch (error) {
      throw new Error(`Ollama streaming chat request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async embeddings(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const model = request.model || 'nomic-embed-text';
    
    await this.ensureModelAvailable(model);

    try {
      const response = await this.client.embeddings({
        model,
        prompt: request.input,
      });

      return {
        embeddings: [response.embedding],
        model,
        usage: {
          prompt_tokens: 0, // Ollama doesn't provide token counts for embeddings
          total_tokens: 0,
        }
      };
    } catch (error) {
      throw new Error(`Ollama embeddings request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getAvailableModels(): Promise<string[]> {
    await this.loadAvailableModels();
    return Array.from(this.availableModels);
  }

  private async ensureModelAvailable(model: string): Promise<void> {
    if (this.availableModels.has(model)) {
      return; // Model is already available
    }

    if (!this.config.pullOnDemand) {
      throw new Error(`Model '${model}' not found locally. Set pullOnDemand: true to auto-download.`);
    }

    console.log(`📥 Pulling model '${model}' (this may take a while on first use)...`);
    
    try {
      // Pull the model
      const pullStream = await this.client.pull({ model, stream: true });
      
      let lastStatus = '';
      for await (const chunk of pullStream) {
        if (chunk.status && chunk.status !== lastStatus) {
          console.log(`   ${chunk.status}`);
          lastStatus = chunk.status;
        }
      }
      
      // Refresh available models
      await this.loadAvailableModels();
      console.log(`✅ Model '${model}' is ready`);
    } catch (error) {
      throw new Error(`Failed to pull model '${model}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private convertMessages(messages: ChatMessage[]): any[] {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  private convertTools(tools: Tool[]): any[] {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  private buildRequestOptions(): any {
    const options: any = {};
    
    if (this.config.temperature !== undefined) options.temperature = this.config.temperature;
    if (this.config.topP !== undefined) options.top_p = this.config.topP;
    if (this.config.topK !== undefined) options.top_k = this.config.topK;
    if (this.config.repeatPenalty !== undefined) options.repeat_penalty = this.config.repeatPenalty;
    if (this.config.seed !== undefined) options.seed = this.config.seed;
    if (this.config.numCtx !== undefined) options.num_ctx = this.config.numCtx;
    if (this.config.numGpu !== undefined) options.num_gpu = this.config.numGpu;
    if (this.config.numThread !== undefined) options.num_thread = this.config.numThread;
    if (this.config.numa !== undefined) options.numa = this.config.numa;
    if (this.config.lowVram !== undefined) options.low_vram = this.config.lowVram;
    if (this.config.f16Kv !== undefined) options.f16_kv = this.config.f16Kv;
    if (this.config.vocab_only !== undefined) options.vocab_only = this.config.vocab_only;
    if (this.config.use_mmap !== undefined) options.use_mmap = this.config.use_mmap;
    if (this.config.use_mlock !== undefined) options.use_mlock = this.config.use_mlock;

    return options;
  }

  private convertResponse(response: ChatResponse): CoreChatResponse {
    const result: CoreChatResponse = {
      content: response.message.content,
      role: 'assistant',
      finish_reason: response.done ? 'stop' : 'length',
      usage: {
        prompt_tokens: response.prompt_eval_count || 0,
        completion_tokens: response.eval_count || 0,
        total_tokens: (response.prompt_eval_count || 0) + (response.eval_count || 0),
      },
    };

    // Handle tool calls if present
    if (response.message.tool_calls) {
      result.tool_calls = response.message.tool_calls.map((call: any) => ({
        id: call.id || `call_${Date.now()}`,
        type: 'function',
        function: {
          name: call.function.name,
          arguments: JSON.stringify(call.function.arguments),
        },
      }));
    }

    return result;
  }

  private async *convertStreamResponse(
    stream: any
  ): AsyncGenerator<StreamingChatResponse, void, unknown> {
    try {
      for await (const chunk of stream) {
        if (chunk.message?.content !== undefined) {
          yield {
            content: chunk.message.content,
            role: 'assistant',
            finish_reason: chunk.done ? 'stop' : null,
          };
        }

        // Handle tool calls in streaming
        if (chunk.message?.tool_calls) {
          yield {
            content: '',
            role: 'assistant',
            tool_calls: chunk.message.tool_calls.map((call: any) => ({
              id: call.id || `call_${Date.now()}`,
              type: 'function',
              function: {
                name: call.function.name,
                arguments: JSON.stringify(call.function.arguments),
              },
            })),
            finish_reason: null,
          };
        }
      }
    } catch (error) {
      throw new Error(`Streaming response conversion failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async dispose(): Promise<void> {
    // Ollama client doesn't need explicit cleanup
    console.log('🔄 Ollama provider disposed');
  }
}

// Export the provider class as default for dynamic loading
export default OllamaProvider;