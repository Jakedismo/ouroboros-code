/**
 * @license
 * Copyright 2025 Ouroboros
 * SPDX-License-Identifier: Apache-2.0
 */

import { LLMProviderFactory } from './factory.js';
import { LLMProvider } from './types.js';

/**
 * Demonstration of prompt caching functionality for both OpenAI and Anthropic providers
 */
export class PromptCacheDemo {
  
  /**
   * Demonstrate Anthropic prompt caching configuration
   */
  static demonstrateAnthropicCaching() {
    console.log('🔧 Anthropic Prompt Caching Configuration:\n');

    const config = {
      provider: LLMProvider.ANTHROPIC,
      model: 'claude-4-sonnet-20250514',
      apiKey: 'your-anthropic-api-key',
      promptCaching: {
        enabled: true,
        cacheType: 'ephemeral' as const,
        cacheTTL: 60, // 1 hour (extended TTL)
        autoBreakpoints: true, // Automatically optimize cache breakpoints
        cacheBreakpoints: [0], // Manually specify cache breakpoint at first message
      },
    };

    console.log('Configuration:');
    console.log(JSON.stringify(config, null, 2));

    console.log('\n💡 Key Features:');
    console.log('• 📌 Cache breakpoints: Marked with cache_control metadata');
    console.log('• ⏰ TTL options: 5 minutes (default) or 60 minutes (extended)'); 
    console.log('• 🎯 Auto-optimization: Intelligent breakpoint placement');
    console.log('• 💰 Cost savings: Up to 90% reduction on cached content');
    console.log('• ⚡ Latency: Up to 85% reduction for repeated content');

    console.log('\n🔍 How it works:');
    console.log('1. System messages are marked as cacheable');
    console.log('2. Long conversation history gets cached');
    console.log('3. API includes anthropic-beta: prompt-caching-2024-07-31 header');
    console.log('4. Usage statistics track cache reads/writes/misses\n');
  }

  /**
   * Demonstrate OpenAI automatic prompt caching
   */
  static demonstrateOpenAICaching() {
    console.log('🔧 OpenAI Automatic Prompt Caching Configuration:\n');

    const config = {
      provider: LLMProvider.OPENAI,
      model: 'gpt-5',
      apiKey: 'your-openai-api-key',
      promptCaching: {
        enabled: true, // Enables cache tracking and insights
        minimumTokens: 1024, // Automatic caching threshold (read-only)
      },
    };

    console.log('Configuration:');
    console.log(JSON.stringify(config, null, 2));

    console.log('\n💡 Key Features:');
    console.log('• 🔄 Fully automatic: No configuration needed, works out of the box');
    console.log('• 📏 Token threshold: Caches prompts >1024 tokens automatically');
    console.log('• 🎯 Smart caching: 128-token increments for optimal efficiency');
    console.log('• 💰 Cost savings: 50% reduction on cached input tokens');
    console.log('• ⚡ Latency: Up to 80% reduction for long prompts (>10k tokens)');

    console.log('\n🔍 How it works:');
    console.log('1. OpenAI automatically detects repeated prompt prefixes');
    console.log('2. Caching activates for prompts longer than 1024 tokens');
    console.log('3. Cache hits occur on 128-token boundaries');
    console.log('4. Usage response includes cached_tokens field');
    console.log('5. Our system tracks efficiency and provides insights\n');
  }

  /**
   * Create sample provider instances to demonstrate caching setup
   */
  static async createSampleProviders() {
    console.log('🏗️ Creating sample provider instances...\n');

    try {
      // Anthropic with caching
      console.log('Creating Anthropic provider with caching...');
      const anthropicProvider = await LLMProviderFactory.create({
        provider: LLMProvider.ANTHROPIC,
        model: 'claude-4-sonnet-20250514',
        apiKey: process.env['ANTHROPIC_API_KEY'] || 'test-key',
        promptCaching: {
          enabled: true,
          cacheTTL: 5,
          autoBreakpoints: true,
        },
      });

      console.log('✅ Anthropic provider created');
      if ('isCachingEnabled' in anthropicProvider) {
        console.log('   Caching enabled:', (anthropicProvider as any).isCachingEnabled());
      }
      if ('isCachingSupported' in anthropicProvider) {
        console.log('   Caching supported:', (anthropicProvider as any).isCachingSupported());
      }

      // OpenAI with caching
      console.log('\nCreating OpenAI provider with caching...');
      const openaiProvider = await LLMProviderFactory.create({
        provider: LLMProvider.OPENAI,
        model: 'gpt-4o',
        apiKey: process.env['OPENAI_API_KEY'] || 'test-key',
        promptCaching: {
          enabled: true,
        },
      });

      console.log('✅ OpenAI provider created');
      if ('isCachingEnabled' in openaiProvider) {
        console.log('   Caching enabled:', (openaiProvider as any).isCachingEnabled());
      }
      if ('isCachingSupported' in openaiProvider) {
        console.log('   Caching supported:', (openaiProvider as any).isCachingSupported());
      }

      console.log('\n🎯 Providers ready for caching-optimized requests!');
      return { anthropicProvider, openaiProvider };

    } catch (error) {
      console.error('❌ Failed to create providers:', error);
      return null;
    }
  }

  /**
   * Show cache optimization tips
   */
  static showOptimizationTips() {
    console.log('💡 Prompt Caching Optimization Tips:\n');

    console.log('🎯 For Anthropic (Manual Caching):');
    console.log('• Place system instructions and examples early in conversation');
    console.log('• Use cache breakpoints after stable content (system messages)');
    console.log('• Enable auto-breakpoints for intelligent optimization');
    console.log('• Use extended TTL (60 min) for long-lived contexts');
    console.log('• Monitor cache hit rates via getCacheStats()');

    console.log('\n🎯 For OpenAI (Automatic Caching):');
    console.log('• Structure prompts with consistent prefixes >1024 tokens');
    console.log('• Place variable content at the end of prompts');
    console.log('• Group similar requests to maximize cache reuse');
    console.log('• Monitor cached_tokens in API responses');
    console.log('• Use getCacheInsights() for optimization recommendations');

    console.log('\n📊 Common Best Practices:');
    console.log('• Track cache efficiency metrics regularly');
    console.log('• Reset statistics periodically for fresh insights'); 
    console.log('• Design prompts with caching in mind from the start');
    console.log('• Test different prompt structures for optimal caching\n');
  }

  /**
   * Run the complete demonstration
   */
  static async runDemo() {
    console.log('🚀 Prompt Caching Feature Demonstration\n');
    console.log('=' .repeat(50));

    this.demonstrateAnthropicCaching();
    console.log('=' .repeat(50));
    
    this.demonstrateOpenAICaching();
    console.log('=' .repeat(50));

    await this.createSampleProviders();
    console.log('=' .repeat(50));

    this.showOptimizationTips();
    console.log('=' .repeat(50));

    console.log('✅ Demonstration complete!');
    console.log('\n🎉 Prompt caching is now implemented for both providers!');
    console.log('📚 Ready to reduce costs and improve performance with intelligent caching.');
  }
}

// Export for use and run demo immediately
PromptCacheDemo.runDemo().catch(console.error);