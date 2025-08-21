/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { SettingDefinition } from './settingsSchema.js';
/**
 * Built-in tools configuration interface for provider-specific settings
 */
export interface BuiltinToolsConfig {
    /** Enable/disable built-in tools integration */
    enabled: boolean;
    /** Default provider for tool execution ('gemini' | 'openai' | 'anthropic') */
    defaultProvider: 'gemini' | 'openai' | 'anthropic';
    /** Tool-specific configurations */
    tools: {
        filesystem: FileSystemToolsConfig;
        web: WebToolsConfig;
        system: SystemToolsConfig;
    };
    /** Security settings for tool execution */
    security: ToolSecurityConfig;
    /** Performance optimization settings */
    performance: PerformanceConfig;
    /** Provider-specific settings */
    providers: {
        openai: OpenAIToolsConfig;
        anthropic: AnthropicToolsConfig;
        gemini: GeminiToolsConfig;
    };
}
/**
 * File system tools configuration
 */
export interface FileSystemToolsConfig {
    /** Enable file system tools (read_file, write_file, etc.) */
    enabled: boolean;
    /** Maximum file size for read operations (in bytes) */
    maxFileSize: number;
    /** Maximum number of files for batch operations */
    maxBatchSize: number;
    /** File extensions to exclude from operations */
    excludedExtensions: string[];
    /** Paths to exclude from operations (relative to project root) */
    excludedPaths: string[];
    /** Enable git ignore respect */
    respectGitIgnore: boolean;
    /** Project boundary enforcement */
    enforceProjectBoundary: boolean;
}
/**
 * Web tools configuration
 */
export interface WebToolsConfig {
    /** Enable web tools (web_fetch, google_web_search) */
    enabled: boolean;
    /** Request timeout in milliseconds */
    requestTimeout: number;
    /** Maximum content length to fetch */
    maxContentLength: number;
    /** Enable rate limiting */
    enableRateLimit: boolean;
    /** Requests per minute limit */
    requestsPerMinute: number;
    /** Allowed domains (empty means all allowed) */
    allowedDomains: string[];
    /** Blocked domains */
    blockedDomains: string[];
    /** Allow private network access */
    allowPrivateNetwork: boolean;
    /** Require confirmation for private network access */
    confirmPrivateNetwork: boolean;
    /** User agent string for web requests */
    userAgent: string;
}
/**
 * System tools configuration
 */
export interface SystemToolsConfig {
    /** Enable system tools (run_shell_command, save_memory) */
    enabled: boolean;
    /** Shell command security level ('strict' | 'moderate' | 'permissive') */
    shellSecurityLevel: 'strict' | 'moderate' | 'permissive';
    /** Allowed shell commands (empty means all allowed based on security level) */
    allowedCommands: string[];
    /** Blocked shell commands */
    blockedCommands: string[];
    /** Command execution timeout in milliseconds */
    commandTimeout: number;
    /** Memory management settings */
    memory: {
        /** Enable memory tool */
        enabled: boolean;
        /** Memory file name */
        fileName: string;
        /** Maximum memory items to load */
        maxItems: number;
        /** Memory refresh interval in minutes */
        refreshInterval: number;
    };
}
/**
 * Tool security configuration
 */
export interface ToolSecurityConfig {
    /** Global security level ('strict' | 'moderate' | 'permissive') */
    globalLevel: 'strict' | 'moderate' | 'permissive';
    /** Require confirmation for high-risk operations */
    requireConfirmation: boolean;
    /** Enable security logging */
    enableLogging: boolean;
    /** Security log level */
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    /** Enable tool validation */
    enableValidation: boolean;
    /** Trusted user IDs (bypass some security checks) */
    trustedUsers: string[];
}
/**
 * Performance optimization configuration
 */
export interface PerformanceConfig {
    /** Enable tool execution caching */
    enableCaching: boolean;
    /** Cache duration in minutes */
    cacheDuration: number;
    /** Maximum concurrent tool executions */
    maxConcurrentExecutions: number;
    /** Enable parallel execution for independent tools */
    enableParallelExecution: boolean;
    /** Tool execution timeout in milliseconds */
    executionTimeout: number;
    /** Enable performance monitoring */
    enableMonitoring: boolean;
}
/**
 * OpenAI-specific tools configuration
 */
export interface OpenAIToolsConfig {
    /** Enable OpenAI tools integration */
    enabled: boolean;
    /** OpenAI API model to use */
    model: string;
    /** API base URL */
    baseUrl: string;
    /** Request timeout in milliseconds */
    timeout: number;
    /** Maximum tokens per request */
    maxTokens: number;
    /** Temperature for responses */
    temperature: number;
    /** Maximum tool calls per conversation turn */
    maxToolCallsPerTurn: number;
    /** Enable streaming responses */
    enableStreaming: boolean;
}
/**
 * Anthropic-specific tools configuration
 */
export interface AnthropicToolsConfig {
    /** Enable Anthropic tools integration */
    enabled: boolean;
    /** Anthropic API model to use */
    model: string;
    /** API base URL */
    baseUrl: string;
    /** Request timeout in milliseconds */
    timeout: number;
    /** Maximum tokens per request */
    maxTokens: number;
    /** Maximum tool calls per conversation turn */
    maxToolCallsPerTurn: number;
    /** Enable batch tool processing */
    enableBatchProcessing: boolean;
}
/**
 * Gemini-specific tools configuration
 */
export interface GeminiToolsConfig {
    /** Enable Gemini tools integration */
    enabled: boolean;
    /** Use existing Gemini configuration */
    useExistingConfig: boolean;
    /** Additional Gemini-specific settings */
    additionalSettings: Record<string, unknown>;
}
/**
 * Default built-in tools configuration
 */
export declare const DEFAULT_BUILTIN_TOOLS_CONFIG: BuiltinToolsConfig;
/**
 * Settings schema for built-in tools configuration
 * This extends the main settings schema with tool-specific settings
 */
export declare const BUILTIN_TOOLS_SETTINGS_SCHEMA: Record<string, SettingDefinition>;
/**
 * Utility functions for built-in tools configuration
 */
export declare class BuiltinToolsConfigManager {
    /**
     * Validate built-in tools configuration
     */
    static validateConfig(config: Partial<BuiltinToolsConfig>): {
        valid: boolean;
        errors: string[];
    };
    /**
     * Merge configuration with defaults
     */
    static mergeWithDefaults(config: Partial<BuiltinToolsConfig>): BuiltinToolsConfig;
    /**
     * Get configuration for a specific tool category
     */
    static getToolCategoryConfig(config: BuiltinToolsConfig, category: 'filesystem' | 'web' | 'system'): FileSystemToolsConfig | WebToolsConfig | SystemToolsConfig;
    /**
     * Get configuration for a specific provider
     */
    static getProviderConfig(config: BuiltinToolsConfig, provider: 'openai' | 'anthropic' | 'gemini'): OpenAIToolsConfig | AnthropicToolsConfig | GeminiToolsConfig;
    /**
     * Check if tools are enabled for a specific provider
     */
    static isProviderEnabled(config: BuiltinToolsConfig, provider: 'openai' | 'anthropic' | 'gemini'): boolean;
    /**
     * Get effective security level for a tool
     */
    static getEffectiveSecurityLevel(config: BuiltinToolsConfig, toolCategory: 'filesystem' | 'web' | 'system'): 'strict' | 'moderate' | 'permissive';
    /**
     * Export configuration as JSON
     */
    static exportConfig(config: BuiltinToolsConfig): string;
    /**
     * Import configuration from JSON
     */
    static importConfig(json: string): {
        success: boolean;
        config?: BuiltinToolsConfig;
        error?: string;
    };
}
