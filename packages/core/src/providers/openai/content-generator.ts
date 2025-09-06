/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  Content,
  ContentListUnion,
} from '@google/genai';
import type { ContentGenerator } from '../../core/contentGenerator.js';
import { OpenAIProvider } from './index.js';

/**
 * OpenAI ContentGenerator that implements the ContentGenerator interface
 * using the OpenAI Provider for actual API calls
 */
export class OpenAIContentGenerator implements ContentGenerator {
  private provider: OpenAIProvider;

  constructor(private apiKey: string, private model: string = 'gpt-5') {
    // Ensure we use the provided model, defaulting to gpt-5 if not specified
    console.log('[OpenAI ContentGenerator] Initializing with model:', this.model);
    this.provider = new OpenAIProvider({
      apiKey: this.apiKey,
      model: this.model,
    });
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    // Convert Gemini request format to our unified message format
    const messages = this.convertToMessages(request.contents);
    
    try {
      // Extract tools from config (they come from GeminiChat's generationConfig.tools)
      const tools = request.config?.tools || [];
      console.log('[OpenAI Content Generator] Tools received:', JSON.stringify(tools, null, 2));
      
      // Pass model to provider so it can filter parameters appropriately
      // Use the model from request if provided, otherwise fall back to this.model
      const modelToUse = request.model || this.model;
      console.log('[OpenAI Content Generator] Model to use:', modelToUse, 'Request model:', request.model, 'Default model:', this.model);
      
      // Extract all config parameters for debugging
      console.log('[OpenAI Content Generator] Full config:', JSON.stringify(request.config, null, 2));
      
      // For structured output (agent selection), use Chat Completions API instead of Responses API
      if ((request.config as any)?.response_format) {
        console.log('[OpenAI ContentGenerator] Using Chat Completions API for structured output');
        const response = await this.provider.generateCompletionStructured(messages, {
          model: modelToUse,
          temperature: request.config?.temperature,
          maxTokens: request.config?.maxOutputTokens,
          response_format: (request.config as any).response_format,
        });
        return {
          candidates: [
            {
              content: {
                parts: [{ text: response }],
                role: 'model',
              },
              finishReason: 'STOP' as any,
              index: 0,
            },
          ],
          usageMetadata: {
            promptTokenCount: 0,
            candidatesTokenCount: 0,
            totalTokenCount: 0,
          },
        } as GenerateContentResponse;
      }

      // Regular generation - use standard generateCompletion
      const response = await this.provider.generateCompletion(messages, {
        model: modelToUse,
        temperature: request.config?.temperature,
        maxTokens: request.config?.maxOutputTokens,
        // Pass through any reasoning/thinking parameters if they exist
        ...((request.config as any)?.reasoning_effort && { reasoning_effort: (request.config as any).reasoning_effort }),
        ...((request.config as any)?.response_format && { response_format: (request.config as any).response_format }),
        // Pass through modern OpenAI function calling parameters
        ...((request.config as any)?.tool_choice && { tool_choice: (request.config as any).tool_choice }),
        ...((request.config as any)?.parallel_tool_calls !== undefined && { parallel_tool_calls: (request.config as any).parallel_tool_calls }),
      }, tools); // Pass tools as separate parameter

      // Convert back to Gemini response format
      return {
        candidates: [
          {
            content: {
              parts: [{ text: response }],
              role: 'model',
            },
            finishReason: 'STOP' as any,
            index: 0,
          },
        ],
        usageMetadata: {
          promptTokenCount: 0, // OpenAI doesn't return this in completion mode
          candidatesTokenCount: 0,
          totalTokenCount: 0,
        },
      } as GenerateContentResponse;
    } catch (error) {
      throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const self = this;
    
    async function* streamGenerator(): AsyncGenerator<GenerateContentResponse> {
      // Convert Gemini request format to our unified message format
      const messages = self.convertToMessages(request.contents);
      
      // Log message details for debugging
      console.log('[OpenAI ContentGenerator] Converted messages for streaming:');
      messages.forEach((msg, idx) => {
        const extras: string[] = [];
        if (msg.tool_call_id) extras.push(`tool_call_id=${msg.tool_call_id}`);
        if (msg.name) extras.push(`name=${msg.name}`);
        if ((msg as any).tool_calls) {
          extras.push(`tool_calls=${(msg as any).tool_calls.length}`);
          // Log the actual tool calls for debugging
          console.log(`    Tool calls at message ${idx}:`, JSON.stringify((msg as any).tool_calls, null, 2));
        }
        const contentLength = msg.content ? msg.content.length : 0;
        console.log(`  ${idx}: role=${msg.role}, content_length=${contentLength}${extras.length ? ', ' + extras.join(', ') : ''}`);
        
        // If this is a tool message, check if previous message has tool_calls
        if (msg.role === 'tool' && idx > 0) {
          const prevMsg = messages[idx - 1];
          console.log(`    Previous message (${idx - 1}): role=${prevMsg.role}, has tool_calls=${!!(prevMsg as any).tool_calls}`);
          if (prevMsg.role !== 'assistant' || !(prevMsg as any).tool_calls) {
            console.error(`    ERROR: Tool message at index ${idx} doesn't have preceding assistant message with tool_calls!`);
          }
        }
      });
      
      try {
        // Extract tools from config (they come from GeminiChat's generationConfig.tools)
        const tools = request.config?.tools || [];
        
        // Use the model from request if provided, otherwise fall back to self.model
        const modelToUse = request.model || self.model;
        console.log('[OpenAI Streaming] Model to use:', modelToUse, 'Config:', JSON.stringify(request.config, null, 2));
        
        console.log('[OpenAI ContentGenerator] About to call provider.generateResponse with', messages.length, 'messages...');
        // Convert messages to the format expected by provider
        const providerMessages = messages.map(msg => {
          const baseMsg: any = { role: msg.role, content: msg.content };
          if (msg.tool_call_id) baseMsg.tool_call_id = msg.tool_call_id;
          if (msg.name && msg.role === 'tool') baseMsg.name = msg.name;
          // CRITICAL: Include tool_calls for assistant messages that made tool calls
          if ((msg as any).tool_calls) baseMsg.tool_calls = (msg as any).tool_calls;
          return baseMsg;
        });
        
        const stream = self.provider.generateResponse(providerMessages, {
          model: modelToUse,
          temperature: request.config?.temperature,
          maxTokens: request.config?.maxOutputTokens,
          // Pass through any reasoning/thinking parameters if they exist
          ...((request.config as any)?.reasoning_effort && { reasoning_effort: (request.config as any).reasoning_effort }),
          // Pass through modern OpenAI function calling parameters
          ...((request.config as any)?.tool_choice && { tool_choice: (request.config as any).tool_choice }),
          ...((request.config as any)?.parallel_tool_calls !== undefined && { parallel_tool_calls: (request.config as any).parallel_tool_calls }),
        }, tools); // Pass tools as separate parameter
        
        console.log('[OpenAI ContentGenerator] Provider.generateResponse returned, starting to iterate...');
        let chunkCount = 0;
        for await (const chunk of stream) {
          chunkCount++;
          console.log(`[OpenAI ContentGenerator] Processing chunk ${chunkCount}:`, JSON.stringify(chunk, null, 2));
          if (chunk.content) {
            yield {
              candidates: [
                {
                  content: {
                    parts: [{ text: chunk.content }],
                    role: 'model',
                  },
                  finishReason: chunk.done ? ('STOP' as any) : undefined,
                  index: 0,
                },
              ],
              usageMetadata: {
                promptTokenCount: 0,
                candidatesTokenCount: 0,
                totalTokenCount: 0,
              },
            } as GenerateContentResponse;
          }
          
          // Handle tool calls from OpenAI
          if (chunk.toolCalls && chunk.toolCalls.length > 0) {
            const functionCalls = chunk.toolCalls.map(tc => ({
              id: tc.id, // CRITICAL: Include the ID for Turn class to track tool calls
              name: tc.function.name,
              args: tc.function.arguments ? JSON.parse(tc.function.arguments) : {},
            }));
            
            console.log(`[OpenAI ContentGenerator] Yielding ${functionCalls.length} function calls with IDs:`, functionCalls.map(fc => ({ id: fc.id, name: fc.name })));
            
            yield {
              candidates: [
                {
                  content: {
                    parts: functionCalls.map(fc => ({
                      functionCall: fc,
                    })),
                    role: 'model',
                  },
                  finishReason: chunk.done ? ('STOP' as any) : undefined,
                  index: 0,
                },
              ],
              usageMetadata: {
                promptTokenCount: 0,
                candidatesTokenCount: 0,
                totalTokenCount: 0,
              },
            } as GenerateContentResponse;
          }
        }
        console.log(`[OpenAI ContentGenerator] Finished processing ${chunkCount} chunks`);
      } catch (error) {
        console.error('[OpenAI ContentGenerator] Stream error:', error);
        throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return streamGenerator();
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // OpenAI doesn't have a direct token counting API
    // We'll estimate based on content length (rough approximation)
    let content = '';
    if (typeof request.contents === 'string') {
      content = request.contents;
    } else if (Array.isArray(request.contents)) {
      // Check if it's Content[] or PartUnion[]
      const firstItem = request.contents[0];
      if (firstItem && typeof firstItem === 'object' && 'parts' in firstItem) {
        // This is Content[]
        content = request.contents.map((c: any) => 
          c.parts?.map((p: any) => p.text || '').join('') || ''
        ).join('');
      } else {
        // This is PartUnion[]
        content = request.contents.map((p: any) => (p as any).text || '').join('');
      }
    } else if (request.contents && typeof request.contents === 'object' && 'parts' in request.contents) {
      // Single Content object
      content = (request.contents as any).parts?.map((p: any) => p.text || '').join('') || '';
    } else if (request.contents) {
      // Single PartUnion
      content = (request.contents as any).text || '';
    }
    
    // Rough approximation: ~4 characters per token
    const estimatedTokens = Math.ceil(content.length / 4);
    
    return {
      totalTokens: estimatedTokens,
    };
  }

  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    // OpenAI embeddings would require a separate API call
    // For now, throw an error since this is not commonly used
    throw new Error('Embeddings not yet supported for OpenAI provider');
  }

  private convertToMessages(contents: ContentListUnion): Array<{role: 'user' | 'assistant' | 'system' | 'tool', content: string, tool_call_id?: string, name?: string, tool_calls?: any[]}> {
    // Add debugging to see what we're receiving
    console.log('[OpenAI ContentGenerator] convertToMessages input type:', typeof contents);
    console.log('[OpenAI ContentGenerator] convertToMessages isArray:', Array.isArray(contents));
    if (Array.isArray(contents)) {
      console.log('[OpenAI ContentGenerator] Array length:', contents.length);
      contents.forEach((item, index) => {
        console.log(`[OpenAI ContentGenerator] Item ${index} type:`, typeof item);
        if (typeof item === 'object' && item !== null) {
          console.log(`[OpenAI ContentGenerator] Item ${index} keys:`, Object.keys(item));
          console.log(`[OpenAI ContentGenerator] Item ${index} role:`, (item as any).role);
          // Also log if it contains function responses
          if ((item as any).role === 'function' && (item as any).parts) {
            console.log(`[OpenAI ContentGenerator] Function response at ${index}, parts:`, 
              (item as any).parts.map((p: any) => Object.keys(p)));
          }
          // Log model messages with function calls
          if ((item as any).role === 'model' && (item as any).parts) {
            const functionCallParts = (item as any).parts.filter((p: any) => p.functionCall);
            if (functionCallParts.length > 0) {
              console.log(`[OpenAI ContentGenerator] Model message at ${index} has ${functionCallParts.length} function calls`);
              functionCallParts.forEach((fc: any) => {
                console.log(`  Function call:`, JSON.stringify(fc.functionCall, null, 2));
              });
            }
          }
        }
        if (typeof item === 'string') {
          console.log(`[OpenAI ContentGenerator] Item ${index} string value (first 100 chars):`, item.substring(0, 100));
        }
      });
    }
    
    // Handle string contents
    if (typeof contents === 'string') {
      console.log('[OpenAI ContentGenerator] Processing single string as user message');
      return [{ role: 'user', content: contents }];
    }

    if (!Array.isArray(contents)) {
      console.error('[OpenAI ContentGenerator] Invalid contents type:', typeof contents);
      throw new Error('Contents must be string or array');
    }

    const messages: Array<{role: 'user' | 'assistant' | 'system' | 'tool', content: string, tool_call_id?: string, name?: string, tool_calls?: any[]}> = [];
    
    // Track tool calls to match with responses
    const pendingToolCalls = new Map<string, any>();

    // Process each item in the array
    for (let i = 0; i < contents.length; i++) {
      const item = contents[i];
      console.log(`[OpenAI ContentGenerator] Processing item ${i}, type: ${typeof item}`);
      
      if (typeof item === 'string') {
        // Raw string - treat as user message
        console.log(`[OpenAI ContentGenerator] Adding raw string as user message at index ${i}`);
        messages.push({ role: 'user', content: item });
      } else if (item && typeof item === 'object') {
        if ('role' in item && 'parts' in item) {
          // This is a Content object
          const content = item as Content;
          
          // Handle function/tool responses specially for OpenAI
          if (content.role === 'function') {
            console.log(`[OpenAI ContentGenerator] Processing function response at index ${i}`);
            // Extract function response from Gemini format
            const functionParts = content.parts?.filter(part => (part as any).functionResponse);
            if (functionParts && functionParts.length > 0) {
              // Check if we need to add the assistant message with tool_calls first
              // This happens when tools are executed but the assistant message wasn't added
              const toolResponses: any[] = [];
              
              for (const part of functionParts) {
                const fnResponse = (part as any).functionResponse;
                const responseText = typeof fnResponse.response === 'string' 
                  ? fnResponse.response 
                  : fnResponse.response?.text || fnResponse.response?.output || JSON.stringify(fnResponse.response);
                
                // Generate tool call ID if not present
                const toolCallId = fnResponse.id || fnResponse.callId || fnResponse.tool_call_id || `call_${fnResponse.name}_${Date.now()}`;
                
                toolResponses.push({
                  toolCallId,
                  name: fnResponse.name,
                  content: responseText
                });
              }
              
              // Check if the last message is an assistant message with tool_calls
              const lastMessage = messages[messages.length - 1];
              const hasAssistantWithToolCalls = lastMessage && 
                lastMessage.role === 'assistant' && 
                (lastMessage as any).tool_calls && 
                (lastMessage as any).tool_calls.length > 0;
              
              if (!hasAssistantWithToolCalls) {
                // We need to synthesize an assistant message with tool_calls
                // This happens when tools are executed directly without the assistant message
                console.log(`[OpenAI ContentGenerator] Synthesizing assistant message with tool_calls for ${toolResponses.length} tool responses`);
                
                const syntheticToolCalls = toolResponses.map(tr => ({
                  id: tr.toolCallId,
                  type: 'function',
                  function: {
                    name: tr.name,
                    arguments: '{}' // We don't have the original arguments, so use empty
                  }
                }));
                
                messages.push({
                  role: 'assistant',
                  content: null, // OpenAI allows null content when there are tool_calls
                  tool_calls: syntheticToolCalls
                } as any);
                
                console.log(`[OpenAI ContentGenerator] Added synthetic assistant message with ${syntheticToolCalls.length} tool calls`);
              }
              
              // Now add the tool responses
              for (const tr of toolResponses) {
                messages.push({ 
                  role: 'tool', 
                  content: tr.content,
                  tool_call_id: tr.toolCallId,
                  name: tr.name
                });
                console.log(`[OpenAI ContentGenerator] Added tool response for ${tr.name} with tool_call_id ${tr.toolCallId}`);
              }
            }
          } else {
            // Handle regular messages
            const role = content.role === 'user' ? 'user' : content.role === 'model' ? 'assistant' : 'system';
            
            // Extract text parts
            const textParts: string[] = [];
            const toolCalls: any[] = [];
            
            content.parts?.forEach(part => {
              if ((part as any).text) {
                textParts.push((part as any).text);
              } else if ((part as any).functionCall) {
                // Store function call for OpenAI format
                const fnCall = (part as any).functionCall;
                const callId = fnCall.id || `call_${Date.now()}_${Math.random().toString(16).slice(2)}`;
                toolCalls.push({
                  id: callId,
                  type: 'function',
                  function: {
                    name: fnCall.name,
                    arguments: typeof fnCall.args === 'string' ? fnCall.args : JSON.stringify(fnCall.args || {})
                  }
                });
                // Track this tool call
                pendingToolCalls.set(callId, fnCall);
              }
              // Skip function responses as they're handled above
            });
            
            const text = textParts.join('');
            
            // For assistant messages with tool calls, include both content and tool_calls
            if (role === 'assistant' && toolCalls.length > 0) {
              console.log(`[OpenAI ContentGenerator] Adding assistant message with ${toolCalls.length} tool calls at index ${i}`);
              messages.push({ 
                role: 'assistant', 
                content: text || null,  // OpenAI allows null content when there are tool_calls
                tool_calls: toolCalls 
              } as any);
            } else if (text.trim()) {
              console.log(`[OpenAI ContentGenerator] Adding Content object as ${role} message at index ${i}`);
              messages.push({ role: role as any, content: text });
            }
          }
        } else if ('text' in item) {
          // This is a Part object - treat as user message
          const text = (item as any).text || '';
          if (text.trim()) {
            console.log(`[OpenAI ContentGenerator] Adding Part object as user message at index ${i}`);
            messages.push({ role: 'user', content: text });
          }
        } else {
          console.warn(`[OpenAI ContentGenerator] Unhandled object type at index ${i}:`, Object.keys(item));
        }
      } else {
        console.warn(`[OpenAI ContentGenerator] Skipping invalid item at index ${i}, type: ${typeof item}`);
      }
    }

    console.log('[OpenAI ContentGenerator] Final messages count:', messages.length);
    messages.forEach((msg, index) => {
      const details = [`role=${msg.role}`];
      if (msg.content) details.push(`content length=${msg.content.length}`);
      if ((msg as any).tool_calls) details.push(`tool_calls=${(msg as any).tool_calls.length}`);
      if ((msg as any).tool_call_id) details.push(`tool_call_id=${(msg as any).tool_call_id}`);
      console.log(`[OpenAI ContentGenerator] Message ${index}: ${details.join(', ')}`);
    });

    return messages;
  }
}