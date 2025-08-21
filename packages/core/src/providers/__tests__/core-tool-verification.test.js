/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { BuiltinToolManager } from '../tools/builtin-tool-manager.js';
/**
 * Core verification test for the BuiltinToolManager to ensure all 11 built-in tools
 * are available and can be executed successfully.
 */
describe('Core Built-in Tools Verification', () => {
    let toolManager;
    let mockContext;
    let mockConfig;
    // The expected 11 built-in tools
    const expectedTools = [
        'read_file', 'write_file', 'edit_file', 'ls', 'glob', 'grep', 'read_many_files', // File system (7)
        'web_fetch', 'google_web_search', // Web (2)
        'run_shell_command', 'save_memory' // System (2)
    ];
    beforeEach(async () => {
        // Create comprehensive mock config
        mockConfig = {
            createToolRegistry: vi.fn().mockResolvedValue({
                getAllTools: vi.fn().mockReturnValue(expectedTools.map(name => ({
                    name,
                    description: `${name} description`,
                    schema: { name, description: `${name} description` },
                    build: vi.fn().mockReturnValue({
                        shouldConfirmExecute: vi.fn().mockResolvedValue(null),
                        execute: vi.fn().mockResolvedValue({
                            llmContent: `Mock result from ${name}`,
                            returnDisplay: `Display content from ${name}`,
                        }),
                    }),
                    displayName: name.replace(/_/g, ' '),
                }))),
            }),
            getProjectRoot: () => process.cwd(),
            getWorkingDirectory: () => process.cwd(),
            getProxy: () => null,
            getAllowedHosts: () => ['*'],
            getBlockedHosts: () => [],
            allowCodeExecution: true,
            allowNetworkAccess: true,
            maxConcurrentJobs: 4,
            toolsConfig: {
                enabled: true,
                confirmationRequired: false,
                securityLevel: 'MODERATE',
            },
            // Add common config methods that might be needed
            getRateLimit: () => ({ requestsPerMinute: 60, burstSize: 10 }),
            getTimeout: () => 30000,
            getUserAgent: () => 'builtin-tools-test',
            enableDebugLogging: false,
            // Web-specific config methods
            getWebRequestTimeout: () => 10000,
            getWebContentLimit: () => 10000000, // 10MB
            getMaxWebRequests: () => 10,
            getWebUserAgent: () => 'builtin-tools-test',
        };
        // Create mock execution context
        mockContext = {
            signal: new AbortController().signal,
            onProgress: vi.fn(),
            onConfirmation: vi.fn().mockResolvedValue('proceed'),
        };
        // Initialize tool manager
        toolManager = new BuiltinToolManager(mockConfig);
        await toolManager.initialize();
    });
    afterEach(async () => {
        await toolManager?.destroy();
    });
    describe('Tool Availability', () => {
        it('should expose all 11 built-in tools', async () => {
            const availableTools = await toolManager.getAvailableTools();
            const toolNames = availableTools.map(t => t.name).sort();
            expect(toolNames).toEqual(expectedTools.sort());
            expect(availableTools).toHaveLength(11);
        });
        it('should categorize tools correctly', async () => {
            const availableTools = await toolManager.getAvailableTools();
            const toolsByCategory = availableTools.reduce((acc, tool) => {
                acc[tool.category] = (acc[tool.category] || 0) + 1;
                return acc;
            }, {});
            expect(toolsByCategory.filesystem).toBe(7);
            expect(toolsByCategory.web).toBe(2);
            expect(toolsByCategory.system).toBe(2);
        });
        it('should provide unified tool format', async () => {
            const unifiedTools = toolManager.getUnifiedTools();
            for (const tool of unifiedTools) {
                expect(tool).toHaveProperty('name');
                expect(tool).toHaveProperty('description');
                expect(tool).toHaveProperty('parameters');
                expect(tool.parameters).toHaveProperty('type', 'object');
            }
        });
    });
    describe('Tool Execution', () => {
        it.each(expectedTools)('should execute %s successfully', async (toolName) => {
            const toolCall = {
                id: `test-${toolName}`,
                name: toolName,
                parameters: getTestParameters(toolName),
            };
            const result = await toolManager.executeTool(toolCall, mockContext);
            expect(result).toBeDefined();
            expect(result.toolCallId).toBe(toolCall.id);
            expect(result.content).toContain(`Mock result from ${toolName}`);
            expect(result.isError).toBe(false);
        });
        it('should handle tool execution with performance tracking', async () => {
            const toolCall = {
                id: 'perf-test',
                name: 'read_file',
                parameters: { file_path: 'test.txt' },
            };
            // Execute multiple times to generate metrics
            for (let i = 0; i < 3; i++) {
                await toolManager.executeTool(toolCall, mockContext);
            }
            const metrics = toolManager.getPerformanceMetrics();
            expect(metrics.overall.totalExecutions).toBeGreaterThanOrEqual(3);
            expect(metrics.byTool.has('read_file')).toBe(true);
        });
        it('should handle multiple tool execution with coordination', async () => {
            const toolCalls = [
                { id: 'multi-1', name: 'read_file', parameters: { file_path: 'test1.txt' } },
                { id: 'multi-2', name: 'ls', parameters: { path: '.' } },
                { id: 'multi-3', name: 'write_file', parameters: { file_path: 'test2.txt', content: 'test' } },
            ];
            const results = await toolManager.executeMultipleTools(toolCalls, mockContext);
            expect(results.size).toBe(3);
            for (const toolCall of toolCalls) {
                expect(results.has(toolCall.id)).toBe(true);
                const result = results.get(toolCall.id);
                expect(result.isError).toBe(false);
            }
        });
    });
    describe('Error Handling', () => {
        it('should handle non-existent tool gracefully', async () => {
            const toolCall = {
                id: 'error-test',
                name: 'non_existent_tool',
                parameters: {},
            };
            const result = await toolManager.executeTool(toolCall, mockContext);
            expect(result.isError).toBe(true);
            expect(result.content).toContain('not found');
        });
        it('should handle execution errors gracefully', async () => {
            // Mock a tool that throws an error
            const errorToolCall = {
                id: 'error-execution',
                name: 'read_file',
                parameters: { file_path: 'non-existent.txt' },
            };
            // Mock the tool to throw an error
            const mockTool = {
                name: 'read_file',
                build: vi.fn().mockReturnValue({
                    shouldConfirmExecute: vi.fn().mockResolvedValue(null),
                    execute: vi.fn().mockRejectedValue(new Error('File not found')),
                }),
            };
            // Temporarily replace the tool
            toolManager.builtinTools.set('read_file', mockTool);
            const result = await toolManager.executeTool(errorToolCall, mockContext);
            expect(result.isError).toBe(true);
            expect(result.content).toContain('File not found');
        });
    });
    describe('Performance Features', () => {
        it('should provide execution time estimates', async () => {
            const toolCalls = [
                { id: 'est-1', name: 'read_file', parameters: { file_path: 'test.txt' } },
                { id: 'est-2', name: 'ls', parameters: { path: '.' } },
            ];
            const estimatedTime = toolManager.estimateExecutionTime(toolCalls);
            expect(estimatedTime).toBeGreaterThan(0);
        });
        it('should optimize tool execution order', async () => {
            const toolCalls = [
                { id: 'opt-1', name: 'web_fetch', parameters: { url: 'https://example.com', prompt: 'test' } },
                { id: 'opt-2', name: 'read_file', parameters: { file_path: 'test.txt' } },
                { id: 'opt-3', name: 'write_file', parameters: { file_path: 'output.txt', content: 'test' } },
            ];
            const optimizedOrder = toolManager.optimizeToolOrder(toolCalls);
            expect(optimizedOrder).toHaveLength(3);
            expect(optimizedOrder.map(t => t.id)).toEqual(expect.arrayContaining(['opt-1', 'opt-2', 'opt-3']));
        });
        it('should provide tool statistics', async () => {
            // Execute some tools to generate stats
            await toolManager.executeTool({ id: 'stats-1', name: 'read_file', parameters: { file_path: 'test.txt' } }, mockContext);
            await toolManager.executeTool({ id: 'stats-2', name: 'ls', parameters: { path: '.' } }, mockContext);
            const stats = toolManager.getToolStatistics();
            expect(stats.totalToolsAvailable).toBe(11);
            expect(stats.toolsByCategory.filesystem).toBe(7);
            expect(stats.toolsByCategory.web).toBe(2);
            expect(stats.toolsByCategory.system).toBe(2);
            expect(stats.executionStats.totalExecutions).toBeGreaterThan(0);
        });
    });
    describe('Cache Management', () => {
        it('should clear performance cache', async () => {
            // Execute some tools to populate cache
            await toolManager.executeTool({ id: 'cache-1', name: 'read_file', parameters: { file_path: 'test.txt' } }, mockContext);
            let metrics = toolManager.getPerformanceMetrics();
            expect(metrics.overall.totalExecutions).toBeGreaterThan(0);
            // Clear cache
            toolManager.clearPerformanceCache();
            metrics = toolManager.getPerformanceMetrics();
            expect(metrics.overall.totalExecutions).toBe(0);
        });
        it('should invalidate cache by tags', async () => {
            const invalidated = toolManager.invalidateCache(['file-ops', 'read-operations']);
            expect(typeof invalidated).toBe('number');
        });
    });
    describe('Specialized Handlers', () => {
        it('should provide access to specialized handlers', () => {
            const handlers = toolManager.getSpecializedHandlers();
            expect(handlers).toHaveProperty('memory');
            expect(handlers).toHaveProperty('web');
            expect(handlers).toHaveProperty('shell');
            expect(handlers).toHaveProperty('filesystem');
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
//# sourceMappingURL=core-tool-verification.test.js.map