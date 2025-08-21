/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { UnifiedToolCall, LLMProvider } from './types.js';
import { ToolCallConfirmationDetails, ToolConfirmationOutcome, AnyDeclarativeTool } from '../tools/tools.js';
import { Config } from '../config/config.js';
import { BuiltinToolManager } from './builtin-tool-manager.js';
import { ToolSecurityLevel } from './unified-tool-interface.js';
export interface ProviderConfirmationContext {
    provider: LLMProvider;
    userPromptId: string;
    sessionId: string;
    toolCall: UnifiedToolCall;
    tool?: AnyDeclarativeTool;
}
export interface UnifiedConfirmationDetails {
    type: 'provider_agnostic';
    provider: LLMProvider;
    toolName: string;
    securityLevel: ToolSecurityLevel;
    requiresConfirmation: boolean;
    confirmationDetails?: ToolCallConfirmationDetails;
    riskAssessment: {
        canModifyFiles: boolean;
        canExecuteCommands: boolean;
        canAccessNetwork: boolean;
        estimatedRiskLevel: 'low' | 'medium' | 'high' | 'critical';
    };
    providerSpecificDetails?: {
        openai?: any;
        anthropic?: any;
        gemini?: any;
    };
}
export interface ConfirmationResult {
    outcome: ToolConfirmationOutcome;
    modifiedToolCall?: UnifiedToolCall;
    skipFutureConfirmations?: boolean;
    allowlistScope?: 'tool' | 'provider' | 'session';
}
/**
 * UnifiedConfirmationManager provides provider-agnostic tool confirmation flows
 * while maintaining security and user experience consistency across all LLM providers
 */
export declare class UnifiedConfirmationManager {
    private config;
    private toolManager;
    private providerAllowlists;
    private sessionAllowlists;
    private globalToolAllowlist;
    constructor(config: Config, toolManager: BuiltinToolManager);
    /**
     * Comprehensive confirmation flow that works across all providers
     */
    processConfirmation(context: ProviderConfirmationContext, abortSignal: AbortSignal): Promise<ConfirmationResult>;
    /**
     * Analyze confirmation requirements for a tool call
     */
    private analyzeConfirmationRequirements;
    /**
     * Assess risk level of a tool call based on its capabilities and arguments
     */
    private assessRiskLevel;
    /**
     * Determine if confirmation is required based on multiple factors
     */
    private determineConfirmationRequirement;
    /**
     * Check if confirmation should be skipped based on allowlists and previous approvals
     */
    private shouldSkipConfirmation;
    /**
     * Handle provider-agnostic confirmation with rich UI and security features
     */
    private handleProviderAgnosticConfirmation;
    /**
     * Handle tool-specific confirmation (from existing tools)
     */
    private handleToolSpecificConfirmation;
    /**
     * Create provider-agnostic confirmation for tools without specific confirmation
     */
    private createProviderAgnosticConfirmation;
    /**
     * Process confirmation outcome and update allowlists/approval modes
     */
    private processConfirmationOutcome;
    /**
     * Generate a comprehensive confirmation prompt with security details
     */
    private generateConfirmationPrompt;
    /**
     * Get provider-specific confirmation details
     */
    private getProviderSpecificDetails;
    /**
     * Security helpers for risk assessment
     */
    private isDangerousCommand;
    private isCriticalFilePath;
    private isSuspiciousUrl;
    /**
     * Simulate confirmation UI (in real implementation, this would show actual UI)
     */
    private simulateConfirmationUI;
    /**
     * Clear allowlists (for testing or security reset)
     */
    clearAllowlists(): void;
    /**
     * Get confirmation statistics
     */
    getConfirmationStats(): {
        globalAllowlist: number;
        providerAllowlists: Record<string, number>;
        sessionAllowlists: number;
    };
    /**
     * Export allowlists for persistence
     */
    exportAllowlists(): {
        global: string[];
        providers: Record<string, string[]>;
        sessions: Record<string, string[]>;
    };
    /**
     * Import allowlists from persistence
     */
    importAllowlists(data: {
        global?: string[];
        providers?: Record<string, string[]>;
        sessions?: Record<string, string[]>;
    }): void;
}
