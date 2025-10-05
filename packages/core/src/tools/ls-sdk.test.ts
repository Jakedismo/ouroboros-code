/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createLSTool, LSToolSDK } from './ls-sdk.js';
import type { Config } from '../index.js';

describe('LSTool (SDK Pattern with eza)', () => {
  let mockConfig: Partial<Config>;

  beforeEach(() => {
    mockConfig = {
      getTargetDir: () => '/workspace',
      getFileService: () => ({
        shouldGitIgnoreFile: () => false,
        shouldGeminiIgnoreFile: () => false,
      } as any),
    };
  });

  describe('SDK Tool Creation', () => {
    it('should create tool with correct name', () => {
      const tool = createLSTool(mockConfig as Config);
      expect(tool.name).toBe('ls');
    });

    it('should have comprehensive description', () => {
      const tool = createLSTool(mockConfig as Config);
      expect(tool.description).toContain('Lists the contents of a directory');
      expect(tool.description).toContain('eza');
      expect(tool.description).toContain('git status');
      expect(tool.description).toContain('tree view');
    });

    it('should have parameters schema defined', () => {
      const tool = createLSTool(mockConfig as Config);
      expect(tool.parameters).toBeDefined();
    });
  });

  describe('Tool Execution', () => {
    it('should be callable as SDK tool', () => {
      const tool = createLSTool(mockConfig as Config);

      // SDK tools have invoke method
      expect(tool.invoke).toBeDefined();
      expect(typeof tool.invoke).toBe('function');
    });

    it('should have SDK tool structure', () => {
      const tool = createLSTool(mockConfig as Config);

      // SDK tools have these standard properties
      expect(tool.type).toBe('function');
      expect(tool.name).toBe('ls');
      expect(tool.description).toBeDefined();
      expect(tool.parameters).toBeDefined();
    });
  });

  describe('Backward Compatibility', () => {
    it('should provide factory class for tool registry', () => {
      const toolClass = new LSToolSDK(mockConfig as Config);

      expect(toolClass).toBeDefined();
      expect(LSToolSDK.Name).toBe('ls');
    });

    it('should create tool via factory method', () => {
      const toolClass = new LSToolSDK(mockConfig as Config);
      const tool = toolClass.createTool();

      expect(tool.name).toBe('ls');
      expect(tool.invoke).toBeDefined();
    });
  });

  describe('SDK Pattern Compliance', () => {
    it('should have invoke function (SDK pattern)', () => {
      const tool = createLSTool(mockConfig as Config);

      // SDK pattern: invoke method
      expect(typeof tool.invoke).toBe('function');
    });

    it('should match SDK tool structure', () => {
      const tool = createLSTool(mockConfig as Config);

      // SDK tools have these properties
      expect(tool.type).toBe('function');
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.parameters).toBeDefined();
      expect(tool.invoke).toBeDefined();
    });
  });
});
