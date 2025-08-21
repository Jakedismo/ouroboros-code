/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { LLMProvider } from './types.js';
import { ToolConfirmationOutcome, } from '../tools/tools.js';
import { ApprovalMode } from '../config/config.js';
import { UnifiedToolInterface, ToolSecurityLevel, } from './unified-tool-interface.js';
/**
 * UnifiedConfirmationManager provides provider-agnostic tool confirmation flows
 * while maintaining security and user experience consistency across all LLM providers
 */
export class UnifiedConfirmationManager {
    config;
    toolManager;
    // Provider-specific confirmation tracking
    providerAllowlists = new Map();
    sessionAllowlists = new Map();
    globalToolAllowlist = new Set();
    constructor(config, toolManager) {
        this.config = config;
        this.toolManager = toolManager;
        // Initialize provider allowlists
        this.providerAllowlists.set(LLMProvider.GEMINI, new Set());
        this.providerAllowlists.set(LLMProvider.OPENAI, new Set());
        this.providerAllowlists.set(LLMProvider.ANTHROPIC, new Set());
    }
    /**
     * Comprehensive confirmation flow that works across all providers
     */
    async processConfirmation(context, abortSignal) {
        // Step 1: Analyze confirmation requirements
        const confirmationDetails = await this.analyzeConfirmationRequirements(context);
        // Step 2: Check allowlists and approval modes
        const skipConfirmation = this.shouldSkipConfirmation(context, confirmationDetails);
        if (skipConfirmation) {
            return {
                outcome: ToolConfirmationOutcome.ProceedOnce,
                skipFutureConfirmations: false,
            };
        }
        // Step 3: Get tool-specific confirmation details if needed
        if (confirmationDetails.requiresConfirmation && context.tool) {
            const toolConfirmationDetails = await context.tool
                .createInvocation(context.toolCall.arguments)
                .shouldConfirmExecute(abortSignal);
            if (toolConfirmationDetails) {
                confirmationDetails.confirmationDetails = toolConfirmationDetails;
            }
        }
        // Step 4: Process provider-agnostic confirmation
        return await this.handleProviderAgnosticConfirmation(context, confirmationDetails);
    }
    /**
     * Analyze confirmation requirements for a tool call
     */
    async analyzeConfirmationRequirements(context) {
        const toolMetadata = UnifiedToolInterface.getToolMetadata(context.toolCall.name);
        // Assess risk level based on tool capabilities and arguments
        const riskAssessment = this.assessRiskLevel(context.toolCall, toolMetadata);
        // Determine if confirmation is required based on multiple factors
        const requiresConfirmation = this.determineConfirmationRequirement(context, toolMetadata, riskAssessment);
        return {
            type: 'provider_agnostic',
            provider: context.provider,
            toolName: context.toolCall.name,
            securityLevel: toolMetadata?.securityLevel || ToolSecurityLevel.MODERATE,
            requiresConfirmation,
            riskAssessment,
            providerSpecificDetails: this.getProviderSpecificDetails(context),
        };
    }
    /**
     * Assess risk level of a tool call based on its capabilities and arguments
     */
    assessRiskLevel(toolCall, toolMetadata) {
        const canModifyFiles = toolMetadata?.canModifyFiles || false;
        const canExecuteCommands = toolMetadata?.canExecuteCommands || false;
        const canAccessNetwork = toolMetadata?.canAccessNetwork || false;
        // Risk assessment based on tool capabilities and arguments
        let estimatedRiskLevel = 'low';
        if (canExecuteCommands) {
            // Shell commands are inherently risky
            estimatedRiskLevel = 'critical';
            // Check for particularly dangerous commands
            const command = toolCall.arguments.command;
            if (command && this.isDangerousCommand(command)) {
                estimatedRiskLevel = 'critical';
            }
        }
        else if (canModifyFiles) {
            // File modifications are medium risk
            estimatedRiskLevel = 'medium';
            // Check if modifying system files or important project files
            const filePath = toolCall.arguments.file_path;
            if (filePath && this.isCriticalFilePath(filePath)) {
                estimatedRiskLevel = 'high';
            }
        }
        else if (canAccessNetwork) {
            // Network access is generally lower risk
            estimatedRiskLevel = 'medium';
            // Check for suspicious URLs or domains
            const url = toolCall.arguments.url;
            if (url && this.isSuspiciousUrl(url)) {
                estimatedRiskLevel = 'high';
            }
        }
        return {
            canModifyFiles,
            canExecuteCommands,
            canAccessNetwork,
            estimatedRiskLevel,
        };
    }
    /**
     * Determine if confirmation is required based on multiple factors
     */
    determineConfirmationRequirement(context, toolMetadata, riskAssessment) {
        const approvalMode = this.config.getApprovalMode();
        // YOLO mode never requires confirmation
        if (approvalMode === ApprovalMode.YOLO) {
            return false;
        }
        // Check tool-specific requirements
        if (toolMetadata?.requiresConfirmation) {
            return true;
        }
        // Check security level requirements
        switch (toolMetadata?.securityLevel) {
            case ToolSecurityLevel.DANGEROUS:
                return true;
            case ToolSecurityLevel.MODERATE:
                return approvalMode === ApprovalMode.DEFAULT;
            case ToolSecurityLevel.SAFE:
                return false;
            default:
                // Unknown tools require confirmation by default
                return true;
        }
    }
    /**
     * Check if confirmation should be skipped based on allowlists and previous approvals
     */
    shouldSkipConfirmation(context, confirmationDetails) {
        const { provider, toolCall, sessionId } = context;
        // Check global tool allowlist
        if (this.globalToolAllowlist.has(toolCall.name)) {
            return true;
        }
        // Check provider-specific allowlist
        const providerAllowlist = this.providerAllowlists.get(provider);
        if (providerAllowlist?.has(toolCall.name)) {
            return true;
        }
        // Check session-specific allowlist
        const sessionAllowlist = this.sessionAllowlists.get(sessionId);
        if (sessionAllowlist?.has(`${provider}.${toolCall.name}`)) {
            return true;
        }
        // Never skip confirmation for critical risk tools
        if (confirmationDetails.riskAssessment.estimatedRiskLevel === 'critical') {
            return false;
        }
        return false;
    }
    /**
     * Handle provider-agnostic confirmation with rich UI and security features
     */
    async handleProviderAgnosticConfirmation(context, details) {
        // If we have specific tool confirmation details, use them
        if (details.confirmationDetails) {
            return await this.handleToolSpecificConfirmation(context, details, details.confirmationDetails);
        }
        // Otherwise, create a provider-agnostic confirmation
        return await this.createProviderAgnosticConfirmation(context, details);
    }
    /**
     * Handle tool-specific confirmation (from existing tools)
     */
    async handleToolSpecificConfirmation(context, unifiedDetails, toolDetails) {
        return new Promise((resolve) => {
            // Wrap the original onConfirm to handle provider-agnostic logic
            const originalOnConfirm = toolDetails.onConfirm;
            toolDetails.onConfirm = async (outcome, payload) => {
                // Call original confirmation handler
                await originalOnConfirm(outcome, payload);
                // Handle provider-agnostic outcome processing
                const result = this.processConfirmationOutcome(context, outcome, unifiedDetails);
                resolve(result);
            };
            // In a real implementation, this would integrate with the UI layer
            // For now, we simulate the confirmation process
            this.simulateConfirmationUI(toolDetails, context);
        });
    }
    /**
     * Create provider-agnostic confirmation for tools without specific confirmation
     */
    async createProviderAgnosticConfirmation(context, details) {
        return new Promise((resolve) => {
            const confirmationDetails = {
                type: 'info',
                title: `Confirm ${context.provider.toUpperCase()} Tool: ${details.toolName}`,
                prompt: this.generateConfirmationPrompt(context, details),
                onConfirm: async (outcome) => {
                    const result = this.processConfirmationOutcome(context, outcome, details);
                    resolve(result);
                },
            };
            // In a real implementation, this would show confirmation UI
            this.simulateConfirmationUI(confirmationDetails, context);
        });
    }
    /**
     * Process confirmation outcome and update allowlists/approval modes
     */
    processConfirmationOutcome(context, outcome, details) {
        const result = { outcome };
        switch (outcome) {
            case ToolConfirmationOutcome.ProceedAlways:
                // Add to global allowlist
                this.globalToolAllowlist.add(context.toolCall.name);
                result.skipFutureConfirmations = true;
                result.allowlistScope = 'tool';
                break;
            case ToolConfirmationOutcome.ProceedAlwaysServer:
                // Add to provider-specific allowlist
                const providerAllowlist = this.providerAllowlists.get(context.provider);
                if (providerAllowlist) {
                    providerAllowlist.add(context.toolCall.name);
                    result.skipFutureConfirmations = true;
                    result.allowlistScope = 'provider';
                }
                break;
            case ToolConfirmationOutcome.ProceedAlwaysTool:
                // Add to session-specific allowlist
                const sessionKey = `${context.provider}.${context.toolCall.name}`;
                if (!this.sessionAllowlists.has(context.sessionId)) {
                    this.sessionAllowlists.set(context.sessionId, new Set());
                }
                this.sessionAllowlists.get(context.sessionId).add(sessionKey);
                result.skipFutureConfirmations = true;
                result.allowlistScope = 'session';
                break;
            case ToolConfirmationOutcome.Cancel:
                // No additional processing needed for cancellation
                break;
            case ToolConfirmationOutcome.ProceedOnce:
            default:
                // Single execution, no persistent changes
                break;
        }
        return result;
    }
    /**
     * Generate a comprehensive confirmation prompt with security details
     */
    generateConfirmationPrompt(context, details) {
        const { toolCall, provider } = context;
        const { riskAssessment, securityLevel } = details;
        let prompt = `The ${provider.toUpperCase()} provider wants to execute the "${toolCall.name}" tool.\n\n`;
        prompt += `**Security Level**: ${securityLevel.toUpperCase()}\n`;
        prompt += `**Risk Assessment**: ${riskAssessment.estimatedRiskLevel.toUpperCase()}\n\n`;
        prompt += `**Tool Capabilities**:\n`;
        if (riskAssessment.canModifyFiles) {
            prompt += `⚠️  Can modify files on your system\n`;
        }
        if (riskAssessment.canExecuteCommands) {
            prompt += `🔴 Can execute system commands\n`;
        }
        if (riskAssessment.canAccessNetwork) {
            prompt += `🌐 Can access network resources\n`;
        }
        prompt += `\n**Tool Arguments**:\n`;
        Object.entries(toolCall.arguments).forEach(([key, value]) => {
            const displayValue = typeof value === 'string' && value.length > 100
                ? value.substring(0, 100) + '...'
                : String(value);
            prompt += `  ${key}: ${displayValue}\n`;
        });
        if (riskAssessment.estimatedRiskLevel === 'critical') {
            prompt += `\n🚨 **CRITICAL SECURITY WARNING**: This tool can perform dangerous operations that may harm your system or data. Please review carefully before proceeding.`;
        }
        return prompt;
    }
    /**
     * Get provider-specific confirmation details
     */
    getProviderSpecificDetails(context) {
        const { provider, toolCall } = context;
        const details = {};
        switch (provider) {
            case LLMProvider.OPENAI:
                details.openai = {
                    model: this.config.getModel(),
                    toolCallId: toolCall.id,
                    functionName: toolCall.name,
                };
                break;
            case LLMProvider.ANTHROPIC:
                details.anthropic = {
                    model: this.config.getModel(),
                    toolUseId: toolCall.id,
                    toolName: toolCall.name,
                };
                break;
            case LLMProvider.GEMINI:
                details.gemini = {
                    model: this.config.getModel(),
                    functionName: toolCall.name,
                };
                break;
        }
        return details;
    }
    /**
     * Security helpers for risk assessment
     */
    isDangerousCommand(command) {
        const dangerousPatterns = [
            /rm\s+-rf?\s+\//, // rm -rf /
            /sudo\s+rm/, // sudo rm
            /mkfs/, // format filesystem
            /dd\s+if=.*of=/, // disk write operations
            /chmod\s+777/, // overly permissive permissions
            /curl.*\|\s*sh/, // pipe to shell
            /wget.*\|\s*sh/, // pipe to shell
            /eval/, // code evaluation
            /exec/, // code execution
        ];
        return dangerousPatterns.some((pattern) => pattern.test(command.toLowerCase()));
    }
    isCriticalFilePath(filePath) {
        const criticalPaths = [
            /\/etc\//, // system config
            /\/usr\/bin\//, // system binaries
            /\/var\/log\//, // system logs
            /\.ssh\//, // SSH keys
            /\.env/, // environment files
            /package\.json/, // project dependencies
            /yarn\.lock/, // dependency locks
            /package-lock\.json/, // dependency locks
        ];
        return criticalPaths.some((pattern) => pattern.test(filePath));
    }
    isSuspiciousUrl(url) {
        try {
            const urlObj = new URL(url);
            // Check for suspicious TLDs or patterns
            const suspiciousPatterns = [
                /\.tk$/i, // suspicious TLD
                /\.ml$/i, // suspicious TLD
                /bit\.ly/i, // URL shortener
                /tinyurl/i, // URL shortener
                /localhost/i, // local access
                /127\.0\.0\.1/, // local access
                /192\.168\./, // local network
            ];
            return suspiciousPatterns.some((pattern) => pattern.test(urlObj.href));
        }
        catch {
            return true; // Invalid URLs are suspicious
        }
    }
    /**
     * Simulate confirmation UI (in real implementation, this would show actual UI)
     */
    simulateConfirmationUI(details, context) {
        // In a real implementation, this would integrate with the CLI UI layer
        // For now, we simulate immediate approval for testing
        setTimeout(() => {
            details.onConfirm(ToolConfirmationOutcome.ProceedOnce);
        }, 0);
    }
    /**
     * Clear allowlists (for testing or security reset)
     */
    clearAllowlists() {
        this.globalToolAllowlist.clear();
        this.providerAllowlists.forEach((set) => set.clear());
        this.sessionAllowlists.clear();
    }
    /**
     * Get confirmation statistics
     */
    getConfirmationStats() {
        const providerStats = {};
        this.providerAllowlists.forEach((set, provider) => {
            providerStats[provider] = set.size;
        });
        return {
            globalAllowlist: this.globalToolAllowlist.size,
            providerAllowlists: providerStats,
            sessionAllowlists: this.sessionAllowlists.size,
        };
    }
    /**
     * Export allowlists for persistence
     */
    exportAllowlists() {
        const providerExport = {};
        this.providerAllowlists.forEach((set, provider) => {
            providerExport[provider] = Array.from(set);
        });
        const sessionExport = {};
        this.sessionAllowlists.forEach((set, sessionId) => {
            sessionExport[sessionId] = Array.from(set);
        });
        return {
            global: Array.from(this.globalToolAllowlist),
            providers: providerExport,
            sessions: sessionExport,
        };
    }
    /**
     * Import allowlists from persistence
     */
    importAllowlists(data) {
        if (data.global) {
            data.global.forEach((tool) => this.globalToolAllowlist.add(tool));
        }
        if (data.providers) {
            Object.entries(data.providers).forEach(([provider, tools]) => {
                const providerEnum = provider;
                if (this.providerAllowlists.has(providerEnum)) {
                    const allowlist = this.providerAllowlists.get(providerEnum);
                    tools.forEach((tool) => allowlist.add(tool));
                }
            });
        }
        if (data.sessions) {
            Object.entries(data.sessions).forEach(([sessionId, tools]) => {
                const sessionSet = new Set(tools);
                this.sessionAllowlists.set(sessionId, sessionSet);
            });
        }
    }
}
//# sourceMappingURL=unified-confirmation-manager.js.map