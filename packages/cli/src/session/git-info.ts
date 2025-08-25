/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { GitInfo } from './types.js';

/**
 * Git information extractor for session context
 */
export class GitInfoExtractor {
  /**
   * Extract comprehensive git information from a directory
   */
  static async getGitInfo(projectPath: string): Promise<GitInfo | null> {
    try {
      // Check if this is a git repository
      if (!GitInfoExtractor.isGitRepository(projectPath)) {
        return null;
      }

      const originalCwd = process.cwd();
      process.chdir(projectPath);

      try {
        // Get commit hash
        const commitHash = GitInfoExtractor.executeGitCommand('rev-parse HEAD').trim();
        const shortHash = commitHash.substring(0, 7);

        // Get branch name
        let branch = '';
        try {
          branch = GitInfoExtractor.executeGitCommand('rev-parse --abbrev-ref HEAD').trim();
          // Handle detached HEAD
          if (branch === 'HEAD') {
            branch = `detached@${shortHash}`;
          }
        } catch {
          branch = 'unknown';
        }

        // Check if working directory is dirty
        let isDirty = false;
        let uncommittedFiles: string[] = [];
        try {
          const statusOutput = GitInfoExtractor.executeGitCommand('status --porcelain');
          isDirty = statusOutput.trim().length > 0;
          if (isDirty) {
            uncommittedFiles = statusOutput
              .split('\n')
              .filter(line => line.trim().length > 0)
              .map(line => line.substring(3).trim()); // Remove status prefix
          }
        } catch {
          // If status fails, assume clean
        }

        // Get remote information
        let remoteName: string | undefined;
        let remoteUrl: string | undefined;
        try {
          remoteName = GitInfoExtractor.executeGitCommand('remote').split('\n')[0]?.trim();
          if (remoteName) {
            remoteUrl = GitInfoExtractor.executeGitCommand(`remote get-url ${remoteName}`).trim();
          }
        } catch {
          // No remote configured
        }

        // Get last commit information
        let lastCommitMessage: string | undefined;
        let lastCommitAuthor: string | undefined;
        let lastCommitDate: Date | undefined;
        try {
          lastCommitMessage = GitInfoExtractor.executeGitCommand('log -1 --pretty=format:%s').trim();
          lastCommitAuthor = GitInfoExtractor.executeGitCommand('log -1 --pretty=format:%an').trim();
          const commitDateStr = GitInfoExtractor.executeGitCommand('log -1 --pretty=format:%ci').trim();
          lastCommitDate = new Date(commitDateStr);
        } catch {
          // Could not get commit information
        }

        const gitInfo: GitInfo = {
          commitHash,
          shortHash,
          branch,
          isDirty,
          uncommittedFiles,
          remoteName,
          remoteUrl,
          lastCommitMessage,
          lastCommitAuthor,
          lastCommitDate
        };

        return gitInfo;

      } finally {
        process.chdir(originalCwd);
      }

    } catch (error) {
      console.warn(`⚠️  Failed to extract git info from ${projectPath}:`, error);
      return null;
    }
  }

  /**
   * Check if a directory is a git repository
   */
  static isGitRepository(projectPath: string): boolean {
    return existsSync(join(projectPath, '.git'));
  }

  /**
   * Generate a project ID based on git info and path
   */
  static generateProjectId(projectPath: string, gitInfo?: GitInfo): string {
    const crypto = require('crypto');
    
    // Use git remote URL if available, otherwise use project path
    let identifier = projectPath;
    if (gitInfo?.remoteUrl) {
      // Normalize git URLs
      identifier = GitInfoExtractor.normalizeGitUrl(gitInfo.remoteUrl);
    }
    
    return crypto.createHash('sha256').update(identifier).digest('hex').substring(0, 16);
  }

  /**
   * Normalize git URLs to consistent format
   */
  static normalizeGitUrl(url: string): string {
    // Convert SSH to HTTPS format for consistency
    if (url.startsWith('git@')) {
      // git@github.com:user/repo.git -> github.com/user/repo
      return url
        .replace('git@', '')
        .replace(':', '/')
        .replace('.git', '');
    }
    
    // Remove protocol and .git suffix
    return url
      .replace(/^https?:\/\//, '')
      .replace('.git', '');
  }

  /**
   * Get git status summary
   */
  static getGitStatusSummary(gitInfo: GitInfo): string {
    let summary = `${gitInfo.branch}@${gitInfo.shortHash}`;
    
    if (gitInfo.isDirty) {
      const fileCount = gitInfo.uncommittedFiles.length;
      summary += ` (+${fileCount} uncommitted)`;
    }
    
    return summary;
  }

  /**
   * Check if two git states are compatible for session recovery
   */
  static areGitStatesCompatible(
    sessionGit: GitInfo, 
    currentGit: GitInfo | null,
    options: {
      allowBranchSwitch?: boolean;
      allowCommitAdvance?: boolean;
      allowDirtyState?: boolean;
    } = {}
  ): { compatible: boolean; reasons: string[] } {
    const reasons: string[] = [];
    
    if (!currentGit) {
      reasons.push('Current directory is not a git repository');
      return { compatible: false, reasons };
    }

    // Check commit hash
    if (sessionGit.commitHash !== currentGit.commitHash) {
      if (!options.allowCommitAdvance) {
        reasons.push(`Commit changed from ${sessionGit.shortHash} to ${currentGit.shortHash}`);
      }
    }

    // Check branch
    if (sessionGit.branch !== currentGit.branch) {
      if (!options.allowBranchSwitch) {
        reasons.push(`Branch changed from ${sessionGit.branch} to ${currentGit.branch}`);
      }
    }

    // Check dirty state
    if (sessionGit.isDirty !== currentGit.isDirty) {
      if (!options.allowDirtyState) {
        const dirtyChange = currentGit.isDirty ? 'clean to dirty' : 'dirty to clean';
        reasons.push(`Working directory state changed from ${dirtyChange}`);
      }
    }

    return { compatible: reasons.length === 0, reasons };
  }

  /**
   * Calculate recovery relevance score based on git similarity
   */
  static calculateGitRelevanceScore(sessionGit: GitInfo, currentGit: GitInfo | null): number {
    if (!currentGit) return 0;

    let score = 0;

    // Same commit hash = perfect match
    if (sessionGit.commitHash === currentGit.commitHash) {
      score += 0.5;
    }

    // Same branch
    if (sessionGit.branch === currentGit.branch) {
      score += 0.3;
    }

    // Same dirty state
    if (sessionGit.isDirty === currentGit.isDirty) {
      score += 0.1;
    }

    // Same remote (if available)
    if (sessionGit.remoteUrl && currentGit.remoteUrl && 
        GitInfoExtractor.normalizeGitUrl(sessionGit.remoteUrl) === 
        GitInfoExtractor.normalizeGitUrl(currentGit.remoteUrl)) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Execute git command safely
   */
  private static executeGitCommand(command: string): string {
    try {
      return execSync(`git ${command}`, { 
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'], // Suppress stderr
        timeout: 5000 // 5 second timeout
      });
    } catch (error) {
      throw new Error(`Git command failed: ${command}`);
    }
  }

  /**
   * Get git repository root path
   */
  static getGitRootPath(projectPath: string): string | null {
    try {
      const originalCwd = process.cwd();
      process.chdir(projectPath);
      
      try {
        const gitRoot = GitInfoExtractor.executeGitCommand('rev-parse --show-toplevel').trim();
        return gitRoot;
      } finally {
        process.chdir(originalCwd);
      }
    } catch {
      return null;
    }
  }

  /**
   * Check if current git state has uncommitted changes that might conflict
   */
  static hasConflictingChanges(sessionGit: GitInfo, currentGit: GitInfo): string[] {
    const conflicts: string[] = [];
    
    if (!sessionGit.isDirty && currentGit.isDirty) {
      // Session was clean, but current state has uncommitted changes
      const conflictingFiles = currentGit.uncommittedFiles.filter(file => 
        // Check if any session files might conflict with current changes
        // This is a heuristic - we don't have session's exact file list
        file.endsWith('.json') || file.includes('session') || file.includes('workflow')
      );
      
      if (conflictingFiles.length > 0) {
        conflicts.push(`Uncommitted changes in: ${conflictingFiles.join(', ')}`);
      }
    }
    
    return conflicts;
  }
}