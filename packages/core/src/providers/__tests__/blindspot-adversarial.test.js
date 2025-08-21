/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BlindspotDetector } from '../blindspot-detector.js';
import { AdversarialChallenger } from '../adversarial-challenger.js';
import { LLMProvider } from '../types.js';
// Mock orchestrator for testing
class MockOrchestrator {
    async executeParallel(request, providers) {
        const targetProviders = providers || this.getAllProviders();
        return targetProviders.map((provider) => ({
            provider,
            response: {
                content: this.getMockResponse(provider, request.prompt),
                finishReason: 'stop',
            },
            latency: 100 + Math.random() * 100,
        }));
    }
    async queryProvider(provider, request) {
        const content = this.getMockAnalysis(provider, request.prompt);
        return {
            content,
            latency: 50 + Math.random() * 50,
        };
    }
    getAllProviders() {
        return [LLMProvider.GEMINI, LLMProvider.OPENAI, LLMProvider.ANTHROPIC];
    }
    getMockResponse(provider, prompt) {
        const responses = {
            [LLMProvider.GEMINI]: `Gemini response to: ${prompt}. This covers aspect A and B.`,
            [LLMProvider.OPENAI]: `OpenAI response to: ${prompt}. This covers aspect A and C.`,
            [LLMProvider.ANTHROPIC]: `Anthropic response to: ${prompt}. This covers aspect B and unique aspect D.`,
        };
        return responses[provider] || 'Default response';
    }
    getMockAnalysis(provider, prompt) {
        if (prompt.includes('blindspot analysis')) {
            return `## Blindspot Analysis

### Critical Blindspots (High Priority)
- Security considerations not addressed
- Edge case handling missing

### Moderate Blindspots (Medium Priority)
- Performance implications not discussed

### Unique Insights
- Only ${provider} mentioned aspect D

Confidence Level: HIGH`;
        }
        else if (prompt.includes('adversarial review')) {
            return `## Critical Analysis

### Strengths (Be Fair)
- Clear explanation
- Good examples

### Critical Issues
- Logical flaw in assumption X
- Missing consideration Y

### Improvement Suggestions
- Add validation for edge cases
- Consider security implications

Confidence Level: MEDIUM`;
        }
        return 'Mock analysis response';
    }
}
describe('Blindspot Detection', () => {
    let detector;
    let orchestrator;
    beforeEach(() => {
        orchestrator = new MockOrchestrator();
        // @ts-expect-error - MockOrchestrator is a test mock
        detector = new BlindspotDetector(orchestrator);
    });
    describe('BlindspotDetector', () => {
        it('should detect blindspots across providers', async () => {
            const analysis = await detector.detectBlindspots('What are the risks?');
            expect(analysis).toBeDefined();
            expect(analysis.originalResponseCount).toBe(3);
            expect(analysis.analyzers).toHaveLength(3);
            expect(analysis.overallConfidence).toBeGreaterThan(0);
        });
        it('should identify common blindspots', async () => {
            const analysis = await detector.detectBlindspots('Analyze this design');
            expect(analysis.commonBlindspots).toBeDefined();
            expect(Array.isArray(analysis.commonBlindspots)).toBe(true);
            // Should extract blindspots from mock responses
            const hasSecurityBlindspot = analysis.commonBlindspots.some((b) => b.toLowerCase().includes('security'));
            expect(hasSecurityBlindspot).toBe(true);
        });
        it('should extract unique insights by provider', async () => {
            const analysis = await detector.detectBlindspots('What makes this unique?');
            expect(analysis.uniqueInsights).toBeDefined();
            expect(analysis.uniqueInsights).toBeInstanceOf(Map);
            // Each provider should have unique insights
            analysis.analyzers.forEach((provider) => {
                const insights = analysis.uniqueInsights.get(provider);
                expect(insights).toBeDefined();
            });
        });
        it('should work with specific providers', async () => {
            const providers = [LLMProvider.GEMINI, LLMProvider.OPENAI];
            const analysis = await detector.detectBlindspots('Test query', providers);
            expect(analysis.analyzers).toEqual(providers);
            expect(analysis.originalResponseCount).toBe(2);
        });
        it('should calculate confidence correctly', async () => {
            const analysis = await detector.detectBlindspots('Test confidence');
            expect(analysis.overallConfidence).toBeGreaterThan(0);
            expect(analysis.overallConfidence).toBeLessThanOrEqual(1);
            // With HIGH confidence in mock, should be close to 0.9
            expect(analysis.overallConfidence).toBeCloseTo(0.9, 1);
        });
    });
    describe('Blindspot Formatting', () => {
        it('should format analysis for display', async () => {
            const { formatBlindspotAnalysis } = await import('../blindspot-detector.js');
            const mockAnalysis = {
                originalResponseCount: 3,
                analyzers: [LLMProvider.GEMINI, LLMProvider.OPENAI],
                commonBlindspots: ['- Security not addressed', '- Performance missing'],
                uniqueInsights: new Map([
                    [LLMProvider.GEMINI, ['- Unique insight 1']],
                    [LLMProvider.OPENAI, ['- Unique insight 2']],
                ]),
                rawAnalyses: [],
                overallConfidence: 0.85,
                timestamp: new Date().toISOString(),
            };
            const formatted = formatBlindspotAnalysis(mockAnalysis);
            expect(formatted).toContain('Blindspot Analysis Report');
            expect(formatted).toContain('85%'); // Confidence
            expect(formatted).toContain('Security not addressed');
            expect(formatted).toContain('Unique Insights');
        });
    });
});
describe('Adversarial Challenge', () => {
    let challenger;
    let orchestrator;
    beforeEach(() => {
        orchestrator = new MockOrchestrator();
        // @ts-expect-error - MockOrchestrator is a test mock
        challenger = new AdversarialChallenger(orchestrator);
    });
    describe('AdversarialChallenger', () => {
        it('should run basic challenge', async () => {
            const report = await challenger.runChallenge('Can AI be conscious?');
            expect(report).toBeDefined();
            expect(report.originalQuery).toBe('Can AI be conscious?');
            expect(report.targetProvider).toBeDefined();
            expect(report.challenges).toHaveLength(2); // Default 2 challengers
            expect(report.metaAnalysis).toBeDefined();
        });
        it('should challenge specific provider', async () => {
            const report = await challenger.runChallenge('Test question', {
                targetProvider: LLMProvider.GEMINI,
                challengers: [LLMProvider.OPENAI],
            });
            expect(report.targetProvider).toBe(LLMProvider.GEMINI);
            expect(report.challenges).toHaveLength(1);
            expect(report.challenges[0].challenger).toBe(LLMProvider.OPENAI);
        });
        it('should support multiple rounds with defense', async () => {
            const report = await challenger.runChallenge('Defend this position', {
                rounds: 2,
            });
            expect(report.defense).toBeDefined();
            expect(report.defense?.provider).toBe(report.targetProvider);
        });
        it('should apply focus to challenges', async () => {
            const report = await challenger.runChallenge('Logical argument', {
                focus: 'logic',
            });
            // Challenges should exist
            expect(report.challenges.length).toBeGreaterThan(0);
            // Check that critique contains logical analysis
            const hasLogicalCritique = report.challenges.some((c) => c.critique.toLowerCase().includes('logical'));
            expect(hasLogicalCritique).toBe(true);
        });
        it('should extract confidence from challenges', async () => {
            const report = await challenger.runChallenge('Test confidence');
            report.challenges.forEach((challenge) => {
                expect(challenge.confidence).toBeGreaterThan(0);
                expect(challenge.confidence).toBeLessThanOrEqual(1);
            });
        });
        it('should perform meta-analysis', async () => {
            const report = await challenger.runChallenge('Analyze this');
            expect(report.metaAnalysis).toBeDefined();
            expect(report.metaAnalysis.analyzer).toBeDefined();
            expect(report.metaAnalysis.summary).toBeTruthy();
            expect(report.metaAnalysis.overallAssessment).toBeTruthy();
        });
    });
    describe('Challenge Formatting', () => {
        it('should format challenge report for display', async () => {
            const { formatChallengeReport } = await import('../adversarial-challenger.js');
            const mockReport = {
                originalQuery: 'Test query',
                targetProvider: LLMProvider.GEMINI,
                targetResponse: 'This is the original response that will be challenged',
                challenges: [
                    {
                        challenger: LLMProvider.OPENAI,
                        critique: 'This response has logical flaws...',
                        confidence: 0.8,
                    },
                ],
                defense: {
                    provider: LLMProvider.GEMINI,
                    defense: 'I defend my position...',
                    acceptedCritiques: ['Valid point about X'],
                    rejectedCritiques: ['Disagree about Y'],
                },
                metaAnalysis: {
                    analyzer: LLMProvider.ANTHROPIC,
                    summary: 'Balanced analysis',
                    consensusCritiques: ['Logical flaw'],
                    validCritiques: ['Missing context'],
                    overallAssessment: 'Response needs improvement',
                },
                timestamp: new Date().toISOString(),
            };
            const formatted = formatChallengeReport(mockReport);
            expect(formatted).toContain('Adversarial Challenge Report');
            expect(formatted).toContain('Target Provider');
            expect(formatted).toContain('gemini');
            expect(formatted).toContain('Challenges');
            expect(formatted).toContain('Defense');
            expect(formatted).toContain('Meta-Analysis');
            expect(formatted).toContain('80%'); // Confidence
        });
    });
});
describe('Integration Tests', () => {
    it('should handle errors gracefully in blindspot detection', async () => {
        const failingOrchestrator = {
            executeParallel: vi.fn().mockRejectedValue(new Error('API error')),
            getAllProviders: () => [LLMProvider.GEMINI],
        };
        // @ts-expect-error - failingOrchestrator is a test mock
        const detector = new BlindspotDetector(failingOrchestrator);
        await expect(detector.detectBlindspots('Test')).rejects.toThrow('API error');
    });
    it('should handle errors gracefully in challenge', async () => {
        const failingOrchestrator = {
            queryProvider: vi.fn().mockRejectedValue(new Error('Provider failed')),
            getAllProviders: () => [LLMProvider.GEMINI],
        };
        // @ts-expect-error - failingOrchestrator is a test mock
        const challenger = new AdversarialChallenger(failingOrchestrator);
        await expect(challenger.runChallenge('Test')).rejects.toThrow('Provider failed');
    });
    it('should work with single provider', async () => {
        const singleProviderOrchestrator = {
            executeParallel: vi.fn().mockResolvedValue([
                {
                    provider: LLMProvider.GEMINI,
                    response: { content: 'Single response', finishReason: 'stop' },
                    latency: 100,
                },
            ]),
            queryProvider: vi.fn().mockResolvedValue({
                content: 'Analysis of single response\nConfidence Level: LOW',
                latency: 50,
            }),
            getAllProviders: () => [LLMProvider.GEMINI],
        };
        // @ts-expect-error - singleProviderOrchestrator is a test mock
        const detector = new BlindspotDetector(singleProviderOrchestrator);
        const analysis = await detector.detectBlindspots('Test with one provider');
        expect(analysis.originalResponseCount).toBe(1);
        expect(analysis.analyzers).toHaveLength(1);
    });
});
//# sourceMappingURL=blindspot-adversarial.test.js.map