/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createWebFetchTool, WebFetchToolSDK } from './web-fetch-sdk.js';
import type { Config } from '../index.js';

describe('WebFetchTool (SDK Pattern)', () => {
  let mockConfig: Partial<Config>;

  beforeEach(() => {
    mockConfig = {} as any;
  });

  describe('SDK Tool Creation', () => {
    it('should create tool with correct name', () => {
      const tool = createWebFetchTool(mockConfig as Config);
      expect(tool.name).toBe('web_fetch');
    });

    it('should have comprehensive description', () => {
      const tool = createWebFetchTool(mockConfig as Config);
      expect(tool.description).toContain('Fetches content from a URL');
      expect(tool.description).toContain('HTML to text');
    });

    it('should have parameters schema defined', () => {
      const tool = createWebFetchTool(mockConfig as Config);
      expect(tool.parameters).toBeDefined();
    });
  });

  describe('Tool Execution', () => {
    it('should be callable as SDK tool', () => {
      const tool = createWebFetchTool(mockConfig as Config);

      expect(tool.invoke).toBeDefined();
      expect(typeof tool.invoke).toBe('function');
    });

    it('should have SDK tool structure', () => {
      const tool = createWebFetchTool(mockConfig as Config);

      expect(tool.type).toBe('function');
      expect(tool.name).toBe('web_fetch');
      expect(tool.description).toBeDefined();
      expect(tool.parameters).toBeDefined();
    });
  });

  describe('Backward Compatibility', () => {
    it('should provide factory class for tool registry', () => {
      const toolClass = new WebFetchToolSDK(mockConfig as Config);

      expect(toolClass).toBeDefined();
      expect(WebFetchToolSDK.Name).toBe('web_fetch');
    });

    it('should create tool via factory method', () => {
      const toolClass = new WebFetchToolSDK(mockConfig as Config);
      const tool = toolClass.createTool();

      expect(tool.name).toBe('web_fetch');
      expect(tool.invoke).toBeDefined();
    });
  });

  describe('SDK Pattern Compliance', () => {
    it('should have invoke function (SDK pattern)', () => {
      const tool = createWebFetchTool(mockConfig as Config);

      expect(typeof tool.invoke).toBe('function');
    });

    it('should match SDK tool structure', () => {
      const tool = createWebFetchTool(mockConfig as Config);

      expect(tool.type).toBe('function');
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.parameters).toBeDefined();
      expect(tool.invoke).toBeDefined();
    });
  });
});
