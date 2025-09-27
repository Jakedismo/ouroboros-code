/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  Content,
  GenerateContentConfig,
  GenerateContentResponse,
  SendMessageParameters,
  Tool,
} from '../runtime/genaiCompat.js';
import { GeminiChat } from './geminiChat.js';
import type { AgentsClient } from './agentsClient.js';
import type { Config } from '../config/config.js';

const createMockResponse = (text: string): GenerateContentResponse => ({
  candidates: [
    {
      content: {
        role: 'model',
        parts: [{ text }],
      },
      index: 0,
    },
  ],
});

describe('GeminiChat (AgentsClient wrapper)', () => {
  let agentsClient: AgentsClient;
  let sendMessage: ReturnType<typeof vi.fn>;
  let sendMessageStream: ReturnType<typeof vi.fn>;
  let addHistory: ReturnType<typeof vi.fn>;
  let setHistory: ReturnType<typeof vi.fn>;
  let setTools: ReturnType<typeof vi.fn>;
  let resetChat: ReturnType<typeof vi.fn>;
  let getHistory: ReturnType<typeof vi.fn>;
  let getCuratedHistory: ReturnType<typeof vi.fn>;
  let config: Config;

  const baseGenerationConfig: GenerateContentConfig = {
    temperature: 0.2,
  };

  beforeEach(() => {
    sendMessage = vi.fn().mockResolvedValue(createMockResponse('hi'));
    sendMessageStream = vi.fn();
    addHistory = vi.fn();
    setHistory = vi.fn();
    setTools = vi.fn();
    resetChat = vi.fn();
    getHistory = vi.fn().mockReturnValue([] as Content[]);
    getCuratedHistory = vi.fn().mockReturnValue([] as Content[]);

    agentsClient = {
      sendMessage,
      sendMessageStream,
      addHistory,
      setHistory,
      setTools,
      resetChat,
      getHistory,
      getCuratedHistory,
    } as unknown as AgentsClient;

    config = {
      getToolRegistry: () => ({
        getAllTools: () => [
          {
            displayName: 'cyclic tool',
            schema: {
              parametersJsonSchema: {
                type: 'object',
                properties: {
                  foo: { $ref: '#/$defs/foo' },
                },
                $defs: {
                  foo: {
                    type: 'object',
                    properties: {
                      bar: { $ref: '#/$defs/foo' },
                    },
                  },
                },
              },
            },
          },
        ],
      }),
    } as unknown as Config;
  });

  it('forwards sendMessage to AgentsClient with merged config', async () => {
    const chat = new GeminiChat(config, agentsClient, baseGenerationConfig);
    const params: SendMessageParameters = {
      message: [{ text: 'hello' }],
      config: { topP: 0.5 },
    };

    await chat.sendMessage(params, 'prompt-1');

    expect(sendMessage).toHaveBeenCalledWith(
      {
        message: params.message,
        config: { temperature: 0.2, topP: 0.5 },
      },
      'prompt-1',
    );
  });

  it('returns curated history when requested', () => {
    const curatedHistory: Content[] = [
      { role: 'user', parts: [{ text: 'hi' }] },
      { role: 'model', parts: [{ text: 'valid' }] },
    ];
    getCuratedHistory.mockReturnValue(curatedHistory);
    const chat = new GeminiChat(config, agentsClient, baseGenerationConfig);

    const curated = chat.getHistory(true);

    expect(curated).toEqual(curatedHistory);
  });

  it('annotates schema depth errors with cyclic tooling information', async () => {
    const chat = new GeminiChat(config, agentsClient, baseGenerationConfig);
    const error = { message: 'Schema depth exceeded' };

    await chat.maybeIncludeSchemaDepthContext(error);

    expect(error.message).toContain('cyclic tool');
  });

  it('passes tool declarations to the AgentsClient', () => {
    const chat = new GeminiChat(config, agentsClient, baseGenerationConfig);
    const tools: Tool[] = [{ functionDeclarations: [] }];

    chat.setTools(tools);

    expect(setTools).toHaveBeenCalledWith(tools);
  });
});
