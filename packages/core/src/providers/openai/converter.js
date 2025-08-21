/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Converter for OpenAI format to/from Gemini unified format
 */
export class OpenAIFormatConverter {
    /**
     * Convert Gemini format to unified format
     */
    fromGeminiFormat(request) {
        const unifiedRequest = {
            messages: [],
        };
        // Convert contents to messages
        if (request.contents) {
            unifiedRequest.messages = request.contents.map((content) => this.convertContentToMessage(content));
        }
        // Convert system instruction
        if (request.systemInstruction) {
            if (typeof request.systemInstruction === 'string') {
                unifiedRequest.systemInstruction = request.systemInstruction;
            }
            else if (request.systemInstruction.parts) {
                const textParts = request.systemInstruction.parts
                    .filter((part) => 'text' in part)
                    .map((part) => part.text);
                unifiedRequest.systemInstruction = textParts.join('\n');
            }
        }
        // Convert generation config
        if (request.generationConfig) {
            unifiedRequest.maxTokens = request.generationConfig.maxOutputTokens;
            unifiedRequest.temperature = request.generationConfig.temperature;
            unifiedRequest.topP = request.generationConfig.topP;
        }
        // Convert tools
        if (request.tools) {
            unifiedRequest.tools = request.tools.flatMap((tool) => tool.functionDeclarations?.map((func) => ({
                name: func.name,
                description: func.description || '',
                parameters: {
                    type: 'object',
                    properties: func.parameters?.properties || {},
                    required: func.parameters?.required || [],
                },
            })) || []);
            // Convert tool choice
            if (request.toolConfig?.functionCallingConfig) {
                const mode = request.toolConfig.functionCallingConfig.mode;
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
    toProviderFormat(request) {
        const openaiRequest = {
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
        openaiRequest.messages.push(...request.messages.map((message) => this.convertMessageToOpenAI(message)));
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
            openaiRequest.tools = request.tools.map((tool) => this.convertToolToOpenAI(tool));
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
        return openaiRequest;
    }
    /**
     * Convert OpenAI response to unified format
     */
    fromProviderResponse(response) {
        const unifiedResponse = {
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
                unifiedResponse.finishReason = choice.finish_reason;
            }
        }
        // Convert usage metadata
        if (response.usage) {
            unifiedResponse.usage = {
                promptTokenCount: response.usage.prompt_tokens,
                candidatesTokenCount: response.usage.completion_tokens,
                totalTokenCount: response.usage.total_tokens,
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
            role: content.role === 'model' ? 'assistant' : content.role,
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
     * Convert UnifiedMessage to OpenAI message
     */
    convertMessageToOpenAI(message) {
        const openaiMessage = {
            role: message.role === 'assistant'
                ? 'assistant'
                : message.role === 'function'
                    ? 'tool'
                    : message.role,
        };
        if (typeof message.content === 'string') {
            openaiMessage.content = message.content;
        }
        else if (Array.isArray(message.content)) {
            const contentParts = [];
            const toolCalls = [];
            for (const part of message.content) {
                if ('text' in part) {
                    contentParts.push({
                        type: 'text',
                        text: part.text,
                    });
                }
                else if ('inlineData' in part) {
                    // Convert base64 data to data URL
                    const dataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                    contentParts.push({
                        type: 'image_url',
                        image_url: {
                            url: dataUrl,
                            detail: 'auto',
                        },
                    });
                }
                else if ('functionCall' in part) {
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
    convertToolToOpenAI(tool) {
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
    convertToolCallToFunctionCall(toolCall) {
        return {
            name: toolCall.function.name,
            args: JSON.parse(toolCall.function.arguments || '{}'),
        };
    }
    /**
     * Convert streaming chunk to unified format
     */
    convertStreamChunk(chunk) {
        const unifiedResponse = {
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
                unifiedResponse.functionCalls = delta.tool_calls.map((toolCall) => ({
                    name: toolCall.function?.name || '',
                    args: toolCall.function?.arguments
                        ? JSON.parse(toolCall.function.arguments)
                        : {},
                }));
            }
            // Extract finish reason
            if (choice.finish_reason) {
                unifiedResponse.finishReason = choice.finish_reason;
            }
        }
        return unifiedResponse;
    }
}
//# sourceMappingURL=converter.js.map