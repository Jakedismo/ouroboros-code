/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { getSessionManager } from '../session/session-manager.js';
import { SessionRecoveryUI } from '../session/recovery-ui.js';
import { InteractiveRecoveryTUI } from '../session/interactive-recovery-tui.js';

/**
 * CLI command handlers for session management
 */
export class SessionCommands {
  private sessionManager = getSessionManager();
  private recoveryUI = new SessionRecoveryUI(this.sessionManager);

  /**
   * List available recovery sessions
   */
  async listSessions(options: {
    projectPath?: string;
    interactive?: boolean;
    detailed?: boolean;
  } = {}): Promise<void> {
    try {
      if (options.interactive) {
        await this.recoveryUI.displayRecoveryInterface(options.projectPath);
      } else if (options.detailed) {
        await this.recoveryUI.displayRecoveryDashboard(options.projectPath);
      } else {
        // Simple list format
        const sessions = await this.sessionManager.findRecoverySessions(options.projectPath);
        
        if (sessions.length === 0) {
          console.log('📭 No recovery sessions found');
          return;
        }

        console.log(`\n🔍 Found ${sessions.length} recovery sessions:`);
        console.log('═══════════════════════════════════════════════════════════');

        sessions.forEach((session, index) => {
          const age = Date.now() - session.lastActive.getTime();
          const hoursAgo = Math.round(age / (1000 * 60 * 60));
          const score = (session.recovery.score * 100).toFixed(0);
          const statusIcon = this.getStatusIcon(session.status);

          console.log(`${index + 1}. ${statusIcon} ${session.sessionName || session.id.substring(0, 8)}`);
          console.log(`   📂 ${this.getProjectName(session.projectPath)} • ⏰ ${hoursAgo}h ago • 📊 ${score}%`);
          console.log(`   🤖 ${session.activeAgent} • 🌳 ${session.gitInfo.branch}@${session.gitInfo.shortHash}`);
          
          if (session.activeWorkflows.length > 0) {
            console.log(`   🔄 ${session.activeWorkflows.length} active workflows`);
          }
          
          if (!session.recovery.canRecover) {
            console.log('   ❌ Recovery issues - use --detailed for more info');
          }
          console.log('');
        });

        console.log('💡 Use --interactive for guided recovery, --detailed for full dashboard');
      }

    } catch (error) {
      console.error('❌ Failed to list sessions:', error);
    }
  }

  /**
   * Interactive session recovery
   */
  async recoverInteractive(projectPath?: string): Promise<void> {
    try {
      const sessions = await this.sessionManager.findRecoverySessions(projectPath);
      
      if (sessions.length === 0) {
        console.log('📭 No sessions available for recovery');
        return;
      }

      // Convert to display format
      const displaySessions = sessions.map(session => ({
        session,
        displayName: session.sessionName || `Session ${session.id.substring(0, 8)}`,
        subtitle: this.getProjectName(session.projectPath),
        statusIcon: this.getStatusIcon(session.status),
        ageDisplay: this.formatAge(session.lastActive),
        gitDisplay: `${session.gitInfo.branch}@${session.gitInfo.shortHash}`,
        workflowsDisplay: this.getWorkflowsDisplay(session),
        recoveryScore: session.recovery.score,
        canRecover: session.recovery.canRecover,
        warnings: session.recovery.warnings,
        recommendations: session.recovery.recommendations
      }));

      const tui = new InteractiveRecoveryTUI();
      const selection = await tui.start(displaySessions);

      if (selection && selection.confirmed) {
        console.log('\n🚀 Starting recovery...');
        const recoveredSession = await this.sessionManager.recoverSession(
          selection.session.id, 
          selection.options
        );
        
        if (recoveredSession) {
          console.log('✅ Session recovered successfully!');
          console.log(`📋 Session: ${recoveredSession.sessionName || recoveredSession.id.substring(0, 8)}`);
          console.log(`🤖 Agent: ${recoveredSession.activeAgent}`);
          if (selection.options.restoreWorkflows && recoveredSession.activeWorkflows.length > 0) {
            console.log(`🔄 Restored ${recoveredSession.activeWorkflows.length} active workflows`);
          }
        }
      } else {
        console.log('Recovery cancelled');
      }

    } catch (error) {
      console.error('❌ Interactive recovery failed:', error);
    }
  }

  /**
   * Quick recovery - automatically select best session
   */
  async quickRecover(projectPath?: string): Promise<void> {
    try {
      const session = await this.recoveryUI.quickRecover(projectPath);
      
      if (session) {
        console.log('✅ Quick recovery completed!');
        console.log(`📋 Session: ${session.sessionName || session.id.substring(0, 8)}`);
        console.log(`🤖 Agent: ${session.activeAgent}`);
      } else {
        console.log('❌ No suitable sessions found for quick recovery');
        console.log('💡 Try using --interactive for more options');
      }

    } catch (error) {
      console.error('❌ Quick recovery failed:', error);
    }
  }

  /**
   * Recover specific session by ID
   */
  async recoverById(sessionId: string, options: {
    restoreWorkflows?: boolean;
    restoreAgent?: boolean;
    restoreEnvironment?: boolean;
    restoreOpenFiles?: boolean;
    restoreTerminalSessions?: boolean;
    restoreClipboard?: boolean;
  } = {}): Promise<void> {
    try {
      const recoveryOptions = {
        restoreWorkflows: options.restoreWorkflows ?? true,
        restoreAgent: options.restoreAgent ?? true,
        restoreEnvironment: options.restoreEnvironment ?? false,
        restoreOpenFiles: options.restoreOpenFiles ?? false,
        restoreTerminalSessions: options.restoreTerminalSessions ?? false,
        restoreClipboard: options.restoreClipboard ?? false
      };

      console.log(`🔄 Recovering session: ${sessionId.substring(0, 8)}...`);
      const session = await this.sessionManager.recoverSession(sessionId, recoveryOptions);
      
      if (session) {
        console.log('✅ Session recovered successfully!');
        console.log(`📋 Session: ${session.sessionName || session.id.substring(0, 8)}`);
        console.log(`🤖 Agent: ${session.activeAgent}`);
        console.log(`📂 Project: ${session.projectPath}`);
        
        if (recoveryOptions.restoreWorkflows && session.activeWorkflows.length > 0) {
          console.log(`🔄 Restored ${session.activeWorkflows.length} active workflows`);
        }
      }

    } catch (error) {
      console.error('❌ Recovery failed:', error);
    }
  }

  /**
   * Show current session status
   */
  async showStatus(): Promise<void> {
    try {
      const session = this.sessionManager.getCurrentSession();
      
      if (!session) {
        console.log('📭 No active session');
        return;
      }

      console.log('\n📊 CURRENT SESSION STATUS');
      console.log('═══════════════════════════════════════');
      console.log(`📋 ID: ${session.id}`);
      console.log(`📝 Name: ${session.sessionName || 'Unnamed'}`);
      console.log(`📂 Project: ${this.getProjectName(session.projectPath)}`);
      console.log(`🤖 Agent: ${session.activeAgent}`);
      console.log(`🌳 Git: ${session.gitInfo.branch}@${session.gitInfo.shortHash}`);
      console.log(`⏰ Created: ${this.formatDateTime(session.created)}`);
      console.log(`🔄 Last Active: ${this.formatDateTime(session.lastActive)}`);
      console.log(`💾 Last Saved: ${this.formatDateTime(session.lastSaved)}`);
      console.log(`📊 Status: ${this.getStatusIcon(session.status)} ${session.status}`);
      
      if (session.activeWorkflows.length > 0) {
        console.log(`🔄 Active Workflows: ${session.activeWorkflows.length}`);
      }
      
      if (session.checkpoints.length > 0) {
        console.log(`📍 Checkpoints: ${session.checkpoints.length}`);
        const lastCheckpoint = session.checkpoints[session.checkpoints.length - 1];
        console.log(`   Last: ${this.formatDateTime(lastCheckpoint.timestamp)} - ${lastCheckpoint.description}`);
      }

      const stats = session.statistics;
      console.log(`\n📈 STATISTICS:`);
      console.log(`   Commands: ${stats.commandsExecuted}`);
      console.log(`   Workflows: ${stats.workflowsCompleted}`);
      console.log(`   Errors: ${stats.errorsEncountered}`);
      console.log(`   Duration: ${this.formatDuration(session.totalDuration)}`);

    } catch (error) {
      console.error('❌ Failed to show status:', error);
    }
  }

  /**
   * Create manual checkpoint
   */
  async createCheckpoint(description?: string): Promise<void> {
    try {
      const session = this.sessionManager.getCurrentSession();
      
      if (!session) {
        console.log('❌ No active session - start a session first');
        return;
      }

      const checkpointDesc = description || 'Manual checkpoint';
      await this.sessionManager.createManualCheckpoint(checkpointDesc);
      
      console.log(`✅ Checkpoint created: ${checkpointDesc}`);

    } catch (error) {
      console.error('❌ Failed to create checkpoint:', error);
    }
  }

  /**
   * Show session statistics
   */
  async showStats(): Promise<void> {
    try {
      const stats = await this.sessionManager.getEnhancedStats();
      
      console.log('\n📊 SESSION STATISTICS');
      console.log('═════════════════════════════════════');
      console.log(`Total Sessions: ${stats.session.totalSessions}`);
      console.log(`Active Sessions: ${stats.session.activeSessions}`);
      console.log(`Average Duration: ${this.formatDuration(stats.session.averageSessionDuration)}`);
      
      console.log('\n🔄 WORKFLOW SUCCESS:');
      console.log(`   Total: ${stats.session.workflowSuccess.total}`);
      console.log(`   Completed: ${stats.session.workflowSuccess.completed}`);
      console.log(`   Failed: ${stats.session.workflowSuccess.failed}`);
      console.log(`   Success Rate: ${(stats.session.workflowSuccess.successRate * 100).toFixed(1)}%`);
      
      console.log('\n📈 PRODUCTIVITY:');
      console.log(`   Commands/Hour: ${stats.session.productivity.commandsPerHour.toFixed(1)}`);
      console.log(`   Workflows/Session: ${stats.session.productivity.workflowsPerSession.toFixed(1)}`);
      console.log(`   Error Rate: ${(stats.session.productivity.averageErrorRate * 100).toFixed(1)}%`);
      
      console.log('\n💾 PERSISTENCE:');
      console.log(`   Total Operations: ${stats.persistence.totalOperations}`);
      console.log(`   Success Rate: ${((stats.persistence.successfulOperations / stats.persistence.totalOperations) * 100).toFixed(1)}%`);
      console.log(`   Average Latency: ${stats.persistence.averageLatency.toFixed(1)}ms`);
      console.log(`   Total Data: ${this.formatBytes(stats.persistence.totalBytes)}`);
      
      console.log('\n📍 CHECKPOINTING:');
      console.log(`   Total Checkpoints: ${stats.checkpointing.totalCheckpoints}`);
      console.log(`   Commands Since Last: ${stats.checkpointing.commandsSinceCheckpoint}`);
      console.log(`   Memory Usage: ${this.formatBytes(stats.checkpointing.memoryUsage.heapUsed)}`);

    } catch (error) {
      console.error('❌ Failed to show statistics:', error);
    }
  }

  /**
   * Private: Get status icon for session
   */
  private getStatusIcon(status: string): string {
    switch (status) {
      case 'active': return '🟢';
      case 'suspended': return '⏸️';
      case 'crashed': return '💥';
      case 'completed': return '✅';
      case 'archived': return '📦';
      default: return '❓';
    }
  }

  /**
   * Private: Get project name from path
   */
  private getProjectName(projectPath: string): string {
    const parts = projectPath.split('/');
    return parts[parts.length - 1] || projectPath;
  }

  /**
   * Private: Format age display
   */
  private formatAge(date: Date): string {
    const age = Date.now() - date.getTime();
    const hours = Math.round(age / (1000 * 60 * 60));
    const days = Math.round(hours / 24);
    
    if (days > 1) {
      return `${days}d ago`;
    } else {
      return `${hours}h ago`;
    }
  }

  /**
   * Private: Get workflows display
   */
  private getWorkflowsDisplay(session: any): string {
    const active = session.activeWorkflows.length;
    const completed = session.completedWorkflows.length;
    const failed = session.failedWorkflows.length;

    if (active > 0) {
      return `${active} active, ${completed} completed, ${failed} failed`;
    } else if (completed > 0 || failed > 0) {
      return `${completed} completed, ${failed} failed`;
    } else {
      return 'No workflows';
    }
  }

  /**
   * Private: Format date time
   */
  private formatDateTime(date: Date): string {
    return date.toLocaleString();
  }

  /**
   * Private: Format duration
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Private: Format bytes
   */
  private formatBytes(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round(bytes / Math.pow(1024, i) * 100) / 100} ${sizes[i]}`;
  }
}