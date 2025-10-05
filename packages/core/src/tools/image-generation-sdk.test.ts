/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createImageGenerationTool, ImageGenerationToolSDK } from './image-generation-sdk.js';
import type { Config } from '../index.js';

describe('ImageGenerationTool (SDK Pattern - Hosted Tool)', () => {
  let mockConfig: Partial<Config>;

  beforeEach(() => {
    mockConfig = {} as any;
  });

  describe('SDK Tool Creation', () => {
    it('should create hosted tool with correct name', () => {
      const tool = createImageGenerationTool(mockConfig as Config);
      expect(tool.name).toBe('image_generation');
    });

    it('should be a hosted tool type', () => {
      const tool = createImageGenerationTool(mockConfig as Config);
      expect(tool.type).toBe('hosted_tool');
    });

    it('should have providerData for hosted execution', () => {
      const tool = createImageGenerationTool(mockConfig as Config);
      expect(tool).toHaveProperty('providerData');
    });
  });

  describe('Tool Execution', () => {
    it('should be a hosted tool (no direct invoke)', () => {
      const tool = createImageGenerationTool(mockConfig as Config);

      // Hosted tools don't have invoke - they're executed by the SDK runtime
      expect(tool.type).toBe('hosted_tool');
    });

    it('should have hosted tool structure', () => {
      const tool = createImageGenerationTool(mockConfig as Config);

      expect(tool.type).toBe('hosted_tool');
      expect(tool.name).toBe('image_generation');
      expect(tool).toHaveProperty('providerData');
    });
  });

  describe('Backward Compatibility', () => {
    it('should provide factory class for tool registry', () => {
      const toolClass = new ImageGenerationToolSDK(mockConfig as Config);

      expect(toolClass).toBeDefined();
      expect(ImageGenerationToolSDK.Name).toBe('image_generation');
    });

    it('should create tool via factory method', () => {
      const toolClass = new ImageGenerationToolSDK(mockConfig as Config);
      const tool = toolClass.createTool();

      expect(tool.name).toBe('image_generation');
      expect(tool.type).toBe('hosted_tool');
    });
  });

  describe('SDK Pattern Compliance', () => {
    it('should be hosted_tool type (not function)', () => {
      const tool = createImageGenerationTool(mockConfig as Config);

      expect(tool.type).toBe('hosted_tool');
    });

    it('should match SDK hosted tool structure', () => {
      const tool = createImageGenerationTool(mockConfig as Config);

      expect(tool.type).toBe('hosted_tool');
      expect(tool.name).toBeDefined();
      expect(tool).toHaveProperty('providerData');
    });
  });
});
