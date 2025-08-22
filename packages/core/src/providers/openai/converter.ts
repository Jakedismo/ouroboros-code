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
} from '@google/genai';
import {
  FormatConverter,
  UnifiedGenerateRequest,
  UnifiedGenerateResponse,
  UnifiedMessage,
  UnifiedTool,
} from '../types.js';

// OpenAI API types
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'function' | 'tool';
  content?: string | OpenAIContentPart[];
  name?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
}

interface OpenAIContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAIFunction {
  name: string;
  description?: string;
  parameters: Record<string, any>;
}

interface OpenAITool {
  type: 'function';
  function: OpenAIFunction;
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  tools?: OpenAITool[];
  tool_choice?:
    | 'auto'
    | 'none'
    | 'required'
    | { type: 'function'; function: { name: string } };
  stream?: boolean;
  reasoning_effort?: 'minimal' | 'low' | 'medium' | 'high';
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: OpenAIMessage;
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Converter for OpenAI format to/from Gemini unified format
 */
export class OpenAIFormatConverter implements FormatConverter {
  /**
   * Convert Gemini format to unified format (required by interface)
   */
  fromGeminiFormat(request: GenerateContentParameters): UnifiedGenerateRequest {
    const unifiedRequest: UnifiedGenerateRequest = {
      messages: [],
    };

    // Convert contents to messages
    if (request.contents && Array.isArray(request.contents)) {
      unifiedRequest.messages = request.contents.map((content: any) => ({
        role: content.role === 'model' ? 'assistant' : content.role,
        content: content.parts?.map((part: any) => part.text || '').join('') || '',
      }));
    }

    // Convert system instruction
    const systemInstruction = (request as any).systemInstruction;
    if (systemInstruction) {
      if (typeof systemInstruction === 'string') {
        unifiedRequest.systemInstruction = systemInstruction;
      } else if (systemInstruction.parts) {
        const textParts = systemInstruction.parts
          .filter((part: any) => 'text' in part)
          .map((part: any) => part.text);
        unifiedRequest.systemInstruction = textParts.join('\n');
      }
    }

    // Convert generation config
    const generationConfig = (request as any).generationConfig;
    if (generationConfig) {
      unifiedRequest.maxTokens = generationConfig.maxOutputTokens;
      unifiedRequest.temperature = generationConfig.temperature;
      unifiedRequest.topP = generationConfig.topP;
    }

    // Convert tools
    const tools = (request as any).tools;
    if (tools) {
      unifiedRequest.tools = tools.flatMap(
        (tool: any) =>
          tool.functionDeclarations?.map((func: any) => ({
            name: func.name,
            description: func.description || '',
            parameters: {
              type: 'object' as const,
              properties: func.parameters?.properties || {},
              required: func.parameters?.required || [],
            },
          })) || [],
      );

      // Convert tool choice
      const toolConfig = (request as any).toolConfig;
      if (toolConfig?.functionCallingConfig) {
        const mode = toolConfig.functionCallingConfig.mode;
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
   * Convert unified format to OpenAI format
   */
  toProviderFormat(request: UnifiedGenerateRequest): OpenAIRequest {
    const openaiRequest: OpenAIRequest = {
      model: 'gpt-5', // Will be overridden by provider
      messages: [],
    };

    // Add system message if present
    if (request.systemInstruction) {
      openaiRequest.messages.push({
        role: 'system',
        content: request.systemInstruction,
      });
    }

    // Convert messages
    openaiRequest.messages.push(
      ...request.messages.map((message) =>
        this.convertMessageToOpenAI(message),
      ),
    );

    // Convert generation parameters
    if (request.maxTokens) {
      openaiRequest.max_tokens = request.maxTokens;
    }
    if (request.temperature !== undefined) {
      openaiRequest.temperature = request.temperature;
    }
    if (request.topP !== undefined) {
      openaiRequest.top_p = request.topP;
    }

    // Convert tools
    if (request.tools) {
      openaiRequest.tools = request.tools.map((tool) =>
        this.convertToolToOpenAI(tool),
      );

      // Convert tool choice
      if (request.toolChoice) {
        switch (request.toolChoice) {
          case 'auto':
            openaiRequest.tool_choice = 'auto';
            break;
          case 'none':
            openaiRequest.tool_choice = 'none';
            break;
          case 'required':
            openaiRequest.tool_choice = 'required';
            break;
        }
      }
    }

    // Set streaming
    if (request.stream) {
      openaiRequest.stream = true;
    }

    // Set thinking/reasoning effort for GPT-5 (default: high for maximum performance)
    if (openaiRequest.model === 'gpt-5' || openaiRequest.model.startsWith('gpt-5')) {
      openaiRequest.reasoning_effort = 'high';
    }

    return openaiRequest;
  }

  /**
   * Convert OpenAI response to unified format
   */
  fromProviderResponse(response: OpenAIResponse): UnifiedGenerateResponse {
    const unifiedResponse: UnifiedGenerateResponse = {
      content: '',
    };

    if (response.choices && response.choices.length > 0) {
      const choice = response.choices[0];
      const message = choice.message;

      // Extract text content
      if (typeof message.content === 'string') {
        unifiedResponse.content = message.content || '';
      }

      // Extract tool calls as function calls
      if (message.tool_calls) {
        unifiedResponse.functionCalls = message.tool_calls.map((toolCall) => ({
          name: toolCall.function.name,
          args: JSON.parse(toolCall.function.arguments || '{}'),
        }));
      }

      // Extract finish reason
      if (choice.finish_reason) {
        unifiedResponse.finishReason = choice.finish_reason as any;
      }
    }

    // Convert usage metadata
    if (response.usage) {
      unifiedResponse.usage = {
        promptTokenCount: response.usage.prompt_tokens,
        responseTokenCount: response.usage.completion_tokens,
        totalTokenCount: response.usage.total_tokens,
      };
    }

    return unifiedResponse;
  }

  /**
   * Convert unified response to Gemini format
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

    const geminiResponse = new GenerateContentResponse();
    geminiResponse.candidates = [
      {
        content: {
          parts,
          role: 'model',
        },
        finishReason: response.finishReason as any,
        index: 0,
      },
    ];

    // Add usage metadata
    if (response.usage) {
      geminiResponse.usageMetadata = response.usage;
    }

    return geminiResponse;
  }


  /**
   * Convert UnifiedMessage to OpenAI message
   */
  private convertMessageToOpenAI(message: UnifiedMessage): OpenAIMessage {
    const openaiMessage: OpenAIMessage = {
      role:
        message.role === 'assistant'
          ? 'assistant'
          : message.role === 'function'
            ? 'tool'
            : (message.role as any),
    };

    if (typeof message.content === 'string') {
      openaiMessage.content = message.content;
    } else if (Array.isArray(message.content)) {
      const contentParts: OpenAIContentPart[] = [];
      const toolCalls: OpenAIToolCall[] = [];

      for (const part of message.content) {
        if ('text' in part) {
          contentParts.push({
            type: 'text',
            text: part.text,
          });
        } else if ('inlineData' in part) {
          // Convert base64 data to data URL
          const dataUrl = `data:${part.inlineData!.mimeType};base64,${part.inlineData!.data}`;
          contentParts.push({
            type: 'image_url',
            image_url: {
              url: dataUrl,
              detail: 'auto',
            },
          });
        } else if ('functionCall' in part) {
          // Convert function call to tool call
          toolCalls.push({
            id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'function',
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args),
            },
          });
        }
      }

      if (contentParts.length > 0) {
        openaiMessage.content =
          contentParts.length === 1 && contentParts[0].type === 'text'
            ? contentParts[0].text
            : contentParts;
      }

      if (toolCalls.length > 0) {
        openaiMessage.tool_calls = toolCalls;
      }
    }

    return openaiMessage;
  }

  /**
   * Convert UnifiedTool to OpenAI tool
   */
  private convertToolToOpenAI(tool: UnifiedTool): OpenAITool {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: tool.parameters.properties,
          required: tool.parameters.required,
        },
      },
    };
  }

  /**
   * Convert OpenAI tool call to Gemini function call format
   */
  convertToolCallToFunctionCall(toolCall: OpenAIToolCall): FunctionCall {
    return {
      name: toolCall.function.name,
      args: JSON.parse(toolCall.function.arguments || '{}'),
    };
  }

  /**
   * Convert streaming chunk to unified format
   */
  convertStreamChunk(chunk: any): UnifiedGenerateResponse {
    const unifiedResponse: UnifiedGenerateResponse = {
      content: '',
    };

    if (chunk.choices && chunk.choices.length > 0) {
      const choice = chunk.choices[0];
      const delta = choice.delta;

      // Extract content from delta
      if (delta.content) {
        unifiedResponse.content = delta.content;
      }

      // Extract tool calls from delta
      if (delta.tool_calls) {
        unifiedResponse.functionCalls = delta.tool_calls.map(
          (toolCall: any) => ({
            name: toolCall.function?.name || '',
            args: toolCall.function?.arguments
              ? JSON.parse(toolCall.function.arguments)
              : {},
          }),
        );
      }

      // Extract finish reason
      if (choice.finish_reason) {
        unifiedResponse.finishReason = choice.finish_reason as any;
      }
    }

    return unifiedResponse;
  }
}
