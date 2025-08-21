/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Adapter for converting between unified tool format and Anthropic-specific formats.
 * This enables Gemini CLI's built-in tools to work seamlessly with Anthropic's API.
 *
 * The adapter handles the format differences between the unified tool interface
 * and Anthropic's tool use specification, ensuring proper serialization
 * and deserialization of tool calls and results.
 */
export class AnthropicToolAdapter {
    /**
     * Convert unified tool definition to Anthropic tool format.
     * Anthropic uses a more direct format with input_schema instead of parameters.
     *
     * @param unifiedTool - Unified tool definition
     * @returns Anthropic-formatted tool
     */
    toProviderFormat(unifiedTool) {
        return {
            name: unifiedTool.name,
            description: unifiedTool.description,
            input_schema: {
                type: 'object',
                properties: unifiedTool.parameters.properties,
                required: unifiedTool.parameters.required.length > 0
                    ? unifiedTool.parameters.required
                    : undefined,
            },
        };
    }
    /**
     * Convert Anthropic tool use to unified format.
     * Anthropic provides tool use as objects with direct input parameters.
     *
     * @param providerCall - Anthropic tool use
     * @returns Unified tool call
     */
    fromProviderToolCall(providerCall) {
        return {
            id: providerCall.id,
            name: providerCall.name,
            arguments: providerCall.input || {},
        };
    }
    /**
     * Convert unified tool result to Anthropic format.
     * Anthropic expects tool results in a specific tool_result format.
     *
     * @param unifiedResult - Unified tool result
     * @returns Anthropic tool result
     */
    toProviderToolResult(unifiedResult) {
        // Convert content to Anthropic format
        const content = this.formatContentForAnthropic(unifiedResult.content);
        return {
            type: 'tool_result',
            tool_use_id: unifiedResult.toolCallId,
            content,
            is_error: unifiedResult.isError || undefined,
        };
    }
    /**
     * Convert unified tool result content to Anthropic-compatible format.
     * Handles various content types and structures.
     *
     * @private
     */
    formatContentForAnthropic(content) {
        if (typeof content === 'string') {
            return content;
        }
        if (Array.isArray(content)) {
            // Handle array of parts (common in Gemini format)
            const textParts = content.map(part => {
                if (typeof part === 'string') {
                    return { type: 'text', text: part };
                }
                else if (part && typeof part === 'object' && 'text' in part) {
                    return { type: 'text', text: String(part.text) };
                }
                else {
                    return { type: 'text', text: JSON.stringify(part) };
                }
            });
            // If only one text part, return as string
            if (textParts.length === 1) {
                return textParts[0].text;
            }
            return textParts;
        }
        if (content && typeof content === 'object') {
            // Handle object content by converting to JSON
            return JSON.stringify(content, null, 2);
        }
        // Fallback to string conversion
        return String(content);
    }
    /**
     * Create an error tool result for Anthropic.
     * Useful when tool execution fails or invalid calls are made.
     *
     * @param toolUseId - The tool use ID that failed
     * @param errorMessage - Error message to include
     * @returns Anthropic tool result with error content
     */
    createErrorResult(toolUseId, errorMessage) {
        return {
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: `Error: ${errorMessage}`,
            is_error: true,
        };
    }
    /**
     * Validate Anthropic tool use format.
     * Ensures the tool use has the expected structure and required fields.
     *
     * @param toolUse - Tool use to validate
     * @returns True if valid, false otherwise
     */
    isValidToolUse(toolUse) {
        return (toolUse &&
            typeof toolUse === 'object' &&
            toolUse.type === 'tool_use' &&
            typeof toolUse.id === 'string' &&
            typeof toolUse.name === 'string' &&
            typeof toolUse.input === 'object' &&
            toolUse.input !== null);
    }
    /**
     * Validate Anthropic tool format.
     * Ensures the tool has the expected structure for Anthropic API.
     *
     * @param tool - Tool to validate
     * @returns True if valid, false otherwise
     */
    isValidTool(tool) {
        return (tool &&
            typeof tool === 'object' &&
            typeof tool.name === 'string' &&
            typeof tool.description === 'string' &&
            tool.input_schema &&
            typeof tool.input_schema === 'object' &&
            tool.input_schema.type === 'object');
    }
    /**
     * Extract tool names from Anthropic tool definitions.
     * Useful for debugging and validation purposes.
     *
     * @param tools - Array of Anthropic tools
     * @returns Array of tool names
     */
    extractToolNames(tools) {
        return tools
            .filter(tool => this.isValidTool(tool))
            .map(tool => tool.name);
    }
    /**
     * Create a batch of Anthropic tools from unified tools.
     * Convenience method for converting multiple tools at once.
     *
     * @param unifiedTools - Array of unified tools
     * @returns Array of Anthropic tools
     */
    batchToProviderFormat(unifiedTools) {
        return unifiedTools.map(tool => this.toProviderFormat(tool));
    }
    /**
     * Create a batch of unified tool calls from Anthropic tool uses.
     * Convenience method for converting multiple tool uses at once.
     *
     * @param providerCalls - Array of Anthropic tool uses
     * @returns Array of unified tool calls
     */
    batchFromProviderToolCalls(providerCalls) {
        return providerCalls
            .filter(call => this.isValidToolUse(call))
            .map(call => this.fromProviderToolCall(call));
    }
    /**
     * Create a batch of Anthropic tool results from unified results.
     * Convenience method for converting multiple results at once.
     *
     * @param unifiedResults - Array of unified tool results
     * @returns Array of Anthropic tool results
     */
    batchToProviderToolResults(unifiedResults) {
        return unifiedResults.map(result => this.toProviderToolResult(result));
    }
    /**
     * Check if a tool result indicates an error.
     * Helper method for error handling.
     *
     * @param result - Anthropic tool result
     * @returns True if result indicates an error
     */
    isErrorResult(result) {
        return result.is_error === true;
    }
    /**
     * Extract text content from Anthropic tool result.
     * Handles both string and structured content formats.
     *
     * @param result - Anthropic tool result
     * @returns Extracted text content
     */
    extractTextContent(result) {
        if (typeof result.content === 'string') {
            return result.content;
        }
        if (Array.isArray(result.content)) {
            return result.content
                .map(part => part.type === 'text' ? part.text : '')
                .join('\n');
        }
        return '';
    }
    /**
     * Create a success tool result for Anthropic.
     * Helper method for creating successful tool results.
     *
     * @param toolUseId - The tool use ID
     * @param content - Success content
     * @returns Anthropic tool result
     */
    createSuccessResult(toolUseId, content) {
        return {
            type: 'tool_result',
            tool_use_id: toolUseId,
            content,
            is_error: false,
        };
    }
    /**
     * Convert Anthropic content format to simple string.
     * Utility method for content processing.
     *
     * @param content - Anthropic content format
     * @returns Simple string representation
     */
    contentToString(content) {
        if (typeof content === 'string') {
            return content;
        }
        if (Array.isArray(content)) {
            return content
                .filter(part => part.type === 'text')
                .map(part => part.text)
                .join('\n');
        }
        return '';
    }
}
//# sourceMappingURL=tool-adapter.js.map