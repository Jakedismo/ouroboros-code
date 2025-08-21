/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';

/**
 * Integration tests for slash command features
 *
 * Tests cover:
 * - /model command with all variations
 * - /converge command for multi-provider synthesis
 * - /compare command for side-by-side comparison
 * - /race command for fastest response
 * - /vote command for democratic decision
 * - /debate command for provider discussions
 */
describe('Slash Commands Integration Tests', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  describe('/model Command', () => {
    describe('Basic Model Selection', () => {
      it('should set model for current provider', async () => {
        rig.setup('model-basic');

        const result = await rig.run('/model gpt-5');

        expect(result).toContain('Model updated');
        expect(result.toLowerCase()).toMatch(/gpt-5|model.*set/);
      });

      it('should set model with provider prefix', async () => {
        rig.setup('model-provider-specific');

        const result = await rig.run('/model openai:gpt-5-mini');

        expect(result).toContain('OpenAI');
        expect(result).toMatch(/gpt-5-mini/);
      });

      it('should set model with --provider flag', async () => {
        rig.setup('model-provider-flag');

        const result = await rig.run(
          '/model claude-4-1-opus-20250805 --provider anthropic',
        );

        expect(result).toContain('Anthropic');
        expect(result).toContain('claude-4-1-opus');
      });
    });

    describe('Global Model Selection', () => {
      it('should set same model for all providers', async () => {
        rig.setup('model-global');

        const result = await rig.run('/model --all best-available');

        expect(result).toContain('gemini-2.5-pro');
        expect(result).toContain('o3');
        expect(result).toContain('claude-4-1-opus');
        expect(result.toLowerCase()).toMatch(/all providers|updated.*all/);
      });

      it('should handle fastest model selection', async () => {
        rig.setup('model-fastest');

        const result = await rig.run('/model --all fastest');

        expect(result).toContain('gemini-2.5-flash');
        expect(result).toContain('gpt-5-nano');
        expect(result).toContain('claude-4-sonnet');
      });

      it('should set multiple models at once', async () => {
        rig.setup('model-multiple');

        const result = await rig.run(
          '/model gemini:gemini-2.5-pro openai:gpt-5 anthropic:claude-4-sonnet-20250514',
        );

        expect(result).toMatch(/gemini.*2\.5.*pro/i);
        expect(result).toMatch(/openai.*gpt-5/i);
        expect(result).toMatch(/anthropic.*claude.*4.*sonnet/i);
      });
    });

    describe('Model Discovery', () => {
      it('should list all available models', async () => {
        rig.setup('model-list-all');

        const result = await rig.run('/model --list');

        // Check Gemini models
        expect(result).toContain('Gemini');
        expect(result).toContain('gemini-2.5-pro');
        expect(result).toContain('gemini-2.5-flash');
        expect(result).toMatch(/2M.*context|2097152/);

        // Check OpenAI models
        expect(result).toContain('OpenAI');
        expect(result).toContain('gpt-5');
        expect(result).toContain('o3');
        expect(result).toMatch(/512K.*context|512000/);

        // Check Anthropic models
        expect(result).toContain('Anthropic');
        expect(result).toContain('claude-4-1-opus');
        expect(result).toContain('claude-4-sonnet');
      });

      it('should list models for specific provider', async () => {
        rig.setup('model-list-provider');

        const result = await rig.run('/model --list openai');

        expect(result).toContain('OpenAI');
        expect(result).toContain('gpt-5');
        expect(result).toContain('gpt-5-mini');
        expect(result).toContain('gpt-5-nano');
        expect(result).toContain('o3');
        expect(result).not.toContain('gemini');
        expect(result).not.toContain('claude');
      });

      it('should show current model configuration', async () => {
        rig.setup('model-show');

        const result = await rig.run('/model --show');

        expect(result).toMatch(/current.*model|configuration/i);
        expect(result).toContain('Provider');
        expect(result).toContain('Model');
        expect(result).toContain('Context');
      });
    });

    describe('Model Validation', () => {
      it('should validate model availability', async () => {
        rig.setup('model-validate');

        const result = await rig.run('/model --validate gpt-5');

        expect(result).toMatch(/available|valid|✓|✅/);
      });

      it('should handle invalid model gracefully', async () => {
        rig.setup('model-invalid');

        const result = await rig.run('/model non-existent-model');

        expect(result).toMatch(/not found|not available|invalid|error/i);
        expect(result).toMatch(/suggestion|try|available models/i);
      });

      it('should suggest similar models on typo', async () => {
        rig.setup('model-typo');

        const result = await rig.run('/model gpt-5-miny'); // typo: miny instead of mini

        expect(result).toMatch(/did you mean|similar|gpt-5-mini/i);
      });
    });

    describe('Model Reset', () => {
      it('should reset all models to defaults', async () => {
        rig.setup('model-reset-all');

        // First change models
        await rig.run('/model --all fastest');

        // Then reset
        const result = await rig.run('/model --reset');

        expect(result).toMatch(/reset|default|restored/i);
      });

      it('should reset specific provider to default', async () => {
        rig.setup('model-reset-provider');

        // Change model
        await rig.run('/model openai:gpt-5-nano');

        // Reset OpenAI
        const result = await rig.run('/model --reset openai');

        expect(result).toContain('OpenAI');
        expect(result).toMatch(/reset|default/i);
      });
    });
  });

  describe('/converge Command', () => {
    it('should synthesize responses from all providers', async () => {
      rig.setup('converge-basic');

      const result = await rig.run('/converge What is the capital of France?');

      expect(result).toMatch(/paris/i);
      expect(result).toMatch(/converged|synthesis|combined/i);
      expect(result).toMatch(/confidence|consensus/i);

      // Should indicate all providers were used
      expect(result.toLowerCase()).toMatch(
        /gemini.*openai.*anthropic|all providers/,
      );
    });

    it('should support custom synthesis strategy', async () => {
      rig.setup('converge-strategy');

      const result = await rig.run(
        '/converge --strategy voting What is 2 + 2?',
      );

      expect(result).toContain('4');
      expect(result).toMatch(/voting|vote/i);
    });

    it('should work with model overrides', async () => {
      rig.setup('converge-models');

      const result = await rig.run(
        '/converge --models gemini:gemini-2.5-flash,openai:gpt-5-nano Explain recursion briefly',
      );

      expect(result).toMatch(/recursion|recursive/i);
      expect(result.toLowerCase()).toMatch(/flash|nano|fast/);
    });

    it('should handle provider failures gracefully', async () => {
      rig.setup('converge-failure', {
        settings: {
          llm: {
            anthropic: {
              apiKey: 'invalid-key',
            },
          },
        },
      });

      const result = await rig.run('/converge Simple test question');

      expect(result).toBeTruthy();
      expect(result).toMatch(/partial|degraded|2.*providers|failed/i);
    });
  });

  describe('/compare Command', () => {
    it('should show side-by-side comparison', async () => {
      rig.setup('compare-basic');

      const result = await rig.run('/compare What is machine learning?');

      // Should show all three provider responses
      expect(result).toContain('Gemini');
      expect(result).toContain('OpenAI');
      expect(result).toContain('Anthropic');

      // Should have separators between responses
      expect(result).toMatch(/---|\|/);

      // Should show common elements and divergences
      expect(result).toMatch(/common|shared|agreement/i);
      expect(result).toMatch(/differ|diverge|unique/i);
    });

    it('should include latency metrics', async () => {
      rig.setup('compare-metrics');

      const result = await rig.run(
        '/compare --show-metrics Quick response test',
      );

      expect(result).toMatch(/\d+ms|\d+\s*milliseconds/);
      expect(result).toMatch(/latency|response time|duration/i);
    });
  });

  describe('/race Command', () => {
    it('should return fastest provider response', async () => {
      rig.setup('race-basic');

      const startTime = Date.now();
      const result = await rig.run('/race What is 1 + 1?');
      const duration = Date.now() - startTime;

      expect(result).toContain('2');
      expect(result).toMatch(/fastest|first|winner/i);
      expect(duration).toBeLessThan(5000); // Should be fast

      // Should indicate which provider won
      expect(result).toMatch(/gemini|openai|anthropic/i);
    });

    it('should work with timeout', async () => {
      rig.setup('race-timeout');

      const result = await rig.run('/race --timeout 1000 Complex calculation');

      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(10);
    });
  });

  describe('/vote Command', () => {
    it('should conduct voting among providers', async () => {
      rig.setup('vote-basic');

      const result = await rig.run(
        '/vote Which is better for web development: React or Vue?',
      );

      expect(result).toMatch(/vote|voting|votes/i);
      expect(result).toMatch(/react|vue/i);

      // Should show voting results
      expect(result).toMatch(/\d+.*vote|\d+\/\d+|majority|unanimous/i);

      // Should show rationale
      expect(result).toMatch(/reason|because|rationale/i);
    });

    it('should handle tie votes', async () => {
      rig.setup('vote-tie');

      const result = await rig.run('/vote Is tabs or spaces better?');

      expect(result).toMatch(/tie|split|divided|no consensus/i);
      expect(result).toMatch(/tabs|spaces/i);
    });
  });

  describe('/debate Command', () => {
    it('should conduct multi-round debate', async () => {
      rig.setup('debate-basic');

      const result = await rig.run(
        '/debate --rounds 2 Is AI consciousness possible?',
      );

      expect(result).toMatch(/round 1|opening/i);
      expect(result).toMatch(/round 2|response/i);

      // Should show different provider perspectives
      expect(result).toContain('Gemini');
      expect(result).toContain('OpenAI');
      expect(result).toContain('Anthropic');

      // Should have debate structure
      expect(result).toMatch(/argument|position|perspective/i);
      expect(result).toMatch(/counter|response|rebuttal/i);
    });

    it('should summarize consensus and disputes', async () => {
      rig.setup('debate-summary');

      const result = await rig.run(
        '/debate Will quantum computing replace classical computing?',
      );

      expect(result).toMatch(/consensus|agreement|agreed/i);
      expect(result).toMatch(/dispute|disagree|contentious/i);
      expect(result).toMatch(/quantum|classical|computing/i);
    });
  });

  describe('Command Combinations', () => {
    it('should work with model selection then convergence', async () => {
      rig.setup('combo-model-converge');

      // Set specific models
      await rig.run('/model --all fastest');

      // Then use convergence
      const result = await rig.run('/converge Quick test');

      expect(result).toBeTruthy();
      expect(result).toMatch(/converge|synthesis/i);

      // Should use the fast models
      const toolLogs = rig.readToolLogs();
      expect(toolLogs.length).toBeGreaterThan(0);
    });

    it('should chain multiple commands', async () => {
      rig.setup('combo-chain');

      // List models
      const list = await rig.run('/model --list');
      expect(list).toContain('gpt-5');

      // Set model
      const set = await rig.run('/model openai:gpt-5');
      expect(set).toContain('updated');

      // Compare responses
      const compare = await rig.run('/compare Test question');
      expect(compare).toContain('OpenAI');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed commands gracefully', async () => {
      rig.setup('error-malformed');

      const result = await rig.run('/converge --invalid-flag test');

      expect(result).toMatch(/unknown|invalid|unrecognized|error/i);
      expect(result).toMatch(/usage|help|syntax/i);
    });

    it('should provide help for commands', async () => {
      rig.setup('help');

      const result = await rig.run('/converge --help');

      expect(result).toMatch(/usage|syntax|options/i);
      expect(result).toContain('--strategy');
      expect(result).toContain('--models');
    });

    it('should handle API failures gracefully', async () => {
      rig.setup('api-failure', {
        settings: {
          llm: {
            openai: { apiKey: '' },
            anthropic: { apiKey: '' },
          },
        },
      });

      const result = await rig.run('/converge Test with limited providers');

      expect(result).toBeTruthy();
      expect(result).toMatch(/gemini|fallback|limited/i);
    });
  });

  describe('Performance and Optimization', () => {
    it('should complete convergence within reasonable time', async () => {
      rig.setup('perf-convergence');

      const startTime = Date.now();
      const result = await rig.run('/converge What is the weather like?');
      const duration = Date.now() - startTime;

      expect(result).toBeTruthy();
      expect(duration).toBeLessThan(10000); // 10 seconds max
    });

    it('should cache model configurations', async () => {
      rig.setup('cache-models');

      // First call should be slower
      const start1 = Date.now();
      await rig.run('/model --list');
      const duration1 = Date.now() - start1;

      // Second call should be faster (cached)
      const start2 = Date.now();
      await rig.run('/model --list');
      const duration2 = Date.now() - start2;

      expect(duration2).toBeLessThanOrEqual(duration1);
    });

    it('should handle concurrent slash commands', async () => {
      rig.setup('concurrent-commands');

      const promises = [
        rig.run('/model --list'),
        rig.run('/converge Test 1'),
        rig.run('/compare Test 2'),
      ];

      const results = await Promise.all(promises);

      results.forEach((result) => {
        expect(result).toBeTruthy();
        expect(result.length).toBeGreaterThan(10);
      });
    });
  });

  describe('User Experience', () => {
    it('should provide clear feedback for model changes', async () => {
      rig.setup('ux-feedback');

      const result = await rig.run('/model openai:o3');

      expect(result).toMatch(/✅|✓|success|updated/i);
      expect(result).toContain('Previous');
      expect(result).toContain('Current');
      expect(result).toMatch(/context|tokens|capabilities/i);
    });

    it('should format output nicely', async () => {
      rig.setup('ux-formatting');

      const result = await rig.run('/model --show');

      // Should have table-like formatting
      expect(result).toMatch(/[│║|]/); // Table borders
      expect(result).toMatch(/[─═]/); // Horizontal lines

      // Should be aligned
      const lines = result.split('\n');
      const hasAlignment = lines.some(
        (line) => line.includes('  ') || line.includes('\t'),
      );
      expect(hasAlignment).toBe(true);
    });

    it('should provide progress indicators for long operations', async () => {
      rig.setup('ux-progress');

      // Mock a longer operation
      const result = await rig.run(
        '/converge --strategy ai_synthesis Complex analysis task',
      );

      // Result should indicate the operation completed
      expect(result).toMatch(/complete|done|finished|synthesized/i);
    });
  });
});
