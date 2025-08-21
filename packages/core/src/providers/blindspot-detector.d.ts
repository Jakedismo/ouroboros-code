/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { LLMProvider } from './types.js';
import { MultiProviderOrchestrator } from './multi-provider-orchestrator.js';
/**
 * Lightweight blindspot detector that uses LLM prompting for analysis
 */
export declare class BlindspotDetector {
    private orchestrator;
    constructor(orchestrator: MultiProviderOrchestrator);
    /**
     * Detect blindspots by having each provider analyze for gaps
     */
    detectBlindspots(userInput: string, providers?: LLMProvider[]): Promise<BlindspotAnalysis>;
    /**
     * Collect blindspot analyses from each provider
     */
    private collectBlindspotAnalyses;
    /**
     * Create the blindspot analysis prompt
     */
    private createBlindspotPrompt;
    /**
     * Synthesize multiple blindspot reports into final analysis
     */
    private synthesizeBlindspotReports;
    /**
     * Extract confidence level from analysis text
     */
    private extractConfidence;
    /**
     * Extract common blindspots from multiple analyses
     */
    private extractCommonBlindspots;
    /**
     * Extract unique insights from analyses
     */
    private extractUniqueInsights;
    /**
     * Calculate overall confidence from multiple analyses
     */
    private calculateOverallConfidence;
}
interface ProviderAnalysis {
    analyzer: LLMProvider;
    analysis: string;
    confidence: number;
}
export interface BlindspotAnalysis {
    originalResponseCount: number;
    analyzers: LLMProvider[];
    commonBlindspots: string[];
    uniqueInsights: Map<LLMProvider, string[]>;
    rawAnalyses: ProviderAnalysis[];
    overallConfidence: number;
    timestamp: string;
}
/**
 * Format blindspot analysis for display
 */
export declare function formatBlindspotAnalysis(analysis: BlindspotAnalysis): string;
export {};
