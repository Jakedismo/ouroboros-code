/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkflowExecutionState } from '../workflow/monitoring/workflow-monitor.js';
import { CommandExecutionResult } from '../workflow/monitoring/command-execution-tracker.js';

/**
 * Git repository information for session context
 */
export interface GitInfo {
  commitHash: string;
  shortHash: string; // First 7 characters
  branch: string;
  isDirty: boolean;
  uncommittedFiles: string[];
  remoteName?: string;
  remoteUrl?: string;
  lastCommitMessage?: string;
  lastCommitAuthor?: string;
  lastCommitDate?: Date;
}

/**
 * Terminal session state
 */
export interface TerminalSession {
  id: string;
  pid?: number;
  cwd: string;
  lastCommand?: string;
  isActive: boolean;
  startTime: Date;
}

/**
 * File context information
 */
export interface FileContext {
  path: string;
  lastModified: Date;
  size: number;
  isOpen?: boolean;
  cursorPosition?: {
    line: number;
    column: number;
  };
}

/**
 * Environment context
 */
export interface EnvironmentContext {
  cwd: string;
  platform: string;
  nodeVersion: string;
  envVars: Record<string, string>;
  pathDirectories: string[];
  packageManager?: 'npm' | 'yarn' | 'pnpm' | 'bun';
  packageJsonPath?: string;
}

/**
 * Session checkpoint for recovery points
 */
export interface SessionCheckpoint {
  id: string;
  timestamp: Date;
  type: 'auto' | 'manual' | 'workflow' | 'agent-switch';
  workflowId?: string;
  stepId?: string;
  agentId?: string;
  description: string;
  state: {
    activeWorkflows: string[]; // Workflow IDs
    completedWorkflows: string[];
    failedWorkflows: string[];
    lastCommand?: CommandExecutionResult;
    memoryUsage?: NodeJS.MemoryUsage;
  };
  metadata?: Record<string, any>;
}

/**
 * Session recovery information
 */
export interface SessionRecoveryInfo {
  canRecover: boolean;
  score: number; // 0-1, how relevant this session is for recovery
  factors: {
    gitMatch: boolean; // Same commit hash
    branchMatch: boolean; // Same branch
    pathMatch: boolean; // Same project path
    recentActivity: boolean; // Active within threshold
    workflowsInProgress: number;
    agentCompatibility: boolean;
  };
  recommendations: string[];
  warnings: string[];
}

/**
 * Session status
 */
export enum SessionStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended', // Gracefully paused
  CRASHED = 'crashed', // Ungraceful exit detected
  COMPLETED = 'completed', // Normal termination
  ARCHIVED = 'archived' // Old session moved to archive
}

/**
 * Main Ouroboros session interface
 */
export interface OuroborosSession {
  // === SESSION IDENTITY ===
  id: string; // UUID v4
  projectId: string; // Hash of project path
  projectPath: string; // Full path to project directory
  sessionName?: string; // Optional user-defined name
  
  // === GIT CONTEXT ===
  gitInfo: GitInfo;
  
  // === TEMPORAL DATA ===
  created: Date;
  lastActive: Date;
  lastSaved: Date;
  totalDuration: number; // Milliseconds of active use
  sessionNumber: number; // Nth session for this project
  
  // === STATUS ===
  status: SessionStatus;
  exitReason?: string; // Why the session ended
  
  // === AGENT CONTEXT ===
  activeAgent: string; // Current agent ID
  agentHistory: Array<{
    agentId: string;
    activatedAt: Date;
    duration: number;
  }>;
  
  // === ENVIRONMENT ===
  environment: EnvironmentContext;
  
  // === WORKFLOW STATE ===
  activeWorkflows: WorkflowExecutionState[];
  completedWorkflows: string[]; // Workflow IDs
  failedWorkflows: Array<{
    workflowId: string;
    error: string;
    timestamp: Date;
  }>;
  
  // === COMMAND HISTORY ===
  commandHistory: CommandExecutionResult[];
  
  // === CHECKPOINTS ===
  checkpoints: SessionCheckpoint[];
  lastCheckpoint?: Date;
  
  // === CONTEXT PRESERVATION ===
  openFiles: FileContext[];
  terminalSessions: TerminalSession[];
  clipboardContext?: string;
  workspaceSettings?: Record<string, any>;
  
  // === STATISTICS ===
  statistics: {
    commandsExecuted: number;
    workflowsCompleted: number;
    errorsEncountered: number;
    averageCommandTime: number;
    mostUsedAgent: string;
    productivityScore: number; // 0-1
  };
  
  // === RECOVERY DATA ===
  recovery: SessionRecoveryInfo;
  
  // === METADATA ===
  metadata: {
    version: string; // Session format version
    ouroborosVersion: string;
    platform: string;
    nodeVersion: string;
    tags?: string[]; // User-defined tags
    notes?: string; // User notes about session
    agentContexts?: Record<string, {
      performance: {
        commandsExecuted: number;
        workflowsCompleted: number;
        averageResponseTime: number;
        successRate: number;
      };
      preferences: Record<string, any>;
      lastActive: Date;
    }>;
  };
}

/**
 * Session search criteria
 */
export interface SessionSearchCriteria {
  projectPath?: string;
  gitCommitHash?: string;
  gitBranch?: string;
  agentId?: string;
  status?: SessionStatus;
  dateRange?: {
    from: Date;
    to: Date;
  };
  hasActiveWorkflows?: boolean;
  minDuration?: number; // Minimum session duration
  tags?: string[];
  textSearch?: string; // Search in notes, commands, etc.
}

/**
 * Session recovery options
 */
export interface SessionRecoveryOptions {
  restoreWorkflows: boolean;
  restoreAgent: boolean;
  restoreEnvironment: boolean;
  restoreOpenFiles: boolean;
  restoreTerminalSessions: boolean;
  restoreClipboard: boolean;
  
  // Advanced options
  skipStepValidation?: boolean; // Skip validating that workflow steps can still run
  forceRecovery?: boolean; // Attempt recovery even with warnings
  selectiveRecovery?: {
    workflowIds?: string[]; // Only recover specific workflows
    checkpointId?: string; // Recover from specific checkpoint
  };
}

/**
 * Session management events
 */
export interface SessionManagerEvents {
  'session-created': (session: OuroborosSession) => void;
  'session-restored': (session: OuroborosSession) => void;
  'session-suspended': (session: OuroborosSession) => void;
  'session-resumed': (session: OuroborosSession) => void;
  'session-ended': (session: OuroborosSession, reason: string) => void;
  'checkpoint-created': (session: OuroborosSession, checkpoint: SessionCheckpoint) => void;
  'recovery-available': (sessions: OuroborosSession[]) => void;
  'auto-save': (session: OuroborosSession) => void;
}

/**
 * Session statistics aggregation
 */
export interface SessionStatistics {
  totalSessions: number;
  activeSessions: number;
  averageSessionDuration: number;
  totalProjectTime: Record<string, number>; // Project path -> total time
  agentUsage: Record<string, number>; // Agent ID -> usage time
  workflowSuccess: {
    total: number;
    completed: number;
    failed: number;
    successRate: number;
  };
  productivity: {
    commandsPerHour: number;
    workflowsPerSession: number;
    averageErrorRate: number;
  };
  timeTracking: {
    mostActiveHours: number[]; // Hours of day (0-23)
    mostActiveWeekdays: number[]; // 0=Sunday, 6=Saturday
    longestSession: number; // Duration in ms
    shortestSession: number;
  };
}

/**
 * Session configuration
 */
export interface SessionConfig {
  // Auto-save settings
  autoSaveInterval: number; // Milliseconds between auto-saves
  checkpointInterval: number; // Milliseconds between checkpoints
  
  // Cleanup settings
  maxSessionHistory: number; // Maximum number of sessions to keep
  archiveAfterDays: number; // Days after which to archive old sessions
  
  // Recovery settings
  recoveryScoreThreshold: number; // Minimum score to suggest recovery
  maxRecoverySuggestions: number; // Maximum sessions to suggest for recovery
  
  // Storage settings
  storageDirectory: string; // Base directory for session storage
  compressionEnabled: boolean; // Compress session files
  
  // Context preservation
  trackOpenFiles: boolean;
  trackTerminalSessions: boolean;
  trackClipboard: boolean;
  trackEnvironmentVars: boolean;
  
  // Privacy settings
  excludeEnvVars: string[]; // Environment variables to exclude from storage
  anonymizeFiles: boolean; // Hash file paths instead of storing full paths
}