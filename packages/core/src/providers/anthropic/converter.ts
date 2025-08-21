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
  UsageMetadata,
  FinishReason,
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

// Anthropic API types
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

interface AnthropicContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result';
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  system?: string;
  temperature?: number;
  top_p?: number;
  tools?: AnthropicTool[];
  stream?: boolean;
}

interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// Using any type for stream events as Anthropic SDK types are complex
type AnthropicStreamEvent = any;

/**
 * Converter for Anthropic format to/from Gemini unified format
 */
export class AnthropicFormatConverter implements FormatConverter {
  /**
   * Convert Gemini format to unified format
   */
  fromGeminiFormat(request: GenerateContentParameters): UnifiedGenerateRequest {
    const unifiedRequest: UnifiedGenerateRequest = {
      messages: [],
    };

    // Cast to any to access extended properties
    const extendedRequest = request as any;

    // Convert contents to messages
    if (request.contents) {
      const contents = Array.isArray(request.contents) ? request.contents : [request.contents];
      unifiedRequest.messages = contents.map((content: any) =>
        this.convertContentToMessage(content),
      );
    }

    // Convert system instruction
    if (extendedRequest.systemInstruction) {
      if (typeof extendedRequest.systemInstruction === 'string') {
        unifiedRequest.systemInstruction = extendedRequest.systemInstruction;
      } else if (extendedRequest.systemInstruction.parts) {
        const textParts = extendedRequest.systemInstruction.parts
          .filter((part: any) => 'text' in part)
          .map((part: any) => part.text);
        unifiedRequest.systemInstruction = textParts.join('\n');
      }
    }

    // Convert generation config
    if (extendedRequest.generationConfig) {
      unifiedRequest.maxTokens = extendedRequest.generationConfig.maxOutputTokens;
      unifiedRequest.temperature = extendedRequest.generationConfig.temperature;
      unifiedRequest.topP = extendedRequest.generationConfig.topP;
    }

    // Convert tools
    if (extendedRequest.tools) {
      unifiedRequest.tools = extendedRequest.tools.flatMap(
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
    }

    return unifiedRequest;
  }

  /**
   * Convert unified format to Anthropic format
   */
  toProviderFormat(request: UnifiedGenerateRequest): AnthropicRequest {
    const anthropicRequest: AnthropicRequest = {
      model: 'claude-4-sonnet-20250514', // Will be overridden by provider
      max_tokens: request.maxTokens || 4096,
      messages: [],
    };

    // Add system message
    if (request.systemInstruction) {
      anthropicRequest.system = request.systemInstruction;
    }

    // Convert messages (filter out system messages as they're handled separately)
    anthropicRequest.messages = request.messages
      .filter((message) => message.role !== 'system')
      .map((message) => this.convertMessageToAnthropic(message));

    // Convert generation parameters
    if (request.temperature !== undefined) {
      anthropicRequest.temperature = request.temperature;
    }
    if (request.topP !== undefined) {
      anthropicRequest.top_p = request.topP;
    }

    // Convert tools
    if (request.tools) {
      anthropicRequest.tools = request.tools.map((tool) =>
        this.convertToolToAnthropic(tool),
      );
    }

    // Set streaming
    if (request.stream) {
      anthropicRequest.stream = true;
    }

    return anthropicRequest;
  }

  /**
   * Convert Anthropic response to unified format
   */
  fromProviderResponse(response: AnthropicResponse): UnifiedGenerateResponse {
    const unifiedResponse: UnifiedGenerateResponse = {
      content: '',
    };

    // Extract text content
    const textBlocks = response.content.filter(
      (block) => block.type === 'text',
    );
    unifiedResponse.content = textBlocks
      .map((block) => block.text || '')
      .join('');

    // Extract tool uses as function calls
    const toolUseBlocks = response.content.filter(
      (block) => block.type === 'tool_use',
    );
    if (toolUseBlocks.length > 0) {
      unifiedResponse.functionCalls = toolUseBlocks.map((block) => ({
        name: block.name || '',
        args: block.input || {},
      }));
    }

    // Extract finish reason
    if (response.stop_reason) {
      // Map Anthropic stop reasons to standard format
      switch (response.stop_reason) {
        case 'end_turn':
          unifiedResponse.finishReason = 'stop';
          break;
        case 'tool_use':
          unifiedResponse.finishReason = 'tool_calls';
          break;
        case 'max_tokens':
          unifiedResponse.finishReason = 'length';
          break;
        default:
          unifiedResponse.finishReason = response.stop_reason;
      }
    }

    // Convert usage metadata
    if (response.usage) {
      unifiedResponse.usage = {
        promptTokenCount: response.usage.input_tokens,
        candidatesTokenCount: response.usage.output_tokens,
        totalTokenCount:
          response.usage.input_tokens + response.usage.output_tokens,
      } as UsageMetadata;
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

    const geminiResponse: GenerateContentResponse = {
      candidates: [
        {
          content: {
            parts,
            role: 'model',
          },
          finishReason: response.finishReason as FinishReason,
          index: 0,
        },
      ],
      text: response.content || '',
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
      role:
        content.role === 'model'
          ? 'assistant'
          : (content.role as 'user' | 'system'),
      content: [],
    };

    if (content.parts) {
      const contentParts: Array<TextPart | ImagePart | FunctionCallPart> = [];

      for (const part of content.parts) {
        if ('text' in part && part.text) {
          contentParts.push({ text: part.text });
        } else if ('inlineData' in part && part.inlineData) {
          contentParts.push({
            inlineData: {
              mimeType: part.inlineData.mimeType || '',
              data: part.inlineData.data || '',
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
   * Convert UnifiedMessage to Anthropic message
   */
  private convertMessageToAnthropic(message: UnifiedMessage): AnthropicMessage {
    const anthropicMessage: AnthropicMessage = {
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: '',
    };

    if (typeof message.content === 'string') {
      anthropicMessage.content = message.content;
    } else if (Array.isArray(message.content)) {
      const contentBlocks: AnthropicContentBlock[] = [];

      for (const part of message.content) {
        if ('text' in part) {
          contentBlocks.push({
            type: 'text',
            text: part.text,
          });
        } else if ('inlineData' in part) {
          // Convert base64 image data
          contentBlocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: part.inlineData!.mimeType,
              data: part.inlineData!.data,
            },
          });
        } else if ('functionCall' in part) {
          // Convert function call to tool use
          contentBlocks.push({
            type: 'tool_use',
            id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: part.functionCall.name,
            input: part.functionCall.args,
          });
        }
      }

      if (contentBlocks.length === 1 && contentBlocks[0].type === 'text') {
        anthropicMessage.content = contentBlocks[0].text || '';
      } else {
        anthropicMessage.content = contentBlocks;
      }
    }

    return anthropicMessage;
  }

  /**
   * Convert UnifiedTool to Anthropic tool
   */
  private convertToolToAnthropic(tool: UnifiedTool): AnthropicTool {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object',
        properties: tool.parameters.properties,
        required: tool.parameters.required,
      },
    };
  }

  /**
   * Convert Anthropic tool use to Gemini function call format
   */
  convertToolUseToFunctionCall(toolUse: AnthropicContentBlock): FunctionCall {
    return {
      name: toolUse.name || '',
      args: toolUse.input || {},
    };
  }

  /**
   * Convert streaming event to unified format
   */
  convertStreamEvent(event: AnthropicStreamEvent): UnifiedGenerateResponse {
    const unifiedResponse: UnifiedGenerateResponse = {
      content: '',
    };

    // Handle different event types
    switch (event.type) {
      case 'message_start':
        // Initial message event - usually empty
        break;

      case 'content_block_start':
        if (event.content_block?.type === 'text') {
          // Text block starting
        } else if (event.content_block?.type === 'tool_use') {
          // Tool use block starting
          unifiedResponse.functionCalls = [
            {
              name: event.content_block.name || '',
              args: {},
            },
          ];
        }
        break;

      case 'content_block_delta':
        if (event.delta?.type === 'text_delta') {
          unifiedResponse.content = event.delta.text || '';
        }
        break;

      case 'content_block_stop':
        // Content block finished
        break;

      case 'message_delta':
        if (event.delta?.stop_reason) {
          switch (event.delta.stop_reason) {
            case 'end_turn':
              unifiedResponse.finishReason = 'stop';
              break;
            case 'tool_use':
              unifiedResponse.finishReason = 'tool_calls';
              break;
            case 'max_tokens':
              unifiedResponse.finishReason = 'length';
              break;
            default:
              unifiedResponse.finishReason = event.delta.stop_reason;
          }
        }
        break;

      case 'message_stop':
        // Message finished
        break;

      default:
        // Unknown event type - ignore
        break;
    }

    return unifiedResponse;
  }

  /**
   * Create tool result content for Anthropic
   */
  createToolResult(
    toolUseId: string,
    content: string,
    isError: boolean = false,
  ): AnthropicContentBlock {
    return {
      type: 'tool_result',
      tool_use_id: toolUseId,
      content,
      is_error: isError,
    };
  }

  /**
   * Extract tool use blocks from Anthropic response
   */
  extractToolUseBlocks(response: AnthropicResponse): AnthropicContentBlock[] {
    return response.content.filter((block) => block.type === 'tool_use');
  }

  /**
   * Check if response contains tool use
   */
  hasToolUse(response: AnthropicResponse): boolean {
    return response.content.some((block) => block.type === 'tool_use');
  }
}
