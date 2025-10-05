/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { FileSessionStorage, SessionManager } from './sessionManager.js';
import { user, assistant, type AgentInputItem } from '@openai/agents';

describe('SessionManager', () => {
  let tempDir: string;
  let sessionManager: SessionManager;

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = path.join(os.tmpdir(), `session-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    sessionManager = new SessionManager(tempDir);
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore errors during cleanup
    }
  });

  describe('FileSessionStorage', () => {
    it('should create new session with empty items', async () => {
      const sessionId = 'test-session-1';
      const storage = new FileSessionStorage(sessionId, tempDir);

      const items = await storage.getItems();
      expect(items).toEqual([]);
      expect(storage.getSessionId()).toBe(sessionId);
    });

    it('should persist and restore conversation items', async () => {
      const sessionId = 'test-session-2';
      const storage = new FileSessionStorage(sessionId, tempDir);

      // Add conversation items
      const items: AgentInputItem[] = [
        user('Hello, how are you?'),
        assistant('I am doing well, thank you!'),
        user('What is the weather like?'),
      ];

      await storage.addItems(items);

      // Verify items were added
      const retrievedItems = await storage.getItems();
      expect(retrievedItems).toHaveLength(3);
      expect(retrievedItems[0]).toMatchObject({
        type: 'message',
        role: 'user',
      });
      expect(retrievedItems[0].content[0]).toMatchObject({
        type: 'input_text',
        text: 'Hello, how are you?',
      });
      expect(retrievedItems[1]).toMatchObject({
        type: 'message',
        role: 'assistant',
      });
      expect(retrievedItems[1].content[0]).toMatchObject({
        type: 'output_text',
        text: 'I am doing well, thank you!',
      });
    });

    it('should restore session from disk', async () => {
      const sessionId = 'test-session-3';

      // First storage instance - add items
      const storage1 = new FileSessionStorage(sessionId, tempDir);
      await storage1.addItems([
        user('First message'),
        assistant('Response to first message'),
      ]);

      // Second storage instance - should restore from disk
      const storage2 = new FileSessionStorage(sessionId, tempDir);
      const items = await storage2.getItems();

      expect(items).toHaveLength(2);
      expect(items[0]).toMatchObject({
        type: 'message',
        role: 'user',
      });
      expect(items[0].content[0]).toMatchObject({
        type: 'input_text',
        text: 'First message',
      });
    });

    it('should pop items correctly', async () => {
      const sessionId = 'test-session-4';
      const storage = new FileSessionStorage(sessionId, tempDir);

      await storage.addItems([
        user('Message 1'),
        user('Message 2'),
        user('Message 3'),
      ]);

      const popped = await storage.popItem();
      expect(popped).toMatchObject({
        type: 'message',
        role: 'user',
      });
      expect(popped!.content[0]).toMatchObject({
        type: 'input_text',
        text: 'Message 3',
      });

      const remaining = await storage.getItems();
      expect(remaining).toHaveLength(2);
    });

    it('should clear session correctly', async () => {
      const sessionId = 'test-session-5';
      const storage = new FileSessionStorage(sessionId, tempDir);

      await storage.addItems([user('Message 1'), user('Message 2')]);
      await storage.clearSession();

      const items = await storage.getItems();
      expect(items).toEqual([]);

      // Verify file was deleted
      const sessionPath = path.join(tempDir, 'sessions', `${sessionId}.json`);
      await expect(fs.access(sessionPath)).rejects.toThrow();
    });
  });

  describe('SessionManager', () => {
    it('should create and retrieve sessions', () => {
      const session1 = sessionManager.getOrCreateSession('session-1');
      const session2 = sessionManager.getOrCreateSession('session-2');

      expect(session1.getSessionId()).toBe('session-1');
      expect(session2.getSessionId()).toBe('session-2');

      // Should return same instance for same session ID
      const session1Again = sessionManager.getOrCreateSession('session-1');
      expect(session1Again).toBe(session1);
    });

    it('should list all sessions', async () => {
      const session1 = sessionManager.getOrCreateSession('session-a');
      const session2 = sessionManager.getOrCreateSession('session-b');

      await session1.addItems([user('Test 1')]);
      await session2.addItems([user('Test 2')]);

      const sessionIds = await sessionManager.listSessions();
      expect(sessionIds).toContain('session-a');
      expect(sessionIds).toContain('session-b');
    });

    it('should delete sessions', async () => {
      const session = sessionManager.getOrCreateSession('session-delete');
      await session.addItems([user('Test message')]);

      await sessionManager.deleteSession('session-delete');

      const sessionIds = await sessionManager.listSessions();
      expect(sessionIds).not.toContain('session-delete');
    });

    it('should cleanup old sessions', async () => {
      const session1 = sessionManager.getOrCreateSession('old-session');
      const session2 = sessionManager.getOrCreateSession('new-session');

      await session1.addItems([user('Old message')]);
      await session2.addItems([user('New message')]);

      // Manually modify old session file timestamp
      const oldSessionPath = path.join(tempDir, 'sessions', 'old-session.json');
      const oldTime = Date.now() - 31 * 24 * 60 * 60 * 1000; // 31 days ago
      await fs.utimes(oldSessionPath, new Date(oldTime), new Date(oldTime));

      const deletedCount = await sessionManager.cleanupOldSessions(30);

      expect(deletedCount).toBe(1);

      const sessionIds = await sessionManager.listSessions();
      expect(sessionIds).not.toContain('old-session');
      expect(sessionIds).toContain('new-session');
    });
  });

  describe('Multi-turn conversation persistence', () => {
    it('should preserve conversation across multiple turns', async () => {
      const sessionId = 'multi-turn-session';
      const storage = sessionManager.getOrCreateSession(sessionId);

      // Turn 1
      await storage.addItems([
        user('What is 2+2?'),
        assistant('2+2 equals 4'),
      ]);

      // Turn 2
      await storage.addItems([
        user('And what is 3+3?'),
        assistant('3+3 equals 6'),
      ]);

      // Turn 3
      await storage.addItems([user('Thank you!')]);

      // Verify all conversation history is preserved
      const items = await storage.getItems();
      expect(items).toHaveLength(5);

      expect(items[0]).toMatchObject({
        type: 'message',
        role: 'user',
      });
      expect(items[0].content[0]).toMatchObject({
        type: 'input_text',
        text: 'What is 2+2?',
      });
      expect(items[1]).toMatchObject({
        type: 'message',
        role: 'assistant',
      });
      expect(items[1].content[0]).toMatchObject({
        type: 'output_text',
        text: '2+2 equals 4',
      });
      expect(items[4]).toMatchObject({
        type: 'message',
        role: 'user',
      });
      expect(items[4].content[0]).toMatchObject({
        type: 'input_text',
        text: 'Thank you!',
      });
    });

    it('should restore conversation after app restart simulation', async () => {
      const sessionId = 'restart-test';

      // Simulate first app session
      const storage1 = sessionManager.getOrCreateSession(sessionId);
      await storage1.addItems([
        user('First session message'),
        assistant('Response in first session'),
      ]);

      // Simulate app restart - create new SessionManager
      const newSessionManager = new SessionManager(tempDir);
      const storage2 = newSessionManager.getOrCreateSession(sessionId);

      // Should restore previous conversation
      const items = await storage2.getItems();
      expect(items).toHaveLength(2);
      expect(items[0]).toMatchObject({
        type: 'message',
        role: 'user',
      });
      expect(items[0].content[0]).toMatchObject({
        type: 'input_text',
        text: 'First session message',
      });
    });
  });
});
