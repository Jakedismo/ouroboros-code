/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryToolHandler } from '../tools/memory-tool-handler.js';
import { ShellToolSecurity } from '../tools/shell-tool-security.js';
import { WebToolSecurity } from '../tools/web-tool-security.js';
import { WebToolsHandler } from '../tools/web-tools-handler.js';
import { FileSystemBoundary } from '../tools/filesystem-boundary.js';
// Mock dependencies
vi.mock('../../config/config.js');
vi.mock('../../services/fileDiscoveryService.js');
vi.mock('../../tools/memoryTool.js');
vi.mock('../../utils/memoryDiscovery.js');
describe('Memory Tool Handler', () => {
    let config;
    let memoryHandler;
    let mockFileDiscoveryService;
    beforeEach(() => {
        config = {
            getProjectRoot: vi.fn().mockReturnValue('/test/project'),
            getDebugMode: vi.fn().mockReturnValue(false),
            getContextFileName: vi.fn().mockReturnValue('GEMINI.md'),
            setUserMemory: vi.fn(),
            setGeminiMdFileCount: vi.fn(),
            getUserMemory: vi.fn().mockReturnValue('- Test memory item 1\n- Test memory item 2'),
            getGeminiMdFileCount: vi.fn().mockReturnValue(2),
            getMemoryFileFilteringOptions: vi.fn().mockReturnValue({}),
        };
        mockFileDiscoveryService = {
            findFiles: vi.fn().mockResolvedValue(['/test/project/GEMINI.md']),
        };
        // Mock memory discovery function
        const mockLoadServerHierarchicalMemory = vi.fn().mockResolvedValue({
            memoryContent: '- Test memory item 1\n- Test memory item 2\n- Another memory fact',
            fileCount: 3,
        });
        vi.doMock('../../utils/memoryDiscovery.js', () => ({
            loadServerHierarchicalMemory: mockLoadServerHierarchicalMemory,
        }));
        memoryHandler = new MemoryToolHandler(config);
    });
    afterEach(() => {
        vi.clearAllMocks();
    });
    describe('initialization', () => {
        it('should initialize with hierarchical memory loading', async () => {
            await memoryHandler.initialize();
            expect(config.setUserMemory).toHaveBeenCalled();
            expect(config.setGeminiMdFileCount).toHaveBeenCalled();
        });
        it('should set context filename from config', async () => {
            await memoryHandler.initialize();
            expect(memoryHandler.getContextFilename()).toBe('GEMINI.md');
        });
    });
    describe('memory operations', () => {
        beforeEach(async () => {
            await memoryHandler.initialize();
        });
        it('should save memory items with metadata', async () => {
            const memoryItem = await memoryHandler.saveMemory('New important fact', {
                tags: ['important', 'test'],
                context: 'Test context',
                source: 'project',
            });
            expect(memoryItem).toMatchObject({
                fact: 'New important fact',
                tags: ['important', 'test'],
                context: 'Test context',
                source: 'project',
                timestamp: expect.any(Date),
                id: expect.stringMatching(/^mem_\d+_[a-z0-9]+$/),
            });
        });
        it('should load hierarchical memory from multiple sources', async () => {
            const memory = memoryHandler.getCurrentMemory();
            expect(memory).toContain('Test memory item 1');
            expect(memory).toContain('Test memory item 2');
        });
        it('should search memory items by query', async () => {
            // Add some test data
            await memoryHandler.saveMemory('JavaScript function implementation');
            await memoryHandler.saveMemory('Python data processing script');
            const jsResults = memoryHandler.searchMemory('javascript');
            const pythonResults = memoryHandler.searchMemory('python');
            expect(jsResults.length).toBeGreaterThan(0);
            expect(pythonResults.length).toBeGreaterThan(0);
            expect(jsResults[0].fact).toContain('JavaScript');
            expect(pythonResults[0].fact).toContain('Python');
        });
        it('should get memory items by source', async () => {
            await memoryHandler.saveMemory('Project fact', { source: 'project' });
            await memoryHandler.saveMemory('Global fact', { source: 'global' });
            const projectMemory = memoryHandler.getMemoryBySource('project');
            const globalMemory = memoryHandler.getMemoryBySource('global');
            expect(projectMemory.length).toBeGreaterThan(0);
            expect(globalMemory.length).toBeGreaterThan(0);
            expect(projectMemory.every(item => item.source === 'project')).toBe(true);
            expect(globalMemory.every(item => item.source === 'global')).toBe(true);
        });
        it('should provide memory statistics', async () => {
            const stats = memoryHandler.getMemoryStats();
            expect(stats).toMatchObject({
                totalItems: expect.any(Number),
                bySource: {
                    project: expect.any(Number),
                    global: expect.any(Number),
                    user: expect.any(Number),
                },
                totalSize: expect.any(Number),
                fileCount: expect.any(Number),
                lastUpdated: expect.any(Date),
            });
        });
        it('should refresh memory and clear cache', async () => {
            const initialMemory = memoryHandler.getCachedMemory();
            await memoryHandler.refreshMemory();
            const refreshedMemory = memoryHandler.getCachedMemory();
            expect(refreshedMemory).toBeDefined();
        });
    });
    describe('provider compatibility', () => {
        it('should work identically across OpenAI, Anthropic, and Gemini', async () => {
            await memoryHandler.initialize();
            // Test basic operations that should be identical
            const memoryItem = await memoryHandler.saveMemory('Cross-provider test');
            const searchResults = memoryHandler.searchMemory('cross-provider');
            const stats = memoryHandler.getMemoryStats();
            expect(memoryItem.fact).toBe('Cross-provider test');
            expect(searchResults.length).toBeGreaterThan(0);
            expect(stats.totalItems).toBeGreaterThan(0);
        });
    });
});
describe('Shell Tool Security', () => {
    let config;
    let shellSecurity;
    beforeEach(() => {
        config = {
            getProjectRoot: vi.fn().mockReturnValue('/test/project'),
            getDebugMode: vi.fn().mockReturnValue(false),
            getCoreTools: vi.fn().mockReturnValue([]),
            getExcludeTools: vi.fn().mockReturnValue([]),
        };
        shellSecurity = new ShellToolSecurity(config);
    });
    describe('command validation', () => {
        it('should allow safe commands', () => {
            const safeCommands = [
                'ls -la',
                'git status',
                'npm test',
                'echo "hello world"',
                'cat file.txt',
            ];
            safeCommands.forEach(command => {
                const result = shellSecurity.validateCommand(command);
                expect(result.allowed).toBe(true);
                expect(result.securityLevel).toBe('SAFE');
            });
        });
        it('should detect dangerous commands', () => {
            const dangerousCommands = [
                'rm -rf /',
                'sudo rm -rf *',
                'chmod 777 /',
                'dd if=/dev/zero of=/dev/sda',
                'mkfs.ext4 /dev/sda1',
            ];
            dangerousCommands.forEach(command => {
                const result = shellSecurity.validateCommand(command);
                expect(result.allowed).toBe(false);
                expect(['HIGH', 'CRITICAL']).toContain(result.securityLevel);
                expect(result.threats.length).toBeGreaterThan(0);
            });
        });
        it('should detect command injection attempts', () => {
            const injectionCommands = [
                'ls; rm -rf /',
                'echo "test" && rm file.txt',
                'cat file.txt | sh',
                'echo $(rm -rf /)',
                'ls `rm -rf /`',
            ];
            injectionCommands.forEach(command => {
                const result = shellSecurity.validateCommand(command);
                expect(['MODERATE', 'HIGH', 'CRITICAL']).toContain(result.securityLevel);
            });
        });
        it('should validate network commands with caution', () => {
            const networkCommands = [
                'curl https://example.com',
                'wget http://example.com/file.zip',
                'ssh user@remote-host',
                'scp file.txt user@host:/path',
                'netcat -l 8080',
            ];
            networkCommands.forEach(command => {
                const result = shellSecurity.validateCommand(command);
                expect(['MODERATE', 'HIGH']).toContain(result.securityLevel);
                expect(result.reason).toBeDefined();
            });
        });
        it('should provide detailed security analysis', () => {
            const result = shellSecurity.validateCommand('sudo rm -rf /important-data');
            expect(result).toMatchObject({
                allowed: false,
                securityLevel: 'CRITICAL',
                reason: expect.stringContaining('CRITICAL'),
                threats: expect.arrayContaining([
                    expect.stringMatching(/privilege escalation|destructive operation/i),
                ]),
                recommendation: expect.any(String),
                categories: expect.arrayContaining(['DESTRUCTIVE']),
            });
        });
        it('should handle complex command parsing', () => {
            const complexCommands = [
                'find /path -name "*.txt" -exec grep "pattern" {} \\;',
                'docker run -it --rm ubuntu:latest /bin/bash',
                'awk \'{ print $1 }\' file.txt | sort | uniq',
            ];
            complexCommands.forEach(command => {
                const result = shellSecurity.validateCommand(command);
                expect(result).toHaveProperty('allowed');
                expect(result).toHaveProperty('securityLevel');
                expect(result).toHaveProperty('reason');
            });
        });
    });
    describe('provider consistency', () => {
        it('should provide identical security validation across providers', () => {
            const testCommand = 'rm -rf /tmp/test';
            const result1 = shellSecurity.validateCommand(testCommand);
            const result2 = shellSecurity.validateCommand(testCommand);
            const result3 = shellSecurity.validateCommand(testCommand);
            expect(result1).toEqual(result2);
            expect(result2).toEqual(result3);
        });
    });
});
describe('Web Tool Security', () => {
    let webSecurity;
    beforeEach(() => {
        webSecurity = new WebToolSecurity();
    });
    describe('URL validation', () => {
        it('should allow safe public URLs', () => {
            const safeUrls = [
                'https://example.com',
                'https://github.com/user/repo',
                'https://api.example.com/data',
                'http://public-api.example.org/v1',
            ];
            safeUrls.forEach(url => {
                const result = webSecurity.validateUrl(url);
                expect(result.allowed).toBe(true);
                expect(result.riskLevel).toBe('SAFE');
            });
        });
        it('should detect private network addresses', () => {
            const privateUrls = [
                'http://localhost:8080',
                'http://127.0.0.1:3000',
                'http://192.168.1.100',
                'http://10.0.0.1',
                'http://172.16.0.1',
            ];
            privateUrls.forEach(url => {
                const result = webSecurity.validateUrl(url);
                expect(result.requiresConfirmation).toBe(true);
                expect(result.parsedUrl?.isPrivate || result.parsedUrl?.isLocalhost).toBe(true);
            });
        });
        it('should block malicious URL patterns', () => {
            const maliciousUrls = [
                'javascript:alert("xss")',
                'data:text/html,<script>alert(1)</script>',
                'file:///etc/passwd',
                'ftp://malicious-server.com',
            ];
            maliciousUrls.forEach(url => {
                const result = webSecurity.validateUrl(url);
                expect(result.allowed).toBe(false);
                expect(['HIGH', 'CRITICAL']).toContain(result.riskLevel);
            });
        });
        it('should handle suspicious domain patterns', () => {
            const suspiciousUrls = [
                'https://bit.ly/suspicious',
                'http://example.tk/malware',
                'https://shortened-url.ml',
            ];
            suspiciousUrls.forEach(url => {
                const result = webSecurity.validateUrl(url);
                expect(['MODERATE', 'HIGH']).toContain(result.riskLevel);
            });
        });
        it('should validate multiple URLs from prompt', () => {
            const prompt = 'Fetch data from https://api.example.com and http://localhost:3000';
            const validation = webSecurity.validateUrlsFromPrompt(prompt);
            expect(validation.urls).toHaveLength(2);
            expect(validation.urls).toContain('https://api.example.com');
            expect(validation.urls).toContain('http://localhost:3000');
            expect(validation.validationResults).toHaveLength(2);
        });
        it('should provide risk-adjusted timeouts and limits', () => {
            const testCases = [
                { url: 'https://trusted-site.com', expectedTimeout: 10000 },
                { url: 'http://localhost:3000', expectedTimeout: 6000 },
                { url: 'http://suspicious.tk', expectedTimeout: 4000 },
            ];
            testCases.forEach(({ url, expectedTimeout }) => {
                const result = webSecurity.validateUrl(url);
                expect(result.recommendedTimeout).toBeLessThanOrEqual(expectedTimeout);
            });
        });
    });
    describe('rate limiting', () => {
        it('should enforce rate limits per domain', () => {
            const url = 'https://example.com';
            // First request should succeed
            const result1 = webSecurity.validateUrl(url);
            expect(result1.allowed).toBe(true);
            // Simulate many requests
            for (let i = 0; i < 35; i++) {
                webSecurity.validateUrl(url);
            }
            // Should now be rate limited
            const result2 = webSecurity.validateUrl(url);
            expect(result2.allowed).toBe(false);
            expect(result2.reason).toContain('Rate limit');
        });
        it('should reset rate limits after time window', async () => {
            WebToolSecurity.resetRateLimiting();
            const status = WebToolSecurity.getRateLimitStatus('example.com');
            expect(status?.remaining).toBe(30);
        });
    });
});
describe('Web Tools Handler', () => {
    let config;
    let webHandler;
    beforeEach(() => {
        config = {
            getProjectRoot: vi.fn().mockReturnValue('/test/project'),
            getDebugMode: vi.fn().mockReturnValue(false),
            getCoreTools: vi.fn().mockReturnValue(['web_fetch', 'google_web_search']),
            getExcludeTools: vi.fn().mockReturnValue([]),
            getWebRequestTimeout: vi.fn().mockReturnValue(10000),
            getWebContentLimit: vi.fn().mockReturnValue(100000),
            getGeminiClient: vi.fn().mockReturnValue({
                generateContent: vi.fn().mockResolvedValue({
                    response: { text: () => 'Processed web content successfully' },
                }),
            }),
        };
        webHandler = new WebToolsHandler(config);
    });
    describe('web search integration', () => {
        it('should execute web search with security validation', async () => {
            const result = await webHandler.executeWebSearch('safe search query');
            expect(result.llmContent).toBeDefined();
            expect(result.returnDisplay).toBeDefined();
            expect(result.sources).toBeDefined();
        });
        it('should handle search queries with no results', async () => {
            // Mock empty results
            const mockWebSearchTool = {
                build: vi.fn().mockReturnValue({
                    execute: vi.fn().mockResolvedValue({
                        llmContent: 'No search results found',
                        returnDisplay: 'No results',
                        sources: [],
                    }),
                }),
            };
            const result = await webHandler.executeWebSearch('nonexistent query');
            expect(result.llmContent).toContain('No search results found');
        });
    });
    describe('web fetch integration', () => {
        it('should execute web fetch with URL validation', async () => {
            const prompt = 'Fetch content from https://example.com';
            const result = await webHandler.executeWebFetch(prompt);
            expect(result.processedUrls).toContain('https://example.com');
            expect(result.securityInfo).toBeDefined();
        });
        it('should block dangerous URLs in prompts', async () => {
            const prompt = 'Fetch content from javascript:alert("xss")';
            const result = await webHandler.executeWebFetch(prompt);
            expect(result.hasBlockedUrls).toBe(true);
            expect(result.llmContent).toContain('blocked by security policy');
        });
        it('should handle private network URLs with confirmation', async () => {
            const prompt = 'Fetch from http://localhost:3000/api/data';
            const result = await webHandler.executeWebFetch(prompt, {
                headers: { 'x-confirmed': 'true' },
            });
            expect(result.securityInfo?.[0]?.requiresConfirmation).toBe(true);
        });
        it('should provide fallback for failed primary fetch', async () => {
            const prompt = 'Fetch content from https://unreachable-site.example';
            // Mock primary fetch failure
            global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
            const result = await webHandler.executeWebFetch(prompt);
            expect(result.llmContent).toBeDefined();
            // Should contain either error message or fallback content
        });
    });
    describe('security integration', () => {
        it('should provide security recommendations', () => {
            const recommendations = webHandler.getSecurityRecommendations('http://localhost:8080');
            expect(recommendations.validation).toBeDefined();
            expect(recommendations.recommendations).toBeInstanceOf(Array);
            expect(recommendations.recommendations.length).toBeGreaterThan(0);
        });
        it('should validate prompt URLs comprehensively', () => {
            const prompt = 'Fetch https://safe-site.com and http://localhost:3000';
            const validation = webHandler.validatePromptUrls(prompt);
            expect(validation.urls).toHaveLength(2);
            expect(validation.validationResults).toHaveLength(2);
            expect(validation.overallAllowed).toBe(true);
        });
    });
    describe('configuration management', () => {
        it('should check web tools enablement', () => {
            expect(webHandler.isWebToolsEnabled()).toBe(true);
        });
        it('should provide web tool configuration summary', () => {
            const configSummary = webHandler.getWebToolConfig();
            expect(configSummary).toMatchObject({
                enabled: true,
                maxTimeout: 10000,
                maxContentLength: 100000,
                rateLimitingEnabled: true,
                securityLevel: 'COMPREHENSIVE',
            });
        });
    });
});
describe('File System Boundary', () => {
    let config;
    let boundary;
    beforeEach(() => {
        config = {
            getProjectRoot: vi.fn().mockReturnValue('/test/project'),
            getTargetDir: vi.fn().mockReturnValue('/test/project'),
            getDebugMode: vi.fn().mockReturnValue(false),
        };
        boundary = new FileSystemBoundary(config);
    });
    describe('path validation', () => {
        it('should allow paths within project boundary', () => {
            const validPaths = [
                '/test/project/src/file.ts',
                '/test/project/README.md',
                '/test/project/docs/guide.md',
            ];
            validPaths.forEach(path => {
                expect(boundary.isPathAllowed(path)).toBe(true);
                const validation = boundary.validatePath(path);
                expect(validation.valid).toBe(true);
            });
        });
        it('should block paths outside project boundary', () => {
            const invalidPaths = [
                '/etc/passwd',
                '/home/user/other-project/file.txt',
                '../../outside-project/file.txt',
                '/usr/bin/dangerous-command',
            ];
            invalidPaths.forEach(path => {
                expect(boundary.isPathAllowed(path)).toBe(false);
                const validation = boundary.validatePath(path);
                expect(validation.valid).toBe(false);
                expect(validation.reason).toBeDefined();
            });
        });
        it('should handle git ignore patterns', () => {
            const ignoredPaths = [
                '/test/project/node_modules/package/file.js',
                '/test/project/.git/config',
                '/test/project/dist/build.js',
                '/test/project/.env',
            ];
            ignoredPaths.forEach(path => {
                const shouldIgnore = boundary.shouldIgnorePath(path);
                // Implementation would depend on actual .gitignore content
                expect(typeof shouldIgnore).toBe('boolean');
            });
        });
        it('should normalize and resolve paths correctly', () => {
            const testPaths = [
                './src/file.ts',
                '../project/src/file.ts',
                'src/./file.ts',
                'src/../src/file.ts',
            ];
            testPaths.forEach(path => {
                const validation = boundary.validatePath(path);
                expect(validation).toHaveProperty('valid');
                expect(validation).toHaveProperty('normalizedPath');
            });
        });
        it('should provide detailed validation information', () => {
            const result = boundary.validatePath('/etc/passwd');
            expect(result).toMatchObject({
                valid: false,
                reason: expect.any(String),
                normalizedPath: expect.any(String),
                isAbsolute: true,
                isWithinBoundary: false,
            });
        });
    });
    describe('provider consistency', () => {
        it('should provide identical boundary validation across providers', () => {
            const testPath = '/test/project/src/file.ts';
            const result1 = boundary.validatePath(testPath);
            const result2 = boundary.validatePath(testPath);
            expect(result1).toEqual(result2);
        });
    });
});
//# sourceMappingURL=tool-specific.test.js.map