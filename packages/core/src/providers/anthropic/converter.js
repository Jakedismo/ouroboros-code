/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Converter for Anthropic format to/from Gemini unified format
 */
export class AnthropicFormatConverter {
    /**
     * Convert Gemini format to unified format
     */
    fromGeminiFormat(request) {
        const unifiedRequest = {
            messages: [],
        };
        // Cast to any to access extended properties
        const extendedRequest = request;
        // Convert contents to messages
        if (request.contents) {
            const contents = Array.isArray(request.contents) ? request.contents : [request.contents];
            unifiedRequest.messages = contents.map((content) => this.convertContentToMessage(content));
        }
        // Convert system instruction
        if (extendedRequest.systemInstruction) {
            if (typeof extendedRequest.systemInstruction === 'string') {
                unifiedRequest.systemInstruction = extendedRequest.systemInstruction;
            }
            else if (extendedRequest.systemInstruction.parts) {
                const textParts = extendedRequest.systemInstruction.parts
                    .filter((part) => 'text' in part)
                    .map((part) => part.text);
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
            unifiedRequest.tools = extendedRequest.tools.flatMap((tool) => tool.functionDeclarations?.map((func) => ({
                name: func.name,
                description: func.description || '',
                parameters: {
                    type: 'object',
                    properties: func.parameters?.properties || {},
                    required: func.parameters?.required || [],
                },
            })) || []);
        }
        return unifiedRequest;
    }
    /**
     * Convert unified format to Anthropic format
     */
    toProviderFormat(request) {
        const anthropicRequest = {
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
            anthropicRequest.tools = request.tools.map((tool) => this.convertToolToAnthropic(tool));
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
    fromProviderResponse(response) {
        const unifiedResponse = {
            content: '',
        };
        // Extract text content
        const textBlocks = response.content.filter((block) => block.type === 'text');
        unifiedResponse.content = textBlocks
            .map((block) => block.text || '')
            .join('');
        // Extract tool uses as function calls
        const toolUseBlocks = response.content.filter((block) => block.type === 'tool_use');
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
                totalTokenCount: response.usage.input_tokens + response.usage.output_tokens,
            };
        }
        return unifiedResponse;
    }
    /**
     * Convert unified response to Gemini format
     */
    toGeminiFormat(response) {
        const parts = [];
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
        const geminiResponse = {
            candidates: [
                {
                    content: {
                        parts,
                        role: 'model',
                    },
                    finishReason: response.finishReason,
                    index: 0,
                },
            ],
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
    convertContentToMessage(content) {
        const message = {
            role: content.role === 'model'
                ? 'assistant'
                : content.role,
            content: [],
        };
        if (content.parts) {
            const contentParts = [];
            for (const part of content.parts) {
                if ('text' in part) {
                    contentParts.push({ text: part.text });
                }
                else if ('inlineData' in part) {
                    contentParts.push({
                        inlineData: {
                            mimeType: part.inlineData.mimeType,
                            data: part.inlineData.data,
                        },
                    });
                }
                else if ('functionCall' in part) {
                    contentParts.push({
                        functionCall: {
                            name: part.functionCall.name,
                            args: part.functionCall.args,
                        },
                    });
                }
            }
            if (contentParts.length === 1 && 'text' in contentParts[0]) {
                message.content = contentParts[0].text;
            }
            else {
                message.content = contentParts;
            }
        }
        return message;
    }
    /**
     * Convert UnifiedMessage to Anthropic message
     */
    convertMessageToAnthropic(message) {
        const anthropicMessage = {
            role: message.role === 'assistant' ? 'assistant' : 'user',
            content: '',
        };
        if (typeof message.content === 'string') {
            anthropicMessage.content = message.content;
        }
        else if (Array.isArray(message.content)) {
            const contentBlocks = [];
            for (const part of message.content) {
                if ('text' in part) {
                    contentBlocks.push({
                        type: 'text',
                        text: part.text,
                    });
                }
                else if ('inlineData' in part) {
                    // Convert base64 image data
                    contentBlocks.push({
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: part.inlineData.mimeType,
                            data: part.inlineData.data,
                        },
                    });
                }
                else if ('functionCall' in part) {
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
            }
            else {
                anthropicMessage.content = contentBlocks;
            }
        }
        return anthropicMessage;
    }
    /**
     * Convert UnifiedTool to Anthropic tool
     */
    convertToolToAnthropic(tool) {
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
    convertToolUseToFunctionCall(toolUse) {
        return {
            name: toolUse.name || '',
            args: toolUse.input || {},
        };
    }
    /**
     * Convert streaming event to unified format
     */
    convertStreamEvent(event) {
        const unifiedResponse = {
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
                }
                else if (event.content_block?.type === 'tool_use') {
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
    createToolResult(toolUseId, content, isError = false) {
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
    extractToolUseBlocks(response) {
        return response.content.filter((block) => block.type === 'tool_use');
    }
    /**
     * Check if response contains tool use
     */
    hasToolUse(response) {
        return response.content.some((block) => block.type === 'tool_use');
    }
}
//# sourceMappingURL=converter.js.map