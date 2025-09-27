/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Content,
  GenerateContentConfig,
  GenerateContentResponse,
  SendMessageParameters,
  Tool,
} from '../runtime/genaiCompat.js';
import type { Config } from '../config/config.js';
import type { AgentsClient } from './agentsClient.js';
import { maybeAnnotateSchemaDepthContext } from './turn.js';
import type { StructuredError } from './turn.js';

/**
 * Compatibility wrapper that proxies the legacy Gemini chat interface to the
 * provider-agnostic {@link AgentsClient} implementation.
 */
export class GeminiChat {
  constructor(
    private readonly config: Config,
    private readonly agentsClient: AgentsClient,
    private readonly generationConfig: GenerateContentConfig = {},
  ) {}

  async sendMessage(
    params: SendMessageParameters,
    promptId: string,
  ): Promise<GenerateContentResponse> {
    const mergedConfig: GenerateContentConfig = {
      ...this.generationConfig,
      ...(params.config ?? {}),
    };

    return this.agentsClient.sendMessage(
      {
        message: params.message,
        config: mergedConfig,
      },
      promptId,
    );
  }

  async sendMessageStream(
    params: SendMessageParameters,
    promptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const mergedConfig: GenerateContentConfig = {
      ...this.generationConfig,
      ...(params.config ?? {}),
    };

    return this.agentsClient.sendMessageStream(
      {
        message: params.message,
        config: mergedConfig,
      },
      promptId,
    );
  }

  addHistory(content: Content): void {
    void this.agentsClient.addHistory(content);
  }

  setHistory(history: Content[]): void {
    this.agentsClient.setHistory(history);
  }

  clearHistory(): void {
    void this.agentsClient.resetChat();
  }

  getHistory(curated = false): Content[] {
    if (curated) {
      return this.agentsClient.getCuratedHistory();
    }
    return this.agentsClient.getHistory();
  }

  setTools(tools: Tool[]): void {
    void this.agentsClient.setTools(tools);
  }

  async maybeIncludeSchemaDepthContext(error: StructuredError): Promise<void> {
    maybeAnnotateSchemaDepthContext(this.config, error);
  }


  getConversationClient(): AgentsClient {
    return this.agentsClient;
  }

  getConfig(): Config {
    return this.config;
  }

}
