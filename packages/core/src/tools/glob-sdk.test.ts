/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createGlobTool, GlobToolSDK } from './glob-sdk.js';
import type { Config } from '../index.js';

describe('GlobTool (SDK Pattern with fd)', () => {
  let mockConfig: Partial<Config>;

  beforeEach(() => {
    mockConfig = {
      getTargetDir: () => '/workspace',
      getWorkspaceContext: () => ({
        getDirectories: () => ['/workspace'],
        isPathWithinWorkspace: () => true,
      }),
      getFileFilteringRespectGitIgnore: () => true,
      getFileExclusions: () => ({
        getGlobExcludes: () => ['node_modules', '.git'],
      }),
    } as any;
  });

  describe('SDK Tool Creation', () => {
    it('should create tool with correct name', () => {
      const tool = createGlobTool(mockConfig as Config);
      expect(tool.name).toBe('glob');
    });

    it('should have comprehensive description', () => {
      const tool = createGlobTool(mockConfig as Config);
      expect(tool.description).toContain('Fast file pattern matching');
      expect(tool.description).toContain('fd');
      expect(tool.description).toContain('glob patterns');
    });

    it('should have parameters schema defined', () => {
      const tool = createGlobTool(mockConfig as Config);
      expect(tool.parameters).toBeDefined();
    });
  });

  describe('Tool Execution', () => {
    it('should be callable as SDK tool', () => {
      const tool = createGlobTool(mockConfig as Config);

      expect(tool.invoke).toBeDefined();
      expect(typeof tool.invoke).toBe('function');
    });

    it('should have SDK tool structure', () => {
      const tool = createGlobTool(mockConfig as Config);

      expect(tool.type).toBe('function');
      expect(tool.name).toBe('glob');
      expect(tool.description).toBeDefined();
      expect(tool.parameters).toBeDefined();
    });
  });

  describe('Backward Compatibility', () => {
    it('should provide factory class for tool registry', () => {
      const toolClass = new GlobToolSDK(mockConfig as Config);

      expect(toolClass).toBeDefined();
      expect(GlobToolSDK.Name).toBe('glob');
    });

    it('should create tool via factory method', () => {
      const toolClass = new GlobToolSDK(mockConfig as Config);
      const tool = toolClass.createTool();

      expect(tool.name).toBe('glob');
      expect(tool.invoke).toBeDefined();
    });
  });

  describe('SDK Pattern Compliance', () => {
    it('should have invoke function (SDK pattern)', () => {
      const tool = createGlobTool(mockConfig as Config);

      expect(typeof tool.invoke).toBe('function');
    });

    it('should match SDK tool structure', () => {
      const tool = createGlobTool(mockConfig as Config);

      expect(tool.type).toBe('function');
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.parameters).toBeDefined();
      expect(tool.invoke).toBeDefined();
    });
  });
});
