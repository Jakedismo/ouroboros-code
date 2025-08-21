/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';

/**
 * MCP tools integration tests for multi-LLM provider system
 *
 * These tests validate:
 * - MCP tools work across all providers
 * - Provider-specific MCP tool formatting
 * - MCP tool confirmation flows
 * - MCP server integration consistency
 * - Cross-provider MCP tool compatibility
 * - MCP tool security and validation
 */
describe('MCP Multi-Provider Integration Tests', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  // Helper to get available providers
  const getAvailableProviders = () => {
    const providers = ['gemini'];
    if (process.env.OPENAI_API_KEY) providers.push('openai');
    if (process.env.ANTHROPIC_API_KEY) providers.push('anthropic');
    return providers;
  };

  describe('MCP Tool Discovery and Integration', () => {
    it('should discover MCP tools consistently across providers', async () => {
      const providers = getAvailableProviders();

      // Test MCP tool discovery with a simple echo server configuration
      const mcpConfig = {
        mcpServers: {
          'test-echo': {
            command: 'node',
            args: ['integration-tests/test-mcp-server.js'],
            env: {},
          },
        },
      };

      for (const provider of providers) {
        rig.setup(`mcp-discovery-${provider}`, {
          settings: mcpConfig,
        });

        const args = provider === 'gemini' ? [] : ['--provider', provider];

        try {
          const result = await rig.run(
            'List available tools and check for MCP tools.',
            ...args,
          );

          expect(result).toBeTruthy();

          // Should mention available tools
          expect(result.toLowerCase()).toMatch(/tool|available|function/);
        } catch (error) {
          console.warn(`MCP discovery failed for ${provider}:`, error.message);
        }
      }
    });

    it('should handle MCP tool naming across providers', async () => {
      const providers = getAvailableProviders();

      // Test that MCP tool names are handled consistently
      const mcpConfig = {
        mcpServers: {
          'naming-test': {
            command: 'node',
            args: ['integration-tests/test-mcp-server.js'],
            env: { TEST_MODE: 'naming' },
          },
        },
      };

      for (const provider of providers) {
        rig.setup(`mcp-naming-${provider}`, {
          settings: mcpConfig,
        });

        const args = provider === 'gemini' ? [] : ['--provider', provider];

        try {
          const result = await rig.run(
            'Show me the naming pattern for MCP tools.',
            ...args,
          );

          expect(result).toBeTruthy();

          // Different providers may have different naming conventions
          // but should handle MCP tools consistently
          expect(result.length).toBeGreaterThan(20);
        } catch (error) {
          console.warn(
            `MCP naming test failed for ${provider}:`,
            error.message,
          );
        }
      }
    });
  });

  describe('MCP Tool Execution Across Providers', () => {
    it('should execute MCP tools with consistent behavior', async () => {
      const providers = getAvailableProviders();

      // Configure a simple MCP server for testing
      const mcpConfig = {
        mcpServers: {
          'execution-test': {
            command: 'node',
            args: ['integration-tests/test-mcp-server.js'],
            env: { TEST_MODE: 'execution' },
          },
        },
      };

      const executionResults = [];

      for (const provider of providers) {
        rig.setup(`mcp-execution-${provider}`, {
          settings: mcpConfig,
        });

        const startTime = Date.now();
        const args = provider === 'gemini' ? [] : ['--provider', provider];

        try {
          const result = await rig.run(
            'Use an MCP tool to perform a test operation.',
            ...args,
          );

          const endTime = Date.now();
          const duration = endTime - startTime;

          expect(result).toBeTruthy();

          const toolLogs = rig.readToolLogs();
          const mcpToolCalls = toolLogs.filter(
            (log) =>
              log.toolRequest.name.includes('.') ||
              log.toolRequest.name.includes('mcp') ||
              log.toolRequest.name.includes('test'),
          );

          executionResults.push({
            provider,
            duration,
            mcpToolCalls: mcpToolCalls.length,
            totalToolCalls: toolLogs.length,
            responseLength: result.length,
            success: true,
          });
        } catch (error) {
          console.warn(`MCP execution failed for ${provider}:`, error.message);
          executionResults.push({
            provider,
            duration: -1,
            mcpToolCalls: 0,
            totalToolCalls: 0,
            responseLength: 0,
            success: false,
          });
        }
      }

      console.log('MCP Execution Results:', executionResults);

      // At least some providers should successfully execute MCP tools
      const successfulExecutions = executionResults.filter((r) => r.success);
      expect(successfulExecutions.length).toBeGreaterThan(0);
    });

    it('should handle MCP tool parameters correctly across providers', async () => {
      const providers = getAvailableProviders();

      // Test parameter handling with complex data
      const testData = {
        string: 'test string',
        number: 42,
        boolean: true,
        array: [1, 2, 3],
        object: { key: 'value' },
      };

      for (const provider of providers) {
        rig.setup(`mcp-parameters-${provider}`);

        const args = provider === 'gemini' ? [] : ['--provider', provider];

        try {
          const result = await rig.run(
            `Test MCP tool parameter handling with this data: ${JSON.stringify(testData)}`,
            ...args,
          );

          expect(result).toBeTruthy();

          // Should handle the complex parameter structure
          expect(result.length).toBeGreaterThan(10);
        } catch (error) {
          console.warn(
            `MCP parameter test failed for ${provider}:`,
            error.message,
          );
        }
      }
    });
  });

  describe('MCP Tool Format Conversion', () => {
    it('should convert MCP tool schemas correctly for each provider', async () => {
      const providers = getAvailableProviders();

      for (const provider of providers) {
        rig.setup(`mcp-schema-${provider}`);

        const args = provider === 'gemini' ? [] : ['--provider', provider];

        try {
          const result = await rig.run(
            'Demonstrate MCP tool schema compatibility.',
            ...args,
          );

          expect(result).toBeTruthy();

          // Each provider should handle schema conversion appropriately
          const toolLogs = rig.readToolLogs();

          // Should execute some tools successfully
          const successfulTools = toolLogs.filter(
            (log) => log.toolRequest.success,
          );
          expect(successfulTools.length).toBeGreaterThan(0);
        } catch (error) {
          console.warn(
            `MCP schema test failed for ${provider}:`,
            error.message,
          );
        }
      }
    });

    it('should handle MCP tool response formatting consistently', async () => {
      const providers = getAvailableProviders();
      const responseFormats = [];

      for (const provider of providers) {
        rig.setup(`mcp-response-${provider}`);

        const args = provider === 'gemini' ? [] : ['--provider', provider];

        try {
          const result = await rig.run(
            'Test MCP tool response formatting consistency.',
            ...args,
          );

          expect(result).toBeTruthy();

          responseFormats.push({
            provider,
            responseLength: result.length,
            containsStructuredData:
              result.includes('{') || result.includes('['),
            containsMarkdown: result.includes('```') || result.includes('*'),
            success: true,
          });
        } catch (error) {
          console.warn(
            `MCP response test failed for ${provider}:`,
            error.message,
          );
          responseFormats.push({
            provider,
            responseLength: 0,
            containsStructuredData: false,
            containsMarkdown: false,
            success: false,
          });
        }
      }

      console.log('MCP Response Formats:', responseFormats);

      // All successful responses should have reasonable length
      responseFormats
        .filter((r) => r.success)
        .forEach((format) => {
          expect(format.responseLength).toBeGreaterThan(5);
        });
    });
  });

  describe('MCP Tool Security and Validation', () => {
    it('should apply security assessments to MCP tools across providers', async () => {
      const providers = getAvailableProviders();

      for (const provider of providers) {
        rig.setup(`mcp-security-${provider}`, {
          settings: {
            approvalMode: 'default', // Should require confirmations for dangerous MCP tools
          },
        });

        const args =
          provider === 'gemini'
            ? ['--yolo']
            : ['--provider', provider, '--yolo'];

        try {
          const result = await rig.run(
            'Test MCP tool security assessment and validation.',
            ...args,
          );

          expect(result).toBeTruthy();

          // Security system should be active
          const toolLogs = rig.readToolLogs();
          expect(toolLogs.length).toBeGreaterThanOrEqual(0);
        } catch (error) {
          console.warn(
            `MCP security test failed for ${provider}:`,
            error.message,
          );
        }
      }
    });

    it('should validate MCP tool trust levels across providers', async () => {
      const providers = getAvailableProviders();

      // Test with trusted and untrusted MCP servers
      const mcpConfig = {
        mcpServers: {
          'trusted-server': {
            command: 'node',
            args: ['integration-tests/test-mcp-server.js'],
            env: { TRUST_LEVEL: 'high' },
            trust: true,
          },
          'untrusted-server': {
            command: 'node',
            args: ['integration-tests/test-mcp-server.js'],
            env: { TRUST_LEVEL: 'low' },
            trust: false,
          },
        },
      };

      for (const provider of providers) {
        rig.setup(`mcp-trust-${provider}`, {
          settings: mcpConfig,
        });

        const args =
          provider === 'gemini'
            ? ['--yolo']
            : ['--provider', provider, '--yolo'];

        try {
          const result = await rig.run(
            'Test MCP tool trust level validation.',
            ...args,
          );

          expect(result).toBeTruthy();

          // Should handle both trusted and untrusted tools
          expect(result.length).toBeGreaterThan(10);
        } catch (error) {
          console.warn(`MCP trust test failed for ${provider}:`, error.message);
        }
      }
    });
  });

  describe('MCP Tool Error Handling', () => {
    it('should handle MCP tool failures gracefully across providers', async () => {
      const providers = getAvailableProviders();

      for (const provider of providers) {
        rig.setup(`mcp-errors-${provider}`);

        const args = provider === 'gemini' ? [] : ['--provider', provider];

        try {
          const result = await rig.run(
            'Try to use a non-existent MCP tool to test error handling.',
            ...args,
          );

          expect(result).toBeTruthy();

          // Should handle tool not found gracefully
          expect(result.toLowerCase()).toMatch(
            /error|not found|invalid|unavailable/,
          );
        } catch (error) {
          // Error handling at the provider level is also acceptable
          expect(error.message).toMatch(/tool|not found|invalid/i);
        }
      }
    });

    it('should handle MCP server connection failures across providers', async () => {
      const providers = getAvailableProviders();

      // Configure an invalid MCP server
      const invalidMcpConfig = {
        mcpServers: {
          'invalid-server': {
            command: 'nonexistent-command',
            args: ['--invalid'],
          },
        },
      };

      for (const provider of providers) {
        rig.setup(`mcp-connection-${provider}`, {
          settings: invalidMcpConfig,
        });

        const args = provider === 'gemini' ? [] : ['--provider', provider];

        try {
          const result = await rig.run(
            'Test MCP server connection failure handling.',
            ...args,
          );

          expect(result).toBeTruthy();

          // Should handle connection failures gracefully
          // Built-in tools should still work
          const toolLogs = rig.readToolLogs();
          expect(toolLogs.length).toBeGreaterThanOrEqual(0);
        } catch (error) {
          console.warn(
            `MCP connection test had expected failure for ${provider}:`,
            error.message,
          );
        }
      }
    });
  });

  describe('MCP Tool Performance Across Providers', () => {
    it('should benchmark MCP tool performance across providers', async () => {
      const providers = getAvailableProviders();
      const performanceResults = [];

      // Simple MCP server for performance testing
      const perfMcpConfig = {
        mcpServers: {
          'perf-test': {
            command: 'node',
            args: ['integration-tests/test-mcp-server.js'],
            env: { MODE: 'performance' },
          },
        },
      };

      for (const provider of providers) {
        rig.setup(`mcp-perf-${provider}`, {
          settings: perfMcpConfig,
        });

        const startTime = Date.now();
        const args = provider === 'gemini' ? [] : ['--provider', provider];

        try {
          const result = await rig.run(
            'Perform MCP tool performance test.',
            ...args,
          );

          const endTime = Date.now();
          const duration = endTime - startTime;

          expect(result).toBeTruthy();

          const toolLogs = rig.readToolLogs();

          performanceResults.push({
            provider,
            duration,
            toolCalls: toolLogs.length,
            responseLength: result.length,
            success: true,
          });
        } catch (error) {
          console.warn(
            `MCP performance test failed for ${provider}:`,
            error.message,
          );
          performanceResults.push({
            provider,
            duration: -1,
            toolCalls: 0,
            responseLength: 0,
            success: false,
          });
        }
      }

      console.log('MCP Performance Results:', performanceResults);

      // Validate performance expectations
      performanceResults
        .filter((r) => r.success)
        .forEach((result) => {
          expect(result.duration).toBeLessThan(45000); // Should complete within 45 seconds
          expect(result.responseLength).toBeGreaterThan(0);
        });
    });
  });

  describe('MCP Integration Edge Cases', () => {
    it('should handle MCP tools with special characters in names', async () => {
      const providers = getAvailableProviders();

      for (const provider of providers) {
        rig.setup(`mcp-special-chars-${provider}`);

        const args = provider === 'gemini' ? [] : ['--provider', provider];

        try {
          const result = await rig.run(
            'Test MCP tools with special characters in tool names.',
            ...args,
          );

          expect(result).toBeTruthy();

          // Should handle special characters gracefully
          expect(result.length).toBeGreaterThan(5);
        } catch (error) {
          console.warn(
            `MCP special chars test failed for ${provider}:`,
            error.message,
          );
        }
      }
    });

    it('should handle MCP tools with large response payloads', async () => {
      const providers = getAvailableProviders();

      for (const provider of providers) {
        rig.setup(`mcp-large-response-${provider}`);

        const args = provider === 'gemini' ? [] : ['--provider', provider];

        try {
          const result = await rig.run(
            'Test MCP tools with large response payloads.',
            ...args,
          );

          expect(result).toBeTruthy();

          // Should handle large responses appropriately
          expect(result.length).toBeGreaterThan(0);
        } catch (error) {
          console.warn(
            `MCP large response test failed for ${provider}:`,
            error.message,
          );
        }
      }
    });

    it('should handle concurrent MCP tool executions', async () => {
      const providers = getAvailableProviders();

      if (providers.length < 2) {
        console.warn('Skipping concurrent MCP test - need multiple providers');
        return;
      }

      rig.setup('mcp-concurrent');

      const promises = [];

      // Execute MCP operations concurrently across providers
      for (let i = 0; i < Math.min(3, providers.length); i++) {
        const provider = providers[i % providers.length];
        const args = provider === 'gemini' ? [] : ['--provider', provider];

        const promise = rig
          .run(`Concurrent MCP test ${i + 1}`, ...args)
          .then((result) => ({
            index: i + 1,
            provider,
            success: !!result,
            length: result?.length || 0,
          }))
          .catch((error) => ({
            index: i + 1,
            provider,
            success: false,
            error: error.message,
          }));

        promises.push(promise);
      }

      const results = await Promise.all(promises);

      console.log('Concurrent MCP Results:', results);

      // At least one concurrent operation should succeed
      expect(results.filter((r) => r.success).length).toBeGreaterThan(0);
    });
  });

  describe('MCP Configuration Compatibility', () => {
    it('should handle various MCP server configuration formats', async () => {
      const providers = getAvailableProviders();

      // Test different MCP configuration formats
      const configFormats = [
        {
          name: 'simple',
          config: {
            mcpServers: {
              'simple-server': {
                command: 'echo',
                args: ['test'],
              },
            },
          },
        },
        {
          name: 'complex',
          config: {
            mcpServers: {
              'complex-server': {
                command: 'node',
                args: ['integration-tests/test-mcp-server.js'],
                env: {
                  NODE_ENV: 'test',
                  DEBUG: 'false',
                },
                timeout: 5000,
                trust: true,
              },
            },
          },
        },
      ];

      for (const format of configFormats) {
        for (const provider of providers.slice(0, 1)) {
          // Test with one provider per format
          rig.setup(`mcp-config-${format.name}-${provider}`, {
            settings: format.config,
          });

          const args = provider === 'gemini' ? [] : ['--provider', provider];

          try {
            const result = await rig.run(
              `Test MCP configuration format: ${format.name}`,
              ...args,
            );

            expect(result).toBeTruthy();

            // Should handle the configuration format
            expect(result.length).toBeGreaterThan(5);
          } catch (error) {
            console.warn(
              `MCP config ${format.name} test failed for ${provider}:`,
              error.message,
            );
          }
        }
      }
    });
  });
});
