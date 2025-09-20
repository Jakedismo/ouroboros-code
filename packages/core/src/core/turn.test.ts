/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Turn, GeminiEventType } from './turn.js';
import type { GeminiChat } from './geminiChat.js';
import type { Config } from '../config/config.js';
import { reportError } from '../utils/errorReporting.js';

const mockCreateSession = vi.fn();
const mockStreamResponse = vi.fn();

vi.mock('../runtime/unifiedAgentsClient.js', () => ({
  UnifiedAgentsClient: vi
    .fn()
    .mockImplementation(() => ({
      createSession: mockCreateSession,
      streamResponse: mockStreamResponse,
    })),
}));

vi.mock('../utils/errorReporting.js', () => ({
  reportError: vi.fn(),
}));

function makeStream(events: Array<Record<string, unknown>>) {
  return (async function* () {
    for (const event of events) {
      yield event;
    }
  })();
}

describe('Turn (Unified Agents Runtime)', () => {
  let history: any[];
  let mockChat: GeminiChat & {
    addHistory: ReturnType<typeof vi.fn>;
    getHistory: ReturnType<typeof vi.fn>;
    maybeIncludeSchemaDepthContext: ReturnType<typeof vi.fn>;
  };
  let config: Config;
  let turn: Turn;

  beforeEach(() => {
    vi.clearAllMocks();
    history = [];
    mockChat = {
      addHistory: vi.fn((entry) => {
        history.push(entry);
      }),
      getHistory: vi.fn(() => history),
      maybeIncludeSchemaDepthContext: vi.fn(),
    } as unknown as GeminiChat & {
      addHistory: ReturnType<typeof vi.fn>;
      getHistory: ReturnType<typeof vi.fn>;
      maybeIncludeSchemaDepthContext: ReturnType<typeof vi.fn>;
    };

    config = {
      getProvider: vi.fn(() => 'openai'),
      getModel: vi.fn(() => 'gpt-5'),
      getSystemPrompt: vi.fn(() => 'You are helpful.'),
    } as unknown as Config;

    mockCreateSession.mockResolvedValue({
      id: 'session-1',
      providerId: 'openai',
      model: 'gpt-5',
    });

    turn = new Turn(mockChat, 'prompt-id-1', config);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('streams text deltas and final message', async () => {
    mockStreamResponse.mockReturnValue(
      makeStream([
        { type: 'text-delta', delta: 'Hello' },
        { type: 'text-delta', delta: ' world' },
        {
          type: 'final',
          message: { role: 'assistant', content: 'Hello world!' },
        },
      ]),
    );

    const events: unknown[] = [];
    const abortController = new AbortController();
    for await (const event of turn.run([{ text: 'Hi' }], abortController.signal)) {
      events.push(event);
    }

    expect(mockCreateSession).toHaveBeenCalledWith({
      providerId: 'openai',
      model: 'gpt-5',
      systemPrompt: 'You are helpful.',
    });

    expect(events).toEqual([
      { type: GeminiEventType.Content, value: 'Hello' },
      { type: GeminiEventType.Content, value: ' world' },
      { type: GeminiEventType.Content, value: 'Hello world!' },
      { type: GeminiEventType.Finished, value: 'STOP' },
    ]);
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ role: 'user', parts: [{ text: 'Hi' }] });
    expect(history[1]).toEqual({
      role: 'model',
      parts: [{ text: 'Hello world!' }],
    });
  });

  it('emits tool call requests from unified runtime events', async () => {
    mockStreamResponse.mockReturnValue(
      makeStream([
        {
          type: 'tool-call',
          toolCall: {
            id: 'call-123',
            name: 'run_command',
            arguments: { path: '/tmp', recursive: true },
          },
        },
        {
          type: 'final',
          message: { role: 'assistant', content: '' },
        },
      ]),
    );

    const events: unknown[] = [];
    for await (const event of turn.run([{ text: 'list files' }], new AbortController().signal)) {
      events.push(event);
    }

    expect(events[0]).toEqual({
      type: GeminiEventType.ToolCallRequest,
      value: {
        callId: 'call-123',
        name: 'run_command',
        args: { path: '/tmp', recursive: true },
        isClientInitiated: false,
        prompt_id: 'prompt-id-1',
      },
    });
    expect(events[1]).toEqual({
      type: GeminiEventType.Finished,
      value: 'STOP',
    });
    expect(turn.pendingToolCalls).toHaveLength(1);
  });

  it('returns error events coming from the stream', async () => {
    const streamError = new Error('runtime exploded');
    mockStreamResponse.mockReturnValue(
      makeStream([
        {
          type: 'error',
          error: streamError,
        },
      ]),
    );

    const events: unknown[] = [];
    for await (const event of turn.run([{ text: 'hi' }], new AbortController().signal)) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        type: GeminiEventType.Error,
        value: {
          error: { message: 'runtime exploded' },
        },
      },
    ]);
    expect(reportError).not.toHaveBeenCalled();
  });

  it('yields user_cancelled when abort signal triggers mid-stream', async () => {
    mockStreamResponse.mockReturnValue(
      makeStream([
        { type: 'text-delta', delta: 'First chunk' },
        { type: 'text-delta', delta: 'Second chunk' },
      ]),
    );

    const events: unknown[] = [];
    const abortController = new AbortController();
    let iteration = 0;
    for await (const event of turn.run([{ text: 'cancel please' }], abortController.signal)) {
      events.push(event);
      if (iteration === 0) {
        abortController.abort();
      }
      iteration += 1;
      if (iteration > 5) {
        break;
      }
    }

    expect(events).toEqual([
      { type: GeminiEventType.Content, value: 'First chunk' },
      { type: GeminiEventType.UserCancelled },
    ]);
  });

  it('wraps thrown errors from the unified client', async () => {
    const crash = new Error('send failed');
    mockStreamResponse.mockImplementation(() => {
      throw crash;
    });

    const events: unknown[] = [];
    for await (const event of turn.run([{ text: 'fail please' }], new AbortController().signal)) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        type: GeminiEventType.Error,
        value: {
          error: { message: 'send failed' },
        },
      },
    ]);
    expect(reportError).not.toHaveBeenCalled();
  });

  it('reports configuration errors when no config is supplied', async () => {
    const turnWithoutConfig = new Turn(mockChat, 'prompt-id-2');

    const events: unknown[] = [];
    for await (const event of turnWithoutConfig.run('hello', new AbortController().signal)) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        type: GeminiEventType.Error,
        value: {
          error: {
            message: 'Unified agents runtime requires configuration context',
          },
        },
      },
    ]);
  });
});
