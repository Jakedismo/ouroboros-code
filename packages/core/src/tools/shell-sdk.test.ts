/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createShellTool, ShellToolSDK } from './shell-sdk.js';
import type { Config } from '../index.js';

describe('ShellTool (SDK Pattern)', () => {
  let mockConfig: Partial<Config>;

  beforeEach(() => {
    mockConfig = {
      getTargetDir: () => '/workspace',
      getWorkspaceContext: () => ({
        getDirectories: () => ['/workspace'],
      }),
      getExcludeTools: () => [],
      getCoreTools: () => [],
    } as any;
  });

  describe('SDK Tool Creation', () => {
    it('should create tool with correct name', () => {
      const tool = createShellTool(mockConfig as Config);
      expect(tool.name).toBe('run_shell_command');
    });

    it('should have comprehensive description', () => {
      const tool = createShellTool(mockConfig as Config);
      expect(tool.description).toContain('executes a given shell command');
      expect(tool.description).toContain('Command:');
      expect(tool.description).toContain('Stdout:');
      expect(tool.description).toContain('Stderr:');
    });

    it('should have parameters schema defined', () => {
      const tool = createShellTool(mockConfig as Config);
      expect(tool.parameters).toBeDefined();
    });
  });

  describe('Tool Execution', () => {
    it('should be callable as SDK tool', () => {
      const tool = createShellTool(mockConfig as Config);

      // SDK tools have invoke method (not execute)
      expect(tool.invoke).toBeDefined();
      expect(typeof tool.invoke).toBe('function');
    });

    it('should have SDK tool structure', () => {
      const tool = createShellTool(mockConfig as Config);

      // SDK tools have these standard properties
      expect(tool.type).toBe('function');
      expect(tool.name).toBe('run_shell_command');
      expect(tool.description).toBeDefined();
      expect(tool.parameters).toBeDefined();
    });
  });

  describe('Backward Compatibility', () => {
    it('should provide factory class for tool registry', () => {
      const toolClass = new ShellToolSDK(mockConfig as Config);

      expect(toolClass).toBeDefined();
      expect(ShellToolSDK.Name).toBe('run_shell_command');
    });

    it('should create tool via factory method', () => {
      const toolClass = new ShellToolSDK(mockConfig as Config);
      const tool = toolClass.createTool();

      expect(tool.name).toBe('run_shell_command');
      expect(tool.invoke).toBeDefined();
    });
  });

  describe('SDK Pattern Compliance', () => {
    it('should have invoke function (SDK pattern)', () => {
      const tool = createShellTool(mockConfig as Config);

      // SDK pattern: invoke method (not execute or invocation class)
      expect(typeof tool.invoke).toBe('function');
    });

    it('should match SDK tool structure', () => {
      const tool = createShellTool(mockConfig as Config);

      // SDK tools have these properties
      expect(tool.type).toBe('function');
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.parameters).toBeDefined();
      expect(tool.invoke).toBeDefined();
    });
  });
});
