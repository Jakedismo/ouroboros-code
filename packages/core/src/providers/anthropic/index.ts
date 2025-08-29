import Anthropic from '@anthropic-ai/sdk';
import type { Message, Provider, ProviderOptions, StreamingResponse, ToolCall } from '../types.js';

export class AnthropicProvider implements Provider {
  name = 'Anthropic';
  private client: Anthropic;
  private defaultModel: string;
  
  constructor(options: ProviderOptions = {}) {
    this.client = new Anthropic({
      apiKey: options.apiKey || process.env['ANTHROPIC_API_KEY'],
    });
    this.defaultModel = options.model || 'claude-3-5-sonnet-20241022';
  }
  
  async *generateResponse(
    messages: Message[],
    options: ProviderOptions = {},
    tools?: any[]
  ): AsyncIterable<StreamingResponse> {
    // Separate system message from conversation
    const systemMessage = messages.find(m => m.role === 'system')?.content || options.systemPrompt;
    const conversationMessages = messages.filter(m => m.role !== 'system');
    
    const stream = await this.client.messages.create({
      model: options.model || this.defaultModel,
      messages: conversationMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      system: systemMessage,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens || 4096,
      stream: true,
      tools: tools?.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
      })),
    });
    
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { content: event.delta.text };
      }
      
      if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
        const toolCall: ToolCall = {
          id: event.content_block.id,
          type: 'function',
          function: {
            name: event.content_block.name,
            arguments: '',
          },
        };
        yield { toolCalls: [toolCall] };
      }
      
      if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
        // Accumulate tool arguments - in production, you'd buffer these
        yield { content: event.delta.partial_json };
      }
      
      if (event.type === 'message_stop') {
        yield { done: true };
      }
    }
  }
  
  async generateCompletion(
    messages: Message[],
    options: ProviderOptions = {},
    tools?: any[]
  ): Promise<string> {
    // Separate system message from conversation
    const systemMessage = messages.find(m => m.role === 'system')?.content || options.systemPrompt;
    const conversationMessages = messages.filter(m => m.role !== 'system');
    
    const response = await this.client.messages.create({
      model: options.model || this.defaultModel,
      messages: conversationMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      system: systemMessage,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens || 4096,
      tools: tools?.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
      })),
    });
    
    if (response.content[0]?.type === 'text') {
      return response.content[0].text;
    }
    
    return '';
  }
}