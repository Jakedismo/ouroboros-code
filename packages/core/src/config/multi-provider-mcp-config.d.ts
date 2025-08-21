/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { MCPServerConfig } from '../providers/tools/mcp-tool-manager.js';
/**
 * Provider-specific tool settings for OpenAI.
 */
export interface OpenAIToolSettings {
    /** Whether to allow parallel tool calls in a single request */
    parallelToolCalls?: boolean;
    /** Maximum number of tool execution rounds before stopping */
    maxToolRounds?: number;
    /** How the model should choose tools: 'auto', 'none', 'required', or specific tool */
    toolChoice?: 'auto' | 'none' | 'required' | {
        type: 'function';
        function: {
            name: string;
        };
    };
    /** Timeout for individual tool calls in milliseconds */
    toolCallTimeoutMs?: number;
    /** Whether to include tool results in conversation history */
    includeToolResultsInHistory?: boolean;
}
/**
 * Provider-specific tool settings for Anthropic.
 */
export interface AnthropicToolSettings {
    /** Maximum number of tool use blocks to process */
    maxToolUseBlocks?: number;
    /** Timeout for individual tool use operations in milliseconds */
    toolUseTimeoutMs?: number;
    /** Whether to allow nested tool calls */
    allowNestedToolCalls?: boolean;
    /** Maximum tokens for tool results */
    maxToolResultTokens?: number;
    /** Whether to stream tool use responses */
    streamToolUse?: boolean;
}
/**
 * Provider-specific tool settings for Gemini.
 */
export interface GeminiToolSettings {
    /** Whether to use function calling or tool mode */
    functionCallingMode?: 'FUNCTION_CALLING' | 'TOOL';
    /** Maximum number of function calls per request */
    maxFunctionCalls?: number;
    /** Whether to allow code execution tools */
    allowCodeExecution?: boolean;
    /** Tool configuration for Gemini */
    toolConfig?: {
        functionCallingConfig?: {
            mode: 'AUTO' | 'NONE' | 'ANY';
            allowedFunctionNames?: string[];
        };
    };
}
/**
 * Shared settings for tool execution across all providers.
 */
export interface ToolExecutionSettings {
    /** How to handle tool confirmation: 'always', 'never', 'smart' */
    confirmationMode: 'always' | 'never' | 'smart';
    /** Whether to allow parallel tool execution */
    parallelExecution: boolean;
    /** Maximum number of concurrent tool executions */
    maxConcurrentTools: number;
    /** Global timeout for tool execution in milliseconds */
    timeoutMs: number;
    /** Number of retry attempts for failed tools */
    retryAttempts: number;
    /** Base delay between retries in milliseconds */
    retryDelayMs: number;
    /** Whether to stop all tool execution if one fails */
    failFast: boolean;
    /** Whether to cache tool results */
    enableResultCaching: boolean;
    /** Cache TTL in milliseconds */
    cacheTimeToLiveMs: number;
}
/**
 * Configuration for multi-provider MCP support.
 */
export interface MultiProviderMCPConfig {
    /** MCP server configurations (shared across providers) */
    mcpServers: Record<string, MCPServerConfig>;
    /** Provider-specific tool settings */
    toolSettings: {
        openai?: OpenAIToolSettings;
        anthropic?: AnthropicToolSettings;
        gemini?: GeminiToolSettings;
    };
    /** Shared tool execution settings */
    toolExecution: ToolExecutionSettings;
    /** Provider priorities for tool execution (fallback order) */
    providerPriorities?: string[];
    /** Whether to enable cross-provider tool sharing */
    enableCrossProviderSharing?: boolean;
    /** Debug settings for development */
    debug?: {
        logToolCalls?: boolean;
        logToolResults?: boolean;
        logProviderConversions?: boolean;
        enablePerformanceMetrics?: boolean;
    };
}
/**
 * Default configuration for multi-provider MCP support.
 */
export declare const DEFAULT_MULTI_PROVIDER_MCP_CONFIG: MultiProviderMCPConfig;
/**
 * Configuration validator for multi-provider MCP settings.
 */
export declare class MultiProviderMCPConfigValidator {
    /**
     * Validate the complete multi-provider MCP configuration.
     * @param config Configuration to validate.
     * @returns Array of validation errors (empty if valid).
     */
    static validate(config: Partial<MultiProviderMCPConfig>): string[];
    /**
     * Validate MCP server configuration.
     */
    private static validateMCPServerConfig;
    /**
     * Validate tool execution settings.
     */
    private static validateToolExecutionSettings;
    /**
     * Validate OpenAI-specific settings.
     */
    private static validateOpenAISettings;
    /**
     * Validate Anthropic-specific settings.
     */
    private static validateAnthropicSettings;
    /**
     * Validate Gemini-specific settings.
     */
    private static validateGeminiSettings;
}
/**
 * Configuration merger for combining default and user settings.
 */
export declare class MultiProviderMCPConfigMerger {
    /**
     * Merge user configuration with defaults.
     * @param userConfig User-provided configuration.
     * @param defaultConfig Default configuration to merge with.
     * @returns Merged configuration.
     */
    static merge(userConfig: Partial<MultiProviderMCPConfig>, defaultConfig?: MultiProviderMCPConfig): MultiProviderMCPConfig;
    /**
     * Get configuration for a specific provider.
     * @param config Full configuration.
     * @param providerId Provider identifier.
     * @returns Provider-specific configuration.
     */
    static getProviderConfig(config: MultiProviderMCPConfig, providerId: 'openai' | 'anthropic' | 'gemini'): Record<string, unknown>;
    /**
     * Update configuration for a specific provider.
     * @param config Current configuration.
     * @param providerId Provider identifier.
     * @param providerSettings New provider settings.
     * @returns Updated configuration.
     */
    static updateProviderConfig(config: MultiProviderMCPConfig, providerId: 'openai' | 'anthropic' | 'gemini', providerSettings: Record<string, unknown>): MultiProviderMCPConfig;
}
/**
 * Environment variable mappings for configuration.
 */
export declare const MCP_CONFIG_ENV_VARS: {
    readonly MCP_MAX_CONCURRENT_TOOLS: "toolExecution.maxConcurrentTools";
    readonly MCP_TOOL_TIMEOUT_MS: "toolExecution.timeoutMs";
    readonly MCP_RETRY_ATTEMPTS: "toolExecution.retryAttempts";
    readonly MCP_CONFIRMATION_MODE: "toolExecution.confirmationMode";
    readonly MCP_PARALLEL_EXECUTION: "toolExecution.parallelExecution";
    readonly OPENAI_TOOL_CHOICE: "toolSettings.openai.toolChoice";
    readonly OPENAI_MAX_TOOL_ROUNDS: "toolSettings.openai.maxToolRounds";
    readonly OPENAI_PARALLEL_TOOL_CALLS: "toolSettings.openai.parallelToolCalls";
    readonly ANTHROPIC_MAX_TOOL_USE_BLOCKS: "toolSettings.anthropic.maxToolUseBlocks";
    readonly ANTHROPIC_TOOL_USE_TIMEOUT_MS: "toolSettings.anthropic.toolUseTimeoutMs";
    readonly ANTHROPIC_STREAM_TOOL_USE: "toolSettings.anthropic.streamToolUse";
    readonly MCP_DEBUG_LOG_TOOL_CALLS: "debug.logToolCalls";
    readonly MCP_DEBUG_LOG_TOOL_RESULTS: "debug.logToolResults";
    readonly MCP_DEBUG_PERFORMANCE_METRICS: "debug.enablePerformanceMetrics";
};
/**
 * Load configuration from environment variables.
 * @param baseConfig Base configuration to extend.
 * @returns Configuration with environment variable overrides.
 */
export declare function loadConfigFromEnvironment(baseConfig: MultiProviderMCPConfig): MultiProviderMCPConfig;
