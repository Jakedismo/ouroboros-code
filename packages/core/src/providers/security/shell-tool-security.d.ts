/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * ShellToolSecurity - Cross-provider shell command security validation
 *
 * Provides comprehensive security analysis and validation for shell command execution
 * across all LLM providers, preventing command injection and privilege escalation.
 */
import { ProviderType } from '../types.js';
import { ToolExecutionContext, UnifiedToolCall } from '../builtin-tool-manager.js';
import { SecurityLevel, SecurityViolation, SecurityAssessment, SecurityRecommendation } from './types.js';
export interface ShellSecurityConfig {
    allowedCommands: string[];
    blockedCommands: string[];
    dangerousPatterns: string[];
    suspiciousPatterns: string[];
    allowedCategories: CommandCategory[];
    requireSudoApproval: boolean;
    blockPrivilegeEscalation: boolean;
    validateCommandExists: boolean;
    enableCommandSandboxing: boolean;
    providerOverrides: {
        [K in ProviderType]?: Partial<ShellSecurityConfig>;
    };
    maxExecutionTime: number;
    maxOutputSize: number;
    allowBackgroundProcesses: boolean;
    allowNetworkCommands: boolean;
    strictMode: boolean;
    enforcementLevel: 'warn' | 'block' | 'audit';
    logCommands: boolean;
}
export interface CommandValidationResult {
    allowed: boolean;
    securityLevel: SecurityLevel;
    violations: SecurityViolation[];
    recommendations: SecurityRecommendation[];
    sanitizedCommand?: string;
    reasoning: string;
    alternativeCommands?: string[];
}
export interface CommandExecutionContext {
    command: string;
    arguments: string[];
    workingDirectory: string;
    environment: Record<string, string>;
    provider: ProviderType;
    toolCall: UnifiedToolCall;
    timeout?: number;
}
export declare enum CommandCategory {
    SYSTEM_INFO = "system_info",
    FILE_OPERATIONS = "file_operations",
    PROCESS_MANAGEMENT = "process_management",
    NETWORK_OPERATIONS = "network_operations",
    PACKAGE_MANAGEMENT = "package_management",
    VERSION_CONTROL = "version_control",
    TEXT_PROCESSING = "text_processing",
    DEVELOPMENT_TOOLS = "development_tools",
    SYSTEM_ADMINISTRATION = "system_administration",
    SECURITY_TOOLS = "security_tools"
}
export interface CommandPattern {
    pattern: RegExp;
    category: CommandCategory;
    riskLevel: SecurityLevel;
    description: string;
    examples: string[];
}
export declare class ShellToolSecurity {
    private config;
    private commandPatterns;
    private commandCache;
    private executionLog;
    constructor(config: ShellSecurityConfig);
    /**
     * Validate a shell command for execution safety
     */
    validateCommand(context: CommandExecutionContext): Promise<CommandValidationResult>;
    /**
     * Enforce shell security for tool execution
     */
    enforceShellSecurity(context: ToolExecutionContext): Promise<SecurityAssessment>;
    /**
     * Basic safety validation - immediate threats
     */
    private validateBasicSafety;
    /**
     * Validate command category and permissions
     */
    private validateCommandCategory;
    /**
     * Validate against dangerous patterns
     */
    private validatePatterns;
    /**
     * Validate privilege escalation attempts
     */
    private validatePrivilegeEscalation;
    /**
     * Validate injection attempts
     */
    private validateInjectionAttempts;
    /**
     * Validate network access commands
     */
    private validateNetworkAccess;
    /**
     * Utility methods
     */
    private getProviderConfig;
    private extractCommandContext;
    private constructFullCommand;
    private extractCommandName;
    private categorizeCommand;
    private containsControlCharacters;
    private determineSecurityLevel;
    private aggregateValidationResults;
    private generateRecommendations;
    private sanitizeCommand;
    private generateReasoning;
    private suggestAlternatives;
    private createSecurityAssessment;
    private createSafeAssessment;
    private generateSecurityChecks;
    private mapViolationToRiskType;
    private calculateRiskWeight;
    private initializeCommandPatterns;
    private logCommandValidation;
    private handleSecurityViolation;
}
export declare class ShellSecurityError extends Error {
    securityLevel: SecurityLevel;
    violations: SecurityViolation[];
    constructor(message: string, securityLevel: SecurityLevel, violations: SecurityViolation[]);
}
export declare const DEFAULT_SHELL_SECURITY_CONFIG: ShellSecurityConfig;
