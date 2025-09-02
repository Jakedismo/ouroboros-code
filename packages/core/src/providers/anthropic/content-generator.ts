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
import type { Provider } from '../types.js';
import { AnthropicProvider } from './index.js';

/**
 * Anthropic ContentGenerator that implements the ContentGenerator interface
 * using the Anthropic Provider for actual API calls
 */
export class AnthropicContentGenerator implements ContentGenerator {
  private provider: Provider;

  constructor(private apiKey: string, private model: string = 'claude-3-5-sonnet-20241022') {
    this.provider = new AnthropicProvider({
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
      
      const response = await this.provider.generateCompletion(messages, {
        model: this.model,
        temperature: request.config?.temperature,
        maxTokens: request.config?.maxOutputTokens,
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
          promptTokenCount: 0, // Anthropic returns this in different format
          candidatesTokenCount: 0,
          totalTokenCount: 0,
        },
      } as GenerateContentResponse;
    } catch (error) {
      throw new Error(`Anthropic API error: ${error instanceof Error ? error.message : String(error)}`);
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
        
        const stream = self.provider.generateResponse(messages, {
          model: self.model,
          temperature: request.config?.temperature,
          maxTokens: request.config?.maxOutputTokens,
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
          
          // Handle tool calls from Anthropic
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
        throw new Error(`Anthropic API error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return streamGenerator();
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // Anthropic doesn't have a direct token counting API
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
    
    // Rough approximation: ~4 characters per token for Claude
    const estimatedTokens = Math.ceil(content.length / 4);
    
    return {
      totalTokens: estimatedTokens,
    };
  }

  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    // Anthropic doesn't provide embeddings API
    // For now, throw an error since this is not commonly used
    throw new Error('Embeddings not supported for Anthropic provider');
  }

  private convertToMessages(contents: ContentListUnion): Array<{role: 'user' | 'assistant' | 'system', content: string}> {
    // Handle string contents
    if (typeof contents === 'string') {
      return [{ role: 'user', content: contents }];
    }

    if (!Array.isArray(contents)) {
      throw new Error('Contents must be string or array');
    }

    const messages: Array<{role: 'user' | 'assistant' | 'system', content: string}> = [];

    // Process each item in the array
    for (const item of contents) {
      if (typeof item === 'string') {
        // Raw string - treat as user message
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
            messages.push({ role, content: text });
          }
        } else if ('text' in item) {
          // This is a Part object - treat as user message
          const text = (item as any).text || '';
          if (text.trim()) {
            messages.push({ role: 'user', content: text });
          }
        }
      }
    }

    return messages;
  }
}