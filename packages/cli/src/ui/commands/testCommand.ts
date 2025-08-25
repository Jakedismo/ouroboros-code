/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text, Newline } from 'ink';
import { runEndToEndTests, EndToEndTestResults, TestCaseResult } from '../../agents/integration/end-to-end-tests.js';
import { Config } from '../../../core/src/config/config.js';
import { ToolRegistry } from '../../../core/src/tools/tool-registry.js';
import { useState, useEffect } from 'react';

/**
 * Test command props
 */
export interface TestCommandProps {
  config: Config;
  toolRegistry: ToolRegistry;
  args: {
    suite?: string;
    verbose?: boolean;
    category?: string;
    skipCleanup?: boolean;
  };
  onExit: (code: number) => void;
}

/**
 * Test progress state
 */
interface TestProgress {
  isRunning: boolean;
  currentTest?: string;
  completedTests: number;
  totalTests: number;
  results?: EndToEndTestResults;
  error?: string;
}

/**
 * Test command component for running end-to-end tests
 */
export const TestCommand: React.FC<TestCommandProps> = ({ config, toolRegistry, args, onExit }) => {
  const [progress, setProgress] = useState<TestProgress>({
    isRunning: false,
    completedTests: 0,
    totalTests: 0,
  });

  useEffect(() => {
    const runTests = async () => {
      setProgress(prev => ({ ...prev, isRunning: true }));
      
      try {
        console.log('🧪 Starting end-to-end test suite...');
        
        const results = await runEndToEndTests(config, toolRegistry);
        
        setProgress({
          isRunning: false,
          completedTests: results.testsRun,
          totalTests: results.testsRun,
          results,
        });

        // Exit with appropriate code
        setTimeout(() => {
          onExit(results.overallSuccess ? 0 : 1);
        }, 100);

      } catch (error) {
        setProgress({
          isRunning: false,
          completedTests: 0,
          totalTests: 0,
          error: error instanceof Error ? error.message : String(error),
        });
        
        setTimeout(() => {
          onExit(1);
        }, 100);
      }
    };

    runTests();
  }, [config, toolRegistry, onExit]);

  if (progress.error) {
    return (
      <Box flexDirection="column">
        <Text color="red">❌ Test Suite Failed</Text>
        <Newline />
        <Text color="red">Error: {progress.error}</Text>
      </Box>
    );
  }

  if (progress.isRunning) {
    return (
      <Box flexDirection="column">
        <Text color="blue">🧪 Running End-to-End Test Suite...</Text>
        <Newline />
        <Text color="gray">Testing all agent system integrations...</Text>
        <Text color="gray">This may take a few minutes.</Text>
      </Box>
    );
  }

  if (!progress.results) {
    return (
      <Box flexDirection="column">
        <Text color="blue">🔄 Initializing test suite...</Text>
      </Box>
    );
  }

  // Display results
  const { results } = progress;
  const successRate = results.testsRun > 0 ? (results.testsPassed / results.testsRun * 100).toFixed(1) : '0';

  return (
    <Box flexDirection="column">
      <Text color={results.overallSuccess ? "green" : "red"}>
        {results.overallSuccess ? "✅" : "❌"} Test Suite {results.overallSuccess ? "Passed" : "Failed"}
      </Text>
      <Newline />
      
      {/* Summary */}
      <Box flexDirection="column" borderStyle="single" borderColor="gray" padding={1}>
        <Text color="cyan" bold>📊 Test Summary</Text>
        <Text>Tests Run: <Text color="white">{results.testsRun}</Text></Text>
        <Text>Passed: <Text color="green">{results.testsPassed}</Text></Text>
        <Text>Failed: <Text color="red">{results.testsFailed}</Text></Text>
        <Text>Skipped: <Text color="yellow">{results.testsSkipped}</Text></Text>
        <Text>Success Rate: <Text color={results.overallSuccess ? "green" : "red"}>{successRate}%</Text></Text>
        <Text>Duration: <Text color="white">{(results.totalDuration / 1000).toFixed(2)}s</Text></Text>
      </Box>
      <Newline />

      {/* Integration Health */}
      <Box flexDirection="column" borderStyle="single" borderColor="gray" padding={1}>
        <Text color="cyan" bold>🔗 Integration Health</Text>
        <Text>Provider Integration: <Text color={results.integrationHealth.providerIntegration ? "green" : "red"}>
          {results.integrationHealth.providerIntegration ? "✅ Healthy" : "❌ Failed"}
        </Text></Text>
        <Text>Session Integration: <Text color={results.integrationHealth.sessionIntegration ? "green" : "red"}>
          {results.integrationHealth.sessionIntegration ? "✅ Healthy" : "❌ Failed"}
        </Text></Text>
        <Text>Workflow Integration: <Text color={results.integrationHealth.workflowIntegration ? "green" : "red"}>
          {results.integrationHealth.workflowIntegration ? "✅ Healthy" : "❌ Failed"}
        </Text></Text>
        <Text>Analytics Integration: <Text color={results.integrationHealth.analyticsIntegration ? "green" : "red"}>
          {results.integrationHealth.analyticsIntegration ? "✅ Healthy" : "❌ Failed"}
        </Text></Text>
      </Box>
      <Newline />

      {/* Performance Metrics */}
      <Box flexDirection="column" borderStyle="single" borderColor="gray" padding={1}>
        <Text color="cyan" bold>⚡ Performance Metrics</Text>
        <Text>Average Test Duration: <Text color="white">{results.performanceMetrics.averageTestDuration.toFixed(0)}ms</Text></Text>
        <Text>Agent Activation Time: <Text color="white">{results.performanceMetrics.agentActivationTime.toFixed(0)}ms</Text></Text>
        <Text>Workflow Execution Time: <Text color="white">{results.performanceMetrics.workflowExecutionTime.toFixed(0)}ms</Text></Text>
        <Text>Session Recovery Time: <Text color="white">{results.performanceMetrics.sessionRecoveryTime.toFixed(0)}ms</Text></Text>
        <Text>Memory Usage: <Text color="white">{(results.performanceMetrics.memoryUsage / 1024 / 1024).toFixed(1)}MB</Text></Text>
      </Box>
      <Newline />

      {/* Test Categories */}
      {args.verbose && (
        <>
          <TestCategoryResults results={results.testResults} />
          <Newline />
        </>
      )}

      {/* Failed Tests Details */}
      {results.testsFailed > 0 && (
        <>
          <Box flexDirection="column" borderStyle="single" borderColor="red" padding={1}>
            <Text color="red" bold>❌ Failed Tests</Text>
            {results.testResults
              .filter(test => test.status === 'failed')
              .map((test, index) => (
                <Box key={index} flexDirection="column" marginLeft={1}>
                  <Text color="red">• {test.testName}</Text>
                  <Text color="gray" dimColor>  Category: {test.testCategory}</Text>
                  <Text color="gray" dimColor>  Duration: {test.duration}ms</Text>
                  {test.errorDetails && (
                    <Text color="red" dimColor>  Error: {test.errorDetails}</Text>
                  )}
                  <Text color="gray" dimColor>  Expected: {test.expectedOutcome}</Text>
                  <Text color="gray" dimColor>  Actual: {test.actualOutcome}</Text>
                </Box>
              ))}
          </Box>
          <Newline />
        </>
      )}

      {/* Success Message */}
      {results.overallSuccess && (
        <Box flexDirection="column">
          <Text color="green" bold>🎉 All tests passed!</Text>
          <Text color="gray">The multi-agent CLI system is fully functional and all integrations are working correctly.</Text>
        </Box>
      )}

      {/* Failure Message */}
      {!results.overallSuccess && (
        <Box flexDirection="column">
          <Text color="red" bold>💥 Some tests failed!</Text>
          <Text color="gray">Please review the failed tests above and check the system configuration.</Text>
        </Box>
      )}
    </Box>
  );
};

/**
 * Test category results component
 */
const TestCategoryResults: React.FC<{ results: TestCaseResult[] }> = ({ results }) => {
  const categories = Array.from(new Set(results.map(r => r.testCategory)));
  
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" padding={1}>
      <Text color="cyan" bold>📋 Test Categories</Text>
      {categories.map(category => {
        const categoryTests = results.filter(r => r.testCategory === category);
        const passed = categoryTests.filter(r => r.status === 'passed').length;
        const total = categoryTests.length;
        const success = passed === total;
        
        return (
          <Box key={category} flexDirection="row">
            <Text color={success ? "green" : "red"}>
              {success ? "✅" : "❌"}
            </Text>
            <Text> {category}: </Text>
            <Text color={success ? "green" : "red"}>
              {passed}/{total}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};

export default TestCommand;