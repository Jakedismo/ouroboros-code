/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { UnifiedTool, UnifiedToolCall, UnifiedToolResult, ProviderToolAdapter } from '../tools/unified-tool-interface.js';
/**
 * Anthropic-specific tool format interfaces based on the Anthropic API specification.
 * These match the expected format for Anthropic's tool use functionality.
 */
export interface AnthropicTool {
    name: string;
    description: string;
    input_schema: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
    };
}
export interface AnthropicToolUse {
    type: 'tool_use';
    id: string;
    name: string;
    input: Record<string, unknown>;
}
export interface AnthropicToolResult {
    type: 'tool_result';
    tool_use_id: string;
    content: string | Array<{
        type: 'text';
        text: string;
    }>;
    is_error?: boolean;
}
/**
 * Adapter for converting between unified tool format and Anthropic-specific formats.
 * This enables Gemini CLI's built-in tools to work seamlessly with Anthropic's API.
 *
 * The adapter handles the format differences between the unified tool interface
 * and Anthropic's tool use specification, ensuring proper serialization
 * and deserialization of tool calls and results.
 */
export declare class AnthropicToolAdapter implements ProviderToolAdapter<AnthropicTool, AnthropicToolUse, AnthropicToolResult> {
    /**
     * Convert unified tool definition to Anthropic tool format.
     * Anthropic uses a more direct format with input_schema instead of parameters.
     *
     * @param unifiedTool - Unified tool definition
     * @returns Anthropic-formatted tool
     */
    toProviderFormat(unifiedTool: UnifiedTool): AnthropicTool;
    /**
     * Convert Anthropic tool use to unified format.
     * Anthropic provides tool use as objects with direct input parameters.
     *
     * @param providerCall - Anthropic tool use
     * @returns Unified tool call
     */
    fromProviderToolCall(providerCall: AnthropicToolUse): UnifiedToolCall;
    /**
     * Convert unified tool result to Anthropic format.
     * Anthropic expects tool results in a specific tool_result format.
     *
     * @param unifiedResult - Unified tool result
     * @returns Anthropic tool result
     */
    toProviderToolResult(unifiedResult: UnifiedToolResult): AnthropicToolResult;
    /**
     * Convert unified tool result content to Anthropic-compatible format.
     * Handles various content types and structures.
     *
     * @private
     */
    private formatContentForAnthropic;
    /**
     * Create an error tool result for Anthropic.
     * Useful when tool execution fails or invalid calls are made.
     *
     * @param toolUseId - The tool use ID that failed
     * @param errorMessage - Error message to include
     * @returns Anthropic tool result with error content
     */
    createErrorResult(toolUseId: string, errorMessage: string): AnthropicToolResult;
    /**
     * Validate Anthropic tool use format.
     * Ensures the tool use has the expected structure and required fields.
     *
     * @param toolUse - Tool use to validate
     * @returns True if valid, false otherwise
     */
    isValidToolUse(toolUse: unknown): toolUse is AnthropicToolUse;
    /**
     * Validate Anthropic tool format.
     * Ensures the tool has the expected structure for Anthropic API.
     *
     * @param tool - Tool to validate
     * @returns True if valid, false otherwise
     */
    isValidTool(tool: unknown): tool is AnthropicTool;
    /**
     * Extract tool names from Anthropic tool definitions.
     * Useful for debugging and validation purposes.
     *
     * @param tools - Array of Anthropic tools
     * @returns Array of tool names
     */
    extractToolNames(tools: AnthropicTool[]): string[];
    /**
     * Create a batch of Anthropic tools from unified tools.
     * Convenience method for converting multiple tools at once.
     *
     * @param unifiedTools - Array of unified tools
     * @returns Array of Anthropic tools
     */
    batchToProviderFormat(unifiedTools: UnifiedTool[]): AnthropicTool[];
    /**
     * Create a batch of unified tool calls from Anthropic tool uses.
     * Convenience method for converting multiple tool uses at once.
     *
     * @param providerCalls - Array of Anthropic tool uses
     * @returns Array of unified tool calls
     */
    batchFromProviderToolCalls(providerCalls: AnthropicToolUse[]): UnifiedToolCall[];
    /**
     * Create a batch of Anthropic tool results from unified results.
     * Convenience method for converting multiple results at once.
     *
     * @param unifiedResults - Array of unified tool results
     * @returns Array of Anthropic tool results
     */
    batchToProviderToolResults(unifiedResults: UnifiedToolResult[]): AnthropicToolResult[];
    /**
     * Check if a tool result indicates an error.
     * Helper method for error handling.
     *
     * @param result - Anthropic tool result
     * @returns True if result indicates an error
     */
    isErrorResult(result: AnthropicToolResult): boolean;
    /**
     * Extract text content from Anthropic tool result.
     * Handles both string and structured content formats.
     *
     * @param result - Anthropic tool result
     * @returns Extracted text content
     */
    extractTextContent(result: AnthropicToolResult): string;
    /**
     * Create a success tool result for Anthropic.
     * Helper method for creating successful tool results.
     *
     * @param toolUseId - The tool use ID
     * @param content - Success content
     * @returns Anthropic tool result
     */
    createSuccessResult(toolUseId: string, content: string): AnthropicToolResult;
    /**
     * Convert Anthropic content format to simple string.
     * Utility method for content processing.
     *
     * @param content - Anthropic content format
     * @returns Simple string representation
     */
    contentToString(content: string | Array<{
        type: 'text';
        text: string;
    }>): string;
}
