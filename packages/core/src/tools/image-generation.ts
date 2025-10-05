/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { Buffer } from 'node:buffer';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import type { ToolInvocation, ToolResult } from './tools.js';
import type { Config } from '../config/config.js';

export interface ImageGenerationParams {
  prompt: string;
  width?: number;
  height?: number;
  backgroundColor?: string;
  textColor?: string;
}

const MIN_DIMENSION = 64;
const MAX_DIMENSION = 2048;

function clampDimension(value: number | undefined, fallback: number): number {
  if (!value || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.floor(value), MIN_DIMENSION), MAX_DIMENSION);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSvg(params: Required<ImageGenerationParams>): string {
  const { prompt, width, height, backgroundColor, textColor } = params;
  const wrappedPrompt = escapeXml(prompt.length > 160 ? `${prompt.slice(0, 157)}…` : prompt);
  const fontSize = Math.max(12, Math.round(Math.min(width, height) / 16));

  return `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n`
    + `  <defs>\n`
    + `    <linearGradient id="placeholderGradient" x1="0%" y1="0%" x2="100%" y2="100%">\n`
    + `      <stop offset="0%" stop-color="${backgroundColor}" stop-opacity="0.92" />\n`
    + `      <stop offset="100%" stop-color="${backgroundColor}" stop-opacity="0.68" />\n`
    + `    </linearGradient>\n`
    + `  </defs>\n`
    + `  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#placeholderGradient)" rx="24" ry="24" />\n`
    + `  <g transform="translate(${width / 2}, ${height / 2})">\n`
    + `    <text fill="${textColor}" font-family="'Inter', 'Segoe UI', sans-serif" font-size="${fontSize}" text-anchor="middle" dominant-baseline="middle" opacity="0.92">\n`
    + `      ${wrappedPrompt}\n`
    + `    </text>\n`
    + `  </g>\n`
    + `</svg>`;
}

class ImageGenerationInvocation extends BaseToolInvocation<
  Required<ImageGenerationParams>,
  ToolResult
> {
  constructor(params: Required<ImageGenerationParams>) {
    super(params);
  }

  getDescription(): string {
    return `Generate illustrative SVG (${this.params.width}×${this.params.height}) for prompt: ${this.params.prompt}`;
  }

  async execute(
    _signal: AbortSignal,
    _updateOutput?: (output: string) => void,
  ): Promise<ToolResult> {
    const svg = buildSvg(this.params);
    const data = Buffer.from(svg, 'utf8').toString('base64');
    const dataUri = `data:image/svg+xml;base64,${data}`;

    const summaryLines = [
      `Generated placeholder image (${this.params.width}×${this.params.height}).`,
      `Prompt: ${this.params.prompt}`,
      `Preview: ${dataUri}`,
    ];

    return {
      llmContent: {
        inlineData: {
          mimeType: 'image/svg+xml',
          data,
        },
      },
      returnDisplay: summaryLines.join('\n'),
    };
  }
}

export class ImageGenerationTool extends BaseDeclarativeTool<
  ImageGenerationParams,
  ToolResult
> {
  static Name = 'generate_image';

  constructor(_config: Config) {
    super(
      ImageGenerationTool.Name,
      'Image Generator',
      'Generates a simple SVG placeholder image that encodes the requested prompt. '
        + 'Use this to scaffold visual assets during early design iterations.',
      Kind.Other,
      {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Concise visual description of the desired asset.',
          },
          width: {
            type: 'integer',
            description: 'Optional width of the generated image in pixels.',
            minimum: MIN_DIMENSION,
          },
          height: {
            type: 'integer',
            description: 'Optional height of the generated image in pixels.',
            minimum: MIN_DIMENSION,
          },
          backgroundColor: {
            type: 'string',
            description: 'Hex or CSS color name for the background gradient.',
          },
          textColor: {
            type: 'string',
            description: 'Hex or CSS color used for the overlaid prompt text.',
          },
        },
        required: ['prompt'],
      },
      false,
      false,
    );
  }

  protected override validateToolParamValues(
    params: ImageGenerationParams,
  ): string | null {
    if (!params.prompt || params.prompt.trim().length === 0) {
      return 'Prompt is required to generate an image.';
    }
    return null;
  }

  protected createInvocation(
    params: ImageGenerationParams,
  ): ToolInvocation<Required<ImageGenerationParams>, ToolResult> {
    const width = clampDimension(params.width, 1024);
    const height = clampDimension(params.height, width);
    const normalized: Required<ImageGenerationParams> = {
      prompt: params.prompt.trim(),
      width,
      height,
      backgroundColor: params.backgroundColor ?? '#1f2937',
      textColor: params.textColor ?? '#f9fafb',
    };
    return new ImageGenerationInvocation(normalized);
  }
}
