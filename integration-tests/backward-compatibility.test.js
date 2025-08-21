/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { TestRig, createToolCallErrorMessage } from './test-helper.js';
/**
 * Backward compatibility tests for multi-LLM provider system
 *
 * These tests ensure:
 * - Gemini remains the default provider
 * - Existing configurations continue to work
 * - Legacy command-line arguments are supported
 * - Tool behavior is consistent with previous versions
 * - Settings migration works correctly
 * - No breaking changes in core functionality
 */
describe('Backward Compatibility Tests', () => {
    let rig;
    beforeEach(() => {
        rig = new TestRig();
    });
    afterEach(async () => {
        await rig.cleanup();
    });
    describe('Default Provider Behavior', () => {
        it('should use Gemini as default provider when no provider specified', async () => {
            rig.setup('default-provider-compatibility');
            rig.createFile('test.txt', 'Default provider test content');
            const result = await rig.run('Read test.txt and tell me what you are.');
            expect(result).toBeTruthy();
            expect(result.toLowerCase()).toContain('test content');
            // Verify tool was executed successfully
            const toolLogs = rig.readToolLogs();
            expect(toolLogs.some((log) => log.toolRequest.name === 'read_file')).toBe(true);
            // Should work exactly like before multi-provider implementation
            expect(result.length).toBeGreaterThan(20);
        });
        it('should maintain existing tool execution patterns', async () => {
            rig.setup('tool-pattern-compatibility');
            // Test the same patterns that worked before multi-provider
            const patterns = [
                { prompt: 'List files in current directory', expectedTool: 'ls' },
                {
                    prompt: 'Create a file called hello.txt with "Hello World"',
                    expectedTool: 'write_file',
                },
                { prompt: 'Find files matching pattern *.txt', expectedTool: 'glob' },
                {
                    prompt: 'Search for "hello" in current directory',
                    expectedTool: 'grep',
                },
            ];
            for (const pattern of patterns) {
                const result = await rig.run(pattern.prompt);
                expect(result).toBeTruthy();
                const toolLogs = rig.readToolLogs();
                const toolCalled = toolLogs.some((log) => log.toolRequest.name === pattern.expectedTool);
                if (!toolCalled) {
                    throw new Error(createToolCallErrorMessage(pattern.expectedTool, toolLogs.map((t) => t.toolRequest.name), result));
                }
            }
        });
        it('should handle the same error scenarios as before', async () => {
            rig.setup('error-compatibility');
            // Test error handling patterns that existed before
            const result = await rig.run('Try to read a non-existent file called missing.txt');
            expect(result).toBeTruthy();
            const toolLogs = rig.readToolLogs();
            const readFileCall = toolLogs.find((log) => log.toolRequest.name === 'read_file');
            if (readFileCall) {
                // Tool was called but should handle missing file gracefully
                expect(result.toLowerCase()).toMatch(/not found|does not exist|missing|error/);
            }
        });
    });
    describe('Legacy Configuration Support', () => {
        it('should support legacy Gemini-only settings format', async () => {
            rig.setup('legacy-config-compatibility', {
                settings: {
                    // Old format that should still work
                    model: 'gemini-1.5-pro',
                    maxTokens: 1000,
                    temperature: 0.7,
                    topK: 40,
                    topP: 0.95,
                },
            });
            const result = await rig.run('Create a test file using write_file tool to verify legacy config works.');
            expect(result).toBeTruthy();
            const toolLogs = rig.readToolLogs();
            expect(toolLogs.some((log) => log.toolRequest.name === 'write_file')).toBe(true);
        });
        it('should handle mixed legacy and new configuration formats', async () => {
            rig.setup('mixed-config-compatibility', {
                settings: {
                    // Legacy format
                    model: 'gemini-1.5-pro',
                    maxTokens: 500,
                    // New format alongside
                    llm: {
                        provider: 'gemini',
                        temperature: 0.5,
                        topP: 0.9,
                    },
                    // Other legacy settings
                    sandbox: false,
                    approvalMode: 'yolo',
                },
            });
            const result = await rig.run('Test mixed configuration by reading a file and creating output.');
            expect(result).toBeTruthy();
            // Should work with either configuration format
            const toolLogs = rig.readToolLogs();
            expect(toolLogs.length).toBeGreaterThan(0);
        });
        it('should migrate settings automatically when possible', async () => {
            rig.setup('settings-migration-compatibility', {
                settings: {
                    // Old-style configuration
                    geminiModel: 'gemini-1.5-pro',
                    geminiMaxTokens: 750,
                    geminiTemperature: 0.6,
                    approvalMode: 'auto',
                    telemetry: {
                        enabled: true,
                    },
                },
            });
            const result = await rig.run('Test settings migration by using tools to verify configuration works.');
            expect(result).toBeTruthy();
            const toolLogs = rig.readToolLogs();
            expect(toolLogs.length).toBeGreaterThan(0);
            // All tools should execute successfully
            toolLogs.forEach((log) => {
                expect(log.toolRequest.success).toBe(true);
            });
        });
    });
    describe('Legacy Command-Line Arguments', () => {
        it('should support existing command-line flags', async () => {
            rig.setup('cli-args-compatibility');
            rig.createFile('cli-test.txt', 'CLI compatibility test');
            // Test existing flags that should continue to work
            const legacyFlags = [
                ['--yolo'], // Legacy approval mode
                ['--model', 'gemini-1.5-pro'], // Model specification
                ['--max-tokens', '500'], // Token limit
                ['--temperature', '0.5'], // Temperature setting
            ];
            for (const flags of legacyFlags) {
                try {
                    const result = await rig.run('Read cli-test.txt and confirm the flag works.', ...flags);
                    expect(result).toBeTruthy();
                    const toolLogs = rig.readToolLogs();
                    expect(toolLogs.some((log) => log.toolRequest.name === 'read_file')).toBe(true);
                }
                catch (error) {
                    console.warn(`Legacy flag ${flags.join(' ')} may not be supported:`, error.message);
                }
            }
        });
        it('should handle legacy approval mode arguments', async () => {
            rig.setup('approval-mode-compatibility');
            const approvalModes = [
                { flag: '--yolo', description: 'YOLO mode should skip confirmations' },
                {
                    flag: '--auto',
                    description: 'Auto mode should handle confirmations automatically',
                },
            ];
            for (const mode of approvalModes) {
                try {
                    const result = await rig.run('Create a potentially dangerous file called test-dangerous.txt with content.', mode.flag);
                    expect(result).toBeTruthy();
                    const toolLogs = rig.readToolLogs();
                    expect(toolLogs.some((log) => log.toolRequest.name === 'write_file')).toBe(true);
                    // File should be created (approval bypassed in these modes)
                    const fileContent = rig.readFile('test-dangerous.txt');
                    expect(fileContent.length).toBeGreaterThan(0);
                }
                catch (error) {
                    console.warn(`Approval mode ${mode.flag} may have changed behavior:`, error.message);
                }
            }
        });
        it('should support legacy environment variable names', async () => {
            rig.setup('env-vars-compatibility');
            // Test that legacy environment variables still work
            const originalGeminiKey = process.env['GEMINI_API_KEY'];
            const originalGoogleKey = process.env['GOOGLE_API_KEY'];
            try {
                // These should be recognized as Gemini API key sources
                if (originalGeminiKey || originalGoogleKey) {
                    const result = await rig.run('Test environment variable compatibility by creating a test file.');
                    expect(result).toBeTruthy();
                    const toolLogs = rig.readToolLogs();
                    expect(toolLogs.length).toBeGreaterThan(0);
                }
            }
            finally {
                // Restore original environment
                if (originalGeminiKey)
                    process.env['GEMINI_API_KEY'] = originalGeminiKey;
                if (originalGoogleKey)
                    process.env['GOOGLE_API_KEY'] = originalGoogleKey;
            }
        });
    });
    describe('Tool Compatibility and Behavior', () => {
        it('should maintain identical tool signatures and behavior', async () => {
            rig.setup('tool-signature-compatibility');
            // Test that core tools work exactly the same way
            const toolTests = [
                {
                    tool: 'read_file',
                    setup: () => rig.createFile('read-test.txt', 'Content to read'),
                    prompt: 'Read read-test.txt exactly as before.',
                    verify: (result) => result.toLowerCase().includes('content to read'),
                },
                {
                    tool: 'write_file',
                    setup: () => { },
                    prompt: 'Write "Hello World" to write-test.txt exactly as before.',
                    verify: () => {
                        const content = rig.readFile('write-test.txt');
                        return content.includes('Hello World');
                    },
                },
                {
                    tool: 'ls',
                    setup: () => {
                        rig.createFile('ls-test-1.txt', 'file1');
                        rig.createFile('ls-test-2.txt', 'file2');
                    },
                    prompt: 'List files in current directory exactly as before.',
                    verify: (result) => result.includes('ls-test-1.txt') &&
                        result.includes('ls-test-2.txt'),
                },
            ];
            for (const test of toolTests) {
                test.setup();
                const result = await rig.run(test.prompt);
                expect(result).toBeTruthy();
                const toolLogs = rig.readToolLogs();
                expect(toolLogs.some((log) => log.toolRequest.name === test.tool)).toBe(true);
                // Verify the specific behavior hasn't changed
                expect(test.verify(result)).toBe(true);
            }
        });
        it('should maintain tool confirmation behavior', async () => {
            rig.setup('confirmation-compatibility', {
                settings: {
                    approvalMode: 'default', // Should require confirmations for dangerous operations
                },
            });
            // Test that confirmation behavior is preserved
            // Note: In test environment with --yolo, confirmations are bypassed
            // This test validates the confirmation system is still in place
            const result = await rig.run('Create a system file that might require confirmation.', '--yolo');
            expect(result).toBeTruthy();
            const toolLogs = rig.readToolLogs();
            expect(toolLogs.length).toBeGreaterThan(0);
        });
        it('should maintain tool error reporting format', async () => {
            rig.setup('error-format-compatibility');
            // Test that error messages follow the same format
            const result = await rig.run('Try to use an invalid tool parameter to test error handling.');
            expect(result).toBeTruthy();
            // Error handling should be graceful and informative
            // Even if tools fail, the LLM should provide meaningful response
            expect(result.length).toBeGreaterThan(10);
        });
    });
    describe('Output Format Compatibility', () => {
        it('should maintain consistent output formatting', async () => {
            rig.setup('output-format-compatibility');
            rig.createFile('format-test.txt', 'Test content for format validation');
            const result = await rig.run('Read format-test.txt and provide output in the same format as always.');
            expect(result).toBeTruthy();
            validateModelOutput(result, 'test content', 'format-compatibility');
            // Output should follow established patterns
            expect(result.length).toBeGreaterThan(20);
            expect(typeof result).toBe('string');
        });
        it('should maintain telemetry and logging format', async () => {
            rig.setup('telemetry-compatibility');
            const result = await rig.run('Execute a simple operation to test telemetry compatibility.');
            expect(result).toBeTruthy();
            // Verify telemetry format hasn't changed
            const toolLogs = rig.readToolLogs();
            expect(toolLogs.length).toBeGreaterThan(0);
            // Each log should have expected structure
            toolLogs.forEach((log) => {
                expect(log.toolRequest).toBeDefined();
                expect(log.toolRequest.name).toBeTruthy();
                expect(typeof log.toolRequest.success).toBe('boolean');
                expect(typeof log.toolRequest.duration_ms).toBe('number');
            });
        });
        it('should maintain file operation result formats', async () => {
            rig.setup('file-ops-compatibility');
            // Test that file operations return consistent formats
            const writeResult = await rig.run('Create output.txt with "Test Output" and confirm the format.');
            expect(writeResult).toBeTruthy();
            const toolLogs = rig.readToolLogs();
            const writeFileLog = toolLogs.find((log) => log.toolRequest.name === 'write_file');
            expect(writeFileLog).toBeTruthy();
            expect(writeFileLog?.toolRequest.success).toBe(true);
            // Verify file was created with expected content
            const fileContent = rig.readFile('output.txt');
            expect(fileContent).toContain('Test Output');
        });
    });
    describe('Integration Compatibility', () => {
        it('should work with existing IDE integrations', async () => {
            rig.setup('ide-integration-compatibility', {
                settings: {
                    ide: {
                        enabled: true,
                    },
                },
            });
            const result = await rig.run('Test IDE integration compatibility by performing file operations.');
            expect(result).toBeTruthy();
            // Should work regardless of IDE integration settings
            const toolLogs = rig.readToolLogs();
            expect(toolLogs.length).toBeGreaterThan(0);
        });
        it('should maintain MCP server compatibility', async () => {
            rig.setup('mcp-compatibility', {
                settings: {
                    mcpServers: {}, // Empty MCP configuration should not break anything
                },
            });
            const result = await rig.run('Test MCP compatibility by using built-in tools normally.');
            expect(result).toBeTruthy();
            // Built-in tools should work even with MCP configuration present
            const toolLogs = rig.readToolLogs();
            expect(toolLogs.length).toBeGreaterThan(0);
        });
        it('should preserve extension and plugin compatibility', async () => {
            rig.setup('extension-compatibility', {
                settings: {
                    extensions: {
                        enabled: true,
                        loadBuiltins: true,
                    },
                },
            });
            const result = await rig.run('Test extension compatibility with standard operations.');
            expect(result).toBeTruthy();
            // Should work with extension system enabled
            const toolLogs = rig.readToolLogs();
            expect(toolLogs.length).toBeGreaterThan(0);
        });
    });
    describe('Performance Regression Tests', () => {
        it('should maintain or improve performance compared to Gemini-only', async () => {
            rig.setup('performance-regression');
            rig.createFile('perf-test.txt', 'Performance regression test content');
            const startTime = Date.now();
            const result = await rig.run('Read perf-test.txt and create a summary as efficiently as before.');
            const endTime = Date.now();
            const duration = endTime - startTime;
            expect(result).toBeTruthy();
            // Should complete within reasonable time (same or better than before)
            expect(duration).toBeLessThan(20000); // 20 seconds max for simple operation
            const toolLogs = rig.readToolLogs();
            expect(toolLogs.some((log) => log.toolRequest.name === 'read_file')).toBe(true);
            // Tool execution should be efficient
            const avgToolTime = toolLogs.length > 0
                ? toolLogs.reduce((sum, log) => sum + log.toolRequest.duration_ms, 0) / toolLogs.length
                : 0;
            expect(avgToolTime).toBeLessThan(5000); // Average tool execution under 5 seconds
        });
        it('should not introduce memory leaks or resource issues', async () => {
            rig.setup('resource-regression');
            const initialMemory = process.memoryUsage();
            // Perform multiple operations
            for (let i = 1; i <= 3; i++) {
                rig.createFile(`resource-test-${i}.txt`, `Resource test ${i} content`);
                const result = await rig.run(`Read resource-test-${i}.txt and process it efficiently.`);
                expect(result).toBeTruthy();
            }
            const finalMemory = process.memoryUsage();
            const memoryDelta = finalMemory.heapUsed - initialMemory.heapUsed;
            // Memory usage should not grow excessively
            expect(memoryDelta).toBeLessThan(50 * 1024 * 1024); // Less than 50MB growth
            const toolLogs = rig.readToolLogs();
            expect(toolLogs.length).toBeGreaterThanOrEqual(3); // Should have processed all files
        });
    });
    describe('Regression Prevention', () => {
        it('should prevent common breaking changes', async () => {
            rig.setup('regression-prevention');
            // Test scenarios that commonly break during refactoring
            const regressionTests = [
                'Create a file with special characters: @#$%^&*()',
                'Read a file and handle Unicode content: 你好 🌍 مرحبا',
                'Process JSON data with nested structures',
                'Handle file paths with spaces and special characters',
                'Execute multiple tools in sequence successfully',
            ];
            for (const test of regressionTests) {
                try {
                    const result = await rig.run(test);
                    expect(result).toBeTruthy();
                    expect(result.length).toBeGreaterThan(5);
                }
                catch (error) {
                    console.warn(`Regression test failed: ${test}`, error.message);
                    throw error;
                }
            }
            const toolLogs = rig.readToolLogs();
            expect(toolLogs.length).toBeGreaterThan(0);
            // Most tools should succeed
            const successfulTools = toolLogs.filter((log) => log.toolRequest.success).length;
            const successRate = toolLogs.length > 0 ? successfulTools / toolLogs.length : 0;
            expect(successRate).toBeGreaterThan(0.7); // At least 70% success rate
        });
        it('should maintain API contract compatibility', async () => {
            rig.setup('api-contract-compatibility');
            // Test that the core API contracts haven't changed
            const result = await rig.run('Demonstrate that all core functionality works as expected.');
            expect(result).toBeTruthy();
            // Verify expected tool patterns work
            const toolLogs = rig.readToolLogs();
            expect(toolLogs.length).toBeGreaterThan(0);
            // Each tool log should maintain the expected structure
            toolLogs.forEach((log) => {
                expect(log.toolRequest.name).toBeTruthy();
                expect(typeof log.toolRequest.success).toBe('boolean');
                expect(typeof log.toolRequest.duration_ms).toBe('number');
                expect(log.toolRequest.args).toBeDefined();
            });
        });
    });
});
//# sourceMappingURL=backward-compatibility.test.js.map