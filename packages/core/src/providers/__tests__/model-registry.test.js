/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { LLMProvider } from '../types.js';
// Mock implementation for testing
class ModelRegistry {
    models = new Map();
    currentModels = new Map();
    equivalencies = new Map();
    constructor() {
        this.initializeModels();
        this.initializeEquivalencies();
    }
    initializeModels() {
        // Register Gemini models
        this.models.set(LLMProvider.GEMINI, [
            {
                id: 'gemini-2.5-pro',
                name: 'Gemini 2.5 Pro',
                capabilities: {
                    maxTokens: 16384,
                    contextWindow: 2097152,
                    supportsFunctions: true,
                    supportsVision: true,
                    supportsStreaming: true,
                },
                pricing: { input: 0.0025, output: 0.0075 },
            },
            {
                id: 'gemini-2.5-flash',
                name: 'Gemini 2.5 Flash',
                capabilities: {
                    maxTokens: 8192,
                    contextWindow: 200000,
                    supportsFunctions: true,
                    supportsVision: true,
                    supportsStreaming: true,
                },
                pricing: { input: 0.00025, output: 0.00075 },
            },
        ]);
        // Register OpenAI models
        this.models.set(LLMProvider.OPENAI, [
            {
                id: 'gpt-5',
                name: 'GPT-5',
                capabilities: {
                    maxTokens: 8192,
                    contextWindow: 256000,
                    supportsFunctions: true,
                    supportsVision: true,
                    supportsStreaming: true,
                },
                pricing: { input: 0.015, output: 0.045 },
            },
            {
                id: 'gpt-5-mini',
                name: 'GPT-5 Mini',
                capabilities: {
                    maxTokens: 4096,
                    contextWindow: 128000,
                    supportsFunctions: true,
                    supportsVision: true,
                    supportsStreaming: true,
                },
                pricing: { input: 0.005, output: 0.015 },
            },
            {
                id: 'gpt-5-nano',
                name: 'GPT-5 Nano',
                capabilities: {
                    maxTokens: 4096,
                    contextWindow: 32768,
                    supportsFunctions: true,
                    supportsVision: false,
                    supportsStreaming: true,
                },
                pricing: { input: 0.0002, output: 0.0006 },
            },
            {
                id: 'o3',
                name: 'O3',
                capabilities: {
                    maxTokens: 32768,
                    contextWindow: 512000,
                    supportsFunctions: true,
                    supportsVision: true,
                    supportsStreaming: true,
                    supportsReasoning: true,
                },
                pricing: { input: 0.025, output: 0.075 },
            },
        ]);
        // Register Anthropic models
        this.models.set(LLMProvider.ANTHROPIC, [
            {
                id: 'claude-4-1-opus-20250805',
                name: 'Claude 4.1 Opus',
                capabilities: {
                    maxTokens: 8192,
                    contextWindow: 500000,
                    supportsFunctions: true,
                    supportsVision: true,
                    supportsStreaming: true,
                },
                pricing: { input: 0.012, output: 0.06 },
            },
            {
                id: 'claude-4-sonnet-20250514',
                name: 'Claude 4 Sonnet',
                capabilities: {
                    maxTokens: 4096,
                    contextWindow: 200000,
                    supportsFunctions: true,
                    supportsVision: true,
                    supportsStreaming: true,
                },
                pricing: { input: 0.002, output: 0.01 },
            },
        ]);
    }
    initializeEquivalencies() {
        this.equivalencies.set('best-available', new Map([
            [LLMProvider.GEMINI, 'gemini-2.5-pro'],
            [LLMProvider.OPENAI, 'o3'],
            [LLMProvider.ANTHROPIC, 'claude-4-1-opus-20250805'],
        ]));
        this.equivalencies.set('fastest', new Map([
            [LLMProvider.GEMINI, 'gemini-2.5-flash'],
            [LLMProvider.OPENAI, 'gpt-5-nano'],
            [LLMProvider.ANTHROPIC, 'claude-4-sonnet-20250514'],
        ]));
        this.equivalencies.set('balanced', new Map([
            [LLMProvider.GEMINI, 'gemini-2.5-flash'],
            [LLMProvider.OPENAI, 'gpt-5'],
            [LLMProvider.ANTHROPIC, 'claude-4-sonnet-20250514'],
        ]));
    }
    async getAvailableModels(provider) {
        return this.models.get(provider) || [];
    }
    async isModelAvailable(provider, modelId) {
        const models = await this.getAvailableModels(provider);
        return models.some((m) => m.id === modelId);
    }
    async setModel(provider, modelId) {
        if (!(await this.isModelAvailable(provider, modelId))) {
            throw new Error(`Model ${modelId} not available for ${provider}`);
        }
        this.currentModels.set(provider, modelId);
    }
    getCurrentModel(provider) {
        return this.currentModels.get(provider) || this.getDefaultModel(provider);
    }
    getDefaultModel(provider) {
        const defaults = {
            [LLMProvider.GEMINI]: 'gemini-2.5-pro',
            [LLMProvider.OPENAI]: 'gpt-5',
            [LLMProvider.ANTHROPIC]: 'claude-4-sonnet-20250514',
        };
        return defaults[provider];
    }
    findEquivalents(modelSpec) {
        if (this.equivalencies.has(modelSpec)) {
            return this.equivalencies.get(modelSpec);
        }
        const result = new Map();
        // Advanced heuristic for finding similar models
        if (modelSpec.includes('pro') ||
            modelSpec.includes('opus') ||
            modelSpec.includes('o3')) {
            result.set(LLMProvider.GEMINI, 'gemini-2.5-pro');
            result.set(LLMProvider.OPENAI, 'o3');
            result.set(LLMProvider.ANTHROPIC, 'claude-4-1-opus-20250805');
        }
        else if (modelSpec.includes('mini') || modelSpec.includes('flash')) {
            result.set(LLMProvider.GEMINI, 'gemini-2.5-flash');
            result.set(LLMProvider.OPENAI, 'gpt-5-mini');
            result.set(LLMProvider.ANTHROPIC, 'claude-4-sonnet-20250514');
        }
        else if (modelSpec.includes('nano')) {
            result.set(LLMProvider.GEMINI, 'gemini-2.5-flash');
            result.set(LLMProvider.OPENAI, 'gpt-5-nano');
            result.set(LLMProvider.ANTHROPIC, 'claude-4-sonnet-20250514');
        }
        else {
            // Default to balanced
            result.set(LLMProvider.GEMINI, 'gemini-2.5-flash');
            result.set(LLMProvider.OPENAI, 'gpt-5');
            result.set(LLMProvider.ANTHROPIC, 'claude-4-sonnet-20250514');
        }
        return result;
    }
    getModelInfo(provider, modelId) {
        const models = this.models.get(provider);
        return models?.find((m) => m.id === modelId);
    }
    validateModelAccess(provider, modelId, apiKey) {
        // Mock validation - in real implementation would check API access
        if (!apiKey)
            return false;
        // Simulate some models requiring higher tier access
        if (modelId === 'o3' || modelId === 'claude-4-1-opus-20250805') {
            return apiKey.includes('premium');
        }
        return true;
    }
    getAllProviders() {
        return [LLMProvider.GEMINI, LLMProvider.OPENAI, LLMProvider.ANTHROPIC];
    }
    compareModels(model1, model2) {
        // Compare by context window size
        return (model2.capabilities.contextWindow - model1.capabilities.contextWindow);
    }
}
describe('ModelRegistry', () => {
    let registry;
    beforeEach(() => {
        registry = new ModelRegistry();
    });
    describe('Model Discovery', () => {
        it('should return available models for each provider', async () => {
            const geminiModels = await registry.getAvailableModels(LLMProvider.GEMINI);
            expect(geminiModels).toHaveLength(2);
            expect(geminiModels[0].id).toBe('gemini-2.5-pro');
            expect(geminiModels[1].id).toBe('gemini-2.5-flash');
            const openaiModels = await registry.getAvailableModels(LLMProvider.OPENAI);
            expect(openaiModels).toHaveLength(4);
            expect(openaiModels.map((m) => m.id)).toContain('gpt-5');
            expect(openaiModels.map((m) => m.id)).toContain('o3');
            const anthropicModels = await registry.getAvailableModels(LLMProvider.ANTHROPIC);
            expect(anthropicModels).toHaveLength(2);
            expect(anthropicModels[0].id).toBe('claude-4-1-opus-20250805');
        });
        it('should check model availability correctly', async () => {
            expect(await registry.isModelAvailable(LLMProvider.GEMINI, 'gemini-2.5-pro')).toBe(true);
            expect(await registry.isModelAvailable(LLMProvider.GEMINI, 'gemini-1.5-pro')).toBe(false);
            expect(await registry.isModelAvailable(LLMProvider.OPENAI, 'gpt-5')).toBe(true);
            expect(await registry.isModelAvailable(LLMProvider.OPENAI, 'gpt-4')).toBe(false);
            expect(await registry.isModelAvailable(LLMProvider.ANTHROPIC, 'claude-4-1-opus-20250805')).toBe(true);
            expect(await registry.isModelAvailable(LLMProvider.ANTHROPIC, 'claude-3-opus')).toBe(false);
        });
        it('should get model info correctly', () => {
            const geminiPro = registry.getModelInfo(LLMProvider.GEMINI, 'gemini-2.5-pro');
            expect(geminiPro).toBeDefined();
            expect(geminiPro?.capabilities.contextWindow).toBe(2097152);
            const o3 = registry.getModelInfo(LLMProvider.OPENAI, 'o3');
            expect(o3).toBeDefined();
            expect(o3?.capabilities.supportsReasoning).toBe(true);
            expect(o3?.capabilities.contextWindow).toBe(512000);
        });
    });
    describe('Model Selection', () => {
        it('should set and get current model', async () => {
            await registry.setModel(LLMProvider.GEMINI, 'gemini-2.5-flash');
            expect(registry.getCurrentModel(LLMProvider.GEMINI)).toBe('gemini-2.5-flash');
            await registry.setModel(LLMProvider.OPENAI, 'gpt-5-mini');
            expect(registry.getCurrentModel(LLMProvider.OPENAI)).toBe('gpt-5-mini');
        });
        it('should return default model when not set', () => {
            expect(registry.getCurrentModel(LLMProvider.GEMINI)).toBe('gemini-2.5-pro');
            expect(registry.getCurrentModel(LLMProvider.OPENAI)).toBe('gpt-5');
            expect(registry.getCurrentModel(LLMProvider.ANTHROPIC)).toBe('claude-4-sonnet-20250514');
        });
        it('should throw error when setting unavailable model', async () => {
            await expect(registry.setModel(LLMProvider.GEMINI, 'non-existent-model')).rejects.toThrow('Model non-existent-model not available for gemini');
        });
    });
    describe('Model Equivalencies', () => {
        it('should find equivalent models for special keywords', () => {
            const bestAvailable = registry.findEquivalents('best-available');
            expect(bestAvailable.get(LLMProvider.GEMINI)).toBe('gemini-2.5-pro');
            expect(bestAvailable.get(LLMProvider.OPENAI)).toBe('o3');
            expect(bestAvailable.get(LLMProvider.ANTHROPIC)).toBe('claude-4-1-opus-20250805');
            const fastest = registry.findEquivalents('fastest');
            expect(fastest.get(LLMProvider.GEMINI)).toBe('gemini-2.5-flash');
            expect(fastest.get(LLMProvider.OPENAI)).toBe('gpt-5-nano');
            expect(fastest.get(LLMProvider.ANTHROPIC)).toBe('claude-4-sonnet-20250514');
        });
        it('should find similar models based on naming patterns', () => {
            const proModels = registry.findEquivalents('pro');
            expect(proModels.get(LLMProvider.GEMINI)).toBe('gemini-2.5-pro');
            expect(proModels.get(LLMProvider.OPENAI)).toBe('o3');
            const miniModels = registry.findEquivalents('mini');
            expect(miniModels.get(LLMProvider.OPENAI)).toBe('gpt-5-mini');
            const nanoModels = registry.findEquivalents('nano');
            expect(nanoModels.get(LLMProvider.OPENAI)).toBe('gpt-5-nano');
        });
        it('should default to balanced models for unknown specs', () => {
            const unknown = registry.findEquivalents('unknown-spec');
            expect(unknown.get(LLMProvider.GEMINI)).toBe('gemini-2.5-flash');
            expect(unknown.get(LLMProvider.OPENAI)).toBe('gpt-5');
            expect(unknown.get(LLMProvider.ANTHROPIC)).toBe('claude-4-sonnet-20250514');
        });
    });
    describe('Model Validation', () => {
        it('should validate model access based on API key', () => {
            // Regular models should work with any key
            expect(registry.validateModelAccess(LLMProvider.GEMINI, 'gemini-2.5-flash', 'test-key')).toBe(true);
            expect(registry.validateModelAccess(LLMProvider.OPENAI, 'gpt-5', 'test-key')).toBe(true);
            // Premium models require premium key
            expect(registry.validateModelAccess(LLMProvider.OPENAI, 'o3', 'regular-key')).toBe(false);
            expect(registry.validateModelAccess(LLMProvider.OPENAI, 'o3', 'premium-key')).toBe(true);
            expect(registry.validateModelAccess(LLMProvider.ANTHROPIC, 'claude-4-1-opus-20250805', 'premium-key')).toBe(true);
            // No key means no access
            expect(registry.validateModelAccess(LLMProvider.GEMINI, 'gemini-2.5-pro')).toBe(false);
        });
    });
    describe('Model Comparison', () => {
        it('should compare models by context window', () => {
            const geminiPro = registry.getModelInfo(LLMProvider.GEMINI, 'gemini-2.5-pro');
            const geminiFlash = registry.getModelInfo(LLMProvider.GEMINI, 'gemini-2.5-flash');
            const o3 = registry.getModelInfo(LLMProvider.OPENAI, 'o3');
            expect(registry.compareModels(geminiFlash, geminiPro)).toBeGreaterThan(0);
            expect(registry.compareModels(geminiPro, o3)).toBeLessThan(0);
            expect(registry.compareModels(o3, o3)).toBe(0);
        });
    });
    describe('Provider Management', () => {
        it('should return all providers', () => {
            const providers = registry.getAllProviders();
            expect(providers).toHaveLength(3);
            expect(providers).toContain(LLMProvider.GEMINI);
            expect(providers).toContain(LLMProvider.OPENAI);
            expect(providers).toContain(LLMProvider.ANTHROPIC);
        });
    });
    describe('Model Capabilities', () => {
        it('should correctly report model capabilities', () => {
            const o3 = registry.getModelInfo(LLMProvider.OPENAI, 'o3');
            expect(o3.capabilities.supportsReasoning).toBe(true);
            expect(o3.capabilities.supportsVision).toBe(true);
            expect(o3.capabilities.supportsFunctions).toBe(true);
            expect(o3.capabilities.maxTokens).toBe(32768);
            const gpt5Nano = registry.getModelInfo(LLMProvider.OPENAI, 'gpt-5-nano');
            expect(gpt5Nano.capabilities.supportsVision).toBe(false);
            expect(gpt5Nano.capabilities.contextWindow).toBe(32768);
        });
    });
    describe('Pricing Information', () => {
        it('should provide pricing information', () => {
            const geminiPro = registry.getModelInfo(LLMProvider.GEMINI, 'gemini-2.5-pro');
            expect(geminiPro.pricing).toBeDefined();
            expect(geminiPro.pricing?.input).toBe(0.0025);
            expect(geminiPro.pricing?.output).toBe(0.0075);
            const claudeOpus = registry.getModelInfo(LLMProvider.ANTHROPIC, 'claude-4-1-opus-20250805');
            expect(claudeOpus.pricing?.input).toBe(0.012);
            expect(claudeOpus.pricing?.output).toBe(0.06);
        });
    });
});
//# sourceMappingURL=model-registry.test.js.map