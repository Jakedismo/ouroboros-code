// @ts-nocheck
/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { webSearchTool } from '@openai/agents';
import type { Config } from '../index.js';

const HOSTED_WEB_SEARCH_NAME = 'google_web_search';
const DEFAULT_SEARCH_CONTEXT_SIZE = 'medium' as const;

/**
 * Creates the SDK-native hosted web search tool.
 *
 * This leverages the OpenAI Agents SDK `webSearchTool()` helper, which wires the
 * agent up to OpenAI's managed web search capability. The hosted tool runs
 * remotely, so the CLI does not execute any local commands when the model calls
 * it.
 *
 * @param _config - Ouroboros configuration (reserved for future tuning).
 * @returns SDK HostedTool instance for web search.
 */
export function createHostedWebSearchTool(_config: Config) {
  return webSearchTool({
    name: HOSTED_WEB_SEARCH_NAME,
    searchContextSize: DEFAULT_SEARCH_CONTEXT_SIZE,
  });
}

/**
 * Factory class for backward compatibility with tool registry patterns.
 */
export class WebSearchToolSDK {
  static readonly Name = HOSTED_WEB_SEARCH_NAME;

  constructor(private readonly config: Config) {}

  /**
   * Creates the hosted tool instance.
   */
  createTool() {
    return createHostedWebSearchTool(this.config);
  }
}

export { HOSTED_WEB_SEARCH_NAME };
