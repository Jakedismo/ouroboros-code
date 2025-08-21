/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { GenerateContentParameters, GenerateContentResponse, FunctionCall } from '@google/genai';
import { FormatConverter, UnifiedGenerateRequest, UnifiedGenerateResponse } from '../types.js';
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
interface AnthropicStreamEvent {
    type: string;
    message?: AnthropicResponse;
    delta?: {
        type: string;
        text?: string;
        stop_reason?: string;
    };
    content_block?: AnthropicContentBlock;
}
/**
 * Converter for Anthropic format to/from Gemini unified format
 */
export declare class AnthropicFormatConverter implements FormatConverter {
    /**
     * Convert Gemini format to unified format
     */
    fromGeminiFormat(request: GenerateContentParameters): UnifiedGenerateRequest;
    /**
     * Convert unified format to Anthropic format
     */
    toProviderFormat(request: UnifiedGenerateRequest): AnthropicRequest;
    /**
     * Convert Anthropic response to unified format
     */
    fromProviderResponse(response: AnthropicResponse): UnifiedGenerateResponse;
    /**
     * Convert unified response to Gemini format
     */
    toGeminiFormat(response: UnifiedGenerateResponse): GenerateContentResponse;
    /**
     * Convert Gemini Content to UnifiedMessage
     */
    private convertContentToMessage;
    /**
     * Convert UnifiedMessage to Anthropic message
     */
    private convertMessageToAnthropic;
    /**
     * Convert UnifiedTool to Anthropic tool
     */
    private convertToolToAnthropic;
    /**
     * Convert Anthropic tool use to Gemini function call format
     */
    convertToolUseToFunctionCall(toolUse: AnthropicContentBlock): FunctionCall;
    /**
     * Convert streaming event to unified format
     */
    convertStreamEvent(event: AnthropicStreamEvent): UnifiedGenerateResponse;
    /**
     * Create tool result content for Anthropic
     */
    createToolResult(toolUseId: string, content: string, isError?: boolean): AnthropicContentBlock;
    /**
     * Extract tool use blocks from Anthropic response
     */
    extractToolUseBlocks(response: AnthropicResponse): AnthropicContentBlock[];
    /**
     * Check if response contains tool use
     */
    hasToolUse(response: AnthropicResponse): boolean;
}
export {};
