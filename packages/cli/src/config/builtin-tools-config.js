/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Default built-in tools configuration
 */
export const DEFAULT_BUILTIN_TOOLS_CONFIG = {
    enabled: true,
    defaultProvider: 'gemini',
    tools: {
        filesystem: {
            enabled: true,
            maxFileSize: 1024 * 1024, // 1MB
            maxBatchSize: 50,
            excludedExtensions: ['.exe', '.bin', '.dll', '.so'],
            excludedPaths: ['node_modules', '.git', 'dist', 'build'],
            respectGitIgnore: true,
            enforceProjectBoundary: true,
        },
        web: {
            enabled: true,
            requestTimeout: 10000, // 10 seconds
            maxContentLength: 100000, // 100KB
            enableRateLimit: true,
            requestsPerMinute: 30,
            allowedDomains: [],
            blockedDomains: ['localhost', '0.0.0.0', 'example.com'],
            allowPrivateNetwork: false,
            confirmPrivateNetwork: true,
            userAgent: 'Gemini-CLI/1.0 (Built-in Tools)',
        },
        system: {
            enabled: true,
            shellSecurityLevel: 'moderate',
            allowedCommands: [],
            blockedCommands: ['rm -rf', 'sudo rm', 'chmod 777', 'dd if=', 'mkfs'],
            commandTimeout: 30000, // 30 seconds
            memory: {
                enabled: true,
                fileName: 'GEMINI.md',
                maxItems: 1000,
                refreshInterval: 5, // 5 minutes
            },
        },
    },
    security: {
        globalLevel: 'moderate',
        requireConfirmation: true,
        enableLogging: true,
        logLevel: 'info',
        enableValidation: true,
        trustedUsers: [],
    },
    performance: {
        enableCaching: true,
        cacheDuration: 10, // 10 minutes
        maxConcurrentExecutions: 5,
        enableParallelExecution: true,
        executionTimeout: 60000, // 60 seconds
        enableMonitoring: false,
    },
    providers: {
        openai: {
            enabled: true,
            model: 'gpt-4',
            baseUrl: 'https://api.openai.com/v1',
            timeout: 30000,
            maxTokens: 4096,
            temperature: 0.1,
            maxToolCallsPerTurn: 10,
            enableStreaming: false,
        },
        anthropic: {
            enabled: true,
            model: 'claude-3-sonnet-20240229',
            baseUrl: 'https://api.anthropic.com',
            timeout: 30000,
            maxTokens: 4096,
            maxToolCallsPerTurn: 10,
            enableBatchProcessing: true,
        },
        gemini: {
            enabled: true,
            useExistingConfig: true,
            additionalSettings: {},
        },
    },
};
/**
 * Settings schema for built-in tools configuration
 * This extends the main settings schema with tool-specific settings
 */
export const BUILTIN_TOOLS_SETTINGS_SCHEMA = {
    // Main toggle
    'builtinTools.enabled': {
        type: 'boolean',
        label: 'Enable Built-in Tools',
        category: 'Built-in Tools',
        requiresRestart: true,
        default: true,
        description: 'Enable built-in tools integration across all providers',
        showInDialog: true,
    },
    'builtinTools.defaultProvider': {
        type: 'string',
        label: 'Default Provider',
        category: 'Built-in Tools',
        requiresRestart: false,
        default: 'gemini',
        description: 'Default provider for tool execution (gemini, openai, anthropic)',
        showInDialog: true,
    },
    // File system tools
    'builtinTools.filesystem.enabled': {
        type: 'boolean',
        label: 'Enable File System Tools',
        category: 'Built-in Tools / File System',
        requiresRestart: false,
        default: true,
        description: 'Enable file system tools (read_file, write_file, etc.)',
        showInDialog: true,
    },
    'builtinTools.filesystem.maxFileSize': {
        type: 'number',
        label: 'Max File Size (bytes)',
        category: 'Built-in Tools / File System',
        requiresRestart: false,
        default: 1024 * 1024,
        description: 'Maximum file size for read operations',
        showInDialog: true,
    },
    'builtinTools.filesystem.enforceProjectBoundary': {
        type: 'boolean',
        label: 'Enforce Project Boundary',
        category: 'Built-in Tools / File System',
        requiresRestart: false,
        default: true,
        description: 'Restrict file operations to project directory',
        showInDialog: true,
    },
    // Web tools
    'builtinTools.web.enabled': {
        type: 'boolean',
        label: 'Enable Web Tools',
        category: 'Built-in Tools / Web',
        requiresRestart: false,
        default: true,
        description: 'Enable web tools (web_fetch, google_web_search)',
        showInDialog: true,
    },
    'builtinTools.web.requestTimeout': {
        type: 'number',
        label: 'Request Timeout (ms)',
        category: 'Built-in Tools / Web',
        requiresRestart: false,
        default: 10000,
        description: 'Web request timeout in milliseconds',
        showInDialog: true,
    },
    'builtinTools.web.allowPrivateNetwork': {
        type: 'boolean',
        label: 'Allow Private Network Access',
        category: 'Built-in Tools / Web',
        requiresRestart: false,
        default: false,
        description: 'Allow access to localhost and private networks',
        showInDialog: true,
    },
    'builtinTools.web.enableRateLimit': {
        type: 'boolean',
        label: 'Enable Rate Limiting',
        category: 'Built-in Tools / Web',
        requiresRestart: false,
        default: true,
        description: 'Enable rate limiting for web requests',
        showInDialog: true,
    },
    // System tools
    'builtinTools.system.enabled': {
        type: 'boolean',
        label: 'Enable System Tools',
        category: 'Built-in Tools / System',
        requiresRestart: false,
        default: true,
        description: 'Enable system tools (shell, memory)',
        showInDialog: true,
    },
    'builtinTools.system.shellSecurityLevel': {
        type: 'string',
        label: 'Shell Security Level',
        category: 'Built-in Tools / System',
        requiresRestart: false,
        default: 'moderate',
        description: 'Security level for shell commands (strict, moderate, permissive)',
        showInDialog: true,
    },
    'builtinTools.system.commandTimeout': {
        type: 'number',
        label: 'Command Timeout (ms)',
        category: 'Built-in Tools / System',
        requiresRestart: false,
        default: 30000,
        description: 'Shell command execution timeout',
        showInDialog: true,
    },
    // Security settings
    'builtinTools.security.globalLevel': {
        type: 'string',
        label: 'Global Security Level',
        category: 'Built-in Tools / Security',
        requiresRestart: false,
        default: 'moderate',
        description: 'Global security level for all tools',
        showInDialog: true,
    },
    'builtinTools.security.requireConfirmation': {
        type: 'boolean',
        label: 'Require Confirmation',
        category: 'Built-in Tools / Security',
        requiresRestart: false,
        default: true,
        description: 'Require user confirmation for high-risk operations',
        showInDialog: true,
    },
    'builtinTools.security.enableValidation': {
        type: 'boolean',
        label: 'Enable Validation',
        category: 'Built-in Tools / Security',
        requiresRestart: false,
        default: true,
        description: 'Enable security validation for tool operations',
        showInDialog: true,
    },
    // Performance settings
    'builtinTools.performance.enableCaching': {
        type: 'boolean',
        label: 'Enable Caching',
        category: 'Built-in Tools / Performance',
        requiresRestart: false,
        default: true,
        description: 'Enable tool execution result caching',
        showInDialog: true,
    },
    'builtinTools.performance.maxConcurrentExecutions': {
        type: 'number',
        label: 'Max Concurrent Executions',
        category: 'Built-in Tools / Performance',
        requiresRestart: false,
        default: 5,
        description: 'Maximum number of concurrent tool executions',
        showInDialog: true,
    },
    'builtinTools.performance.enableParallelExecution': {
        type: 'boolean',
        label: 'Enable Parallel Execution',
        category: 'Built-in Tools / Performance',
        requiresRestart: false,
        default: true,
        description: 'Enable parallel execution for independent tools',
        showInDialog: true,
    },
    // Provider-specific settings
    'builtinTools.providers.openai.enabled': {
        type: 'boolean',
        label: 'Enable OpenAI Integration',
        category: 'Built-in Tools / Providers',
        requiresRestart: false,
        default: true,
        description: 'Enable built-in tools for OpenAI provider',
        showInDialog: true,
    },
    'builtinTools.providers.anthropic.enabled': {
        type: 'boolean',
        label: 'Enable Anthropic Integration',
        category: 'Built-in Tools / Providers',
        requiresRestart: false,
        default: true,
        description: 'Enable built-in tools for Anthropic provider',
        showInDialog: true,
    },
    'builtinTools.providers.gemini.enabled': {
        type: 'boolean',
        label: 'Enable Gemini Integration',
        category: 'Built-in Tools / Providers',
        requiresRestart: false,
        default: true,
        description: 'Enable built-in tools for Gemini provider',
        showInDialog: true,
    },
};
/**
 * Utility functions for built-in tools configuration
 */
export class BuiltinToolsConfigManager {
    /**
     * Validate built-in tools configuration
     */
    static validateConfig(config) {
        const errors = [];
        // Validate provider settings
        if (config.defaultProvider && !['gemini', 'openai', 'anthropic'].includes(config.defaultProvider)) {
            errors.push('Invalid default provider. Must be gemini, openai, or anthropic');
        }
        // Validate file system settings
        if (config.tools?.filesystem) {
            const fs = config.tools.filesystem;
            if (fs.maxFileSize && fs.maxFileSize <= 0) {
                errors.push('Max file size must be positive');
            }
            if (fs.maxBatchSize && fs.maxBatchSize <= 0) {
                errors.push('Max batch size must be positive');
            }
        }
        // Validate web settings
        if (config.tools?.web) {
            const web = config.tools.web;
            if (web.requestTimeout && web.requestTimeout <= 0) {
                errors.push('Request timeout must be positive');
            }
            if (web.requestsPerMinute && web.requestsPerMinute <= 0) {
                errors.push('Requests per minute must be positive');
            }
        }
        // Validate system settings
        if (config.tools?.system) {
            const system = config.tools.system;
            if (system.shellSecurityLevel && !['strict', 'moderate', 'permissive'].includes(system.shellSecurityLevel)) {
                errors.push('Invalid shell security level. Must be strict, moderate, or permissive');
            }
            if (system.commandTimeout && system.commandTimeout <= 0) {
                errors.push('Command timeout must be positive');
            }
        }
        // Validate security settings
        if (config.security?.globalLevel && !['strict', 'moderate', 'permissive'].includes(config.security.globalLevel)) {
            errors.push('Invalid global security level. Must be strict, moderate, or permissive');
        }
        // Validate performance settings
        if (config.performance) {
            const perf = config.performance;
            if (perf.cacheDuration && perf.cacheDuration <= 0) {
                errors.push('Cache duration must be positive');
            }
            if (perf.maxConcurrentExecutions && perf.maxConcurrentExecutions <= 0) {
                errors.push('Max concurrent executions must be positive');
            }
            if (perf.executionTimeout && perf.executionTimeout <= 0) {
                errors.push('Execution timeout must be positive');
            }
        }
        return {
            valid: errors.length === 0,
            errors,
        };
    }
    /**
     * Merge configuration with defaults
     */
    static mergeWithDefaults(config) {
        return {
            ...DEFAULT_BUILTIN_TOOLS_CONFIG,
            ...config,
            tools: {
                ...DEFAULT_BUILTIN_TOOLS_CONFIG.tools,
                ...config.tools,
                filesystem: {
                    ...DEFAULT_BUILTIN_TOOLS_CONFIG.tools.filesystem,
                    ...config.tools?.filesystem,
                },
                web: {
                    ...DEFAULT_BUILTIN_TOOLS_CONFIG.tools.web,
                    ...config.tools?.web,
                },
                system: {
                    ...DEFAULT_BUILTIN_TOOLS_CONFIG.tools.system,
                    ...config.tools?.system,
                    memory: {
                        ...DEFAULT_BUILTIN_TOOLS_CONFIG.tools.system.memory,
                        ...config.tools?.system?.memory,
                    },
                },
            },
            security: {
                ...DEFAULT_BUILTIN_TOOLS_CONFIG.security,
                ...config.security,
            },
            performance: {
                ...DEFAULT_BUILTIN_TOOLS_CONFIG.performance,
                ...config.performance,
            },
            providers: {
                ...DEFAULT_BUILTIN_TOOLS_CONFIG.providers,
                ...config.providers,
                openai: {
                    ...DEFAULT_BUILTIN_TOOLS_CONFIG.providers.openai,
                    ...config.providers?.openai,
                },
                anthropic: {
                    ...DEFAULT_BUILTIN_TOOLS_CONFIG.providers.anthropic,
                    ...config.providers?.anthropic,
                },
                gemini: {
                    ...DEFAULT_BUILTIN_TOOLS_CONFIG.providers.gemini,
                    ...config.providers?.gemini,
                },
            },
        };
    }
    /**
     * Get configuration for a specific tool category
     */
    static getToolCategoryConfig(config, category) {
        return config.tools[category];
    }
    /**
     * Get configuration for a specific provider
     */
    static getProviderConfig(config, provider) {
        return config.providers[provider];
    }
    /**
     * Check if tools are enabled for a specific provider
     */
    static isProviderEnabled(config, provider) {
        return config.enabled && config.providers[provider].enabled;
    }
    /**
     * Get effective security level for a tool
     */
    static getEffectiveSecurityLevel(config, toolCategory) {
        // System tools can override with shell security level
        if (toolCategory === 'system') {
            return config.tools.system.shellSecurityLevel;
        }
        return config.security.globalLevel;
    }
    /**
     * Export configuration as JSON
     */
    static exportConfig(config) {
        return JSON.stringify(config, null, 2);
    }
    /**
     * Import configuration from JSON
     */
    static importConfig(json) {
        try {
            const parsed = JSON.parse(json);
            const validation = this.validateConfig(parsed);
            if (!validation.valid) {
                return {
                    success: false,
                    error: `Configuration validation failed: ${validation.errors.join(', ')}`,
                };
            }
            return {
                success: true,
                config: this.mergeWithDefaults(parsed),
            };
        }
        catch (error) {
            return {
                success: false,
                error: `Failed to parse configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    }
}
//# sourceMappingURL=builtin-tools-config.js.map