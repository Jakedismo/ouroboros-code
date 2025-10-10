// @ts-nocheck
/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createLocalShellTool, LocalShellToolSDK } from './local-shell-sdk.js';
import type { Config } from '../index.js';

describe('LocalShellTool (SDK Pattern - Alias)', () => {
  let mockConfig: Partial<Config>;

  beforeEach(() => {
    mockConfig = {
      getTargetDir: () => '/workspace',
      getWorkspaceContext: () => ({
        getDirectories: () => ['/workspace'],
        isPathWithinWorkspace: () => true,
      }),
      getExcludeTools: () => [],
      getCoreTools: () => [],
    } as any;
  });

  describe('SDK Tool Creation', () => {
    it('should create tool with correct name', () => {
      const tool = createLocalShellTool(mockConfig as Config);
      expect(tool.name).toBe('local_shell');
    });

    it('should have shell description (alias)', () => {
      const tool = createLocalShellTool(mockConfig as Config);
      expect(tool.description).toContain('run_shell_command');
    });

    it('should have parameters schema defined', () => {
      const tool = createLocalShellTool(mockConfig as Config);
      expect(tool.parameters).toBeDefined();
    });
  });

  describe('Tool Execution', () => {
    it('should be callable as SDK tool', () => {
      const tool = createLocalShellTool(mockConfig as Config);

      expect(tool.invoke).toBeDefined();
      expect(typeof tool.invoke).toBe('function');
    });

    it('should have SDK tool structure', () => {
      const tool = createLocalShellTool(mockConfig as Config);

      expect(tool.type).toBe('function');
      expect(tool.name).toBe('local_shell');
      expect(tool.description).toBeDefined();
      expect(tool.parameters).toBeDefined();
    });
  });

  describe('Backward Compatibility', () => {
    it('should provide factory class for tool registry', () => {
      const toolClass = new LocalShellToolSDK(mockConfig as Config);

      expect(toolClass).toBeDefined();
      expect(LocalShellToolSDK.Name).toBe('local_shell');
    });

    it('should create tool via factory method', () => {
      const toolClass = new LocalShellToolSDK(mockConfig as Config);
      const tool = toolClass.createTool();

      expect(tool.name).toBe('local_shell');
      expect(tool.invoke).toBeDefined();
    });
  });

  describe('SDK Pattern Compliance', () => {
    it('should have invoke function (SDK pattern)', () => {
      const tool = createLocalShellTool(mockConfig as Config);

      expect(typeof tool.invoke).toBe('function');
    });

    it('should match SDK tool structure', () => {
      const tool = createLocalShellTool(mockConfig as Config);

      expect(tool.type).toBe('function');
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.parameters).toBeDefined();
      expect(tool.invoke).toBeDefined();
    });
  });
});
