/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Lightweight adversarial challenger that uses LLM prompting for critique
 */
export class AdversarialChallenger {
    orchestrator;
    constructor(orchestrator) {
        this.orchestrator = orchestrator;
    }
    /**
     * Run adversarial challenge where providers critique each other
     */
    async runChallenge(userInput, options) {
        const targetProvider = options?.targetProvider || this.selectRandomProvider();
        const challengers = options?.challengers || this.selectChallengers(targetProvider);
        // Step 1: Get initial response from target provider
        const targetResponse = await this.getTargetResponse(userInput, targetProvider);
        // Step 2: Have challengers critique the response
        const challenges = await this.collectChallenges(userInput, targetResponse, challengers, options?.focus);
        // Step 3: Optional - Let target defend (if rounds > 1)
        let defense;
        if ((options?.rounds || 1) > 1) {
            defense = await this.getDefense(targetProvider, targetResponse, challenges);
        }
        // Step 4: Meta-analysis of the debate
        const metaAnalysis = await this.performMetaAnalysis(userInput, targetResponse, challenges, defense);
        return {
            originalQuery: userInput,
            targetProvider,
            targetResponse: targetResponse.content,
            challenges,
            defense,
            metaAnalysis,
            timestamp: new Date().toISOString(),
        };
    }
    /**
     * Get initial response from target provider
     */
    async getTargetResponse(query, provider) {
        const response = await this.orchestrator.queryProvider(provider, {
            messages: [{ role: 'user', content: query }],
            temperature: 0.7,
            maxTokens: 2000,
        });
        return {
            provider,
            content: response.response?.content || '',
            latency: response.latency || 0,
        };
    }
    /**
     * Collect challenges from multiple providers
     */
    async collectChallenges(originalQuery, targetResponse, challengers, focus) {
        const challenges = [];
        for (const challenger of challengers) {
            const challengePrompt = this.createChallengePrompt(originalQuery, targetResponse, focus);
            const challengeResponse = await this.orchestrator.queryProvider(challenger, {
                messages: [{ role: 'user', content: challengePrompt }],
                temperature: 0.3, // Lower temperature for analytical critique
                maxTokens: 1500,
            });
            challenges.push({
                challenger,
                critique: challengeResponse.response?.content || '',
                confidence: this.extractConfidence(challengeResponse.response?.content || ''),
            });
        }
        return challenges;
    }
    /**
     * Create the challenge prompt
     */
    createChallengePrompt(originalQuery, targetResponse, focus) {
        const focusInstructions = this.getFocusInstructions(focus);
        return `You are performing an adversarial review to improve response quality through constructive criticism.

ORIGINAL QUESTION:
${originalQuery}

RESPONSE TO CHALLENGE (from ${targetResponse.provider}):
${targetResponse.content}

YOUR CHALLENGE TASK:
${focusInstructions}

Critically evaluate the response using this systematic approach:

TODO List for Analysis:
- [ ] Check logical consistency and reasoning
- [ ] Verify factual accuracy
- [ ] Identify unstated assumptions
- [ ] Evaluate completeness of answer
- [ ] Look for potential biases
- [ ] Consider alternative viewpoints
- [ ] Assess practical applicability
- [ ] Check for edge cases

FORMAT YOUR CRITIQUE AS:

## Critical Analysis

### Strengths (Be Fair)
[List 2-3 genuine strengths of the response]

### Critical Issues
[Major problems that significantly impact the response quality]

### Moderate Issues
[Issues that should be addressed but aren't critical]

### Minor Issues
[Small improvements or clarifications needed]

### Missing Perspectives
[Important viewpoints or approaches not considered]

### Factual Accuracy Check
[Any factual errors or questionable claims]

### Logical Consistency
[Any logical flaws or contradictions]

### Improvement Suggestions
[Specific, actionable ways to improve the response]

### Alternative Approach
[Briefly describe a different way to answer the question]

Confidence Level: [HIGH/MEDIUM/LOW] - How confident are you in this critique?

Be specific, constructive, and focus on substantive issues rather than style or minor preferences.`;
    }
    /**
     * Get focus-specific instructions
     */
    getFocusInstructions(focus) {
        switch (focus) {
            case 'logic':
                return 'FOCUS: Concentrate on logical consistency, reasoning flaws, and argumentative structure.';
            case 'facts':
                return 'FOCUS: Prioritize factual accuracy, verify claims, and identify unsupported assertions.';
            case 'completeness':
                return 'FOCUS: Evaluate completeness, identify missing information, and overlooked aspects.';
            case 'assumptions':
                return 'FOCUS: Identify and challenge unstated assumptions and implicit biases.';
            case 'practical':
                return 'FOCUS: Assess practical applicability, implementation challenges, and real-world considerations.';
            default:
                return 'Perform a comprehensive critique covering all aspects.';
        }
    }
    /**
     * Allow target provider to defend against challenges
     */
    async getDefense(targetProvider, originalResponse, challenges) {
        const defensePrompt = this.createDefensePrompt(originalResponse, challenges);
        const defenseResponse = await this.orchestrator.queryProvider(targetProvider, {
            messages: [{ role: 'user', content: defensePrompt }],
            temperature: 0.5,
            maxTokens: 1500,
        });
        return {
            provider: targetProvider,
            defense: defenseResponse.response?.content || '',
            acceptedCritiques: this.extractAcceptedCritiques(defenseResponse.response?.content || ''),
            rejectedCritiques: this.extractRejectedCritiques(defenseResponse.response?.content || ''),
        };
    }
    /**
     * Create defense prompt
     */
    createDefensePrompt(originalResponse, challenges) {
        const challengeSummary = challenges
            .map((c) => `Challenge from ${c.challenger}:\n${c.critique}`)
            .join('\n\n---\n\n');
        return `You previously provided this response:
${originalResponse.content}

Other providers have challenged your response with the following critiques:

${challengeSummary}

Please provide a thoughtful defense or acknowledgment:

1. **Valid Critiques to Accept**: Which criticisms are valid and how would you address them?
2. **Critiques to Clarify**: Which criticisms are based on misunderstanding your response?
3. **Critiques to Reject**: Which criticisms do you disagree with and why?
4. **Improved Response**: How would you modify your original response based on valid feedback?

Be intellectually honest - accept valid criticism while defending your correct points.`;
    }
    /**
     * Perform meta-analysis of the entire debate
     */
    async performMetaAnalysis(originalQuery, targetResponse, challenges, defense) {
        // Use a neutral provider for meta-analysis if possible
        const metaAnalyzer = this.selectMetaAnalyzer(targetResponse.provider, challenges);
        const metaPrompt = this.createMetaAnalysisPrompt(originalQuery, targetResponse, challenges, defense);
        const metaResponse = await this.orchestrator.queryProvider(metaAnalyzer, {
            messages: [{ role: 'user', content: metaPrompt }],
            temperature: 0.3,
            maxTokens: 1000,
        });
        return {
            analyzer: metaAnalyzer,
            summary: metaResponse.response?.content || '',
            consensusCritiques: this.extractConsensusCritiques(challenges),
            validCritiques: this.extractValidCritiques(metaResponse.response?.content || ''),
            overallAssessment: this.extractOverallAssessment(metaResponse.response?.content || ''),
        };
    }
    /**
     * Create meta-analysis prompt
     */
    createMetaAnalysisPrompt(originalQuery, targetResponse, challenges, defense) {
        const challengeSummary = challenges
            .map((c) => `${c.challenger}: ${this.summarizeCritique(c.critique)}`)
            .join('\n');
        const defenseSection = defense
            ? `\nDEFENSE from ${defense.provider}:\n${this.summarizeDefense(defense.defense)}`
            : '';
        return `As a neutral arbitrator, analyze this adversarial debate:

ORIGINAL QUESTION: ${originalQuery}

INITIAL RESPONSE (${targetResponse.provider}): 
[Summary of original response]

CHALLENGES:
${challengeSummary}
${defenseSection}

Provide a balanced meta-analysis:

1. **Consensus Critiques**: What issues do multiple challengers agree on?
2. **Valid Critiques**: Which criticisms are substantive and should be addressed?
3. **Invalid/Weak Critiques**: Which criticisms are unfair or nitpicky?
4. **Key Improvements Needed**: What are the most important improvements?
5. **Overall Assessment**: Is the original response fundamentally sound despite critiques?

Be fair and balanced. The goal is improvement, not just criticism.`;
    }
    // Helper methods
    selectRandomProvider() {
        const providers = this.orchestrator.getAllProviders();
        return providers[Math.floor(Math.random() * providers.length)];
    }
    selectChallengers(targetProvider, count = 2) {
        const allProviders = this.orchestrator.getAllProviders();
        const available = allProviders.filter((p) => p !== targetProvider);
        return available.slice(0, Math.min(count, available.length));
    }
    selectMetaAnalyzer(targetProvider, challenges) {
        const usedProviders = new Set([
            targetProvider,
            ...challenges.map((c) => c.challenger),
        ]);
        const allProviders = this.orchestrator.getAllProviders();
        const neutral = allProviders.find((p) => !usedProviders.has(p));
        return neutral || allProviders[0]; // Fallback to first provider
    }
    extractConfidence(text) {
        if (text.includes('Confidence Level: HIGH'))
            return 0.9;
        if (text.includes('Confidence Level: MEDIUM'))
            return 0.6;
        if (text.includes('Confidence Level: LOW'))
            return 0.3;
        return 0.5;
    }
    extractAcceptedCritiques(defense) {
        const accepted = defense.match(/Valid Critiques[\s\S]*?(?=\n##|\n\d\.)/i);
        return accepted ? [accepted[0]] : [];
    }
    extractRejectedCritiques(defense) {
        const rejected = defense.match(/Reject[\s\S]*?(?=\n##|\n\d\.)/i);
        return rejected ? [rejected[0]] : [];
    }
    extractConsensusCritiques(_challenges) {
        // Simplified - in production, use NLP to find common themes
        return ['Consensus analysis would go here'];
    }
    extractValidCritiques(metaAnalysis) {
        const valid = metaAnalysis.match(/Valid Critiques[\s\S]*?(?=\n\d\.|\n##)/i);
        return valid ? [valid[0]] : [];
    }
    extractOverallAssessment(metaAnalysis) {
        const assessment = metaAnalysis.match(/Overall Assessment[\s\S]*$/i);
        return assessment ? assessment[0] : 'No overall assessment found';
    }
    summarizeCritique(critique) {
        // Extract first few lines or main points
        const lines = critique.split('\n').slice(0, 3);
        return lines.join(' ').substring(0, 200) + '...';
    }
    summarizeDefense(defense) {
        const lines = defense.split('\n').slice(0, 3);
        return lines.join(' ').substring(0, 200) + '...';
    }
}
/**
 * Format challenge report for display
 */
export function formatChallengeReport(report) {
    let output = '⚔️ **Adversarial Challenge Report**\n\n';
    output += `**Target Provider**: ${report.targetProvider}\n`;
    output += `**Challengers**: ${report.challenges.map((c) => c.challenger).join(', ')}\n\n`;
    output += '### Original Response\n';
    output += `${report.targetResponse.substring(0, 300)}...\n\n`;
    output += '### 🔥 Challenges\n';
    report.challenges.forEach((challenge) => {
        output += `\n**${challenge.challenger}** (Confidence: ${(challenge.confidence * 100).toFixed(0)}%):\n`;
        output += `${challenge.critique.substring(0, 400)}...\n`;
    });
    if (report.defense) {
        output += '\n### 🛡️ Defense\n';
        output += `${report.defense.defense.substring(0, 400)}...\n`;
    }
    output += '\n### ⚖️ Meta-Analysis\n';
    output += `**Arbitrator**: ${report.metaAnalysis.analyzer}\n\n`;
    output += report.metaAnalysis.overallAssessment + '\n';
    return output;
}
//# sourceMappingURL=adversarial-challenger.js.map