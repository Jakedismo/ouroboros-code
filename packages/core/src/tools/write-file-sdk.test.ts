/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createWriteFileTool, WriteFileToolSDK } from './write-file-sdk.js';
import type { Config } from '../index.js';

describe('WriteFileTool (SDK Pattern)', () => {
  let mockConfig: Partial<Config>;

  beforeEach(() => {
    mockConfig = {
      getFileSystemService: () => ({
        readTextFile: async () => {
          throw { code: 'ENOENT', message: 'File not found' };
        },
        writeTextFile: async () => {},
      } as any),
    };
  });

  describe('SDK Tool Creation', () => {
    it('should create tool with correct name', () => {
      const tool = createWriteFileTool(mockConfig as Config);
      expect(tool.name).toBe('write_file');
    });

    it('should have comprehensive description', () => {
      const tool = createWriteFileTool(mockConfig as Config);
      expect(tool.description).toContain('Writes content to a specified file');
      expect(tool.description).toContain('absolute path');
      expect(tool.description).toContain('parent directories');
    });

    it('should have parameters schema defined', () => {
      const tool = createWriteFileTool(mockConfig as Config);
      expect(tool.parameters).toBeDefined();
    });
  });

  describe('Tool Execution', () => {
    it('should be callable as SDK tool', () => {
      const tool = createWriteFileTool(mockConfig as Config);

      // SDK tools have invoke method (not execute)
      expect(tool.invoke).toBeDefined();
      expect(typeof tool.invoke).toBe('function');
    });

    it('should have SDK tool structure', () => {
      const tool = createWriteFileTool(mockConfig as Config);

      // SDK tools have these standard properties
      expect(tool.type).toBe('function');
      expect(tool.name).toBe('write_file');
      expect(tool.description).toBeDefined();
      expect(tool.parameters).toBeDefined();
    });
  });

  describe('Backward Compatibility', () => {
    it('should provide factory class for tool registry', () => {
      const toolClass = new WriteFileToolSDK(mockConfig as Config);

      expect(toolClass).toBeDefined();
      expect(WriteFileToolSDK.Name).toBe('write_file');
    });

    it('should create tool via factory method', () => {
      const toolClass = new WriteFileToolSDK(mockConfig as Config);
      const tool = toolClass.createTool();

      expect(tool.name).toBe('write_file');
      expect(tool.invoke).toBeDefined();
    });
  });

  describe('SDK Pattern Compliance', () => {
    it('should have invoke function (SDK pattern)', () => {
      const tool = createWriteFileTool(mockConfig as Config);

      // SDK pattern: invoke method (not execute or invocation class)
      expect(typeof tool.invoke).toBe('function');
    });

    it('should match SDK tool structure', () => {
      const tool = createWriteFileTool(mockConfig as Config);

      // SDK tools have these properties
      expect(tool.type).toBe('function');
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.parameters).toBeDefined();
      expect(tool.invoke).toBeDefined();
    });
  });
});
