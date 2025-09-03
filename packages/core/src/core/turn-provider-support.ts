/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Part, FunctionCall } from '@google/genai';
import type { ServerGeminiStreamEvent, ToolCallRequestInfo } from './turn.js';
import { GeminiEventType } from './turn.js';
import type { ContentGenerator } from './contentGenerator.js';

/**
 * Provider-specific tool handling for OpenAI
 */
export async function* handleOpenAIStreaming(
  contentGenerator: ContentGenerator,
  history: any[],
  tools: any[],
  prompt_id: string,
  signal: AbortSignal,
  onToolCall: (toolCall: ToolCallRequestInfo) => void,
  onAddHistory: (content: any) => void
): AsyncGenerator<ServerGeminiStreamEvent> {
  try {
    // Build proper GenerateContentParameters for OpenAI ContentGenerator
    const config: any = {
      temperature: 0.7,
      maxOutputTokens: 8192,
      // Enable parallel tool calls for OpenAI
      parallel_tool_calls: true,
    };
    
    // Add tools to the generation config
    if (tools && tools.length > 0) {
      config.tools = tools;
      // Set tool_choice to 'auto' for OpenAI when tools are available
      config.tool_choice = 'auto';
    }
    
    // Create proper GenerateContentParameters structure
    const generateParams = {
      contents: history,  // This should be Content[] format
      config: config,
      model: 'gpt-4o'  // Default model for OpenAI
    } as any;
    
    const streamResponse = await contentGenerator.generateContentStream(generateParams, prompt_id);
    
    let hasContent = false;
    const modelResponseParts: Part[] = [];
    
    for await (const response of streamResponse) {
      if (signal?.aborted) {
        yield { type: GeminiEventType.UserCancelled };
        return;
      }
      
      const candidate = response.candidates?.[0];
      if (!candidate) continue;
      
      hasContent = true;
      const content = candidate.content;
      
      if (content?.parts) {
        for (const part of content.parts) {
          // Handle text content
          if ((part as any).text) {
            modelResponseParts.push(part);
            yield { type: GeminiEventType.Content, value: (part as any).text };
          }
          
          // Handle OpenAI function calls (converted from original OpenAI format)
          if ((part as any).functionCall) {
            const fnCall = (part as any).functionCall as FunctionCall;
            modelResponseParts.push(part);
            
            // Create tool call request in the expected format
            const toolCallRequest: ToolCallRequestInfo = {
              callId: `${fnCall.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              name: fnCall.name || 'undefined_tool_name',
              args: (fnCall.args || {}) as Record<string, unknown>,
              isClientInitiated: false,
              prompt_id: prompt_id,
            };
            
            onToolCall(toolCallRequest);
            yield { type: GeminiEventType.ToolCallRequest, value: toolCallRequest };
          }
        }
      }
    }
    
    if (!hasContent) {
      throw new Error('OpenAI provider returned empty response');
    }
    
    // Add model response to history
    if (modelResponseParts.length > 0) {
      onAddHistory({ role: 'model', parts: modelResponseParts });
    }
    
  } catch (error) {
    console.error('[Turn] OpenAI streaming error:', error);
    throw error;
  }
}

/**
 * Provider-specific tool handling for Anthropic
 */
export async function* handleAnthropicStreaming(
  contentGenerator: ContentGenerator,
  history: any[],
  tools: any[],
  prompt_id: string,
  signal: AbortSignal,
  onToolCall: (toolCall: ToolCallRequestInfo) => void,
  onAddHistory: (content: any) => void
): AsyncGenerator<ServerGeminiStreamEvent> {
  try {
    // Build config with provider-specific parameters
    const config: any = {
      temperature: 0.7,
      maxOutputTokens: 8192,
      // Anthropic-specific tool choice can be set here
      tool_choice: 'auto', // auto, any, none, or specific tool
    };
    
    // Add tools to the generation config
    if (tools && tools.length > 0) {
      config.tools = tools;
    }
    
    // Create proper GenerateContentParameters structure
    const generateParams = {
      contents: history,  // This should be Content[] format
      config: config,
      model: 'gpt-4o'  // Default model for OpenAI
    } as any;
    
    const streamResponse = await contentGenerator.generateContentStream(generateParams, prompt_id);
    
    let hasContent = false;
    const modelResponseParts: Part[] = [];
    
    for await (const response of streamResponse) {
      if (signal?.aborted) {
        yield { type: GeminiEventType.UserCancelled };
        return;
      }
      
      const candidate = response.candidates?.[0];
      if (!candidate) continue;
      
      hasContent = true;
      const content = candidate.content;
      
      if (content?.parts) {
        for (const part of content.parts) {
          // Handle text content
          if ((part as any).text) {
            modelResponseParts.push(part);
            yield { type: GeminiEventType.Content, value: (part as any).text };
          }
          
          // Handle Anthropic tool use blocks
          if ((part as any).functionCall || (part as any).tool_use) {
            const toolUse = (part as any).functionCall || (part as any).tool_use;
            modelResponseParts.push(part);
            
            // Create tool call request
            const toolCallRequest: ToolCallRequestInfo = {
              callId: toolUse.id || `${toolUse.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              name: toolUse.name || 'undefined_tool_name',
              args: (toolUse.input || toolUse.args || {}) as Record<string, unknown>,
              isClientInitiated: false,
              prompt_id: prompt_id,
            };
            
            onToolCall(toolCallRequest);
            yield { type: GeminiEventType.ToolCallRequest, value: toolCallRequest };
          }
        }
      }
    }
    
    if (!hasContent) {
      throw new Error('Anthropic provider returned empty response');
    }
    
    // Add model response to history
    if (modelResponseParts.length > 0) {
      onAddHistory({ role: 'model', parts: modelResponseParts });
    }
    
  } catch (error) {
    console.error('[Turn] Anthropic streaming error:', error);
    throw error;
  }
}

/**
 * Generic fallback for unknown providers
 */
export async function* handleGenericStreaming(
  contentGenerator: ContentGenerator,
  history: any[],
  tools: any[],
  prompt_id: string,
  signal: AbortSignal,
  onToolCall: (toolCall: ToolCallRequestInfo) => void,
  onAddHistory: (content: any) => void,
  provider: string
): AsyncGenerator<ServerGeminiStreamEvent> {
  try {
    // Build config with generic parameters
    const config: any = {
      temperature: 0.7,
      maxOutputTokens: 8192,
    };
    
    // Add tools to the generation config
    if (tools && tools.length > 0) {
      config.tools = tools;
    }
    
    // Create proper GenerateContentParameters structure
    const generateParams = {
      contents: history,  // This should be Content[] format
      config: config,
      model: 'gpt-4o'  // Default model for OpenAI
    } as any;
    
    const streamResponse = await contentGenerator.generateContentStream(generateParams, prompt_id);
    
    let hasContent = false;
    const modelResponseParts: Part[] = [];
    
    for await (const response of streamResponse) {
      if (signal?.aborted) {
        yield { type: GeminiEventType.UserCancelled };
        return;
      }
      
      const candidate = response.candidates?.[0];
      if (!candidate) continue;
      
      hasContent = true;
      const content = candidate.content;
      
      if (content?.parts) {
        for (const part of content.parts) {
          modelResponseParts.push(part);
          
          if ((part as any).text) {
            yield { type: GeminiEventType.Content, value: (part as any).text };
          }
          
          // Generic function call handling
          if ((part as any).functionCall) {
            const fnCall = (part as any).functionCall;
            
            const toolCallRequest: ToolCallRequestInfo = {
              callId: fnCall.id || `${fnCall.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              name: fnCall.name || 'undefined_tool_name',
              args: (fnCall.args || {}) as Record<string, unknown>,
              isClientInitiated: false,
              prompt_id: prompt_id,
            };
            
            onToolCall(toolCallRequest);
            yield { type: GeminiEventType.ToolCallRequest, value: toolCallRequest };
          }
        }
      }
    }
    
    if (!hasContent) {
      throw new Error(`${provider} provider returned empty response`);
    }
    
    // Add model response to history
    if (modelResponseParts.length > 0) {
      onAddHistory({ role: 'model', parts: modelResponseParts });
    }
    
  } catch (error) {
    console.error(`[Turn] ${provider} streaming error:`, error);
    throw error;
  }
}