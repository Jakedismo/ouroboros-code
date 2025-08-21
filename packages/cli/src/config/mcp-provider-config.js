/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { MultiProviderMCPConfigMerger, MultiProviderMCPConfigValidator, DEFAULT_MULTI_PROVIDER_MCP_CONFIG, loadConfigFromEnvironment, } from '@ouroboros/code-cli-core';
/**
 * Configure MCP settings for a specific provider.
 * This function sets up provider-specific MCP configurations.
 * @param config Configuration instance to modify.
 * @param provider Provider identifier.
 * @param mcpConfig Optional MCP configuration overrides.
 */
export function configureMCPForProvider(config, provider, mcpConfig) {
    const defaultConfig = DEFAULT_MULTI_PROVIDER_MCP_CONFIG;
    const mergedConfig = mcpConfig
        ? MultiProviderMCPConfigMerger.merge(mcpConfig, defaultConfig)
        : defaultConfig;
    // Set provider-specific MCP settings
    switch (provider) {
        case 'openai': {
            // Configure OpenAI-specific tool settings
            const openaiSettings = mergedConfig.toolSettings.openai;
            if (openaiSettings) {
                // Set OpenAI-specific configurations on the config instance
                // Note: This would need to be adapted based on how the Config class
                // stores provider-specific settings
                setProviderToolSettings(config, 'openai', {
                    parallelToolCalls: openaiSettings.parallelToolCalls ?? true,
                    toolChoice: openaiSettings.toolChoice ?? 'auto',
                    maxToolRounds: openaiSettings.maxToolRounds ?? 10,
                    toolCallTimeoutMs: openaiSettings.toolCallTimeoutMs ?? 30000,
                });
            }
            break;
        }
        case 'anthropic': {
            // Configure Anthropic-specific tool settings
            const anthropicSettings = mergedConfig.toolSettings.anthropic;
            if (anthropicSettings) {
                setProviderToolSettings(config, 'anthropic', {
                    maxToolUseBlocks: anthropicSettings.maxToolUseBlocks ?? 20,
                    toolUseTimeoutMs: anthropicSettings.toolUseTimeoutMs ?? 30000,
                    streamToolUse: anthropicSettings.streamToolUse ?? true,
                    allowNestedToolCalls: anthropicSettings.allowNestedToolCalls ?? false,
                });
            }
            break;
        }
        case 'gemini': {
            // Configure Gemini-specific tool settings
            const geminiSettings = mergedConfig.toolSettings.gemini;
            if (geminiSettings) {
                setProviderToolSettings(config, 'gemini', {
                    functionCallingMode: geminiSettings.functionCallingMode ?? 'FUNCTION_CALLING',
                    maxFunctionCalls: geminiSettings.maxFunctionCalls ?? 10,
                    allowCodeExecution: geminiSettings.allowCodeExecution ?? true,
                    toolConfig: geminiSettings.toolConfig,
                });
            }
            break;
        }
        default:
            console.warn(`Unknown provider: ${provider}, using default settings`);
            break;
    }
    // Set shared tool execution settings
    setSharedToolExecutionSettings(config, mergedConfig.toolExecution);
    // Set MCP server configurations
    setMCPServerConfigurations(config, mergedConfig.mcpServers);
    // Set debug settings if enabled
    if (mergedConfig.debug) {
        setDebugSettings(config, mergedConfig.debug);
    }
}
/**
 * Set provider-specific tool settings on the config instance.
 * @param config Configuration instance.
 * @param provider Provider identifier.
 * @param settings Provider-specific settings.
 */
function setProviderToolSettings(config, provider, settings) {
    // This is a placeholder implementation - would need to be adapted
    // based on how the Config class actually stores provider settings
    console.log(`Setting ${provider} tool settings:`, settings);
    // Example of how this might work:
    // config.setProviderSettings(provider, settings);
}
/**
 * Set shared tool execution settings.
 * @param config Configuration instance.
 * @param executionSettings Tool execution settings.
 */
function setSharedToolExecutionSettings(config, executionSettings) {
    console.log('Setting shared tool execution settings:', executionSettings);
    // Example implementation:
    // config.setToolExecutionSettings(executionSettings);
}
/**
 * Set MCP server configurations.
 * @param config Configuration instance.
 * @param mcpServers MCP server configurations.
 */
function setMCPServerConfigurations(config, mcpServers) {
    console.log('Setting MCP server configurations:', Object.keys(mcpServers));
    // This would integrate with existing MCP server configuration
    for (const [serverName, serverConfig] of Object.entries(mcpServers)) {
        console.log(`Configuring MCP server: ${serverName}`, serverConfig);
        // config.addMCPServer(serverName, serverConfig);
    }
}
/**
 * Set debug settings.
 * @param config Configuration instance.
 * @param debugSettings Debug configuration.
 */
function setDebugSettings(config, debugSettings) {
    if (debugSettings['logToolCalls']) {
        console.log('Enabled tool call logging');
    }
    if (debugSettings['logToolResults']) {
        console.log('Enabled tool result logging');
    }
    if (debugSettings['enablePerformanceMetrics']) {
        console.log('Enabled performance metrics');
    }
}
/**
 * Create a CLI configuration with MCP support.
 * @param options Configuration options.
 * @returns CLI MCP configuration.
 */
export function createCLIMCPConfig(options) {
    const baseConfig = loadConfigFromEnvironment(DEFAULT_MULTI_PROVIDER_MCP_CONFIG);
    const mcpConfig = options.mcpConfigOverrides
        ? MultiProviderMCPConfigMerger.merge(options.mcpConfigOverrides, baseConfig)
        : baseConfig;
    return {
        defaultProvider: options.defaultProvider || 'gemini',
        providers: {
            gemini: {
                provider: 'gemini',
                enabled: true,
                mcpEnabled: options.enableMCP ?? true,
            },
            openai: {
                provider: 'openai',
                enabled: false, // Disabled by default until API key is provided
                mcpEnabled: options.enableMCP ?? true,
                model: 'gpt-4',
                baseUrl: 'https://api.openai.com/v1',
            },
            anthropic: {
                provider: 'anthropic',
                enabled: false, // Disabled by default until API key is provided
                mcpEnabled: options.enableMCP ?? true,
                model: 'claude-3-5-sonnet-20241022',
                baseUrl: 'https://api.anthropic.com',
            },
        },
        mcpConfig,
        enableMCPByDefault: options.enableMCP ?? true,
    };
}
/**
 * Validate CLI MCP configuration.
 * @param config Configuration to validate.
 * @returns Array of validation errors.
 */
export function validateCLIMCPConfig(config) {
    const errors = [];
    // Validate default provider
    if (!Object.keys(config.providers).includes(config.defaultProvider)) {
        errors.push(`Default provider '${config.defaultProvider}' not found in providers`);
    }
    // Validate provider configurations
    for (const [providerName, providerConfig] of Object.entries(config.providers)) {
        if (providerConfig.enabled) {
            // Check for required API keys for external providers
            if (providerName === 'openai' &&
                !providerConfig.apiKey &&
                !process.env['OPENAI_API_KEY']) {
                errors.push('OpenAI provider is enabled but no API key provided');
            }
            if (providerName === 'anthropic' &&
                !providerConfig.apiKey &&
                !process.env['ANTHROPIC_API_KEY']) {
                errors.push('Anthropic provider is enabled but no API key provided');
            }
        }
    }
    // Validate MCP configuration
    const mcpErrors = MultiProviderMCPConfigValidator.validate(config.mcpConfig);
    errors.push(...mcpErrors);
    return errors;
}
/**
 * Apply CLI flags to configuration.
 * @param config Base configuration.
 * @param flags CLI flags.
 * @returns Updated configuration.
 */
export function applyCLIFlags(config, flags) {
    const updatedConfig = { ...config };
    // Update default provider if specified
    if (flags.provider) {
        updatedConfig.defaultProvider = flags.provider;
    }
    // Handle MCP enable/disable flags
    if (flags.enableMcp !== undefined) {
        updatedConfig.enableMCPByDefault = flags.enableMcp;
        // Enable MCP for all providers
        for (const provider of Object.values(updatedConfig.providers)) {
            provider.mcpEnabled = flags.enableMcp;
        }
    }
    if (flags.disableMcp) {
        updatedConfig.enableMCPByDefault = false;
        // Disable MCP for all providers
        for (const provider of Object.values(updatedConfig.providers)) {
            provider.mcpEnabled = false;
        }
    }
    // Update tool execution settings
    if (flags.toolTimeout !== undefined) {
        updatedConfig.mcpConfig.toolExecution.timeoutMs = flags.toolTimeout;
    }
    if (flags.maxConcurrentTools !== undefined) {
        updatedConfig.mcpConfig.toolExecution.maxConcurrentTools =
            flags.maxConcurrentTools;
    }
    if (flags.confirmationMode) {
        updatedConfig.mcpConfig.toolExecution.confirmationMode =
            flags.confirmationMode;
    }
    // Add MCP servers if specified
    if (flags.mcpServer && flags.mcpServer.length > 0) {
        for (const serverSpec of flags.mcpServer) {
            // Parse server specification (e.g., "name:command:args")
            const [name, command, ...args] = serverSpec.split(':');
            if (name && command) {
                updatedConfig.mcpConfig.mcpServers[name] = {
                    command,
                    args: args.length > 0 ? args : undefined,
                };
            }
        }
    }
    return updatedConfig;
}
/**
 * Get provider configuration for CLI usage.
 * @param config CLI MCP configuration.
 * @param provider Provider to get configuration for.
 * @returns Provider configuration or null if not found/enabled.
 */
export function getProviderConfig(config, provider) {
    const providerConfig = config.providers[provider];
    if (!providerConfig || !providerConfig.enabled) {
        return null;
    }
    return providerConfig;
}
/**
 * List available and enabled providers.
 * @param config CLI MCP configuration.
 * @returns Array of enabled provider names.
 */
export function getEnabledProviders(config) {
    return Object.entries(config.providers)
        .filter(([_, providerConfig]) => providerConfig.enabled)
        .map(([providerName]) => providerName);
}
/**
 * Get MCP-enabled providers.
 * @param config CLI MCP configuration.
 * @returns Array of providers with MCP enabled.
 */
export function getMCPEnabledProviders(config) {
    return Object.entries(config.providers)
        .filter(([_, providerConfig]) => providerConfig.enabled && providerConfig.mcpEnabled)
        .map(([providerName]) => providerName);
}
/**
 * Display configuration summary for debugging.
 * @param config CLI MCP configuration.
 */
export function displayConfigSummary(config) {
    console.log('\n=== MCP Configuration Summary ===');
    console.log(`Default Provider: ${config.defaultProvider}`);
    console.log(`MCP Enabled by Default: ${config.enableMCPByDefault}`);
    console.log('\nProviders:');
    for (const [name, providerConfig] of Object.entries(config.providers)) {
        console.log(`  ${name}: enabled=${providerConfig.enabled}, mcp=${providerConfig.mcpEnabled}`);
    }
    console.log('\nMCP Servers:');
    const serverNames = Object.keys(config.mcpConfig.mcpServers);
    if (serverNames.length > 0) {
        serverNames.forEach((name) => console.log(`  ${name}`));
    }
    else {
        console.log('  None configured');
    }
    console.log('\nTool Execution Settings:');
    console.log(`  Confirmation Mode: ${config.mcpConfig.toolExecution.confirmationMode}`);
    console.log(`  Max Concurrent Tools: ${config.mcpConfig.toolExecution.maxConcurrentTools}`);
    console.log(`  Timeout: ${config.mcpConfig.toolExecution.timeoutMs}ms`);
    console.log('================================\n');
}
/**
 * CLI usage examples and help text.
 */
export const CLI_MCP_USAGE = {
    examples: [
        'gemini --provider openai --enable-mcp "Analyze this repository"',
        'gemini --provider anthropic --mcp-server "github:gh:api" "Create a pull request"',
        'gemini --disable-mcp "Simple conversation without tools"',
        'gemini --tool-timeout 60000 --confirmation-mode never "Run automated analysis"',
        'gemini --max-concurrent-tools 5 --enable-mcp "Process multiple files in parallel"',
    ],
    flags: {
        '--provider': 'Set the LLM provider (gemini, openai, anthropic)',
        '--enable-mcp': 'Enable MCP tool support for all providers',
        '--disable-mcp': 'Disable MCP tool support for all providers',
        '--mcp-server': 'Add MCP server (format: name:command:args)',
        '--tool-timeout': 'Set tool execution timeout in milliseconds',
        '--max-concurrent-tools': 'Set maximum number of concurrent tool executions',
        '--confirmation-mode': 'Set tool confirmation mode (always, never, smart)',
    },
    envVars: [
        'OPENAI_API_KEY: API key for OpenAI provider',
        'ANTHROPIC_API_KEY: API key for Anthropic provider',
        'MCP_MAX_CONCURRENT_TOOLS: Default concurrent tool limit',
        'MCP_TOOL_TIMEOUT_MS: Default tool timeout',
        'MCP_CONFIRMATION_MODE: Default confirmation mode',
    ],
};
//# sourceMappingURL=mcp-provider-config.js.map