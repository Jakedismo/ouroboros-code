/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { UnifiedTool } from './types.js';
/**
 * Categories of built-in tools for organization and filtering
 */
export declare enum ToolCategory {
    FILE_OPERATIONS = "file_operations",
    FILE_DISCOVERY = "file_discovery",
    SYSTEM_OPERATIONS = "system_operations",
    WEB_OPERATIONS = "web_operations",
    MEMORY_MANAGEMENT = "memory_management"
}
/**
 * Security levels for tool operations
 */
export declare enum ToolSecurityLevel {
    SAFE = "safe",// Read-only operations, safe for auto-execution
    MODERATE = "moderate",// File modifications, may require confirmation
    DANGEROUS = "dangerous"
}
/**
 * Metadata for built-in tools describing their capabilities and security implications
 */
export interface BuiltinToolMetadata {
    name: string;
    displayName: string;
    category: ToolCategory;
    securityLevel: ToolSecurityLevel;
    description: string;
    capabilities: string[];
    requiresConfirmation: boolean;
    canModifyFiles: boolean;
    canExecuteCommands: boolean;
    canAccessNetwork: boolean;
    supportedProviders: string[];
    examples?: ToolExample[];
}
export interface ToolExample {
    description: string;
    parameters: Record<string, any>;
    expectedResult: string;
}
/**
 * Unified interface for all built-in tools across providers
 * This interface ensures consistent tool behavior regardless of which LLM provider is used
 */
export declare class UnifiedToolInterface {
    /**
     * Registry of all built-in tools with their metadata
     */
    static readonly BUILTIN_TOOLS: Record<string, BuiltinToolMetadata>;
    /**
     * Get tool metadata by name
     */
    static getToolMetadata(toolName: string): BuiltinToolMetadata | undefined;
    /**
     * Get all tools in a specific category
     */
    static getToolsByCategory(category: ToolCategory): BuiltinToolMetadata[];
    /**
     * Get tools by security level
     */
    static getToolsBySecurityLevel(level: ToolSecurityLevel): BuiltinToolMetadata[];
    /**
     * Get tools that require confirmation
     */
    static getToolsRequiringConfirmation(): BuiltinToolMetadata[];
    /**
     * Get tools that can modify files
     */
    static getFileModifyingTools(): BuiltinToolMetadata[];
    /**
     * Get tools that can execute commands
     */
    static getCommandExecutingTools(): BuiltinToolMetadata[];
    /**
     * Get tools that can access network
     */
    static getNetworkAccessingTools(): BuiltinToolMetadata[];
    /**
     * Check if a tool is supported by a specific provider
     */
    static isToolSupportedByProvider(toolName: string, provider: string): boolean;
    /**
     * Get all tool names
     */
    static getAllToolNames(): string[];
    /**
     * Get tool statistics
     */
    static getToolStatistics(): {
        totalTools: number;
        byCategory: Record<ToolCategory, number>;
        bySecurityLevel: Record<ToolSecurityLevel, number>;
        requiresConfirmation: number;
        canModifyFiles: number;
        canExecuteCommands: number;
        canAccessNetwork: number;
    };
    /**
     * Convert tool metadata to unified tool format
     */
    static metadataToUnifiedTool(metadata: BuiltinToolMetadata): Partial<UnifiedTool>;
    /**
     * Validate tool compatibility across providers
     */
    static validateProviderCompatibility(): {
        compatible: boolean;
        issues: string[];
    };
}
