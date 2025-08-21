/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Adapter for converting between unified tool format and OpenAI-specific formats.
 * This enables Gemini CLI's built-in tools to work seamlessly with OpenAI's API.
 *
 * The adapter handles the format differences between the unified tool interface
 * and OpenAI's function calling specification, ensuring proper serialization
 * and deserialization of tool calls and results.
 */
export class OpenAIToolAdapter {
    /**
     * Convert unified tool definition to OpenAI tool format.
     * OpenAI expects tools to be wrapped in a 'function' object with a specific structure.
     *
     * @param unifiedTool - Unified tool definition
     * @returns OpenAI-formatted tool
     */
    toProviderFormat(unifiedTool) {
        return {
            type: 'function',
            function: {
                name: unifiedTool.name,
                description: unifiedTool.description,
                parameters: {
                    type: 'object',
                    properties: unifiedTool.parameters.properties,
                    required: unifiedTool.parameters.required.length > 0
                        ? unifiedTool.parameters.required
                        : undefined,
                },
            },
        };
    }
    /**
     * Convert OpenAI tool call to unified format.
     * OpenAI provides tool calls as objects with function details and JSON string arguments.
     *
     * @param providerCall - OpenAI tool call
     * @returns Unified tool call
     */
    fromProviderToolCall(providerCall) {
        let parsedArguments;
        try {
            // OpenAI provides arguments as JSON string, parse it
            parsedArguments = JSON.parse(providerCall.function.arguments);
        }
        catch (error) {
            console.warn(`Failed to parse OpenAI tool arguments: ${error}`);
            // Fallback to empty object if parsing fails
            parsedArguments = {};
        }
        return {
            id: providerCall.id,
            name: providerCall.function.name,
            arguments: parsedArguments,
        };
    }
    /**
     * Convert unified tool result to OpenAI message format.
     * OpenAI expects tool results as 'tool' role messages with specific structure.
     *
     * @param unifiedResult - Unified tool result
     * @returns OpenAI tool message
     */
    toProviderToolResult(unifiedResult) {
        // Convert content to string format for OpenAI
        const content = this.formatContentForOpenAI(unifiedResult.content);
        return {
            role: 'tool',
            tool_call_id: unifiedResult.toolCallId,
            content,
        };
    }
    /**
     * Convert unified tool result content to OpenAI-compatible string format.
     * Handles various content types (string, objects, arrays) that might come from tools.
     *
     * @private
     */
    formatContentForOpenAI(content) {
        if (typeof content === 'string') {
            return content;
        }
        if (Array.isArray(content)) {
            // Handle array of parts (common in Gemini format)
            return content.map(part => {
                if (typeof part === 'string') {
                    return part;
                }
                else if (part && typeof part === 'object' && 'text' in part) {
                    return part.text;
                }
                else {
                    return JSON.stringify(part);
                }
            }).join('\n');
        }
        if (content && typeof content === 'object') {
            // Handle object content by converting to JSON
            return JSON.stringify(content, null, 2);
        }
        // Fallback to string conversion
        return String(content);
    }
    /**
     * Create an error tool message for OpenAI.
     * Useful when tool execution fails or invalid calls are made.
     *
     * @param toolCallId - The tool call ID that failed
     * @param errorMessage - Error message to include
     * @returns OpenAI tool message with error content
     */
    createErrorMessage(toolCallId, errorMessage) {
        return {
            role: 'tool',
            tool_call_id: toolCallId,
            content: `Error: ${errorMessage}`,
        };
    }
    /**
     * Validate OpenAI tool call format.
     * Ensures the tool call has the expected structure and required fields.
     *
     * @param toolCall - Tool call to validate
     * @returns True if valid, false otherwise
     */
    isValidToolCall(toolCall) {
        return (toolCall &&
            typeof toolCall === 'object' &&
            typeof toolCall.id === 'string' &&
            toolCall.type === 'function' &&
            toolCall.function &&
            typeof toolCall.function === 'object' &&
            typeof toolCall.function.name === 'string' &&
            typeof toolCall.function.arguments === 'string');
    }
    /**
     * Validate OpenAI tool format.
     * Ensures the tool has the expected structure for OpenAI API.
     *
     * @param tool - Tool to validate
     * @returns True if valid, false otherwise
     */
    isValidTool(tool) {
        return (tool &&
            typeof tool === 'object' &&
            tool.type === 'function' &&
            tool.function &&
            typeof tool.function === 'object' &&
            typeof tool.function.name === 'string' &&
            typeof tool.function.description === 'string' &&
            tool.function.parameters &&
            typeof tool.function.parameters === 'object');
    }
    /**
     * Extract tool names from OpenAI tool definitions.
     * Useful for debugging and validation purposes.
     *
     * @param tools - Array of OpenAI tools
     * @returns Array of tool names
     */
    extractToolNames(tools) {
        return tools
            .filter(tool => this.isValidTool(tool))
            .map(tool => tool.function.name);
    }
    /**
     * Create a batch of OpenAI tools from unified tools.
     * Convenience method for converting multiple tools at once.
     *
     * @param unifiedTools - Array of unified tools
     * @returns Array of OpenAI tools
     */
    batchToProviderFormat(unifiedTools) {
        return unifiedTools.map(tool => this.toProviderFormat(tool));
    }
    /**
     * Create a batch of unified tool calls from OpenAI tool calls.
     * Convenience method for converting multiple tool calls at once.
     *
     * @param providerCalls - Array of OpenAI tool calls
     * @returns Array of unified tool calls
     */
    batchFromProviderToolCalls(providerCalls) {
        return providerCalls
            .filter(call => this.isValidToolCall(call))
            .map(call => this.fromProviderToolCall(call));
    }
    /**
     * Create a batch of OpenAI tool messages from unified results.
     * Convenience method for converting multiple results at once.
     *
     * @param unifiedResults - Array of unified tool results
     * @returns Array of OpenAI tool messages
     */
    batchToProviderToolResults(unifiedResults) {
        return unifiedResults.map(result => this.toProviderToolResult(result));
    }
}
//# sourceMappingURL=tool-adapter.js.map