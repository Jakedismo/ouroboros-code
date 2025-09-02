import OpenAI from 'openai';
import type { Message, Provider, ProviderOptions, StreamingResponse, ToolCall } from '../types.js';

export class OpenAIProvider implements Provider {
  name = 'OpenAI';
  private client: OpenAI;
  private defaultModel: string;
  
  // Models that don't support temperature and max_tokens parameters
  private readonly modelsWithoutParams = new Set([
    'gpt-5',
    'o3',
    'o4-mini',
    'codex-mini-latest',
    // Add more models here as needed
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
  
  async *generateResponse(
    messages: Message[],
    options: ProviderOptions = {},
    tools?: any[]
  ): AsyncIterable<StreamingResponse> {
    const model = options.model || this.defaultModel;
    const includeParams = this.shouldIncludeParams(model);
    
    // Build request parameters conditionally
    const requestParams: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
      model,
      messages: messages.map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
      stream: true,
    };
    
    // Only add temperature and max_tokens for models that support them
    if (includeParams) {
      if (options.temperature !== undefined) {
        requestParams.temperature = options.temperature;
      } else {
        requestParams.temperature = 0.7;
      }
      if (options.maxTokens !== undefined) {
        requestParams.max_tokens = options.maxTokens;
      }
    }
    
    // Add tools if provided
    if (tools && tools.length > 0) {
      requestParams.tools = tools.map(tool => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
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
    
    // Build request parameters conditionally
    const requestParams: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model,
      messages: messages.map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
    };
    
    // Only add temperature and max_tokens for models that support them
    if (includeParams) {
      if (options.temperature !== undefined) {
        requestParams.temperature = options.temperature;
      } else {
        requestParams.temperature = 0.7;
      }
      if (options.maxTokens !== undefined) {
        requestParams.max_tokens = options.maxTokens;
      }
    }
    
    // Add tools if provided
    if (tools && tools.length > 0) {
      requestParams.tools = tools.map(tool => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
    }
    
    const response = await this.client.chat.completions.create(requestParams);
    
    return response.choices[0]?.message?.content || '';
  }
}