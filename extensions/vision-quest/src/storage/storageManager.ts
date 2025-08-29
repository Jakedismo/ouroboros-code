/**
 * Storage manager - persists design documents and session metadata
 */

import * as fs from 'fs-extra';
import * as path from 'path';

export interface SessionMetadata {
  userGoal: string;
  providers: string[];
  timestamp: number;
  duration?: number;
  tokensUsed?: number;
  status?: 'success' | 'failed' | 'abandoned';
  validationResults?: any[];
}

export class StorageManager {
  private storageRoot: string;

  constructor(workspacePath: string) {
    // Store in .ouroboros/saga directory
    this.storageRoot = path.join(workspacePath, '.ouroboros', 'saga');
    fs.ensureDirSync(this.storageRoot);
  }

  async saveDesignDocument(
    sessionId: string,
    design: string,
    metadata: SessionMetadata
  ): Promise<void> {
    // Save design document as markdown
    const designPath = path.join(this.storageRoot, `${sessionId}.md`);
    await fs.writeFile(designPath, design);

    // Save metadata as JSON
    const metadataPath = path.join(this.storageRoot, `${sessionId}.json`);
    await fs.writeJson(metadataPath, {
      sessionId,
      ...metadata,
      designPath,
      savedAt: Date.now()
    }, { spaces: 2 });
  }

  async loadDesignDocument(sessionId: string): Promise<string | null> {
    const designPath = path.join(this.storageRoot, `${sessionId}.md`);
    
    if (await fs.pathExists(designPath)) {
      return await fs.readFile(designPath, 'utf-8');
    }
    
    return null;
  }

  async loadSessionMetadata(sessionId: string): Promise<SessionMetadata | null> {
    const metadataPath = path.join(this.storageRoot, `${sessionId}.json`);
    
    if (await fs.pathExists(metadataPath)) {
      return await fs.readJson(metadataPath);
    }
    
    return null;
  }

  async updateSessionMetadata(
    sessionId: string,
    updates: Partial<SessionMetadata>
  ): Promise<void> {
    const existing = await this.loadSessionMetadata(sessionId);
    if (!existing) return;

    const metadataPath = path.join(this.storageRoot, `${sessionId}.json`);
    await fs.writeJson(metadataPath, {
      ...existing,
      ...updates,
      updatedAt: Date.now()
    }, { spaces: 2 });
  }

  async listSessions(): Promise<Array<{ sessionId: string; metadata: SessionMetadata }>> {
    const sessions: Array<{ sessionId: string; metadata: SessionMetadata }> = [];
    
    try {
      const files = await fs.readdir(this.storageRoot);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      
      for (const file of jsonFiles) {
        const sessionId = file.replace('.json', '');
        const metadata = await this.loadSessionMetadata(sessionId);
        
        if (metadata) {
          sessions.push({ sessionId, metadata });
        }
      }
    } catch (error) {
      console.error('Failed to list sessions:', error);
    }

    // Sort by timestamp, newest first
    sessions.sort((a, b) => (b.metadata.timestamp || 0) - (a.metadata.timestamp || 0));
    
    return sessions;
  }

  async cleanupOldSessions(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    const now = Date.now();
    const sessions = await this.listSessions();
    
    for (const { sessionId, metadata } of sessions) {
      const age = now - (metadata.timestamp || 0);
      
      if (age > maxAgeMs) {
        await this.deleteSession(sessionId);
      }
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    const designPath = path.join(this.storageRoot, `${sessionId}.md`);
    const metadataPath = path.join(this.storageRoot, `${sessionId}.json`);
    
    try {
      await fs.remove(designPath);
      await fs.remove(metadataPath);
    } catch (error) {
      console.error(`Failed to delete session ${sessionId}:`, error);
    }
  }

  async saveImplementationArtifacts(
    sessionId: string,
    artifacts: {
      patch?: string;
      files?: any[];
      logs?: string[];
    }
  ): Promise<void> {
    const artifactsDir = path.join(this.storageRoot, sessionId);
    await fs.ensureDir(artifactsDir);

    // Save patch if provided
    if (artifacts.patch) {
      const patchPath = path.join(artifactsDir, 'changes.patch');
      await fs.writeFile(patchPath, artifacts.patch);
    }

    // Save file list
    if (artifacts.files) {
      const filesPath = path.join(artifactsDir, 'files.json');
      await fs.writeJson(filesPath, artifacts.files, { spaces: 2 });
    }

    // Save logs
    if (artifacts.logs) {
      const logsPath = path.join(artifactsDir, 'implementation.log');
      await fs.writeFile(logsPath, artifacts.logs.join('\n'));
    }
  }

  async loadImplementationArtifacts(sessionId: string): Promise<any> {
    const artifactsDir = path.join(this.storageRoot, sessionId);
    
    if (!await fs.pathExists(artifactsDir)) {
      return null;
    }

    const artifacts: any = {};

    // Load patch
    const patchPath = path.join(artifactsDir, 'changes.patch');
    if (await fs.pathExists(patchPath)) {
      artifacts.patch = await fs.readFile(patchPath, 'utf-8');
    }

    // Load files
    const filesPath = path.join(artifactsDir, 'files.json');
    if (await fs.pathExists(filesPath)) {
      artifacts.files = await fs.readJson(filesPath);
    }

    // Load logs
    const logsPath = path.join(artifactsDir, 'implementation.log');
    if (await fs.pathExists(logsPath)) {
      const logContent = await fs.readFile(logsPath, 'utf-8');
      artifacts.logs = logContent.split('\n');
    }

    return artifacts;
  }

  async exportSession(sessionId: string, exportPath: string): Promise<void> {
    const design = await this.loadDesignDocument(sessionId);
    const metadata = await this.loadSessionMetadata(sessionId);
    const artifacts = await this.loadImplementationArtifacts(sessionId);

    if (!design || !metadata) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const exportData = {
      sessionId,
      metadata,
      design,
      artifacts,
      exportedAt: Date.now()
    };

    await fs.writeJson(exportPath, exportData, { spaces: 2 });
  }

  async importSession(importPath: string): Promise<string> {
    const data = await fs.readJson(importPath);
    
    if (!data.sessionId || !data.design || !data.metadata) {
      throw new Error('Invalid session export file');
    }

    // Save imported session
    await this.saveDesignDocument(data.sessionId, data.design, data.metadata);
    
    // Save artifacts if present
    if (data.artifacts) {
      await this.saveImplementationArtifacts(data.sessionId, data.artifacts);
    }

    return data.sessionId;
  }
}