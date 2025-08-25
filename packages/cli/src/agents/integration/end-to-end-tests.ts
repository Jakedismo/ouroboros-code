/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { getCoreSystemIntegration } from './core-system-integration.js';
import { getAgentManager } from './agent-manager.js';
import { getSessionManager } from '../../session/session-manager.js';
import { getWorkflowMonitor } from '../../workflow/monitoring/workflow-monitor.js';
import { AgentConfig } from '../registry/agent-storage.js';
import { Config } from '../../../core/src/config/config.js';
import { ToolRegistry } from '../../../core/src/tools/tool-registry.js';

/**
 * End-to-end test suite results
 */
export interface EndToEndTestResults {
  testSuiteId: string;
  startTime: Date;
  endTime: Date;
  totalDuration: number;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  testsSkipped: number;
  overallSuccess: boolean;
  testResults: TestCaseResult[];
  integrationHealth: {
    providerIntegration: boolean;
    sessionIntegration: boolean;
    workflowIntegration: boolean;
    analyticsIntegration: boolean;
  };
  performanceMetrics: {
    averageTestDuration: number;
    agentActivationTime: number;
    workflowExecutionTime: number;
    sessionRecoveryTime: number;
    memoryUsage: number;
  };
}

/**
 * Individual test case result
 */
export interface TestCaseResult {
  testId: string;
  testName: string;
  testCategory: 'agent-creation' | 'agent-activation' | 'workflow-execution' | 'session-persistence' | 'analytics' | 'integration';
  startTime: Date;
  endTime: Date;
  duration: number;
  status: 'passed' | 'failed' | 'skipped';
  description: string;
  expectedOutcome: string;
  actualOutcome: string;
  errorDetails?: string;
  artifacts?: {
    agentId?: string;
    sessionId?: string;
    workflowId?: string;
    logs?: string[];
    metrics?: Record<string, any>;
  };
}

/**
 * Test scenario configuration
 */
export interface TestScenario {
  scenarioId: string;
  name: string;
  description: string;
  testCases: Array<{
    testId: string;
    name: string;
    category: TestCaseResult['testCategory'];
    timeout: number;
    dependencies?: string[];
    configuration?: Record<string, any>;
  }>;
  setupRequired: boolean;
  cleanupRequired: boolean;
}

/**
 * End-to-end testing events
 */
export interface EndToEndTestEvents {
  'test-suite-started': (testSuiteId: string) => void;
  'test-suite-completed': (results: EndToEndTestResults) => void;
  'test-case-started': (testId: string, testName: string) => void;
  'test-case-completed': (result: TestCaseResult) => void;
  'test-case-failed': (testId: string, error: Error) => void;
  'integration-health-checked': (health: EndToEndTestResults['integrationHealth']) => void;
}

/**
 * Comprehensive end-to-end testing system for the multi-agent CLI
 * 
 * Tests the complete workflow from agent creation through execution,
 * validating all integration points and real-world usage scenarios.
 */
export class EndToEndTestSuite extends EventEmitter {
  private coreIntegration = getCoreSystemIntegration();
  private agentManager = getAgentManager();
  private sessionManager = getSessionManager();
  private workflowMonitor = getWorkflowMonitor();
  
  private config: Config;
  private toolRegistry: ToolRegistry;
  private isRunning = false;
  
  // Test artifacts
  private createdAgents: AgentConfig[] = [];
  private activeSessions: string[] = [];
  private executedWorkflows: string[] = [];
  private testLogs: string[] = [];

  constructor(config: Config, toolRegistry: ToolRegistry) {
    super();
    this.config = config;
    this.toolRegistry = toolRegistry;
  }

  /**
   * Run comprehensive end-to-end test suite
   */
  async runFullTestSuite(): Promise<EndToEndTestResults> {
    if (this.isRunning) {
      throw new Error('Test suite is already running');
    }

    this.isRunning = true;
    const testSuiteId = `e2e_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = new Date();

    console.log('🧪 Starting comprehensive end-to-end test suite...');
    this.emit('test-suite-started', testSuiteId);

    try {
      // Initialize test environment
      await this.initializeTestEnvironment();

      // Run all test scenarios
      const testResults: TestCaseResult[] = [];
      
      // Scenario 1: Agent Lifecycle Tests
      console.log('📋 Running Agent Lifecycle Tests...');
      const agentTests = await this.runAgentLifecycleTests();
      testResults.push(...agentTests);

      // Scenario 2: Integration Tests
      console.log('🔗 Running Integration Tests...');
      const integrationTests = await this.runIntegrationTests();
      testResults.push(...integrationTests);

      // Scenario 3: Workflow Execution Tests
      console.log('⚙️  Running Workflow Execution Tests...');
      const workflowTests = await this.runWorkflowExecutionTests();
      testResults.push(...workflowTests);

      // Scenario 4: Session Persistence Tests
      console.log('💾 Running Session Persistence Tests...');
      const sessionTests = await this.runSessionPersistenceTests();
      testResults.push(...sessionTests);

      // Scenario 5: Analytics and Performance Tests
      console.log('📊 Running Analytics and Performance Tests...');
      const analyticsTests = await this.runAnalyticsTests();
      testResults.push(...analyticsTests);

      // Scenario 6: Error Handling and Recovery Tests
      console.log('🚨 Running Error Handling Tests...');
      const errorTests = await this.runErrorHandlingTests();
      testResults.push(...errorTests);

      // Generate final results
      const endTime = new Date();
      const results = await this.generateTestResults(testSuiteId, startTime, endTime, testResults);
      
      this.emit('test-suite-completed', results);
      console.log(`✅ Test suite completed: ${results.testsPassed}/${results.testsRun} tests passed`);
      
      return results;

    } catch (error) {
      console.error('❌ Test suite failed:', error);
      throw error;
    } finally {
      await this.cleanupTestEnvironment();
      this.isRunning = false;
    }
  }

  /**
   * Run agent lifecycle tests
   */
  private async runAgentLifecycleTests(): Promise<TestCaseResult[]> {
    const results: TestCaseResult[] = [];

    // Test 1: Create new agent
    results.push(await this.runTestCase('agent-001', 'Create Custom Agent', 'agent-creation', async () => {
      const agentConfig: AgentConfig = {
        id: `test-agent-${Date.now()}`,
        name: 'Test Automation Agent',
        description: 'A test agent for end-to-end validation',
        category: 'automation',
        version: '1.0.0',
        author: 'E2E Test Suite',
        created: new Date(),
        systemPrompt: 'You are a test automation agent designed to validate system functionality.',
        capabilities: ['workflow-planning', 'tool-execution', 'error-recovery'],
        specialBehaviors: ['verbose-logging', 'defensive-programming'],
        toolConfiguration: {
          enableBuiltinTools: true,
          enableMCP: true,
          enabledTools: ['read_file', 'write_file', 'run_shell_command'],
          maxParallelTools: 3,
          toolTimeout: 30000,
        },
        examples: [
          {
            description: 'Simple file operation',
            input: 'Create a test file with sample content',
            output: 'File created successfully with the specified content',
          }
        ],
      };

      const created = await this.agentManager.createAgent(agentConfig);
      this.createdAgents.push(created);
      
      return {
        success: true,
        result: `Agent created with ID: ${created.id}`,
        metrics: { agentId: created.id, creationTime: Date.now() },
      };
    }));

    // Test 2: List agents
    results.push(await this.runTestCase('agent-002', 'List Available Agents', 'agent-activation', async () => {
      const agents = await this.agentManager.listAgents();
      const testAgent = agents.find(a => a.name === 'Test Automation Agent');
      
      return {
        success: testAgent !== undefined,
        result: `Found ${agents.length} agents including test agent: ${!!testAgent}`,
        metrics: { totalAgents: agents.length, hasTestAgent: !!testAgent },
      };
    }));

    // Test 3: Activate agent
    results.push(await this.runTestCase('agent-003', 'Activate Custom Agent', 'agent-activation', async () => {
      const testAgent = this.createdAgents[0];
      if (!testAgent) throw new Error('Test agent not found');

      await this.agentManager.activateAgent(testAgent.id);
      const activeAgent = await this.agentManager.getActiveAgent();
      
      return {
        success: activeAgent?.id === testAgent.id,
        result: `Activated agent: ${activeAgent?.name || 'none'}`,
        metrics: { activatedAgentId: activeAgent?.id, activationTime: Date.now() },
      };
    }));

    // Test 4: Verify agent configuration
    results.push(await this.runTestCase('agent-004', 'Verify Agent Configuration', 'agent-activation', async () => {
      const activeAgent = await this.agentManager.getActiveAgent();
      if (!activeAgent) throw new Error('No active agent found');

      const hasCorrectConfig = 
        activeAgent.toolConfiguration?.enableBuiltinTools === true &&
        activeAgent.toolConfiguration?.enableMCP === true &&
        activeAgent.capabilities?.includes('workflow-planning') === true;
      
      return {
        success: hasCorrectConfig,
        result: `Agent configuration valid: ${hasCorrectConfig}`,
        metrics: { configValid: hasCorrectConfig, toolsEnabled: activeAgent.toolConfiguration?.enableBuiltinTools },
      };
    }));

    return results;
  }

  /**
   * Run integration tests
   */
  private async runIntegrationTests(): Promise<TestCaseResult[]> {
    const results: TestCaseResult[] = [];

    // Test 1: Core system integration health
    results.push(await this.runTestCase('integration-001', 'Core System Integration Health', 'integration', async () => {
      const status = await this.coreIntegration.getIntegrationStatus();
      const healthy = status.integrationHealthy && status.hasActiveAgent;
      
      this.emit('integration-health-checked', status);
      
      return {
        success: healthy,
        result: `Integration healthy: ${healthy}, Active agent: ${status.hasActiveAgent}`,
        metrics: status,
      };
    }));

    // Test 2: LLM Provider integration
    results.push(await this.runTestCase('integration-002', 'LLM Provider Integration', 'integration', async () => {
      const provider = await this.coreIntegration.getCurrentProvider();
      const hasProvider = provider !== null;
      
      return {
        success: hasProvider,
        result: `LLM Provider available: ${hasProvider}`,
        metrics: { hasProvider, providerType: provider?.constructor.name },
      };
    }));

    // Test 3: Session integration
    results.push(await this.runTestCase('integration-003', 'Session Integration', 'integration', async () => {
      const sessionIntegration = this.coreIntegration.getSessionAgentIntegration();
      const hasSessionIntegration = sessionIntegration !== null;
      
      if (hasSessionIntegration) {
        const stats = sessionIntegration.getAgentUsageStatistics();
        return {
          success: true,
          result: `Session integration active with ${stats.totalAgents} agents`,
          metrics: stats,
        };
      }
      
      return {
        success: false,
        result: 'Session integration not available',
        metrics: { hasSessionIntegration: false },
      };
    }));

    // Test 4: Analytics integration
    results.push(await this.runTestCase('integration-004', 'Analytics Integration', 'integration', async () => {
      const analyticsIntegration = this.coreIntegration.getAgentAnalyticsIntegration();
      const hasAnalytics = analyticsIntegration !== null;
      
      if (hasAnalytics) {
        const summary = await analyticsIntegration.generateAnalyticsSummary(0.1); // 6 minutes
        return {
          success: true,
          result: `Analytics integration active: ${summary.totalAgents} agents tracked`,
          metrics: { totalAgents: summary.totalAgents, totalExecutions: summary.totalExecutions },
        };
      }
      
      return {
        success: false,
        result: 'Analytics integration not available',
        metrics: { hasAnalytics: false },
      };
    }));

    return results;
  }

  /**
   * Run workflow execution tests
   */
  private async runWorkflowExecutionTests(): Promise<TestCaseResult[]> {
    const results: TestCaseResult[] = [];

    // Test 1: Create and execute simple workflow
    results.push(await this.runTestCase('workflow-001', 'Simple Workflow Execution', 'workflow-execution', async () => {
      const workflowDefinition = {
        id: `test-workflow-${Date.now()}`,
        name: 'Test File Operations Workflow',
        description: 'Test workflow for validating file operations',
        version: '1.0.0',
        created: new Date(),
        steps: [
          {
            id: 'step-1',
            name: 'Create Test File',
            description: 'Create a test file with sample content',
            command: 'write_file',
            parameters: {
              file_path: '/tmp/e2e-test-file.txt',
              content: 'Hello from E2E test suite!',
            },
            estimatedDuration: 1000,
          },
          {
            id: 'step-2',
            name: 'Read Test File',
            description: 'Read the created test file',
            command: 'read_file',
            parameters: {
              file_path: '/tmp/e2e-test-file.txt',
            },
            estimatedDuration: 500,
          },
        ],
        metadata: {
          userRequest: 'Test file operations',
          estimatedTotalDuration: 1500,
          requiredPermissions: ['file-write', 'file-read'],
          category: 'mixed' as const,
          complexity: 'simple' as const,
          executionMode: 'sequential' as const,
        },
      };

      // Get workflow-tool integration
      const workflowIntegration = this.coreIntegration.getWorkflowToolIntegration();
      if (!workflowIntegration) {
        throw new Error('Workflow-tool integration not available');
      }

      // Execute workflow steps
      const step1Result = await workflowIntegration.executeWorkflowStep(
        workflowDefinition.id,
        'step-1',
        workflowDefinition.steps[0]
      );

      const step2Result = await workflowIntegration.executeWorkflowStep(
        workflowDefinition.id,
        'step-2',
        workflowDefinition.steps[1]
      );

      const success = step1Result.success && step2Result.success;
      this.executedWorkflows.push(workflowDefinition.id);

      return {
        success,
        result: `Workflow executed: ${success}, Step 1: ${step1Result.success}, Step 2: ${step2Result.success}`,
        metrics: {
          workflowId: workflowDefinition.id,
          step1Duration: step1Result.executionTime,
          step2Duration: step2Result.executionTime,
          totalToolsExecuted: step1Result.toolsExecuted.length + step2Result.toolsExecuted.length,
        },
      };
    }));

    // Test 2: Workflow with tool coordination
    results.push(await this.runTestCase('workflow-002', 'Multi-Tool Coordination', 'workflow-execution', async () => {
      const workflowDefinition = {
        id: `coordination-workflow-${Date.now()}`,
        name: 'Multi-Tool Coordination Test',
        description: 'Test workflow coordination with multiple tools',
        version: '1.0.0',
        created: new Date(),
        steps: [
          {
            id: 'coord-step-1',
            name: 'Multiple Operations',
            description: 'Execute multiple operations in sequence',
            command: 'mixed',
            parameters: {
              toolCalls: [
                {
                  id: 'tool-1',
                  name: 'write_file',
                  parameters: {
                    file_path: '/tmp/coord-test-1.txt',
                    content: 'Coordination test 1',
                  },
                },
                {
                  id: 'tool-2',
                  name: 'write_file',
                  parameters: {
                    file_path: '/tmp/coord-test-2.txt',
                    content: 'Coordination test 2',
                  },
                },
                {
                  id: 'tool-3',
                  name: 'ls',
                  parameters: {
                    path: '/tmp',
                  },
                },
              ],
            },
            estimatedDuration: 2000,
          },
        ],
        metadata: {
          userRequest: 'Test tool coordination',
          estimatedTotalDuration: 2000,
          requiredPermissions: ['file-write', 'file-read'],
          category: 'mixed' as const,
          complexity: 'moderate' as const,
          executionMode: 'parallel' as const,
        },
      };

      const workflowIntegration = this.coreIntegration.getWorkflowToolIntegration();
      if (!workflowIntegration) {
        throw new Error('Workflow-tool integration not available');
      }

      const stepResult = await workflowIntegration.executeWorkflowStep(
        workflowDefinition.id,
        'coord-step-1',
        workflowDefinition.steps[0]
      );

      this.executedWorkflows.push(workflowDefinition.id);

      return {
        success: stepResult.success,
        result: `Multi-tool coordination: ${stepResult.success}, Tools executed: ${stepResult.toolsExecuted.length}`,
        metrics: {
          workflowId: workflowDefinition.id,
          executionTime: stepResult.executionTime,
          toolsExecuted: stepResult.toolsExecuted.length,
          toolResults: stepResult.toolResults.size,
        },
      };
    }));

    return results;
  }

  /**
   * Run session persistence tests
   */
  private async runSessionPersistenceTests(): Promise<TestCaseResult[]> {
    const results: TestCaseResult[] = [];

    // Test 1: Session creation and agent persistence
    results.push(await this.runTestCase('session-001', 'Session Creation and Agent Persistence', 'session-persistence', async () => {
      // Start a new session
      const session = await this.sessionManager.startSession(process.cwd(), {
        sessionName: 'E2E Test Session',
        forceNew: true,
      });

      this.activeSessions.push(session.id);

      // Verify session has agent context
      const sessionIntegration = this.coreIntegration.getSessionAgentIntegration();
      if (!sessionIntegration) {
        throw new Error('Session-agent integration not available');
      }

      // Activate agent in session context
      const testAgent = this.createdAgents[0];
      if (!testAgent) {
        throw new Error('Test agent not found');
      }

      await sessionIntegration.activateAgentInSession(
        testAgent.id,
        'e2e-testing',
        { testSuite: 'end-to-end' }
      );

      const relationship = sessionIntegration.getSessionAgentRelationship(session.id);
      const hasActiveAgent = relationship?.activeAgentId === testAgent.id;

      return {
        success: hasActiveAgent,
        result: `Session created with active agent: ${hasActiveAgent}`,
        metrics: {
          sessionId: session.id,
          activeAgentId: relationship?.activeAgentId,
          sessionCreatedAt: session.created,
        },
      };
    }));

    // Test 2: Agent execution tracking in session
    results.push(await this.runTestCase('session-002', 'Agent Execution Tracking', 'session-persistence', async () => {
      const sessionIntegration = this.coreIntegration.getSessionAgentIntegration();
      if (!sessionIntegration) {
        throw new Error('Session-agent integration not available');
      }

      const testAgent = this.createdAgents[0];
      if (!testAgent) {
        throw new Error('Test agent not found');
      }

      // Record test execution
      await sessionIntegration.recordAgentExecution(
        'command',
        { command: 'test-command', parameters: { test: true } },
        { result: 'success', executionTime: 1234 },
        true,
        { testExecution: true }
      );

      const relationship = sessionIntegration.getSessionAgentRelationship();
      const agentPersistence = relationship?.agentHistory.find(a => a.agentId === testAgent.id);
      const hasExecutions = agentPersistence && agentPersistence.executionHistory.length > 0;

      return {
        success: !!hasExecutions,
        result: `Agent execution tracked: ${!!hasExecutions}`,
        metrics: {
          executionCount: agentPersistence?.executionHistory.length || 0,
          performanceMetrics: agentPersistence?.performanceMetrics,
        },
      };
    }));

    // Test 3: Session recovery
    results.push(await this.runTestCase('session-003', 'Session Recovery', 'session-persistence', async () => {
      const currentSession = this.sessionManager.getCurrentSession();
      if (!currentSession) {
        throw new Error('No current session for recovery test');
      }

      // Simulate session recovery by checking if session can be restored
      const sessionIntegration = this.coreIntegration.getSessionAgentIntegration();
      if (!sessionIntegration) {
        throw new Error('Session-agent integration not available');
      }

      const testAgent = this.createdAgents[0];
      if (!testAgent) {
        throw new Error('Test agent not found');
      }

      // Test restoration capability
      const restored = await sessionIntegration.restoreAgentFromSession(currentSession.id, testAgent.id);

      return {
        success: restored,
        result: `Session recovery capability: ${restored}`,
        metrics: {
          sessionId: currentSession.id,
          restorationSuccessful: restored,
          sessionDuration: Date.now() - currentSession.created.getTime(),
        },
      };
    }));

    return results;
  }

  /**
   * Run analytics tests
   */
  private async runAnalyticsTests(): Promise<TestCaseResult[]> {
    const results: TestCaseResult[] = [];

    // Test 1: Analytics data collection
    results.push(await this.runTestCase('analytics-001', 'Analytics Data Collection', 'analytics', async () => {
      const analyticsIntegration = this.coreIntegration.getAgentAnalyticsIntegration();
      if (!analyticsIntegration) {
        throw new Error('Analytics integration not available');
      }

      const testAgent = this.createdAgents[0];
      if (!testAgent) {
        throw new Error('Test agent not found');
      }

      // Record test metrics
      analyticsIntegration.recordAgentExecution(
        testAgent.id,
        testAgent.name,
        'command',
        1500,
        true,
        150,
        3,
        { testExecution: true }
      );

      // Verify metrics were recorded
      const performanceMetrics = analyticsIntegration.getAgentPerformanceInSession(testAgent.id);
      const hasMetrics = performanceMetrics !== null;

      return {
        success: hasMetrics,
        result: `Analytics data collected: ${hasMetrics}`,
        metrics: {
          agentId: testAgent.id,
          performanceMetrics,
          hasMetrics,
        },
      };
    }));

    // Test 2: Performance benchmarking
    results.push(await this.runTestCase('analytics-002', 'Agent Performance Benchmarking', 'analytics', async () => {
      const analyticsIntegration = this.coreIntegration.getAgentAnalyticsIntegration();
      if (!analyticsIntegration) {
        throw new Error('Analytics integration not available');
      }

      const testAgent = this.createdAgents[0];
      if (!testAgent) {
        throw new Error('Test agent not found');
      }

      // Run benchmark
      const benchmarkResults = await analyticsIntegration.runAgentBenchmark(testAgent.id, 'e2e-test');
      const hasBenchmark = benchmarkResults.overallScore > 0;

      return {
        success: hasBenchmark,
        result: `Benchmark completed: Score ${benchmarkResults.overallScore}/100`,
        metrics: {
          agentId: testAgent.id,
          overallScore: benchmarkResults.overallScore,
          categories: benchmarkResults.categories,
          detailedMetrics: benchmarkResults.detailedMetrics,
        },
      };
    }));

    // Test 3: Analytics summary generation
    results.push(await this.runTestCase('analytics-003', 'Analytics Summary Generation', 'analytics', async () => {
      const analyticsIntegration = this.coreIntegration.getAgentAnalyticsIntegration();
      if (!analyticsIntegration) {
        throw new Error('Analytics integration not available');
      }

      const summary = await analyticsIntegration.generateAnalyticsSummary(0.1); // 6 minutes
      const hasData = summary.totalAgents > 0 || summary.totalExecutions > 0;

      return {
        success: hasData,
        result: `Analytics summary generated: ${summary.totalAgents} agents, ${summary.totalExecutions} executions`,
        metrics: {
          totalAgents: summary.totalAgents,
          totalExecutions: summary.totalExecutions,
          overallSuccessRate: summary.overallSuccessRate,
          averageResponseTime: summary.averageResponseTime,
          topPerformingAgents: summary.topPerformingAgents.length,
        },
      };
    }));

    return results;
  }

  /**
   * Run error handling tests
   */
  private async runErrorHandlingTests(): Promise<TestCaseResult[]> {
    const results: TestCaseResult[] = [];

    // Test 1: Invalid agent activation
    results.push(await this.runTestCase('error-001', 'Invalid Agent Activation', 'integration', async () => {
      try {
        await this.agentManager.activateAgent('non-existent-agent-id');
        return {
          success: false,
          result: 'Should have thrown error for non-existent agent',
          metrics: { errorExpected: true, errorThrown: false },
        };
      } catch (error) {
        return {
          success: true,
          result: `Correctly threw error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          metrics: { errorExpected: true, errorThrown: true, errorMessage: String(error) },
        };
      }
    }));

    // Test 2: Workflow execution with invalid tools
    results.push(await this.runTestCase('error-002', 'Invalid Tool Execution', 'workflow-execution', async () => {
      const workflowIntegration = this.coreIntegration.getWorkflowToolIntegration();
      if (!workflowIntegration) {
        throw new Error('Workflow-tool integration not available');
      }

      const invalidStep = {
        id: 'invalid-step',
        name: 'Invalid Tool Test',
        description: 'Test invalid tool handling',
        command: 'non_existent_tool',
        parameters: { invalid: true },
        estimatedDuration: 1000,
      };

      try {
        const result = await workflowIntegration.executeWorkflowStep(
          'error-test-workflow',
          'invalid-step',
          invalidStep
        );

        // Should handle gracefully without throwing
        return {
          success: !result.success, // Success means it handled the error gracefully
          result: `Invalid tool handled gracefully: ${!result.success}`,
          metrics: { errorHandledGracefully: !result.success, executionTime: result.executionTime },
        };
      } catch (error) {
        return {
          success: true,
          result: `Error properly caught: ${error instanceof Error ? error.message : 'Unknown error'}`,
          metrics: { errorCaught: true, errorMessage: String(error) },
        };
      }
    }));

    return results;
  }

  /**
   * Run individual test case
   */
  private async runTestCase(
    testId: string,
    testName: string,
    category: TestCaseResult['testCategory'],
    testFunction: () => Promise<{ success: boolean; result: string; metrics?: any }>
  ): Promise<TestCaseResult> {
    const startTime = new Date();
    
    console.log(`  🧪 Running test: ${testName}`);
    this.emit('test-case-started', testId, testName);

    try {
      const outcome = await testFunction();
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      const result: TestCaseResult = {
        testId,
        testName,
        testCategory: category,
        startTime,
        endTime,
        duration,
        status: outcome.success ? 'passed' : 'failed',
        description: `Test case: ${testName}`,
        expectedOutcome: 'Successful execution',
        actualOutcome: outcome.result,
        artifacts: {
          logs: [`Test executed in ${duration}ms`],
          metrics: outcome.metrics,
        },
      };

      this.emit('test-case-completed', result);
      
      if (outcome.success) {
        console.log(`    ✅ ${testName} - ${outcome.result}`);
      } else {
        console.log(`    ❌ ${testName} - ${outcome.result}`);
      }

      return result;

    } catch (error) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      const result: TestCaseResult = {
        testId,
        testName,
        testCategory: category,
        startTime,
        endTime,
        duration,
        status: 'failed',
        description: `Test case: ${testName}`,
        expectedOutcome: 'Successful execution',
        actualOutcome: 'Test threw an error',
        errorDetails: error instanceof Error ? error.message : String(error),
        artifacts: {
          logs: [`Test failed after ${duration}ms`, String(error)],
        },
      };

      this.emit('test-case-failed', testId, error instanceof Error ? error : new Error(String(error)));
      this.emit('test-case-completed', result);
      
      console.log(`    ❌ ${testName} - ERROR: ${error instanceof Error ? error.message : String(error)}`);
      
      return result;
    }
  }

  /**
   * Initialize test environment
   */
  private async initializeTestEnvironment(): Promise<void> {
    console.log('🔧 Initializing test environment...');
    
    // Initialize core integration with dependencies
    await this.coreIntegration.initialize(this.toolRegistry, this.config);
    
    // Initialize session manager
    await this.sessionManager.initialize();
    
    // Clear any previous test artifacts
    this.createdAgents = [];
    this.activeSessions = [];
    this.executedWorkflows = [];
    this.testLogs = [];
    
    console.log('✅ Test environment initialized');
  }

  /**
   * Clean up test environment
   */
  private async cleanupTestEnvironment(): Promise<void> {
    console.log('🧹 Cleaning up test environment...');

    try {
      // Deactivate any active agents
      const activeAgent = await this.agentManager.getActiveAgent();
      if (activeAgent) {
        await this.agentManager.deactivateAgent();
      }

      // Clean up created agents
      for (const agent of this.createdAgents) {
        try {
          await this.agentManager.deleteAgent(agent.id);
        } catch (error) {
          console.warn(`Warning: Failed to delete test agent ${agent.id}:`, error);
        }
      }

      // Clean up test files
      try {
        const fs = await import('fs/promises');
        await fs.unlink('/tmp/e2e-test-file.txt').catch(() => {}); // Ignore if doesn't exist
        await fs.unlink('/tmp/coord-test-1.txt').catch(() => {});
        await fs.unlink('/tmp/coord-test-2.txt').catch(() => {});
      } catch (error) {
        console.warn('Warning: Failed to clean up test files:', error);
      }

      // Clean up core integration
      await this.coreIntegration.cleanup();

      console.log('✅ Test environment cleanup completed');
    } catch (error) {
      console.warn('⚠️  Test environment cleanup had issues:', error);
    }
  }

  /**
   * Generate final test results
   */
  private async generateTestResults(
    testSuiteId: string,
    startTime: Date,
    endTime: Date,
    testResults: TestCaseResult[]
  ): Promise<EndToEndTestResults> {
    const totalDuration = endTime.getTime() - startTime.getTime();
    const testsRun = testResults.length;
    const testsPassed = testResults.filter(r => r.status === 'passed').length;
    const testsFailed = testResults.filter(r => r.status === 'failed').length;
    const testsSkipped = testResults.filter(r => r.status === 'skipped').length;
    const overallSuccess = testsFailed === 0;

    // Check integration health
    const status = await this.coreIntegration.getIntegrationStatus();
    const integrationHealth = {
      providerIntegration: status.hasProvider,
      sessionIntegration: status.hasSessionIntegration,
      workflowIntegration: status.hasWorkflowIntegration,
      analyticsIntegration: status.hasAnalyticsIntegration,
    };

    // Calculate performance metrics
    const performanceMetrics = {
      averageTestDuration: testsRun > 0 ? totalDuration / testsRun : 0,
      agentActivationTime: testResults
        .filter(r => r.testCategory === 'agent-activation')
        .reduce((sum, r) => sum + r.duration, 0) / testResults.filter(r => r.testCategory === 'agent-activation').length || 0,
      workflowExecutionTime: testResults
        .filter(r => r.testCategory === 'workflow-execution')
        .reduce((sum, r) => sum + r.duration, 0) / testResults.filter(r => r.testCategory === 'workflow-execution').length || 0,
      sessionRecoveryTime: testResults
        .filter(r => r.testCategory === 'session-persistence')
        .reduce((sum, r) => sum + r.duration, 0) / testResults.filter(r => r.testCategory === 'session-persistence').length || 0,
      memoryUsage: process.memoryUsage().heapUsed,
    };

    return {
      testSuiteId,
      startTime,
      endTime,
      totalDuration,
      testsRun,
      testsPassed,
      testsFailed,
      testsSkipped,
      overallSuccess,
      testResults,
      integrationHealth,
      performanceMetrics,
    };
  }
}

/**
 * Global end-to-end test suite instance
 */
let globalEndToEndTestSuite: EndToEndTestSuite | null = null;

/**
 * Get or create the global end-to-end test suite
 */
export function getEndToEndTestSuite(config: Config, toolRegistry: ToolRegistry): EndToEndTestSuite {
  if (!globalEndToEndTestSuite) {
    globalEndToEndTestSuite = new EndToEndTestSuite(config, toolRegistry);
  }
  return globalEndToEndTestSuite;
}

/**
 * Run comprehensive end-to-end tests
 */
export async function runEndToEndTests(config: Config, toolRegistry: ToolRegistry): Promise<EndToEndTestResults> {
  const testSuite = getEndToEndTestSuite(config, toolRegistry);
  return await testSuite.runFullTestSuite();
}