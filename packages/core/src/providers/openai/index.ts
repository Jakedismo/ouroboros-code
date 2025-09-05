import OpenAI from 'openai';
import type { Message, Provider, ProviderOptions, StreamingResponse, ToolCall } from '../types.js';
import { convertToOpenAITools } from './tool-adapter.js';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions.js';

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
  
  // Models that don't support response_format (legacy models)
  private readonly modelsWithoutResponseFormat = new Set([
    'gpt-3.5-turbo',
    'gpt-3.5-turbo-0613',
    'text-davinci-003',
    // Most modern models support structured outputs
  ]);
  
  // Models that support structured outputs (with JSON schema)
  private readonly modelsWithStructuredOutputs = new Set([
    'gpt-4o',
    'gpt-4o-2024-08-06',
    'gpt-4o-mini',
    'gpt-4o-mini-2024-07-18',
    'gpt-4-turbo',
    'gpt-4-turbo-2024-04-09',
    'gpt-4',
    'gpt-5',
    'gpt-5-nano',
    'o3',
    'o3-mini',
    'o3-pro', 
    'o4-mini',
    // Add more models as they gain structured outputs support
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
  
  private supportsResponseFormat(model: string): boolean {
    // Check if the model supports response_format
    const supportsFormat = !this.modelsWithoutResponseFormat.has(model);
    if (!supportsFormat) {
      console.log(`[OpenAI] Model ${model} does not support response_format, excluding from request`);
    }
    return supportsFormat;
  }
  
  private supportsStructuredOutputs(model: string): boolean {
    // Check if the model supports structured outputs (JSON schema)
    const supportsStructured = this.modelsWithStructuredOutputs.has(model);
    if (supportsStructured) {
      console.log(`[OpenAI] Model ${model} supports structured outputs with JSON schema`);
    }
    return supportsStructured;
  }
  
  async *generateResponse(
    messages: Message[],
    options: ProviderOptions = {},
    tools?: any[]
  ): AsyncIterable<StreamingResponse> {
    const model = options.model || this.defaultModel;
    
    // Convert messages to OpenAI format
    const openaiMessages: ChatCompletionMessageParam[] = messages.map(m => {
      const baseMessage = { content: m.content };
      
      switch (m.role) {
        case 'user':
          return { ...baseMessage, role: 'user' as const };
        case 'assistant':
          return { ...baseMessage, role: 'assistant' as const };
        case 'system':
          return { ...baseMessage, role: 'system' as const };
        case 'tool':
          return {
            ...baseMessage,
            role: 'tool' as const,
            tool_call_id: m.tool_call_id || '',
            ...(m.name && { name: m.name }),
          };
        default:
          return { ...baseMessage, role: 'user' as const };
      }
    });
    
    // Convert tools to OpenAI format
    const openaiTools: ChatCompletionTool[] | undefined = tools && tools.length > 0 
      ? convertToOpenAITools(tools) 
      : undefined;
    
    console.log('[OpenAI Provider] Using modern API patterns with tools:', openaiTools?.length || 0);
    
    // If we have tools, use the new runTools pattern for better handling
    if (openaiTools && openaiTools.length > 0) {
      yield* this.generateResponseWithTools(openaiMessages, openaiTools, model, options);
    } else {
      yield* this.generateResponseWithoutTools(openaiMessages, model, options);
    }
  }
  
  async generateCompletion(
    messages: Message[],
    options: ProviderOptions = {},
    tools?: any[]
  ): Promise<string> {
    const model = options.model || this.defaultModel;
    
    // Convert messages to OpenAI format
    const openaiMessages: ChatCompletionMessageParam[] = messages.map(m => {
      const baseMessage = { content: m.content };
      
      switch (m.role) {
        case 'user':
          return { ...baseMessage, role: 'user' as const };
        case 'assistant':
          return { ...baseMessage, role: 'assistant' as const };
        case 'system':
          return { ...baseMessage, role: 'system' as const };
        case 'tool':
          return {
            ...baseMessage,
            role: 'tool' as const,
            tool_call_id: m.tool_call_id || '',
            ...(m.name && { name: m.name }),
          };
        default:
          return { ...baseMessage, role: 'user' as const };
      }
    });
    
    // Convert tools to OpenAI format
    const openaiTools: ChatCompletionTool[] | undefined = tools && tools.length > 0 
      ? convertToOpenAITools(tools) 
      : undefined;
    
    console.log('[OpenAI Provider] Using modern completion API with tools:', openaiTools?.length || 0);
    
    // If we have tools, use the new runTools pattern for better handling
    if (openaiTools && openaiTools.length > 0) {
      return await this.generateCompletionWithTools(openaiMessages, openaiTools, model, options);
    } else {
      return await this.generateCompletionWithoutTools(openaiMessages, model, options);
    }
  }
  
  /**
   * Modern streaming approach with tools using new OpenAI patterns
   */
  private async *generateResponseWithTools(
    messages: ChatCompletionMessageParam[],
    tools: ChatCompletionTool[],
    model: string,
    options: ProviderOptions
  ): AsyncIterable<StreamingResponse> {
    const requestParams = this.buildRequestParams(model, options, true);
    requestParams.messages = messages;
    requestParams.tools = tools;
    
    // Add modern tool choice parameter
    if (options.tool_choice !== undefined) {
      (requestParams as any).tool_choice = options.tool_choice;
    }
    
    // Enable parallel tool calls for better performance
    if (options.parallel_tool_calls !== undefined) {
      (requestParams as any).parallel_tool_calls = options.parallel_tool_calls;
    } else {
      // Default to true for modern models that support it
      (requestParams as any).parallel_tool_calls = true;
    }
    
    console.log('[OpenAI Provider] Modern streaming with tools:', {
      toolCount: tools.length,
      toolChoice: options.tool_choice,
      parallelCalls: (requestParams as any).parallel_tool_calls
    });
    
    try {
      console.log(`[OpenAI Provider] Creating stream with params:`, JSON.stringify(requestParams, null, 2));
      const stream = await this.client.chat.completions.create({
        ...requestParams,
        stream: true,
      } as OpenAI.Chat.ChatCompletionCreateParamsStreaming);
      
      console.log(`[OpenAI Provider] Stream created, starting to process chunks...`);
      let toolCallBuffer: { [id: string]: { name?: string, arguments?: string } } = {};
      let chunkCount = 0;
      
      for await (const chunk of stream) {
        chunkCount++;
        
        const delta = chunk.choices[0]?.delta;
        
        // Only log chunks that have actual content or tool calls for debugging
        if (delta?.content || delta?.tool_calls) {
          console.log(`[OpenAI Provider] Content/Tool Chunk ${chunkCount}:`, JSON.stringify(chunk, null, 2));
        }
        
        if (delta?.content) {
          yield { content: delta.content };
        }
        
        // Handle tool calls with improved buffering for parallel calls
        if (delta?.tool_calls) {
          console.log(`[OpenAI Provider] Processing ${delta.tool_calls.length} tool calls in chunk ${chunkCount}`);
          for (const toolCall of delta.tool_calls) {
            // Handle tool call ID resolution - OpenAI sometimes sends arguments without ID
            let id = toolCall.id;
            
            // If no ID provided but we have function data, try to match with existing buffer
            if (!id && (toolCall.function?.name || toolCall.function?.arguments)) {
              // Look for an existing buffer that matches the function name or is expecting arguments
              const existingIds = Object.keys(toolCallBuffer);
              if (existingIds.length === 1) {
                // If there's only one active tool call, assume this chunk belongs to it
                id = existingIds[0];
                console.log(`[OpenAI Provider] No ID in chunk, assigning to existing tool call: ${id}`);
              } else if (toolCall.function?.name) {
                // Try to find buffer by function name
                id = existingIds.find(existingId => 
                  toolCallBuffer[existingId].name === toolCall.function!.name
                ) || `tool_${Date.now()}_${Math.random()}`;
                console.log(`[OpenAI Provider] Matched by function name to: ${id}`);
              } else {
                // Create a temporary ID for orphaned arguments
                id = `orphaned_${Date.now()}_${Math.random()}`;
                console.log(`[OpenAI Provider] Created orphaned ID for arguments: ${id}`);
              }
            } else if (!id) {
              // Fallback ID if nothing else works
              id = `fallback_${Date.now()}_${Math.random()}`;
              console.log(`[OpenAI Provider] Using fallback ID: ${id}`);
            }
            
            console.log(`[OpenAI Provider] Tool call ${id}:`, JSON.stringify(toolCall, null, 2));
            
            if (!toolCallBuffer[id]) {
              toolCallBuffer[id] = {};
              console.log(`[OpenAI Provider] Created new buffer for tool call ${id}`);
            }
            
            const buffer = toolCallBuffer[id];
            
            if (toolCall.function?.name) {
              buffer.name = toolCall.function.name;
              console.log(`[OpenAI Provider] Set tool name for ${id}: ${buffer.name}`);
            }
            
            if (toolCall.function?.arguments) {
              buffer.arguments = (buffer.arguments || '') + toolCall.function.arguments;
              console.log(`[OpenAI Provider] Appended args for ${id}, total length: ${buffer.arguments?.length || 0}`);
            }
            
            // Yield complete tool calls
            if (buffer.name && buffer.arguments && this.isValidJSON(buffer.arguments)) {
              console.log(`[OpenAI Provider] Tool call ${id} complete, yielding:`, buffer);
              const toolCalls: ToolCall[] = [{
                id: id,
                type: 'function' as const,
                function: {
                  name: buffer.name,
                  arguments: buffer.arguments,
                },
              }];
              yield { toolCalls };
              delete toolCallBuffer[id]; // Clear buffer after yielding
            }
          }
        }
        
        if (chunk.choices[0]?.finish_reason) {
          console.log(`[OpenAI Provider] Stream finished with reason:`, chunk.choices[0].finish_reason);
          
          // Handle incomplete tool calls when stream finishes with tool_calls
          if (chunk.choices[0].finish_reason === 'tool_calls' && Object.keys(toolCallBuffer).length > 0) {
            console.warn('[OpenAI Provider] Stream finished with tool_calls but buffer has incomplete calls:', toolCallBuffer);
            
            // First, try to merge orphaned arguments with named tool calls
            const namedCalls: { [key: string]: any } = {};
            const orphanedArgs: { [key: string]: any } = {};
            
            for (const [id, buffer] of Object.entries(toolCallBuffer)) {
              if (buffer.name && !buffer.arguments) {
                namedCalls[id] = buffer;
              } else if (!buffer.name && buffer.arguments) {
                orphanedArgs[id] = buffer;
              }
            }
            
            // Try to match orphaned arguments with named calls
            for (const [orphanId, orphanBuffer] of Object.entries(orphanedArgs)) {
              const namedIds = Object.keys(namedCalls);
              if (namedIds.length === 1) {
                // Single named call - assign orphaned args to it
                const namedId = namedIds[0];
                console.log(`[OpenAI Provider] Merging orphaned args from ${orphanId} to named call ${namedId}`);
                namedCalls[namedId].arguments = orphanBuffer.arguments;
                delete toolCallBuffer[orphanId]; // Remove orphaned entry
                toolCallBuffer[namedId] = namedCalls[namedId]; // Update buffer
              }
            }
            
            // Now try to yield all tool calls with better error handling
            for (const [id, buffer] of Object.entries(toolCallBuffer)) {
              if (buffer.name) {
                // Even if arguments are malformed, try to parse what we have
                const args = buffer.arguments || '{}';
                console.warn(`[OpenAI Provider] Attempting to yield incomplete tool call ${id} with args:`, args);
                
                // Try to fix common JSON issues
                let fixedArgs = args;
                if (args === '"}' || args === '}' || args === '"') {
                  fixedArgs = '{}';
                } else if (!args.startsWith('{')) {
                  fixedArgs = '{' + args;
                }
                if (!fixedArgs.endsWith('}')) {
                  fixedArgs = fixedArgs + '}';
                }
                
                // Validate the fixed JSON
                try {
                  JSON.parse(fixedArgs);
                } catch {
                  console.error(`[OpenAI Provider] Could not fix malformed JSON for tool ${buffer.name}:`, args);
                  fixedArgs = '{}'; // Fallback to empty object
                }
                
                const toolCalls: ToolCall[] = [{
                  id: id.startsWith('orphaned_') || id.startsWith('fallback_') ? `repaired_${Date.now()}` : id,
                  type: 'function' as const,
                  function: {
                    name: buffer.name,
                    arguments: fixedArgs,
                  },
                }];
                
                console.log(`[OpenAI Provider] Yielding repaired tool call:`, toolCalls);
                yield { toolCalls };
              }
            }
            
            // Clear the buffer
            Object.keys(toolCallBuffer).forEach(key => delete toolCallBuffer[key]);
          }
          
          yield { done: true };
        }
      }
      console.log(`[OpenAI Provider] Stream processing completed, processed ${chunkCount} chunks total`);
    } catch (error) {
      console.error('[OpenAI Provider] Streaming with tools error:', error);
      throw error;
    }
  }
  
  /**
   * Modern streaming approach without tools
   */
  private async *generateResponseWithoutTools(
    messages: ChatCompletionMessageParam[],
    model: string,
    options: ProviderOptions
  ): AsyncIterable<StreamingResponse> {
    const requestParams = this.buildRequestParams(model, options, true);
    requestParams.messages = messages;
    
    console.log('[OpenAI Provider] Modern streaming without tools');
    
    try {
      const stream = await this.client.chat.completions.create({
        ...requestParams,
        stream: true,
      } as OpenAI.Chat.ChatCompletionCreateParamsStreaming);
      
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        
        if (delta?.content) {
          yield { content: delta.content };
        }
        
        if (chunk.choices[0]?.finish_reason) {
          yield { done: true };
        }
      }
    } catch (error) {
      console.error('[OpenAI Provider] Streaming without tools error:', error);
      throw error;
    }
  }

  /**
   * Generate completion with structured output using Chat Completions API (for agent selection)
   */
  async generateCompletionStructured(
    messages: Message[],
    options: ProviderOptions & { response_format: any }
  ): Promise<string> {
    const model = options.model || this.defaultModel;
    
    // Convert messages to OpenAI format
    const openaiMessages: ChatCompletionMessageParam[] = messages.map(m => {
      const baseMessage = { content: m.content };
      
      switch (m.role) {
        case 'user':
          return { ...baseMessage, role: 'user' as const };
        case 'assistant':
          return { ...baseMessage, role: 'assistant' as const };
        case 'system':
          return { ...baseMessage, role: 'system' as const };
        case 'tool':
          return {
            ...baseMessage,
            role: 'tool' as const,
            tool_call_id: m.tool_call_id || '',
            ...(m.name && { name: m.name }),
          };
        default:
          return { ...baseMessage, role: 'user' as const };
      }
    });
    
    console.log('[OpenAI Provider] Using Chat Completions API for structured output with format:', options.response_format);
    
    try {
      const params: any = {
        model,
        messages: openaiMessages,
        temperature: options.temperature ?? 0.1,
        response_format: options.response_format,
      };

      if (options.maxTokens) {
        if (this.modelsWithMaxCompletionTokens.has(model)) {
          params.max_completion_tokens = options.maxTokens;
        } else {
          params.max_tokens = options.maxTokens;
        }
      }

      console.log('[OpenAI Provider] Chat completion params:', JSON.stringify(params, null, 2));
      
      const completion = await this.client.chat.completions.create(params);
      
      const content = completion.choices[0]?.message?.content || '';
      console.log('[OpenAI Provider] Structured response received:', content.substring(0, 200));
      
      return content;
    } catch (error) {
      console.error('[OpenAI Provider] Structured completion error:', error);
      throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Modern completion approach with tools using new OpenAI patterns
   */
  private async generateCompletionWithTools(
    messages: ChatCompletionMessageParam[],
    tools: ChatCompletionTool[],
    model: string,
    options: ProviderOptions
  ): Promise<string> {
    const requestParams = this.buildRequestParams(model, options, false);
    requestParams.messages = messages;
    requestParams.tools = tools;
    
    // Add modern tool choice parameter
    if (options.tool_choice !== undefined) {
      (requestParams as any).tool_choice = options.tool_choice;
    }
    
    // Enable parallel tool calls for better performance
    if (options.parallel_tool_calls !== undefined) {
      (requestParams as any).parallel_tool_calls = options.parallel_tool_calls;
    } else {
      // Default to true for modern models that support it
      (requestParams as any).parallel_tool_calls = true;
    }
    
    console.log('[OpenAI Provider] Modern completion with tools:', {
      toolCount: tools.length,
      toolChoice: options.tool_choice,
      parallelCalls: (requestParams as any).parallel_tool_calls,
      model: model
    });
    
    try {
      const response = await this.client.chat.completions.create(requestParams);
      const content = response.choices[0]?.message?.content || '';
      
      console.log('[OpenAI Provider] Completion response (first 500 chars):', content.substring(0, 500));
      return content;
    } catch (error) {
      console.error('[OpenAI Provider] Completion with tools error:', error);
      throw error;
    }
  }
  
  /**
   * Modern completion approach without tools
   */
  private async generateCompletionWithoutTools(
    messages: ChatCompletionMessageParam[],
    model: string,
    options: ProviderOptions
  ): Promise<string> {
    const requestParams = this.buildRequestParams(model, options, false);
    requestParams.messages = messages;
    
    console.log('[OpenAI Provider] Modern completion without tools, model:', model);
    
    try {
      const response = await this.client.chat.completions.create(requestParams);
      const content = response.choices[0]?.message?.content || '';
      
      console.log('[OpenAI Provider] Completion response (first 500 chars):', content.substring(0, 500));
      return content;
    } catch (error) {
      console.error('[OpenAI Provider] Completion without tools error:', error);
      throw error;
    }
  }
  
  /**
   * Build request parameters with modern OpenAI patterns
   */
  private buildRequestParams(model: string, options: ProviderOptions, streaming: boolean): any {
    const includeParams = this.shouldIncludeParams(model);
    const useMaxCompletionTokens = this.modelsWithMaxCompletionTokens.has(model);
    const supportsCustomTemp = this.supportsCustomTemperature(model);
    
    const requestParams: any = {
      model,
    };
    
    // Add temperature only for models that support custom temperature
    if (includeParams && supportsCustomTemp) {
      requestParams.temperature = options.temperature !== undefined ? options.temperature : 0.7;
    }
    
    // Handle max_tokens vs max_completion_tokens
    if (includeParams) {
      if (useMaxCompletionTokens) {
        requestParams.max_completion_tokens = options.maxTokens !== undefined ? options.maxTokens : 25000;
      } else {
        if (options.maxTokens !== undefined) {
          requestParams.max_tokens = options.maxTokens;
        }
      }
    }
    
    // Add reasoning effort for models that support it
    if (options.reasoning_effort && this.modelsWithMaxCompletionTokens.has(model)) {
      requestParams.reasoning_effort = options.reasoning_effort;
    }
    
    // Add response_format with modern structured outputs
    if (options.response_format && this.supportsResponseFormat(model)) {
      if (this.supportsStructuredOutputs(model) && (options.response_format as any).type === 'json_schema') {
        // Use structured outputs for modern models
        requestParams.response_format = options.response_format;
      } else if (!this.supportsStructuredOutputs(model) && options.response_format.type === 'json_object') {
        // Fallback to JSON mode for legacy models
        requestParams.response_format = { type: 'json_object' };
      }
    }
    
    return requestParams;
  }
  
  /**
   * Check if a string is valid JSON
   */
  private isValidJSON(str: string): boolean {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }
}