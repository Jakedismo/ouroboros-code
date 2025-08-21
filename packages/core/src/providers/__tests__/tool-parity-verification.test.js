/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { BuiltinToolManager } from '../tools/builtin-tool-manager.js';
import { OpenAIBuiltinToolsIntegration } from '../openai/builtin-tools-integration.js';
import { AnthropicBuiltinToolsIntegration } from '../anthropic/builtin-tools-integration.js';
/**
 * Comprehensive verification test suite to ensure all 11 built-in tools work
 * identically across OpenAI, Anthropic, and Gemini providers.
 *
 * The 11 built-in tools are:
 * File System (7): read_file, write_file, edit_file, ls, glob, grep, read_many_files
 * Web (2): web_fetch, google_web_search
 * System (2): run_shell_command, save_memory
 */
describe('Built-in Tools Parity Verification', () => {
    let config;
    let geminiToolManager;
    let openaiIntegration;
    let anthropicIntegration;
    // Mock execution context
    let mockContext;
    beforeEach(async () => {
        // Create mock config
        config = {
            createToolRegistry: vi.fn().mockResolvedValue({
                getAllTools: vi.fn().mockReturnValue([
                    // Mock built-in tools
                    { name: 'read_file', description: 'Read file contents', schema: { name: 'read_file' } },
                    { name: 'write_file', description: 'Write file contents', schema: { name: 'write_file' } },
                    { name: 'edit_file', description: 'Edit file contents', schema: { name: 'edit_file' } },
                    { name: 'ls', description: 'List directory contents', schema: { name: 'ls' } },
                    { name: 'glob', description: 'Find files matching pattern', schema: { name: 'glob' } },
                    { name: 'grep', description: 'Search in files', schema: { name: 'grep' } },
                    { name: 'read_many_files', description: 'Read multiple files', schema: { name: 'read_many_files' } },
                    { name: 'web_fetch', description: 'Fetch web content', schema: { name: 'web_fetch' } },
                    { name: 'google_web_search', description: 'Search the web', schema: { name: 'google_web_search' } },
                    { name: 'run_shell_command', description: 'Execute shell command', schema: { name: 'run_shell_command' } },
                    { name: 'save_memory', description: 'Save memory content', schema: { name: 'save_memory' } },
                ]),
            }),
            getProjectRoot: () => process.cwd(),
            getWorkingDirectory: () => process.cwd(),
            allowCodeExecution: true,
            allowNetworkAccess: true,
            maxConcurrentJobs: 4,
            toolsConfig: {
                enabled: true,
                confirmationRequired: false,
                securityLevel: 'MODERATE',
            },
        };
        // Initialize tool manager and integrations
        geminiToolManager = new BuiltinToolManager(config);
        await geminiToolManager.initialize();
        openaiIntegration = new OpenAIBuiltinToolsIntegration(config);
        await openaiIntegration.initialize();
        anthropicIntegration = new AnthropicBuiltinToolsIntegration(config);
        await anthropicIntegration.initialize();
        // Mock execution context
        mockContext = {
            signal: new AbortController().signal,
            onProgress: vi.fn(),
            onConfirmation: vi.fn().mockResolvedValue('proceed'),
        };
    });
    afterEach(async () => {
        await geminiToolManager?.destroy();
        await openaiIntegration?.destroy();
        await anthropicIntegration?.destroy();
    });
    /**
     * Verify that all providers expose the same set of 11 built-in tools
     */
    describe('Tool Availability Parity', () => {
        it('should expose identical tool sets across all providers', async () => {
            const geminiTools = await geminiToolManager.getAvailableTools();
            const openaiTools = await openaiIntegration.getAvailableTools();
            const anthropicTools = await anthropicIntegration.getAvailableTools();
            const geminiToolNames = geminiTools.map(t => t.name).sort();
            const openaiToolNames = openaiTools.map(t => t.name).sort();
            const anthropicToolNames = anthropicTools.map(t => t.name).sort();
            // All providers should have the same tool names
            expect(openaiToolNames).toEqual(geminiToolNames);
            expect(anthropicToolNames).toEqual(geminiToolNames);
            // Verify we have exactly 11 built-in tools
            expect(geminiToolNames).toHaveLength(11);
        });
        it('should have identical tool schemas across providers', async () => {
            const geminiTools = await geminiToolManager.getAvailableTools();
            const openaiTools = await openaiIntegration.getAvailableTools();
            const anthropicTools = await anthropicIntegration.getAvailableTools();
            // Create maps for easy lookup
            const geminiMap = new Map(geminiTools.map(t => [t.name, t]));
            const openaiMap = new Map(openaiTools.map(t => [t.name, t]));
            const anthropicMap = new Map(anthropicTools.map(t => [t.name, t]));
            for (const toolName of geminiMap.keys()) {
                const geminiTool = geminiMap.get(toolName);
                const openaiTool = openaiMap.get(toolName);
                const anthropicTool = anthropicMap.get(toolName);
                // Tool descriptions should match
                expect(openaiTool.description).toBe(geminiTool.description);
                expect(anthropicTool.description).toBe(geminiTool.description);
                // Parameter schemas should match
                expect(openaiTool.parameters).toEqual(geminiTool.parameters);
                expect(anthropicTool.parameters).toEqual(geminiTool.parameters);
            }
        });
    });
    /**
     * Verify file system tools (7 tools) work identically
     */
    describe('File System Tools Parity', () => {
        const fileSystemTools = [
            'read_file', 'write_file', 'edit_file', 'ls',
            'glob', 'grep', 'read_many_files'
        ];
        it.each(fileSystemTools)('should execute %s identically across providers', async (toolName) => {
            const toolCall = {
                id: 'test-call-' + toolName,
                name: toolName,
                parameters: getTestParameters(toolName),
            };
            // Execute on all providers
            const geminiResult = await geminiToolManager.executeTool(toolCall, mockContext);
            const openaiResult = await openaiIntegration.executeTool(toolCall, mockContext);
            const anthropicResult = await anthropicIntegration.executeTool(toolCall, mockContext);
            // Results should have same structure and error status
            expect(openaiResult.isError).toBe(geminiResult.isError);
            expect(anthropicResult.isError).toBe(geminiResult.isError);
            // Content should be identical for successful operations
            if (!geminiResult.isError) {
                expect(openaiResult.content).toBe(geminiResult.content);
                expect(anthropicResult.content).toBe(geminiResult.content);
            }
        });
        it('should handle file system security boundaries identically', async () => {
            const toolCall = {
                id: 'security-test',
                name: 'read_file',
                parameters: { file_path: '/etc/passwd' }, // Should be blocked
            };
            const geminiResult = await geminiToolManager.executeTool(toolCall, mockContext);
            const openaiResult = await openaiIntegration.executeTool(toolCall, mockContext);
            const anthropicResult = await anthropicIntegration.executeTool(toolCall, mockContext);
            // All should handle security violations identically
            expect(geminiResult.isError).toBe(true);
            expect(openaiResult.isError).toBe(true);
            expect(anthropicResult.isError).toBe(true);
            // Error messages should indicate security violation
            expect(geminiResult.content).toContain('security');
            expect(openaiResult.content).toContain('security');
            expect(anthropicResult.content).toContain('security');
        });
    });
    /**
     * Verify web tools (2 tools) work identically
     */
    describe('Web Tools Parity', () => {
        const webTools = ['web_fetch', 'google_web_search'];
        it.each(webTools)('should execute %s identically across providers', async (toolName) => {
            const toolCall = {
                id: 'test-call-' + toolName,
                name: toolName,
                parameters: getTestParameters(toolName),
            };
            // Execute on all providers
            const geminiResult = await geminiToolManager.executeTool(toolCall, mockContext);
            const openaiResult = await openaiIntegration.executeTool(toolCall, mockContext);
            const anthropicResult = await anthropicIntegration.executeTool(toolCall, mockContext);
            // Results should have same structure and error status
            expect(openaiResult.isError).toBe(geminiResult.isError);
            expect(anthropicResult.isError).toBe(geminiResult.isError);
            // Metadata should be consistent
            if (geminiResult.metadata) {
                expect(openaiResult.metadata).toBeDefined();
                expect(anthropicResult.metadata).toBeDefined();
            }
        });
        it('should handle web security restrictions identically', async () => {
            const toolCall = {
                id: 'web-security-test',
                name: 'web_fetch',
                parameters: {
                    url: 'http://192.168.1.1/admin', // Private IP - should be blocked
                    prompt: 'Get content'
                },
            };
            const geminiResult = await geminiToolManager.executeTool(toolCall, mockContext);
            const openaiResult = await openaiIntegration.executeTool(toolCall, mockContext);
            const anthropicResult = await anthropicIntegration.executeTool(toolCall, mockContext);
            // All should block private IP access
            expect(geminiResult.isError).toBe(true);
            expect(openaiResult.isError).toBe(true);
            expect(anthropicResult.isError).toBe(true);
            // Error messages should indicate blocked URL
            expect(geminiResult.content).toContain('blocked');
            expect(openaiResult.content).toContain('blocked');
            expect(anthropicResult.content).toContain('blocked');
        });
    });
    /**
     * Verify system tools (2 tools) work identically
     */
    describe('System Tools Parity', () => {
        const systemTools = ['run_shell_command', 'save_memory'];
        it.each(systemTools)('should execute %s identically across providers', async (toolName) => {
            const toolCall = {
                id: 'test-call-' + toolName,
                name: toolName,
                parameters: getTestParameters(toolName),
            };
            // Execute on all providers
            const geminiResult = await geminiToolManager.executeTool(toolCall, mockContext);
            const openaiResult = await openaiIntegration.executeTool(toolCall, mockContext);
            const anthropicResult = await anthropicIntegration.executeTool(toolCall, mockContext);
            // Results should have same structure and error status
            expect(openaiResult.isError).toBe(geminiResult.isError);
            expect(anthropicResult.isError).toBe(geminiResult.isError);
            // For successful operations, behavior should be identical
            if (!geminiResult.isError) {
                expect(openaiResult.toolCallId).toBe(toolCall.id);
                expect(anthropicResult.toolCallId).toBe(toolCall.id);
            }
        });
        it('should handle shell command security identically', async () => {
            const toolCall = {
                id: 'shell-security-test',
                name: 'run_shell_command',
                parameters: { command: 'rm -rf /' }, // Dangerous command - should be blocked
            };
            const geminiResult = await geminiToolManager.executeTool(toolCall, mockContext);
            const openaiResult = await openaiIntegration.executeTool(toolCall, mockContext);
            const anthropicResult = await anthropicIntegration.executeTool(toolCall, mockContext);
            // All should block dangerous commands
            expect(geminiResult.isError).toBe(true);
            expect(openaiResult.isError).toBe(true);
            expect(anthropicResult.isError).toBe(true);
            // Error messages should indicate command blocked
            expect(geminiResult.content).toContain('blocked');
            expect(openaiResult.content).toContain('blocked');
            expect(anthropicResult.content).toContain('blocked');
        });
    });
    /**
     * Verify confirmation flows work identically
     */
    describe('Confirmation Flow Parity', () => {
        it('should handle confirmation requests identically across providers', async () => {
            const toolCall = {
                id: 'confirmation-test',
                name: 'run_shell_command',
                parameters: { command: 'echo test' }, // Requires confirmation
            };
            // Mock confirmation to test flow
            const confirmationSpy = vi.fn().mockResolvedValue('proceed');
            const contextWithConfirmation = {
                ...mockContext,
                onConfirmation: confirmationSpy,
            };
            // Execute on all providers
            await geminiToolManager.executeTool(toolCall, contextWithConfirmation);
            await openaiIntegration.executeTool(toolCall, contextWithConfirmation);
            await anthropicIntegration.executeTool(toolCall, contextWithConfirmation);
            // All providers should have called confirmation
            expect(confirmationSpy).toHaveBeenCalledTimes(3);
            // Confirmation requests should have consistent structure
            const calls = confirmationSpy.mock.calls;
            expect(calls[1]).toEqual(calls[0]); // OpenAI matches Gemini
            expect(calls[2]).toEqual(calls[0]); // Anthropic matches Gemini
        });
        it('should handle confirmation cancellation identically', async () => {
            const toolCall = {
                id: 'cancellation-test',
                name: 'write_file',
                parameters: {
                    file_path: '/tmp/test.txt',
                    content: 'test content'
                },
            };
            // Mock confirmation to cancel
            const contextWithCancellation = {
                ...mockContext,
                onConfirmation: vi.fn().mockResolvedValue('cancel'),
            };
            // Execute on all providers
            const geminiResult = await geminiToolManager.executeTool(toolCall, contextWithCancellation);
            const openaiResult = await openaiIntegration.executeTool(toolCall, contextWithCancellation);
            const anthropicResult = await anthropicIntegration.executeTool(toolCall, contextWithCancellation);
            // All should handle cancellation identically
            expect(geminiResult.isError).toBe(false); // Cancellation is not an error
            expect(openaiResult.isError).toBe(false);
            expect(anthropicResult.isError).toBe(false);
            expect(geminiResult.content).toContain('cancelled');
            expect(openaiResult.content).toContain('cancelled');
            expect(anthropicResult.content).toContain('cancelled');
        });
    });
    /**
     * Verify performance characteristics are consistent
     */
    describe('Performance Consistency', () => {
        it('should have similar execution times across providers', async () => {
            const toolCall = {
                id: 'performance-test',
                name: 'ls',
                parameters: { path: '.' },
            };
            // Measure execution times
            const startGemini = performance.now();
            await geminiToolManager.executeTool(toolCall, mockContext);
            const geminiTime = performance.now() - startGemini;
            const startOpenAI = performance.now();
            await openaiIntegration.executeTool(toolCall, mockContext);
            const openaiTime = performance.now() - startOpenAI;
            const startAnthropic = performance.now();
            await anthropicIntegration.executeTool(toolCall, mockContext);
            const anthropicTime = performance.now() - startAnthropic;
            // Execution times should be within reasonable variance
            const maxTime = Math.max(geminiTime, openaiTime, anthropicTime);
            const minTime = Math.min(geminiTime, openaiTime, anthropicTime);
            // No provider should be more than 3x slower than the fastest
            expect(maxTime / minTime).toBeLessThan(3);
        });
        it('should report consistent performance metrics', async () => {
            const toolCall = {
                id: 'metrics-test',
                name: 'read_file',
                parameters: { file_path: 'package.json' },
            };
            // Execute multiple times to generate metrics
            for (let i = 0; i < 5; i++) {
                await geminiToolManager.executeTool(toolCall, mockContext);
                await openaiIntegration.executeTool(toolCall, mockContext);
                await anthropicIntegration.executeTool(toolCall, mockContext);
            }
            // Get performance metrics
            const geminiMetrics = geminiToolManager.getPerformanceMetrics();
            const openaiMetrics = openaiIntegration.getPerformanceMetrics();
            const anthropicMetrics = anthropicIntegration.getPerformanceMetrics();
            // All should have recorded the same number of executions
            expect(geminiMetrics.overall.totalExecutions).toBe(5);
            expect(openaiMetrics.overall.totalExecutions).toBe(5);
            expect(anthropicMetrics.overall.totalExecutions).toBe(5);
        });
    });
    /**
     * Verify error handling is consistent across providers
     */
    describe('Error Handling Consistency', () => {
        it('should handle invalid parameters identically', async () => {
            const toolCall = {
                id: 'invalid-params-test',
                name: 'read_file',
                parameters: {}, // Missing required file_path parameter
            };
            const geminiResult = await geminiToolManager.executeTool(toolCall, mockContext);
            const openaiResult = await openaiIntegration.executeTool(toolCall, mockContext);
            const anthropicResult = await anthropicIntegration.executeTool(toolCall, mockContext);
            // All should return errors for invalid parameters
            expect(geminiResult.isError).toBe(true);
            expect(openaiResult.isError).toBe(true);
            expect(anthropicResult.isError).toBe(true);
            // Error messages should indicate parameter issue
            expect(geminiResult.content).toContain('parameter');
            expect(openaiResult.content).toContain('parameter');
            expect(anthropicResult.content).toContain('parameter');
        });
        it('should handle non-existent tools identically', async () => {
            const toolCall = {
                id: 'nonexistent-test',
                name: 'nonexistent_tool',
                parameters: {},
            };
            const geminiResult = await geminiToolManager.executeTool(toolCall, mockContext);
            const openaiResult = await openaiIntegration.executeTool(toolCall, mockContext);
            const anthropicResult = await anthropicIntegration.executeTool(toolCall, mockContext);
            // All should return errors for non-existent tools
            expect(geminiResult.isError).toBe(true);
            expect(openaiResult.isError).toBe(true);
            expect(anthropicResult.isError).toBe(true);
            // Error messages should indicate tool not found
            expect(geminiResult.content).toContain('not found');
            expect(openaiResult.content).toContain('not found');
            expect(anthropicResult.content).toContain('not found');
        });
    });
});
/**
 * Get test parameters for different tool types
 */
function getTestParameters(toolName) {
    const parameterMap = {
        read_file: { file_path: 'package.json' },
        write_file: { file_path: '/tmp/test.txt', content: 'test' },
        edit_file: { file_path: '/tmp/test.txt', old_text: 'old', new_text: 'new' },
        ls: { path: '.' },
        glob: { pattern: '*.ts' },
        grep: { pattern: 'test', glob: '*.ts' },
        read_many_files: { file_paths: ['package.json'] },
        web_fetch: { url: 'https://example.com', prompt: 'Get content' },
        google_web_search: { query: 'test search' },
        run_shell_command: { command: 'echo test' },
        save_memory: { content: 'test memory', tags: ['test'] },
    };
    return parameterMap[toolName] || {};
}
//# sourceMappingURL=tool-parity-verification.test.js.map