/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Part, FunctionCall } from '@google/genai';
import type { ServerGeminiStreamEvent, ToolCallRequestInfo } from './turn.js';
import { GeminiEventType } from './turn.js';
import type { ContentGenerator } from './contentGenerator.js';
import type { Config } from '../config/config.js';
import { executeToolCall } from './nonInteractiveToolExecutor.js';
import { getErrorMessage } from '../utils/errors.js';

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
  onAddHistory: (content: any) => void,
  config?: Config
): AsyncGenerator<ServerGeminiStreamEvent> {
  try {
    console.log('[Turn OpenAI Handler] Received history with', history.length, 'entries');
    console.log('[Turn OpenAI Handler] History summary:', history.map(h => ({
      role: h.role,
      partsLength: h.parts?.length,
      firstPartType: h.parts?.[0] ? Object.keys(h.parts[0])[0] : 'unknown'
    })));
    
    // Build proper GenerateContentParameters for OpenAI ContentGenerator
    const genConfig: any = {
      temperature: 0.7,
      maxOutputTokens: 8192,
      // Enable parallel tool calls for OpenAI
      parallel_tool_calls: true,
    };
    
    // Add tools to the generation config
    if (tools && tools.length > 0) {
      genConfig.tools = tools;
      // Set tool_choice to 'auto' for OpenAI when tools are available
      genConfig.tool_choice = 'auto';
    }
    
    // Create proper GenerateContentParameters structure
    const generateParams = {
      contents: history,  // This should be Content[] format
      config: genConfig,
      model: config?.getModel() || 'gpt-5'  // Use configured model or default to gpt-5
    } as any;
    
    const streamResponse = await contentGenerator.generateContentStream(generateParams, prompt_id);
    
    console.log('[Turn] OpenAI streaming response received, starting to process...');
    let hasContent = false;
    const modelResponseParts: Part[] = [];
    const functionCallsToExecute: ToolCallRequestInfo[] = [];
    let responseCount = 0;
    
    // First phase: collect the initial response and function calls
    for await (const response of streamResponse) {
      responseCount++;
      console.log(`[Turn] Processing OpenAI response ${responseCount}:`, JSON.stringify(response, null, 2));
      if (signal?.aborted) {
        yield { type: GeminiEventType.UserCancelled };
        return;
      }
      
      const candidate = response.candidates?.[0];
      if (!candidate) continue;
      
      const content = candidate.content;
      
      if (content?.parts) {
        console.log(`[Turn] Processing ${content.parts.length} parts from OpenAI response`);
        for (const part of content.parts) {
          console.log(`[Turn] Processing part:`, Object.keys(part), (part as any).text ? `text(${(part as any).text.length}chars)` : '', (part as any).functionCall ? `functionCall(${(part as any).functionCall.name})` : '');
          
          // Handle text content
          if ((part as any).text) {
            hasContent = true;
            modelResponseParts.push(part);
            yield { type: GeminiEventType.Content, value: (part as any).text };
          }
          
          // Handle OpenAI function calls (converted from original OpenAI format)
          if ((part as any).functionCall) {
            const fnCall = (part as any).functionCall as FunctionCall;
            modelResponseParts.push(part);
            
            // Create tool call request in the expected format
            const toolCallRequest: ToolCallRequestInfo = {
              callId: fnCall.id || `${fnCall.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              name: fnCall.name || 'undefined_tool_name',
              args: (fnCall.args || {}) as Record<string, unknown>,
              isClientInitiated: false,
              prompt_id: prompt_id,
            };
            
            functionCallsToExecute.push(toolCallRequest);
            console.log(`[Turn] Added function call to execution queue: ${toolCallRequest.name} (total: ${functionCallsToExecute.length})`);
            onToolCall(toolCallRequest);
            yield { type: GeminiEventType.ToolCallRequest, value: toolCallRequest };
          }
        }
      }
    }
    
    // Add initial model response to history
    if (modelResponseParts.length > 0) {
      onAddHistory({ role: 'model', parts: modelResponseParts });
    }
    
    // Second phase: Execute function calls if any were requested
    console.log(`[Turn] Function call execution check: functionCallsToExecute.length=${functionCallsToExecute.length}, config=${!!config}`);
    if (functionCallsToExecute.length > 0 && config) {
      console.log(`[Turn] Executing ${functionCallsToExecute.length} function calls for OpenAI:`);
      functionCallsToExecute.forEach((call, index) => {
        console.log(`[Turn]   ${index + 1}. ${call.name} with args:`, JSON.stringify(call.args).substring(0, 200));
      });
      
      // Execute all function calls
      for (let i = 0; i < functionCallsToExecute.length; i++) {
        const toolCallRequest = functionCallsToExecute[i];
        const startTime = Date.now();
        console.log(`[Turn] Starting execution of tool ${i + 1}/${functionCallsToExecute.length}: ${toolCallRequest.name}`);
        
        try {
          // Notify the UI that this tool is being called
          onToolCall(toolCallRequest);
          
          const toolResponse = await executeToolCall(config, toolCallRequest, signal);
          const executionTime = Date.now() - startTime;
          console.log(`[Turn] Tool ${toolCallRequest.name} completed in ${executionTime}ms`);
          
          // Create function call result parts for the conversation history
          const functionResultParts: Part[] = [];
          
          if (toolResponse.responseParts && toolResponse.responseParts.length > 0) {
            // Add tool response parts
            functionResultParts.push(...toolResponse.responseParts);
          } else {
            // Fallback to text representation
            functionResultParts.push({
              text: `Function ${toolCallRequest.name} executed successfully`
            } as any);
          }
          
          // Add function call result to history
          const functionResultContent = {
            role: 'function' as const,
            parts: [{
              functionResponse: {
                name: toolCallRequest.name,
                response: toolResponse.responseParts?.[0] || { text: 'Function executed' }
              }
            } as any]
          };
          
          onAddHistory(functionResultContent);
          
          // Yield tool call response event
          yield { type: GeminiEventType.ToolCallResponse, value: toolResponse };
          
        } catch (toolError) {
          const executionTime = Date.now() - startTime;
          console.error(`[Turn] Error executing tool ${toolCallRequest.name} after ${executionTime}ms:`, toolError);
          
          // Add error result to history
          const errorContent = {
            role: 'function' as const,
            parts: [{
              functionResponse: {
                name: toolCallRequest.name,
                response: { text: `Error: ${getErrorMessage(toolError)}` }
              }
            } as any]
          };
          
          onAddHistory(errorContent);
        }
      }
      
      // Function calls have been executed and their results added to history
      console.log('[Turn] OpenAI function calls completed, making follow-up call for final response');
      
      // Make another call to OpenAI with the updated history to get the final response
      try {
        const followUpParams = {
          contents: history,
          config: genConfig,
          model: config?.getModel() || 'gpt-5'
        } as any;
        
        console.log('[Turn] Making follow-up call to OpenAI after tool execution');
        const followUpStream = await contentGenerator.generateContentStream(followUpParams, prompt_id);
        
        let followUpHasContent = false;
        for await (const response of followUpStream) {
          if (signal?.aborted) {
            yield { type: GeminiEventType.UserCancelled };
            return;
          }
          
          const candidate = response.candidates?.[0];
          if (!candidate) continue;
          
          followUpHasContent = true;
          const content = candidate.content;
          
          if (content?.parts) {
            for (const part of content.parts) {
              if ((part as any).text) {
                yield { type: GeminiEventType.Content, value: (part as any).text };
                onAddHistory({ role: 'model', parts: [part] });
              }
            }
          }
        }
        
        if (!followUpHasContent) {
          console.warn('[Turn] No content in follow-up response after tool execution');
        }
      } catch (followUpError) {
        console.error('[Turn] Error in follow-up call after tool execution:', followUpError);
      }
    }
    
    console.log(`[Turn] OpenAI streaming finished. hasContent: ${hasContent}, responseCount: ${responseCount}, functionCalls: ${functionCallsToExecute.length}`);
    
    // Debug: Check if we have function calls but they weren't executed
    if (functionCallsToExecute.length > 0) {
      console.warn(`[Turn] WARNING: ${functionCallsToExecute.length} function calls were detected but may not have been executed through this handler`);
      console.log(`[Turn] Function calls detected:`, functionCallsToExecute.map(fc => fc.name));
      
      // If tools were executed elsewhere (UI level) but we got no content, 
      // we should still make a follow-up call to get the response
      if (!hasContent) {
        console.log(`[Turn] Making emergency follow-up call since tools were executed but no content received`);
        try {
          const followUpParams = {
            contents: history,
            config: genConfig,
            model: config?.getModel() || 'gpt-5'
          } as any;
          
          const followUpStream = await contentGenerator.generateContentStream(followUpParams, prompt_id);
          
          for await (const response of followUpStream) {
            if (signal?.aborted) {
              yield { type: GeminiEventType.UserCancelled };
              return;
            }
            
            const candidate = response.candidates?.[0];
            if (!candidate) continue;
            
            const content = candidate.content;
            if (content?.parts) {
              for (const part of content.parts) {
                if ((part as any).text) {
                  console.log(`[Turn] Emergency follow-up yielding content:`, (part as any).text.substring(0, 100) + '...');
                  yield { type: GeminiEventType.Content, value: (part as any).text };
                  onAddHistory({ role: 'model', parts: [part] });
                }
              }
            }
          }
        } catch (followUpError) {
          console.error('[Turn] Emergency follow-up call failed:', followUpError);
        }
      }
    }
    
    // Only throw error if we have no content AND no function calls
    if (!hasContent && functionCallsToExecute.length === 0) {
      // Check if there were any chunks at all
      if (responseCount === 0) {
        console.error('[Turn] No content or tool calls received from OpenAI stream - possible streaming issue');
        console.log('[Turn] This might be due to malformed tool calls that couldn\'t be parsed');
        console.log('[Turn] Consider checking OpenAI logs for incomplete tool call arguments');
        
        // Try one more follow-up to see if OpenAI can recover
        console.log('[Turn] Attempting recovery with follow-up call...');
        try {
          const recoveryParams = {
            contents: history,
            config: genConfig,
            model: config?.getModel() || 'gpt-5'
          } as any;
          
          const recoveryStream = await contentGenerator.generateContentStream(recoveryParams, prompt_id);
          let recoveryHasContent = false;
          
          for await (const response of recoveryStream) {
            if (signal?.aborted) {
              yield { type: GeminiEventType.UserCancelled };
              return;
            }
            
            const candidate = response.candidates?.[0];
            if (!candidate) continue;
            
            const content = candidate.content;
            if (content?.parts) {
              for (const part of content.parts) {
                if ((part as any).text) {
                  recoveryHasContent = true;
                  yield { type: GeminiEventType.Content, value: (part as any).text };
                  onAddHistory({ role: 'model', parts: [part] });
                }
              }
            }
          }
          
          if (recoveryHasContent) {
            console.log('[Turn] Recovery successful - content received on retry');
            return;
          }
        } catch (recoveryError) {
          console.error('[Turn] Recovery attempt failed:', recoveryError);
        }
        
        // If recovery failed, throw the original error
        throw new Error('OpenAI provider returned empty response - possibly due to malformed tool calls');
      }
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
  onAddHistory: (content: any) => void,
  config?: Config
): AsyncGenerator<ServerGeminiStreamEvent> {
  try {
    // Build config with provider-specific parameters
    const genConfig: any = {
      temperature: 0.7,
      maxOutputTokens: 8192,
      // Anthropic-specific tool choice can be set here
      tool_choice: 'auto', // auto, any, none, or specific tool
    };
    
    // Add tools to the generation config
    if (tools && tools.length > 0) {
      genConfig.tools = tools;
    }
    
    // Create proper GenerateContentParameters structure
    const generateParams = {
      contents: history,  // This should be Content[] format
      config: genConfig,
      model: config?.getModel() || 'gpt-5'  // Use configured model or default to gpt-5
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
  provider: string,
  config?: Config
): AsyncGenerator<ServerGeminiStreamEvent> {
  try {
    // Build config with generic parameters
    const genConfig: any = {
      temperature: 0.7,
      maxOutputTokens: 8192,
    };
    
    // Add tools to the generation config
    if (tools && tools.length > 0) {
      genConfig.tools = tools;
    }
    
    // Create proper GenerateContentParameters structure
    const generateParams = {
      contents: history,  // This should be Content[] format
      config: genConfig,
      model: config?.getModel() || 'gpt-5'  // Use configured model or default to gpt-5
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