/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { tool } from '@openai/agents';
import { z } from 'zod';
import { Buffer } from 'node:buffer';
import type { Config } from '../index.js';

/**
 * SDK-native image-generation tool for creating placeholder SVG images
 * Follows OpenAI Agents SDK best practices
 *
 * Gap #2: Tool Definition Patterns
 * - Uses SDK's tool() function instead of BaseDeclarativeTool
 * - Zod schema instead of manual JSON schema
 * - Simple string return instead of ToolResult
 * - Generates SVG placeholders with text
 */

const imageGenerationParametersSchema = z.object({
  prompt: z.string().describe(
    'Required: Text to display in the placeholder image (max 160 chars)'
  ),
  width: z.number().int().positive().nullable().optional().describe(
    'Optional: Image width in pixels (64-2048, default: 512)'
  ),
  height: z.number().int().positive().nullable().optional().describe(
    'Optional: Image height in pixels (64-2048, default: 512)'
  ),
  background_color: z.string().nullable().optional().describe(
    'Optional: Background color (hex or named, default: "#4A90E2")'
  ),
  text_color: z.string().nullable().optional().describe(
    'Optional: Text color (hex or named, default: "#FFFFFF")'
  ),
});

export type ImageGenerationParameters = z.infer<typeof imageGenerationParametersSchema>;

const MIN_DIMENSION = 64;
const MAX_DIMENSION = 2048;
const DEFAULT_DIMENSION = 512;
const DEFAULT_BACKGROUND = '#4A90E2';
const DEFAULT_TEXT_COLOR = '#FFFFFF';

/**
 * Clamps dimension values to valid range
 */
function clampDimension(value: number | null | undefined): number {
  if (!value || Number.isNaN(value)) {
    return DEFAULT_DIMENSION;
  }
  return Math.min(Math.max(Math.floor(value), MIN_DIMENSION), MAX_DIMENSION);
}

/**
 * Escapes XML special characters
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Builds SVG image with text
 */
function buildSvg(
  prompt: string,
  width: number,
  height: number,
  backgroundColor: string,
  textColor: string,
): string {
  const wrappedPrompt = escapeXml(prompt.length > 160 ? `${prompt.slice(0, 157)}…` : prompt);
  const fontSize = Math.max(12, Math.round(Math.min(width, height) / 16));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="placeholderGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${backgroundColor}" stop-opacity="0.92" />
      <stop offset="100%" stop-color="${backgroundColor}" stop-opacity="0.68" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#placeholderGradient)" rx="24" ry="24" />
  <g transform="translate(${width / 2}, ${height / 2})">
    <text fill="${textColor}" font-family="'Inter', 'Segoe UI', sans-serif" font-size="${fontSize}" text-anchor="middle" dominant-baseline="middle" opacity="0.92">
      ${wrappedPrompt}
    </text>
  </g>
</svg>`;
}

/**
 * Creates the SDK-native image-generation tool
 *
 * @param config - Ouroboros configuration
 * @returns SDK Tool instance for generating placeholder images
 */
export function createImageGenerationTool(config: Config) {
  const sdkTool = tool({
    name: 'generate_image',
    description:
      'Generates placeholder SVG images with customizable text and styling.\\n\\n' +
      '**Capabilities:**\\n' +
      '- Creates SVG placeholder images\\n' +
      '- Customizable dimensions (64-2048px)\\n' +
      '- Custom background and text colors\\n' +
      '- Gradient backgrounds with rounded corners\\n' +
      '- Text auto-sizing based on dimensions\\n' +
      '- Base64 encoded output\\n\\n' +
      '**Usage:**\\n' +
      '- Generates illustrative placeholders\\n' +
      '- Quick visual mockups\\n' +
      '- Text-based image previews\\n' +
      '- Diagrams and labels\\n\\n' +
      '**Parameters:**\\n' +
      '- prompt: Text to display (max 160 chars)\\n' +
      '- width/height: Dimensions in pixels\\n' +
      '- background_color: Hex or named color\\n' +
      '- text_color: Hex or named color\\n\\n' +
      '**Examples:**\\n' +
      '- Basic: { "prompt": "Hello World" }\\n' +
      '- Custom size: { "prompt": "Banner", "width": 1200, "height": 300 }\\n' +
      '- Styled: { "prompt": "Logo", "background_color": "#FF5733", "text_color": "#FFF" }',

    parameters: imageGenerationParametersSchema,

    async execute({
      prompt,
      width,
      height,
      background_color,
      text_color,
    }, signal?: AbortSignal) {
      try {
        // Clamp dimensions
        const finalWidth = clampDimension(width);
        const finalHeight = clampDimension(height);
        const finalBg = background_color || DEFAULT_BACKGROUND;
        const finalText = text_color || DEFAULT_TEXT_COLOR;

        // Build SVG
        const svg = buildSvg(prompt, finalWidth, finalHeight, finalBg, finalText);

        // Encode to base64
        const data = Buffer.from(svg, 'utf8').toString('base64');
        const dataUri = `data:image/svg+xml;base64,${data}`;

        // Return success message with preview link
        return `Successfully generated placeholder image (${finalWidth}×${finalHeight})\\n` +
          `Prompt: "${prompt}"\\n` +
          `Preview: ${dataUri}`;

      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error generating image: ${message}`;
      }
    },
  });

  return sdkTool;
}

/**
 * Factory class for backward compatibility with tool registry
 */
export class ImageGenerationToolSDK {
  static readonly Name = 'generate_image';

  constructor(private config: Config) {}

  /**
   * Creates the SDK-native tool instance
   */
  createTool() {
    return createImageGenerationTool(this.config);
  }
}
