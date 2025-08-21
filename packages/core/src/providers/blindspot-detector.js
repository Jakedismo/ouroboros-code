/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Lightweight blindspot detector that uses LLM prompting for analysis
 */
export class BlindspotDetector {
    orchestrator;
    constructor(orchestrator) {
        this.orchestrator = orchestrator;
    }
    /**
     * Detect blindspots by having each provider analyze for gaps
     */
    async detectBlindspots(userInput, providers) {
        const targetProviders = providers || this.orchestrator.getAllProviders();
        // Step 1: Get initial responses from all providers
        const initialResponses = await this.orchestrator.executeParallel({
            prompt: userInput,
            temperature: 0.7,
            maxTokens: 2000,
        }, targetProviders);
        // Step 2: Have each provider analyze others for blindspots
        const blindspotAnalyses = await this.collectBlindspotAnalyses(userInput, initialResponses, targetProviders);
        // Step 3: Synthesize the blindspot reports
        return this.synthesizeBlindspotReports(blindspotAnalyses, initialResponses);
    }
    /**
     * Collect blindspot analyses from each provider
     */
    async collectBlindspotAnalyses(originalQuery, responses, providers) {
        const analyses = [];
        for (const analyzer of providers) {
            // Prepare the other providers' responses for analysis
            const otherResponses = responses
                .filter((r) => r.provider !== analyzer && r.response)
                .map((r) => `${r.provider}:\n${r.response.content}`)
                .join('\n\n---\n\n');
            const blindspotPrompt = this.createBlindspotPrompt(originalQuery, otherResponses);
            const analysis = await this.orchestrator.queryProvider(analyzer, {
                prompt: blindspotPrompt,
                temperature: 0.3, // Lower temperature for analytical task
                maxTokens: 1500,
            });
            analyses.push({
                analyzer,
                analysis: analysis.content,
                confidence: this.extractConfidence(analysis.content),
            });
        }
        return analyses;
    }
    /**
     * Create the blindspot analysis prompt
     */
    createBlindspotPrompt(originalQuery, otherResponses) {
        return `You are performing a critical blindspot analysis. Your task is to identify important gaps, missing perspectives, and overlooked considerations.

ORIGINAL QUESTION/TASK:
${originalQuery}

OTHER PROVIDERS' RESPONSES:
${otherResponses}

YOUR ANALYSIS TASK:
Think extremely carefully about the above responses. Perform a thorough blindspot analysis by:

1. **Identify Critical Gaps** - What important aspects are NOT addressed?
2. **Missing Perspectives** - What viewpoints or approaches are overlooked?
3. **Unstated Assumptions** - What assumptions are made but not acknowledged?
4. **Edge Cases** - What edge cases or exceptions are not considered?
5. **Risks Not Mentioned** - What potential risks or downsides are ignored?
6. **Alternative Solutions** - What alternative approaches are not explored?

Use this TODO list to track your analysis:
- [ ] Review each response for completeness
- [ ] Identify common patterns across responses
- [ ] Note what ALL responses missed
- [ ] Find unique insights that only appear once
- [ ] Evaluate practical implications of gaps
- [ ] Assess criticality of each blindspot

FORMAT YOUR RESPONSE AS:

## Blindspot Analysis

### Critical Blindspots (High Priority)
[List the most important gaps that could lead to problems]

### Moderate Blindspots (Medium Priority)
[List gaps that are noteworthy but less critical]

### Minor Blindspots (Low Priority)
[List small oversights or nice-to-have considerations]

### Unique Insights
[Note any particularly valuable insights that only one provider mentioned]

### Recommendations
[Specific suggestions to address the blindspots]

Confidence Level: [HIGH/MEDIUM/LOW] - How confident are you in this analysis?

Be specific and actionable. Focus on genuinely important gaps, not nitpicks.`;
    }
    /**
     * Synthesize multiple blindspot reports into final analysis
     */
    synthesizeBlindspotReports(analyses, originalResponses) {
        // Extract common blindspots mentioned by multiple analyzers
        const commonBlindspots = this.extractCommonBlindspots(analyses);
        // Extract unique insights from each analyzer
        const uniqueInsights = this.extractUniqueInsights(analyses);
        // Calculate overall confidence
        const overallConfidence = this.calculateOverallConfidence(analyses);
        return {
            originalResponseCount: originalResponses.filter((r) => r.response).length,
            analyzers: analyses.map((a) => a.analyzer),
            commonBlindspots,
            uniqueInsights,
            rawAnalyses: analyses,
            overallConfidence,
            timestamp: new Date().toISOString(),
        };
    }
    /**
     * Extract confidence level from analysis text
     */
    extractConfidence(analysis) {
        if (analysis.includes('Confidence Level: HIGH'))
            return 0.9;
        if (analysis.includes('Confidence Level: MEDIUM'))
            return 0.6;
        if (analysis.includes('Confidence Level: LOW'))
            return 0.3;
        return 0.5; // Default
    }
    /**
     * Extract common blindspots from multiple analyses
     */
    extractCommonBlindspots(analyses) {
        // This is a simplified extraction - in production, you might use
        // more sophisticated NLP or even another LLM call to synthesize
        const blindspots = [];
        // Look for patterns in the analyses
        const allText = analyses.map((a) => a.analysis).join('\n');
        // Extract sections that appear to be blindspots
        const criticalMatches = allText.match(/Critical Blindspots[\s\S]*?(?=\n##|\n###|$)/gi) || [];
        const moderateMatches = allText.match(/Moderate Blindspots[\s\S]*?(?=\n##|\n###|$)/gi) || [];
        // Combine and deduplicate
        [...criticalMatches, ...moderateMatches].forEach((section) => {
            const items = section
                .split('\n')
                .filter((line) => line.startsWith('-') ||
                line.startsWith('•') ||
                line.startsWith('*'));
            blindspots.push(...items);
        });
        return [...new Set(blindspots)]; // Deduplicate
    }
    /**
     * Extract unique insights from analyses
     */
    extractUniqueInsights(analyses) {
        const insights = new Map();
        analyses.forEach((analysis) => {
            const uniqueSection = analysis.analysis.match(/Unique Insights[\s\S]*?(?=\n##|\n###|$)/i);
            if (uniqueSection) {
                const items = uniqueSection[0]
                    .split('\n')
                    .filter((line) => line.startsWith('-') ||
                    line.startsWith('•') ||
                    line.startsWith('*'));
                insights.set(analysis.analyzer, items);
            }
        });
        return insights;
    }
    /**
     * Calculate overall confidence from multiple analyses
     */
    calculateOverallConfidence(analyses) {
        if (analyses.length === 0)
            return 0;
        const sum = analyses.reduce((acc, a) => acc + a.confidence, 0);
        return sum / analyses.length;
    }
}
/**
 * Format blindspot analysis for display
 */
export function formatBlindspotAnalysis(analysis) {
    let output = '🔍 **Blindspot Analysis Report**\n\n';
    output += `Analyzed by ${analysis.analyzers.length} providers\n`;
    output += `Confidence: ${(analysis.overallConfidence * 100).toFixed(0)}%\n\n`;
    if (analysis.commonBlindspots.length > 0) {
        output += '### ⚠️ Common Blindspots (Multiple Providers Agree)\n';
        analysis.commonBlindspots.forEach((blindspot) => {
            output += `${blindspot}\n`;
        });
        output += '\n';
    }
    if (analysis.uniqueInsights.size > 0) {
        output += '### 💡 Unique Insights by Provider\n';
        analysis.uniqueInsights.forEach((insights, provider) => {
            if (insights.length > 0) {
                output += `\n**${provider}:**\n`;
                insights.forEach((insight) => {
                    output += `${insight}\n`;
                });
            }
        });
    }
    return output;
}
//# sourceMappingURL=blindspot-detector.js.map