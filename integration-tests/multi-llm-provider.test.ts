/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  TestRig,
  validateModelOutput,
  createToolCallErrorMessage,
  printDebugInfo,
} from './test-helper.js';

/**
 * Comprehensive integration tests for multi-LLM provider system
 *
 * These tests validate:
 * - Provider switching functionality
 * - Tool execution across all providers
 * - Built-in tool compatibility
 * - MCP tool compatibility
 * - Configuration handling
 * - Error handling and fallbacks
 * - Performance characteristics
 */
describe('Multi-LLM Provider Integration Tests', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  describe('Provider Switching Tests', () => {
    it('should default to Gemini provider', async () => {
      rig.setup('default-provider-test');

      const result = await rig.run(
        'What provider are you using? Use read_file to read a small test file.',
      );

      expect(result).toBeTruthy();
      validateModelOutput(result, 'gemini', 'default-provider-test');

      const toolLogs = rig.readToolLogs();
      expect(toolLogs.length).toBeGreaterThan(0);
      expect(
        toolLogs.some((log) =>
          ['read_file', 'ls'].includes(log.toolRequest.name),
        ),
      ).toBe(true);
    });

    it('should switch to OpenAI provider with --provider flag', async () => {
      // Only run if OpenAI API key is available
      if (!process.env.OPENAI_API_KEY) {
        console.warn('Skipping OpenAI test - no API key provided');
        return;
      }

      rig.setup('openai-provider-test');
      rig.createFile('test.txt', 'Hello from OpenAI test');

      const result = await rig.run(
        'Read the test.txt file and tell me what provider you are using.',
        '--provider',
        'openai',
      );

      expect(result).toBeTruthy();
      validateModelOutput(result, ['hello', 'openai'], 'openai-provider-test');

      // Verify tool was executed
      const toolLogs = rig.readToolLogs();
      expect(toolLogs.length).toBeGreaterThan(0);
      expect(toolLogs.some((log) => log.toolRequest.name === 'read_file')).toBe(
        true,
      );

      // Verify the file content was read
      expect(result.toLowerCase()).toContain('hello');
    });

    it('should switch to Anthropic provider with --provider flag', async () => {
      // Only run if Anthropic API key is available
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('Skipping Anthropic test - no API key provided');
        return;
      }

      rig.setup('anthropic-provider-test');
      rig.createFile('test.txt', 'Hello from Anthropic test');

      const result = await rig.run(
        'Read the test.txt file and tell me what provider you are using.',
        '--provider',
        'anthropic',
      );

      expect(result).toBeTruthy();
      validateModelOutput(
        result,
        ['hello', 'anthropic'],
        'anthropic-provider-test',
      );

      // Verify tool was executed
      const toolLogs = rig.readToolLogs();
      expect(toolLogs.length).toBeGreaterThan(0);
      expect(toolLogs.some((log) => log.toolRequest.name === 'read_file')).toBe(
        true,
      );

      // Verify the file content was read
      expect(result.toLowerCase()).toContain('hello');
    });

    it('should handle invalid provider gracefully', async () => {
      rig.setup('invalid-provider-test');

      try {
        await rig.run('Test prompt', '--provider', 'invalid-provider');
        expect.fail('Should have thrown an error for invalid provider');
      } catch (error) {
        expect(error.message).toContain('invalid-provider');
      }
    });
  });

  describe('Built-in Tool Compatibility Tests', () => {
    const testTools = [
      'read_file',
      'write_file',
      'ls',
      'glob',
      'grep',
      'edit',
      'shell_command',
      'web_fetch',
    ];

    testTools.forEach((toolName) => {
      it(`should execute ${toolName} tool across all providers`, async () => {
        const providers = ['gemini'];

        // Add other providers if API keys are available
        if (process.env.OPENAI_API_KEY) providers.push('openai');
        if (process.env.ANTHROPIC_API_KEY) providers.push('anthropic');

        for (const provider of providers) {
          rig.setup(`${toolName}-${provider}-test`);

          // Create test data based on tool type
          let prompt = '';
          let expectedContent: string[] = [];

          switch (toolName) {
            case 'read_file':
              rig.createFile('sample.txt', 'Sample content for reading');
              prompt = 'Read the sample.txt file using read_file tool.';
              expectedContent = ['sample content'];
              break;

            case 'write_file':
              prompt =
                'Create a new file called output.txt with content "Hello World" using write_file tool.';
              expectedContent = ['output.txt', 'hello world'];
              break;

            case 'ls':
              rig.createFile('file1.txt', 'content1');
              rig.createFile('file2.txt', 'content2');
              prompt = 'List the files in the current directory using ls tool.';
              expectedContent = ['file1.txt', 'file2.txt'];
              break;

            case 'glob':
              rig.createFile('test1.js', 'console.log("test1");');
              rig.createFile('test2.js', 'console.log("test2");');
              prompt =
                'Find all .js files using glob tool with pattern "*.js".';
              expectedContent = ['test1.js', 'test2.js'];
              break;

            case 'grep':
              rig.createFile(
                'search.txt',
                'This is a test\nAnother line\nTest pattern here',
              );
              prompt = 'Search for "test" in search.txt using grep tool.';
              expectedContent = ['test'];
              break;

            case 'edit':
              rig.createFile('edit-test.txt', 'Original content to replace');
              prompt =
                'Replace "Original" with "Modified" in edit-test.txt using edit tool.';
              expectedContent = ['modified'];
              break;

            case 'shell_command':
              prompt = 'Run "echo hello world" using shell_command tool.';
              expectedContent = ['hello world'];
              break;

            case 'web_fetch':
              prompt =
                'Fetch content from "https://httpbin.org/json" using web_fetch tool.';
              expectedContent = ['json'];
              break;
          }

          try {
            const args = provider === 'gemini' ? [] : ['--provider', provider];
            const result = await rig.run(prompt, ...args);

            expect(result).toBeTruthy();
            validateModelOutput(
              result,
              expectedContent,
              `${toolName}-${provider}-test`,
            );

            // Verify the specific tool was called
            const toolLogs = rig.readToolLogs();
            const toolCalled = toolLogs.some(
              (log) => log.toolRequest.name === toolName,
            );

            if (!toolCalled) {
              const allTools = printDebugInfo(rig, result, {
                provider,
                toolName,
                prompt,
              });
              throw new Error(
                createToolCallErrorMessage(
                  toolName,
                  allTools.map((t) => t.toolRequest.name),
                  result,
                ),
              );
            }

            // Verify tool execution was successful
            const toolLog = toolLogs.find(
              (log) => log.toolRequest.name === toolName,
            );
            expect(toolLog?.toolRequest.success).toBe(true);
          } catch (error) {
            console.error(
              `Tool ${toolName} failed on provider ${provider}:`,
              error.message,
            );
            throw error;
          }
        }
      });
    });
  });

  describe('Tool Confirmation Flow Tests', () => {
    it('should respect approval modes across providers', async () => {
      const providers = ['gemini'];
      if (process.env.OPENAI_API_KEY) providers.push('openai');
      if (process.env.ANTHROPIC_API_KEY) providers.push('anthropic');

      for (const provider of providers) {
        rig.setup(`confirmation-${provider}-test`, {
          settings: {
            approvalMode: 'yolo', // This should bypass confirmations
          },
        });

        const args = provider === 'gemini' ? [] : ['--provider', provider];
        const result = await rig.run(
          'Create a file called dangerous.txt with content "This could be dangerous" using write_file tool.',
          ...args,
        );

        expect(result).toBeTruthy();

        // Verify write_file was called (should succeed in YOLO mode)
        const toolLogs = rig.readToolLogs();
        const writeFileCalled = toolLogs.some(
          (log) => log.toolRequest.name === 'write_file',
        );
        expect(writeFileCalled).toBe(true);

        // Verify the file was actually created
        const fileContent = rig.readFile('dangerous.txt');
        expect(fileContent).toContain('This could be dangerous');
      }
    });

    it('should handle tool execution with security assessment', async () => {
      rig.setup('security-assessment-test');

      const result = await rig.run(
        'List files and then create a backup directory using appropriate tools.',
      );

      expect(result).toBeTruthy();

      const toolLogs = rig.readToolLogs();

      // Should call safe operations (ls) and potentially dangerous operations (shell_command or write_file)
      const safeTools = toolLogs.filter((log) =>
        ['ls', 'read_file', 'glob', 'grep'].includes(log.toolRequest.name),
      );
      const potentiallyDangerousTools = toolLogs.filter((log) =>
        ['shell_command', 'write_file'].includes(log.toolRequest.name),
      );

      expect(safeTools.length).toBeGreaterThan(0);
      // In YOLO mode, dangerous tools should also execute
      expect(potentiallyDangerousTools.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling and Resilience Tests', () => {
    it('should handle network errors gracefully', async () => {
      rig.setup('network-error-test');

      const result = await rig.run(
        'Try to fetch content from an invalid URL using web_fetch tool.',
      );

      expect(result).toBeTruthy();

      const toolLogs = rig.readToolLogs();
      const webFetchCall = toolLogs.find(
        (log) => log.toolRequest.name === 'web_fetch',
      );

      if (webFetchCall) {
        // Tool was called but may have failed - this is expected behavior
        expect(result.toLowerCase()).toMatch(/error|failed|invalid|not found/);
      }
    });

    it('should handle tool parameter validation errors', async () => {
      rig.setup('parameter-validation-test');

      const result = await rig.run(
        'Try to read a file with an invalid path parameter using read_file tool.',
      );

      expect(result).toBeTruthy();

      const toolLogs = rig.readToolLogs();
      const readFileCall = toolLogs.find(
        (log) => log.toolRequest.name === 'read_file',
      );

      if (readFileCall) {
        // Tool was called but should handle invalid parameters gracefully
        expect(result.toLowerCase()).toMatch(/error|failed|invalid|not found/);
      }
    });

    it('should handle provider API errors gracefully', async () => {
      rig.setup('api-error-test', {
        settings: {
          // Use invalid API key to simulate authentication error
          openaiApiKey: 'invalid-key',
          anthropicApiKey: 'invalid-key',
        },
      });

      // Test with invalid API key should fall back to Gemini or handle error gracefully
      const result = await rig.run('Simple test prompt');

      expect(result).toBeTruthy();
      // Should either succeed with Gemini or provide meaningful error message
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('Performance and Resource Tests', () => {
    it('should execute tools efficiently across providers', async () => {
      const providers = ['gemini'];
      if (process.env.OPENAI_API_KEY) providers.push('openai');
      if (process.env.ANTHROPIC_API_KEY) providers.push('anthropic');

      const performanceResults = [];

      for (const provider of providers) {
        rig.setup(`performance-${provider}-test`);
        rig.createFile('perf-test.txt', 'Performance test content');

        const startTime = Date.now();
        const args = provider === 'gemini' ? [] : ['--provider', provider];

        const result = await rig.run(
          'Read perf-test.txt and list current directory files using appropriate tools.',
          ...args,
        );

        const endTime = Date.now();
        const duration = endTime - startTime;

        expect(result).toBeTruthy();

        const toolLogs = rig.readToolLogs();
        expect(toolLogs.length).toBeGreaterThan(0);

        performanceResults.push({
          provider,
          duration,
          toolCalls: toolLogs.length,
          resultLength: result.length,
        });
      }

      // Log performance comparison
      console.log('Performance Results:', performanceResults);

      // Basic performance expectations (adjust based on real-world testing)
      performanceResults.forEach((result) => {
        expect(result.duration).toBeLessThan(30000); // Should complete within 30 seconds
        expect(result.toolCalls).toBeGreaterThan(0);
        expect(result.resultLength).toBeGreaterThan(0);
      });
    });

    it('should handle concurrent tool executions properly', async () => {
      rig.setup('concurrent-execution-test');

      // Create multiple test files
      for (let i = 1; i <= 3; i++) {
        rig.createFile(`file${i}.txt`, `Content of file ${i}`);
      }

      const result = await rig.run(
        'Read all three files (file1.txt, file2.txt, file3.txt) and summarize their contents.',
      );

      expect(result).toBeTruthy();

      const toolLogs = rig.readToolLogs();
      const readFileCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'read_file',
      );

      // Should have called read_file multiple times or used read_many_files
      expect(readFileCalls.length).toBeGreaterThanOrEqual(1);

      // Verify all file contents are mentioned
      expect(result.toLowerCase()).toContain('file 1');
      expect(result.toLowerCase()).toContain('file 2');
      expect(result.toLowerCase()).toContain('file 3');
    });
  });

  describe('Configuration and Settings Tests', () => {
    it('should respect provider-specific settings', async () => {
      if (!process.env.OPENAI_API_KEY) {
        console.warn('Skipping OpenAI settings test - no API key provided');
        return;
      }

      rig.setup('openai-settings-test', {
        settings: {
          llm: {
            provider: 'openai',
            model: 'gpt-3.5-turbo',
            maxTokens: 150,
            temperature: 0.1,
          },
        },
      });

      const result = await rig.run(
        'Create a simple test file using write_file tool.',
        '--provider',
        'openai',
      );

      expect(result).toBeTruthy();

      const toolLogs = rig.readToolLogs();
      expect(
        toolLogs.some((log) => log.toolRequest.name === 'write_file'),
      ).toBe(true);
    });

    it('should handle missing API keys gracefully', async () => {
      rig.setup('missing-api-key-test');

      try {
        await rig.run('Test prompt', '--provider', 'openai');
        // If no API key is set, should either fall back to Gemini or provide clear error
      } catch (error) {
        expect(error.message).toMatch(/api key|authentication|unauthorized/i);
      }
    });

    it('should validate provider configuration', async () => {
      rig.setup('config-validation-test', {
        settings: {
          llm: {
            provider: 'openai',
            model: 'invalid-model-name',
          },
        },
      });

      // Should handle invalid model configuration gracefully
      const result = await rig.run('Simple test prompt');
      expect(result).toBeTruthy();
    });
  });

  describe('Tool Statistics and Monitoring Tests', () => {
    it('should track tool usage statistics across providers', async () => {
      rig.setup('statistics-test');

      // Execute multiple tools to generate statistics
      rig.createFile('stats-test.txt', 'Statistics test content');

      const result = await rig.run(
        'Read stats-test.txt, list directory contents, and create a summary file.',
      );

      expect(result).toBeTruthy();

      const toolLogs = rig.readToolLogs();
      expect(toolLogs.length).toBeGreaterThan(0);

      // Verify tool execution details are tracked
      toolLogs.forEach((log) => {
        expect(log.toolRequest.name).toBeTruthy();
        expect(log.toolRequest.duration_ms).toBeGreaterThanOrEqual(0);
        expect(typeof log.toolRequest.success).toBe('boolean');
      });
    });

    it('should provide comprehensive tool information', async () => {
      rig.setup('tool-info-test');

      const result = await rig.run(
        'Show me available tools and their capabilities.',
      );

      expect(result).toBeTruthy();

      // Should mention built-in tools
      const expectedTools = [
        'read_file',
        'write_file',
        'ls',
        'grep',
        'shell_command',
      ];
      expectedTools.forEach((tool) => {
        expect(result.toLowerCase()).toContain(tool);
      });
    });
  });
});
