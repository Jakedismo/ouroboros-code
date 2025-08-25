/**
 * @license
 * Copyright 2025 Ouroboros
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Cache statistics for OpenAI automatic prompt caching
 */
export interface OpenAICacheStats {
  totalRequests: number;
  cachedTokensUsed: number; // From cached_tokens in usage
  totalInputTokens: number;
  totalOutputTokens: number;
  cacheHitRate: number;
  estimatedCostSavings: number; // 50% savings on cached input tokens
  averageLatencyReduction: number; // Estimated latency improvement
}

/**
 * OpenAI model configurations for prompt caching
 */
export const OPENAI_CACHE_MODELS = {
  'gpt-5': {
    minimumTokens: 1024,
    cacheIncrements: 128,
    maxCacheReduction: 0.8, // Up to 80% latency reduction
    costSavings: 0.5, // 50% cost savings on cached tokens
    baseInputCostPer1M: 15.0, // Base cost per 1M input tokens
  },
  'gpt-4o': {
    minimumTokens: 1024,
    cacheIncrements: 128,
    maxCacheReduction: 0.8,
    costSavings: 0.5,
    baseInputCostPer1M: 5.0,
  },
  'gpt-4o-mini': {
    minimumTokens: 1024,
    cacheIncrements: 128,
    maxCacheReduction: 0.8,
    costSavings: 0.5,
    baseInputCostPer1M: 0.15,
  },
  'o1-preview': {
    minimumTokens: 1024,
    cacheIncrements: 128,
    maxCacheReduction: 0.8,
    costSavings: 0.5,
    baseInputCostPer1M: 15.0,
  },
  'o1-mini': {
    minimumTokens: 1024,
    cacheIncrements: 128,
    maxCacheReduction: 0.8,
    costSavings: 0.5,
    baseInputCostPer1M: 3.0,
  },
} as const;

/**
 * Manager for OpenAI automatic prompt caching
 * Tracks cache usage and provides optimization insights
 */
export class OpenAIPromptCacheManager {
  private stats: {
    requests: number;
    totalCachedTokens: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    latencyMeasurements: number[];
  } = {
    requests: 0,
    totalCachedTokens: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    latencyMeasurements: [],
  };

  constructor(private model: string) {}

  /**
   * Update statistics from OpenAI API response
   * @param usage - Usage information from the API response
   * @param latency - Request latency in milliseconds
   */
  updateStats(usage: any, latency?: number): void {
    this.stats.requests++;

    if (usage) {
      // OpenAI includes cached_tokens in the usage response
      if (usage.cached_tokens) {
        this.stats.totalCachedTokens += usage.cached_tokens;
      }

      if (usage.prompt_tokens || usage.input_tokens) {
        this.stats.totalInputTokens += usage.prompt_tokens || usage.input_tokens || 0;
      }

      if (usage.completion_tokens || usage.output_tokens) {
        this.stats.totalOutputTokens += usage.completion_tokens || usage.output_tokens || 0;
      }
    }

    if (latency !== undefined) {
      this.stats.latencyMeasurements.push(latency);
      // Keep only last 100 measurements for rolling average
      if (this.stats.latencyMeasurements.length > 100) {
        this.stats.latencyMeasurements.shift();
      }
    }
  }

  /**
   * Get current cache statistics
   */
  getCacheStats(): OpenAICacheStats {
    const cacheHitRate = this.stats.totalInputTokens > 0 
      ? this.stats.totalCachedTokens / this.stats.totalInputTokens 
      : 0;

    const modelConfig = this.getModelConfig();
    const costSavingsPerToken = (modelConfig.baseInputCostPer1M / 1000000) * modelConfig.costSavings;
    const estimatedCostSavings = this.stats.totalCachedTokens * costSavingsPerToken;

    // Estimate average latency reduction based on cache hit rate
    const averageLatencyReduction = cacheHitRate * modelConfig.maxCacheReduction;

    return {
      totalRequests: this.stats.requests,
      cachedTokensUsed: this.stats.totalCachedTokens,
      totalInputTokens: this.stats.totalInputTokens,
      totalOutputTokens: this.stats.totalOutputTokens,
      cacheHitRate,
      estimatedCostSavings,
      averageLatencyReduction,
    };
  }

  /**
   * Get cache optimization recommendations
   */
  getOptimizationRecommendations(): string[] {
    const stats = this.getCacheStats();
    const modelConfig = this.getModelConfig();
    const recommendations: string[] = [];

    // Check if prompts are long enough for caching
    const avgInputTokens = stats.totalInputTokens / Math.max(stats.totalRequests, 1);
    if (avgInputTokens < modelConfig.minimumTokens) {
      recommendations.push(
        `Consider using longer prompts (>${modelConfig.minimumTokens} tokens) to benefit from automatic caching`
      );
    }

    // Check cache hit rate
    if (stats.cacheHitRate < 0.1 && stats.totalRequests > 10) {
      recommendations.push(
        'Low cache hit rate detected. Consider reusing similar prompt prefixes across requests'
      );
    }

    // Recommend prompt structure optimization
    if (stats.cacheHitRate > 0 && stats.cacheHitRate < 0.5) {
      recommendations.push(
        'Optimize prompt structure by placing stable content (instructions, examples) at the beginning'
      );
    }

    // Large prompts performance tip
    if (avgInputTokens > 10000) {
      recommendations.push(
        'Large prompts detected. Caching can provide up to 80% latency reduction for repeated content'
      );
    }

    return recommendations;
  }

  /**
   * Get cache efficiency insights
   */
  getCacheEfficiencyInsights(): {
    efficiency: 'excellent' | 'good' | 'fair' | 'poor';
    description: string;
    metrics: {
      hitRate: number;
      tokensSaved: number;
      costSavings: number;
      latencyImprovement: number;
    };
  } {
    const stats = this.getCacheStats();
    
    let efficiency: 'excellent' | 'good' | 'fair' | 'poor';
    let description: string;

    if (stats.cacheHitRate >= 0.7) {
      efficiency = 'excellent';
      description = 'High cache hit rate indicates optimal prompt structure and reuse patterns';
    } else if (stats.cacheHitRate >= 0.4) {
      efficiency = 'good';
      description = 'Good cache utilization with room for optimization';
    } else if (stats.cacheHitRate >= 0.1) {
      efficiency = 'fair';
      description = 'Moderate cache usage - consider optimizing prompt structure';
    } else {
      efficiency = 'poor';
      description = 'Low cache utilization - prompts may be too short or too variable';
    }

    return {
      efficiency,
      description,
      metrics: {
        hitRate: stats.cacheHitRate,
        tokensSaved: stats.cachedTokensUsed,
        costSavings: stats.estimatedCostSavings,
        latencyImprovement: stats.averageLatencyReduction,
      },
    };
  }

  /**
   * Reset all statistics
   */
  resetStats(): void {
    this.stats = {
      requests: 0,
      totalCachedTokens: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      latencyMeasurements: [],
    };
  }

  /**
   * Get model-specific cache configuration
   */
  private getModelConfig() {
    // Find matching model configuration
    const modelKey = Object.keys(OPENAI_CACHE_MODELS).find(key =>
      this.model.toLowerCase().includes(key.toLowerCase())
    );

    return modelKey 
      ? OPENAI_CACHE_MODELS[modelKey as keyof typeof OPENAI_CACHE_MODELS]
      : OPENAI_CACHE_MODELS['gpt-4o']; // Default fallback
  }

  /**
   * Check if model supports automatic prompt caching
   */
  static isModelSupported(model: string): boolean {
    const supportedModels = [
      'gpt-5',
      'gpt-4o',
      'gpt-4o-mini',
      'o1-preview',
      'o1-mini',
    ];

    return supportedModels.some(supportedModel => 
      model.toLowerCase().includes(supportedModel.toLowerCase())
    );
  }

  /**
   * Get cache readiness assessment for a prompt
   * @param prompt - The prompt text to assess
   */
  static assessPromptCacheReadiness(prompt: string): {
    isReady: boolean;
    estimatedTokens: number;
    readinessLevel: 'excellent' | 'good' | 'fair' | 'poor';
    suggestions: string[];
  } {
    // Rough token estimation (4 characters per token for English)
    const estimatedTokens = Math.ceil(prompt.length / 4);
    const suggestions: string[] = [];
    
    let isReady = estimatedTokens >= 1024;
    let readinessLevel: 'excellent' | 'good' | 'fair' | 'poor';

    if (estimatedTokens >= 5000) {
      readinessLevel = 'excellent';
    } else if (estimatedTokens >= 2000) {
      readinessLevel = 'good';
    } else if (estimatedTokens >= 1024) {
      readinessLevel = 'fair';
      suggestions.push('Consider adding more context or examples to increase cache benefit');
    } else {
      readinessLevel = 'poor';
      isReady = false;
      suggestions.push('Prompt is too short for caching (minimum 1024 tokens)');
      suggestions.push('Consider combining multiple related prompts or adding detailed instructions');
    }

    // Analyze prompt structure
    const lines = prompt.split('\n');
    const hasStructure = lines.some(line => 
      line.trim().startsWith('#') || 
      line.trim().startsWith('Instructions:') ||
      line.trim().startsWith('Examples:')
    );

    if (!hasStructure && estimatedTokens > 1024) {
      suggestions.push('Consider adding clear sections (instructions, examples) for better cache reuse');
    }

    return {
      isReady,
      estimatedTokens,
      readinessLevel,
      suggestions,
    };
  }

  /**
   * Get detailed cache performance report
   */
  getPerformanceReport(): {
    summary: string;
    metrics: OpenAICacheStats;
    efficiency: ReturnType<OpenAIPromptCacheManager['getCacheEfficiencyInsights']>;
    recommendations: string[];
    modelInfo: {
      model: string;
      supportsCaching: boolean;
      minimumTokens: number;
    };
  } {
    const stats = this.getCacheStats();
    const efficiency = this.getCacheEfficiencyInsights();
    const recommendations = this.getOptimizationRecommendations();
    const modelConfig = this.getModelConfig();

    let summary = `Processed ${stats.totalRequests} requests with ${(stats.cacheHitRate * 100).toFixed(1)}% cache hit rate. `;
    summary += `Saved ${stats.cachedTokensUsed.toLocaleString()} tokens and $${stats.estimatedCostSavings.toFixed(4)} in costs. `;
    summary += `Average latency reduction: ${(stats.averageLatencyReduction * 100).toFixed(1)}%.`;

    return {
      summary,
      metrics: stats,
      efficiency,
      recommendations,
      modelInfo: {
        model: this.model,
        supportsCaching: OpenAIPromptCacheManager.isModelSupported(this.model),
        minimumTokens: modelConfig.minimumTokens,
      },
    };
  }
}