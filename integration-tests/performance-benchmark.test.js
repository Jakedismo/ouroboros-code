/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
/**
 * Performance benchmarking tests for multi-LLM provider system
 *
 * These tests measure and compare:
 * - Response times across providers
 * - Tool execution performance
 * - Memory usage patterns
 * - Throughput characteristics
 * - Scalability metrics
 * - Error recovery times
 */
describe('Performance Benchmarking Tests', () => {
    let rig;
    beforeEach(() => {
        rig = new TestRig();
    });
    afterEach(async () => {
        await rig.cleanup();
    });
    // Helper function to get available providers
    const getAvailableProviders = () => {
        const providers = ['gemini'];
        if (process.env.OPENAI_API_KEY)
            providers.push('openai');
        if (process.env.ANTHROPIC_API_KEY)
            providers.push('anthropic');
        return providers;
    };
    // Helper function to create performance report
    const createPerformanceReport = (benchmarkName, results) => {
        console.log(`\n=== ${benchmarkName} Performance Report ===`);
        results.forEach((result) => {
            console.log(`${result.provider}:`);
            console.log(`  Duration: ${result.duration}ms`);
            console.log(`  Tool Calls: ${result.toolCalls}`);
            console.log(`  Response Length: ${result.responseLength} chars`);
            console.log(`  Success Rate: ${result.successRate}%`);
            if (result.avgToolTime) {
                console.log(`  Avg Tool Time: ${result.avgToolTime.toFixed(2)}ms`);
            }
            console.log('');
        });
        if (results.length > 1) {
            const fastest = Math.min(...results.map((r) => r.duration));
            const slowest = Math.max(...results.map((r) => r.duration));
            console.log(`Performance Range: ${fastest}ms - ${slowest}ms`);
            console.log(`Performance Ratio: ${(slowest / fastest).toFixed(2)}x`);
        }
        console.log('='.repeat(50));
    };
    describe('Basic Response Time Benchmarks', () => {
        it('should benchmark simple text generation across providers', async () => {
            const providers = getAvailableProviders();
            const results = [];
            for (const provider of providers) {
                rig.setup(`simple-text-${provider}-benchmark`);
                const startTime = Date.now();
                const args = provider === 'gemini' ? [] : ['--provider', provider];
                try {
                    const result = await rig.run('Generate a simple greeting message explaining what you are.', ...args);
                    const endTime = Date.now();
                    const duration = endTime - startTime;
                    expect(result).toBeTruthy();
                    results.push({
                        provider,
                        duration,
                        responseLength: result.length,
                        toolCalls: 0,
                        successRate: 100,
                        success: true,
                    });
                }
                catch {
                    console.warn(`${provider} failed in simple text benchmark:`, error.message);
                    results.push({
                        provider,
                        duration: -1,
                        responseLength: 0,
                        toolCalls: 0,
                        successRate: 0,
                        success: false,
                    });
                }
            }
            createPerformanceReport('Simple Text Generation', results);
            // All successful results should complete within reasonable time
            results
                .filter((r) => r.success)
                .forEach((result) => {
                expect(result.duration).toBeLessThan(15000); // 15 seconds max
                expect(result.responseLength).toBeGreaterThan(10);
            });
        });
        it('should benchmark tool execution performance', async () => {
            const providers = getAvailableProviders();
            const results = [];
            for (const provider of providers) {
                rig.setup(`tool-execution-${provider}-benchmark`);
                // Create test data
                rig.createFile('bench-test.txt', 'Benchmark test content for tool execution timing');
                const startTime = Date.now();
                const args = provider === 'gemini' ? [] : ['--provider', provider];
                try {
                    const result = await rig.run('Read bench-test.txt and create a summary file called summary.txt.', ...args);
                    const endTime = Date.now();
                    const duration = endTime - startTime;
                    expect(result).toBeTruthy();
                    const toolLogs = rig.readToolLogs();
                    const avgToolTime = toolLogs.length > 0
                        ? toolLogs.reduce((sum, log) => sum + log.toolRequest.duration_ms, 0) / toolLogs.length
                        : 0;
                    results.push({
                        provider,
                        duration,
                        responseLength: result.length,
                        toolCalls: toolLogs.length,
                        avgToolTime,
                        successRate: 100,
                        success: true,
                    });
                }
                catch {
                    console.warn(`${provider} failed in tool execution benchmark:`, error.message);
                    results.push({
                        provider,
                        duration: -1,
                        responseLength: 0,
                        toolCalls: 0,
                        successRate: 0,
                        success: false,
                    });
                }
            }
            createPerformanceReport('Tool Execution', results);
            // Validate tool execution performance
            results
                .filter((r) => r.success)
                .forEach((result) => {
                expect(result.duration).toBeLessThan(30000); // 30 seconds max
                expect(result.toolCalls).toBeGreaterThan(0);
                expect(result.avgToolTime).toBeGreaterThan(0);
            });
        });
    });
    describe('Complex Task Benchmarks', () => {
        it('should benchmark multi-step workflow performance', async () => {
            const providers = getAvailableProviders();
            const results = [];
            for (const provider of providers) {
                rig.setup(`workflow-${provider}-benchmark`);
                // Create complex test scenario
                rig.createFile('data1.txt', 'First dataset with important information');
                rig.createFile('data2.txt', 'Second dataset with different metrics');
                rig.createFile('config.json', '{"setting1": "value1", "setting2": 42}');
                const startTime = Date.now();
                const args = provider === 'gemini' ? [] : ['--provider', provider];
                try {
                    const result = await rig.run('Read all data files, analyze the JSON config, create a comprehensive report.txt with findings.', ...args);
                    const endTime = Date.now();
                    const duration = endTime - startTime;
                    expect(result).toBeTruthy();
                    const toolLogs = rig.readToolLogs();
                    const successfulTools = toolLogs.filter((log) => log.toolRequest.success).length;
                    const successRate = toolLogs.length > 0 ? (successfulTools / toolLogs.length) * 100 : 0;
                    results.push({
                        provider,
                        duration,
                        responseLength: result.length,
                        toolCalls: toolLogs.length,
                        successRate,
                        success: true,
                    });
                }
                catch {
                    console.warn(`${provider} failed in workflow benchmark:`, error.message);
                    results.push({
                        provider,
                        duration: -1,
                        responseLength: 0,
                        toolCalls: 0,
                        successRate: 0,
                        success: false,
                    });
                }
            }
            createPerformanceReport('Multi-step Workflow', results);
            // Validate workflow performance
            results
                .filter((r) => r.success)
                .forEach((result) => {
                expect(result.duration).toBeLessThan(60000); // 60 seconds max for complex workflow
                expect(result.toolCalls).toBeGreaterThanOrEqual(3); // Should use multiple tools
                expect(result.successRate).toBeGreaterThanOrEqual(75); // At least 75% tool success rate
            });
        });
        it('should benchmark large file processing performance', async () => {
            const providers = getAvailableProviders();
            const results = [];
            for (const provider of providers) {
                rig.setup(`large-file-${provider}-benchmark`);
                // Create large test file
                const largeContent = 'Line content '.repeat(1000) + '\n'.repeat(100);
                rig.createFile('large-file.txt', largeContent);
                const startTime = Date.now();
                const args = provider === 'gemini' ? [] : ['--provider', provider];
                try {
                    const result = await rig.run('Read large-file.txt and create a summary of its structure and content.', ...args);
                    const endTime = Date.now();
                    const duration = endTime - startTime;
                    expect(result).toBeTruthy();
                    const toolLogs = rig.readToolLogs();
                    results.push({
                        provider,
                        duration,
                        responseLength: result.length,
                        toolCalls: toolLogs.length,
                        successRate: 100,
                        success: true,
                        fileSize: largeContent.length,
                    });
                }
                catch {
                    console.warn(`${provider} failed in large file benchmark:`, error.message);
                    results.push({
                        provider,
                        duration: -1,
                        responseLength: 0,
                        toolCalls: 0,
                        successRate: 0,
                        success: false,
                    });
                }
            }
            createPerformanceReport('Large File Processing', results);
            // Validate large file performance
            results
                .filter((r) => r.success)
                .forEach((result) => {
                expect(result.duration).toBeLessThan(45000); // 45 seconds max for large files
                expect(result.toolCalls).toBeGreaterThan(0);
            });
        });
    });
    describe('Concurrent Operation Benchmarks', () => {
        it('should benchmark concurrent task handling', async () => {
            const providers = getAvailableProviders();
            if (providers.length < 2) {
                console.warn('Skipping concurrent benchmark - need multiple providers');
                return;
            }
            rig.setup('concurrent-benchmark');
            // Create test data
            for (let i = 1; i <= 5; i++) {
                rig.createFile(`task-${i}.txt`, `Task ${i} content for concurrent processing`);
            }
            const startTime = Date.now();
            const promises = [];
            // Create concurrent tasks across providers
            for (let i = 0; i < 5; i++) {
                const provider = providers[i % providers.length];
                const args = provider === 'gemini' ? [] : ['--provider', provider];
                const promise = rig
                    .run(`Read task-${i + 1}.txt and create processed-${i + 1}.txt with analysis.`, ...args)
                    .then((result) => ({
                    taskId: i + 1,
                    provider,
                    result,
                    success: !!result,
                }))
                    .catch((error) => ({
                    taskId: i + 1,
                    provider,
                    result: null,
                    success: false,
                    error: error.message,
                }));
                promises.push(promise);
            }
            const results = await Promise.all(promises);
            const endTime = Date.now();
            const totalDuration = endTime - startTime;
            console.log('\n=== Concurrent Operations Benchmark ===');
            console.log(`Total Duration: ${totalDuration}ms`);
            console.log(`Tasks Completed: ${results.filter((r) => r.success).length}/5`);
            results.forEach((result) => {
                console.log(`Task ${result.taskId} (${result.provider}): ${result.success ? 'SUCCESS' : 'FAILED'}`);
                if (!result.success && result.error) {
                    console.log(`  Error: ${result.error}`);
                }
            });
            console.log('='.repeat(50));
            // Validate concurrent performance
            expect(totalDuration).toBeLessThan(90000); // Should complete within 90 seconds
            expect(results.filter((r) => r.success).length).toBeGreaterThanOrEqual(3); // At least 3/5 should succeed
        });
        it('should benchmark provider failover performance', async () => {
            const providers = getAvailableProviders();
            if (providers.length < 2) {
                console.warn('Skipping failover benchmark - need multiple providers');
                return;
            }
            rig.setup('failover-benchmark');
            const results = [];
            // Test failover scenarios
            for (let attempt = 1; attempt <= 3; attempt++) {
                const startTime = Date.now();
                // Try with primary provider, fallback to secondary
                let success = false;
                let provider = '';
                let result = '';
                for (const testProvider of providers) {
                    try {
                        const args = testProvider === 'gemini' ? [] : ['--provider', testProvider];
                        result = await rig.run(`Attempt ${attempt}: Create test-${attempt}.txt with success message.`, ...args);
                        provider = testProvider;
                        success = true;
                        break;
                    }
                    catch {
                        console.warn(`Provider ${testProvider} failed in attempt ${attempt}:`, error.message);
                        continue;
                    }
                }
                const endTime = Date.now();
                const duration = endTime - startTime;
                results.push({
                    attempt,
                    provider,
                    duration,
                    success,
                    responseLength: result.length,
                });
            }
            console.log('\n=== Failover Performance Benchmark ===');
            results.forEach((result) => {
                console.log(`Attempt ${result.attempt}:`);
                console.log(`  Provider: ${result.provider}`);
                console.log(`  Duration: ${result.duration}ms`);
                console.log(`  Success: ${result.success}`);
            });
            const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
            console.log(`Average Failover Time: ${avgDuration.toFixed(2)}ms`);
            console.log('='.repeat(50));
            // Validate failover performance
            expect(results.filter((r) => r.success).length).toBeGreaterThan(0);
            expect(avgDuration).toBeLessThan(30000); // Average failover should be under 30 seconds
        });
    });
    describe('Memory and Resource Benchmarks', () => {
        it('should benchmark memory usage patterns', async () => {
            const providers = getAvailableProviders();
            const results = [];
            for (const provider of providers) {
                rig.setup(`memory-${provider}-benchmark`);
                // Create scenario that uses various tools
                rig.createFile('mem-test.txt', 'Memory test content');
                const startMemory = process.memoryUsage();
                const startTime = Date.now();
                const args = provider === 'gemini' ? [] : ['--provider', provider];
                try {
                    const result = await rig.run('Read mem-test.txt, list directory, search for patterns, create output file.', ...args);
                    const endTime = Date.now();
                    const endMemory = process.memoryUsage();
                    const duration = endTime - startTime;
                    const memoryDelta = {
                        rss: endMemory.rss - startMemory.rss,
                        heapUsed: endMemory.heapUsed - startMemory.heapUsed,
                        heapTotal: endMemory.heapTotal - startMemory.heapTotal,
                        external: endMemory.external - startMemory.external,
                    };
                    results.push({
                        provider,
                        duration,
                        memoryDelta,
                        responseLength: result.length,
                        success: true,
                    });
                }
                catch {
                    console.warn(`${provider} failed in memory benchmark:`, error.message);
                    results.push({
                        provider,
                        duration: -1,
                        memoryDelta: null,
                        responseLength: 0,
                        success: false,
                    });
                }
            }
            console.log('\n=== Memory Usage Benchmark ===');
            results
                .filter((r) => r.success)
                .forEach((result) => {
                console.log(`${result.provider}:`);
                console.log(`  Duration: ${result.duration}ms`);
                console.log(`  RSS Delta: ${(result.memoryDelta.rss / 1024 / 1024).toFixed(2)} MB`);
                console.log(`  Heap Used Delta: ${(result.memoryDelta.heapUsed / 1024 / 1024).toFixed(2)} MB`);
                console.log(`  Heap Total Delta: ${(result.memoryDelta.heapTotal / 1024 / 1024).toFixed(2)} MB`);
            });
            console.log('='.repeat(50));
            // Validate memory usage is reasonable
            results
                .filter((r) => r.success)
                .forEach((result) => {
                // Memory usage should not exceed 100MB for simple operations
                expect(result.memoryDelta.rss).toBeLessThan(100 * 1024 * 1024);
                expect(result.memoryDelta.heapUsed).toBeLessThan(50 * 1024 * 1024);
            });
        });
    });
    describe('Scalability Benchmarks', () => {
        it('should benchmark performance with increasing complexity', async () => {
            const providers = getAvailableProviders();
            const complexityLevels = [1, 3, 5]; // Number of operations
            for (const provider of providers) {
                console.log(`\n=== Scalability Test for ${provider} ===`);
                const scalabilityResults = [];
                for (const complexity of complexityLevels) {
                    rig.setup(`scalability-${provider}-${complexity}`);
                    // Create files based on complexity
                    for (let i = 1; i <= complexity; i++) {
                        rig.createFile(`data-${i}.txt`, `Data file ${i} content for scalability test`);
                    }
                    const startTime = Date.now();
                    const args = provider === 'gemini' ? [] : ['--provider', provider];
                    const prompt = complexity === 1
                        ? 'Read data-1.txt and summarize it.'
                        : `Read all data files (${Array.from({ length: complexity }, (_, i) => `data-${i + 1}.txt`).join(', ')}) and create a comprehensive analysis.`;
                    try {
                        const result = await rig.run(prompt, ...args);
                        const endTime = Date.now();
                        const duration = endTime - startTime;
                        const toolLogs = rig.readToolLogs();
                        scalabilityResults.push({
                            complexity,
                            duration,
                            toolCalls: toolLogs.length,
                            responseLength: result.length,
                            throughput: complexity / (duration / 1000), // operations per second
                        });
                    }
                    catch {
                        console.warn(`${provider} failed at complexity ${complexity}:`, error.message);
                        scalabilityResults.push({
                            complexity,
                            duration: -1,
                            toolCalls: 0,
                            responseLength: 0,
                            throughput: 0,
                        });
                    }
                }
                // Display scalability results
                scalabilityResults.forEach((result) => {
                    if (result.duration > 0) {
                        console.log(`Complexity ${result.complexity}:`);
                        console.log(`  Duration: ${result.duration}ms`);
                        console.log(`  Tool Calls: ${result.toolCalls}`);
                        console.log(`  Throughput: ${result.throughput.toFixed(2)} ops/sec`);
                    }
                });
                // Validate scalability characteristics
                const validResults = scalabilityResults.filter((r) => r.duration > 0);
                if (validResults.length >= 2) {
                    // Performance shouldn't degrade dramatically with complexity
                    const firstResult = validResults[0];
                    const lastResult = validResults[validResults.length - 1];
                    const efficiencyRatio = lastResult.duration /
                        lastResult.complexity /
                        (firstResult.duration / firstResult.complexity);
                    console.log(`Efficiency Ratio: ${efficiencyRatio.toFixed(2)}`);
                    // Efficiency should not degrade more than 3x
                    expect(efficiencyRatio).toBeLessThan(3.0);
                }
            }
        });
    });
    describe('Overall Performance Summary', () => {
        it('should generate comprehensive performance report', async () => {
            const providers = getAvailableProviders();
            if (providers.length < 2) {
                console.warn('Skipping comprehensive report - need multiple providers');
                return;
            }
            console.log('\n'.repeat(2));
            console.log('█'.repeat(60));
            console.log('█' + ' '.repeat(18) + 'PERFORMANCE SUMMARY' + ' '.repeat(19) + '█');
            console.log('█'.repeat(60));
            const overallResults = [];
            for (const provider of providers) {
                rig.setup(`overall-${provider}-benchmark`);
                const startTime = Date.now();
                const args = provider === 'gemini' ? [] : ['--provider', provider];
                // Comprehensive test scenario
                rig.createFile('test-data.txt', 'Test data for comprehensive evaluation');
                try {
                    const result = await rig.run('Read test-data.txt, analyze it, create a report.txt, and list all files.', ...args);
                    const endTime = Date.now();
                    const duration = endTime - startTime;
                    const toolLogs = rig.readToolLogs();
                    const successfulTools = toolLogs.filter((log) => log.toolRequest.success).length;
                    const avgToolTime = toolLogs.length > 0
                        ? toolLogs.reduce((sum, log) => sum + log.toolRequest.duration_ms, 0) / toolLogs.length
                        : 0;
                    overallResults.push({
                        provider: provider.toUpperCase(),
                        duration,
                        toolCalls: toolLogs.length,
                        successfulTools,
                        responseLength: result.length,
                        avgToolTime,
                        score: calculatePerformanceScore(duration, toolLogs.length, successfulTools, result.length),
                    });
                }
                catch {
                    overallResults.push({
                        provider: provider.toUpperCase(),
                        duration: -1,
                        toolCalls: 0,
                        successfulTools: 0,
                        responseLength: 0,
                        avgToolTime: 0,
                        score: 0,
                    });
                }
            }
            // Sort by performance score
            overallResults.sort((a, b) => b.score - a.score);
            console.log('');
            console.log('PROVIDER RANKINGS:');
            console.log('-'.repeat(60));
            overallResults.forEach((result, index) => {
                const rank = index + 1;
                const medal = rank === 1
                    ? '🥇'
                    : rank === 2
                        ? '🥈'
                        : rank === 3
                            ? '🥉'
                            : `${rank}.`;
                console.log(`${medal} ${result.provider}:`);
                if (result.duration > 0) {
                    console.log(`    Duration: ${result.duration}ms`);
                    console.log(`    Tool Calls: ${result.toolCalls} (${result.successfulTools} successful)`);
                    console.log(`    Avg Tool Time: ${result.avgToolTime.toFixed(2)}ms`);
                    console.log(`    Response Length: ${result.responseLength} chars`);
                    console.log(`    Performance Score: ${result.score.toFixed(2)}/100`);
                }
                else {
                    console.log(`    Status: FAILED`);
                }
                console.log('');
            });
            console.log('█'.repeat(60));
            // Validate that at least one provider performed well
            const bestScore = Math.max(...overallResults.map((r) => r.score));
            expect(bestScore).toBeGreaterThan(50); // At least one provider should score above 50/100
        });
    });
});
/**
 * Calculate a performance score based on multiple metrics
 */
function calculatePerformanceScore(duration, toolCalls, successfulTools, responseLength) {
    if (duration <= 0)
        return 0;
    // Scoring factors (max 100 points)
    const speedScore = Math.max(0, 40 - duration / 1000); // Up to 40 points (faster is better)
    const reliabilityScore = toolCalls > 0 ? (successfulTools / toolCalls) * 30 : 0; // Up to 30 points
    const qualityScore = Math.min(20, responseLength / 50); // Up to 20 points
    const efficiencyScore = toolCalls > 0 ? Math.min(10, toolCalls * 2) : 0; // Up to 10 points
    return Math.max(0, Math.min(100, speedScore + reliabilityScore + qualityScore + efficiencyScore));
}
//# sourceMappingURL=performance-benchmark.test.js.map