/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Converter for Gemini format - essentially a pass-through since Gemini is our base format
 */
export class GeminiFormatConverter {
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
                // Extract text from parts
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
            unifiedRequest.topK = request.generationConfig.topK;
        }
        // Convert tools
        if (request.tools) {
            unifiedRequest.tools = request.tools.map((tool) => this.convertGeminiToolToUnified(tool));
            // Convert tool choice if present
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
     * Convert unified format to Gemini format (pass-through for Gemini)
     */
    toProviderFormat(request) {
        const geminiRequest = {
            contents: request.messages.map((message) => this.convertMessageToContent(message)),
        };
        // Convert system instruction
        if (request.systemInstruction) {
            geminiRequest.systemInstruction = {
                parts: [{ text: request.systemInstruction }],
            };
        }
        // Convert generation config
        if (request.maxTokens ||
            request.temperature ||
            request.topP ||
            request.topK) {
            geminiRequest.generationConfig = {
                maxOutputTokens: request.maxTokens,
                temperature: request.temperature,
                topP: request.topP,
                topK: request.topK,
            };
        }
        // Convert tools
        if (request.tools) {
            geminiRequest.tools = request.tools.map((tool) => this.convertUnifiedToolToGemini(tool));
            // Convert tool choice
            if (request.toolChoice) {
                geminiRequest.toolConfig = {
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
    fromProviderResponse(response) {
        const unifiedResponse = {
            content: '',
        };
        // Extract text content
        if (response.candidates && response.candidates.length > 0) {
            const candidate = response.candidates[0];
            const textParts = [];
            if (candidate.content?.parts) {
                for (const part of candidate.content.parts) {
                    if ('text' in part && part.text) {
                        textParts.push(part.text);
                    }
                }
            }
            unifiedResponse.content = textParts.join('');
            // Extract function calls
            const functionCalls = [];
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
                else if ('fileData' in part) {
                    contentParts.push({
                        fileData: {
                            mimeType: part.fileData.mimeType,
                            fileUri: part.fileData.fileUri,
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
     * Convert UnifiedMessage to Gemini Content
     */
    convertMessageToContent(message) {
        const content = {
            role: message.role === 'assistant' ? 'model' : message.role,
            parts: [],
        };
        if (typeof message.content === 'string') {
            content.parts = [{ text: message.content }];
        }
        else if (Array.isArray(message.content)) {
            content.parts = message.content.map((part) => {
                if ('text' in part) {
                    return { text: part.text };
                }
                else if ('inlineData' in part) {
                    return {
                        inlineData: {
                            mimeType: part.inlineData.mimeType,
                            data: part.inlineData.data,
                        },
                    };
                }
                else if ('fileData' in part) {
                    return {
                        fileData: {
                            mimeType: part.fileData.mimeType,
                            fileUri: part.fileData.fileUri,
                        },
                    };
                }
                else if ('functionCall' in part) {
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
    convertGeminiToolToUnified(tool) {
        if (tool.functionDeclarations && tool.functionDeclarations.length > 0) {
            const func = tool.functionDeclarations[0];
            return {
                name: func.name,
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
    convertUnifiedToolToGemini(tool) {
        return {
            functionDeclarations: [
                {
                    name: tool.name,
                    description: tool.description,
                    parameters: {
                        type: 'object',
                        properties: tool.parameters.properties,
                        required: tool.parameters.required,
                    },
                },
            ],
        };
    }
    /**
     * Convert unified tool choice to Gemini format
     */
    convertToolChoiceToGemini(toolChoice) {
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
//# sourceMappingURL=converter.js.map