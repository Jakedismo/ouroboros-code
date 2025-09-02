import Anthropic from '@anthropic-ai/sdk';
import type { Message, Provider, ProviderOptions, StreamingResponse, ToolCall } from '../types.js';
import { convertToAnthropicTools } from './tool-adapter.js';

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
      tools: tools && tools.length > 0 ? convertToAnthropicTools(tools) : undefined,
    });
    
    // Buffer for accumulating tool arguments
    const toolCallsInProgress: Map<string, ToolCall> = new Map();
    
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { content: event.delta.text };
      }
      
      if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
        // Start of a new tool call
        const toolCall: ToolCall = {
          id: event.content_block.id,
          type: 'function',
          function: {
            name: event.content_block.name,
            arguments: '',
          },
        };
        toolCallsInProgress.set(event.content_block.id, toolCall);
      }
      
      if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
        // Accumulate tool arguments
        const blockId = (event as any).index || 'default';
        const toolCall = toolCallsInProgress.get(blockId);
        if (toolCall) {
          toolCall.function.arguments += event.delta.partial_json;
        }
      }
      
      if (event.type === 'content_block_stop' && (event as any).content_block?.type === 'tool_use') {
        // Tool call is complete, yield it
        const blockId = (event as any).content_block?.id;
        const toolCall = toolCallsInProgress.get(blockId);
        if (toolCall) {
          yield { toolCalls: [toolCall] };
          toolCallsInProgress.delete(blockId);
        }
      }
      
      if (event.type === 'message_stop') {
        // Yield any remaining tool calls
        if (toolCallsInProgress.size > 0) {
          yield { toolCalls: Array.from(toolCallsInProgress.values()) };
          toolCallsInProgress.clear();
        }
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
      tools: tools && tools.length > 0 ? convertToAnthropicTools(tools) : undefined,
    });
    
    if (response.content[0]?.type === 'text') {
      return response.content[0].text;
    }
    
    return '';
  }
}