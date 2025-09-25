/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Content } from '@google/genai';

import { GeminiClient } from './client.js';
import type { Config } from '../config/config.js';
import type { ContentGenerator } from './contentGenerator.js';
import type { GeminiChat } from './geminiChat.js';
import { GeminiEventType, CompressionStatus } from './turn.js';

const mockTurnRunFn = vi.fn();

vi.mock('../agents/toolInjector.js', () => ({
  injectTools: vi.fn(),
}));

vi.mock('../agents/agentManager.js', () => {
  class MockAgentManager {
    static getInstance() {
      return new MockAgentManager();
    }
    getAgents() {
      return [];
    }
  }
  return { AgentManager: MockAgentManager };
});

vi.mock('./turn.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./turn.js')>();
  class MockTurn {
    pendingToolCalls = [];
    constructor() {}
    run = mockTurnRunFn;
  }
  return {
    ...actual,
    Turn: MockTurn,
  };
});

vi.mock('../utils/nextSpeakerChecker.js', () => ({
  checkNextSpeaker: vi.fn(),
}));

vi.mock('../telemetry/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../telemetry/index.js')>();
  return {
    ...actual,
  };
});

vi.mock('../telemetry/loggers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../telemetry/loggers.js')>();
  return {
    ...actual,
    logNextSpeakerCheck: vi.fn(),
  };
});

const createStubConfig = (): Config =>
  ({
    getProxy: () => undefined,
    getEmbeddingModel: () => 'embedding-model',
    getSessionId: () => 'session-id',
    getMaxSessionTurns: () => -1,
    getModel: () => 'gpt-5',
    getIdeMode: () => false,
    getChatCompression: () => undefined,
    getDebugMode: () => false,
    getProvider: () => 'openai',
    getContentGeneratorConfig: () => ({ authType: undefined, model: 'gpt-5' }),
    getToolRegistry: () => ({
      getFunctionDeclarations: () => [],
    }),
    getUserMemory: () => '',
    getUsageStatisticsEnabled: () => false,
    getApprovalMode: () => 'default',
    getAllowedTools: () => [],
    getExcludeTools: () => [],
    getCoreTools: () => [],
    getWorkspaceContext: () => ({}) as any,
    getPromptRegistry: () => ({}) as any,
    getToolDiscoveryCommand: () => undefined,
    getToolCallCommand: () => undefined,
    getSkipNextSpeakerCheck: () => false,
  } as unknown as Config);

const makeAsyncIterable = <T>(items: T[]) =>
  (async function* () {
    for (const item of items) {
      yield item;
    }
  })();

describe('GeminiClient telemetry integration', () => {
  let client: GeminiClient;
  let conversationHistory: Content[];

  beforeEach(() => {
    mockTurnRunFn.mockReset();
    const config = createStubConfig();
    client = new GeminiClient(config);

    conversationHistory = [
      { role: 'user', parts: [{ text: 'Hi' }] },
      { role: 'model', parts: [{ text: 'Hello!' }] },
    ];

    const mockChat = {
      addHistory: vi.fn((entry: Content) => {
        conversationHistory.push(entry);
      }),
      getHistory: vi.fn(() => conversationHistory),
    };

    const mockGenerator: Partial<ContentGenerator> = {
      countTokens: vi.fn().mockResolvedValue({ totalTokens: 0 }),
      generateContent: vi.fn(),
    };

    (client as any).chat = mockChat;
    (client as any).contentGenerator = mockGenerator;
    (client as any).loopDetector = {
      reset: vi.fn(),
      turnStarted: vi.fn().mockResolvedValue(false),
      addAndCheck: vi.fn().mockReturnValue(false),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits next speaker telemetry when a turn completes', async () => {
    const { checkNextSpeaker } = await import('../utils/nextSpeakerChecker.js');
    const mockCheckNextSpeaker = vi.mocked(checkNextSpeaker);
    mockCheckNextSpeaker.mockResolvedValue({
      reasoning: 'Waiting for the user.',
      next_speaker: 'user',
    });

    const telemetryLoggers = await import('../telemetry/loggers.js');
    const logNextSpeakerCheck = vi.mocked(telemetryLoggers.logNextSpeakerCheck);
    logNextSpeakerCheck.mockClear();

    mockTurnRunFn.mockReturnValue(
      makeAsyncIterable([
        { type: GeminiEventType.Content, value: 'Streamed text' },
        { type: GeminiEventType.Finished, value: 'STOP' as const },
      ]),
    );

    const stream = client.sendMessageStream(
      [{ text: 'Proceed' }],
      new AbortController().signal,
      'prompt-telemetry',
    );

    for await (const _ of stream) {
      // exhaust iterator
    }

    expect(mockCheckNextSpeaker).toHaveBeenCalledTimes(1);
    expect(logNextSpeakerCheck).toHaveBeenCalledTimes(1);
    const event = logNextSpeakerCheck.mock.calls[0][1];
    expect(event.prompt_id).toBe('prompt-telemetry');
    expect(event.result).toBe('user');
  });

  it('logs chat compression telemetry when compression succeeds', async () => {
    const telemetryLoggers = await import('../telemetry/loggers.js');
    const logChatCompression = vi
      .spyOn(telemetryLoggers, 'logChatCompression')
      .mockImplementation(() => {});

    const tokenLimits = await import('./tokenLimits.js');
    vi.spyOn(tokenLimits, 'tokenLimit').mockReturnValue(2000);

    const newChatHistory: Content[] = [
      { role: 'user', parts: [{ text: 'summary' }] },
      { role: 'model', parts: [{ text: 'acknowledged' }] },
    ];

    const newChat = {
      getHistory: vi.fn(() => newChatHistory),
      setHistory: vi.fn(),
      addHistory: vi.fn(),
    } as unknown as GeminiChat;

    const sendMessageMock = vi
      .fn()
      .mockResolvedValue({ text: 'summary' });

    const mockChat = {
      addHistory: vi.fn(),
      getHistory: vi.fn(() => conversationHistory),
      sendMessage: sendMessageMock,
      setHistory: vi.fn(),
    } as unknown as GeminiChat;

    const countTokensMock = vi
      .fn()
      .mockResolvedValueOnce({ totalTokens: 1200 })
      .mockResolvedValueOnce({ totalTokens: 600 });

    const mockGenerator = {
      countTokens: countTokensMock,
      generateContent: vi.fn(),
    } as unknown as ContentGenerator;

    const config = createStubConfig();
    vi.spyOn(config, 'getChatCompression').mockReturnValue({
      contextPercentageThreshold: 0.5,
    } as any);

    const compressionClient = new GeminiClient(config);
    (compressionClient as any).chat = mockChat;
    (compressionClient as any).contentGenerator = mockGenerator;
    (compressionClient as any).startChat = vi.fn().mockResolvedValue(newChat);
    (compressionClient as any).forceFullIdeContext = false;
    (compressionClient as any).hasFailedCompressionAttempt = false;

    const result = await (compressionClient as any).tryCompressChat(
      'prompt-compress',
      true,
    );

    expect(result.compressionStatus).toBe(CompressionStatus.COMPRESSED);
    expect(logChatCompression).toHaveBeenCalledTimes(1);
    const event = logChatCompression.mock.calls[0][1];
    expect(event.tokens_before).toBe(1200);
    expect(event.tokens_after).toBe(600);
  });
});
