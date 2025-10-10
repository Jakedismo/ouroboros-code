// @ts-nocheck
/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createHostedWebSearchTool, WebSearchToolSDK, HOSTED_WEB_SEARCH_NAME } from './web-search-sdk.js';
import type { Config } from '../index.js';

describe('WebSearchTool (SDK Pattern - Hosted Tool)', () => {
  let mockConfig: Partial<Config>;

  beforeEach(() => {
    mockConfig = {} as any;
  });

  describe('SDK Tool Creation', () => {
    it('creates hosted tool with expected name', () => {
      const tool = createHostedWebSearchTool(mockConfig as Config);
      expect(tool.name).toBe(HOSTED_WEB_SEARCH_NAME);
    });

    it('creates hosted tool type', () => {
      const tool = createHostedWebSearchTool(mockConfig as Config);
      expect(tool.type).toBe('hosted_tool');
    });

    it('sets providerData for hosted execution', () => {
      const tool = createHostedWebSearchTool(mockConfig as Config);
      expect(tool).toHaveProperty('providerData');
      expect(tool.providerData?.type).toBe('web_search');
      expect(tool.providerData?.name).toBe(HOSTED_WEB_SEARCH_NAME);
    });
  });

  describe('Tool Structure', () => {
    it('matches hosted tool contract', () => {
      const tool = createHostedWebSearchTool(mockConfig as Config);
      expect(tool.type).toBe('hosted_tool');
      expect(tool.providerData).toMatchObject({
        type: 'web_search',
        name: HOSTED_WEB_SEARCH_NAME,
      });
    });
  });

  describe('Factory Wrapper', () => {
    it('exposes static Name', () => {
      expect(WebSearchToolSDK.Name).toBe(HOSTED_WEB_SEARCH_NAME);
    });

    it('creates hosted tool via factory', () => {
      const factory = new WebSearchToolSDK(mockConfig as Config);
      const tool = factory.createTool();
      expect(tool.name).toBe(HOSTED_WEB_SEARCH_NAME);
      expect(tool.type).toBe('hosted_tool');
    });
  });
});
