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
  toolChoice?:
    | 'auto'
    | 'none'
    | 'required'
    | { type: 'function'; function: { name: string } };
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
export const DEFAULT_MULTI_PROVIDER_MCP_CONFIG: MultiProviderMCPConfig = {
  mcpServers: {},

  toolSettings: {
    openai: {
      parallelToolCalls: true,
      maxToolRounds: 10,
      toolChoice: 'auto',
      toolCallTimeoutMs: 30000,
      includeToolResultsInHistory: true,
    },
    anthropic: {
      maxToolUseBlocks: 20,
      toolUseTimeoutMs: 30000,
      allowNestedToolCalls: false,
      maxToolResultTokens: 4096,
      streamToolUse: true,
    },
    gemini: {
      functionCallingMode: 'FUNCTION_CALLING',
      maxFunctionCalls: 10,
      allowCodeExecution: true,
      toolConfig: {
        functionCallingConfig: {
          mode: 'AUTO',
        },
      },
    },
  },

  toolExecution: {
    confirmationMode: 'smart',
    parallelExecution: true,
    maxConcurrentTools: 3,
    timeoutMs: 60000,
    retryAttempts: 2,
    retryDelayMs: 1000,
    failFast: false,
    enableResultCaching: true,
    cacheTimeToLiveMs: 5 * 60 * 1000, // 5 minutes
  },

  providerPriorities: ['gemini', 'openai', 'anthropic'],
  enableCrossProviderSharing: true,

  debug: {
    logToolCalls: false,
    logToolResults: false,
    logProviderConversions: false,
    enablePerformanceMetrics: false,
  },
};

/**
 * Configuration validator for multi-provider MCP settings.
 */
export class MultiProviderMCPConfigValidator {
  /**
   * Validate the complete multi-provider MCP configuration.
   * @param config Configuration to validate.
   * @returns Array of validation errors (empty if valid).
   */
  static validate(config: Partial<MultiProviderMCPConfig>): string[] {
    const errors: string[] = [];

    // Validate MCP servers
    if (config.mcpServers) {
      for (const [serverName, serverConfig] of Object.entries(
        config.mcpServers,
      )) {
        const serverErrors = this.validateMCPServerConfig(
          serverName,
          serverConfig,
        );
        errors.push(...serverErrors);
      }
    }

    // Validate tool execution settings
    if (config.toolExecution) {
      const executionErrors = this.validateToolExecutionSettings(
        config.toolExecution,
      );
      errors.push(...executionErrors);
    }

    // Validate provider-specific settings
    if (config.toolSettings) {
      if (config.toolSettings.openai) {
        const openaiErrors = this.validateOpenAISettings(
          config.toolSettings.openai,
        );
        errors.push(...openaiErrors);
      }

      if (config.toolSettings.anthropic) {
        const anthropicErrors = this.validateAnthropicSettings(
          config.toolSettings.anthropic,
        );
        errors.push(...anthropicErrors);
      }

      if (config.toolSettings.gemini) {
        const geminiErrors = this.validateGeminiSettings(
          config.toolSettings.gemini,
        );
        errors.push(...geminiErrors);
      }
    }

    return errors;
  }

  /**
   * Validate MCP server configuration.
   */
  private static validateMCPServerConfig(
    serverName: string,
    config: MCPServerConfig,
  ): string[] {
    const errors: string[] = [];

    if (!config.command) {
      errors.push(
        `MCP server '${serverName}' missing required 'command' field`,
      );
    }

    if (
      config.timeout &&
      (typeof config.timeout !== 'number' || config.timeout <= 0)
    ) {
      errors.push(`MCP server '${serverName}' has invalid timeout value`);
    }

    return errors;
  }

  /**
   * Validate tool execution settings.
   */
  private static validateToolExecutionSettings(
    settings: Partial<ToolExecutionSettings>,
  ): string[] {
    const errors: string[] = [];

    if (settings.maxConcurrentTools && settings.maxConcurrentTools < 1) {
      errors.push('maxConcurrentTools must be at least 1');
    }

    if (settings.timeoutMs && settings.timeoutMs < 1000) {
      errors.push('timeoutMs must be at least 1000ms');
    }

    if (settings.retryAttempts && settings.retryAttempts < 0) {
      errors.push('retryAttempts cannot be negative');
    }

    if (settings.retryDelayMs && settings.retryDelayMs < 0) {
      errors.push('retryDelayMs cannot be negative');
    }

    if (settings.cacheTimeToLiveMs && settings.cacheTimeToLiveMs < 0) {
      errors.push('cacheTimeToLiveMs cannot be negative');
    }

    return errors;
  }

  /**
   * Validate OpenAI-specific settings.
   */
  private static validateOpenAISettings(
    settings: OpenAIToolSettings,
  ): string[] {
    const errors: string[] = [];

    if (settings.maxToolRounds && settings.maxToolRounds < 1) {
      errors.push('OpenAI maxToolRounds must be at least 1');
    }

    if (settings.toolCallTimeoutMs && settings.toolCallTimeoutMs < 1000) {
      errors.push('OpenAI toolCallTimeoutMs must be at least 1000ms');
    }

    return errors;
  }

  /**
   * Validate Anthropic-specific settings.
   */
  private static validateAnthropicSettings(
    settings: AnthropicToolSettings,
  ): string[] {
    const errors: string[] = [];

    if (settings.maxToolUseBlocks && settings.maxToolUseBlocks < 1) {
      errors.push('Anthropic maxToolUseBlocks must be at least 1');
    }

    if (settings.toolUseTimeoutMs && settings.toolUseTimeoutMs < 1000) {
      errors.push('Anthropic toolUseTimeoutMs must be at least 1000ms');
    }

    if (settings.maxToolResultTokens && settings.maxToolResultTokens < 1) {
      errors.push('Anthropic maxToolResultTokens must be at least 1');
    }

    return errors;
  }

  /**
   * Validate Gemini-specific settings.
   */
  private static validateGeminiSettings(
    settings: GeminiToolSettings,
  ): string[] {
    const errors: string[] = [];

    if (settings.maxFunctionCalls && settings.maxFunctionCalls < 1) {
      errors.push('Gemini maxFunctionCalls must be at least 1');
    }

    if (
      settings.functionCallingMode &&
      !['FUNCTION_CALLING', 'TOOL'].includes(settings.functionCallingMode)
    ) {
      errors.push(
        'Gemini functionCallingMode must be FUNCTION_CALLING or TOOL',
      );
    }

    return errors;
  }
}

/**
 * Configuration merger for combining default and user settings.
 */
export class MultiProviderMCPConfigMerger {
  /**
   * Merge user configuration with defaults.
   * @param userConfig User-provided configuration.
   * @param defaultConfig Default configuration to merge with.
   * @returns Merged configuration.
   */
  static merge(
    userConfig: Partial<MultiProviderMCPConfig>,
    defaultConfig: MultiProviderMCPConfig = DEFAULT_MULTI_PROVIDER_MCP_CONFIG,
  ): MultiProviderMCPConfig {
    const merged: MultiProviderMCPConfig = {
      ...defaultConfig,
      ...userConfig,

      // Deep merge MCP servers
      mcpServers: {
        ...defaultConfig.mcpServers,
        ...userConfig.mcpServers,
      },

      // Deep merge tool settings
      toolSettings: {
        openai: {
          ...defaultConfig.toolSettings.openai,
          ...userConfig.toolSettings?.openai,
        },
        anthropic: {
          ...defaultConfig.toolSettings.anthropic,
          ...userConfig.toolSettings?.anthropic,
        },
        gemini: {
          ...defaultConfig.toolSettings.gemini,
          ...userConfig.toolSettings?.gemini,
        },
      },

      // Deep merge tool execution settings
      toolExecution: {
        ...defaultConfig.toolExecution,
        ...userConfig.toolExecution,
      },

      // Deep merge debug settings
      debug: {
        ...defaultConfig.debug,
        ...userConfig.debug,
      },
    };

    return merged;
  }

  /**
   * Get configuration for a specific provider.
   * @param config Full configuration.
   * @param providerId Provider identifier.
   * @returns Provider-specific configuration.
   */
  static getProviderConfig(
    config: MultiProviderMCPConfig,
    providerId: 'openai' | 'anthropic' | 'gemini',
  ): Record<string, unknown> {
    const providerSettings = config.toolSettings[providerId] || {};

    return {
      ...providerSettings,
      toolExecution: config.toolExecution,
      mcpServers: config.mcpServers,
      debug: config.debug,
    };
  }

  /**
   * Update configuration for a specific provider.
   * @param config Current configuration.
   * @param providerId Provider identifier.
   * @param providerSettings New provider settings.
   * @returns Updated configuration.
   */
  static updateProviderConfig(
    config: MultiProviderMCPConfig,
    providerId: 'openai' | 'anthropic' | 'gemini',
    providerSettings: Record<string, unknown>,
  ): MultiProviderMCPConfig {
    return {
      ...config,
      toolSettings: {
        ...config.toolSettings,
        [providerId]: {
          ...config.toolSettings[providerId],
          ...providerSettings,
        },
      },
    };
  }
}

/**
 * Environment variable mappings for configuration.
 */
export const MCP_CONFIG_ENV_VARS = {
  // Tool execution settings
  MCP_MAX_CONCURRENT_TOOLS: 'toolExecution.maxConcurrentTools',
  MCP_TOOL_TIMEOUT_MS: 'toolExecution.timeoutMs',
  MCP_RETRY_ATTEMPTS: 'toolExecution.retryAttempts',
  MCP_CONFIRMATION_MODE: 'toolExecution.confirmationMode',
  MCP_PARALLEL_EXECUTION: 'toolExecution.parallelExecution',

  // OpenAI specific
  OPENAI_TOOL_CHOICE: 'toolSettings.openai.toolChoice',
  OPENAI_MAX_TOOL_ROUNDS: 'toolSettings.openai.maxToolRounds',
  OPENAI_PARALLEL_TOOL_CALLS: 'toolSettings.openai.parallelToolCalls',

  // Anthropic specific
  ANTHROPIC_MAX_TOOL_USE_BLOCKS: 'toolSettings.anthropic.maxToolUseBlocks',
  ANTHROPIC_TOOL_USE_TIMEOUT_MS: 'toolSettings.anthropic.toolUseTimeoutMs',
  ANTHROPIC_STREAM_TOOL_USE: 'toolSettings.anthropic.streamToolUse',

  // Debug settings
  MCP_DEBUG_LOG_TOOL_CALLS: 'debug.logToolCalls',
  MCP_DEBUG_LOG_TOOL_RESULTS: 'debug.logToolResults',
  MCP_DEBUG_PERFORMANCE_METRICS: 'debug.enablePerformanceMetrics',
} as const;

/**
 * Load configuration from environment variables.
 * @param baseConfig Base configuration to extend.
 * @returns Configuration with environment variable overrides.
 */
export function loadConfigFromEnvironment(
  baseConfig: MultiProviderMCPConfig,
): MultiProviderMCPConfig {
  const config = { ...baseConfig };

  for (const [envVar, configPath] of Object.entries(MCP_CONFIG_ENV_VARS)) {
    const envValue = process.env[envVar];
    if (envValue !== undefined) {
      setConfigValueByPath(config, configPath, parseEnvValue(envValue));
    }
  }

  return config;
}

/**
 * Set configuration value by dot-notation path.
 */
function setConfigValueByPath(
  config: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const keys = path.split('.');
  let current = config;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!current[key]) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  current[keys[keys.length - 1]] = value;
}

/**
 * Parse environment variable value to appropriate type.
 */
function parseEnvValue(value: string): unknown {
  // Boolean values
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;

  // Numeric values
  const numValue = Number(value);
  if (!isNaN(numValue)) return numValue;

  // String values
  return value;
}
