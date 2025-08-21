/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LLMProvider } from '../types.js';
// Mock implementations for testing
class MultiProviderOrchestrator {
    providers = new Map();
    config;
    constructor(config) {
        this.config = config;
    }
    async executeParallel(request, providers) {
        const targetProviders = providers || this.config.providers;
        const promises = targetProviders.map(async (provider) => {
            const startTime = Date.now();
            try {
                // Simulate provider response
                await new Promise((resolve) => setTimeout(resolve, Math.random() * 100));
                return {
                    provider,
                    response: {
                        content: `Response from ${provider}: ${request.prompt}`,
                        finishReason: 'stop',
                        usage: {
                            promptTokenCount: 100,
                            candidatesTokenCount: 200,
                            totalTokenCount: 300,
                        },
                    },
                    latency: Date.now() - startTime,
                    error: undefined,
                };
            }
            catch (_error) {
                return {
                    provider,
                    response: undefined,
                    latency: Date.now() - startTime,
                    error: _error,
                };
            }
        });
        if (this.config.parallelExecution) {
            return Promise.all(promises);
        }
        else {
            const results = [];
            for (const promise of promises) {
                results.push(await promise);
            }
            return results;
        }
    }
    async executeSequential(request, providers) {
        const targetProviders = providers || this.config.providers;
        const results = [];
        for (const provider of targetProviders) {
            const startTime = Date.now();
            try {
                await new Promise((resolve) => setTimeout(resolve, 50));
                results.push({
                    provider,
                    response: {
                        content: `Sequential response from ${provider}`,
                        finishReason: 'stop',
                    },
                    latency: Date.now() - startTime,
                });
            }
            catch (_error) {
                results.push({
                    provider,
                    error: _error,
                    latency: Date.now() - startTime,
                });
            }
        }
        return results;
    }
    async executeWithFallback(request, primaryProvider, fallbackProviders) {
        try {
            const response = await this.executeParallel(request, [primaryProvider]);
            if (response[0].error) {
                throw response[0].error;
            }
            return response[0];
        }
        catch (_error) {
            for (const fallback of fallbackProviders) {
                try {
                    const response = await this.executeParallel(request, [fallback]);
                    if (!response[0].error) {
                        return response[0];
                    }
                }
                catch {
                    continue;
                }
            }
            throw new Error('All providers failed');
        }
    }
}
class ResponseAggregator {
    config;
    constructor(config) {
        this.config = config;
    }
    async aggregate(responses) {
        const validResponses = this.filterValidResponses(responses);
        const commonElements = this.extractCommonElements(validResponses);
        const divergences = this.identifyDivergences(validResponses);
        return {
            responses,
            successCount: validResponses.length,
            failureCount: responses.length - validResponses.length,
            totalLatency: responses.reduce((sum, r) => sum + r.latency, 0),
            commonElements,
            divergences,
        };
    }
    filterValidResponses(responses) {
        return responses.filter((r) => r.response && !r.error);
    }
    extractCommonElements(responses) {
        const allContent = responses.map((r) => r.response?.content || '');
        const words = allContent.flatMap((c) => c.toLowerCase().split(/\s+/));
        const wordFreq = new Map();
        words.forEach((word) => {
            wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
        });
        const commonWords = Array.from(wordFreq.entries())
            .filter(([_, count]) => count >= responses.length * 0.5)
            .map(([word]) => word);
        return {
            commonWords,
            consensusLevel: commonWords.length / wordFreq.size,
        };
    }
    identifyDivergences(responses) {
        const divergences = [];
        // Compare response lengths
        const lengths = responses.map((r) => r.response?.content?.length || 0);
        const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
        responses.forEach((response, i) => {
            const length = lengths[i];
            if (Math.abs(length - avgLength) > avgLength * 0.5) {
                divergences.push({
                    provider: response.provider,
                    type: 'length',
                    description: `Response length (${length}) differs significantly from average (${avgLength})`,
                });
            }
        });
        return divergences;
    }
}
class SynthesisEngine {
    config;
    constructor(config) {
        this.config = config;
    }
    async synthesize(aggregated, strategy) {
        const selectedStrategy = strategy || this.config.strategy;
        switch (selectedStrategy) {
            case 'voting':
                return this.votingSynthesis(aggregated.responses);
            case 'consensus':
                return this.consensusSynthesis(aggregated.responses);
            case 'ai_synthesis':
                return await this.aiSynthesis(aggregated.responses);
            case 'weighted_average':
                return this.weightedSynthesis(aggregated.responses);
            case 'best_of':
                return this.bestOfSynthesis(aggregated.responses);
            case 'detailed_comparison':
                return this.detailedComparison(aggregated.responses);
            default:
                throw new Error(`Unknown synthesis strategy: ${selectedStrategy}`);
        }
    }
    votingSynthesis(responses) {
        const validResponses = responses.filter((r) => r.response);
        const votes = new Map();
        // Simulate voting by content similarity
        validResponses.forEach((r) => {
            const key = r.response.content.substring(0, 50);
            votes.set(key, (votes.get(key) || 0) + 1);
        });
        const winner = Array.from(votes.entries()).sort((a, b) => b[1] - a[1])[0];
        return {
            synthesizedContent: validResponses.find((r) => r.response.content.startsWith(winner[0]))
                ?.response?.content || '',
            strategy: 'voting',
            confidence: winner[1] / validResponses.length,
            sources: validResponses.map((r) => ({
                provider: r.provider,
                contribution: winner[1] / validResponses.length,
            })),
            metadata: {
                votingResults: Object.fromEntries(votes),
            },
        };
    }
    consensusSynthesis(responses) {
        const validResponses = responses.filter((r) => r.response);
        // Find common elements
        const contents = validResponses.map((r) => r.response.content);
        const commonParts = this.findCommonSubstrings(contents);
        return {
            synthesizedContent: commonParts.join(' '),
            strategy: 'consensus',
            confidence: commonParts.length > 0 ? 0.8 : 0.3,
            sources: validResponses.map((r) => ({
                provider: r.provider,
                contribution: 1 / validResponses.length,
            })),
            metadata: {
                consensusPoints: commonParts.length,
            },
        };
    }
    async aiSynthesis(responses) {
        // Simulate AI synthesis
        await new Promise((resolve) => setTimeout(resolve, 100));
        const validResponses = responses.filter((r) => r.response);
        const combined = validResponses
            .map((r) => `${r.provider}: ${r.response.content}`)
            .join('\n');
        return {
            synthesizedContent: `AI Synthesis of responses:\n${combined}`,
            strategy: 'ai_synthesis',
            confidence: 0.9,
            sources: validResponses.map((r) => ({
                provider: r.provider,
                contribution: 1 / validResponses.length,
            })),
            metadata: {
                synthesisProvider: this.config.synthesisProvider,
            },
        };
    }
    weightedSynthesis(responses) {
        const validResponses = responses.filter((r) => r.response);
        const weights = this.config.weights || new Map();
        let weightedContent = '';
        let totalWeight = 0;
        validResponses.forEach((r) => {
            const weight = weights.get(r.provider) || 1;
            weightedContent += `[${weight}x] ${r.response.content}\n`;
            totalWeight += weight;
        });
        return {
            synthesizedContent: weightedContent,
            strategy: 'weighted_average',
            confidence: 0.75,
            sources: validResponses.map((r) => ({
                provider: r.provider,
                contribution: (weights.get(r.provider) || 1) / totalWeight,
            })),
            metadata: {
                weights: Object.fromEntries(weights),
            },
        };
    }
    bestOfSynthesis(responses) {
        const validResponses = responses.filter((r) => r.response);
        // Select best based on some criteria (e.g., length, latency)
        const best = validResponses.reduce((best, current) => {
            const bestScore = (best.response?.content.length || 0) / (best.latency + 1);
            const currentScore = (current.response?.content.length || 0) / (current.latency + 1);
            return currentScore > bestScore ? current : best;
        });
        return {
            synthesizedContent: best.response?.content || '',
            strategy: 'best_of',
            confidence: 0.85,
            sources: [
                {
                    provider: best.provider,
                    contribution: 1.0,
                },
            ],
            metadata: {
                selectedProvider: best.provider,
                selectionCriteria: 'content_quality_per_latency',
            },
        };
    }
    detailedComparison(responses) {
        const validResponses = responses.filter((r) => r.response);
        const comparison = validResponses.map((r) => ({
            provider: r.provider,
            content: r.response.content,
            latency: r.latency,
            tokens: r.response.usage?.totalTokenCount,
        }));
        const synthesized = comparison
            .map((c) => `${c.provider} (${c.latency}ms, ${c.tokens} tokens):\n${c.content}`)
            .join('\n\n---\n\n');
        return {
            synthesizedContent: synthesized,
            strategy: 'detailed_comparison',
            confidence: 1.0,
            sources: validResponses.map((r) => ({
                provider: r.provider,
                contribution: 1 / validResponses.length,
            })),
            metadata: {
                comparisonData: comparison,
            },
        };
    }
    findCommonSubstrings(strings) {
        if (strings.length === 0)
            return [];
        const words = strings[0].split(/\s+/);
        const common = [];
        words.forEach((word) => {
            if (strings.every((s) => s.includes(word))) {
                common.push(word);
            }
        });
        return common;
    }
}
// Tests
describe('Multi-Provider Convergence', () => {
    describe('MultiProviderOrchestrator', () => {
        let orchestrator;
        beforeEach(() => {
            orchestrator = new MultiProviderOrchestrator({
                providers: [
                    LLMProvider.GEMINI,
                    LLMProvider.OPENAI,
                    LLMProvider.ANTHROPIC,
                ],
                parallelExecution: true,
                timeout: 5000,
            });
        });
        it('should execute requests in parallel', async () => {
            const startTime = Date.now();
            const responses = await orchestrator.executeParallel({
                prompt: 'Test prompt',
            });
            const duration = Date.now() - startTime;
            expect(responses).toHaveLength(3);
            expect(duration).toBeLessThan(200); // Should be fast due to parallelization
            responses.forEach((response) => {
                expect(response.provider).toBeDefined();
                expect(response.response).toBeDefined();
                expect(response.latency).toBeGreaterThan(0);
            });
        });
        it('should execute requests sequentially', async () => {
            const sequentialOrchestrator = new MultiProviderOrchestrator({
                providers: [LLMProvider.GEMINI, LLMProvider.OPENAI],
                parallelExecution: false,
                timeout: 5000,
            });
            const startTime = Date.now();
            const responses = await sequentialOrchestrator.executeSequential({
                prompt: 'Test prompt',
            });
            const duration = Date.now() - startTime;
            expect(responses).toHaveLength(2);
            expect(duration).toBeGreaterThanOrEqual(100); // Should take longer due to sequential execution
        });
        it('should handle fallback behavior', async () => {
            // Mock a failing primary provider
            const failingOrchestrator = new MultiProviderOrchestrator({
                providers: [LLMProvider.GEMINI],
                parallelExecution: true,
                timeout: 5000,
            });
            // Override executeParallel to simulate failure for first provider
            vi.spyOn(failingOrchestrator, 'executeParallel').mockImplementationOnce(async () => [
                {
                    provider: LLMProvider.GEMINI,
                    error: new Error('Primary provider failed'),
                    latency: 10,
                },
            ]);
            const response = await failingOrchestrator.executeWithFallback({ prompt: 'Test' }, LLMProvider.GEMINI, [LLMProvider.OPENAI, LLMProvider.ANTHROPIC]);
            expect(response).toBeDefined();
            expect(response.error).toBeUndefined();
        });
    });
    describe('ResponseAggregator', () => {
        let aggregator;
        beforeEach(() => {
            aggregator = new ResponseAggregator({
                waitForAll: true,
                timeoutMs: 5000,
                minimumResponses: 2,
                includeMetadata: true,
            });
        });
        it('should aggregate responses correctly', async () => {
            const responses = [
                {
                    provider: LLMProvider.GEMINI,
                    response: { content: 'Gemini response test', finishReason: 'stop' },
                    latency: 100,
                },
                {
                    provider: LLMProvider.OPENAI,
                    response: { content: 'OpenAI response test', finishReason: 'stop' },
                    latency: 150,
                },
                {
                    provider: LLMProvider.ANTHROPIC,
                    error: new Error('Provider failed'),
                    latency: 50,
                },
            ];
            const aggregated = await aggregator.aggregate(responses);
            expect(aggregated.successCount).toBe(2);
            expect(aggregated.failureCount).toBe(1);
            expect(aggregated.totalLatency).toBe(300);
            expect(aggregated.responses).toHaveLength(3);
        });
        it('should extract common elements', () => {
            const responses = [
                {
                    provider: LLMProvider.GEMINI,
                    response: {
                        content: 'The answer is test response',
                        finishReason: 'stop',
                    },
                    latency: 100,
                },
                {
                    provider: LLMProvider.OPENAI,
                    response: {
                        content: 'The answer is test solution',
                        finishReason: 'stop',
                    },
                    latency: 150,
                },
            ];
            const validResponses = aggregator.filterValidResponses(responses);
            const commonElements = aggregator.extractCommonElements(validResponses);
            expect(commonElements.commonWords).toContain('the');
            expect(commonElements.commonWords).toContain('answer');
            expect(commonElements.commonWords).toContain('is');
            expect(commonElements.commonWords).toContain('test');
            expect(commonElements.consensusLevel).toBeGreaterThan(0);
        });
        it('should identify divergences', () => {
            const responses = [
                {
                    provider: LLMProvider.GEMINI,
                    response: { content: 'Short', finishReason: 'stop' },
                    latency: 100,
                },
                {
                    provider: LLMProvider.OPENAI,
                    response: {
                        content: 'This is a much longer response with many more words and details',
                        finishReason: 'stop',
                    },
                    latency: 150,
                },
            ];
            const validResponses = aggregator.filterValidResponses(responses);
            const divergences = aggregator.identifyDivergences(validResponses);
            expect(divergences).toHaveLength(2);
            expect(divergences[0].type).toBe('length');
        });
    });
    describe('SynthesisEngine', () => {
        let synthesisEngine;
        let testResponses;
        beforeEach(() => {
            synthesisEngine = new SynthesisEngine({
                strategy: 'consensus',
                includeSourceAttribution: true,
            });
            testResponses = [
                {
                    provider: LLMProvider.GEMINI,
                    response: { content: 'The answer is 42', finishReason: 'stop' },
                    latency: 100,
                },
                {
                    provider: LLMProvider.OPENAI,
                    response: {
                        content: 'The answer is clearly 42',
                        finishReason: 'stop',
                    },
                    latency: 150,
                },
                {
                    provider: LLMProvider.ANTHROPIC,
                    response: {
                        content: 'The answer seems to be 42',
                        finishReason: 'stop',
                    },
                    latency: 120,
                },
            ];
        });
        it('should synthesize using voting strategy', async () => {
            const aggregated = {
                responses: testResponses,
                successCount: 3,
                failureCount: 0,
                totalLatency: 370,
            };
            const result = await synthesisEngine.synthesize(aggregated, 'voting');
            expect(result.strategy).toBe('voting');
            expect(result.confidence).toBeGreaterThan(0);
            expect(result.sources).toHaveLength(3);
            expect(result.synthesizedContent).toBeTruthy();
        });
        it('should synthesize using consensus strategy', async () => {
            const aggregated = {
                responses: testResponses,
                successCount: 3,
                failureCount: 0,
                totalLatency: 370,
            };
            const result = await synthesisEngine.synthesize(aggregated, 'consensus');
            expect(result.strategy).toBe('consensus');
            expect(result.synthesizedContent).toContain('answer');
            expect(result.sources).toHaveLength(3);
        });
        it('should synthesize using AI synthesis strategy', async () => {
            const aiEngine = new SynthesisEngine({
                strategy: 'ai_synthesis',
                synthesisProvider: LLMProvider.GEMINI,
                includeSourceAttribution: true,
            });
            const aggregated = {
                responses: testResponses,
                successCount: 3,
                failureCount: 0,
                totalLatency: 370,
            };
            const result = await aiEngine.synthesize(aggregated);
            expect(result.strategy).toBe('ai_synthesis');
            expect(result.confidence).toBe(0.9);
            expect(result.synthesizedContent).toContain('AI Synthesis');
        });
        it('should synthesize using weighted average strategy', async () => {
            const weightedEngine = new SynthesisEngine({
                strategy: 'weighted_average',
                weights: new Map([
                    [LLMProvider.GEMINI, 2],
                    [LLMProvider.OPENAI, 1.5],
                    [LLMProvider.ANTHROPIC, 1],
                ]),
                includeSourceAttribution: true,
            });
            const aggregated = {
                responses: testResponses,
                successCount: 3,
                failureCount: 0,
                totalLatency: 370,
            };
            const result = await weightedEngine.synthesize(aggregated);
            expect(result.strategy).toBe('weighted_average');
            expect(result.sources[0].contribution).toBeCloseTo(2 / 4.5);
            expect(result.synthesizedContent).toContain('[2x]');
            expect(result.synthesizedContent).toContain('[1.5x]');
        });
        it('should synthesize using best-of strategy', async () => {
            const aggregated = {
                responses: testResponses,
                successCount: 3,
                failureCount: 0,
                totalLatency: 370,
            };
            const result = await synthesisEngine.synthesize(aggregated, 'best_of');
            expect(result.strategy).toBe('best_of');
            expect(result.sources).toHaveLength(1);
            expect(result.sources[0].contribution).toBe(1.0);
            expect(result.metadata.selectedProvider).toBeDefined();
        });
        it('should synthesize using detailed comparison strategy', async () => {
            const aggregated = {
                responses: testResponses,
                successCount: 3,
                failureCount: 0,
                totalLatency: 370,
            };
            const result = await synthesisEngine.synthesize(aggregated, 'detailed_comparison');
            expect(result.strategy).toBe('detailed_comparison');
            expect(result.confidence).toBe(1.0);
            expect(result.synthesizedContent).toContain('gemini');
            expect(result.synthesizedContent).toContain('openai');
            expect(result.synthesizedContent).toContain('anthropic');
            expect(result.synthesizedContent).toContain('---');
        });
        it('should handle empty responses gracefully', async () => {
            const emptyAggregated = {
                responses: [],
                successCount: 0,
                failureCount: 0,
                totalLatency: 0,
            };
            const result = await synthesisEngine.synthesize(emptyAggregated, 'consensus');
            expect(result.synthesizedContent).toBe('');
            expect(result.sources).toHaveLength(0);
            expect(result.confidence).toBeLessThanOrEqual(0.3);
        });
        it('should throw error for unknown strategy', async () => {
            const aggregated = {
                responses: testResponses,
                successCount: 3,
                failureCount: 0,
                totalLatency: 370,
            };
            await expect(synthesisEngine.synthesize(aggregated, 'unknown')).rejects.toThrow('Unknown synthesis strategy: unknown');
        });
    });
    describe('End-to-End Convergence Flow', () => {
        it('should complete full convergence workflow', async () => {
            // Setup
            const orchestrator = new MultiProviderOrchestrator({
                providers: [
                    LLMProvider.GEMINI,
                    LLMProvider.OPENAI,
                    LLMProvider.ANTHROPIC,
                ],
                parallelExecution: true,
                timeout: 5000,
            });
            const aggregator = new ResponseAggregator({
                waitForAll: true,
                timeoutMs: 5000,
                minimumResponses: 2,
                includeMetadata: true,
            });
            const synthesisEngine = new SynthesisEngine({
                strategy: 'consensus',
                includeSourceAttribution: true,
            });
            // Execute
            const request = {
                prompt: 'What is the meaning of life?',
                temperature: 0.7,
                maxTokens: 1000,
            };
            const responses = await orchestrator.executeParallel(request);
            const aggregated = await aggregator.aggregate(responses);
            const synthesized = await synthesisEngine.synthesize(aggregated);
            // Assert
            expect(responses).toHaveLength(3);
            expect(aggregated.successCount).toBeGreaterThanOrEqual(2);
            expect(synthesized.synthesizedContent).toBeTruthy();
            expect(synthesized.sources).toHaveLength(aggregated.successCount);
            expect(synthesized.confidence).toBeGreaterThan(0);
        });
    });
});
//# sourceMappingURL=convergence.test.js.map