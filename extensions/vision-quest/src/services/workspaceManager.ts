/**
 * Workspace manager - handles ephemeral workspace creation and management
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

export interface WorkspaceInfo {
  path: string;
  isEphemeral: boolean;
  sessionId: string;
  createdAt: number;
}

export class WorkspaceManager {
  private workspaces = new Map<string, WorkspaceInfo>();
  private ephemeralRoot: string;

  constructor(private mainWorkspacePath: string) {
    // Create ephemeral workspace root in temp directory
    this.ephemeralRoot = path.join(os.tmpdir(), 'ouroboros-vision-quest');
    fs.ensureDirSync(this.ephemeralRoot);
  }

  async createEphemeralWorkspace(sessionId: string): Promise<WorkspaceInfo> {
    const workspacePath = path.join(this.ephemeralRoot, sessionId);
    
    // Clean up if exists
    if (fs.existsSync(workspacePath)) {
      await fs.remove(workspacePath);
    }

    // Create new ephemeral workspace
    await fs.ensureDir(workspacePath);

    // Copy main workspace structure (excluding node_modules, .git, etc.)
    await this.copyWorkspaceStructure(this.mainWorkspacePath, workspacePath);

    // Initialize git in ephemeral workspace for diff generation
    try {
      execSync('git init', { cwd: workspacePath, stdio: 'ignore' });
      execSync('git add .', { cwd: workspacePath, stdio: 'ignore' });
      execSync('git commit -m "Initial ephemeral workspace"', { 
        cwd: workspacePath, 
        stdio: 'ignore',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'Vision Quest',
          GIT_AUTHOR_EMAIL: 'vision@ouroboros.ai',
          GIT_COMMITTER_NAME: 'Vision Quest',
          GIT_COMMITTER_EMAIL: 'vision@ouroboros.ai'
        }
      });
    } catch (error) {
      // Git init is optional, continue without it
      console.warn('Failed to initialize git in ephemeral workspace:', error);
    }

    const workspace: WorkspaceInfo = {
      path: workspacePath,
      isEphemeral: true,
      sessionId,
      createdAt: Date.now()
    };

    this.workspaces.set(sessionId, workspace);
    return workspace;
  }

  async getWorkspace(sessionId: string): Promise<WorkspaceInfo | null> {
    return this.workspaces.get(sessionId) || null;
  }

  async applyPatch(workspace: WorkspaceInfo, patch: string): Promise<void> {
    if (workspace.isEphemeral) {
      // Apply changes from ephemeral to main workspace
      await this.syncChanges(workspace.path, this.mainWorkspacePath);
    } else {
      // Apply patch directly (if patch string provided)
      if (patch) {
        const patchFile = path.join(os.tmpdir(), `${workspace.sessionId}.patch`);
        await fs.writeFile(patchFile, patch);
        
        try {
          execSync(`git apply ${patchFile}`, { 
            cwd: this.mainWorkspacePath,
            stdio: 'ignore' 
          });
        } catch (error) {
          console.error('Failed to apply patch:', error);
          // Fallback to manual file sync
          await this.syncChanges(workspace.path, this.mainWorkspacePath);
        } finally {
          await fs.remove(patchFile);
        }
      }
    }
  }

  async cleanupWorkspace(sessionId: string): Promise<void> {
    const workspace = this.workspaces.get(sessionId);
    if (!workspace || !workspace.isEphemeral) return;

    try {
      await fs.remove(workspace.path);
      this.workspaces.delete(sessionId);
    } catch (error) {
      console.error(`Failed to cleanup workspace ${sessionId}:`, error);
    }
  }

  async cleanupOldWorkspaces(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<void> {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [sessionId, workspace] of this.workspaces) {
      if (workspace.isEphemeral && (now - workspace.createdAt) > maxAgeMs) {
        toDelete.push(sessionId);
      }
    }

    for (const sessionId of toDelete) {
      await this.cleanupWorkspace(sessionId);
    }
  }

  private async copyWorkspaceStructure(source: string, dest: string): Promise<void> {
    const ignorePatterns = [
      'node_modules',
      '.git',
      'dist',
      'build',
      '.next',
      '.cache',
      '*.log',
      '.DS_Store',
      'coverage',
      '.env.local',
      '.ouroboros/saga' // Don't copy saga session data
    ];

    await fs.copy(source, dest, {
      filter: (src) => {
        const relative = path.relative(source, src);
        
        // Check if should ignore
        for (const pattern of ignorePatterns) {
          if (pattern.includes('*')) {
            // Simple glob matching
            const regex = new RegExp(pattern.replace('*', '.*'));
            if (regex.test(relative)) return false;
          } else {
            // Exact match or directory
            if (relative.split(path.sep).includes(pattern)) return false;
          }
        }
        
        return true;
      }
    });
  }

  private async syncChanges(source: string, dest: string): Promise<void> {
    // Get list of changed files from ephemeral workspace
    const changedFiles = await this.getChangedFiles(source);
    
    for (const file of changedFiles) {
      const sourcePath = path.join(source, file);
      const destPath = path.join(dest, file);
      
      if (await fs.pathExists(sourcePath)) {
        // File exists in source, copy it
        await fs.ensureDir(path.dirname(destPath));
        await fs.copy(sourcePath, destPath, { overwrite: true });
      } else {
        // File was deleted, remove from dest
        if (await fs.pathExists(destPath)) {
          await fs.remove(destPath);
        }
      }
    }
  }

  private async getChangedFiles(workspacePath: string): Promise<string[]> {
    try {
      // Use git to get changed files if available
      const output = execSync('git diff --name-only HEAD', {
        cwd: workspacePath,
        encoding: 'utf-8'
      });
      
      return output.split('\n').filter(f => f.trim());
    } catch (error) {
      // Fallback: return all files (excluding ignored patterns)
      const files: string[] = [];
      
      const walk = async (dir: string, base: string = '') => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relative = path.join(base, entry.name);
          
          if (entry.isDirectory()) {
            if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
              await walk(fullPath, relative);
            }
          } else {
            files.push(relative);
          }
        }
      };
      
      await walk(workspacePath);
      return files;
    }
  }
}