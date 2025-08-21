/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Config } from '../../config/config.js';
import { ConfirmationRequest, BuiltinToolsIntegration, UnifiedToolCall, ToolValidationResult } from '../tools/unified-tool-interface.js';
import { AnthropicTool, AnthropicToolUse, AnthropicToolResult } from './tool-adapter.js';
/**
 * Anthropic-specific integration for Gemini CLI's built-in tools.
 * This class provides a complete implementation for using all 11 built-in tools
 * with Anthropic's API, maintaining the same behavior, security, and confirmation flows
 * as the original Gemini implementation.
 *
 * Features:
 * - Full access to all built-in tools (file system, web, system)
 * - Consistent confirmation flows and security boundaries
 * - Error handling and validation
 * - Progress reporting and cancellation support
 * - Native Anthropic tool_use format support
 */
export declare class AnthropicBuiltinToolsIntegration implements BuiltinToolsIntegration {
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
     * Get all built-in tools formatted for Anthropic API.
     * Returns tools in the format expected by Anthropic's tool use functionality.
     *
     * @returns Array of Anthropic-formatted tools
     */
    getProviderTools(): AnthropicTool[];
    /**
     * Execute tool use blocks from Anthropic response.
     * Handles multiple tool uses in sequence while maintaining proper confirmation flows.
     *
     * @param toolUseBlocks - Array of Anthropic tool use blocks
     * @param options - Execution options
     * @returns Array of Anthropic tool results
     */
    executeToolCalls(toolUseBlocks: unknown[], options?: {
        onProgress?: (message: string) => void;
        onConfirmation?: (request: ConfirmationRequest) => Promise<boolean>;
        abortSignal?: AbortSignal;
    }): Promise<AnthropicToolResult[]>;
    /**
     * Validate tool use blocks and convert them to proper format.
     *
     * @private
     */
    private validateAndConvertToolUse;
    /**
     * Execute a single tool use with full error handling and validation.
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
     * Validate tool use before execution.
     * Provides early validation without executing the tool.
     *
     * @param toolCall - Tool call to validate
     * @returns Validation result
     */
    validateToolCall(toolCall: UnifiedToolCall): ToolValidationResult;
    /**
     * Create a test tool use for debugging purposes.
     *
     * @param toolName - Name of the tool
     * @param input - Tool input parameters
     * @returns Anthropic tool use for testing
     */
    createTestToolUse(toolName: string, input?: Record<string, unknown>): AnthropicToolUse;
    /**
     * Execute a single tool use block from Anthropic.
     * Convenience method for single tool execution.
     *
     * @param toolUse - Anthropic tool use block
     * @param options - Execution options
     * @returns Anthropic tool result
     */
    executeSingleToolUse(toolUse: AnthropicToolUse, options?: {
        onProgress?: (message: string) => void;
        onConfirmation?: (request: ConfirmationRequest) => Promise<boolean>;
        abortSignal?: AbortSignal;
    }): Promise<AnthropicToolResult>;
    /**
     * Batch validate multiple tool use blocks.
     *
     * @param toolUseBlocks - Array of tool use blocks
     * @returns Array of validation results
     */
    batchValidateToolUse(toolUseBlocks: AnthropicToolUse[]): Array<{
        toolUse: AnthropicToolUse;
        valid: boolean;
        error?: string;
        warnings?: string[];
    }>;
    /**
     * Get performance metrics about tool execution.
     *
     * @returns Basic performance information
     */
    getPerformanceInfo(): {
        toolRegistry: boolean;
        fileSystemBoundary: boolean;
        totalBuiltinTools: number;
        adapterType: string;
    };
    /**
     * Check if all tools are safe for automatic execution.
     * Useful for determining if confirmation flows can be bypassed.
     *
     * @param toolUseBlocks - Array of tool use blocks to check
     * @returns True if all tools are considered safe
     */
    areAllToolsSafe(toolUseBlocks: AnthropicToolUse[]): boolean;
    /**
     * Get timeout for tool execution batch.
     * Returns the maximum timeout needed for all tools in the batch.
     *
     * @param toolUseBlocks - Array of tool use blocks
     * @returns Maximum timeout in milliseconds
     */
    getBatchTimeout(toolUseBlocks: AnthropicToolUse[]): number;
}
