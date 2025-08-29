import OpenAI from 'openai';
import type { Message, Provider, ProviderOptions, StreamingResponse, ToolCall } from '../types.js';

export class OpenAIProvider implements Provider {
  name = 'OpenAI';
  private client: OpenAI;
  private defaultModel: string;
  
  constructor(options: ProviderOptions = {}) {
    this.client = new OpenAI({
      apiKey: options.apiKey || process.env['OPENAI_API_KEY'],
    });
    this.defaultModel = options.model || 'gpt-4o';
  }
  
  async *generateResponse(
    messages: Message[],
    options: ProviderOptions = {},
    tools?: any[]
  ): AsyncIterable<StreamingResponse> {
    const stream = await this.client.chat.completions.create({
      model: options.model || this.defaultModel,
      messages: messages.map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      stream: true,
      tools: tools?.map(tool => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      })),
    });
    
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
    const response = await this.client.chat.completions.create({
      model: options.model || this.defaultModel,
      messages: messages.map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      tools: tools?.map(tool => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      })),
    });
    
    return response.choices[0]?.message?.content || '';
  }
}