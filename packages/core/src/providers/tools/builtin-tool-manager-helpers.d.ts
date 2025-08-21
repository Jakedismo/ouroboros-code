/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { AnyDeclarativeTool } from '../../tools/tools.js';
import { UnifiedTool, UnifiedToolCall, UnifiedToolResult, ToolExecutionContext } from './unified-tool-interface.js';
import { ToolBehaviorManager } from './tool-behaviors.js';
import { FileSystemBoundary } from './filesystem-boundary.js';
import { ShellToolSecurity } from './shell-tool-security.js';
import { WebToolsHandler } from './web-tools-handler.js';
/**
 * Security validation result
 */
export interface SecurityValidationResult {
    allowed: boolean;
    reason?: string;
    riskLevel?: 'SAFE' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
    requiresConfirmation?: boolean;
}
/**
 * Helper methods for the BuiltinToolManager to maintain clean separation of concerns
 */
export declare class BuiltinToolManagerHelpers {
    /**
     * Execute tool with resource pooling and error handling
     */
    static executeToolOptimized(tool: AnyDeclarativeTool, toolCall: UnifiedToolCall, context: ToolExecutionContext, toolBehaviors: ToolBehaviorManager, fileSystemBoundary: FileSystemBoundary, shellSecurity: ShellToolSecurity, webHandler: WebToolsHandler): Promise<UnifiedToolResult>;
    /**
     * Validate tool security across all security components
     */
    static validateToolSecurity(toolCall: UnifiedToolCall, context: ToolExecutionContext, toolBehaviors: ToolBehaviorManager, fileSystemBoundary: FileSystemBoundary, shellSecurity: ShellToolSecurity, webHandler: WebToolsHandler): Promise<SecurityValidationResult>;
    /**
     * Validate file system tool operations
     */
    private static validateFileSystemTool;
    /**
     * Validate shell tool commands
     */
    private static validateShellTool;
    /**
     * Validate web tool requests
     */
    private static validateWebTool;
    /**
     * Handle tool confirmation flow
     */
    private static handleConfirmation;
    /**
     * Format confirmation message for user display
     */
    private static formatConfirmationMessage;
    /**
     * Convert internal ToolResult to UnifiedToolResult
     */
    private static convertFromToolResult;
    /**
     * Create error result with consistent format
     */
    static createErrorResult(toolCallId: string, errorMessage: string): UnifiedToolResult;
    /**
     * Get resource type needed for a tool
     */
    private static getResourceTypeForTool;
    /**
     * Get resource pool for a resource type
     */
    private static getResourcePool;
    /**
     * Get tool category for security validation
     */
    static getToolCategory(toolName: string): 'filesystem' | 'web' | 'system' | 'other';
    /**
     * Check if tool results should be cached
     */
    static shouldCacheResult(toolName: string): boolean;
    /**
     * Pre-warm commonly used tools for better initial performance
     */
    static preWarmTools(builtinTools: Map<string, AnyDeclarativeTool>): Promise<void>;
    /**
     * Record execution statistics
     */
    static recordExecution(toolName: string, executionTime: number, success: boolean, stats: unknown, performanceOptimizer: unknown): void;
    /**
     * Convert Gemini schema to unified tool format
     */
    static convertToUnified(declaration: unknown, tool: AnyDeclarativeTool): UnifiedTool;
}
