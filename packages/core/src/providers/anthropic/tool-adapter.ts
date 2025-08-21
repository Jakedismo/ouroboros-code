/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  UnifiedTool, 
  UnifiedToolCall, 
  UnifiedToolResult, 
  ProviderToolAdapter 
} from '../tools/unified-tool-interface.js';

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
  content: string | Array<{ type: 'text'; text: string }>;
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
export class AnthropicToolAdapter implements ProviderToolAdapter<AnthropicTool, AnthropicToolUse, AnthropicToolResult> {
  
  /**
   * Convert unified tool definition to Anthropic tool format.
   * Anthropic uses a more direct format with input_schema instead of parameters.
   * 
   * @param unifiedTool - Unified tool definition
   * @returns Anthropic-formatted tool
   */
  toProviderFormat(unifiedTool: UnifiedTool): AnthropicTool {
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
  fromProviderToolCall(providerCall: AnthropicToolUse): UnifiedToolCall {
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
  toProviderToolResult(unifiedResult: UnifiedToolResult): AnthropicToolResult {
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
  private formatContentForAnthropic(content: unknown): string | Array<{ type: 'text'; text: string }> {
    if (typeof content === 'string') {
      return content;
    }
    
    if (Array.isArray(content)) {
      // Handle array of parts (common in Gemini format)
      const textParts = content.map(part => {
        if (typeof part === 'string') {
          return { type: 'text' as const, text: part };
        } else if (part && typeof part === 'object' && 'text' in part) {
          return { type: 'text' as const, text: String(part.text) };
        } else {
          return { type: 'text' as const, text: JSON.stringify(part) };
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
  createErrorResult(toolUseId: string, errorMessage: string): AnthropicToolResult {
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
  isValidToolUse(toolUse: unknown): toolUse is AnthropicToolUse {
    return (
      !!toolUse &&
      typeof toolUse === 'object' &&
      (toolUse as any).type === 'tool_use' &&
      typeof (toolUse as any).id === 'string' &&
      typeof (toolUse as any).name === 'string' &&
      typeof (toolUse as any).input === 'object' &&
      (toolUse as any).input !== null
    );
  }
  
  /**
   * Validate Anthropic tool format.
   * Ensures the tool has the expected structure for Anthropic API.
   * 
   * @param tool - Tool to validate
   * @returns True if valid, false otherwise
   */
  isValidTool(tool: unknown): tool is AnthropicTool {
    return (
      tool &&
      typeof tool === 'object' &&
      typeof (tool as any).name === 'string' &&
      typeof (tool as any).description === 'string' &&
      (tool as any).input_schema &&
      typeof (tool as any).input_schema === 'object' &&
      (tool as any).input_schema.type === 'object'
    );
  }
  
  /**
   * Extract tool names from Anthropic tool definitions.
   * Useful for debugging and validation purposes.
   * 
   * @param tools - Array of Anthropic tools
   * @returns Array of tool names
   */
  extractToolNames(tools: AnthropicTool[]): string[] {
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
  batchToProviderFormat(unifiedTools: UnifiedTool[]): AnthropicTool[] {
    return unifiedTools.map(tool => this.toProviderFormat(tool));
  }
  
  /**
   * Create a batch of unified tool calls from Anthropic tool uses.
   * Convenience method for converting multiple tool uses at once.
   * 
   * @param providerCalls - Array of Anthropic tool uses
   * @returns Array of unified tool calls
   */
  batchFromProviderToolCalls(providerCalls: AnthropicToolUse[]): UnifiedToolCall[] {
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
  batchToProviderToolResults(unifiedResults: UnifiedToolResult[]): AnthropicToolResult[] {
    return unifiedResults.map(result => this.toProviderToolResult(result));
  }
  
  /**
   * Check if a tool result indicates an error.
   * Helper method for error handling.
   * 
   * @param result - Anthropic tool result
   * @returns True if result indicates an error
   */
  isErrorResult(result: AnthropicToolResult): boolean {
    return result.is_error === true;
  }
  
  /**
   * Extract text content from Anthropic tool result.
   * Handles both string and structured content formats.
   * 
   * @param result - Anthropic tool result
   * @returns Extracted text content
   */
  extractTextContent(result: AnthropicToolResult): string {
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
  createSuccessResult(toolUseId: string, content: string): AnthropicToolResult {
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
  contentToString(content: string | Array<{ type: 'text'; text: string }>): string {
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