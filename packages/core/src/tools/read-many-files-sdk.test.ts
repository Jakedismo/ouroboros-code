/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createReadManyFilesTool, ReadManyFilesToolSDK } from './read-many-files-sdk.js';
import type { Config } from '../index.js';

describe('ReadManyFilesTool (SDK Pattern with bat)', () => {
  let mockConfig: Partial<Config>;

  beforeEach(() => {
    mockConfig = {
      getTargetDir: () => '/workspace',
      getWorkspaceContext: () => ({
        getDirectories: () => ['/workspace'],
        isPathWithinWorkspace: () => true,
      }),
    } as any;
  });

  describe('SDK Tool Creation', () => {
    it('should create tool with correct name', () => {
      const tool = createReadManyFilesTool(mockConfig as Config);
      expect(tool.name).toBe('read_many_files');
    });

    it('should have comprehensive description', () => {
      const tool = createReadManyFilesTool(mockConfig as Config);
      expect(tool.description).toContain('Batch read multiple files');
      expect(tool.description).toContain('bat');
      expect(tool.description).toContain('syntax highlighting');
    });

    it('should have parameters schema defined', () => {
      const tool = createReadManyFilesTool(mockConfig as Config);
      expect(tool.parameters).toBeDefined();
    });
  });

  describe('Tool Execution', () => {
    it('should be callable as SDK tool', () => {
      const tool = createReadManyFilesTool(mockConfig as Config);

      expect(tool.invoke).toBeDefined();
      expect(typeof tool.invoke).toBe('function');
    });

    it('should have SDK tool structure', () => {
      const tool = createReadManyFilesTool(mockConfig as Config);

      expect(tool.type).toBe('function');
      expect(tool.name).toBe('read_many_files');
      expect(tool.description).toBeDefined();
      expect(tool.parameters).toBeDefined();
    });
  });

  describe('Backward Compatibility', () => {
    it('should provide factory class for tool registry', () => {
      const toolClass = new ReadManyFilesToolSDK(mockConfig as Config);

      expect(toolClass).toBeDefined();
      expect(ReadManyFilesToolSDK.Name).toBe('read_many_files');
    });

    it('should create tool via factory method', () => {
      const toolClass = new ReadManyFilesToolSDK(mockConfig as Config);
      const tool = toolClass.createTool();

      expect(tool.name).toBe('read_many_files');
      expect(tool.invoke).toBeDefined();
    });
  });

  describe('SDK Pattern Compliance', () => {
    it('should have invoke function (SDK pattern)', () => {
      const tool = createReadManyFilesTool(mockConfig as Config);

      expect(typeof tool.invoke).toBe('function');
    });

    it('should match SDK tool structure', () => {
      const tool = createReadManyFilesTool(mockConfig as Config);

      expect(tool.type).toBe('function');
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.parameters).toBeDefined();
      expect(tool.invoke).toBeDefined();
    });
  });
});
