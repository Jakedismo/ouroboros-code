/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { AgentInputItem } from '@openai/agents';
import { Logger } from '../utils/logger.js';

/**
 * Session storage interface following OpenAI Agents SDK patterns
 * Inspired by Python's SessionABC protocol but adapted for JS/TS
 */
export interface SessionStorage {
  /**
   * Retrieve all conversation items for this session
   */
  getItems(): Promise<AgentInputItem[]>;

  /**
   * Add new conversation items to the session
   */
  addItems(items: AgentInputItem[]): Promise<void>;

  /**
   * Remove and return the most recent item
   */
  popItem(): Promise<AgentInputItem | null>;

  /**
   * Clear all items from this session
   */
  clearSession(): Promise<void>;

  /**
   * Get the session ID
   */
  getSessionId(): string;
}

/**
 * File-based session storage implementation
 * Similar to Python's SQLiteSession but uses JSON files for simplicity
 *
 * Session files are stored at: {storageDir}/sessions/{sessionId}.json
 */
export class FileSessionStorage implements SessionStorage {
  private readonly sessionId: string;
  private readonly sessionFilePath: string;
  private items: AgentInputItem[] | null = null;
  private readonly logger: Logger | null;

  constructor(
    sessionId: string,
    private readonly storageDir: string,
    logger?: Logger,
  ) {
    this.sessionId = sessionId;
    this.logger = logger ?? null;

    // Create sessions subdirectory
    const sessionsDir = path.join(storageDir, 'sessions');
    this.sessionFilePath = path.join(sessionsDir, `${sessionId}.json`);
  }

  getSessionId(): string {
    return this.sessionId;
  }

  async getItems(): Promise<AgentInputItem[]> {
    if (this.items !== null) {
      return [...this.items]; // Return copy
    }

    try {
      // Ensure sessions directory exists
      await fs.mkdir(path.dirname(this.sessionFilePath), { recursive: true });

      // Try to load existing session
      const content = await fs.readFile(this.sessionFilePath, 'utf-8');
      const data = JSON.parse(content) as { items: AgentInputItem[]; version: number };

      this.items = data.items || [];
      this.logger?.debug(`Loaded ${this.items.length} items from session ${this.sessionId}`);

      return [...this.items];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Session file doesn't exist yet - start with empty array
        this.items = [];
        this.logger?.debug(`Created new session ${this.sessionId}`);
        return [];
      }

      // Other errors (parse errors, permission errors, etc)
      const message = error instanceof Error ? error.message : String(error);
      this.logger?.error(`Failed to load session ${this.sessionId}: ${message}`);
      throw new Error(`Failed to load session: ${message}`);
    }
  }

  async addItems(items: AgentInputItem[]): Promise<void> {
    if (this.items === null) {
      await this.getItems(); // Load existing items first
    }

    this.items!.push(...items);

    // Persist to disk
    await this.persist();

    this.logger?.debug(`Added ${items.length} items to session ${this.sessionId} (total: ${this.items!.length})`);
  }

  async popItem(): Promise<AgentInputItem | null> {
    if (this.items === null) {
      await this.getItems();
    }

    if (this.items!.length === 0) {
      return null;
    }

    const item = this.items!.pop()!;
    await this.persist();

    this.logger?.debug(`Popped item from session ${this.sessionId} (remaining: ${this.items!.length})`);

    return item;
  }

  async clearSession(): Promise<void> {
    this.items = [];

    try {
      // Delete the session file
      await fs.unlink(this.sessionFilePath);
      this.logger?.debug(`Cleared session ${this.sessionId}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        const message = error instanceof Error ? error.message : String(error);
        this.logger?.error(`Failed to clear session ${this.sessionId}: ${message}`);
      }
    }
  }

  private async persist(): Promise<void> {
    try {
      const data = {
        version: 1,
        sessionId: this.sessionId,
        items: this.items || [],
        lastModified: new Date().toISOString(),
      };

      await fs.mkdir(path.dirname(this.sessionFilePath), { recursive: true });
      await fs.writeFile(
        this.sessionFilePath,
        JSON.stringify(data, null, 2),
        'utf-8',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger?.error(`Failed to persist session ${this.sessionId}: ${message}`);
      throw new Error(`Failed to persist session: ${message}`);
    }
  }
}

/**
 * Session manager for creating and managing conversation sessions
 * Follows OpenAI Agents SDK patterns for session lifecycle
 */
export class SessionManager {
  private readonly sessions = new Map<string, SessionStorage>();

  constructor(
    private readonly storageDir: string,
    private readonly logger?: Logger,
  ) {}

  /**
   * Get or create a session with the given ID
   * Similar to Python's pattern of reusing sessions
   */
  getOrCreateSession(sessionId: string): SessionStorage {
    if (!this.sessions.has(sessionId)) {
      const session = new FileSessionStorage(sessionId, this.storageDir, this.logger);
      this.sessions.set(sessionId, session);
      this.logger?.debug(`Created session storage for ${sessionId}`);
    }

    return this.sessions.get(sessionId)!;
  }

  /**
   * Delete a session and its storage
   */
  async deleteSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.clearSession();
      this.sessions.delete(sessionId);
      this.logger?.debug(`Deleted session ${sessionId}`);
    }
  }

  /**
   * List all session IDs that have been stored
   */
  async listSessions(): Promise<string[]> {
    try {
      const sessionsDir = path.join(this.storageDir, 'sessions');
      const files = await fs.readdir(sessionsDir);

      return files
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, ''));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return []; // No sessions directory yet
      }
      throw error;
    }
  }

  /**
   * Clean up old sessions (for maintenance)
   * @param olderThanDays Delete sessions older than this many days
   */
  async cleanupOldSessions(olderThanDays: number): Promise<number> {
    const sessionsDir = path.join(this.storageDir, 'sessions');
    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    let deletedCount = 0;

    try {
      const files = await fs.readdir(sessionsDir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(sessionsDir, file);
        const stats = await fs.stat(filePath);

        if (stats.mtimeMs < cutoffTime) {
          await fs.unlink(filePath);
          deletedCount++;

          const sessionId = file.replace(/\.json$/, '');
          this.sessions.delete(sessionId);
        }
      }

      this.logger?.info(`Cleaned up ${deletedCount} old sessions`);
      return deletedCount;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        const message = error instanceof Error ? error.message : String(error);
        this.logger?.error(`Failed to cleanup sessions: ${message}`);
      }
      return 0;
    }
  }
}
