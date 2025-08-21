/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { isCommandAllowed, getCommandRoots, stripShellWrapper, getShellConfiguration } from '../../utils/shell-utils.js';
/**
 * Command security classification levels.
 */
export var SecurityLevel;
(function (SecurityLevel) {
    /** Safe commands that don't modify state or access sensitive data */
    SecurityLevel["SAFE"] = "safe";
    /** Moderate risk commands that read data or perform analysis */
    SecurityLevel["MODERATE"] = "moderate";
    /** High risk commands that modify files or system state */
    SecurityLevel["HIGH"] = "high";
    /** Critical commands that could cause system damage */
    SecurityLevel["CRITICAL"] = "critical";
    /** Blocked commands that are never allowed */
    SecurityLevel["BLOCKED"] = "blocked";
})(SecurityLevel || (SecurityLevel = {}));
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
export class ShellToolSecurity {
    config;
    securityConfig;
    shellConfig;
    constructor(config) {
        this.config = config;
        this.shellConfig = getShellConfiguration();
        this.securityConfig = this.initializeSecurityConfig();
    }
    /**
     * Initialize security configuration with safe defaults and user preferences.
     *
     * @private
     */
    initializeSecurityConfig() {
        return {
            safeCommands: new Set([
                // File listing and information
                'ls', 'll', 'dir', 'tree',
                'pwd', 'whoami', 'date', 'which', 'where',
                // Text viewing and processing
                'cat', 'less', 'more', 'head', 'tail',
                'grep', 'find', 'locate', 'wc', 'sort', 'uniq',
                // Version and help commands
                'node -v', 'npm -v', 'python --version', 'git --version',
                'docker --version', 'kubectl version --client',
                // Safe git commands
                'git status', 'git log --oneline', 'git branch',
                'git diff --name-only', 'git show --name-only',
                // Package managers (read-only)
                'npm list', 'pip list', 'cargo --version',
            ]),
            moderateCommands: new Set([
                // Build and test commands
                'npm test', 'npm run test', 'npm run build', 'npm run lint',
                'npm run format', 'npm run check', 'npm run dev',
                'yarn test', 'yarn build', 'yarn lint',
                'cargo test', 'cargo check', 'cargo build',
                'python -m pytest', 'python -m unittest',
                // Git commands that don't modify working directory
                'git fetch', 'git log', 'git diff', 'git show',
                // Docker read operations
                'docker ps', 'docker images', 'docker logs',
                // System information
                'ps aux', 'top', 'htop', 'df -h', 'free -h',
            ]),
            highRiskCommands: new Set([
                // File operations
                'cp', 'mv', 'mkdir', 'touch', 'chmod', 'chown',
                // Git operations that modify state
                'git add', 'git commit', 'git push', 'git pull', 'git merge',
                // Package installation
                'npm install', 'npm update', 'pip install', 'cargo install',
                'apt install', 'yum install', 'brew install',
                // Process management
                'kill', 'killall', 'pkill',
                // Network operations
                'curl', 'wget', 'ping', 'nslookup', 'dig',
            ]),
            blockedCommands: new Set([
                // Destructive operations
                'rm -rf', 'rm -r', 'rmdir /s', 'del /s',
                'format', 'fdisk', 'mkfs', 'dd',
                // System modification
                'sudo rm', 'su -c', 'chmod 777', 'chown root',
                // Network security risks
                'nc -l', 'netcat -l', 'ssh', 'scp', 'rsync',
                // Shell bombs and loops
                ':()', 'while true', 'for((;;))',
                // Privilege escalation
                'sudo su', 'sudo -i', 'su root',
            ]),
            blockedPatterns: [
                // Command substitution patterns
                /\$\([^)]*\)/, // $()
                /`[^`]*`/, // backticks
                /<\([^)]*\)/, // <()
                />\([^)]*\)/, // >()
                // Dangerous redirection
                />\s*\/dev\/zero/,
                />\s*\/dev\/null.*&/,
                />\s*\/dev\/random/,
                // Fork bombs and infinite loops
                /:\(\)\s*\{[^}]*:\|:&\};:/, // :(){ :|:& };:
                /while\s+true.*do/,
                /for\s*\(\(.*;;.*\)\)/,
                // Privilege escalation patterns
                /sudo\s+su\s*-?/,
                /su\s+-c\s+['"]/,
                // Network listeners
                /nc\s+-l/,
                /netcat\s+-l/,
                /python.*-m\s+http\.server/,
                // File system traversal
                /\.\.\/\.\.\//,
                /\/\.\.\//,
            ],
            allowCommandSubstitution: false,
            allowRedirection: true,
            maxCommandLength: 1000,
            defaultTimeout: 30000, // 30 seconds
        };
    }
    /**
     * Validate a shell command with comprehensive security analysis.
     *
     * @param command - The shell command to validate
     * @param context - Additional context for validation
     * @returns Detailed validation result
     */
    validateCommand(command, context = {}) {
        // Basic input validation
        if (!command || typeof command !== 'string') {
            return this.createBlockedResult('Invalid command: command must be a non-empty string', []);
        }
        const trimmedCommand = command.trim();
        // Check command length
        if (trimmedCommand.length > this.securityConfig.maxCommandLength) {
            return this.createBlockedResult(`Command too long: ${trimmedCommand.length} characters (max: ${this.securityConfig.maxCommandLength})`, []);
        }
        // Strip shell wrappers for analysis
        const cleanCommand = stripShellWrapper(trimmedCommand);
        const commandRoots = getCommandRoots(cleanCommand);
        // Check against blocked patterns first
        const patternCheck = this.checkBlockedPatterns(cleanCommand);
        if (!patternCheck.allowed) {
            return {
                ...patternCheck,
                commandRoots,
                estimatedTimeout: this.securityConfig.defaultTimeout,
            };
        }
        // Use existing Gemini validation logic
        const geminiValidation = isCommandAllowed(trimmedCommand, this.config);
        if (!geminiValidation.allowed) {
            return this.createBlockedResult(geminiValidation.reason || 'Command blocked by security policy', commandRoots);
        }
        // Classify security level and determine confirmation requirements
        const securityLevel = this.classifyCommand(cleanCommand, commandRoots);
        const requiresConfirmation = this.requiresConfirmation(securityLevel, context);
        // Generate alternatives and risk assessment
        const alternatives = this.suggestAlternatives(cleanCommand, commandRoots);
        const risks = this.assessRisks(cleanCommand, commandRoots, securityLevel);
        return {
            allowed: true,
            securityLevel,
            requiresConfirmation,
            alternatives,
            risks,
            commandRoots,
            estimatedTimeout: this.estimateTimeout(cleanCommand, commandRoots),
        };
    }
    /**
     * Check command against blocked patterns.
     *
     * @private
     */
    checkBlockedPatterns(command) {
        // Check blocked patterns
        for (const pattern of this.securityConfig.blockedPatterns) {
            if (pattern.test(command)) {
                return {
                    allowed: false,
                    securityLevel: SecurityLevel.BLOCKED,
                    requiresConfirmation: false,
                    reason: `Command matches blocked pattern: ${pattern.source}`,
                    isHardDenial: true,
                };
            }
        }
        return {
            allowed: true,
            securityLevel: SecurityLevel.SAFE,
            requiresConfirmation: false,
        };
    }
    /**
     * Classify command security level based on command roots and patterns.
     *
     * @private
     */
    classifyCommand(command, commandRoots) {
        // Check if any root is explicitly blocked
        for (const root of commandRoots) {
            if (this.securityConfig.blockedCommands.has(root) ||
                this.securityConfig.blockedCommands.has(command)) {
                return SecurityLevel.BLOCKED;
            }
        }
        // Check for high risk commands
        for (const root of commandRoots) {
            if (this.securityConfig.highRiskCommands.has(root) ||
                this.securityConfig.highRiskCommands.has(command)) {
                return SecurityLevel.HIGH;
            }
        }
        // Check for moderate risk commands
        for (const root of commandRoots) {
            if (this.securityConfig.moderateCommands.has(root) ||
                this.securityConfig.moderateCommands.has(command)) {
                return SecurityLevel.MODERATE;
            }
        }
        // Check for explicitly safe commands
        for (const root of commandRoots) {
            if (this.securityConfig.safeCommands.has(root) ||
                this.securityConfig.safeCommands.has(command)) {
                return SecurityLevel.SAFE;
            }
        }
        // Default classification based on command characteristics
        if (this.hasDestructivePatterns(command)) {
            return SecurityLevel.CRITICAL;
        }
        else if (this.hasModificationPatterns(command)) {
            return SecurityLevel.HIGH;
        }
        else if (this.hasNetworkPatterns(command)) {
            return SecurityLevel.MODERATE;
        }
        return SecurityLevel.MODERATE; // Default to moderate for unknown commands
    }
    /**
     * Check if command requires confirmation based on security level and context.
     *
     * @private
     */
    requiresConfirmation(securityLevel, context) {
        if (context.allowDangerous) {
            return false; // Skip confirmation if explicitly allowed
        }
        switch (securityLevel) {
            case SecurityLevel.SAFE:
                return false;
            case SecurityLevel.MODERATE:
                return true;
            case SecurityLevel.HIGH:
            case SecurityLevel.CRITICAL:
                return true;
            case SecurityLevel.BLOCKED:
                return false; // No point in asking for confirmation on blocked commands
            default:
                return true;
        }
    }
    /**
     * Suggest safer alternatives for risky commands.
     *
     * @private
     */
    suggestAlternatives(command, commandRoots) {
        const alternatives = [];
        for (const root of commandRoots) {
            switch (root) {
                case 'rm':
                    alternatives.push('Move files to trash instead of permanent deletion');
                    alternatives.push('Use git clean for repository cleanup');
                    break;
                case 'chmod':
                    alternatives.push('Consider using git update-index --chmod instead');
                    break;
                case 'curl':
                    alternatives.push('Consider using wget or a proper HTTP client library');
                    break;
                case 'sudo':
                    alternatives.push('Run commands with appropriate user permissions');
                    break;
                default:
                    // No specific alternatives for this command
                    break;
            }
        }
        return alternatives.length > 0 ? alternatives : undefined;
    }
    /**
     * Assess security risks for the command.
     *
     * @private
     */
    assessRisks(command, commandRoots, securityLevel) {
        const risks = [];
        if (command.includes('sudo')) {
            risks.push('Requires elevated privileges');
        }
        if (command.includes('rm')) {
            risks.push('May permanently delete files');
        }
        if (command.includes('>')) {
            risks.push('May overwrite existing files');
        }
        if (command.includes('&')) {
            risks.push('May run processes in background');
        }
        if (command.includes('|')) {
            risks.push('Uses command piping');
        }
        if (securityLevel === SecurityLevel.HIGH || securityLevel === SecurityLevel.CRITICAL) {
            risks.push('High-risk operation that may modify system state');
        }
        return risks.length > 0 ? risks : undefined;
    }
    /**
     * Estimate execution timeout for the command.
     *
     * @private
     */
    estimateTimeout(command, commandRoots) {
        // Commands that typically take longer
        const longRunningCommands = new Set([
            'npm install', 'npm test', 'npm run build',
            'git clone', 'git pull', 'git push',
            'docker build', 'docker pull',
            'cargo build', 'cargo test',
        ]);
        for (const root of commandRoots) {
            if (longRunningCommands.has(root) || longRunningCommands.has(command)) {
                return 300000; // 5 minutes
            }
        }
        // Network commands get extra time
        if (this.hasNetworkPatterns(command)) {
            return 120000; // 2 minutes
        }
        return this.securityConfig.defaultTimeout;
    }
    /**
     * Check for destructive patterns in command.
     *
     * @private
     */
    hasDestructivePatterns(command) {
        const destructivePatterns = [
            /rm\s+-rf?\s+[/\\]/,
            /format\s+[a-z]:/i,
            /del\s+\/[sq]/i,
            /rmdir\s+\/s/i,
        ];
        return destructivePatterns.some(pattern => pattern.test(command));
    }
    /**
     * Check for modification patterns in command.
     *
     * @private
     */
    hasModificationPatterns(command) {
        const modificationRoots = ['cp', 'mv', 'mkdir', 'touch', 'chmod', 'chown', 'ln'];
        return getCommandRoots(command).some(root => modificationRoots.includes(root));
    }
    /**
     * Check for network patterns in command.
     *
     * @private
     */
    hasNetworkPatterns(command) {
        const networkRoots = ['curl', 'wget', 'ping', 'nslookup', 'dig', 'nc', 'netcat'];
        return getCommandRoots(command).some(root => networkRoots.includes(root));
    }
    /**
     * Create a blocked result.
     *
     * @private
     */
    createBlockedResult(reason, commandRoots) {
        return {
            allowed: false,
            securityLevel: SecurityLevel.BLOCKED,
            reason,
            requiresConfirmation: false,
            commandRoots,
            isHardDenial: true,
            estimatedTimeout: 0,
        };
    }
    /**
     * Add commands to the safe list.
     *
     * @param commands - Commands to add to safe list
     */
    addSafeCommands(commands) {
        commands.forEach(cmd => this.securityConfig.safeCommands.add(cmd));
    }
    /**
     * Add commands to the blocked list.
     *
     * @param commands - Commands to add to blocked list
     */
    addBlockedCommands(commands) {
        commands.forEach(cmd => this.securityConfig.blockedCommands.add(cmd));
    }
    /**
     * Get current security configuration.
     *
     * @returns Current security configuration
     */
    getSecurityConfig() {
        return { ...this.securityConfig };
    }
    /**
     * Update security configuration.
     *
     * @param updates - Partial configuration updates
     */
    updateSecurityConfig(updates) {
        Object.assign(this.securityConfig, updates);
    }
    /**
     * Get shell configuration for the current platform.
     *
     * @returns Shell configuration
     */
    getShellConfig() {
        return this.shellConfig;
    }
    /**
     * Check if a command requires elevated privileges.
     *
     * @param command - Command to check
     * @returns True if command requires elevated privileges
     */
    requiresElevatedPrivileges(command) {
        return command.includes('sudo') ||
            command.includes('su ') ||
            command.includes('runas') ||
            getCommandRoots(command).some(root => ['sudo', 'su', 'doas'].includes(root));
    }
    /**
     * Get statistics about security classifications.
     *
     * @returns Security statistics
     */
    getSecurityStats() {
        return {
            safeCount: this.securityConfig.safeCommands.size,
            moderateCount: this.securityConfig.moderateCommands.size,
            highRiskCount: this.securityConfig.highRiskCommands.size,
            blockedCount: this.securityConfig.blockedCommands.size,
            totalPatterns: this.securityConfig.blockedPatterns.length,
        };
    }
}
//# sourceMappingURL=shell-tool-security.js.map