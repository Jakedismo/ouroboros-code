/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GenerateContentParameters,
  GenerateContentResponse,
  Part,
  FunctionCall,
  Content,
  Tool,
} from '@google/genai';
import {
  FormatConverter,
  UnifiedGenerateRequest,
  UnifiedGenerateResponse,
  UnifiedMessage,
  UnifiedTool,
  TextPart,
  ImagePart,
  FunctionCallPart,
} from '../types.js';

/**
 * Converter for Gemini format - essentially a pass-through since Gemini is our base format
 */
export class GeminiFormatConverter implements FormatConverter {
  /**
   * Convert Gemini format to unified format
   */
  fromGeminiFormat(request: GenerateContentParameters): UnifiedGenerateRequest {
    const unifiedRequest: UnifiedGenerateRequest = {
      messages: [],
    };

    // Convert contents to messages (use type assertion for array handling)
    if (request.contents) {
      const contents = Array.isArray(request.contents) 
        ? request.contents 
        : [request.contents];
      unifiedRequest.messages = contents.map((content: any) =>
        this.convertContentToMessage(content),
      );
    }

    // Convert system instruction (use type assertion for extended properties)
    const extendedRequest = request as any;
    if (extendedRequest.systemInstruction) {
      if (typeof extendedRequest.systemInstruction === 'string') {
        unifiedRequest.systemInstruction = extendedRequest.systemInstruction;
      } else if (extendedRequest.systemInstruction.parts) {
        // Extract text from parts
        const textParts = extendedRequest.systemInstruction.parts
          .filter((part: any) => 'text' in part)
          .map((part: any) => part.text);
        unifiedRequest.systemInstruction = textParts.join('\n');
      }
    }

    // Convert generation config (use type assertion for extended properties)
    if (extendedRequest.generationConfig) {
      unifiedRequest.maxTokens = extendedRequest.generationConfig.maxOutputTokens;
      unifiedRequest.temperature = extendedRequest.generationConfig.temperature;
      unifiedRequest.topP = extendedRequest.generationConfig.topP;
      unifiedRequest.topK = extendedRequest.generationConfig.topK;
    }

    // Convert tools (use type assertion for extended properties)
    if (extendedRequest.tools) {
      unifiedRequest.tools = extendedRequest.tools.map((tool: any) =>
        this.convertGeminiToolToUnified(tool),
      );

      // Convert tool choice if present (use type assertion for extended properties)
      if (extendedRequest.toolConfig?.functionCallingConfig) {
        const mode = extendedRequest.toolConfig.functionCallingConfig.mode;
        switch (mode) {
          case 'AUTO':
            unifiedRequest.toolChoice = 'auto';
            break;
          case 'NONE':
            unifiedRequest.toolChoice = 'none';
            break;
          case 'ANY':
            unifiedRequest.toolChoice = 'required';
            break;
        }
      }
    }

    return unifiedRequest;
  }

  /**
   * Convert unified format to Gemini format (pass-through for Gemini)
   */
  toProviderFormat(request: UnifiedGenerateRequest): GenerateContentParameters {
    const geminiRequest: GenerateContentParameters = {
      model: 'gemini-1.5-pro', // Add required model field
      contents: request.messages.map((message) =>
        this.convertMessageToContent(message),
      ),
    };

    // Convert system instruction (use type assertion for extended properties)
    const extendedRequest = geminiRequest as any;
    if (request.systemInstruction) {
      extendedRequest.systemInstruction = {
        parts: [{ text: request.systemInstruction }],
      };
    }

    // Convert generation config (use type assertion for extended properties)
    if (
      request.maxTokens ||
      request.temperature ||
      request.topP ||
      request.topK ||
      request.thinkingConfig
    ) {
      extendedRequest.generationConfig = {
        maxOutputTokens: request.maxTokens,
        temperature: request.temperature,
        topP: request.topP,
        topK: request.topK,
      };
      
      // Add thinking configuration if present
      if (request.thinkingConfig) {
        extendedRequest.generationConfig.thinkingConfig = {
          thinkingBudget: request.thinkingConfig.thinkingBudget ?? -1,
          includeThoughts: request.thinkingConfig.includeThoughts ?? true,
        };
      }
    }

    // Convert tools (use type assertion for extended properties)
    if (request.tools) {
      extendedRequest.tools = request.tools.map((tool) =>
        this.convertUnifiedToolToGemini(tool),
      );

      // Convert tool choice (use type assertion for extended properties)
      if (request.toolChoice) {
        extendedRequest.toolConfig = {
          functionCallingConfig: {
            mode: this.convertToolChoiceToGemini(request.toolChoice),
          },
        };
      }
    }

    return geminiRequest;
  }

  /**
   * Convert Gemini response to unified format
   */
  fromProviderResponse(
    response: GenerateContentResponse,
  ): UnifiedGenerateResponse {
    const unifiedResponse: UnifiedGenerateResponse = {
      content: '',
    };

    // Extract text content
    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      const textParts: string[] = [];

      if (candidate.content?.parts) {
        for (const part of candidate.content.parts) {
          if ('text' in part && part.text) {
            textParts.push(part.text);
          }
        }
      }

      unifiedResponse.content = textParts.join('');

      // Extract function calls
      const functionCalls: FunctionCall[] = [];
      if (candidate.content?.parts) {
        for (const part of candidate.content.parts) {
          if ('functionCall' in part && part.functionCall) {
            functionCalls.push(part.functionCall);
          }
        }
      }

      if (functionCalls.length > 0) {
        unifiedResponse.functionCalls = functionCalls;
      }

      // Extract finish reason
      if (candidate.finishReason) {
        unifiedResponse.finishReason = candidate.finishReason;
      }
    }

    // Extract usage metadata
    if (response.usageMetadata) {
      unifiedResponse.usage = response.usageMetadata;
    }

    return unifiedResponse;
  }

  /**
   * Convert unified response back to Gemini format (pass-through for Gemini)
   */
  toGeminiFormat(response: UnifiedGenerateResponse): GenerateContentResponse {
    const parts: Part[] = [];

    // Add text content
    if (response.content) {
      parts.push({ text: response.content });
    }

    // Add function calls
    if (response.functionCalls) {
      for (const functionCall of response.functionCalls) {
        parts.push({ functionCall });
      }
    }

    const geminiResponse: GenerateContentResponse = {
      candidates: [
        {
          content: {
            parts,
            role: 'model',
          },
          finishReason: response.finishReason as any,
          index: 0,
        },
      ],
      text: '', // Add required properties
      data: undefined,
      functionCalls: response.functionCalls,
      executableCode: undefined,
      codeExecutionResult: undefined,
    };

    // Add usage metadata
    if (response.usage) {
      geminiResponse.usageMetadata = response.usage;
    }

    return geminiResponse;
  }

  /**
   * Convert Gemini Content to UnifiedMessage
   */
  private convertContentToMessage(content: Content): UnifiedMessage {
    const message: UnifiedMessage = {
      role: content.role === 'model' ? 'assistant' : (content.role as any),
      content: [],
    };

    if (content.parts) {
      const contentParts: Array<TextPart | ImagePart | FunctionCallPart> = [];

      for (const part of content.parts) {
        if ('text' in part) {
          contentParts.push({ text: part.text || '' });
        } else if ('inlineData' in part && part.inlineData) {
          contentParts.push({
            inlineData: {
              mimeType: part.inlineData.mimeType || '',
              data: part.inlineData.data || '',
            },
          });
        } else if ('fileData' in part && part.fileData) {
          contentParts.push({
            fileData: {
              mimeType: part.fileData.mimeType || '',
              fileUri: part.fileData.fileUri || '',
            },
          });
        } else if ('functionCall' in part && part.functionCall) {
          contentParts.push({
            functionCall: {
              name: part.functionCall.name || '',
              args: part.functionCall.args || {},
            },
          });
        }
      }

      if (contentParts.length === 1 && 'text' in contentParts[0]) {
        message.content = contentParts[0].text;
      } else {
        message.content = contentParts;
      }
    }

    return message;
  }

  /**
   * Convert UnifiedMessage to Gemini Content
   */
  private convertMessageToContent(message: UnifiedMessage): Content {
    const content: Content = {
      role: message.role === 'assistant' ? 'model' : (message.role as any),
      parts: [],
    };

    if (typeof message.content === 'string') {
      content.parts = [{ text: message.content }];
    } else if (Array.isArray(message.content)) {
      content.parts = message.content.map((part) => {
        if ('text' in part) {
          return { text: part.text };
        } else if ('inlineData' in part) {
          return {
            inlineData: {
              mimeType: part.inlineData!.mimeType,
              data: part.inlineData!.data,
            },
          };
        } else if ('fileData' in part) {
          return {
            fileData: {
              mimeType: part.fileData!.mimeType,
              fileUri: part.fileData!.fileUri,
            },
          };
        } else if ('functionCall' in part) {
          return {
            functionCall: {
              name: part.functionCall.name,
              args: part.functionCall.args,
            },
          };
        }
        throw new Error('Unknown part type');
      });
    }

    return content;
  }

  /**
   * Convert Gemini Tool to UnifiedTool
   */
  private convertGeminiToolToUnified(tool: Tool): UnifiedTool {
    if (tool.functionDeclarations && tool.functionDeclarations.length > 0) {
      const func = tool.functionDeclarations[0];
      return {
        name: func.name || '',
        description: func.description || '',
        parameters: {
          type: 'object',
          properties: func.parameters?.properties || {},
          required: func.parameters?.required || [],
        },
      };
    }
    throw new Error('Invalid Gemini tool format');
  }

  /**
   * Convert UnifiedTool to Gemini Tool
   */
  private convertUnifiedToolToGemini(tool: UnifiedTool): Tool {
    return {
      functionDeclarations: [
        {
          name: tool.name,
          description: tool.description,
          parameters: {
            type: 'object' as any,
            properties: tool.parameters.properties as any,
            required: tool.parameters.required,
          },
        },
      ],
    };
  }

  /**
   * Convert unified tool choice to Gemini format
   */
  private convertToolChoiceToGemini(toolChoice: string): string {
    switch (toolChoice) {
      case 'auto':
        return 'AUTO';
      case 'none':
        return 'NONE';
      case 'required':
        return 'ANY';
      default:
        return 'AUTO';
    }
  }
}
