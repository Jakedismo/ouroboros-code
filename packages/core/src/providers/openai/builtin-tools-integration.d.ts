/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Config } from '../../config/config.js';
import { ConfirmationRequest, BuiltinToolsIntegration } from '../tools/unified-tool-interface.js';
import { OpenAITool, OpenAIToolCall, OpenAIToolMessage } from './tool-adapter.js';
/**
 * OpenAI-specific integration for Gemini CLI's built-in tools.
 * This class provides a complete implementation for using all 11 built-in tools
 * with OpenAI's API, maintaining the same behavior, security, and confirmation flows
 * as the original Gemini implementation.
 *
 * Features:
 * - Full access to all built-in tools (file system, web, system)
 * - Consistent confirmation flows and security boundaries
 * - Error handling and validation
 * - Progress reporting and cancellation support
 */
export declare class OpenAIBuiltinToolsIntegration implements BuiltinToolsIntegration {
    private config;
    private toolManager;
    private adapter;
    private behaviorManager;
    private fileSystemBoundary;
    constructor(config: Config);
    /**
     * Initialize the tool integration system.
     * This sets up all the built-in tools and security boundaries.
     */
    initialize(): Promise<void>;
    /**
     * Get all built-in tools formatted for OpenAI API.
     * Returns tools in the format expected by OpenAI's function calling API.
     *
     * @returns Array of OpenAI-formatted tools
     */
    getProviderTools(): OpenAITool[];
    /**
     * Execute tool calls from OpenAI response.
     * Handles multiple tool calls in parallel while maintaining proper confirmation flows.
     *
     * @param toolCalls - Array of OpenAI tool calls
     * @param options - Execution options
     * @returns Array of OpenAI tool messages
     */
    executeToolCalls(toolCalls: unknown[], options?: {
        onProgress?: (message: string) => void;
        onConfirmation?: (request: ConfirmationRequest) => Promise<boolean>;
        abortSignal?: AbortSignal;
    }): Promise<OpenAIToolMessage[]>;
    /**
     * Validate tool calls and convert them to proper format.
     *
     * @private
     */
    private validateAndConvertToolCalls;
    /**
     * Execute a single tool call with full error handling and validation.
     *
     * @private
     */
    private executeSingleTool;
    /**
     * Get information about available tools.
     * Useful for debugging and system introspection.
     *
     * @returns Tool information summary
     */
    getToolInfo(): {
        totalTools: number;
        toolNames: string[];
        toolsByCategory: Record<string, string[]>;
    };
    /**
     * Check if a specific tool is available.
     *
     * @param toolName - Name of the tool to check
     * @returns True if tool is available
     */
    hasTool(toolName: string): boolean;
    /**
     * Get the behavior configuration for a specific tool.
     *
     * @param toolName - Name of the tool
     * @returns Tool configuration
     */
    getToolBehavior(toolName: string): import("../tools/tool-behaviors.js").ToolSpecificConfig;
    /**
     * Validate tool parameters before execution.
     * Provides early validation without executing the tool.
     *
     * @param toolCall - Tool call to validate
     * @returns Validation result
     */
    validateToolCall(toolCall: OpenAIToolCall): {
        valid: boolean;
        error?: string;
        warnings?: string[];
    };
    /**
     * Create a test tool call for debugging purposes.
     *
     * @param toolName - Name of the tool
     * @param args - Tool arguments
     * @returns OpenAI tool call for testing
     */
    createTestToolCall(toolName: string, args?: Record<string, unknown>): OpenAIToolCall;
    /**
     * Get performance metrics about tool execution.
     *
     * @returns Basic performance information
     */
    getPerformanceInfo(): {
        toolRegistry: boolean;
        fileSystemBoundary: boolean;
        totalBuiltinTools: number;
    };
}
