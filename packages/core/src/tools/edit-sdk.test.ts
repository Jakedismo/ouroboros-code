/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createEditTool, EditToolSDK } from './edit-sdk.js';
import type { Config } from '../index.js';

describe('EditTool (SDK Pattern with ast-grep)', () => {
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
      const tool = createEditTool(mockConfig as Config);
      expect(tool.name).toBe('edit_file');
    });

    it('should have comprehensive description', () => {
      const tool = createEditTool(mockConfig as Config);
      expect(tool.description).toContain('AST-based structural editing');
      expect(tool.description).toContain('ast-grep');
      expect(tool.description).toContain('string replacement');
    });

    it('should have parameters schema defined', () => {
      const tool = createEditTool(mockConfig as Config);
      expect(tool.parameters).toBeDefined();
    });
  });

  describe('Tool Execution', () => {
    it('should be callable as SDK tool', () => {
      const tool = createEditTool(mockConfig as Config);

      expect(tool.invoke).toBeDefined();
      expect(typeof tool.invoke).toBe('function');
    });

    it('should have SDK tool structure', () => {
      const tool = createEditTool(mockConfig as Config);

      expect(tool.type).toBe('function');
      expect(tool.name).toBe('edit_file');
      expect(tool.description).toBeDefined();
      expect(tool.parameters).toBeDefined();
    });
  });

  describe('Backward Compatibility', () => {
    it('should provide factory class for tool registry', () => {
      const toolClass = new EditToolSDK(mockConfig as Config);

      expect(toolClass).toBeDefined();
      expect(EditToolSDK.Name).toBe('edit_file');
    });

    it('should create tool via factory method', () => {
      const toolClass = new EditToolSDK(mockConfig as Config);
      const tool = toolClass.createTool();

      expect(tool.name).toBe('edit_file');
      expect(tool.invoke).toBeDefined();
    });
  });

  describe('SDK Pattern Compliance', () => {
    it('should have invoke function (SDK pattern)', () => {
      const tool = createEditTool(mockConfig as Config);

      expect(typeof tool.invoke).toBe('function');
    });

    it('should match SDK tool structure', () => {
      const tool = createEditTool(mockConfig as Config);

      expect(tool.type).toBe('function');
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.parameters).toBeDefined();
      expect(tool.invoke).toBeDefined();
    });
  });
});
