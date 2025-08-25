/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import OpenAI from 'openai';

// Extension-compatible types - minimal interface for vLLM provider
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

export interface VLLMConfig extends LLMProviderConfig {
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  requestTimeout?: number;
  maxRetries?: number;
  serverConfig?: {
    tensorParallelSize?: number;
    maxNumSeqs?: number;
    maxModelLen?: number;
    quantization?: string;
    gpuMemoryUtilization?: number;
  };
}

export class VLLMProvider extends BaseLLMProvider {
  private client: OpenAI;
  protected config: VLLMConfig;
  private availableModels: Set<string> = new Set();

  constructor(config: VLLMConfig) {
    super(config);
    this.config = config;
    
    this.client = new OpenAI({
      baseURL: config.baseUrl || 'http://localhost:8000/v1',
      apiKey: 'dummy-key', // vLLM doesn't require real API keys in local mode
      timeout: config.requestTimeout || 60000,
      maxRetries: config.maxRetries || 3,
    });
  }

  async initialize(): Promise<void> {
    try {
      // Test connection to vLLM server by listing models
      const response = await this.client.models.list();
      this.availableModels.clear();
      
      response.data.forEach(model => {
        this.availableModels.add(model.id);
      });
      
      console.log(`✅ vLLM provider initialized (${this.config.baseUrl || 'http://localhost:8000'})`);
      console.log(`📋 Loaded ${this.availableModels.size} vLLM models`);
    } catch (error) {
      throw new Error(`Failed to initialize vLLM provider: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async loadAvailableModels(): Promise<void> {
    try {
      const response = await this.client.models.list();
      this.availableModels.clear();
      
      response.data.forEach(model => {
        this.availableModels.add(model.id);
      });
      
      console.log(`📋 Loaded ${this.availableModels.size} vLLM models`);
    } catch (error) {
      console.warn(`Warning: Could not load vLLM models: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async chat(messages: ChatMessage[], tools?: Tool[]): Promise<CoreChatResponse> {
    const model = this.config.model || this.config.defaultModel || 'microsoft/DialoGPT-medium';
    
    // Ensure model is available
    await this.ensureModelAvailable(model);
    
    try {
      const openaiMessages = this.convertMessages(messages);
      const requestParams = this.buildChatRequestParams(model, tools);

      const response = await this.client.chat.completions.create({
        model,
        messages: openaiMessages,
        ...requestParams,
        stream: false,
      });

      return this.convertChatResponse(response);
    } catch (error) {
      throw new Error(`vLLM chat request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async streamChat(
    messages: ChatMessage[],
    tools?: Tool[]
  ): Promise<AsyncGenerator<StreamingChatResponse, void, unknown>> {
    const model = this.config.model || this.config.defaultModel || 'microsoft/DialoGPT-medium';
    
    await this.ensureModelAvailable(model);
    
    const openaiMessages = this.convertMessages(messages);
    const requestParams = this.buildChatRequestParams(model, tools);

    try {
      const stream = await this.client.chat.completions.create({
        model,
        messages: openaiMessages,
        ...requestParams,
        stream: true,
      });

      return this.convertStreamResponse(stream as unknown as AsyncIterable<any>);
    } catch (error) {
      throw new Error(`vLLM streaming chat request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getAvailableModels(): Promise<string[]> {
    await this.loadAvailableModels();
    return Array.from(this.availableModels);
  }

  private async ensureModelAvailable(model: string): Promise<void> {
    // Refresh model list if empty
    if (this.availableModels.size === 0) {
      await this.loadAvailableModels();
    }
    
    // Check if the requested model is available
    if (this.availableModels.size > 0 && !this.availableModels.has(model)) {
      const availableList = Array.from(this.availableModels).join(', ');
      throw new Error(
        `Model '${model}' not available on vLLM server. Available models: ${availableList}. ` +
        `Make sure the model is loaded in vLLM server.`
      );
    }
  }

  private convertMessages(messages: ChatMessage[]): any[] {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  private buildChatRequestParams(model: string, tools?: Tool[]): any {
    const params: any = {};
    
    if (this.config.maxTokens !== undefined) params.max_tokens = this.config.maxTokens;
    if (this.config.temperature !== undefined) params.temperature = this.config.temperature;
    if (this.config.topP !== undefined) params.top_p = this.config.topP;
    if (this.config.frequencyPenalty !== undefined) params.frequency_penalty = this.config.frequencyPenalty;
    if (this.config.presencePenalty !== undefined) params.presence_penalty = this.config.presencePenalty;

    // Add tools if provided
    if (tools && tools.length > 0) {
      params.tools = this.convertTools(tools);
      params.tool_choice = 'auto';
    }

    return params;
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

  private convertChatResponse(response: OpenAI.Chat.Completions.ChatCompletion): CoreChatResponse {
    const choice = response.choices[0];
    const message = choice.message;

    const result: CoreChatResponse = {
      content: message.content || '',
      role: 'assistant',
      finish_reason: choice.finish_reason || undefined,
      usage: {
        prompt_tokens: response.usage?.prompt_tokens || 0,
        completion_tokens: response.usage?.completion_tokens || 0,
        total_tokens: response.usage?.total_tokens || 0,
      },
    };

    // Handle tool calls if present
    if (message.tool_calls) {
      result.tool_calls = message.tool_calls.map(call => ({
        id: call.id,
        type: 'function',
        function: {
          name: call.function.name,
          arguments: call.function.arguments,
        },
      }));
    }

    return result;
  }

  private async *convertStreamResponse(
    stream: AsyncIterable<any>
  ): AsyncGenerator<StreamingChatResponse, void, unknown> {
    try {
      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta;

        // Handle content delta
        if (delta.content) {
          yield {
            content: delta.content,
            role: 'assistant',
            finish_reason: choice.finish_reason as any,
          };
        }

        // Handle tool calls delta
        if (delta.tool_calls) {
          yield {
            content: '',
            role: 'assistant',
            tool_calls: delta.tool_calls.map((call: any) => ({
              id: call.id || `call_${Date.now()}`,
              type: 'function',
              function: {
                name: call.function?.name || '',
                arguments: call.function?.arguments || '',
              },
            })),
            finish_reason: null,
          };
        }

        // Handle completion finish
        if (choice.finish_reason) {
          yield {
            content: '',
            role: 'assistant',
            finish_reason: choice.finish_reason as any,
          };
        }
      }
    } catch (error) {
      throw new Error(`Streaming response conversion failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async dispose(): Promise<void> {
    // OpenAI client doesn't need explicit cleanup
    console.log('🔄 vLLM provider disposed');
  }
}

// Export the provider class as default for dynamic loading
export default VLLMProvider;