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

  constructor(private apiKey: string, private model: string = 'gpt-4o') {
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
      
      const response = await this.provider.generateCompletion(messages, {
        model: modelToUse,
        temperature: request.config?.temperature,
        maxTokens: request.config?.maxOutputTokens,
        // Pass through any reasoning/thinking parameters if they exist
        ...((request.config as any)?.reasoning_effort && { reasoning_effort: (request.config as any).reasoning_effort }),
        ...((request.config as any)?.response_format && { response_format: (request.config as any).response_format }),
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
      
      try {
        // Extract tools from config (they come from GeminiChat's generationConfig.tools)
        const tools = request.config?.tools || [];
        
        // Use the model from request if provided, otherwise fall back to self.model
        const modelToUse = request.model || self.model;
        console.log('[OpenAI Streaming] Model to use:', modelToUse, 'Config:', JSON.stringify(request.config, null, 2));
        
        const stream = self.provider.generateResponse(messages, {
          model: modelToUse,
          temperature: request.config?.temperature,
          maxTokens: request.config?.maxOutputTokens,
          // Pass through any reasoning/thinking parameters if they exist
          ...((request.config as any)?.reasoning_effort && { reasoning_effort: (request.config as any).reasoning_effort }),
        }, tools); // Pass tools as separate parameter

        for await (const chunk of stream) {
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
              name: tc.function.name,
              args: tc.function.arguments ? JSON.parse(tc.function.arguments) : {},
            }));
            
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
      } catch (error) {
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

  private convertToMessages(contents: ContentListUnion): Array<{role: 'user' | 'assistant' | 'system', content: string}> {
    // Add debugging to see what we're receiving
    console.log('[OpenAI ContentGenerator] convertToMessages input type:', typeof contents);
    console.log('[OpenAI ContentGenerator] convertToMessages isArray:', Array.isArray(contents));
    if (Array.isArray(contents)) {
      console.log('[OpenAI ContentGenerator] Array length:', contents.length);
      contents.forEach((item, index) => {
        console.log(`[OpenAI ContentGenerator] Item ${index} type:`, typeof item);
        if (typeof item === 'object' && item !== null) {
          console.log(`[OpenAI ContentGenerator] Item ${index} keys:`, Object.keys(item));
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

    const messages: Array<{role: 'user' | 'assistant' | 'system', content: string}> = [];

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
          const role = content.role === 'user' ? 'user' : content.role === 'model' ? 'assistant' : 'system';
          const text = content.parts?.map(part => {
            if ((part as any).text) {
              return (part as any).text;
            }
            // Handle other part types safely
            if ((part as any).functionCall || (part as any).functionResponse) {
              // Don't stringify function calls/responses, they should be handled separately
              return '';
            }
            // For other part types, try to extract meaningful content
            return String(part);
          }).join('') || '';

          if (text.trim()) {
            console.log(`[OpenAI ContentGenerator] Adding Content object as ${role} message at index ${i}`);
            messages.push({ role, content: text });
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
      console.log(`[OpenAI ContentGenerator] Message ${index}: role=${msg.role}, content length=${msg.content.length}`);
    });

    return messages;
  }
}