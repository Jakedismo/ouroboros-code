/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Config } from '../../config/config.js';
import { Kind } from '../../tools/tools.js';
/**
 * Tool-specific configuration for behavior management.
 * Defines how each tool should behave including security, confirmation, and execution settings.
 */
export interface ToolSpecificConfig {
    /** Whether tool execution requires user confirmation */
    requiresConfirmation: boolean;
    /** Whether tool respects .gitignore rules for file operations */
    respectsGitIgnore?: boolean;
    /** Whether tool operations are bounded to project root directory */
    boundToProjectRoot?: boolean;
    /** Whether tool supports diff preview for file modifications */
    supportsDiff?: boolean;
    /** Set of allowlisted commands or patterns for security */
    allowlist?: Set<string>;
    /** Execution timeout in milliseconds */
    timeout?: number;
    /** Maximum number of URLs/files that can be processed */
    maxItems?: number;
    /** Whether to block private IP addresses for web operations */
    blocksPrivateIPs?: boolean;
    /** Whether data persists across sessions */
    persistsAcrossSessions?: boolean;
    /** Whether tool supports hierarchical organization */
    hierarchical?: boolean;
    /** Global storage path for persistent data */
    globalPath?: string;
    /** Whether tool requires Gemini API access */
    requiresGeminiAPI?: boolean;
    /** Maximum number of results to return */
    maxResults?: number;
    /** Maximum file size that can be processed (in bytes) */
    maxFileSize?: number;
    /** Allowed file extensions for file operations */
    allowedExtensions?: string[];
}
/**
 * Encapsulates tool-specific behaviors and constraints across all providers.
 * This ensures consistent security boundaries and behavior regardless of which
 * LLM provider is being used.
 *
 * Each built-in tool has specific configuration that defines how it should behave,
 * what confirmations it requires, and what security boundaries it respects.
 */
export declare class ToolBehaviorManager {
    private config;
    constructor(config: Config);
    /**
     * Get tool-specific configuration for behavior management.
     * This defines how each of the 11 built-in tools should behave across all providers.
     *
     * @param toolName - Name of the tool
     * @returns Configuration object defining tool behavior
     */
    getToolConfig(toolName: string): ToolSpecificConfig;
    /**
     * Get tool category for permissions and UI organization.
     *
     * @param toolName - Name of the tool
     * @returns Tool kind/category
     */
    getToolKind(toolName: string): Kind;
    /**
     * Check if a tool is considered safe for automatic execution.
     * Safe tools don't modify state or access external resources.
     *
     * @param toolName - Name of the tool
     * @returns True if tool is safe for auto-execution
     */
    isToolSafe(toolName: string): boolean;
    /**
     * Check if a tool modifies the file system.
     *
     * @param toolName - Name of the tool
     * @returns True if tool modifies files
     */
    isToolDestructive(toolName: string): boolean;
    /**
     * Get timeout for tool execution.
     *
     * @param toolName - Name of the tool
     * @returns Timeout in milliseconds
     */
    getToolTimeout(toolName: string): number;
    /**
     * Determine if file operations require confirmation.
     *
     * @private
     */
    private requiresFileConfirmation;
    /**
     * Determine if memory operations require confirmation.
     *
     * @private
     */
    private shouldConfirmMemory;
    /**
     * Determine if web fetch operations require confirmation.
     *
     * @private
     */
    private shouldConfirmWebFetch;
    /**
     * Get shell command allowlist from configuration.
     *
     * @private
     */
    private getShellAllowlist;
    /**
     * Get global memory storage path.
     *
     * @private
     */
    private getMemoryPath;
    /**
     * Validate tool parameters for security.
     *
     * @param toolName - Name of the tool
     * @param params - Tool parameters
     * @returns Validation error message or null if valid
     */
    validateToolSecurity(toolName: string, params: Record<string, any>): string | null;
}
