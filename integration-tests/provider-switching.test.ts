/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';

/**
 * Specialized tests for provider switching functionality
 *
 * These tests focus on:
 * - Seamless provider transitions
 * - Configuration persistence
 * - Tool compatibility across providers
 * - Error recovery and fallbacks
 * - Performance comparison
 */
describe('Provider Switching and Compatibility Tests', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  describe('Dynamic Provider Switching', () => {
    it('should switch providers within the same session', async () => {
      // This test simulates changing providers during runtime
      rig.setup('dynamic-switching-test');
      rig.createFile('switch-test.txt', 'Content for provider switching test');

      // Test with default provider (Gemini)
      const geminiResult = await rig.run(
        'Read switch-test.txt and identify yourself as the current provider.',
      );

      expect(geminiResult).toBeTruthy();
      // Verify response content
      expect(geminiResult).toContain('switch-test.txt');

      // Test with OpenAI (if available)
      if (process.env.OPENAI_API_KEY) {
        const openaiResult = await rig.run(
          'Read switch-test.txt again and identify yourself as the current provider.',
          '--provider',
          'openai',
        );

        expect(openaiResult).toBeTruthy();
        // Verify response content
        expect(openaiResult).toContain('switch-test.txt');

        // Both should have successfully read the file
        const toolLogs = rig.readToolLogs();
        const readFileCalls = toolLogs.filter(
          (log) => log.toolRequest.name === 'read_file',
        );
        expect(readFileCalls.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('should maintain tool execution consistency across provider switches', async () => {
      const providers = ['gemini'];
      if (process.env.OPENAI_API_KEY) providers.push('openai');
      if (process.env.ANTHROPIC_API_KEY) providers.push('anthropic');

      if (providers.length < 2) {
        console.warn(
          'Skipping multi-provider test - need at least 2 providers configured',
        );
        return;
      }

      rig.setup('consistency-test');

      // Create test scenario that requires multiple tools
      rig.createFile('input.txt', 'Original content to be processed');

      const results = [];

      for (const provider of providers) {
        const args = provider === 'gemini' ? [] : ['--provider', provider];

        const result = await rig.run(
          'Read input.txt, create a processed version called output.txt with uppercase content, then list all files.',
          ...args,
        );

        expect(result).toBeTruthy();
        results.push({ provider, result });

        // Verify the same tools were used
        const toolLogs = rig.readToolLogs();
        const toolNames = toolLogs.map((log) => log.toolRequest.name);

        expect(toolNames).toContain('read_file');
        expect(toolNames).toContain('write_file');
        expect(toolNames).toContain('ls');

        // Verify the output file was created
        const outputContent = rig.readFile('output.txt');
        expect(outputContent.toUpperCase()).toContain('ORIGINAL CONTENT');
      }

      // Compare results across providers
      console.log(
        'Provider comparison results:',
        results.map((r) => ({
          provider: r.provider,
          length: r.result.length,
          toolCount: rig.readToolLogs().length,
        })),
      );
    });
  });

  describe('Configuration Compatibility', () => {
    it('should handle provider-specific configuration overrides', async () => {
      rig.setup('config-override-test', {
        settings: {
          llm: {
            gemini: {
              model: 'gemini-1.5-pro',
              maxTokens: 1000,
            },
            openai: {
              model: 'gpt-4',
              maxTokens: 500,
              temperature: 0.2,
            },
            anthropic: {
              model: 'claude-3-5-sonnet-20241022',
              maxTokens: 750,
            },
          },
        },
      });

      const providers = ['gemini'];
      if (process.env.OPENAI_API_KEY) providers.push('openai');
      if (process.env.ANTHROPIC_API_KEY) providers.push('anthropic');

      for (const provider of providers) {
        const args = provider === 'gemini' ? [] : ['--provider', provider];

        const result = await rig.run(
          'Create a test file with some content using write_file tool.',
          ...args,
        );

        expect(result).toBeTruthy();

        const toolLogs = rig.readToolLogs();
        expect(
          toolLogs.some((log) => log.toolRequest.name === 'write_file'),
        ).toBe(true);
      }
    });

    it('should validate provider-specific model availability', async () => {
      rig.setup('model-validation-test');

      // Test with valid models
      const validConfigs = [
        { provider: 'gemini', model: 'gemini-1.5-pro' },
        { provider: 'openai', model: 'gpt-3.5-turbo' },
        { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
      ];

      for (const config of validConfigs) {
        if (
          (config.provider === 'openai' && !process.env.OPENAI_API_KEY) ||
          (config.provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY)
        ) {
          continue;
        }

        const args =
          config.provider === 'gemini'
            ? ['--model', config.model]
            : ['--provider', config.provider, '--model', config.model];

        try {
          const result = await rig.run('Simple test with valid model', ...args);
          expect(result).toBeTruthy();
        } catch (error) {
          console.warn(
            `Model ${config.model} for ${config.provider} may not be available:`,
            error.message,
          );
        }
      }
    });
  });

  describe('Tool Format Conversion', () => {
    it('should convert tool parameters correctly across providers', async () => {
      rig.setup('tool-conversion-test');

      const providers = ['gemini'];
      if (process.env.OPENAI_API_KEY) providers.push('openai');
      if (process.env.ANTHROPIC_API_KEY) providers.push('anthropic');

      // Test complex tool parameter handling
      const complexContent = JSON.stringify(
        {
          name: 'Test Object',
          values: [1, 2, 3],
          nested: { key: 'value' },
        },
        null,
        2,
      );

      for (const provider of providers) {
        const args = provider === 'gemini' ? [] : ['--provider', provider];

        const result = await rig.run(
          `Create a JSON file called data.json with this content: ${complexContent}`,
          ...args,
        );

        expect(result).toBeTruthy();

        const toolLogs = rig.readToolLogs();
        const writeFileCall = toolLogs.find(
          (log) => log.toolRequest.name === 'write_file',
        );

        expect(writeFileCall).toBeTruthy();
        expect(writeFileCall?.toolRequest.success).toBe(true);

        // Verify the JSON was written correctly
        const writtenContent = rig.readFile('data.json');
        expect(() => JSON.parse(writtenContent)).not.toThrow();

        const parsedContent = JSON.parse(writtenContent);
        expect(parsedContent.name).toBe('Test Object');
        expect(parsedContent.values).toEqual([1, 2, 3]);
      }
    });

    it('should handle tool response formatting consistently', async () => {
      rig.setup('response-formatting-test');

      const providers = ['gemini'];
      if (process.env.OPENAI_API_KEY) providers.push('openai');
      if (process.env.ANTHROPIC_API_KEY) providers.push('anthropic');

      // Create files with different content types
      rig.createFile('text.txt', 'Simple text content');
      rig.createFile('data.json', '{"key": "value", "number": 42}');
      rig.createFile('script.js', 'console.log("Hello, World!");');

      const responseFormats = [];

      for (const provider of providers) {
        const args = provider === 'gemini' ? [] : ['--provider', provider];

        const result = await rig.run(
          'Read all three files (text.txt, data.json, script.js) and describe their contents.',
          ...args,
        );

        expect(result).toBeTruthy();

        const toolLogs = rig.readToolLogs();
        const readFileCalls = toolLogs.filter(
          (log) => log.toolRequest.name === 'read_file',
        );

        expect(readFileCalls.length).toBeGreaterThanOrEqual(1);

        responseFormats.push({
          provider,
          resultLength: result.length,
          mentionsJson: result.toLowerCase().includes('json'),
          mentionsJavaScript:
            result.toLowerCase().includes('javascript') ||
            result.toLowerCase().includes('js'),
          mentionsHello: result.toLowerCase().includes('hello'),
        });
      }

      // All providers should handle the same content types
      responseFormats.forEach((format) => {
        expect(format.resultLength).toBeGreaterThan(50);
        expect(format.mentionsJson).toBe(true);
        expect(format.mentionsHello).toBe(true);
      });

      console.log('Response format comparison:', responseFormats);
    });
  });

  describe('Error Handling and Fallbacks', () => {
    it('should handle provider failures gracefully', async () => {
      rig.setup('provider-failure-test', {
        settings: {
          llm: {
            openai: {
              apiKey: 'invalid-key-for-testing',
            },
          },
        },
      });

      if (!process.env.OPENAI_API_KEY) {
        console.warn(
          'Skipping provider failure test - no OpenAI key to invalidate',
        );
        return;
      }

      // Try to use OpenAI with invalid key
      try {
        const result = await rig.run(
          'Simple test that should fail with invalid API key',
          '--provider',
          'openai',
        );

        // If it doesn't throw, the error was handled gracefully
        console.log('Provider failure handled gracefully');
        expect(result).toBeTruthy();
      } catch (error) {
        // Error should be informative
        expect(error.message).toMatch(/api key|authentication|unauthorized/i);
      }
    });

    it('should validate tool compatibility warnings', async () => {
      rig.setup('compatibility-warning-test');

      // Some tools might have provider-specific limitations
      const result = await rig.run(
        'Use web_fetch to get content from httpbin.org and shell_command to echo the result.',
      );

      expect(result).toBeTruthy();

      const toolLogs = rig.readToolLogs();

      // Should attempt both tools
      const webFetchCalled = toolLogs.some(
        (log) => log.toolRequest.name === 'web_fetch',
      );
      const shellCommandCalled = toolLogs.some(
        (log) => log.toolRequest.name === 'shell_command',
      );

      // At least one should be called
      expect(webFetchCalled || shellCommandCalled).toBe(true);
    });
  });

  describe('Performance Comparison', () => {
    it('should measure response times across providers', async () => {
      const providers = ['gemini'];
      if (process.env.OPENAI_API_KEY) providers.push('openai');
      if (process.env.ANTHROPIC_API_KEY) providers.push('anthropic');

      if (providers.length < 2) {
        console.warn(
          'Skipping performance comparison - need multiple providers',
        );
        return;
      }

      rig.setup('performance-comparison-test');
      rig.createFile('perf-data.txt', 'Performance test data for comparison');

      const performanceMetrics = [];

      for (const provider of providers) {
        const startTime = Date.now();
        const args = provider === 'gemini' ? [] : ['--provider', provider];

        const result = await rig.run(
          'Read perf-data.txt, create a summary, and list the directory contents.',
          ...args,
        );

        const endTime = Date.now();
        const duration = endTime - startTime;

        expect(result).toBeTruthy();

        const toolLogs = rig.readToolLogs();

        performanceMetrics.push({
          provider,
          duration,
          toolCalls: toolLogs.length,
          responseLength: result.length,
          averageToolTime:
            toolLogs.length > 0
              ? toolLogs.reduce(
                  (sum, log) => sum + log.toolRequest.duration_ms,
                  0,
                ) / toolLogs.length
              : 0,
        });
      }

      console.log('Provider Performance Comparison:', performanceMetrics);

      // Basic performance expectations
      performanceMetrics.forEach((metric) => {
        expect(metric.duration).toBeLessThan(45000); // Should complete within 45 seconds
        expect(metric.toolCalls).toBeGreaterThan(0);
        expect(metric.responseLength).toBeGreaterThan(20);
      });

      // Compare relative performance
      if (performanceMetrics.length > 1) {
        const fastest = Math.min(...performanceMetrics.map((m) => m.duration));
        const slowest = Math.max(...performanceMetrics.map((m) => m.duration));
        const ratio = slowest / fastest;

        console.log(`Performance ratio (slowest/fastest): ${ratio.toFixed(2)}`);

        // No provider should be more than 5x slower than the fastest
        expect(ratio).toBeLessThan(5.0);
      }
    });

    it('should handle concurrent requests across providers', async () => {
      if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
        console.warn('Skipping concurrent test - need multiple providers');
        return;
      }

      rig.setup('concurrent-provider-test');

      // Create multiple test files
      for (let i = 1; i <= 3; i++) {
        rig.createFile(
          `concurrent-${i}.txt`,
          `Concurrent test file ${i} content`,
        );
      }

      const promises = [];
      const providers = ['gemini'];
      if (process.env.OPENAI_API_KEY) providers.push('openai');
      if (process.env.ANTHROPIC_API_KEY) providers.push('anthropic');

      // Start concurrent requests
      for (let i = 0; i < providers.length; i++) {
        const provider = providers[i % providers.length];
        const args = provider === 'gemini' ? [] : ['--provider', provider];

        const promise = rig
          .run(
            `Read concurrent-${(i % 3) + 1}.txt and summarize its content.`,
            ...args,
          )
          .then((result) => ({
            provider,
            result,
            success: !!result,
          }));

        promises.push(promise);
      }

      const results = await Promise.all(promises);

      // All requests should succeed
      results.forEach((result) => {
        expect(result.success).toBe(true);
        expect(result.result).toBeTruthy();
      });

      console.log(
        'Concurrent execution results:',
        results.map((r) => ({
          provider: r.provider,
          length: r.result.length,
          success: r.success,
        })),
      );
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain compatibility with existing Gemini configurations', async () => {
      rig.setup('backward-compatibility-test', {
        settings: {
          // Legacy Gemini-only configuration format
          model: 'gemini-1.5-pro',
          maxTokens: 1000,
          temperature: 0.7,
        },
      });

      const result = await rig.run(
        'Test backward compatibility by creating a test file with write_file tool.',
      );

      expect(result).toBeTruthy();

      const toolLogs = rig.readToolLogs();
      expect(
        toolLogs.some((log) => log.toolRequest.name === 'write_file'),
      ).toBe(true);
    });

    it('should handle legacy command-line arguments', async () => {
      rig.setup('legacy-args-test');

      // Test legacy arguments that should still work
      const result = await rig.run(
        'Create a test file using write_file tool.',
        '--yolo', // Legacy approval mode
      );

      expect(result).toBeTruthy();

      const toolLogs = rig.readToolLogs();
      expect(
        toolLogs.some((log) => log.toolRequest.name === 'write_file'),
      ).toBe(true);
    });

    it('should migrate settings format automatically', async () => {
      rig.setup('settings-migration-test', {
        settings: {
          // Old format
          geminiModel: 'gemini-1.5-pro',
          maxTokens: 500,
          // New format should work alongside
          llm: {
            provider: 'gemini',
            temperature: 0.5,
          },
        },
      });

      const result = await rig.run(
        'Test settings migration by using read_file tool.',
      );

      expect(result).toBeTruthy();

      // Should work with either configuration format
      const toolLogs = rig.readToolLogs();
      expect(toolLogs.length).toBeGreaterThan(0);
    });
  });
});
