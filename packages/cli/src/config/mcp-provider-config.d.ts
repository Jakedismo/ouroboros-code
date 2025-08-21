/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Config } from '@ouroboros/code-cli-core';
import { MultiProviderMCPConfig } from '@ouroboros/code-cli-core';
/**
 * Available LLM providers for CLI configuration.
 */
export type CLIProviderType = 'gemini' | 'openai' | 'anthropic';
/**
 * CLI-specific provider configuration.
 */
export interface CLIProviderConfig {
    provider: CLIProviderType;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    enabled: boolean;
    mcpEnabled: boolean;
}
/**
 * Extended CLI configuration with multi-provider MCP support.
 */
export interface CLIMCPConfig {
    defaultProvider: CLIProviderType;
    providers: Record<CLIProviderType, CLIProviderConfig>;
    mcpConfig: MultiProviderMCPConfig;
    enableMCPByDefault: boolean;
}
/**
 * Configure MCP settings for a specific provider.
 * This function sets up provider-specific MCP configurations.
 * @param config Configuration instance to modify.
 * @param provider Provider identifier.
 * @param mcpConfig Optional MCP configuration overrides.
 */
export declare function configureMCPForProvider(config: Config, provider: CLIProviderType, mcpConfig?: Partial<MultiProviderMCPConfig>): void;
/**
 * Create a CLI configuration with MCP support.
 * @param options Configuration options.
 * @returns CLI MCP configuration.
 */
export declare function createCLIMCPConfig(options: {
    defaultProvider?: CLIProviderType;
    enableMCP?: boolean;
    mcpConfigOverrides?: Partial<MultiProviderMCPConfig>;
}): CLIMCPConfig;
/**
 * Validate CLI MCP configuration.
 * @param config Configuration to validate.
 * @returns Array of validation errors.
 */
export declare function validateCLIMCPConfig(config: CLIMCPConfig): string[];
/**
 * Apply CLI flags to configuration.
 * @param config Base configuration.
 * @param flags CLI flags.
 * @returns Updated configuration.
 */
export declare function applyCLIFlags(config: CLIMCPConfig, flags: {
    provider?: CLIProviderType;
    enableMcp?: boolean;
    disableMcp?: boolean;
    mcpServer?: string[];
    toolTimeout?: number;
    maxConcurrentTools?: number;
    confirmationMode?: 'always' | 'never' | 'smart';
}): CLIMCPConfig;
/**
 * Get provider configuration for CLI usage.
 * @param config CLI MCP configuration.
 * @param provider Provider to get configuration for.
 * @returns Provider configuration or null if not found/enabled.
 */
export declare function getProviderConfig(config: CLIMCPConfig, provider: CLIProviderType): CLIProviderConfig | null;
/**
 * List available and enabled providers.
 * @param config CLI MCP configuration.
 * @returns Array of enabled provider names.
 */
export declare function getEnabledProviders(config: CLIMCPConfig): CLIProviderType[];
/**
 * Get MCP-enabled providers.
 * @param config CLI MCP configuration.
 * @returns Array of providers with MCP enabled.
 */
export declare function getMCPEnabledProviders(config: CLIMCPConfig): CLIProviderType[];
/**
 * Display configuration summary for debugging.
 * @param config CLI MCP configuration.
 */
export declare function displayConfigSummary(config: CLIMCPConfig): void;
/**
 * CLI usage examples and help text.
 */
export declare const CLI_MCP_USAGE: {
    examples: string[];
    flags: {
        '--provider': string;
        '--enable-mcp': string;
        '--disable-mcp': string;
        '--mcp-server': string;
        '--tool-timeout': string;
        '--max-concurrent-tools': string;
        '--confirmation-mode': string;
    };
    envVars: string[];
};
