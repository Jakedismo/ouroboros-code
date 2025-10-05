/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { imageGenerationTool } from '@openai/agents';
import type { Config } from '../index.js';

/**
 * SDK-native image-generation tool using OpenAI's hosted image generation
 * Follows OpenAI Agents SDK best practices
 *
 * Gap #2: Tool Definition Patterns
 * - Uses SDK's imageGenerationTool() function (hosted tool)
 * - Delegates to OpenAI's DALL-E image generation service
 * - No custom implementation needed - SDK handles everything
 */

/**
 * Creates the SDK-native image-generation tool
 *
 * This uses the OpenAI Agents SDK's builtin imageGenerationTool() which
 * creates a hosted tool that delegates to OpenAI's image generation API.
 *
 * @param config - Ouroboros configuration (unused for hosted tool)
 * @returns SDK HostedTool instance for image generation
 *
 * @see https://openai.github.io/openai-agents-js/openai/agents/functions/imagegenerationtool/
 */
export function createImageGenerationTool(config: Config) {
  // Use SDK's builtin hosted image generation tool
  // This delegates to OpenAI's DALL-E service
  return imageGenerationTool();
}

/**
 * Factory class for backward compatibility with tool registry
 */
export class ImageGenerationToolSDK {
  static readonly Name = 'image_generation';

  constructor(private config: Config) {}

  /**
   * Creates the SDK-native hosted tool instance
   */
  createTool() {
    return createImageGenerationTool(this.config);
  }
}
