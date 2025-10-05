/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createImageGenerationTool, ImageGenerationToolSDK } from './image-generation-sdk.js';
import type { Config } from '../index.js';

describe('ImageGenerationTool (SDK Pattern)', () => {
  let mockConfig: Partial<Config>;

  beforeEach(() => {
    mockConfig = {} as any;
  });

  describe('SDK Tool Creation', () => {
    it('should create tool with correct name', () => {
      const tool = createImageGenerationTool(mockConfig as Config);
      expect(tool.name).toBe('generate_image');
    });

    it('should have comprehensive description', () => {
      const tool = createImageGenerationTool(mockConfig as Config);
      expect(tool.description).toContain('placeholder SVG images');
      expect(tool.description).toContain('customizable');
    });

    it('should have parameters schema defined', () => {
      const tool = createImageGenerationTool(mockConfig as Config);
      expect(tool.parameters).toBeDefined();
    });
  });

  describe('Tool Execution', () => {
    it('should be callable as SDK tool', () => {
      const tool = createImageGenerationTool(mockConfig as Config);

      expect(tool.invoke).toBeDefined();
      expect(typeof tool.invoke).toBe('function');
    });

    it('should have SDK tool structure', () => {
      const tool = createImageGenerationTool(mockConfig as Config);

      expect(tool.type).toBe('function');
      expect(tool.name).toBe('generate_image');
      expect(tool.description).toBeDefined();
      expect(tool.parameters).toBeDefined();
    });
  });

  describe('Backward Compatibility', () => {
    it('should provide factory class for tool registry', () => {
      const toolClass = new ImageGenerationToolSDK(mockConfig as Config);

      expect(toolClass).toBeDefined();
      expect(ImageGenerationToolSDK.Name).toBe('generate_image');
    });

    it('should create tool via factory method', () => {
      const toolClass = new ImageGenerationToolSDK(mockConfig as Config);
      const tool = toolClass.createTool();

      expect(tool.name).toBe('generate_image');
      expect(tool.invoke).toBeDefined();
    });
  });

  describe('SDK Pattern Compliance', () => {
    it('should have invoke function (SDK pattern)', () => {
      const tool = createImageGenerationTool(mockConfig as Config);

      expect(typeof tool.invoke).toBe('function');
    });

    it('should match SDK tool structure', () => {
      const tool = createImageGenerationTool(mockConfig as Config);

      expect(tool.type).toBe('function');
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.parameters).toBeDefined();
      expect(tool.invoke).toBeDefined();
    });
  });
});
