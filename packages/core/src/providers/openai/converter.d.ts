/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { GenerateContentParameters, GenerateContentResponse, FunctionCall } from '@google/genai';
import { FormatConverter, UnifiedGenerateRequest, UnifiedGenerateResponse } from '../types.js';
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
    tool_choice?: 'auto' | 'none' | 'required' | {
        type: 'function';
        function: {
            name: string;
        };
    };
    stream?: boolean;
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
export declare class OpenAIFormatConverter implements FormatConverter {
    /**
     * Convert Gemini format to unified format
     */
    fromGeminiFormat(request: GenerateContentParameters): UnifiedGenerateRequest;
    /**
     * Convert unified format to OpenAI format
     */
    toProviderFormat(request: UnifiedGenerateRequest): OpenAIRequest;
    /**
     * Convert OpenAI response to unified format
     */
    fromProviderResponse(response: OpenAIResponse): UnifiedGenerateResponse;
    /**
     * Convert unified response to Gemini format
     */
    toGeminiFormat(response: UnifiedGenerateResponse): GenerateContentResponse;
    /**
     * Convert Gemini Content to UnifiedMessage
     */
    private convertContentToMessage;
    /**
     * Convert UnifiedMessage to OpenAI message
     */
    private convertMessageToOpenAI;
    /**
     * Convert UnifiedTool to OpenAI tool
     */
    private convertToolToOpenAI;
    /**
     * Convert OpenAI tool call to Gemini function call format
     */
    convertToolCallToFunctionCall(toolCall: OpenAIToolCall): FunctionCall;
    /**
     * Convert streaming chunk to unified format
     */
    convertStreamChunk(chunk: any): UnifiedGenerateResponse;
}
export {};
