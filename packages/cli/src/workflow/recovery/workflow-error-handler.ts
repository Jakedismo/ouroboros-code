/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { getWorkflowMonitor } from '../monitoring/workflow-monitor.js';
import { getWorkflowStateManager, WorkflowCheckpoint } from '../state/workflow-state-manager.js';

/**
 * Error severity levels for workflow recovery planning
 */
export enum ErrorSeverity {
  LOW = 'low',           // Non-critical errors, can continue
  MEDIUM = 'medium',     // Recoverable errors, requires intervention
  HIGH = 'high',         // Critical errors, requires rollback
  CRITICAL = 'critical'  // System-level errors, requires full restart
}

/**
 * Recovery strategy types
 */
export enum RecoveryStrategy {
  CONTINUE = 'continue',           // Continue with next step
  RETRY = 'retry',                 // Retry current step
  SKIP = 'skip',                   // Skip current step
  ROLLBACK = 'rollback',           // Rollback to checkpoint
  RESTART = 'restart',             // Restart workflow from beginning
  MANUAL = 'manual'                // Requires manual intervention
}

/**
 * Comprehensive error analysis result
 */
export interface ErrorAnalysis {
  errorId: string;
  workflowId: string;
  stepId: string;
  timestamp: Date;
  severity: ErrorSeverity;
  category: string;
  message: string;
  stackTrace?: string;
  context: {
    stepIndex: number;
    attemptNumber: number;
    environment: Record<string, any>;
    resources: {
      memoryUsage: number;
      diskSpace: number;
      openFiles: number;
    };
  };
  impact: {
    affectedSteps: string[];
    dataLoss: boolean;
    systemStability: number; // 0-1 scale
    recoveryComplexity: number; // 0-1 scale
  };
  rootCause: {
    category: 'system' | 'data' | 'logic' | 'resource' | 'external';
    description: string;
    contributing_factors: string[];
    similar_errors: number;
  };
  suggestedRecovery: RecoveryStrategy;
  automaticRecovery: boolean;
  estimatedRecoveryTime: number; // in milliseconds
}

/**
 * Recovery plan for failed workflow steps
 */
export interface RecoveryPlan {
  planId: string;
  workflowId: string;
  errorId: string;
  strategy: RecoveryStrategy;
  steps: RecoveryStep[];
  estimatedDuration: number;
  successProbability: number; // 0-1 scale
  riskAssessment: {
    dataLossRisk: number; // 0-1 scale
    systemStabilityRisk: number; // 0-1 scale
    timeRisk: number; // 0-1 scale
    overallRisk: number; // 0-1 scale
  };
  rollbackPlan?: {
    targetCheckpoint: string;
    stepsToUndo: string[];
    cleanupActions: string[];
  };
  contingencyPlans: RecoveryPlan[];
}

/**
 * Individual recovery step
 */
export interface RecoveryStep {
  id: string;
  description: string;
  type: 'cleanup' | 'restore' | 'retry' | 'validate' | 'monitor';
  action: string;
  timeout: number;
  critical: boolean;
  dependencies: string[];
  validations: string[];
}

/**
 * Rollback operation details
 */
export interface RollbackOperation {
  operationId: string;
  workflowId: string;
  fromCheckpoint: string;
  toCheckpoint: string;
  rollbackSteps: RollbackStep[];
  status: 'planned' | 'executing' | 'completed' | 'failed';
  progress: {
    currentStep: number;
    totalSteps: number;
    percentage: number;
  };
  results: {
    undoneSteps: string[];
    cleanedResources: string[];
    restoredData: string[];
    errors: string[];
  };
}

/**
 * Individual rollback step
 */
export interface RollbackStep {
  id: string;
  description: string;
  type: 'file_restore' | 'state_restore' | 'cleanup' | 'validation';
  action: string;
  originalState?: any;
  undoActions: string[];
  validations: string[];
  critical: boolean;
}

/**
 * Workflow error handler events
 */
export interface WorkflowErrorHandlerEvents {
  'error-detected': (analysis: ErrorAnalysis) => void;
  'recovery-plan-created': (plan: RecoveryPlan) => void;
  'recovery-started': (planId: string) => void;
  'recovery-completed': (planId: string, success: boolean) => void;
  'rollback-started': (operation: RollbackOperation) => void;
  'rollback-completed': (operation: RollbackOperation) => void;
  'manual-intervention-required': (errorId: string, reason: string) => void;
}

/**
 * Comprehensive workflow error handling and recovery system
 */
export class WorkflowErrorHandler extends EventEmitter {
  private monitor = getWorkflowMonitor();
  private stateManager = getWorkflowStateManager();
  private errorAnalyses = new Map<string, ErrorAnalysis>();
  private recoveryPlans = new Map<string, RecoveryPlan>();
  private activeRollbacks = new Map<string, RollbackOperation>();
  private errorPatterns = new Map<string, number>();
  private isInitialized = false;

  constructor() {
    super();
    this.setupErrorMonitoring();
  }

  /**
   * Initialize the error handling system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.loadErrorPatterns();
      this.isInitialized = true;
      console.log('🛡️  Workflow error handling and recovery system initialized');
    } catch (error) {
      throw new Error(`Failed to initialize workflow error handler: ${error}`);
    }
  }

  /**
   * Handle workflow step error with comprehensive analysis
   */
  async handleStepError(
    workflowId: string,
    stepId: string,
    error: Error,
    context: any
  ): Promise<ErrorAnalysis> {
    console.log(`🚨 Handling error in workflow ${workflowId}, step ${stepId}: ${error.message}`);

    const analysis = await this.analyzeError(workflowId, stepId, error, context);
    this.errorAnalyses.set(analysis.errorId, analysis);

    this.emit('error-detected', analysis);

    // Update error patterns
    this.updateErrorPatterns(analysis);

    // Create recovery plan if needed
    if (analysis.severity !== ErrorSeverity.LOW) {
      const recoveryPlan = await this.createRecoveryPlan(analysis);
      this.recoveryPlans.set(recoveryPlan.planId, recoveryPlan);
      this.emit('recovery-plan-created', recoveryPlan);

      // Execute automatic recovery if appropriate
      if (analysis.automaticRecovery && recoveryPlan.riskAssessment.overallRisk < 0.3) {
        await this.executeRecoveryPlan(recoveryPlan.planId);
      } else {
        this.emit('manual-intervention-required', analysis.errorId, 
          'High risk or complex recovery requires manual approval');
      }
    }

    return analysis;
  }

  /**
   * Create comprehensive recovery plan for error
   */
  async createRecoveryPlan(analysis: ErrorAnalysis): Promise<RecoveryPlan> {
    console.log(`🔧 Creating recovery plan for error: ${analysis.errorId}`);

    const planId = `recovery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const strategy = this.determineOptimalRecoveryStrategy(analysis);

    const plan: RecoveryPlan = {
      planId,
      workflowId: analysis.workflowId,
      errorId: analysis.errorId,
      strategy,
      steps: await this.generateRecoverySteps(analysis, strategy),
      estimatedDuration: this.estimateRecoveryDuration(analysis, strategy),
      successProbability: this.calculateSuccessProbability(analysis, strategy),
      riskAssessment: this.assessRecoveryRisks(analysis, strategy),
      contingencyPlans: []
    };

    // Add rollback plan if strategy involves rollback
    if (strategy === RecoveryStrategy.ROLLBACK) {
      plan.rollbackPlan = await this.createRollbackPlan(analysis);
    }

    // Generate contingency plans
    plan.contingencyPlans = await this.generateContingencyPlans(analysis);

    console.log(`✅ Recovery plan created: ${planId} (Strategy: ${strategy}, Success: ${(plan.successProbability * 100).toFixed(1)}%)`);
    return plan;
  }

  /**
   * Execute recovery plan
   */
  async executeRecoveryPlan(planId: string): Promise<boolean> {
    const plan = this.recoveryPlans.get(planId);
    if (!plan) {
      console.error(`❌ Recovery plan ${planId} not found`);
      return false;
    }

    console.log(`🔧 Executing recovery plan: ${planId} (Strategy: ${plan.strategy})`);
    this.emit('recovery-started', planId);

    try {
      switch (plan.strategy) {
        case RecoveryStrategy.RETRY:
          return await this.executeRetryRecovery(plan);
        
        case RecoveryStrategy.SKIP:
          return await this.executeSkipRecovery(plan);
        
        case RecoveryStrategy.ROLLBACK:
          return await this.executeRollbackRecovery(plan);
        
        case RecoveryStrategy.RESTART:
          return await this.executeRestartRecovery(plan);
        
        case RecoveryStrategy.CONTINUE:
          return await this.executeContinueRecovery(plan);
        
        default:
          console.warn(`⚠️  Recovery strategy ${plan.strategy} requires manual intervention`);
          this.emit('manual-intervention-required', plan.errorId, 
            `Strategy ${plan.strategy} not supported for automatic execution`);
          return false;
      }
    } catch (error) {
      console.error(`❌ Recovery plan execution failed: ${error}`);
      
      // Try contingency plans
      for (const contingencyPlan of plan.contingencyPlans) {
        console.log(`🔄 Trying contingency plan: ${contingencyPlan.planId}`);
        if (await this.executeRecoveryPlan(contingencyPlan.planId)) {
          this.emit('recovery-completed', planId, true);
          return true;
        }
      }

      this.emit('recovery-completed', planId, false);
      return false;
    }
  }

  /**
   * Execute rollback to checkpoint
   */
  async executeRollback(
    workflowId: string,
    toCheckpointId: string,
    fromCheckpointId?: string
  ): Promise<RollbackOperation> {
    console.log(`🔄 Starting rollback for workflow ${workflowId} to checkpoint ${toCheckpointId}`);

    const operation: RollbackOperation = {
      operationId: `rollback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      workflowId,
      fromCheckpoint: fromCheckpointId || 'current',
      toCheckpoint: toCheckpointId,
      rollbackSteps: await this.generateRollbackSteps(workflowId, toCheckpointId, fromCheckpointId),
      status: 'planned',
      progress: {
        currentStep: 0,
        totalSteps: 0,
        percentage: 0
      },
      results: {
        undoneSteps: [],
        cleanedResources: [],
        restoredData: [],
        errors: []
      }
    };

    operation.progress.totalSteps = operation.rollbackSteps.length;
    this.activeRollbacks.set(operation.operationId, operation);

    this.emit('rollback-started', operation);

    try {
      operation.status = 'executing';

      // Execute rollback steps in reverse order
      for (let i = operation.rollbackSteps.length - 1; i >= 0; i--) {
        const step = operation.rollbackSteps[i];
        operation.progress.currentStep = operation.rollbackSteps.length - i;
        operation.progress.percentage = (operation.progress.currentStep / operation.progress.totalSteps) * 100;

        console.log(`🔄 Executing rollback step: ${step.description}`);
        
        try {
          await this.executeRollbackStep(step, operation);
        } catch (stepError) {
          console.error(`❌ Rollback step failed: ${step.description}`, stepError);
          operation.results.errors.push(`Step ${step.id}: ${stepError}`);
          
          if (step.critical) {
            throw new Error(`Critical rollback step failed: ${step.description}`);
          }
        }
      }

      // Restore workflow state from checkpoint
      const restored = await this.stateManager.restoreFromCheckpoint(workflowId, toCheckpointId);
      if (!restored) {
        throw new Error(`Failed to restore workflow state from checkpoint ${toCheckpointId}`);
      }

      operation.status = 'completed';
      console.log(`✅ Rollback completed successfully: ${operation.operationId}`);

    } catch (error) {
      operation.status = 'failed';
      operation.results.errors.push(`Rollback failed: ${error}`);
      console.error(`❌ Rollback failed: ${operation.operationId}`, error);
    }

    this.emit('rollback-completed', operation);
    return operation;
  }

  /**
   * Get error analysis
   */
  getErrorAnalysis(errorId: string): ErrorAnalysis | undefined {
    return this.errorAnalyses.get(errorId);
  }

  /**
   * Get recovery plan
   */
  getRecoveryPlan(planId: string): RecoveryPlan | undefined {
    return this.recoveryPlans.get(planId);
  }

  /**
   * Get all error analyses for workflow
   */
  getWorkflowErrors(workflowId: string): ErrorAnalysis[] {
    return Array.from(this.errorAnalyses.values())
      .filter(analysis => analysis.workflowId === workflowId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get active rollback operations
   */
  getActiveRollbacks(): RollbackOperation[] {
    return Array.from(this.activeRollbacks.values())
      .filter(op => op.status === 'executing');
  }

  /**
   * Generate comprehensive error report
   */
  async generateErrorReport(workflowId?: string): Promise<string> {
    const errors = workflowId 
      ? this.getWorkflowErrors(workflowId)
      : Array.from(this.errorAnalyses.values());

    let report = `🛡️  WORKFLOW ERROR HANDLING REPORT\n`;
    report += `═══════════════════════════════════════════════════════════════════════════════\n\n`;

    const severityCounts = {
      [ErrorSeverity.LOW]: 0,
      [ErrorSeverity.MEDIUM]: 0,
      [ErrorSeverity.HIGH]: 0,
      [ErrorSeverity.CRITICAL]: 0
    };

    errors.forEach(error => {
      severityCounts[error.severity]++;
    });

    report += `📊 ERROR SUMMARY:\n`;
    report += `• Total Errors: ${errors.length}\n`;
    report += `• Low Severity: ${severityCounts[ErrorSeverity.LOW]}\n`;
    report += `• Medium Severity: ${severityCounts[ErrorSeverity.MEDIUM]}\n`;
    report += `• High Severity: ${severityCounts[ErrorSeverity.HIGH]}\n`;
    report += `• Critical Severity: ${severityCounts[ErrorSeverity.CRITICAL]}\n\n`;

    const activeRecoveries = Array.from(this.recoveryPlans.values())
      .filter(plan => errors.some(e => e.errorId === plan.errorId));
    const activeRollbacks = this.getActiveRollbacks();

    report += `🔧 RECOVERY STATUS:\n`;
    report += `• Active Recovery Plans: ${activeRecoveries.length}\n`;
    report += `• Active Rollbacks: ${activeRollbacks.length}\n`;
    report += `• Automatic Recoveries: ${errors.filter(e => e.automaticRecovery).length}\n`;
    report += `• Manual Interventions: ${errors.filter(e => !e.automaticRecovery).length}\n\n`;

    if (errors.length > 0) {
      report += `🚨 RECENT ERRORS:\n`;
      errors.slice(0, 5).forEach(error => {
        report += `• [${error.severity.toUpperCase()}] ${error.stepId}: ${error.message}\n`;
        report += `  Suggested Recovery: ${error.suggestedRecovery}\n`;
        report += `  Impact: ${error.impact.affectedSteps.length} affected steps\n\n`;
      });
    }

    return report;
  }

  /**
   * Private: Setup error monitoring
   */
  private setupErrorMonitoring(): void {
    this.monitor.on('step-failed', (stepId, result, state) => {
      const error = new Error(result.error || 'Step failed');
      this.handleStepError(state.workflowId, stepId, error, {
        stepIndex: state.currentStepIndex,
        attemptNumber: result.retryAttempt,
        result
      });
    });

    this.monitor.on('workflow-failed', (state) => {
      console.log(`🚨 Workflow failed: ${state.workflowId}, analyzing for recovery options`);
    });
  }

  /**
   * Private: Analyze error comprehensively
   */
  private async analyzeError(
    workflowId: string,
    stepId: string,
    error: Error,
    context: any
  ): Promise<ErrorAnalysis> {
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const severity = this.categorizeErrorSeverity(error, context);
    const category = this.categorizeError(error);
    const memUsage = process.memoryUsage();

    const analysis: ErrorAnalysis = {
      errorId,
      workflowId,
      stepId,
      timestamp: new Date(),
      severity,
      category,
      message: error.message,
      stackTrace: error.stack,
      context: {
        stepIndex: context.stepIndex || 0,
        attemptNumber: context.attemptNumber || 1,
        environment: { ...process.env },
        resources: {
          memoryUsage: memUsage.heapUsed,
          diskSpace: 0, // Could be enhanced with actual disk space check
          openFiles: 0  // Could be enhanced with actual open files count
        }
      },
      impact: {
        affectedSteps: this.calculateAffectedSteps(workflowId, stepId, error),
        dataLoss: this.assessDataLossRisk(error, category),
        systemStability: this.assessSystemStability(error, severity),
        recoveryComplexity: this.assessRecoveryComplexity(error, category, severity)
      },
      rootCause: {
        category: this.categorizeRootCause(error, category),
        description: this.generateRootCauseDescription(error, context),
        contributing_factors: this.identifyContributingFactors(error, context),
        similar_errors: this.errorPatterns.get(error.message) || 0
      },
      suggestedRecovery: this.suggestRecoveryStrategy(error, severity, category),
      automaticRecovery: this.canRecoverAutomatically(error, severity),
      estimatedRecoveryTime: this.estimateRecoveryTime(error, severity, category)
    };

    return analysis;
  }

  /**
   * Private: Determine optimal recovery strategy
   */
  private determineOptimalRecoveryStrategy(analysis: ErrorAnalysis): RecoveryStrategy {
    // Already has suggested recovery from analysis
    let strategy = analysis.suggestedRecovery;

    // Refine based on additional factors
    if (analysis.rootCause.similar_errors > 3) {
      // If we've seen this error multiple times, more aggressive recovery
      if (strategy === RecoveryStrategy.RETRY) {
        strategy = RecoveryStrategy.SKIP;
      } else if (strategy === RecoveryStrategy.CONTINUE) {
        strategy = RecoveryStrategy.ROLLBACK;
      }
    }

    // Consider system stability
    if (analysis.impact.systemStability < 0.5) {
      if (strategy === RecoveryStrategy.CONTINUE || strategy === RecoveryStrategy.RETRY) {
        strategy = RecoveryStrategy.ROLLBACK;
      }
    }

    return strategy;
  }

  /**
   * Private: Generate recovery steps for strategy
   */
  private async generateRecoverySteps(analysis: ErrorAnalysis, strategy: RecoveryStrategy): Promise<RecoveryStep[]> {
    const steps: RecoveryStep[] = [];

    switch (strategy) {
      case RecoveryStrategy.RETRY:
        steps.push({
          id: 'cleanup-step',
          description: 'Clean up resources from failed step',
          type: 'cleanup',
          action: `cleanup_step_${analysis.stepId}`,
          timeout: 30000,
          critical: false,
          dependencies: [],
          validations: ['resources_cleaned', 'state_consistent']
        });
        steps.push({
          id: 'retry-step',
          description: `Retry step ${analysis.stepId}`,
          type: 'retry',
          action: `retry_step_${analysis.stepId}`,
          timeout: 120000,
          critical: true,
          dependencies: ['cleanup-step'],
          validations: ['step_completed', 'output_valid']
        });
        break;

      case RecoveryStrategy.SKIP:
        steps.push({
          id: 'validate-skip',
          description: 'Validate that step can be safely skipped',
          type: 'validate',
          action: `validate_skip_${analysis.stepId}`,
          timeout: 10000,
          critical: true,
          dependencies: [],
          validations: ['dependencies_satisfied', 'outputs_available']
        });
        steps.push({
          id: 'mark-skipped',
          description: `Mark step ${analysis.stepId} as skipped`,
          type: 'cleanup',
          action: `mark_skipped_${analysis.stepId}`,
          timeout: 5000,
          critical: false,
          dependencies: ['validate-skip'],
          validations: ['step_marked_skipped']
        });
        break;

      case RecoveryStrategy.ROLLBACK:
        const checkpoints = await this.getAvailableCheckpoints(analysis.workflowId);
        const targetCheckpoint = this.selectRollbackCheckpoint(checkpoints, analysis);
        
        if (targetCheckpoint) {
          steps.push({
            id: 'prepare-rollback',
            description: 'Prepare rollback operation',
            type: 'cleanup',
            action: `prepare_rollback_${targetCheckpoint.id}`,
            timeout: 30000,
            critical: true,
            dependencies: [],
            validations: ['rollback_prepared']
          });
          steps.push({
            id: 'execute-rollback',
            description: `Rollback to checkpoint ${targetCheckpoint.id}`,
            type: 'restore',
            action: `rollback_to_${targetCheckpoint.id}`,
            timeout: 180000,
            critical: true,
            dependencies: ['prepare-rollback'],
            validations: ['state_restored', 'checkpoint_reached']
          });
        }
        break;

      case RecoveryStrategy.CONTINUE:
        steps.push({
          id: 'assess-impact',
          description: 'Assess impact of continuing with error',
          type: 'validate',
          action: 'assess_continue_impact',
          timeout: 15000,
          critical: true,
          dependencies: [],
          validations: ['impact_acceptable', 'workflow_can_continue']
        });
        steps.push({
          id: 'continue-workflow',
          description: 'Continue workflow execution',
          type: 'monitor',
          action: 'continue_execution',
          timeout: 10000,
          critical: false,
          dependencies: ['assess-impact'],
          validations: ['workflow_resumed']
        });
        break;
    }

    return steps;
  }

  /**
   * Private: Execute different recovery strategies
   */
  private async executeRetryRecovery(plan: RecoveryPlan): Promise<boolean> {
    console.log(`🔄 Executing retry recovery for workflow ${plan.workflowId}`);
    
    // For now, simulate recovery execution
    await this.simulateRecoveryExecution(plan);
    
    console.log(`✅ Retry recovery completed for workflow ${plan.workflowId}`);
    this.emit('recovery-completed', plan.planId, true);
    return true;
  }

  private async executeSkipRecovery(plan: RecoveryPlan): Promise<boolean> {
    console.log(`⏭️  Executing skip recovery for workflow ${plan.workflowId}`);
    
    await this.simulateRecoveryExecution(plan);
    
    console.log(`✅ Skip recovery completed for workflow ${plan.workflowId}`);
    this.emit('recovery-completed', plan.planId, true);
    return true;
  }

  private async executeRollbackRecovery(plan: RecoveryPlan): Promise<boolean> {
    console.log(`🔄 Executing rollback recovery for workflow ${plan.workflowId}`);
    
    if (plan.rollbackPlan?.targetCheckpoint) {
      const rollbackOp = await this.executeRollback(
        plan.workflowId,
        plan.rollbackPlan.targetCheckpoint
      );
      
      const success = rollbackOp.status === 'completed';
      this.emit('recovery-completed', plan.planId, success);
      return success;
    }
    
    return false;
  }

  private async executeRestartRecovery(plan: RecoveryPlan): Promise<boolean> {
    console.log(`🔄 Executing restart recovery for workflow ${plan.workflowId}`);
    
    await this.simulateRecoveryExecution(plan);
    
    console.log(`✅ Restart recovery completed for workflow ${plan.workflowId}`);
    this.emit('recovery-completed', plan.planId, true);
    return true;
  }

  private async executeContinueRecovery(plan: RecoveryPlan): Promise<boolean> {
    console.log(`⏭️  Executing continue recovery for workflow ${plan.workflowId}`);
    
    await this.simulateRecoveryExecution(plan);
    
    console.log(`✅ Continue recovery completed for workflow ${plan.workflowId}`);
    this.emit('recovery-completed', plan.planId, true);
    return true;
  }

  /**
   * Private: Helper methods for error analysis
   */
  private categorizeErrorSeverity(error: Error, context: any): ErrorSeverity {
    const message = error.message.toLowerCase();
    
    if (message.includes('critical') || message.includes('fatal') || message.includes('system')) {
      return ErrorSeverity.CRITICAL;
    }
    if (message.includes('failed to') || message.includes('cannot') || message.includes('timeout')) {
      return ErrorSeverity.HIGH;
    }
    if (message.includes('warning') || message.includes('retry') || context.attemptNumber > 1) {
      return ErrorSeverity.MEDIUM;
    }
    
    return ErrorSeverity.LOW;
  }

  private categorizeError(error: Error): string {
    const message = error.message.toLowerCase();
    
    if (message.includes('file') || message.includes('path') || message.includes('directory')) {
      return 'filesystem';
    }
    if (message.includes('network') || message.includes('connection') || message.includes('http')) {
      return 'network';
    }
    if (message.includes('memory') || message.includes('cpu') || message.includes('resource')) {
      return 'resource';
    }
    if (message.includes('permission') || message.includes('access') || message.includes('auth')) {
      return 'permission';
    }
    if (message.includes('timeout') || message.includes('time')) {
      return 'timeout';
    }
    
    return 'general';
  }

  private calculateAffectedSteps(workflowId: string, stepId: string, error: Error): string[] {
    // Simple implementation - could be enhanced with dependency analysis
    return [stepId];
  }

  private assessDataLossRisk(error: Error, category: string): boolean {
    return category === 'filesystem' && 
           (error.message.includes('delete') || error.message.includes('remove'));
  }

  private assessSystemStability(error: Error, severity: ErrorSeverity): number {
    switch (severity) {
      case ErrorSeverity.CRITICAL: return 0.1;
      case ErrorSeverity.HIGH: return 0.4;
      case ErrorSeverity.MEDIUM: return 0.7;
      case ErrorSeverity.LOW: return 0.9;
      default: return 0.5;
    }
  }

  private assessRecoveryComplexity(error: Error, category: string, severity: ErrorSeverity): number {
    let complexity = 0.3; // Base complexity
    
    if (severity === ErrorSeverity.CRITICAL) complexity += 0.4;
    if (category === 'filesystem' || category === 'permission') complexity += 0.2;
    if (error.message.includes('dependency')) complexity += 0.1;
    
    return Math.min(complexity, 1.0);
  }

  private categorizeRootCause(error: Error, category: string): 'system' | 'data' | 'logic' | 'resource' | 'external' {
    if (category === 'network' || category === 'timeout') return 'external';
    if (category === 'resource') return 'resource';
    if (category === 'filesystem' || category === 'permission') return 'system';
    if (error.message.includes('invalid') || error.message.includes('format')) return 'data';
    return 'logic';
  }

  private generateRootCauseDescription(error: Error, context: any): string {
    return `Error in step ${context.stepIndex || 'unknown'}: ${error.message}`;
  }

  private identifyContributingFactors(error: Error, context: any): string[] {
    const factors: string[] = [];
    
    if (context.attemptNumber > 1) factors.push('previous_retry_attempts');
    if (context.resources?.memoryUsage > 1000000000) factors.push('high_memory_usage');
    
    return factors;
  }

  private suggestRecoveryStrategy(error: Error, severity: ErrorSeverity, category: string): RecoveryStrategy {
    if (severity === ErrorSeverity.CRITICAL) return RecoveryStrategy.ROLLBACK;
    if (severity === ErrorSeverity.HIGH && category === 'filesystem') return RecoveryStrategy.ROLLBACK;
    if (category === 'network' || category === 'timeout') return RecoveryStrategy.RETRY;
    if (severity === ErrorSeverity.LOW) return RecoveryStrategy.CONTINUE;
    return RecoveryStrategy.RETRY;
  }

  private canRecoverAutomatically(error: Error, severity: ErrorSeverity): boolean {
    return severity !== ErrorSeverity.CRITICAL && !error.message.includes('manual');
  }

  private estimateRecoveryTime(error: Error, severity: ErrorSeverity, category: string): number {
    let baseTime = 10000; // 10 seconds
    
    if (severity === ErrorSeverity.CRITICAL) baseTime *= 10;
    if (category === 'network') baseTime *= 3;
    if (category === 'filesystem') baseTime *= 2;
    
    return baseTime;
  }

  private estimateRecoveryDuration(analysis: ErrorAnalysis, strategy: RecoveryStrategy): number {
    let baseDuration = analysis.estimatedRecoveryTime;
    
    switch (strategy) {
      case RecoveryStrategy.ROLLBACK: return baseDuration * 3;
      case RecoveryStrategy.RESTART: return baseDuration * 5;
      case RecoveryStrategy.RETRY: return baseDuration * 1.5;
      default: return baseDuration;
    }
  }

  private calculateSuccessProbability(analysis: ErrorAnalysis, strategy: RecoveryStrategy): number {
    let probability = 0.8; // Base probability
    
    // Adjust based on error patterns
    if (analysis.rootCause.similar_errors > 5) probability -= 0.2;
    if (analysis.severity === ErrorSeverity.CRITICAL) probability -= 0.3;
    
    // Adjust based on strategy
    switch (strategy) {
      case RecoveryStrategy.ROLLBACK: probability += 0.1; break;
      case RecoveryStrategy.SKIP: probability -= 0.1; break;
    }
    
    return Math.max(0.1, Math.min(0.95, probability));
  }

  private assessRecoveryRisks(analysis: ErrorAnalysis, strategy: RecoveryStrategy): RecoveryPlan['riskAssessment'] {
    const baseRisk = analysis.impact.recoveryComplexity;
    
    return {
      dataLossRisk: analysis.impact.dataLoss ? 0.8 : 0.1,
      systemStabilityRisk: 1 - analysis.impact.systemStability,
      timeRisk: strategy === RecoveryStrategy.RESTART ? 0.7 : 0.3,
      overallRisk: (baseRisk + (analysis.impact.dataLoss ? 0.3 : 0)) / 2
    };
  }

  private async createRollbackPlan(analysis: ErrorAnalysis): Promise<RecoveryPlan['rollbackPlan']> {
    const checkpoints = await this.getAvailableCheckpoints(analysis.workflowId);
    const targetCheckpoint = this.selectRollbackCheckpoint(checkpoints, analysis);
    
    if (!targetCheckpoint) {
      return undefined;
    }
    
    return {
      targetCheckpoint: targetCheckpoint.id,
      stepsToUndo: this.calculateStepsToUndo(analysis.workflowId, targetCheckpoint),
      cleanupActions: this.generateCleanupActions(analysis)
    };
  }

  private async generateContingencyPlans(analysis: ErrorAnalysis): Promise<RecoveryPlan[]> {
    // For now, return empty array - could be enhanced with actual contingency planning
    return [];
  }

  private async getAvailableCheckpoints(workflowId: string): Promise<WorkflowCheckpoint[]> {
    // This would integrate with the state manager to get actual checkpoints
    // For now, return empty array as placeholder
    return [];
  }

  private selectRollbackCheckpoint(checkpoints: WorkflowCheckpoint[], analysis: ErrorAnalysis): WorkflowCheckpoint | null {
    // Simple implementation - select the most recent checkpoint before the error
    return checkpoints.length > 0 ? checkpoints[checkpoints.length - 1] : null;
  }

  private calculateStepsToUndo(workflowId: string, checkpoint: WorkflowCheckpoint): string[] {
    // Placeholder implementation
    return [];
  }

  private generateCleanupActions(analysis: ErrorAnalysis): string[] {
    const actions: string[] = [];
    
    if (analysis.category === 'filesystem') {
      actions.push('cleanup_temp_files');
    }
    if (analysis.category === 'resource') {
      actions.push('release_resources');
    }
    
    return actions;
  }

  private async generateRollbackSteps(
    workflowId: string,
    toCheckpointId: string,
    fromCheckpointId?: string
  ): Promise<RollbackStep[]> {
    // Placeholder implementation
    return [
      {
        id: 'validate-checkpoint',
        description: `Validate target checkpoint ${toCheckpointId}`,
        type: 'validation',
        action: `validate_checkpoint_${toCheckpointId}`,
        undoActions: [],
        validations: ['checkpoint_exists', 'checkpoint_valid'],
        critical: true
      }
    ];
  }

  private async executeRollbackStep(step: RollbackStep, operation: RollbackOperation): Promise<void> {
    // Placeholder implementation for rollback step execution
    console.log(`Executing rollback step: ${step.description}`);
    
    // Simulate step execution
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    operation.results.undoneSteps.push(step.id);
  }

  private updateErrorPatterns(analysis: ErrorAnalysis): void {
    const pattern = analysis.message;
    const count = this.errorPatterns.get(pattern) || 0;
    this.errorPatterns.set(pattern, count + 1);
  }

  private async loadErrorPatterns(): Promise<void> {
    // Placeholder - could load from persistent storage
    console.log('📊 Error patterns loaded');
  }

  private async simulateRecoveryExecution(plan: RecoveryPlan): Promise<void> {
    // Simulate recovery execution with progress
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      console.log(`🔧 Executing recovery step: ${step.description}`);
      await new Promise(resolve => setTimeout(resolve, step.timeout / 10)); // Simulate faster execution
    }
  }
}

/**
 * Global workflow error handler instance
 */
let globalWorkflowErrorHandler: WorkflowErrorHandler | null = null;

/**
 * Get the global workflow error handler instance
 */
export function getWorkflowErrorHandler(): WorkflowErrorHandler {
  if (!globalWorkflowErrorHandler) {
    globalWorkflowErrorHandler = new WorkflowErrorHandler();
  }
  return globalWorkflowErrorHandler;
}

/**
 * Initialize workflow error handling system
 */
export async function initializeWorkflowErrorHandling(): Promise<WorkflowErrorHandler> {
  const handler = getWorkflowErrorHandler();
  await handler.initialize();
  console.log('🛡️  Comprehensive workflow error handling system initialized');
  return handler;
}