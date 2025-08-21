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
import { SecurityLevel, RiskType, SecurityCheckCategory } from './types.js';
export var CommandCategory;
(function (CommandCategory) {
    CommandCategory["SYSTEM_INFO"] = "system_info";
    CommandCategory["FILE_OPERATIONS"] = "file_operations";
    CommandCategory["PROCESS_MANAGEMENT"] = "process_management";
    CommandCategory["NETWORK_OPERATIONS"] = "network_operations";
    CommandCategory["PACKAGE_MANAGEMENT"] = "package_management";
    CommandCategory["VERSION_CONTROL"] = "version_control";
    CommandCategory["TEXT_PROCESSING"] = "text_processing";
    CommandCategory["DEVELOPMENT_TOOLS"] = "development_tools";
    CommandCategory["SYSTEM_ADMINISTRATION"] = "system_administration";
    CommandCategory["SECURITY_TOOLS"] = "security_tools";
})(CommandCategory || (CommandCategory = {}));
export class ShellToolSecurity {
    config;
    commandPatterns;
    commandCache = new Map();
    executionLog = [];
    constructor(config) {
        this.config = config;
        this.commandPatterns = this.initializeCommandPatterns();
    }
    /**
     * Validate a shell command for execution safety
     */
    async validateCommand(context) {
        const fullCommand = this.constructFullCommand(context);
        const cacheKey = `${context.provider}:${fullCommand}`;
        // Check cache for repeated commands
        if (this.commandCache.has(cacheKey)) {
            return this.commandCache.get(cacheKey);
        }
        const providerConfig = this.getProviderConfig(context.provider);
        // Perform comprehensive validation
        const validationSteps = [
            () => this.validateBasicSafety(fullCommand, context, providerConfig),
            () => this.validateCommandCategory(fullCommand, context, providerConfig),
            () => this.validatePatterns(fullCommand, context, providerConfig),
            () => this.validatePrivilegeEscalation(fullCommand, context, providerConfig),
            () => this.validateInjectionAttempts(fullCommand, context, providerConfig),
            () => this.validateNetworkAccess(fullCommand, context, providerConfig)
        ];
        const results = await Promise.all(validationSteps.map(step => step()));
        const aggregatedResult = this.aggregateValidationResults(results, fullCommand, context);
        // Cache result
        this.commandCache.set(cacheKey, aggregatedResult);
        // Log validation
        await this.logCommandValidation(context, aggregatedResult);
        return aggregatedResult;
    }
    /**
     * Enforce shell security for tool execution
     */
    async enforceShellSecurity(context) {
        // Extract command from tool parameters
        const commandContext = this.extractCommandContext(context);
        if (!commandContext) {
            return this.createSafeAssessment('No shell command detected');
        }
        const validationResult = await this.validateCommand(commandContext);
        // Convert validation result to security assessment
        const assessment = this.createSecurityAssessment(validationResult, commandContext);
        // Handle violations based on enforcement level
        if (!validationResult.allowed) {
            await this.handleSecurityViolation(validationResult, commandContext);
            if (this.config.enforcementLevel === 'block') {
                throw new ShellSecurityError(`Shell command blocked: ${validationResult.reasoning}`, validationResult.securityLevel, validationResult.violations);
            }
        }
        return assessment;
    }
    /**
     * Basic safety validation - immediate threats
     */
    async validateBasicSafety(command, context, config) {
        const violations = [];
        // Check for null bytes and control characters
        if (this.containsControlCharacters(command)) {
            violations.push({
                type: 'dangerous_characters',
                severity: 'critical',
                description: 'Command contains dangerous control characters',
                command,
                provider: context.provider
            });
        }
        // Check for command injection patterns
        const injectionPatterns = [
            /;\s*rm\s+-rf/, // ; rm -rf
            /\|\s*sudo/, // | sudo
            /&&\s*curl/, // && curl
            /`[^`]*`/, // command substitution
            /\$\([^)]*\)/, // command substitution
            />\s*\/dev\/null\s*&/, // background execution
        ];
        for (const pattern of injectionPatterns) {
            if (pattern.test(command)) {
                violations.push({
                    type: 'command_injection',
                    severity: 'critical',
                    description: `Potential command injection detected: ${pattern.source}`,
                    command,
                    provider: context.provider
                });
            }
        }
        // Check explicitly blocked commands
        const commandName = this.extractCommandName(command);
        if (config.blockedCommands.includes(commandName)) {
            violations.push({
                type: 'dangerous_command',
                severity: 'high',
                description: `Command '${commandName}' is explicitly blocked`,
                command,
                provider: context.provider
            });
        }
        const allowed = violations.length === 0;
        return {
            allowed,
            violations,
            securityLevel: this.determineSecurityLevel(violations),
            reasoning: allowed ? 'Basic safety checks passed' : 'Basic safety violations detected'
        };
    }
    /**
     * Validate command category and permissions
     */
    async validateCommandCategory(command, context, config) {
        const violations = [];
        const commandName = this.extractCommandName(command);
        const category = this.categorizeCommand(commandName);
        // Check if command category is allowed
        if (category && !config.allowedCategories.includes(category)) {
            violations.push({
                type: 'dangerous_command',
                severity: 'medium',
                description: `Command category '${category}' is not allowed`,
                command,
                provider: context.provider
            });
        }
        // Check whitelist if configured
        if (config.allowedCommands.length > 0 && !config.allowedCommands.includes(commandName)) {
            violations.push({
                type: 'dangerous_command',
                severity: 'medium',
                description: `Command '${commandName}' is not in allowed list`,
                command,
                provider: context.provider
            });
        }
        return {
            violations,
            reasoning: violations.length === 0 ? 'Command category validation passed' : 'Command category violations detected'
        };
    }
    /**
     * Validate against dangerous patterns
     */
    async validatePatterns(command, context, config) {
        const violations = [];
        // Check dangerous patterns
        for (const pattern of config.dangerousPatterns) {
            const regex = new RegExp(pattern, 'i');
            if (regex.test(command)) {
                violations.push({
                    type: 'dangerous_command',
                    severity: 'high',
                    description: `Command matches dangerous pattern: ${pattern}`,
                    command,
                    provider: context.provider
                });
            }
        }
        // Check suspicious patterns
        for (const pattern of config.suspiciousPatterns) {
            const regex = new RegExp(pattern, 'i');
            if (regex.test(command)) {
                violations.push({
                    type: 'dangerous_command',
                    severity: 'medium',
                    description: `Command matches suspicious pattern: ${pattern}`,
                    command,
                    provider: context.provider
                });
            }
        }
        return {
            violations,
            reasoning: violations.length === 0 ? 'Pattern validation passed' : 'Dangerous patterns detected'
        };
    }
    /**
     * Validate privilege escalation attempts
     */
    async validatePrivilegeEscalation(command, context, config) {
        const violations = [];
        // Check for sudo usage
        if (command.includes('sudo') && config.requireSudoApproval) {
            violations.push({
                type: 'privilege_escalation',
                severity: 'high',
                description: 'Command requires sudo - elevated privileges detected',
                command,
                provider: context.provider
            });
        }
        // Check for other privilege escalation methods
        const privilegePatterns = [
            /su\s+/, // su command
            /sudo\s+/, // sudo command
            /pkexec\s+/, // pkexec command
            /setuid/, // setuid references
            /chmod\s+[0-7]*[4][0-7]*/, // setuid bit manipulation
            /chown\s+root/, // changing ownership to root
        ];
        for (const pattern of privilegePatterns) {
            if (pattern.test(command) && config.blockPrivilegeEscalation) {
                violations.push({
                    type: 'privilege_escalation',
                    severity: 'high',
                    description: `Privilege escalation attempt detected: ${pattern.source}`,
                    command,
                    provider: context.provider
                });
            }
        }
        return {
            violations,
            reasoning: violations.length === 0 ? 'Privilege escalation validation passed' : 'Privilege escalation attempts detected'
        };
    }
    /**
     * Validate injection attempts
     */
    async validateInjectionAttempts(command, context, config) {
        const violations = [];
        // Advanced injection patterns
        const advancedInjectionPatterns = [
            // Command chaining
            /;\s*[^;\s]/, // semicolon followed by command
            /\|\s*[^|\s]/, // pipe to another command
            /&&\s*[^&\s]/, // logical AND chaining
            /\|\|\s*[^|\s]/, // logical OR chaining
            // Redirection attacks
            />\s*\/etc\//, // writing to system files
            />\s*\/bin\//, // writing to binary directories
            />\s*\/usr\//, // writing to system directories
            // Process substitution
            /<\([^)]*\)/, // process substitution
            />\([^)]*\)/, // process substitution
            // Variable manipulation
            /\$\{[^}]*\}/, // variable expansion
            /\$[A-Z_][A-Z0-9_]*/, // environment variable usage
            // Path traversal
            /\.\.\//, // directory traversal
            /~\/\.\.[\/\\]/, // home directory traversal
        ];
        for (const pattern of advancedInjectionPatterns) {
            if (pattern.test(command)) {
                violations.push({
                    type: 'command_injection',
                    severity: 'high',
                    description: `Advanced injection pattern detected: ${pattern.source}`,
                    command,
                    provider: context.provider
                });
            }
        }
        return {
            violations,
            reasoning: violations.length === 0 ? 'Injection validation passed' : 'Command injection attempts detected'
        };
    }
    /**
     * Validate network access commands
     */
    async validateNetworkAccess(command, context, config) {
        const violations = [];
        if (!config.allowNetworkCommands) {
            const networkCommands = ['curl', 'wget', 'nc', 'netcat', 'telnet', 'ssh', 'scp', 'rsync', 'ping'];
            const commandName = this.extractCommandName(command);
            if (networkCommands.includes(commandName)) {
                violations.push({
                    type: 'network_access_violation',
                    severity: 'medium',
                    description: `Network command '${commandName}' is not allowed`,
                    command,
                    provider: context.provider
                });
            }
        }
        return {
            violations,
            reasoning: violations.length === 0 ? 'Network access validation passed' : 'Network access violations detected'
        };
    }
    /**
     * Utility methods
     */
    getProviderConfig(provider) {
        const baseConfig = { ...this.config };
        const providerOverrides = this.config.providerOverrides[provider] || {};
        return {
            ...baseConfig,
            ...providerOverrides
        };
    }
    extractCommandContext(context) {
        if (context.toolCall.name !== 'shell_command') {
            return null;
        }
        const command = context.toolCall.parameters.command;
        if (!command || typeof command !== 'string') {
            return null;
        }
        return {
            command: command.trim(),
            arguments: [],
            workingDirectory: context.toolCall.parameters.working_directory || process.cwd(),
            environment: context.toolCall.parameters.environment || {},
            provider: context.provider,
            toolCall: context.toolCall,
            timeout: context.toolCall.parameters.timeout
        };
    }
    constructFullCommand(context) {
        return [context.command, ...context.arguments].join(' ').trim();
    }
    extractCommandName(command) {
        return command.trim().split(/\s+/)[0].toLowerCase();
    }
    categorizeCommand(commandName) {
        const categoryMap = {
            // System info
            'ps': CommandCategory.SYSTEM_INFO,
            'top': CommandCategory.SYSTEM_INFO,
            'htop': CommandCategory.SYSTEM_INFO,
            'who': CommandCategory.SYSTEM_INFO,
            'whoami': CommandCategory.SYSTEM_INFO,
            'id': CommandCategory.SYSTEM_INFO,
            'uname': CommandCategory.SYSTEM_INFO,
            'uptime': CommandCategory.SYSTEM_INFO,
            // File operations
            'ls': CommandCategory.FILE_OPERATIONS,
            'cat': CommandCategory.FILE_OPERATIONS,
            'head': CommandCategory.FILE_OPERATIONS,
            'tail': CommandCategory.FILE_OPERATIONS,
            'find': CommandCategory.FILE_OPERATIONS,
            'grep': CommandCategory.FILE_OPERATIONS,
            'cp': CommandCategory.FILE_OPERATIONS,
            'mv': CommandCategory.FILE_OPERATIONS,
            'rm': CommandCategory.FILE_OPERATIONS,
            'mkdir': CommandCategory.FILE_OPERATIONS,
            'rmdir': CommandCategory.FILE_OPERATIONS,
            // Version control
            'git': CommandCategory.VERSION_CONTROL,
            'svn': CommandCategory.VERSION_CONTROL,
            'hg': CommandCategory.VERSION_CONTROL,
            // Network
            'curl': CommandCategory.NETWORK_OPERATIONS,
            'wget': CommandCategory.NETWORK_OPERATIONS,
            'ping': CommandCategory.NETWORK_OPERATIONS,
            'nc': CommandCategory.NETWORK_OPERATIONS,
            'netcat': CommandCategory.NETWORK_OPERATIONS,
            // Package management
            'npm': CommandCategory.PACKAGE_MANAGEMENT,
            'yarn': CommandCategory.PACKAGE_MANAGEMENT,
            'pip': CommandCategory.PACKAGE_MANAGEMENT,
            'apt': CommandCategory.PACKAGE_MANAGEMENT,
            'yum': CommandCategory.PACKAGE_MANAGEMENT,
            'brew': CommandCategory.PACKAGE_MANAGEMENT,
            // Development tools
            'node': CommandCategory.DEVELOPMENT_TOOLS,
            'python': CommandCategory.DEVELOPMENT_TOOLS,
            'java': CommandCategory.DEVELOPMENT_TOOLS,
            'gcc': CommandCategory.DEVELOPMENT_TOOLS,
            'make': CommandCategory.DEVELOPMENT_TOOLS,
            'docker': CommandCategory.DEVELOPMENT_TOOLS,
        };
        return categoryMap[commandName] || null;
    }
    containsControlCharacters(command) {
        // Check for null bytes, control characters, etc.
        return /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(command);
    }
    determineSecurityLevel(violations) {
        if (violations.some(v => v.severity === 'critical')) {
            return SecurityLevel.DANGEROUS;
        }
        if (violations.some(v => v.severity === 'high')) {
            return SecurityLevel.DANGEROUS;
        }
        if (violations.some(v => v.severity === 'medium')) {
            return SecurityLevel.MODERATE;
        }
        return SecurityLevel.SAFE;
    }
    aggregateValidationResults(results, command, context) {
        const allViolations = results.flatMap(r => r.violations || []);
        const allowed = results.every(r => r.allowed !== false) && allViolations.length === 0;
        const securityLevel = this.determineSecurityLevel(allViolations);
        return {
            allowed,
            securityLevel,
            violations: allViolations,
            recommendations: this.generateRecommendations(allViolations, command, context),
            sanitizedCommand: this.sanitizeCommand(command, allViolations),
            reasoning: this.generateReasoning(results, allowed),
            alternativeCommands: this.suggestAlternatives(command, context)
        };
    }
    generateRecommendations(violations, command, context) {
        const recommendations = [];
        if (violations.some(v => v.type === 'command_injection')) {
            recommendations.push({
                priority: 'critical',
                category: SecurityCheckCategory.COMMAND_SAFETY,
                description: 'Command injection detected',
                action: 'Use parameterized command execution or input validation',
                impact: 'Prevents arbitrary command execution'
            });
        }
        if (violations.some(v => v.type === 'privilege_escalation')) {
            recommendations.push({
                priority: 'high',
                category: SecurityCheckCategory.PRIVILEGE_MANAGEMENT,
                description: 'Privilege escalation attempt detected',
                action: 'Remove sudo/su commands or use role-based access control',
                impact: 'Prevents unauthorized privilege escalation'
            });
        }
        return recommendations;
    }
    sanitizeCommand(command, violations) {
        let sanitized = command;
        // Remove dangerous patterns
        for (const violation of violations) {
            if (violation.type === 'dangerous_characters') {
                sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
            }
        }
        return sanitized !== command ? sanitized : undefined;
    }
    generateReasoning(results, allowed) {
        if (allowed) {
            return 'All security validations passed';
        }
        const reasons = results
            .filter(r => r.reasoning && r.violations && r.violations.length > 0)
            .map(r => r.reasoning);
        return reasons.join('; ');
    }
    suggestAlternatives(command, context) {
        const alternatives = [];
        const commandName = this.extractCommandName(command);
        // Common safe alternatives
        const alternativeMap = {
            'rm': ['mv to trash', 'use file manager'],
            'sudo': ['run without elevated privileges', 'use user-level alternatives'],
            'curl': ['use web_fetch tool', 'use built-in HTTP client'],
            'wget': ['use web_fetch tool', 'use built-in HTTP client']
        };
        if (alternativeMap[commandName]) {
            alternatives.push(...alternativeMap[commandName]);
        }
        return alternatives;
    }
    createSecurityAssessment(validationResult, context) {
        const riskFactors = validationResult.violations.map(violation => ({
            type: this.mapViolationToRiskType(violation.type),
            severity: violation.severity,
            description: violation.description,
            evidence: { command: context.command, violation },
            weight: this.calculateRiskWeight(violation)
        }));
        return {
            riskLevel: validationResult.securityLevel,
            riskFactors,
            securityChecks: this.generateSecurityChecks(validationResult),
            recommendations: validationResult.recommendations,
            allowExecution: validationResult.allowed,
            requiresConfirmation: validationResult.securityLevel !== SecurityLevel.SAFE
        };
    }
    createSafeAssessment(reason) {
        return {
            riskLevel: SecurityLevel.SAFE,
            riskFactors: [],
            securityChecks: [],
            recommendations: [],
            allowExecution: true,
            requiresConfirmation: false
        };
    }
    generateSecurityChecks(result) {
        return [
            {
                name: 'Command Injection Check',
                category: SecurityCheckCategory.COMMAND_SAFETY,
                passed: !result.violations.some(v => v.type === 'command_injection'),
                details: 'Validates command for injection attempts'
            },
            {
                name: 'Privilege Escalation Check',
                category: SecurityCheckCategory.PRIVILEGE_MANAGEMENT,
                passed: !result.violations.some(v => v.type === 'privilege_escalation'),
                details: 'Validates command for privilege escalation attempts'
            },
            {
                name: 'Dangerous Pattern Check',
                category: SecurityCheckCategory.COMMAND_SAFETY,
                passed: !result.violations.some(v => v.type === 'dangerous_command'),
                details: 'Validates command against known dangerous patterns'
            }
        ];
    }
    mapViolationToRiskType(violationType) {
        const mapping = {
            'command_injection': RiskType.COMMAND_EXECUTION,
            'privilege_escalation': RiskType.PRIVILEGE_ESCALATION,
            'dangerous_command': RiskType.SYSTEM_MODIFICATION,
            'network_access_violation': RiskType.NETWORK_ACCESS,
            'dangerous_characters': RiskType.COMMAND_EXECUTION
        };
        return mapping[violationType] || RiskType.COMMAND_EXECUTION;
    }
    calculateRiskWeight(violation) {
        const weights = {
            'critical': 1.0,
            'high': 0.8,
            'medium': 0.5,
            'low': 0.2
        };
        return weights[violation.severity] || 0.5;
    }
    initializeCommandPatterns() {
        return [
            {
                pattern: /rm\s+-rf\s+\/|rm\s+-rf\s+\*/,
                category: CommandCategory.FILE_OPERATIONS,
                riskLevel: SecurityLevel.DANGEROUS,
                description: 'Dangerous recursive file deletion',
                examples: ['rm -rf /', 'rm -rf *']
            },
            {
                pattern: /sudo\s+.*passwd/,
                category: CommandCategory.SYSTEM_ADMINISTRATION,
                riskLevel: SecurityLevel.DANGEROUS,
                description: 'Password change with elevated privileges',
                examples: ['sudo passwd root']
            }
        ];
    }
    async logCommandValidation(context, result) {
        if (this.config.logCommands) {
            const logEntry = {
                timestamp: new Date(),
                provider: context.provider,
                command: context.command,
                allowed: result.allowed,
                securityLevel: result.securityLevel,
                violations: result.violations.length,
                reasoning: result.reasoning
            };
            this.executionLog.push(logEntry);
            // Keep log size manageable
            if (this.executionLog.length > 1000) {
                this.executionLog.splice(0, 500);
            }
        }
    }
    async handleSecurityViolation(result, context) {
        if (this.config.enforcementLevel === 'audit') {
            console.log('AUDIT: Shell command blocked', {
                command: context.command,
                provider: context.provider,
                violations: result.violations,
                reasoning: result.reasoning
            });
        }
        else if (this.config.enforcementLevel === 'warn') {
            console.warn('WARNING: Potentially dangerous shell command', {
                command: context.command,
                reasoning: result.reasoning,
                recommendations: result.recommendations
            });
        }
    }
}
export class ShellSecurityError extends Error {
    securityLevel;
    violations;
    constructor(message, securityLevel, violations) {
        super(message);
        this.securityLevel = securityLevel;
        this.violations = violations;
        this.name = 'ShellSecurityError';
    }
}
// Default configuration
export const DEFAULT_SHELL_SECURITY_CONFIG = {
    allowedCommands: [
        'ls', 'pwd', 'whoami', 'echo', 'cat', 'head', 'tail', 'grep', 'find',
        'git', 'npm', 'node', 'python', 'python3', 'pip', 'pip3',
        'docker', 'kubectl', 'make', 'cmake'
    ],
    blockedCommands: [
        'rm', 'rmdir', 'dd', 'mkfs', 'fdisk', 'cfdisk', 'parted',
        'iptables', 'netfilter', 'tc', 'sysctl', 'modprobe', 'insmod',
        'passwd', 'chpasswd', 'usermod', 'useradd', 'userdel',
        'su', 'sudo', 'pkexec', 'systemctl', 'service'
    ],
    dangerousPatterns: [
        'rm\\s+-rf\\s+[/*]',
        ':\\(\\){:|:&};:', // fork bomb
        'eval\\s*\\(',
        'exec\\s*\\(',
        '\\$\\([^)]*\\)', // command substitution
        '`[^`]*`', // backtick substitution
    ],
    suspiciousPatterns: [
        'curl.*\\|.*sh', // curl | sh
        'wget.*\\|.*sh', // wget | sh
        '>\\s*/etc/', // writing to /etc
        'chmod\\s+777', // overly permissive permissions
        'nc\\s+-l', // netcat listener
    ],
    allowedCategories: [
        CommandCategory.SYSTEM_INFO,
        CommandCategory.FILE_OPERATIONS,
        CommandCategory.VERSION_CONTROL,
        CommandCategory.TEXT_PROCESSING,
        CommandCategory.DEVELOPMENT_TOOLS
    ],
    requireSudoApproval: true,
    blockPrivilegeEscalation: true,
    validateCommandExists: true,
    enableCommandSandboxing: false,
    providerOverrides: {
        [ProviderType.GEMINI]: {
            strictMode: false,
            allowNetworkCommands: true
        },
        [ProviderType.OPENAI]: {
            strictMode: true,
            allowNetworkCommands: false
        },
        [ProviderType.ANTHROPIC]: {
            strictMode: true,
            allowNetworkCommands: false
        }
    },
    maxExecutionTime: 30000, // 30 seconds
    maxOutputSize: 1024 * 1024, // 1MB
    allowBackgroundProcesses: false,
    allowNetworkCommands: false,
    strictMode: true,
    enforcementLevel: 'warn',
    logCommands: true
};
//# sourceMappingURL=shell-tool-security.js.map