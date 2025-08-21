/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Multi-Provider Model Selection - Implementation Example
 *
 * This file demonstrates how the core components work together
 * to enable model selection across all providers.
 */
import { LLMProvider } from '../providers/types';
declare class ModelRegistry {
    private models;
    private currentModels;
    private equivalencies;
    constructor();
    private initializeModels;
    private initializeEquivalencies;
    getAvailableModels(provider: LLMProvider): Promise<ModelInfo[]>;
    isModelAvailable(provider: LLMProvider, modelId: string): Promise<boolean>;
    setModel(provider: LLMProvider, modelId: string): Promise<void>;
    getCurrentModel(provider: LLMProvider): string;
    private getDefaultModel;
    findEquivalents(modelSpec: string): Map<LLMProvider, string>;
}
interface ModelCommandRequest {
    action: 'set' | 'get' | 'list' | 'reset';
    scope: 'global' | 'provider' | 'all';
    provider?: LLMProvider;
    model?: string;
    options?: {
        persist?: boolean;
        validate?: boolean;
        fallback?: string;
    };
}
declare class ModelCommandParser {
    parse(input: string): ModelCommandRequest;
    private parseProviderSpecific;
    private parseProvider;
    private parseListCommand;
    private parseResetCommand;
    private parseGlobalCommand;
}
declare class RuntimeModelManager {
    private registry;
    private providers;
    private config;
    constructor();
    switchModel(provider: LLMProvider, newModel: string): Promise<SwitchResult>;
    switchAllModels(modelSpec: string): Promise<Map<LLMProvider, SwitchResult>>;
    getCurrentConfiguration(): Promise<Map<LLMProvider, ModelInfo>>;
}
declare class ModelCommandExecutor {
    private parser;
    private manager;
    private ui;
    constructor();
    execute(input: string): Promise<void>;
    private handleSet;
    private handleList;
    private handleGet;
    private handleReset;
}
declare class ModelCommandUI {
    showSwitchResult(provider: LLMProvider, result: SwitchResult): void;
    showBatchResults(results: Map<LLMProvider, SwitchResult>): void;
    showProviderModels(provider: LLMProvider, models: ModelInfo[]): void;
    showAllModels(registry: ModelRegistry): void;
    showCurrentConfiguration(config: Map<LLMProvider, ModelInfo>): void;
    showError(message: string): void;
    showMessage(message: string): void;
    private formatTokens;
}
declare class ModelConfigPersistence {
    private configPath;
    private config;
    saveModel(provider: LLMProvider, model: string): Promise<void>;
    load(): Promise<ModelSelectionConfig>;
    save(config: ModelSelectionConfig): Promise<void>;
}
interface ModelInfo {
    id: string;
    name: string;
    capabilities: ModelCapabilities;
    pricing?: {
        input: number;
        output: number;
    };
    deprecated?: boolean;
    successor?: string;
}
interface ModelCapabilities {
    maxTokens: number;
    contextWindow: number;
    supportsFunctions: boolean;
    supportsVision: boolean;
    supportsStreaming: boolean;
}
interface SwitchResult {
    success: boolean;
    previousModel?: string;
    currentModel?: string;
    error?: string;
}
interface ModelSelectionConfig {
    models: Record<LLMProvider, string>;
    defaults: Record<LLMProvider, string>;
    preferences: {
        autoSelectBest: boolean;
        preferLatestModels: boolean;
        costOptimization: 'performance' | 'balanced' | 'economical';
        validateOnStartup: boolean;
        showModelWarnings: boolean;
    };
    aliases: Record<string, {
        provider: LLMProvider;
        model: string;
    }>;
    history: {
        enabled: boolean;
        recentModels: Array<{
            provider: LLMProvider;
            model: string;
            timestamp: Date;
            reason?: string;
        }>;
        maxHistorySize: number;
    };
}
export { ModelRegistry, ModelCommandParser, RuntimeModelManager, ModelCommandExecutor, ModelCommandUI, ModelConfigPersistence, };
