/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { LLMProvider } from './types.js';
import { MultiProviderOrchestrator } from './multi-provider-orchestrator.js';
/**
 * Lightweight adversarial challenger that uses LLM prompting for critique
 */
export declare class AdversarialChallenger {
    private orchestrator;
    constructor(orchestrator: MultiProviderOrchestrator);
    /**
     * Run adversarial challenge where providers critique each other
     */
    runChallenge(userInput: string, options?: ChallengeOptions): Promise<ChallengeReport>;
    /**
     * Get initial response from target provider
     */
    private getTargetResponse;
    /**
     * Collect challenges from multiple providers
     */
    private collectChallenges;
    /**
     * Create the challenge prompt
     */
    private createChallengePrompt;
    /**
     * Get focus-specific instructions
     */
    private getFocusInstructions;
    /**
     * Allow target provider to defend against challenges
     */
    private getDefense;
    /**
     * Create defense prompt
     */
    private createDefensePrompt;
    /**
     * Perform meta-analysis of the entire debate
     */
    private performMetaAnalysis;
    /**
     * Create meta-analysis prompt
     */
    private createMetaAnalysisPrompt;
    private selectRandomProvider;
    private selectChallengers;
    private selectMetaAnalyzer;
    private extractConfidence;
    private extractAcceptedCritiques;
    private extractRejectedCritiques;
    private extractConsensusCritiques;
    private extractValidCritiques;
    private extractOverallAssessment;
    private summarizeCritique;
    private summarizeDefense;
}
interface ChallengeOptions {
    targetProvider?: LLMProvider;
    challengers?: LLMProvider[];
    rounds?: number;
    focus?: ChallengeFocus;
}
type ChallengeFocus = 'logic' | 'facts' | 'completeness' | 'assumptions' | 'practical';
interface Challenge {
    challenger: LLMProvider;
    critique: string;
    confidence: number;
}
interface Defense {
    provider: LLMProvider;
    defense: string;
    acceptedCritiques: string[];
    rejectedCritiques: string[];
}
interface MetaAnalysis {
    analyzer: LLMProvider;
    summary: string;
    consensusCritiques: string[];
    validCritiques: string[];
    overallAssessment: string;
}
export interface ChallengeReport {
    originalQuery: string;
    targetProvider: LLMProvider;
    targetResponse: string;
    challenges: Challenge[];
    defense?: Defense;
    metaAnalysis: MetaAnalysis;
    timestamp: string;
}
/**
 * Format challenge report for display
 */
export declare function formatChallengeReport(report: ChallengeReport): string;
export {};
