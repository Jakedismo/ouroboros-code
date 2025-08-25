/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

// Core workflow state management
export {
  WorkflowStateManager,
  getWorkflowStateManager,
  initializeWorkflowStateManagement,
  type PersistedWorkflowState,
  type WorkflowCheckpoint,
  type WorkflowResults,
  type WorkflowAnalytics,
  type WorkflowStateManagerEvents
} from './workflow-state-manager.js';

// Advanced results analysis
export {
  WorkflowResultsAnalyzer,
  getWorkflowResultsAnalyzer,
  initializeWorkflowResultsAnalysis,
  InsightType,
  type WorkflowInsight,
  type WorkflowComparison,
  type TrendAnalysis,
  type PerformanceBottleneck,
  type WorkflowResultsAnalyzerEvents
} from './workflow-results-analyzer.js';

// Advanced persistence and recovery
export {
  WorkflowStatePersistence,
  getWorkflowStatePersistence,
  initializeWorkflowStatePersistence,
  type PersistenceConfig,
  type StateStorageMetadata,
  type StateIndexEntry,
  type RecoveryPoint,
  type WorkflowStatePersistenceEvents
} from './workflow-state-persistence.js';

/**
 * Initialize complete workflow state management system
 */
export async function initializeCompleteWorkflowStateSystem() {
  console.log('🚀 Initializing complete workflow state management system...');
  
  // Initialize all components
  const { initializeWorkflowStateManagement } = await import('./workflow-state-manager.js');
  const { initializeWorkflowResultsAnalysis } = await import('./workflow-results-analyzer.js');
  const { initializeWorkflowStatePersistence } = await import('./workflow-state-persistence.js');
  
  const [stateManager, resultsAnalyzer, persistence] = await Promise.all([
    initializeWorkflowStateManagement(),
    initializeWorkflowResultsAnalysis(),
    initializeWorkflowStatePersistence()
  ]);

  console.log('✅ Complete workflow state management system initialized');
  console.log('   📊 State Manager: tracking execution progress and results');
  console.log('   🔍 Results Analyzer: generating insights and performance analysis');
  console.log('   💾 Persistence Layer: advanced state storage and recovery');
  
  return {
    stateManager,
    resultsAnalyzer,
    persistence
  };
}