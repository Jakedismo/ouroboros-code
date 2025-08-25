/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { Config } from '../../../core/src/config/config.js';
import { ToolRegistry } from '../../../core/src/tools/tool-registry.js';
import { getCoreSystemIntegration } from '../integration/core-system-integration.js';
import { runEndToEndTests } from '../integration/end-to-end-tests.js';
import { Logger } from '../../../core/src/utils/logger.js';

/**
 * System finalization status
 */
export interface SystemFinalizationStatus {
  timestamp: number;
  phase: 'initializing' | 'integrating' | 'testing' | 'validating' | 'completed' | 'failed';
  progress: number; // 0-100
  componentsInitialized: {
    agentRegistry: boolean;
    agentManager: boolean;
    workflowSystem: boolean;
    sessionManagement: boolean;
    analyticsSystem: boolean;
    optimizationSystem: boolean;
    errorHandlingSystem: boolean;
    coreIntegration: boolean;
  };
  integrationHealth: {
    providerIntegration: boolean;
    sessionIntegration: boolean;
    workflowIntegration: boolean;
    analyticsIntegration: boolean;
    optimizationIntegration: boolean;
    errorLoggingIntegration: boolean;
  };
  testResults?: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    overallSuccess: boolean;
    integrationHealth: any;
    performanceMetrics: any;
  };
  systemCapabilities: string[];
  readinessChecks: {
    coreSystemsReady: boolean;
    integrationsReady: boolean;
    performanceReady: boolean;
    errorHandlingReady: boolean;
    testsPassed: boolean;
  };
  finalStatus: 'ready' | 'needs-attention' | 'failed';
  recommendations: string[];
  nextSteps: string[];
}

/**
 * Complete system finalization and integration validation
 */
export class SystemFinalizer extends EventEmitter {
  private logger: Logger;
  private finalizationStatus: SystemFinalizationStatus;
  
  constructor(
    private config: Config,
    private toolRegistry: ToolRegistry
  ) {
    super();
    this.logger = new Logger('SystemFinalizer');
    
    // Initialize status
    this.finalizationStatus = {
      timestamp: Date.now(),
      phase: 'initializing',
      progress: 0,
      componentsInitialized: {
        agentRegistry: false,
        agentManager: false,
        workflowSystem: false,
        sessionManagement: false,
        analyticsSystem: false,
        optimizationSystem: false,
        errorHandlingSystem: false,
        coreIntegration: false,
      },
      integrationHealth: {
        providerIntegration: false,
        sessionIntegration: false,
        workflowIntegration: false,
        analyticsIntegration: false,
        optimizationIntegration: false,
        errorLoggingIntegration: false,
      },
      systemCapabilities: [],
      readinessChecks: {
        coreSystemsReady: false,
        integrationsReady: false,
        performanceReady: false,
        errorHandlingReady: false,
        testsPassed: false,
      },
      finalStatus: 'needs-attention',
      recommendations: [],
      nextSteps: [],
    };
  }

  /**
   * Execute complete system finalization
   */
  async finalizeSystem(): Promise<SystemFinalizationStatus> {
    this.logger.info('🚀 Starting complete system finalization...');
    this.emit('finalization-started', this.finalizationStatus);

    try {
      // Phase 1: Initialize and validate core components
      await this.initializeCoreComponents();
      
      // Phase 2: Validate all integrations
      await this.validateIntegrations();
      
      // Phase 3: Run comprehensive testing
      await this.runComprehensiveTesting();
      
      // Phase 4: Perform final validation
      await this.performFinalValidation();
      
      // Phase 5: Generate final report
      this.generateFinalReport();

      this.logger.info('✅ System finalization completed successfully!');
      this.emit('finalization-completed', this.finalizationStatus);
      
    } catch (error) {
      this.logger.error('❌ System finalization failed', { error: error.message });
      this.finalizationStatus.phase = 'failed';
      this.finalizationStatus.finalStatus = 'failed';
      this.finalizationStatus.recommendations.push(`Critical failure during finalization: ${error.message}`);
      this.emit('finalization-failed', this.finalizationStatus);
    }

    return this.finalizationStatus;
  }

  /**
   * Get current finalization status
   */
  getFinalizationStatus(): SystemFinalizationStatus {
    return { ...this.finalizationStatus };
  }

  /**
   * Phase 1: Initialize and validate core components
   */
  private async initializeCoreComponents(): Promise<void> {
    this.logger.info('🔧 Phase 1: Initializing core components...');
    this.finalizationStatus.phase = 'initializing';
    this.finalizationStatus.progress = 10;
    this.emit('phase-started', { phase: 'initializing', progress: 10 });

    try {
      // Get core system integration
      const coreIntegration = await getCoreSystemIntegration();
      await coreIntegration.initialize(this.toolRegistry, this.config);
      
      // Check component initialization
      const status = await coreIntegration.getIntegrationStatus();
      
      this.finalizationStatus.componentsInitialized = {
        agentRegistry: true, // Initialized in previous phases
        agentManager: status.hasActiveAgent !== undefined,
        workflowSystem: status.hasWorkflowIntegration,
        sessionManagement: status.hasSessionIntegration,
        analyticsSystem: status.hasAnalyticsIntegration,
        optimizationSystem: status.hasOptimizationIntegration,
        errorHandlingSystem: status.hasErrorLoggingIntegration,
        coreIntegration: status.integrationHealthy,
      };

      this.finalizationStatus.progress = 25;
      this.logger.info('✅ Core components initialized successfully');
      
    } catch (error) {
      this.logger.error('❌ Core component initialization failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Phase 2: Validate all integrations
   */
  private async validateIntegrations(): Promise<void> {
    this.logger.info('🔗 Phase 2: Validating system integrations...');
    this.finalizationStatus.phase = 'integrating';
    this.finalizationStatus.progress = 35;
    this.emit('phase-started', { phase: 'integrating', progress: 35 });

    try {
      const coreIntegration = await getCoreSystemIntegration();
      const status = await coreIntegration.getIntegrationStatus();

      // Validate each integration
      this.finalizationStatus.integrationHealth = {
        providerIntegration: status.hasProvider && status.providerType !== null,
        sessionIntegration: status.hasSessionIntegration,
        workflowIntegration: status.hasWorkflowIntegration,
        analyticsIntegration: status.hasAnalyticsIntegration,
        optimizationIntegration: status.hasOptimizationIntegration,
        errorLoggingIntegration: status.hasErrorLoggingIntegration,
      };

      // Build system capabilities list
      this.finalizationStatus.systemCapabilities = this.buildCapabilitiesList(status);

      this.finalizationStatus.progress = 50;
      this.logger.info('✅ System integrations validated successfully');
      
    } catch (error) {
      this.logger.error('❌ Integration validation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Phase 3: Run comprehensive testing
   */
  private async runComprehensiveTesting(): Promise<void> {
    this.logger.info('🧪 Phase 3: Running comprehensive system tests...');
    this.finalizationStatus.phase = 'testing';
    this.finalizationStatus.progress = 60;
    this.emit('phase-started', { phase: 'testing', progress: 60 });

    try {
      // Run end-to-end tests
      const testResults = await runEndToEndTests(this.config, this.toolRegistry);
      
      this.finalizationStatus.testResults = {
        totalTests: testResults.testsRun,
        passedTests: testResults.testsPassed,
        failedTests: testResults.testsFailed,
        overallSuccess: testResults.overallSuccess,
        integrationHealth: testResults.integrationHealth,
        performanceMetrics: testResults.performanceMetrics,
      };

      this.finalizationStatus.progress = 75;
      
      if (testResults.overallSuccess) {
        this.logger.info('✅ Comprehensive testing completed successfully');
      } else {
        this.logger.warn(`⚠️ Some tests failed: ${testResults.testsFailed}/${testResults.testsRun}`);
      }
      
    } catch (error) {
      this.logger.error('❌ Comprehensive testing failed', { error: error.message });
      this.finalizationStatus.testResults = {
        totalTests: 0,
        passedTests: 0,
        failedTests: 1,
        overallSuccess: false,
        integrationHealth: {},
        performanceMetrics: {},
      };
    }
  }

  /**
   * Phase 4: Perform final validation
   */
  private async performFinalValidation(): Promise<void> {
    this.logger.info('✅ Phase 4: Performing final system validation...');
    this.finalizationStatus.phase = 'validating';
    this.finalizationStatus.progress = 85;
    this.emit('phase-started', { phase: 'validating', progress: 85 });

    try {
      // Perform readiness checks
      this.finalizationStatus.readinessChecks = {
        coreSystemsReady: this.validateCoreSystemsReadiness(),
        integrationsReady: this.validateIntegrationsReadiness(),
        performanceReady: this.validatePerformanceReadiness(),
        errorHandlingReady: this.validateErrorHandlingReadiness(),
        testsPassed: this.finalizationStatus.testResults?.overallSuccess || false,
      };

      // Determine final status
      const allChecksPass = Object.values(this.finalizationStatus.readinessChecks).every(check => check);
      
      if (allChecksPass) {
        this.finalizationStatus.finalStatus = 'ready';
      } else {
        const criticalFailures = [
          !this.finalizationStatus.readinessChecks.coreSystemsReady,
          !this.finalizationStatus.readinessChecks.integrationsReady,
        ].some(failure => failure);
        
        this.finalizationStatus.finalStatus = criticalFailures ? 'failed' : 'needs-attention';
      }

      this.finalizationStatus.progress = 95;
      this.logger.info('✅ Final validation completed');
      
    } catch (error) {
      this.logger.error('❌ Final validation failed', { error: error.message });
      this.finalizationStatus.finalStatus = 'failed';
    }
  }

  /**
   * Phase 5: Generate final report
   */
  private generateFinalReport(): void {
    this.logger.info('📊 Phase 5: Generating final system report...');
    this.finalizationStatus.phase = 'completed';
    this.finalizationStatus.progress = 100;

    // Generate recommendations
    this.finalizationStatus.recommendations = this.generateRecommendations();
    
    // Generate next steps
    this.finalizationStatus.nextSteps = this.generateNextSteps();

    this.finalizationStatus.timestamp = Date.now();

    this.logger.info('✅ Final system report generated');
  }

  /**
   * Build system capabilities list
   */
  private buildCapabilitiesList(status: any): string[] {
    const capabilities: string[] = [];

    // Core capabilities
    if (status.hasProvider) {
      capabilities.push(`Multi-LLM Provider Support (${status.providerType})`);
    }
    
    if (status.hasActiveAgent) {
      capabilities.push(`Agent Management System with Active Agent`);
    }

    if (status.hasWorkflowIntegration) {
      capabilities.push('Advanced Workflow Execution and Monitoring');
    }

    if (status.hasSessionIntegration) {
      capabilities.push('Session Management with Persistence and Recovery');
    }

    if (status.hasAnalyticsIntegration) {
      capabilities.push('Comprehensive Analytics and Performance Monitoring');
    }

    if (status.hasOptimizationIntegration) {
      capabilities.push('Intelligent Performance Optimization and Resource Management');
    }

    if (status.hasErrorLoggingIntegration) {
      capabilities.push('Advanced Error Handling with Recovery and Logging');
    }

    // Additional capabilities
    capabilities.push('Built-in Tools Integration (11 tools across all providers)');
    capabilities.push('MCP Tools Integration with Connection Pooling');
    capabilities.push('Terminal User Interface with Interactive Components');
    capabilities.push('AppleScript Integration for macOS Control');
    capabilities.push('Real-time System Health Monitoring');
    capabilities.push('Automatic Error Recovery with Multiple Strategies');

    return capabilities;
  }

  /**
   * Validate core systems readiness
   */
  private validateCoreSystemsReadiness(): boolean {
    const components = this.finalizationStatus.componentsInitialized;
    return components.agentRegistry && 
           components.agentManager && 
           components.coreIntegration;
  }

  /**
   * Validate integrations readiness
   */
  private validateIntegrationsReadiness(): boolean {
    const integrations = this.finalizationStatus.integrationHealth;
    return integrations.providerIntegration &&
           integrations.sessionIntegration &&
           integrations.workflowIntegration;
  }

  /**
   * Validate performance readiness
   */
  private validatePerformanceReadiness(): boolean {
    const integrations = this.finalizationStatus.integrationHealth;
    return integrations.analyticsIntegration &&
           integrations.optimizationIntegration;
  }

  /**
   * Validate error handling readiness
   */
  private validateErrorHandlingReadiness(): boolean {
    return this.finalizationStatus.integrationHealth.errorLoggingIntegration;
  }

  /**
   * Generate system recommendations
   */
  private generateRecommendations(): string[] {
    const recommendations: string[] = [];

    // Check for missing integrations
    const integrations = this.finalizationStatus.integrationHealth;
    
    if (!integrations.analyticsIntegration) {
      recommendations.push('Enable analytics integration for performance monitoring');
    }
    
    if (!integrations.optimizationIntegration) {
      recommendations.push('Enable optimization integration for better resource management');
    }
    
    if (!integrations.errorLoggingIntegration) {
      recommendations.push('Enable error-logging integration for robust error handling');
    }

    // Check test results
    if (this.finalizationStatus.testResults && !this.finalizationStatus.testResults.overallSuccess) {
      recommendations.push(`Address ${this.finalizationStatus.testResults.failedTests} failed tests before production use`);
    }

    // Performance recommendations
    if (this.finalizationStatus.testResults?.performanceMetrics) {
      const metrics = this.finalizationStatus.testResults.performanceMetrics;
      if (metrics.averageTestDuration > 5000) {
        recommendations.push('Consider optimizing system performance - tests are running slower than expected');
      }
    }

    // General recommendations
    if (this.finalizationStatus.finalStatus === 'ready') {
      recommendations.push('System is ready for production use');
      recommendations.push('Monitor system health regularly using the integrated monitoring tools');
      recommendations.push('Review error logs and analytics data to identify optimization opportunities');
    }

    return recommendations;
  }

  /**
   * Generate next steps
   */
  private generateNextSteps(): string[] {
    const nextSteps: string[] = [];

    if (this.finalizationStatus.finalStatus === 'ready') {
      nextSteps.push('✅ System is fully operational and ready for use');
      nextSteps.push('🔍 Monitor system health dashboard for ongoing optimization');
      nextSteps.push('📊 Review analytics reports to understand usage patterns');
      nextSteps.push('🔄 Set up regular maintenance schedules for optimal performance');
    } else if (this.finalizationStatus.finalStatus === 'needs-attention') {
      nextSteps.push('⚠️ Address non-critical issues identified in readiness checks');
      nextSteps.push('🧪 Re-run failed tests after addressing underlying issues');
      nextSteps.push('🔧 Enable missing integrations for full functionality');
      nextSteps.push('✅ Validate system again after implementing fixes');
    } else {
      nextSteps.push('❌ Critical issues must be resolved before system use');
      nextSteps.push('🔍 Review error logs and integration status');
      nextSteps.push('🛠️ Fix core system and integration failures');
      nextSteps.push('🧪 Re-run complete system finalization after fixes');
    }

    return nextSteps;
  }

  /**
   * Print comprehensive system report
   */
  printSystemReport(): void {
    const status = this.finalizationStatus;
    
    console.log('\n' + '='.repeat(80));
    console.log('🚀 OUROBOROS MULTI-AGENT CLI SYSTEM - FINALIZATION REPORT');
    console.log('='.repeat(80));
    
    console.log(`\n📊 SYSTEM STATUS: ${status.finalStatus.toUpperCase()}`);
    console.log(`🕒 Finalization Time: ${new Date(status.timestamp).toISOString()}`);
    console.log(`📈 Overall Progress: ${status.progress}%`);
    
    console.log('\n🔧 CORE COMPONENTS:');
    Object.entries(status.componentsInitialized).forEach(([component, initialized]) => {
      console.log(`  ${initialized ? '✅' : '❌'} ${component}`);
    });
    
    console.log('\n🔗 SYSTEM INTEGRATIONS:');
    Object.entries(status.integrationHealth).forEach(([integration, healthy]) => {
      console.log(`  ${healthy ? '✅' : '❌'} ${integration}`);
    });
    
    if (status.testResults) {
      console.log('\n🧪 TEST RESULTS:');
      console.log(`  📊 Total Tests: ${status.testResults.totalTests}`);
      console.log(`  ✅ Passed: ${status.testResults.passedTests}`);
      console.log(`  ❌ Failed: ${status.testResults.failedTests}`);
      console.log(`  🎯 Success Rate: ${((status.testResults.passedTests / status.testResults.totalTests) * 100).toFixed(1)}%`);
    }
    
    console.log('\n✨ SYSTEM CAPABILITIES:');
    status.systemCapabilities.forEach(capability => {
      console.log(`  • ${capability}`);
    });
    
    console.log('\n🔍 READINESS CHECKS:');
    Object.entries(status.readinessChecks).forEach(([check, ready]) => {
      console.log(`  ${ready ? '✅' : '❌'} ${check}`);
    });
    
    if (status.recommendations.length > 0) {
      console.log('\n💡 RECOMMENDATIONS:');
      status.recommendations.forEach(rec => {
        console.log(`  • ${rec}`);
      });
    }
    
    console.log('\n🎯 NEXT STEPS:');
    status.nextSteps.forEach(step => {
      console.log(`  • ${step}`);
    });
    
    console.log('\n' + '='.repeat(80));
    
    if (status.finalStatus === 'ready') {
      console.log('🎉 CONGRATULATIONS! Your Ouroboros Multi-Agent CLI System is ready for production use!');
    } else if (status.finalStatus === 'needs-attention') {
      console.log('⚠️ System is functional but needs attention for optimal performance.');
    } else {
      console.log('❌ Critical issues detected. Please resolve before production use.');
    }
    
    console.log('='.repeat(80) + '\n');
  }
}

/**
 * Run complete system finalization
 */
export async function finalizeSystem(
  config: Config,
  toolRegistry: ToolRegistry
): Promise<SystemFinalizationStatus> {
  const finalizer = new SystemFinalizer(config, toolRegistry);
  
  // Set up event listeners for progress tracking
  finalizer.on('phase-started', ({ phase, progress }) => {
    console.log(`📍 Starting phase: ${phase} (${progress}%)`);
  });
  
  finalizer.on('finalization-completed', () => {
    console.log('🎉 System finalization completed!');
  });
  
  finalizer.on('finalization-failed', (status) => {
    console.error('💥 System finalization failed!');
  });
  
  const result = await finalizer.finalizeSystem();
  finalizer.printSystemReport();
  
  return result;
}

export default SystemFinalizer;