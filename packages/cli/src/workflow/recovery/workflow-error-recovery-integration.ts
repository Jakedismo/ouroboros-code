/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { getWorkflowErrorHandler, ErrorAnalysis, RecoveryStrategy, ErrorSeverity } from './workflow-error-handler.js';
import { getWorkflowRollbackManager } from './workflow-rollback-manager.js';
import { getWorkflowStateManager } from '../state/workflow-state-manager.js';
import { getWorkflowMonitor } from '../monitoring/workflow-monitor.js';

/**
 * Integrated error recovery status
 */
export interface IntegratedRecoveryStatus {
  workflowId: string;
  hasErrors: boolean;
  errorCount: number;
  criticalErrorCount: number;
  activeRecoveryPlans: number;
  activeRollbacks: number;
  autoRecoverableErrors: number;
  lastError?: {
    errorId: string;
    severity: ErrorSeverity;
    message: string;
    timestamp: Date;
    suggestedRecovery: RecoveryStrategy;
  };
  systemHealth: {
    overallStatus: 'healthy' | 'degraded' | 'critical';
    recoveryCapability: number; // 0-1 scale
    rollbackAvailability: boolean;
    checkpointCount: number;
    snapshotCount: number;
  };
}

/**
 * Recovery recommendation
 */
export interface RecoveryRecommendation {
  recommendationId: string;
  workflowId: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  type: 'immediate_action' | 'preventive' | 'optimization';
  title: string;
  description: string;
  action: {
    type: RecoveryStrategy | 'checkpoint' | 'snapshot' | 'monitor';
    parameters: Record<string, any>;
    estimatedDuration: number;
    riskLevel: number; // 0-1 scale
  };
  reasoning: string[];
  consequences: {
    if_taken: string[];
    if_ignored: string[];
  };
}

/**
 * Error recovery integration events
 */
export interface WorkflowErrorRecoveryIntegrationEvents {
  'recovery-status-changed': (status: IntegratedRecoveryStatus) => void;
  'recommendation-generated': (recommendation: RecoveryRecommendation) => void;
  'automatic-recovery-triggered': (workflowId: string, strategy: RecoveryStrategy) => void;
  'manual-intervention-required': (workflowId: string, reason: string) => void;
  'recovery-health-check': (workflowId: string, health: IntegratedRecoveryStatus['systemHealth']) => void;
}

/**
 * Comprehensive workflow error recovery integration system
 * This service coordinates between error handling, rollback management, and state management
 */
export class WorkflowErrorRecoveryIntegration extends EventEmitter {
  private errorHandler = getWorkflowErrorHandler();
  private rollbackManager = getWorkflowRollbackManager();
  private stateManager = getWorkflowStateManager();
  private monitor = getWorkflowMonitor();
  
  private recoveryStatuses = new Map<string, IntegratedRecoveryStatus>();
  private recommendations = new Map<string, RecoveryRecommendation[]>();
  private isInitialized = false;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor() {
    super();
    this.setupIntegrationListeners();
  }

  /**
   * Initialize the error recovery integration system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize all subsystems
      await this.errorHandler.initialize();
      await this.rollbackManager.initialize();
      await this.stateManager.initialize();

      // Start periodic health checks
      this.startHealthMonitoring();

      this.isInitialized = true;
      console.log('🛡️  Workflow error recovery integration system initialized');
    } catch (error) {
      throw new Error(`Failed to initialize error recovery integration: ${error}`);
    }
  }

  /**
   * Get comprehensive recovery status for workflow
   */
  getRecoveryStatus(workflowId: string): IntegratedRecoveryStatus | undefined {
    return this.recoveryStatuses.get(workflowId);
  }

  /**
   * Get recovery recommendations for workflow
   */
  getRecoveryRecommendations(workflowId: string): RecoveryRecommendation[] {
    return this.recommendations.get(workflowId) || [];
  }

  /**
   * Execute automatic recovery for workflow
   */
  async executeAutomaticRecovery(workflowId: string): Promise<boolean> {
    console.log(`🤖 Executing automatic recovery for workflow: ${workflowId}`);

    const status = this.recoveryStatuses.get(workflowId);
    if (!status || status.autoRecoverableErrors === 0) {
      console.log(`⚠️  No auto-recoverable errors found for workflow: ${workflowId}`);
      return false;
    }

    try {
      // Get the most recent auto-recoverable error
      const errors = this.errorHandler.getWorkflowErrors(workflowId);
      const autoRecoverableError = errors.find(error => 
        error.automaticRecovery && 
        (error.severity === ErrorSeverity.LOW || error.severity === ErrorSeverity.MEDIUM)
      );

      if (!autoRecoverableError) {
        return false;
      }

      // Create and execute recovery plan
      const recoveryPlan = await this.errorHandler.createRecoveryPlan(autoRecoverableError);
      const success = await this.errorHandler.executeRecoveryPlan(recoveryPlan.planId);

      if (success) {
        this.emit('automatic-recovery-triggered', workflowId, recoveryPlan.strategy);
        console.log(`✅ Automatic recovery completed successfully for workflow: ${workflowId}`);
        
        // Update recovery status
        await this.updateRecoveryStatus(workflowId);
      }

      return success;
    } catch (error) {
      console.error(`❌ Automatic recovery failed for workflow ${workflowId}:`, error);
      return false;
    }
  }

  /**
   * Execute manual recovery plan
   */
  async executeManualRecovery(
    workflowId: string, 
    planId: string, 
    userApproved: boolean = false
  ): Promise<boolean> {
    if (!userApproved) {
      this.emit('manual-intervention-required', workflowId, 'User approval required for manual recovery');
      return false;
    }

    console.log(`👤 Executing manual recovery plan: ${planId} for workflow: ${workflowId}`);

    try {
      const success = await this.errorHandler.executeRecoveryPlan(planId);
      
      if (success) {
        await this.updateRecoveryStatus(workflowId);
      }

      return success;
    } catch (error) {
      console.error(`❌ Manual recovery failed for workflow ${workflowId}:`, error);
      return false;
    }
  }

  /**
   * Execute emergency rollback
   */
  async executeEmergencyRollback(
    workflowId: string, 
    checkpointId?: string
  ): Promise<boolean> {
    console.log(`🚨 Executing emergency rollback for workflow: ${workflowId}`);

    try {
      // Find the best checkpoint if not specified
      if (!checkpointId) {
        const summaries = this.stateManager.getAllWorkflowSummaries();
        const workflowSummary = summaries.find(s => s.workflowId === workflowId);
        
        if (!workflowSummary || workflowSummary.checkpoints === 0) {
          console.error(`❌ No checkpoints available for emergency rollback: ${workflowId}`);
          return false;
        }
        
        // Use the most recent checkpoint (this would need actual checkpoint data)
        checkpointId = 'latest';
      }

      const success = await this.rollbackManager.executeRollback(
        workflowId,
        checkpointId,
        undefined,
        {
          restoreFileSystem: true,
          restoreEnvironment: true,
          validateBeforeRestore: true,
          createBackup: true
        }
      );

      if (success) {
        console.log(`✅ Emergency rollback completed for workflow: ${workflowId}`);
        await this.updateRecoveryStatus(workflowId);
      }

      return success;
    } catch (error) {
      console.error(`❌ Emergency rollback failed for workflow ${workflowId}:`, error);
      return false;
    }
  }

  /**
   * Generate proactive recovery recommendations
   */
  async generateRecoveryRecommendations(workflowId: string): Promise<RecoveryRecommendation[]> {
    console.log(`💡 Generating recovery recommendations for workflow: ${workflowId}`);

    const recommendations: RecoveryRecommendation[] = [];
    const status = this.recoveryStatuses.get(workflowId);
    const errors = this.errorHandler.getWorkflowErrors(workflowId);
    const workflowSummary = this.stateManager.getWorkflowStateSummary(workflowId);

    if (!status) {
      return recommendations;
    }

    // Recommendation 1: Create checkpoint if none exist or it's been a while
    if (workflowSummary && workflowSummary.checkpoints < 2) {
      recommendations.push({
        recommendationId: `checkpoint_${Date.now()}`,
        workflowId,
        priority: 'medium',
        type: 'preventive',
        title: 'Create Workflow Checkpoint',
        description: 'Create a checkpoint to enable rollback capabilities in case of future errors',
        action: {
          type: 'checkpoint',
          parameters: { workflowId, description: 'Proactive checkpoint' },
          estimatedDuration: 5000,
          riskLevel: 0.1
        },
        reasoning: [
          'Few checkpoints available for rollback',
          'Checkpoint creation is low-risk operation',
          'Enables faster recovery from future errors'
        ],
        consequences: {
          if_taken: ['Rollback capability enabled', 'Faster error recovery'],
          if_ignored: ['Limited rollback options', 'Longer recovery times']
        }
      });
    }

    // Recommendation 2: Address critical errors immediately
    const criticalErrors = errors.filter(e => e.severity === ErrorSeverity.CRITICAL);
    if (criticalErrors.length > 0) {
      const error = criticalErrors[0];
      recommendations.push({
        recommendationId: `critical_${error.errorId}`,
        workflowId,
        priority: 'critical',
        type: 'immediate_action',
        title: 'Address Critical Error',
        description: `Critical error requires immediate attention: ${error.message}`,
        action: {
          type: error.suggestedRecovery,
          parameters: { errorId: error.errorId },
          estimatedDuration: error.estimatedRecoveryTime,
          riskLevel: error.severity === ErrorSeverity.CRITICAL ? 0.8 : 0.4
        },
        reasoning: [
          'Critical error can cause workflow failure',
          'System stability may be compromised',
          'Immediate action required to prevent data loss'
        ],
        consequences: {
          if_taken: ['System stability restored', 'Workflow can continue'],
          if_ignored: ['Workflow failure likely', 'Potential data loss', 'System instability']
        }
      });
    }

    // Recommendation 3: Create snapshot if system is unstable
    if (status.systemHealth.overallStatus === 'degraded' && status.systemHealth.snapshotCount < 1) {
      recommendations.push({
        recommendationId: `snapshot_${Date.now()}`,
        workflowId,
        priority: 'high',
        type: 'preventive',
        title: 'Create Recovery Snapshot',
        description: 'System instability detected. Create snapshot for complete recovery capability',
        action: {
          type: 'snapshot',
          parameters: { workflowId, includeFileSystem: true },
          estimatedDuration: 30000,
          riskLevel: 0.2
        },
        reasoning: [
          'System health is degraded',
          'No recent snapshots available',
          'Snapshot enables complete state restoration'
        ],
        consequences: {
          if_taken: ['Complete recovery capability', 'File system restoration available'],
          if_ignored: ['Limited recovery options', 'Potential data loss in major failures']
        }
      });
    }

    // Recommendation 4: Optimize recovery strategy for repeated errors
    const errorPatterns = this.analyzeErrorPatterns(errors);
    for (const pattern of errorPatterns) {
      if (pattern.occurrences >= 3) {
        recommendations.push({
          recommendationId: `pattern_${pattern.errorType}`,
          workflowId,
          priority: 'medium',
          type: 'optimization',
          title: 'Address Recurring Error Pattern',
          description: `Error pattern detected: ${pattern.errorType} (${pattern.occurrences} occurrences)`,
          action: {
            type: 'monitor',
            parameters: { errorType: pattern.errorType, action: 'investigate' },
            estimatedDuration: 15000,
            riskLevel: 0.3
          },
          reasoning: [
            `${pattern.occurrences} similar errors detected`,
            'Pattern suggests systemic issue',
            'Proactive resolution can prevent future errors'
          ],
          consequences: {
            if_taken: ['Reduced error frequency', 'Improved workflow reliability'],
            if_ignored: ['Continued error pattern', 'Degraded performance']
          }
        });
      }
    }

    // Store recommendations
    this.recommendations.set(workflowId, recommendations);

    // Emit events for each recommendation
    recommendations.forEach(rec => this.emit('recommendation-generated', rec));

    console.log(`✅ Generated ${recommendations.length} recovery recommendations for workflow: ${workflowId}`);
    return recommendations;
  }

  /**
   * Get comprehensive recovery health report
   */
  async generateHealthReport(): Promise<string> {
    const allStatuses = Array.from(this.recoveryStatuses.values());
    const allRecommendations = Array.from(this.recommendations.values()).flat();

    const totalErrors = allStatuses.reduce((sum, s) => sum + s.errorCount, 0);
    const criticalErrors = allStatuses.reduce((sum, s) => sum + s.criticalErrorCount, 0);
    const healthyWorkflows = allStatuses.filter(s => s.systemHealth.overallStatus === 'healthy').length;
    const degradedWorkflows = allStatuses.filter(s => s.systemHealth.overallStatus === 'degraded').length;
    const criticalWorkflows = allStatuses.filter(s => s.systemHealth.overallStatus === 'critical').length;

    let report = `🛡️  WORKFLOW ERROR RECOVERY HEALTH REPORT\n`;
    report += `═══════════════════════════════════════════════════════════════════════════════\n\n`;

    report += `📊 SYSTEM HEALTH OVERVIEW:\n`;
    report += `• Total Workflows Monitored: ${allStatuses.length}\n`;
    report += `• Healthy Workflows: ${healthyWorkflows} (${((healthyWorkflows / Math.max(allStatuses.length, 1)) * 100).toFixed(1)}%)\n`;
    report += `• Degraded Workflows: ${degradedWorkflows}\n`;
    report += `• Critical Workflows: ${criticalWorkflows}\n\n`;

    report += `🚨 ERROR SUMMARY:\n`;
    report += `• Total Errors: ${totalErrors}\n`;
    report += `• Critical Errors: ${criticalErrors}\n`;
    report += `• Auto-Recoverable: ${allStatuses.reduce((sum, s) => sum + s.autoRecoverableErrors, 0)}\n`;
    report += `• Active Recoveries: ${allStatuses.reduce((sum, s) => sum + s.activeRecoveryPlans, 0)}\n`;
    report += `• Active Rollbacks: ${allStatuses.reduce((sum, s) => sum + s.activeRollbacks, 0)}\n\n`;

    report += `💡 RECOMMENDATIONS:\n`;
    const criticalRecommendations = allRecommendations.filter(r => r.priority === 'critical').length;
    const highRecommendations = allRecommendations.filter(r => r.priority === 'high').length;
    const mediumRecommendations = allRecommendations.filter(r => r.priority === 'medium').length;

    report += `• Critical Priority: ${criticalRecommendations}\n`;
    report += `• High Priority: ${highRecommendations}\n`;
    report += `• Medium Priority: ${mediumRecommendations}\n\n`;

    if (criticalWorkflows > 0) {
      report += `🚨 CRITICAL ISSUES:\n`;
      allStatuses
        .filter(s => s.systemHealth.overallStatus === 'critical')
        .forEach(status => {
          report += `• ${status.workflowId}: ${status.errorCount} errors (${status.criticalErrorCount} critical)\n`;
          if (status.lastError) {
            report += `  Last Error: ${status.lastError.message}\n`;
          }
        });
      report += `\n`;
    }

    report += `🎯 RECOVERY CAPABILITIES:\n`;
    const avgRecoveryCapability = allStatuses.reduce((sum, s) => sum + s.systemHealth.recoveryCapability, 0) / Math.max(allStatuses.length, 1);
    const totalCheckpoints = allStatuses.reduce((sum, s) => sum + s.systemHealth.checkpointCount, 0);
    const totalSnapshots = allStatuses.reduce((sum, s) => sum + s.systemHealth.snapshotCount, 0);

    report += `• Average Recovery Capability: ${(avgRecoveryCapability * 100).toFixed(1)}%\n`;
    report += `• Total Checkpoints Available: ${totalCheckpoints}\n`;
    report += `• Total Snapshots Available: ${totalSnapshots}\n`;
    report += `• Rollback Capability: ${allStatuses.filter(s => s.systemHealth.rollbackAvailability).length}/${allStatuses.length} workflows\n\n`;

    report += `📈 SYSTEM STATUS: ${this.getOverallSystemHealth(allStatuses)}\n`;

    return report;
  }

  /**
   * Shutdown error recovery integration
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    console.log('🛡️  Workflow error recovery integration system shutdown');
  }

  /**
   * Private: Setup integration event listeners
   */
  private setupIntegrationListeners(): void {
    // Listen to error handler events
    this.errorHandler.on('error-detected', async (analysis) => {
      await this.updateRecoveryStatus(analysis.workflowId);
      await this.generateRecoveryRecommendations(analysis.workflowId);
    });

    this.errorHandler.on('recovery-completed', async (planId, success) => {
      // Find which workflow this affects
      const allStatuses = Array.from(this.recoveryStatuses.keys());
      for (const workflowId of allStatuses) {
        await this.updateRecoveryStatus(workflowId);
      }
    });

    // Listen to rollback manager events
    this.rollbackManager.on('rollback-completed', async (operationId, success) => {
      // Update recovery status for affected workflows
      const allStatuses = Array.from(this.recoveryStatuses.keys());
      for (const workflowId of allStatuses) {
        await this.updateRecoveryStatus(workflowId);
      }
    });

    // Listen to workflow monitor events
    this.monitor.on('workflow-started', async (state) => {
      await this.updateRecoveryStatus(state.workflowId);
    });

    this.monitor.on('step-failed', async (stepId, result, state) => {
      await this.updateRecoveryStatus(state.workflowId);
    });
  }

  /**
   * Private: Update recovery status for workflow
   */
  private async updateRecoveryStatus(workflowId: string): Promise<void> {
    const errors = this.errorHandler.getWorkflowErrors(workflowId);
    const workflowSummary = this.stateManager.getWorkflowStateSummary(workflowId);
    const snapshots = this.rollbackManager.getWorkflowSnapshots(workflowId);
    const activeRollbacks = this.rollbackManager.getActiveRollbacks();

    const criticalErrors = errors.filter(e => e.severity === ErrorSeverity.CRITICAL);
    const autoRecoverableErrors = errors.filter(e => e.automaticRecovery);
    const lastError = errors.length > 0 ? errors[0] : undefined;

    const status: IntegratedRecoveryStatus = {
      workflowId,
      hasErrors: errors.length > 0,
      errorCount: errors.length,
      criticalErrorCount: criticalErrors.length,
      activeRecoveryPlans: 0, // Would need to track active plans
      activeRollbacks: activeRollbacks.filter(r => r.workflowId === workflowId).length,
      autoRecoverableErrors: autoRecoverableErrors.length,
      lastError: lastError ? {
        errorId: lastError.errorId,
        severity: lastError.severity,
        message: lastError.message,
        timestamp: lastError.timestamp,
        suggestedRecovery: lastError.suggestedRecovery
      } : undefined,
      systemHealth: {
        overallStatus: this.calculateOverallStatus(errors, workflowSummary),
        recoveryCapability: this.calculateRecoveryCapability(errors, workflowSummary, snapshots),
        rollbackAvailability: (workflowSummary?.checkpoints || 0) > 0,
        checkpointCount: workflowSummary?.checkpoints || 0,
        snapshotCount: snapshots.length
      }
    };

    this.recoveryStatuses.set(workflowId, status);
    this.emit('recovery-status-changed', status);
  }

  /**
   * Private: Calculate overall workflow status
   */
  private calculateOverallStatus(
    errors: ErrorAnalysis[], 
    workflowSummary: any
  ): 'healthy' | 'degraded' | 'critical' {
    const criticalErrors = errors.filter(e => e.severity === ErrorSeverity.CRITICAL);
    const highErrors = errors.filter(e => e.severity === ErrorSeverity.HIGH);

    if (criticalErrors.length > 0) return 'critical';
    if (highErrors.length > 2 || errors.length > 5) return 'degraded';
    
    return 'healthy';
  }

  /**
   * Private: Calculate recovery capability
   */
  private calculateRecoveryCapability(
    errors: ErrorAnalysis[],
    workflowSummary: any,
    snapshots: any[]
  ): number {
    let capability = 0.5; // Base capability

    // Increase capability based on available recovery options
    if (workflowSummary?.checkpoints > 0) capability += 0.2;
    if (snapshots.length > 0) capability += 0.2;
    
    // Decrease capability based on error severity
    const criticalErrors = errors.filter(e => e.severity === ErrorSeverity.CRITICAL);
    capability -= criticalErrors.length * 0.1;

    return Math.max(0, Math.min(1, capability));
  }

  /**
   * Private: Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      for (const workflowId of this.recoveryStatuses.keys()) {
        const status = this.recoveryStatuses.get(workflowId);
        if (status) {
          this.emit('recovery-health-check', workflowId, status.systemHealth);
          
          // Trigger automatic recovery if conditions are met
          if (status.autoRecoverableErrors > 0 && status.systemHealth.overallStatus !== 'critical') {
            await this.executeAutomaticRecovery(workflowId);
          }
        }
      }
    }, 60000); // Check every minute
  }

  /**
   * Private: Analyze error patterns
   */
  private analyzeErrorPatterns(errors: ErrorAnalysis[]): Array<{errorType: string, occurrences: number}> {
    const patterns = new Map<string, number>();
    
    errors.forEach(error => {
      const key = error.category || 'unknown';
      patterns.set(key, (patterns.get(key) || 0) + 1);
    });
    
    return Array.from(patterns.entries()).map(([errorType, occurrences]) => ({
      errorType,
      occurrences
    }));
  }

  /**
   * Private: Get overall system health
   */
  private getOverallSystemHealth(allStatuses: IntegratedRecoveryStatus[]): string {
    if (allStatuses.length === 0) return 'UNKNOWN';
    
    const criticalCount = allStatuses.filter(s => s.systemHealth.overallStatus === 'critical').length;
    const degradedCount = allStatuses.filter(s => s.systemHealth.overallStatus === 'degraded').length;
    
    if (criticalCount > 0) return 'CRITICAL';
    if (degradedCount > allStatuses.length * 0.3) return 'DEGRADED';
    
    return 'HEALTHY';
  }
}

/**
 * Global workflow error recovery integration instance
 */
let globalWorkflowErrorRecoveryIntegration: WorkflowErrorRecoveryIntegration | null = null;

/**
 * Get the global workflow error recovery integration instance
 */
export function getWorkflowErrorRecoveryIntegration(): WorkflowErrorRecoveryIntegration {
  if (!globalWorkflowErrorRecoveryIntegration) {
    globalWorkflowErrorRecoveryIntegration = new WorkflowErrorRecoveryIntegration();
  }
  return globalWorkflowErrorRecoveryIntegration;
}

/**
 * Initialize workflow error recovery integration system
 */
export async function initializeWorkflowErrorRecoveryIntegration(): Promise<WorkflowErrorRecoveryIntegration> {
  const integration = getWorkflowErrorRecoveryIntegration();
  await integration.initialize();
  console.log('🛡️  Comprehensive workflow error recovery integration system initialized');
  return integration;
}