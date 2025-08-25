/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { OuroborosSession, SessionRecoveryOptions, SessionStatus } from './types.js';
import { SessionManager } from './session-manager.js';
import { GitInfoExtractor } from './git-info.js';

/**
 * Session display information for UI
 */
export interface SessionDisplayInfo {
  session: OuroborosSession;
  displayName: string;
  subtitle: string;
  statusIcon: string;
  ageDisplay: string;
  gitDisplay: string;
  workflowsDisplay: string;
  recoveryScore: number;
  canRecover: boolean;
  warnings: string[];
  recommendations: string[];
}

/**
 * Recovery UI filter options
 */
export interface RecoveryFilters {
  projectPath?: string;
  gitBranch?: string;
  agentId?: string;
  status?: SessionStatus;
  minScore?: number;
  maxAge?: number; // Hours
  hasActiveWorkflows?: boolean;
  textSearch?: string;
}

/**
 * Recovery selection result
 */
export interface RecoverySelection {
  session: OuroborosSession;
  options: SessionRecoveryOptions;
  confirmed: boolean;
}

/**
 * Interactive session recovery UI system
 */
export class SessionRecoveryUI extends EventEmitter {
  private sessionManager: SessionManager;
  private availableSessions: OuroborosSession[] = [];
  private filteredSessions: SessionDisplayInfo[] = [];
  private currentFilters: RecoveryFilters = {};
  private selectedIndex = 0;
  
  constructor(sessionManager: SessionManager) {
    super();
    this.sessionManager = sessionManager;
  }

  /**
   * Display interactive session recovery interface
   */
  async displayRecoveryInterface(projectPath?: string): Promise<RecoverySelection | null> {
    try {
      // Load available sessions
      await this.loadAvailableSessions(projectPath);
      
      if (this.availableSessions.length === 0) {
        this.displayNoSessionsMessage(projectPath);
        return null;
      }

      // Apply initial filters and display
      this.applyFilters();
      
      if (this.filteredSessions.length === 0) {
        this.displayNoMatchingSessionsMessage();
        return null;
      }

      // Display the interactive interface
      return await this.runInteractiveSelection();
      
    } catch (error) {
      console.error('❌ Failed to display recovery interface:', error);
      return null;
    }
  }

  /**
   * Display session recovery dashboard (non-interactive overview)
   */
  async displayRecoveryDashboard(projectPath?: string): Promise<void> {
    try {
      await this.loadAvailableSessions(projectPath);
      
      if (this.availableSessions.length === 0) {
        this.displayNoSessionsMessage(projectPath);
        return;
      }

      this.applyFilters();
      this.displaySessionsDashboard();
      
    } catch (error) {
      console.error('❌ Failed to display recovery dashboard:', error);
    }
  }

  /**
   * Quick recovery - automatically select and recover best matching session
   */
  async quickRecover(projectPath?: string): Promise<OuroborosSession | null> {
    try {
      await this.loadAvailableSessions(projectPath);
      
      if (this.availableSessions.length === 0) {
        console.log('📭 No sessions available for quick recovery');
        return null;
      }

      // Find best matching session
      const bestSession = this.availableSessions
        .filter(s => s.recovery.canRecover && s.recovery.score > 0.5)
        .sort((a, b) => b.recovery.score - a.recovery.score)[0];

      if (!bestSession) {
        console.log('⚠️  No suitable sessions found for quick recovery');
        return null;
      }

      console.log(`🚀 Quick recovering session: ${bestSession.sessionName || bestSession.id.substring(0, 8)}`);
      console.log(`📊 Recovery score: ${(bestSession.recovery.score * 100).toFixed(0)}%`);

      const defaultOptions: SessionRecoveryOptions = {
        restoreWorkflows: true,
        restoreAgent: true,
        restoreEnvironment: false,
        restoreOpenFiles: false,
        restoreTerminalSessions: false,
        restoreClipboard: false
      };

      return await this.sessionManager.recoverSession(bestSession.id, defaultOptions);
      
    } catch (error) {
      console.error('❌ Quick recovery failed:', error);
      return null;
    }
  }

  /**
   * Private: Load available sessions for recovery
   */
  private async loadAvailableSessions(projectPath?: string): Promise<void> {
    this.availableSessions = await this.sessionManager.findRecoverySessions(projectPath);
    console.log(`🔍 Found ${this.availableSessions.length} potential recovery sessions`);
  }

  /**
   * Private: Apply current filters to sessions
   */
  private applyFilters(): void {
    let filtered = this.availableSessions;

    // Apply filters
    if (this.currentFilters.projectPath) {
      filtered = filtered.filter(s => s.projectPath.includes(this.currentFilters.projectPath!));
    }

    if (this.currentFilters.gitBranch) {
      filtered = filtered.filter(s => s.gitInfo.branch === this.currentFilters.gitBranch);
    }

    if (this.currentFilters.agentId) {
      filtered = filtered.filter(s => s.activeAgent === this.currentFilters.agentId);
    }

    if (this.currentFilters.status) {
      filtered = filtered.filter(s => s.status === this.currentFilters.status);
    }

    if (this.currentFilters.minScore !== undefined) {
      filtered = filtered.filter(s => s.recovery.score >= this.currentFilters.minScore!);
    }

    if (this.currentFilters.maxAge !== undefined) {
      const maxAgeMs = this.currentFilters.maxAge! * 60 * 60 * 1000;
      const cutoff = Date.now() - maxAgeMs;
      filtered = filtered.filter(s => s.lastActive.getTime() > cutoff);
    }

    if (this.currentFilters.hasActiveWorkflows !== undefined) {
      filtered = filtered.filter(s => 
        this.currentFilters.hasActiveWorkflows ? 
        s.activeWorkflows.length > 0 : 
        s.activeWorkflows.length === 0
      );
    }

    if (this.currentFilters.textSearch) {
      const searchTerm = this.currentFilters.textSearch.toLowerCase();
      filtered = filtered.filter(s => 
        s.sessionName?.toLowerCase().includes(searchTerm) ||
        s.projectPath.toLowerCase().includes(searchTerm) ||
        s.activeAgent.toLowerCase().includes(searchTerm) ||
        s.gitInfo.branch.toLowerCase().includes(searchTerm)
      );
    }

    // Convert to display info and sort by recovery score
    this.filteredSessions = filtered
      .map(session => this.createSessionDisplayInfo(session))
      .sort((a, b) => b.recoveryScore - a.recoveryScore);

    // Reset selection if needed
    if (this.selectedIndex >= this.filteredSessions.length) {
      this.selectedIndex = 0;
    }
  }

  /**
   * Private: Create display information for session
   */
  private createSessionDisplayInfo(session: OuroborosSession): SessionDisplayInfo {
    const age = Date.now() - session.lastActive.getTime();
    const hoursAgo = Math.round(age / (1000 * 60 * 60));
    const daysAgo = Math.round(hoursAgo / 24);

    return {
      session,
      displayName: session.sessionName || `Session ${session.id.substring(0, 8)}`,
      subtitle: this.getProjectDisplayName(session.projectPath),
      statusIcon: this.getStatusIcon(session.status),
      ageDisplay: daysAgo > 1 ? `${daysAgo}d ago` : `${hoursAgo}h ago`,
      gitDisplay: GitInfoExtractor.getGitStatusSummary(session.gitInfo),
      workflowsDisplay: this.getWorkflowsDisplay(session),
      recoveryScore: session.recovery.score,
      canRecover: session.recovery.canRecover,
      warnings: session.recovery.warnings,
      recommendations: session.recovery.recommendations
    };
  }

  /**
   * Private: Get status icon for session
   */
  private getStatusIcon(status: SessionStatus): string {
    switch (status) {
      case SessionStatus.ACTIVE: return '🟢';
      case SessionStatus.SUSPENDED: return '⏸️';
      case SessionStatus.CRASHED: return '💥';
      case SessionStatus.COMPLETED: return '✅';
      case SessionStatus.ARCHIVED: return '📦';
      default: return '❓';
    }
  }

  /**
   * Private: Get project display name
   */
  private getProjectDisplayName(projectPath: string): string {
    const parts = projectPath.split('/');
    return parts[parts.length - 1] || projectPath;
  }

  /**
   * Private: Get workflows display string
   */
  private getWorkflowsDisplay(session: OuroborosSession): string {
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
   * Private: Run interactive selection interface
   */
  private async runInteractiveSelection(): Promise<RecoverySelection | null> {
    // This is a simplified version - in a real implementation, this would use
    // a proper TUI library like blessed, ink, or similar
    console.log('\n📋 AVAILABLE RECOVERY SESSIONS');
    console.log('═══════════════════════════════════════════════════════════');

    this.displaySessionsList();

    // For now, return the first available session with default options
    // In a real TUI implementation, this would be interactive
    const selectedSession = this.filteredSessions[0];
    
    if (!selectedSession) {
      return null;
    }

    console.log(`\n🎯 Selected session: ${selectedSession.displayName}`);
    console.log(`📊 Recovery score: ${(selectedSession.recoveryScore * 100).toFixed(0)}%`);

    if (selectedSession.warnings.length > 0) {
      console.log('⚠️  Warnings:');
      selectedSession.warnings.forEach(warning => console.log(`   • ${warning}`));
    }

    if (selectedSession.recommendations.length > 0) {
      console.log('💡 Recommendations:');
      selectedSession.recommendations.forEach(rec => console.log(`   • ${rec}`));
    }

    const options: SessionRecoveryOptions = {
      restoreWorkflows: true,
      restoreAgent: true,
      restoreEnvironment: false,
      restoreOpenFiles: false,
      restoreTerminalSessions: false,
      restoreClipboard: false
    };

    return {
      session: selectedSession.session,
      options,
      confirmed: true
    };
  }

  /**
   * Private: Display sessions list
   */
  private displaySessionsList(): void {
    this.filteredSessions.forEach((sessionInfo, index) => {
      const isSelected = index === this.selectedIndex;
      const marker = isSelected ? '→' : ' ';
      const score = (sessionInfo.recoveryScore * 100).toFixed(0);

      console.log(`${marker} ${sessionInfo.statusIcon} ${sessionInfo.displayName}`);
      console.log(`   📂 ${sessionInfo.subtitle} • 🌳 ${sessionInfo.gitDisplay}`);
      console.log(`   🤖 ${sessionInfo.session.activeAgent} • ⏰ ${sessionInfo.ageDisplay} • 📊 ${score}%`);
      console.log(`   🔄 ${sessionInfo.workflowsDisplay}`);
      
      if (!sessionInfo.canRecover) {
        console.log(`   ❌ Cannot recover - check warnings`);
      }
      
      console.log('');
    });
  }

  /**
   * Private: Display sessions dashboard
   */
  private displaySessionsDashboard(): void {
    console.log('\n📊 SESSION RECOVERY DASHBOARD');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Total sessions: ${this.availableSessions.length}`);
    console.log(`Recoverable: ${this.filteredSessions.filter(s => s.canRecover).length}`);
    console.log(`High score (>80%): ${this.filteredSessions.filter(s => s.recoveryScore > 0.8).length}`);
    console.log(`With active workflows: ${this.filteredSessions.filter(s => s.session.activeWorkflows.length > 0).length}`);
    console.log('');

    this.displaySessionsList();

    console.log('💡 Use interactive recovery mode to select and configure recovery options');
  }


  /**
   * Private: Display no sessions message
   */
  private displayNoSessionsMessage(projectPath?: string): void {
    console.log('\n📭 NO RECOVERY SESSIONS FOUND');
    console.log('═══════════════════════════════════');
    if (projectPath) {
      console.log(`No sessions available for project: ${projectPath}`);
    } else {
      console.log('No sessions available for recovery');
    }
    console.log('\n💡 Sessions are created automatically when you use Ouroboros');
    console.log('   Start a new session to begin creating recovery points');
  }

  /**
   * Private: Display no matching sessions message
   */
  private displayNoMatchingSessionsMessage(): void {
    console.log('\n🔍 NO MATCHING SESSIONS');
    console.log('═══════════════════════════════');
    console.log('No sessions match the current filters');
    console.log('\n💡 Try adjusting your search criteria or filters');
  }
}