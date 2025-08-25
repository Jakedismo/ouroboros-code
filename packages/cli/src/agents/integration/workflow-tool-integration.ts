/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { ToolRegistry } from '../../../core/src/tools/tool-registry.js';
import { ToolExecutionCoordinator, CoordinatedExecutionResult, ExecutionOptions } from '../../../core/src/providers/tools/tool-execution-coordinator.js';
import { BuiltinToolManager } from '../../../core/src/providers/tools/builtin-tool-manager.js';
import { UnifiedToolCall, UnifiedToolResult, ToolExecutionContext } from '../../../core/src/providers/tools/unified-tool-interface.js';
import { Config } from '../../../core/src/config/config.js';

// Workflow system imports
import { getWorkflowMonitor, WorkflowExecutionState, WorkflowStep, StepStatus } from '../../workflow/monitoring/workflow-monitor.js';
import { getWorkflowStateManager } from '../../workflow/state/workflow-state-manager.js';

// Agent system imports
import { AgentConfig } from '../registry/agent-storage.js';
import { getAgentManager } from './agent-manager.js';

/**
 * Workflow step execution result
 */
export interface WorkflowStepExecutionResult {
  stepId: string;
  success: boolean;
  result: any;
  output: string;
  error?: string;
  executionTime: number;
  toolsExecuted: UnifiedToolCall[];
  toolResults: Map<string, UnifiedToolResult>;
  metadata: {
    agentId?: string;
    workflowId: string;
    retryAttempt: number;
    startTime: Date;
    endTime: Date;
  };
}

/**
 * Workflow tool execution events
 */
export interface WorkflowToolIntegrationEvents {
  'step-tools-extracted': (stepId: string, tools: UnifiedToolCall[]) => void;
  'tools-execution-started': (stepId: string, tools: UnifiedToolCall[]) => void;
  'tools-execution-progress': (stepId: string, progress: number, completed: number, total: number) => void;
  'tools-execution-completed': (stepId: string, result: CoordinatedExecutionResult) => void;
  'tools-execution-failed': (stepId: string, error: Error, partialResults?: CoordinatedExecutionResult) => void;
  'step-execution-completed': (stepId: string, result: WorkflowStepExecutionResult) => void;
}

/**
 * Integration configuration
 */
export interface WorkflowToolIntegrationConfig {
  maxParallelToolExecutions: number;
  enableToolCaching: boolean;
  enableToolProfiling: boolean;
  toolExecutionTimeoutMs: number;
  enableFailFast: boolean;
  enableProgressTracking: boolean;
  toolRetryAttempts: number;
  toolRetryDelayMs: number;
}

/**
 * Integration layer between agent workflow system and core tool execution
 * 
 * This class bridges the gap between workflow-level execution planning and
 * the core tool execution infrastructure, providing:
 * - Workflow step to tool call extraction
 * - Coordinated tool execution with optimization
 * - Progress tracking and result aggregation
 * - Error handling and recovery integration
 * - Agent-aware tool execution contexts
 */
export class WorkflowToolIntegration extends EventEmitter {
  private workflowMonitor = getWorkflowMonitor();
  private stateManager = getWorkflowStateManager();
  private agentManager = getAgentManager();
  
  private toolRegistry: ToolRegistry;
  private toolCoordinator: ToolExecutionCoordinator;
  private builtinToolManager: BuiltinToolManager;
  private config: Config;
  
  private integrationConfig: WorkflowToolIntegrationConfig = {
    maxParallelToolExecutions: 5,
    enableToolCaching: true,
    enableToolProfiling: true,
    toolExecutionTimeoutMs: 300000, // 5 minutes
    enableFailFast: false,
    enableProgressTracking: true,
    toolRetryAttempts: 3,
    toolRetryDelayMs: 1000,
  };
  
  // Active step executions tracking
  private activeStepExecutions = new Map<string, {
    workflowId: string;
    stepId: string;
    agentConfig?: AgentConfig;
    startTime: Date;
    toolCalls: UnifiedToolCall[];
    abortController: AbortController;
  }>();

  constructor(
    toolRegistry: ToolRegistry, 
    config: Config,
    integrationConfig?: Partial<WorkflowToolIntegrationConfig>
  ) {
    super();
    
    this.toolRegistry = toolRegistry;
    this.config = config;
    this.integrationConfig = { ...this.integrationConfig, ...integrationConfig };
    
    // Initialize builtin tool manager and coordinator
    this.builtinToolManager = new BuiltinToolManager(config);
    this.toolCoordinator = new ToolExecutionCoordinator(
      this.builtinToolManager,
      {
        maxParallelExecutions: this.integrationConfig.maxParallelToolExecutions,
        enableProfiling: this.integrationConfig.enableToolProfiling,
      }
    );
    
    this.setupWorkflowMonitorIntegration();
  }

  /**
   * Initialize the workflow-tool integration system
   */
  async initialize(): Promise<void> {
    console.log('🔧 Initializing workflow-tool integration...');
    
    // Initialize builtin tool manager
    await this.builtinToolManager.initialize();
    
    // Discover all available tools
    await this.toolRegistry.discoverAllTools();
    
    // Initialize state manager
    await this.stateManager.initialize();
    
    console.log('✅ Workflow-tool integration initialized');
  }

  /**
   * Execute a workflow step by extracting and coordinating tool execution
   */
  async executeWorkflowStep(
    workflowId: string,
    stepId: string,
    step: WorkflowStep,
    context: {
      agentConfig?: AgentConfig;
      previousResults?: Map<string, any>;
      workflowContext?: Record<string, any>;
    } = {}
  ): Promise<WorkflowStepExecutionResult> {
    const startTime = new Date();
    const executionId = `${workflowId}_${stepId}_${Date.now()}`;
    
    console.log(`🛠️  Executing workflow step: ${step.name || stepId}`);
    
    try {
      // Extract tool calls from the workflow step
      const toolCalls = await this.extractToolCallsFromStep(step, context);
      this.emit('step-tools-extracted', stepId, toolCalls);
      
      if (toolCalls.length === 0) {
        // Step doesn't require tool execution
        return this.createStepResult(stepId, true, 'No tools required', '', {
          workflowId,
          agentId: context.agentConfig?.id,
          toolCalls: [],
          toolResults: new Map(),
          startTime,
          endTime: new Date(),
          retryAttempt: 0,
        });
      }
      
      // Setup execution tracking
      const abortController = new AbortController();
      this.activeStepExecutions.set(executionId, {
        workflowId,
        stepId,
        agentConfig: context.agentConfig,
        startTime,
        toolCalls,
        abortController,
      });
      
      // Create tool execution context
      const toolContext = this.createToolExecutionContext(
        context.agentConfig,
        context.workflowContext,
        abortController.signal
      );
      
      // Configure execution options
      const executionOptions: ExecutionOptions = {
        maxParallel: this.integrationConfig.maxParallelToolExecutions,
        disableCache: !this.integrationConfig.enableToolCaching,
        enableProfiling: this.integrationConfig.enableToolProfiling,
        timeoutMs: this.integrationConfig.toolExecutionTimeoutMs,
        failFast: this.integrationConfig.enableFailFast,
        onProgress: this.integrationConfig.enableProgressTracking ? 
          (status) => this.handleToolExecutionProgress(stepId, status) : undefined,
      };
      
      this.emit('tools-execution-started', stepId, toolCalls);
      
      // Execute tools through coordinator
      const coordinatedResult = await this.toolCoordinator.executeTools(
        toolCalls,
        toolContext,
        executionOptions
      );
      
      // Process results
      const success = coordinatedResult.success && coordinatedResult.errors.length === 0;
      const output = this.aggregateToolOutputs(coordinatedResult.results);
      const error = coordinatedResult.errors.length > 0 
        ? coordinatedResult.errors.map(e => e.error).join('; ')
        : undefined;
      
      if (success) {
        this.emit('tools-execution-completed', stepId, coordinatedResult);
      } else {
        this.emit('tools-execution-failed', stepId, new Error(error || 'Tool execution failed'), coordinatedResult);
      }
      
      const result = this.createStepResult(stepId, success, coordinatedResult, output, {
        workflowId,
        agentId: context.agentConfig?.id,
        toolCalls,
        toolResults: coordinatedResult.results,
        startTime,
        endTime: new Date(),
        retryAttempt: 0,
      });
      
      this.emit('step-execution-completed', stepId, result);
      
      return result;
      
    } catch (error) {
      console.error(`❌ Failed to execute workflow step ${stepId}:`, error);
      
      const result = this.createStepResult(stepId, false, null, '', {
        workflowId,
        agentId: context.agentConfig?.id,
        toolCalls: [],
        toolResults: new Map(),
        startTime,
        endTime: new Date(),
        retryAttempt: 0,
        error: error instanceof Error ? error.message : String(error),
      });
      
      this.emit('step-execution-completed', stepId, result);
      
      return result;
      
    } finally {
      this.activeStepExecutions.delete(executionId);
    }
  }

  /**
   * Cancel execution for a specific workflow step
   */
  async cancelStepExecution(workflowId: string, stepId: string): Promise<boolean> {
    const executionId = Array.from(this.activeStepExecutions.keys())
      .find(key => {
        const execution = this.activeStepExecutions.get(key);
        return execution?.workflowId === workflowId && execution?.stepId === stepId;
      });
    
    if (executionId) {
      const execution = this.activeStepExecutions.get(executionId);
      if (execution && !execution.abortController.signal.aborted) {
        execution.abortController.abort();
        console.log(`🛑 Cancelled step execution: ${stepId} in workflow ${workflowId}`);
        return true;
      }
    }
    
    return false;
  }

  /**
   * Get performance statistics for tool execution
   */
  getToolExecutionStatistics() {
    return {
      performance: this.toolCoordinator.getPerformanceMetrics(),
      cache: this.toolCoordinator.getCacheStatistics(),
      resources: this.toolCoordinator.getResourceStatistics(),
      activeExecutions: this.activeStepExecutions.size,
    };
  }

  /**
   * Update integration configuration
   */
  updateConfiguration(config: Partial<WorkflowToolIntegrationConfig>): void {
    this.integrationConfig = { ...this.integrationConfig, ...config };
    console.log('⚙️  Updated workflow-tool integration configuration');
  }

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    console.log('🧹 Cleaning up workflow-tool integration...');
    
    // Cancel all active executions
    for (const [executionId, execution] of this.activeStepExecutions.entries()) {
      if (!execution.abortController.signal.aborted) {
        execution.abortController.abort();
      }
    }
    
    this.activeStepExecutions.clear();
    
    // Clean up coordinator
    await this.toolCoordinator.destroy();
    
    console.log('✅ Workflow-tool integration cleanup completed');
  }

  // Private implementation methods

  /**
   * Setup integration with workflow monitor
   */
  private setupWorkflowMonitorIntegration(): void {
    // Listen for workflow events to coordinate tool execution
    this.workflowMonitor.on('step-started', async (stepId, step, state) => {
      console.debug(`📝 Workflow step started: ${stepId} in ${state.workflowId}`);
      
      // Get active agent for context
      const activeAgent = await this.agentManager.getActiveAgent();
      
      // Execute the step with tool coordination
      // Note: This will be called by the workflow monitor when needed
    });
    
    this.workflowMonitor.on('step-failed', (stepId, result, state) => {
      console.debug(`⚠️  Workflow step failed: ${stepId} in ${state.workflowId}`);
      
      // Cancel any active tool executions for this step
      this.cancelStepExecution(state.workflowId, stepId);
    });
  }

  /**
   * Extract tool calls from a workflow step
   */
  private async extractToolCallsFromStep(
    step: WorkflowStep,
    context: {
      agentConfig?: AgentConfig;
      previousResults?: Map<string, any>;
      workflowContext?: Record<string, any>;
    }
  ): Promise<UnifiedToolCall[]> {
    const toolCalls: UnifiedToolCall[] = [];
    
    // Analyze step description and commands to extract tool calls
    // This is a simplified implementation - in practice, this would use
    // sophisticated parsing and AI-based intent recognition
    
    if (step.command) {
      // Check if this is a shell command
      if (step.command.startsWith('npm ') || step.command.startsWith('git ') || 
          step.command.includes('mkdir') || step.command.includes('cd ')) {
        toolCalls.push({
          id: `${step.id}_shell_${Date.now()}`,
          name: 'run_shell_command',
          parameters: {
            command: step.command,
          },
        });
      }
      
      // Check for file operations
      if (step.command.includes('read ') || step.command.includes('cat ')) {
        const filePathMatch = step.command.match(/(?:read|cat)\s+([^\s]+)/);
        if (filePathMatch) {
          toolCalls.push({
            id: `${step.id}_read_${Date.now()}`,
            name: 'read_file',
            parameters: {
              file_path: filePathMatch[1],
            },
          });
        }
      }
      
      // Check for write operations
      if (step.command.includes('write ') || step.command.includes('create ')) {
        toolCalls.push({
          id: `${step.id}_write_${Date.now()}`,
          name: 'write_file',
          parameters: {
            file_path: step.parameters?.filePath || 'output.txt',
            content: step.parameters?.content || '',
          },
        });
      }
    }
    
    // Extract tools from step description using agent capabilities
    if (step.description && context.agentConfig) {
      const description = step.description.toLowerCase();
      
      // Search capabilities
      if (description.includes('search') || description.includes('find')) {
        if (description.includes('web') || description.includes('google')) {
          toolCalls.push({
            id: `${step.id}_search_${Date.now()}`,
            name: 'google_web_search',
            parameters: {
              query: step.parameters?.query || step.description,
            },
          });
        } else if (description.includes('file') || description.includes('code')) {
          toolCalls.push({
            id: `${step.id}_grep_${Date.now()}`,
            name: 'grep',
            parameters: {
              pattern: step.parameters?.pattern || '.*',
              path: step.parameters?.path || '.',
            },
          });
        }
      }
      
      // Memory operations
      if (description.includes('remember') || description.includes('save') && description.includes('memory')) {
        toolCalls.push({
          id: `${step.id}_memory_${Date.now()}`,
          name: 'save_memory',
          parameters: {
            key: step.parameters?.memoryKey || `step_${step.id}_result`,
            value: JSON.stringify(context.previousResults || {}),
          },
        });
      }
    }
    
    // Add tool calls from explicit step parameters
    if (step.parameters?.toolCalls && Array.isArray(step.parameters.toolCalls)) {
      toolCalls.push(...step.parameters.toolCalls);
    }
    
    return toolCalls;
  }

  /**
   * Create tool execution context for the workflow step
   */
  private createToolExecutionContext(
    agentConfig?: AgentConfig,
    workflowContext?: Record<string, any>,
    signal?: AbortSignal
  ): ToolExecutionContext {
    return {
      signal,
      metadata: {
        agentId: agentConfig?.id,
        agentName: agentConfig?.name,
        workflowContext: workflowContext || {},
        executionId: `workflow_${Date.now()}`,
        timestamp: new Date().toISOString(),
      },
      requestId: `workflow_request_${Date.now()}`,
      sessionId: 'workflow_session', // Could be enhanced with actual session management
      userMemory: workflowContext?.userMemory,
    };
  }

  /**
   * Handle progress updates from tool execution
   */
  private handleToolExecutionProgress(stepId: string, status: any): void {
    this.emit('tools-execution-progress', stepId, status.progress, status.completed, status.total);
    
    // Update workflow monitor with progress
    console.debug(`🔄 Step ${stepId} tool execution progress: ${status.progress}% (${status.completed}/${status.total})`);
  }

  /**
   * Aggregate outputs from multiple tool executions
   */
  private aggregateToolOutputs(results: Map<string, UnifiedToolResult>): string {
    const outputs: string[] = [];
    
    for (const [toolId, result] of results.entries()) {
      if (result.output) {
        outputs.push(`[${toolId}] ${result.output}`);
      }
    }
    
    return outputs.join('\n\n');
  }

  /**
   * Create a standardized step execution result
   */
  private createStepResult(
    stepId: string,
    success: boolean,
    result: any,
    output: string,
    metadata: {
      workflowId: string;
      agentId?: string;
      toolCalls: UnifiedToolCall[];
      toolResults: Map<string, UnifiedToolResult>;
      startTime: Date;
      endTime: Date;
      retryAttempt: number;
      error?: string;
    }
  ): WorkflowStepExecutionResult {
    return {
      stepId,
      success,
      result,
      output,
      error: metadata.error,
      executionTime: metadata.endTime.getTime() - metadata.startTime.getTime(),
      toolsExecuted: metadata.toolCalls,
      toolResults: metadata.toolResults,
      metadata: {
        agentId: metadata.agentId,
        workflowId: metadata.workflowId,
        retryAttempt: metadata.retryAttempt,
        startTime: metadata.startTime,
        endTime: metadata.endTime,
      },
    };
  }
}

/**
 * Global workflow-tool integration instance
 */
let globalWorkflowToolIntegration: WorkflowToolIntegration | null = null;

/**
 * Get or create the global workflow-tool integration instance
 */
export function getWorkflowToolIntegration(): WorkflowToolIntegration {
  if (!globalWorkflowToolIntegration) {
    throw new Error('WorkflowToolIntegration must be initialized first');
  }
  return globalWorkflowToolIntegration;
}

/**
 * Initialize the global workflow-tool integration
 */
export async function initializeWorkflowToolIntegration(
  toolRegistry: ToolRegistry,
  config: Config,
  integrationConfig?: Partial<WorkflowToolIntegrationConfig>
): Promise<WorkflowToolIntegration> {
  if (globalWorkflowToolIntegration) {
    await globalWorkflowToolIntegration.destroy();
  }
  
  globalWorkflowToolIntegration = new WorkflowToolIntegration(
    toolRegistry,
    config,
    integrationConfig
  );
  
  await globalWorkflowToolIntegration.initialize();
  console.log('🔧 Global workflow-tool integration initialized');
  
  return globalWorkflowToolIntegration;
}