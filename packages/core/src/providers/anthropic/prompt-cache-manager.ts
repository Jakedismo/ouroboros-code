/**
 * @license
 * Copyright 2025 Ouroboros
 * SPDX-License-Identifier: Apache-2.0
 */

import { UnifiedMessage } from '../types.js';

/**
 * Cache breakpoint configuration for Anthropic prompt caching
 */
export interface CacheBreakpoint {
  messageIndex: number; // Index of message to mark as cached
  type: 'ephemeral'; // Currently only ephemeral is supported
  ttl?: number; // Time-to-live in minutes (5 or 60)
}

/**
 * Cache statistics for monitoring and optimization
 */
export interface CacheStats {
  cacheWrites: number; // Number of cache writes
  cacheReads: number; // Number of cache reads  
  cacheMisses: number; // Number of cache misses
  totalTokensSaved: number; // Total tokens saved through caching
  costSavings: number; // Estimated cost savings in dollars
}

/**
 * Default cache configuration for different models
 */
export const ANTHROPIC_CACHE_DEFAULTS = {
  'claude-4-1-opus-20250508': {
    minimumTokens: 1024,
    defaultTTL: 5, // 5 minutes
    extendedTTL: 60, // 1 hour (GA)
  },
  'claude-4-sonnet-20250514': {
    minimumTokens: 1024,
    defaultTTL: 5,
    extendedTTL: 60,
  },
  'claude-3-5-sonnet-20241022': {
    minimumTokens: 1024,
    defaultTTL: 5,
    extendedTTL: 60,
  },
  'claude-3-5-haiku-20241022': {
    minimumTokens: 2048,
    defaultTTL: 5,
    extendedTTL: 60,
  },
  'claude-3-haiku-20240307': {
    minimumTokens: 2048,
    defaultTTL: 5,
    extendedTTL: 60,
  },
} as const;

/**
 * Manager for Anthropic prompt caching functionality
 * Handles cache breakpoint placement and optimization
 */
export class AnthropicPromptCacheManager {
  private cacheStats: CacheStats = {
    cacheWrites: 0,
    cacheReads: 0,
    cacheMisses: 0,
    totalTokensSaved: 0,
    costSavings: 0,
  };

  constructor(
    private model: string,
    private enableExtendedTTL: boolean = true
  ) {}

  /**
   * Add cache breakpoints to messages for optimal caching
   * @param messages - Array of unified messages
   * @param breakpoints - Optional specific breakpoints to use
   * @param autoOptimize - Whether to automatically optimize breakpoint placement
   */
  addCacheBreakpoints(
    messages: UnifiedMessage[],
    breakpoints?: CacheBreakpoint[],
    autoOptimize: boolean = true
  ): UnifiedMessage[] {
    const modelConfig = this.getModelConfig();
    
    if (breakpoints && breakpoints.length > 0) {
      return this.applyCacheBreakpoints(messages, breakpoints);
    }

    if (autoOptimize) {
      return this.optimizeCacheBreakpoints(messages, modelConfig);
    }

    // Default: add cache breakpoint to last system message or first long message
    return this.addDefaultCacheBreakpoint(messages, modelConfig);
  }

  /**
   * Apply specific cache breakpoints to messages
   */
  private applyCacheBreakpoints(
    messages: UnifiedMessage[],
    breakpoints: CacheBreakpoint[]
  ): UnifiedMessage[] {
    const result = [...messages];

    breakpoints.forEach(breakpoint => {
      if (breakpoint.messageIndex >= 0 && breakpoint.messageIndex < result.length) {
        result[breakpoint.messageIndex] = {
          ...result[breakpoint.messageIndex],
          cache_control: {
            type: breakpoint.type,
            ...(breakpoint.ttl && { ttl: breakpoint.ttl })
          }
        } as any;
      }
    });

    return result;
  }

  /**
   * Automatically optimize cache breakpoint placement
   * Places breakpoints at optimal positions to maximize cache efficiency
   */
  private optimizeCacheBreakpoints(
    messages: UnifiedMessage[],
    modelConfig: { minimumTokens: number; defaultTTL: number; extendedTTL: number }
  ): UnifiedMessage[] {
    const result = [...messages];
    let tokenCount = 0;

    // Find optimal breakpoint positions
    const breakpointPositions: number[] = [];

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const messageTokens = this.estimateTokenCount(message);
      tokenCount += messageTokens;

      // Add breakpoint at system messages (usually contain instructions)
      if (message.role === 'system' && tokenCount >= modelConfig.minimumTokens) {
        breakpointPositions.push(i);
        continue;
      }

      // Add breakpoint before user messages if we have enough tokens
      if (message.role === 'user' && tokenCount >= modelConfig.minimumTokens * 2) {
        // Add breakpoint to previous message to cache conversation history
        if (i > 0) {
          breakpointPositions.push(i - 1);
        }
      }

      // Add breakpoint at long assistant messages (likely contain examples/context)
      if (message.role === 'assistant' && messageTokens >= modelConfig.minimumTokens) {
        breakpointPositions.push(i);
      }
    }

    // Apply cache breakpoints with appropriate TTL
    breakpointPositions.forEach((position, index) => {
      const isLastBreakpoint = index === breakpointPositions.length - 1;
      const ttl = this.enableExtendedTTL && !isLastBreakpoint 
        ? modelConfig.extendedTTL 
        : modelConfig.defaultTTL;

      result[position] = {
        ...result[position],
        cache_control: {
          type: 'ephemeral',
          ...(ttl !== modelConfig.defaultTTL && { ttl })
        }
      } as any;
    });

    return result;
  }

  /**
   * Add default cache breakpoint to the most suitable message
   */
  private addDefaultCacheBreakpoint(
    messages: UnifiedMessage[],
    modelConfig: { minimumTokens: number; defaultTTL: number; extendedTTL: number }
  ): UnifiedMessage[] {
    const result = [...messages];

    // Find the last system message or first long user message
    let breakpointIndex = -1;
    let maxTokens = 0;

    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      const tokens = this.estimateTokenCount(message);

      if (message.role === 'system') {
        breakpointIndex = i;
        break;
      }

      if (tokens > maxTokens && tokens >= modelConfig.minimumTokens) {
        maxTokens = tokens;
        breakpointIndex = i;
      }
    }

    if (breakpointIndex >= 0) {
      const ttl = this.enableExtendedTTL ? modelConfig.extendedTTL : modelConfig.defaultTTL;
      
      result[breakpointIndex] = {
        ...result[breakpointIndex],
        cache_control: {
          type: 'ephemeral',
          ...(ttl !== modelConfig.defaultTTL && { ttl })
        }
      } as any;
    }

    return result;
  }

  /**
   * Estimate token count for a message
   * Simple estimation based on character count
   */
  private estimateTokenCount(message: UnifiedMessage): number {
    let text = '';
    
    if (typeof message.content === 'string') {
      text = message.content;
    } else if (Array.isArray(message.content)) {
      text = message.content
        .filter((part): part is { text: string } => 'text' in part)
        .map(part => part.text)
        .join('');
    }

    // Rough estimation: ~3.5 characters per token for Claude
    return Math.ceil(text.length / 3.5);
  }

  /**
   * Get model-specific cache configuration
   */
  private getModelConfig() {
    const config = ANTHROPIC_CACHE_DEFAULTS[this.model as keyof typeof ANTHROPIC_CACHE_DEFAULTS];
    return config || ANTHROPIC_CACHE_DEFAULTS['claude-4-sonnet-20250514'];
  }

  /**
   * Update cache statistics from API response
   */
  updateCacheStats(usage: any): void {
    if (!usage) return;

    // Anthropic provides cache usage in the response
    if (usage.cache_creation_input_tokens) {
      this.cacheStats.cacheWrites += usage.cache_creation_input_tokens;
    }

    if (usage.cache_read_input_tokens) {
      this.cacheStats.cacheReads += usage.cache_read_input_tokens;
      this.cacheStats.totalTokensSaved += usage.cache_read_input_tokens;
      
      // Estimate cost savings (10% of base input token price for cache reads)
      // Base price ~$3 per million input tokens for Claude 4 Sonnet
      const basePricePerToken = 3 / 1000000;
      const cacheReadDiscount = 0.9; // 90% discount
      this.cacheStats.costSavings += usage.cache_read_input_tokens * basePricePerToken * cacheReadDiscount;
    }

    // Cache miss if we expected a cache read but didn't get one
    if (!usage.cache_read_input_tokens && this.shouldHaveCacheHit()) {
      this.cacheStats.cacheMisses++;
    }
  }

  /**
   * Check if we should have had a cache hit based on recent requests
   * Simple heuristic - can be improved with actual request tracking
   */
  private shouldHaveCacheHit(): boolean {
    // If we've had cache writes recently, subsequent requests should hit
    return this.cacheStats.cacheWrites > 0;
  }

  /**
   * Get current cache statistics
   */
  getCacheStats(): CacheStats {
    return { ...this.cacheStats };
  }

  /**
   * Reset cache statistics
   */
  resetCacheStats(): void {
    this.cacheStats = {
      cacheWrites: 0,
      cacheReads: 0,
      cacheMisses: 0,
      totalTokensSaved: 0,
      costSavings: 0,
    };
  }

  /**
   * Get cache efficiency metrics
   */
  getCacheEfficiency(): {
    hitRate: number;
    missRate: number;
    tokenSavingRate: number;
    estimatedCostSavings: number;
  } {
    const totalRequests = this.cacheStats.cacheReads + this.cacheStats.cacheMisses;
    const hitRate = totalRequests > 0 ? this.cacheStats.cacheReads / totalRequests : 0;
    const missRate = totalRequests > 0 ? this.cacheStats.cacheMisses / totalRequests : 0;
    const totalTokensProcessed = this.cacheStats.totalTokensSaved + this.cacheStats.cacheWrites;
    const tokenSavingRate = totalTokensProcessed > 0 ? this.cacheStats.totalTokensSaved / totalTokensProcessed : 0;

    return {
      hitRate,
      missRate,
      tokenSavingRate,
      estimatedCostSavings: this.cacheStats.costSavings,
    };
  }

  /**
   * Check if model supports prompt caching
   */
  static isModelSupported(model: string): boolean {
    const supportedModels = [
      'claude-4-1-opus-20250508',
      'claude-4-sonnet-20250514', 
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-haiku-20240307',
      'claude-3-opus-20240229' // deprecated but supported
    ];

    return supportedModels.some(supportedModel => 
      model.includes(supportedModel) || model.includes(supportedModel.replace(/\d{4}-\d{2}-\d{2}/, ''))
    );
  }

  /**
   * Get recommended cache configuration for a model
   */
  static getRecommendedConfig(model: string): {
    enabled: boolean;
    minimumTokens: number;
    defaultTTL: number;
    extendedTTL: number;
  } {
    const config = ANTHROPIC_CACHE_DEFAULTS[model as keyof typeof ANTHROPIC_CACHE_DEFAULTS];
    const fallback = ANTHROPIC_CACHE_DEFAULTS['claude-4-sonnet-20250514'];

    return {
      enabled: AnthropicPromptCacheManager.isModelSupported(model),
      minimumTokens: config?.minimumTokens || fallback.minimumTokens,
      defaultTTL: config?.defaultTTL || fallback.defaultTTL,
      extendedTTL: config?.extendedTTL || fallback.extendedTTL,
    };
  }
}