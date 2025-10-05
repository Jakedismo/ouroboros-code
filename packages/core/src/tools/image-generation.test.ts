/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { Buffer } from 'node:buffer';
import { describe, it, expect } from 'vitest';
import { ImageGenerationTool } from './image-generation.js';
import type { Config } from '../config/config.js';

const mockConfig = {} as Config;

describe('ImageGenerationTool', () => {
  it('should expose a strict schema with prompt requirement', () => {
    const tool = new ImageGenerationTool(mockConfig);
    const schema = tool.schema;
    expect(schema.name).toBe(ImageGenerationTool.Name);
    expect(schema.parametersJsonSchema).toBeDefined();
    expect(schema.parametersJsonSchema?.['required']).toContain('prompt');
  });

  it('should generate inline SVG data for the provided prompt', async () => {
    const tool = new ImageGenerationTool(mockConfig);
    const invocation = tool.build({ prompt: 'Render a space nebula' });
    const result = await invocation.execute(new AbortController().signal);

    expect(result.llmContent).toEqual(
      expect.objectContaining({
        inlineData: expect.objectContaining({
          mimeType: 'image/svg+xml',
          data: expect.any(String),
        }),
      }),
    );
    expect(result.returnDisplay).toContain('Render a space nebula');
    expect(result.returnDisplay).toContain('Generated placeholder image');
  });

  it('clamps dimensions within expected bounds', async () => {
    const tool = new ImageGenerationTool(mockConfig);
    const invocation = tool.build({
      prompt: 'Tiny icon',
      height: 9999,
    });
    const result = await invocation.execute(new AbortController().signal);
    const inline = (result.llmContent as { inlineData: { data: string } }).inlineData;
    const svg = Buffer.from(inline.data, 'base64').toString('utf-8');
    expect(svg).toContain('width="1024"');
    expect(svg).toContain('height="2048"');
  });
});
