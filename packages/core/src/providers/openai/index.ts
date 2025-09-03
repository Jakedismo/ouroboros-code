import OpenAI from 'openai';
import type { Message, Provider, ProviderOptions, StreamingResponse, ToolCall } from '../types.js';
import { convertToOpenAITools } from './tool-adapter.js';

export class OpenAIProvider implements Provider {
  name = 'OpenAI';
  private client: OpenAI;
  private defaultModel: string;
  
  // Models that don't support temperature and max_tokens parameters at all
  private readonly modelsWithoutParams = new Set([
    'codex-mini-latest',
    // Add more models here as needed
  ]);
  
  // Models that use max_completion_tokens instead of max_tokens
  private readonly modelsWithMaxCompletionTokens = new Set([
    'gpt-5',
    'gpt-5-nano',
    'o3', 
    'o4-mini',
    // Add more models here as needed
  ]);
  
  // Models that only support default temperature (don't support custom temperature)
  private readonly modelsWithDefaultTemperatureOnly = new Set([
    'gpt-5',
    'gpt-5-nano',
    'o3',
    'o3-mini', 
    'o3-pro',
    'o4-mini',
    // Add more reasoning models here as needed
  ]);
  
  constructor(options: ProviderOptions = {}) {
    this.client = new OpenAI({
      apiKey: options.apiKey || process.env['OPENAI_API_KEY'],
    });
    this.defaultModel = options.model || 'gpt-4o';
  }
  
  private shouldIncludeParams(model: string): boolean {
    // Check if the model supports temperature and max_tokens parameters
    const shouldInclude = !this.modelsWithoutParams.has(model);
    if (!shouldInclude) {
      console.log(`[OpenAI] Model ${model} does not support temperature/max_tokens parameters, excluding them from request`);
    }
    return shouldInclude;
  }
  
  private supportsCustomTemperature(model: string): boolean {
    // Check if the model supports custom temperature values
    const supportsCustomTemp = !this.modelsWithDefaultTemperatureOnly.has(model);
    if (!supportsCustomTemp) {
      console.log(`[OpenAI] Model ${model} only supports default temperature (1), excluding custom temperature from request`);
    }
    return supportsCustomTemp;
  }
  
  async *generateResponse(
    messages: Message[],
    options: ProviderOptions = {},
    tools?: any[]
  ): AsyncIterable<StreamingResponse> {
    const model = options.model || this.defaultModel;
    const includeParams = this.shouldIncludeParams(model);
    const useMaxCompletionTokens = this.modelsWithMaxCompletionTokens.has(model);
    const supportsCustomTemp = this.supportsCustomTemperature(model);
    
    // Build request parameters conditionally
    const requestParams: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
      model,
      messages: messages.map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
      stream: true,
    };
    
    // Add temperature only for models that support custom temperature
    if (includeParams && supportsCustomTemp) {
      if (options.temperature !== undefined) {
        requestParams.temperature = options.temperature;
      } else {
        requestParams.temperature = 0.7;
      }
    }
    
    // Add max_tokens only for models that support it (non-max_completion_tokens models)
    if (includeParams && !useMaxCompletionTokens) {
      if (options.maxTokens !== undefined) {
        requestParams.max_tokens = options.maxTokens;
      }
    }
    
    // Handle models that need max_completion_tokens instead
    if (useMaxCompletionTokens) {
      // Only add temperature for models that support custom temperature
      if (supportsCustomTemp) {
        if (options.temperature !== undefined) {
          requestParams.temperature = options.temperature;
        } else {
          requestParams.temperature = 0.7;
        }
      }
      if (options.maxTokens !== undefined) {
        requestParams.max_completion_tokens = options.maxTokens;
      } else {
        requestParams.max_completion_tokens = 25000; // Default 25k tokens
      }
      // Remove max_tokens if it was set above
      delete requestParams.max_tokens;
    }
    
    // Add tools if provided
    if (tools && tools.length > 0) {
      console.log('[OpenAI Provider] Tools before conversion:', JSON.stringify(tools, null, 2));
      requestParams.tools = convertToOpenAITools(tools);
      console.log('[OpenAI Provider] Converted tools:', JSON.stringify(requestParams.tools, null, 2));
    }
    
    // Add response_format if specified (for forcing JSON output)
    if (options.response_format) {
      (requestParams as any).response_format = options.response_format;
    }
    
    const stream = await this.client.chat.completions.create(requestParams);
    
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      
      if (delta?.content) {
        yield { content: delta.content };
      }
      
      if (delta?.tool_calls) {
        const toolCalls: ToolCall[] = delta.tool_calls.map((tc: any) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments || '',
          },
        }));
        yield { toolCalls };
      }
      
      if (chunk.choices[0]?.finish_reason) {
        yield { done: true };
      }
    }
  }
  
  async generateCompletion(
    messages: Message[],
    options: ProviderOptions = {},
    tools?: any[]
  ): Promise<string> {
    const model = options.model || this.defaultModel;
    const includeParams = this.shouldIncludeParams(model);
    const useMaxCompletionTokens = this.modelsWithMaxCompletionTokens.has(model);
    const supportsCustomTemp = this.supportsCustomTemperature(model);
    
    // Build request parameters conditionally
    const requestParams: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model,
      messages: messages.map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
    };
    
    // Add temperature only for models that support custom temperature
    if (includeParams && supportsCustomTemp) {
      if (options.temperature !== undefined) {
        requestParams.temperature = options.temperature;
      } else {
        requestParams.temperature = 0.7;
      }
    }
    
    // Add max_tokens only for models that support it (non-max_completion_tokens models)
    if (includeParams && !useMaxCompletionTokens) {
      if (options.maxTokens !== undefined) {
        requestParams.max_tokens = options.maxTokens;
      }
    }
    
    // Handle models that need max_completion_tokens instead
    if (useMaxCompletionTokens) {
      // Only add temperature for models that support custom temperature
      if (supportsCustomTemp) {
        if (options.temperature !== undefined) {
          requestParams.temperature = options.temperature;
        } else {
          requestParams.temperature = 0.7;
        }
      }
      if (options.maxTokens !== undefined) {
        requestParams.max_completion_tokens = options.maxTokens;
      } else {
        requestParams.max_completion_tokens = 25000; // Default 25k tokens
      }
      // Remove max_tokens if it was set above
      delete requestParams.max_tokens;
    }
    
    // Add tools if provided
    if (tools && tools.length > 0) {
      requestParams.tools = convertToOpenAITools(tools);
    }
    
    // Add response_format if specified (for forcing JSON output)
    if (options.response_format) {
      (requestParams as any).response_format = options.response_format;
    }
    
    console.log('[OpenAI Provider] Request params:', JSON.stringify(requestParams, null, 2));
    
    const response = await this.client.chat.completions.create(requestParams);
    
    const content = response.choices[0]?.message?.content || '';
    console.log('[OpenAI Provider] Raw response content (first 500 chars):', content.substring(0, 500));
    
    return content;
  }
}