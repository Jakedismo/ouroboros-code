/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { GenerateContentParameters, GenerateContentResponse } from '@google/genai';
import { FormatConverter, UnifiedGenerateRequest, UnifiedGenerateResponse } from '../types.js';
/**
 * Converter for Gemini format - essentially a pass-through since Gemini is our base format
 */
export declare class GeminiFormatConverter implements FormatConverter {
    /**
     * Convert Gemini format to unified format
     */
    fromGeminiFormat(request: GenerateContentParameters): UnifiedGenerateRequest;
    /**
     * Convert unified format to Gemini format (pass-through for Gemini)
     */
    toProviderFormat(request: UnifiedGenerateRequest): GenerateContentParameters;
    /**
     * Convert Gemini response to unified format
     */
    fromProviderResponse(response: GenerateContentResponse): UnifiedGenerateResponse;
    /**
     * Convert unified response back to Gemini format (pass-through for Gemini)
     */
    toGeminiFormat(response: UnifiedGenerateResponse): GenerateContentResponse;
    /**
     * Convert Gemini Content to UnifiedMessage
     */
    private convertContentToMessage;
    /**
     * Convert UnifiedMessage to Gemini Content
     */
    private convertMessageToContent;
    /**
     * Convert Gemini Tool to UnifiedTool
     */
    private convertGeminiToolToUnified;
    /**
     * Convert UnifiedTool to Gemini Tool
     */
    private convertUnifiedToolToGemini;
    /**
     * Convert unified tool choice to Gemini format
     */
    private convertToolChoiceToGemini;
}
