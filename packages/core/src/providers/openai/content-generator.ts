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
      // Pass model to provider so it can filter parameters appropriately
      const response = await this.provider.generateCompletion(messages, {
        model: this.model,
        temperature: request.config?.temperature,
        maxTokens: request.config?.maxOutputTokens,
      }, request.config?.tools); // Pass tools as separate parameter

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
        const stream = self.provider.generateResponse(messages, {
          model: self.model,
          temperature: request.config?.temperature,
          maxTokens: request.config?.maxOutputTokens,
        }, request.config?.tools); // Pass tools as separate parameter

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
    // Handle string contents
    if (typeof contents === 'string') {
      return [{ role: 'user', content: contents }];
    }

    // Handle array of parts
    if (Array.isArray(contents) && contents.length > 0 && typeof contents[0] === 'object' && 'text' in contents[0]) {
      // This is Part[]
      const text = contents.map(part => (part as any).text || '').join('');
      return [{ role: 'user', content: text }];
    }

    // Handle Content[]
    const contentArray = contents as Content[];
    return contentArray.map(content => {
      const role = content.role === 'user' ? 'user' : content.role === 'model' ? 'assistant' : 'system';
      const text = content.parts?.map(part => {
        if ((part as any).text) {
          return (part as any).text;
        }
        // Handle other part types as needed
        return JSON.stringify(part);
      }).join('') || '';

      return { role, content: text };
    });
  }
}