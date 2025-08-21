/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Config } from '../../config/config.js';
import { ShellConfiguration } from '../../utils/shell-utils.js';
/**
 * Command security classification levels.
 */
export declare enum SecurityLevel {
    /** Safe commands that don't modify state or access sensitive data */
    SAFE = "safe",
    /** Moderate risk commands that read data or perform analysis */
    MODERATE = "moderate",
    /** High risk commands that modify files or system state */
    HIGH = "high",
    /** Critical commands that could cause system damage */
    CRITICAL = "critical",
    /** Blocked commands that are never allowed */
    BLOCKED = "blocked"
}
/**
 * Command validation result with detailed information.
 */
export interface CommandValidationResult {
    /** Whether the command is allowed to execute */
    allowed: boolean;
    /** Security level classification */
    securityLevel: SecurityLevel;
    /** Reason for blocking if not allowed */
    reason?: string;
    /** Whether this requires user confirmation */
    requiresConfirmation: boolean;
    /** Suggested safer alternatives if available */
    alternatives?: string[];
    /** Detected security risks */
    risks?: string[];
    /** Command roots (primary commands) detected */
    commandRoots: string[];
    /** Whether this is a hard denial that can't be overridden */
    isHardDenial?: boolean;
    /** Estimated execution timeout in milliseconds */
    estimatedTimeout: number;
}
/**
 * Configuration for shell command security policies.
 */
export interface ShellSecurityConfig {
    /** Commands that are always allowed without confirmation */
    safeCommands: Set<string>;
    /** Commands that require confirmation but are allowed */
    moderateCommands: Set<string>;
    /** Commands that require explicit confirmation and are high risk */
    highRiskCommands: Set<string>;
    /** Commands that are never allowed */
    blockedCommands: Set<string>;
    /** Dangerous patterns that are always blocked */
    blockedPatterns: RegExp[];
    /** Whether to allow command substitution */
    allowCommandSubstitution: boolean;
    /** Whether to allow file redirection */
    allowRedirection: boolean;
    /** Maximum command length allowed */
    maxCommandLength: number;
    /** Default timeout for commands */
    defaultTimeout: number;
}
/**
 * Enhanced security for shell tool execution across all providers.
 * This class provides comprehensive command validation, allowlisting,
 * and security checks that work identically for OpenAI, Anthropic, and Gemini providers.
 *
 * Features:
 * - Multi-level security classification
 * - Pattern-based threat detection
 * - Command substitution protection
 * - Configurable allowlists and blocklists
 * - Risk assessment and alternatives
 * - Provider-agnostic security policies
 */
export declare class ShellToolSecurity {
    private config;
    private securityConfig;
    private shellConfig;
    constructor(config: Config);
    /**
     * Initialize security configuration with safe defaults and user preferences.
     *
     * @private
     */
    private initializeSecurityConfig;
    /**
     * Validate a shell command with comprehensive security analysis.
     *
     * @param command - The shell command to validate
     * @param context - Additional context for validation
     * @returns Detailed validation result
     */
    validateCommand(command: string, context?: {
        userAllowlist?: Set<string>;
        sessionAllowlist?: Set<string>;
        allowDangerous?: boolean;
    }): CommandValidationResult;
    /**
     * Check command against blocked patterns.
     *
     * @private
     */
    private checkBlockedPatterns;
    /**
     * Classify command security level based on command roots and patterns.
     *
     * @private
     */
    private classifyCommand;
    /**
     * Check if command requires confirmation based on security level and context.
     *
     * @private
     */
    private requiresConfirmation;
    /**
     * Suggest safer alternatives for risky commands.
     *
     * @private
     */
    private suggestAlternatives;
    /**
     * Assess security risks for the command.
     *
     * @private
     */
    private assessRisks;
    /**
     * Estimate execution timeout for the command.
     *
     * @private
     */
    private estimateTimeout;
    /**
     * Check for destructive patterns in command.
     *
     * @private
     */
    private hasDestructivePatterns;
    /**
     * Check for modification patterns in command.
     *
     * @private
     */
    private hasModificationPatterns;
    /**
     * Check for network patterns in command.
     *
     * @private
     */
    private hasNetworkPatterns;
    /**
     * Create a blocked result.
     *
     * @private
     */
    private createBlockedResult;
    /**
     * Add commands to the safe list.
     *
     * @param commands - Commands to add to safe list
     */
    addSafeCommands(commands: string[]): void;
    /**
     * Add commands to the blocked list.
     *
     * @param commands - Commands to add to blocked list
     */
    addBlockedCommands(commands: string[]): void;
    /**
     * Get current security configuration.
     *
     * @returns Current security configuration
     */
    getSecurityConfig(): Readonly<ShellSecurityConfig>;
    /**
     * Update security configuration.
     *
     * @param updates - Partial configuration updates
     */
    updateSecurityConfig(updates: Partial<ShellSecurityConfig>): void;
    /**
     * Get shell configuration for the current platform.
     *
     * @returns Shell configuration
     */
    getShellConfig(): ShellConfiguration;
    /**
     * Check if a command requires elevated privileges.
     *
     * @param command - Command to check
     * @returns True if command requires elevated privileges
     */
    requiresElevatedPrivileges(command: string): boolean;
    /**
     * Get statistics about security classifications.
     *
     * @returns Security statistics
     */
    getSecurityStats(): {
        safeCount: number;
        moderateCount: number;
        highRiskCount: number;
        blockedCount: number;
        totalPatterns: number;
    };
}
