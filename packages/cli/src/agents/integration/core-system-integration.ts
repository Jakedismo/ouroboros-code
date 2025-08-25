/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { ContentGenerator } from '../../../core/src/core/contentGenerator.js';
import { LLMProviderFactory } from '../../../core/src/providers/factory.js';
import { LLMProviderConfig } from '../../../core/src/providers/types.js';
import { AgentConfig } from '../registry/agent-storage.js';
import { AgentManager } from './agent-manager.js';
import { ToolRegistry } from '../../../core/src/tools/tool-registry.js';
import { Config } from '../../../core/src/config/config.js';
import { 
  WorkflowToolIntegration, 
  initializeWorkflowToolIntegration,
  getWorkflowToolIntegration 
} from './workflow-tool-integration.js';
import {
  SessionAgentIntegration,
  initializeSessionAgentIntegration,
  getSessionAgentIntegration
} from './session-agent-integration.js';
import {
  AgentAnalyticsIntegration,
  initializeAgentAnalyticsIntegration,
  getAgentAnalyticsIntegration
} from './agent-analytics-integration.js';
import { OptimizationIntegration } from '../optimization/optimization-integration.js';
import { ErrorLoggingIntegration } from '../error-handling/error-logging-integration.js';

/**
 * Integration layer between agent system and core Ouroboros system
 */
export class CoreSystemIntegration {
  private agentManager: AgentManager;
  private currentProvider: ContentGenerator | null = null;
  private providerConfig: LLMProviderConfig | null = null;
  private workflowToolIntegration: WorkflowToolIntegration | null = null;
  private sessionAgentIntegration: SessionAgentIntegration | null = null;
  private agentAnalyticsIntegration: AgentAnalyticsIntegration | null = null;
  private optimizationIntegration: OptimizationIntegration | null = null;
  private errorLoggingIntegration: ErrorLoggingIntegration | null = null;
  private toolRegistry: ToolRegistry | null = null;
  private config: Config | null = null;

  constructor(agentManager: AgentManager) {
    this.agentManager = agentManager;
  }

  /**
   * Initialize core system integration with agent-aware provider management
   */
  async initialize(toolRegistry?: ToolRegistry, config?: Config): Promise<void> {
    console.log('🔗 Initializing core system integration with agent management...');

    // Store dependencies
    if (toolRegistry) this.toolRegistry = toolRegistry;
    if (config) this.config = config;

    // Set up agent activation listeners to update system prompts
    this.agentManager.onAgentActivation(async (event, agent, error) => {
      if (event === 'after-activation' && agent) {
        await this.updateProviderForAgent(agent);
        // Update workflow-tool integration context when agent changes
        await this.updateWorkflowToolContext(agent);
      } else if (event === 'activation-failed' && error) {
        console.error(`🚨 Agent activation failed, keeping current provider: ${error.message}`);
      }
    });

    // Initialize workflow-tool integration if dependencies are available
    if (this.toolRegistry && this.config) {
      await this.initializeWorkflowToolIntegration();
    }

    // Initialize session-agent integration
    await this.initializeSessionAgentIntegration();

    // Initialize agent analytics integration if config is available
    if (this.config) {
      await this.initializeAgentAnalyticsIntegration();
    }

    // Initialize optimization integration if all dependencies are available
    if (this.toolRegistry && this.config && this.agentAnalyticsIntegration) {
      await this.initializeOptimizationIntegration();
    }

    // Initialize error-logging integration if all dependencies are available
    if (this.toolRegistry && this.config) {
      await this.initializeErrorLoggingIntegration();
    }

    console.log('✅ Core system integration initialized');
  }

  /**
   * Initialize workflow-tool integration system
   */
  private async initializeWorkflowToolIntegration(): Promise<void> {
    if (!this.toolRegistry || !this.config) {
      console.warn('⚠️  Cannot initialize workflow-tool integration: missing dependencies');
      return;
    }

    console.log('🔧 Initializing workflow-tool integration...');
    
    try {
      this.workflowToolIntegration = await initializeWorkflowToolIntegration(
        this.toolRegistry,
        this.config,
        {
          maxParallelToolExecutions: 3,
          enableToolCaching: true,
          enableToolProfiling: true,
          toolExecutionTimeoutMs: 300000, // 5 minutes
          enableProgressTracking: true,
        }
      );
      
      // Set up integration event listeners
      this.setupWorkflowToolEventListeners();
      
      console.log('✅ Workflow-tool integration initialized');
    } catch (error) {
      console.error('❌ Failed to initialize workflow-tool integration:', error);
    }
  }

  /**
   * Update workflow-tool integration context when agent changes
   */
  private async updateWorkflowToolContext(agent: AgentConfig): Promise<void> {
    if (!this.workflowToolIntegration) {
      return;
    }

    console.log(`🔄 Updating workflow-tool context for agent: ${agent.name}`);
    
    // Update tool execution configuration based on agent preferences
    const integrationConfig = {
      maxParallelToolExecutions: agent.toolConfiguration?.maxParallelTools || 3,
      enableToolCaching: agent.toolConfiguration?.enableCaching !== false,
      enableToolProfiling: true,
      enableFailFast: agent.toolConfiguration?.failFast === true,
    };

    this.workflowToolIntegration.updateConfiguration(integrationConfig);
  }

  /**
   * Setup event listeners for workflow-tool integration
   */
  private setupWorkflowToolEventListeners(): void {
    if (!this.workflowToolIntegration) {
      return;
    }

    this.workflowToolIntegration.on('step-tools-extracted', (stepId, tools) => {
      console.debug(`🔧 Step ${stepId}: Extracted ${tools.length} tools for execution`);
    });

    this.workflowToolIntegration.on('tools-execution-started', (stepId, tools) => {
      console.log(`▶️  Step ${stepId}: Starting execution of ${tools.length} tools`);
    });

    this.workflowToolIntegration.on('tools-execution-progress', (stepId, progress, completed, total) => {
      console.debug(`🔄 Step ${stepId}: Tool execution ${progress.toFixed(1)}% complete (${completed}/${total})`);
    });

    this.workflowToolIntegration.on('tools-execution-completed', (stepId, result) => {
      console.log(`✅ Step ${stepId}: Tool execution completed successfully (${result.totalTime.toFixed(0)}ms)`);
    });

    this.workflowToolIntegration.on('tools-execution-failed', (stepId, error) => {
      console.error(`❌ Step ${stepId}: Tool execution failed: ${error.message}`);
    });
  }

  /**
   * Initialize session-agent integration system
   */
  private async initializeSessionAgentIntegration(): Promise<void> {
    console.log('🔗 Initializing session-agent integration...');
    
    try {
      this.sessionAgentIntegration = await initializeSessionAgentIntegration();
      
      // Set up integration event listeners
      this.setupSessionAgentEventListeners();
      
      console.log('✅ Session-agent integration initialized');
    } catch (error) {
      console.error('❌ Failed to initialize session-agent integration:', error);
    }
  }

  /**
   * Setup event listeners for session-agent integration
   */
  private setupSessionAgentEventListeners(): void {
    if (!this.sessionAgentIntegration) {
      return;
    }

    this.sessionAgentIntegration.on('agent-activated-in-session', (sessionId, agentId, agentConfig) => {
      console.log(`🤖 Agent ${agentConfig.name} activated in session ${sessionId.substring(0, 8)}`);
    });

    this.sessionAgentIntegration.on('agent-deactivated-in-session', (sessionId, agentId) => {
      console.log(`🤖 Agent ${agentId} deactivated from session ${sessionId.substring(0, 8)}`);
    });

    this.sessionAgentIntegration.on('session-agent-persisted', (sessionId, agentId, persistenceData) => {
      console.debug(`💾 Agent ${agentId} data persisted for session ${sessionId.substring(0, 8)}`);
    });

    this.sessionAgentIntegration.on('agent-performance-updated', (sessionId, agentId, metrics) => {
      console.debug(`📊 Agent ${agentId} performance updated: ${(metrics.successRate * 100).toFixed(1)}% success rate`);
    });
  }

  /**
   * Initialize agent analytics integration system
   */
  private async initializeAgentAnalyticsIntegration(): Promise<void> {
    if (!this.config) {
      console.warn('⚠️  Cannot initialize agent analytics integration: missing config');
      return;
    }

    console.log('📊 Initializing agent analytics integration...');
    
    try {
      this.agentAnalyticsIntegration = await initializeAgentAnalyticsIntegration(
        this.config,
        {
          successRateMin: 0.8,
          averageResponseTimeMax: 5000,
          resourceEfficiencyMin: 0.7,
          errorRateMax: 0.2,
        }
      );
      
      // Set up integration event listeners
      this.setupAgentAnalyticsEventListeners();
      
      console.log('✅ Agent analytics integration initialized');
    } catch (error) {
      console.error('❌ Failed to initialize agent analytics integration:', error);
    }
  }

  /**
   * Setup event listeners for agent analytics integration
   */
  private setupAgentAnalyticsEventListeners(): void {
    if (!this.agentAnalyticsIntegration) {
      return;
    }

    this.agentAnalyticsIntegration.on('metrics-recorded', (agentId, metricType, value, attributes) => {
      console.debug(`📊 Agent ${agentId} metric recorded: ${metricType} = ${value}`);
    });

    this.agentAnalyticsIntegration.on('performance-alert', (agentId, metric, value, threshold) => {
      console.warn(`⚠️  Agent ${agentId} performance alert: ${metric} = ${value} (threshold: ${threshold})`);
    });

    this.agentAnalyticsIntegration.on('analytics-aggregated', (summary) => {
      console.log(`📊 Analytics summary: ${summary.totalExecutions} executions, ${(summary.overallSuccessRate * 100).toFixed(1)}% success rate`);
    });

    this.agentAnalyticsIntegration.on('agent-benchmark-completed', (agentId, benchmarkResults) => {
      console.log(`🔬 Agent ${agentId} benchmark completed: Overall score ${benchmarkResults.overallScore}/100`);
    });
  }

  /**
   * Initialize optimization integration system
   */
  private async initializeOptimizationIntegration(): Promise<void> {
    if (!this.toolRegistry || !this.config || !this.agentAnalyticsIntegration) {
      console.warn('⚠️  Cannot initialize optimization integration: missing dependencies');
      return;
    }

    console.log('⚡ Initializing optimization integration...');
    
    try {
      // We need to dynamically import these managers as they depend on workflow/session systems
      const { getWorkflowManager } = await import('../workflow/workflow-manager.js');
      const { getSessionManager } = await import('../session/session-manager.js');
      
      const workflowManager = await getWorkflowManager();
      const sessionManager = await getSessionManager();
      
      this.optimizationIntegration = new OptimizationIntegration(
        this.config,
        this.toolRegistry,
        this.agentManager,
        workflowManager,
        sessionManager,
        this.agentAnalyticsIntegration,
        {
          coordinationStrategy: 'hybrid',
          optimizationIntervalMs: 120000, // 2 minutes
          alertThresholds: {
            memoryUsagePercent: 80,
            cpuUsagePercent: 85,
            resourceContentionCount: 5,
            performanceDegradationPercent: 20,
          },
          adaptiveLearning: {
            enabled: true,
            learningRate: 0.15,
            memorySize: 500,
          },
          resourceAllocationStrategy: 'adaptive',
          performanceConfig: {
            autoOptimization: {
              enabled: true,
              intervalMs: 180000, // 3 minutes
              adaptiveThresholds: true,
              learningRate: 0.1,
            }
          }
        }
      );
      
      await this.optimizationIntegration.initialize();
      
      // Set up integration event listeners
      this.setupOptimizationEventListeners();
      
      console.log('✅ Optimization integration initialized');
    } catch (error) {
      console.error('❌ Failed to initialize optimization integration:', error);
    }
  }

  /**
   * Setup event listeners for optimization integration
   */
  private setupOptimizationEventListeners(): void {
    if (!this.optimizationIntegration) {
      return;
    }

    this.optimizationIntegration.on('optimization-integration-initialized', (info) => {
      console.log(`⚡ Optimization system initialized with ${info.config.coordinationStrategy} strategy`);
    });

    this.optimizationIntegration.on('coordinated-optimization-completed', (decision) => {
      const impact = decision.expectedImpact;
      console.log(`✅ Coordinated optimization completed: ${decision.actions.length} actions, ` +
        `${(impact.performanceImprovement * 100).toFixed(1)}% performance gain`);
    });

    this.optimizationIntegration.on('performance-optimization-completed', (results) => {
      console.log(`⚡ Performance optimization completed: ${results.improvements.memoryReduction.toFixed(1)}MB freed, ` +
        `${results.improvements.speedIncrease.toFixed(0)}ms faster`);
    });

    this.optimizationIntegration.on('resource-allocation-failure', (failure) => {
      console.warn(`⚠️  Resource allocation failed: ${failure.reason || 'Unknown reason'}`);
    });

    this.optimizationIntegration.on('configuration-updated', ({ oldConfig, newConfig }) => {
      console.log(`🔄 Optimization configuration updated`);
    });
  }

  /**
   * Initialize error-logging integration system
   */
  private async initializeErrorLoggingIntegration(): Promise<void> {
    if (!this.toolRegistry || !this.config) {
      console.warn('⚠️  Cannot initialize error-logging integration: missing dependencies');
      return;
    }

    console.log('🚨 Initializing error-logging integration...');
    
    try {
      this.errorLoggingIntegration = new ErrorLoggingIntegration(
        this.config,
        this.toolRegistry,
        this.agentManager,
        {
          enableAutomaticErrorLogging: true,
          enableErrorRecoveryLogging: true,
          enablePerformanceErrorTracking: true,
          alerting: {
            enableErrorAlerts: true,
            enableLogAlerts: true,
            errorRateThreshold: 10,
            criticalErrorThreshold: 3,
          },
          monitoring: {
            enableRealTimeMonitoring: true,
            monitoringIntervalMs: 30000,
            healthCheckIntervalMs: 60000,
          },
        }
      );
      
      await this.errorLoggingIntegration.initialize();
      
      // Set up integration event listeners
      this.setupErrorLoggingEventListeners();
      
      console.log('✅ Error-logging integration initialized');
    } catch (error) {
      console.error('❌ Failed to initialize error-logging integration:', error);
    }
  }

  /**
   * Setup event listeners for error-logging integration
   */
  private setupErrorLoggingEventListeners(): void {
    if (!this.errorLoggingIntegration) {
      return;
    }

    this.errorLoggingIntegration.on('error-logging-integration-initialized', (info) => {
      console.log('🚨 Error-logging system initialized with comprehensive monitoring');
    });

    this.errorLoggingIntegration.on('error-handled', (error) => {
      console.log(`🚨 Error handled: ${error.category} - ${error.severity} - ${error.message}`);
    });

    this.errorLoggingIntegration.on('system-critical-alert', (health) => {
      console.error(`🔴 SYSTEM CRITICAL: Overall status is critical with ${health.alerts.length} active alerts`);
    });

    this.errorLoggingIntegration.on('system-degraded-alert', (health) => {
      console.warn(`🟡 SYSTEM DEGRADED: Performance degradation detected with ${health.recommendations.length} recommendations`);
    });

    this.errorLoggingIntegration.on('error-rate-alert', (alert) => {
      console.error(`🚨 ERROR RATE ALERT: ${alert.rate} errors per minute (threshold: ${alert.threshold})`);
    });

    this.errorLoggingIntegration.on('critical-error-alert', (alert) => {
      console.error(`💥 CRITICAL ERROR ALERT: ${alert.count} critical errors (threshold: ${alert.threshold})`);
    });

    this.errorLoggingIntegration.on('error-log-correlation-created', (correlation) => {
      console.debug(`🔗 Error-log correlation created: ${correlation.correlationId} with ${correlation.analysis.possibleCauses.length} possible causes`);
    });
  }

  /**
   * Create or update LLM provider based on active agent configuration
   */
  async updateProviderForAgent(agent: AgentConfig): Promise<ContentGenerator> {
    console.log(`🤖 Updating LLM provider for agent: ${agent.name}`);

    // Get current provider configuration or use defaults
    const baseConfig = this.providerConfig || {
      provider: 'gemini' as const,
      apiKey: process.env.GEMINI_API_KEY || '',
      enableBuiltinTools: true,
      enableMCP: true
    };

    // Create agent-enhanced configuration
    const agentEnhancedConfig: LLMProviderConfig = {
      ...baseConfig,
      // Inject agent-specific system prompt
      systemPrompt: this.buildAgentSystemPrompt(agent),
      // Agent-specific tool configuration
      enableBuiltinTools: agent.toolConfiguration?.enableBuiltinTools ?? true,
      enableMCP: agent.toolConfiguration?.enableMCP ?? true,
      // Agent-specific model preferences (if specified)
      model: agent.preferredModel || baseConfig.model
    };

    try {
      // Create new provider with agent configuration
      const provider = await LLMProviderFactory.create(agentEnhancedConfig);
      
      // Store the updated provider and config
      this.currentProvider = provider;
      this.providerConfig = agentEnhancedConfig;

      console.log(`✅ Provider updated for agent: ${agent.name}`);
      return provider;

    } catch (error) {
      console.error(`❌ Failed to update provider for agent ${agent.name}: ${error}`);
      
      // Fall back to existing provider if available
      if (this.currentProvider) {
        console.log('🔄 Falling back to existing provider');
        return this.currentProvider;
      }
      
      throw error;
    }
  }

  /**
   * Get the current LLM provider (agent-aware)
   */
  async getCurrentProvider(): Promise<ContentGenerator> {
    if (!this.currentProvider) {
      // If no provider exists, create one based on active agent
      const activeAgent = await this.agentManager.getActiveAgent();
      if (activeAgent) {
        return await this.updateProviderForAgent(activeAgent);
      }
      
      // Fall back to default provider
      return await this.createDefaultProvider();
    }

    return this.currentProvider;
  }

  /**
   * Update the base provider configuration (e.g., when user changes API keys)
   */
  async updateProviderConfig(config: Partial<LLMProviderConfig>): Promise<void> {
    this.providerConfig = {
      ...this.providerConfig,
      ...config
    } as LLMProviderConfig;

    // Update provider with current agent if one is active
    const activeAgent = await this.agentManager.getActiveAgent();
    if (activeAgent) {
      await this.updateProviderForAgent(activeAgent);
    }
  }

  /**
   * Build comprehensive system prompt from agent configuration
   */
  private buildAgentSystemPrompt(agent: AgentConfig): string {
    const prompts: string[] = [];

    // Add agent's primary system prompt
    if (agent.systemPrompt) {
      prompts.push(agent.systemPrompt);
    }

    // Add agent capabilities
    if (agent.capabilities && agent.capabilities.length > 0) {
      prompts.push(`\nAgent Capabilities: ${agent.capabilities.join(', ')}`);
    }

    // Add tool configuration context
    if (agent.toolConfiguration?.enabledTools && agent.toolConfiguration.enabledTools.length > 0) {
      prompts.push(`\nAvailable Tools: ${agent.toolConfiguration.enabledTools.join(', ')}`);
    }

    // Add special behaviors
    if (agent.specialBehaviors && agent.specialBehaviors.length > 0) {
      prompts.push(`\nSpecial Behaviors: ${agent.specialBehaviors.join(', ')}`);
    }

    // Add examples if available
    if (agent.examples && agent.examples.length > 0) {
      prompts.push('\nExamples:');
      agent.examples.forEach((example, index) => {
        prompts.push(`${index + 1}. ${example.description || 'Example'}`);
        if (example.input) prompts.push(`   Input: ${example.input}`);
        if (example.output) prompts.push(`   Output: ${example.output}`);
      });
    }

    return prompts.join('\n\n');
  }

  /**
   * Create a default provider when no agent is active
   */
  private async createDefaultProvider(): Promise<ContentGenerator> {
    const defaultConfig: LLMProviderConfig = {
      provider: 'gemini' as const,
      apiKey: process.env.GEMINI_API_KEY || '',
      enableBuiltinTools: true,
      enableMCP: true,
      systemPrompt: 'You are a helpful AI assistant.'
    };

    this.currentProvider = await LLMProviderFactory.create(defaultConfig);
    this.providerConfig = defaultConfig;

    return this.currentProvider;
  }

  /**
   * Get workflow-tool integration instance
   */
  getWorkflowToolIntegration(): WorkflowToolIntegration | null {
    return this.workflowToolIntegration;
  }

  /**
   * Get session-agent integration instance
   */
  getSessionAgentIntegration(): SessionAgentIntegration | null {
    return this.sessionAgentIntegration;
  }

  /**
   * Get agent analytics integration instance
   */
  getAgentAnalyticsIntegration(): AgentAnalyticsIntegration | null {
    return this.agentAnalyticsIntegration;
  }

  /**
   * Get optimization integration instance
   */
  getOptimizationIntegration(): OptimizationIntegration | null {
    return this.optimizationIntegration;
  }

  /**
   * Get error-logging integration instance
   */
  getErrorLoggingIntegration(): ErrorLoggingIntegration | null {
    return this.errorLoggingIntegration;
  }

  /**
   * Execute a workflow step through the integrated tool system
   */
  async executeWorkflowStep(
    workflowId: string,
    stepId: string,
    step: any,
    context: {
      agentConfig?: AgentConfig;
      previousResults?: Map<string, any>;
      workflowContext?: Record<string, any>;
    } = {}
  ): Promise<any> {
    if (!this.workflowToolIntegration) {
      throw new Error('Workflow-tool integration not initialized');
    }

    // Use current active agent if no agent provided
    if (!context.agentConfig) {
      context.agentConfig = await this.agentManager.getActiveAgent() || undefined;
    }

    return await this.workflowToolIntegration.executeWorkflowStep(
      workflowId,
      stepId,
      step,
      context
    );
  }

  /**
   * Get integration status and health information
   */
  async getIntegrationStatus(): Promise<{
    hasProvider: boolean;
    providerType: string | null;
    hasActiveAgent: boolean;
    activeAgentName: string | null;
    hasWorkflowIntegration: boolean;
    hasSessionIntegration: boolean;
    hasAnalyticsIntegration: boolean;
    hasOptimizationIntegration: boolean;
    hasErrorLoggingIntegration: boolean;
    integrationHealthy: boolean;
    toolExecutionStats?: any;
    sessionAgentStats?: any;
    analyticsSummary?: any;
    optimizationStatus?: any;
    systemHealthStatus?: any;
  }> {
    const activeAgent = await this.agentManager.getActiveAgent();
    
    // Generate analytics summary if available
    let analyticsSummary = undefined;
    if (this.agentAnalyticsIntegration) {
      try {
        analyticsSummary = await this.agentAnalyticsIntegration.generateAnalyticsSummary(1); // Last 1 hour
      } catch (error) {
        console.debug('Could not generate analytics summary:', error);
      }
    }

    // Get optimization status if available
    let optimizationStatus = undefined;
    if (this.optimizationIntegration) {
      try {
        optimizationStatus = await this.optimizationIntegration.getSystemOptimizationStatus();
      } catch (error) {
        console.debug('Could not get optimization status:', error);
      }
    }

    // Get system health status if available
    let systemHealthStatus = undefined;
    if (this.errorLoggingIntegration) {
      try {
        systemHealthStatus = await this.errorLoggingIntegration.getSystemHealthStatus();
      } catch (error) {
        console.debug('Could not get system health status:', error);
      }
    }
    
    return {
      hasProvider: this.currentProvider !== null,
      providerType: this.providerConfig?.provider || null,
      hasActiveAgent: activeAgent !== null,
      activeAgentName: activeAgent?.name || null,
      hasWorkflowIntegration: this.workflowToolIntegration !== null,
      hasSessionIntegration: this.sessionAgentIntegration !== null,
      hasAnalyticsIntegration: this.agentAnalyticsIntegration !== null,
      hasOptimizationIntegration: this.optimizationIntegration !== null,
      hasErrorLoggingIntegration: this.errorLoggingIntegration !== null,
      integrationHealthy: this.currentProvider !== null && this.providerConfig !== null,
      toolExecutionStats: this.workflowToolIntegration?.getToolExecutionStatistics(),
      sessionAgentStats: this.sessionAgentIntegration?.getAgentUsageStatistics(),
      analyticsSummary,
      optimizationStatus,
      systemHealthStatus,
    };
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up core system integration...');
    
    // Clean up workflow-tool integration
    if (this.workflowToolIntegration) {
      try {
        await this.workflowToolIntegration.destroy();
        this.workflowToolIntegration = null;
      } catch (error) {
        console.warn(`Warning: Workflow-tool integration cleanup failed: ${error}`);
      }
    }

    // Clean up session-agent integration
    if (this.sessionAgentIntegration) {
      try {
        await this.sessionAgentIntegration.cleanup();
        this.sessionAgentIntegration = null;
      } catch (error) {
        console.warn(`Warning: Session-agent integration cleanup failed: ${error}`);
      }
    }

    // Clean up agent analytics integration
    if (this.agentAnalyticsIntegration) {
      try {
        await this.agentAnalyticsIntegration.cleanup();
        this.agentAnalyticsIntegration = null;
      } catch (error) {
        console.warn(`Warning: Agent analytics integration cleanup failed: ${error}`);
      }
    }

    // Clean up optimization integration
    if (this.optimizationIntegration) {
      try {
        await this.optimizationIntegration.cleanup();
        this.optimizationIntegration = null;
      } catch (error) {
        console.warn(`Warning: Optimization integration cleanup failed: ${error}`);
      }
    }

    // Clean up error-logging integration
    if (this.errorLoggingIntegration) {
      try {
        await this.errorLoggingIntegration.cleanup();
        this.errorLoggingIntegration = null;
      } catch (error) {
        console.warn(`Warning: Error-logging integration cleanup failed: ${error}`);
      }
    }

    // Clean up provider
    if (this.currentProvider && 'cleanup' in this.currentProvider) {
      try {
        await (this.currentProvider as any).cleanup();
      } catch (error) {
        console.warn(`Warning: Provider cleanup failed: ${error}`);
      }
    }

    this.currentProvider = null;
    this.providerConfig = null;
    this.toolRegistry = null;
    this.config = null;
    
    console.log('✅ Core system integration cleanup completed');
  }
}

/**
 * Global integration instance
 */
let globalIntegration: CoreSystemIntegration | null = null;

/**
 * Get or create global core system integration
 */
export async function getCoreSystemIntegration(): Promise<CoreSystemIntegration> {
  if (!globalIntegration) {
    const { getAgentManager } = await import('./agent-manager.js');
    const agentManager = getAgentManager();
    
    globalIntegration = new CoreSystemIntegration(agentManager);
    await globalIntegration.initialize();
  }

  return globalIntegration;
}

/**
 * Initialize global core system integration
 */
export async function initializeCoreSystemIntegration(
  toolRegistry?: ToolRegistry,
  config?: Config
): Promise<CoreSystemIntegration> {
  const integration = await getCoreSystemIntegration();
  await integration.initialize(toolRegistry, config);
  return integration;
}