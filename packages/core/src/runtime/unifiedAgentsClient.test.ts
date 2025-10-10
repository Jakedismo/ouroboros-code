// @ts-nocheck
/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

vi.mock('../config/config.js', () => ({
  ApprovalMode: {
    DEFAULT: 'default',
    AUTO_EDIT: 'autoEdit',
    YOLO: 'yolo',
  },
}));

import { UnifiedAgentsClient } from './unifiedAgentsClient.js';
import type { Config } from '../config/config.js';
import { ApprovalMode } from '../config/config.js';
import type { ProviderConnectorRegistry } from './providerConnectors.js';

const approveSpy = vi.fn();
const rejectSpy = vi.fn();
const runnerCtorSpy = vi.fn();
const agentCtorSpy = vi.fn();

vi.mock('@openai/agents', () => {
  class RunnerMock {
    constructor(options: unknown) {
      runnerCtorSpy(options);
    }
    async run() {
      const approvalItem = { rawItem: { name: 'read_file', callId: 'call-123' } };
      const toolCallItem = {
        rawItem: {
          type: 'function_call',
          name: 'read_file',
          callId: 'call-123',
          arguments: '{"path":"/tmp"}',
        },
      };
      const messageItem = {
        rawItem: {
          status: 'completed',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'final text' }],
        },
      };

      return {
        state: {
          approve: approveSpy,
          reject: rejectSpy,
        },
        history: [
          { role: 'user', content: 'list files' },
          { role: 'assistant', content: 'final text' },
        ],
        completed: Promise.resolve(),
        async *[Symbol.asyncIterator]() {
          yield {
            type: 'run_item_stream_event',
            name: 'tool_approval_requested',
            item: approvalItem,
          };
          yield {
            type: 'run_item_stream_event',
            name: 'tool_called',
            item: toolCallItem,
          };
          yield {
            type: 'run_item_stream_event',
            name: 'message_output_created',
            item: messageItem,
          };
        },
      };
    }
  }

  class AgentMock {
    constructor(options: unknown) {
      agentCtorSpy(options);
    }
  }

  return {
    Runner: RunnerMock,
    Agent: AgentMock,
    assistant: (content: string) => ({ role: 'assistant', content }),
    system: (content: string) => ({ role: 'system', content }),
    user: (content: string) => ({ role: 'user', content }),
  };
});

describe('UnifiedAgentsClient tool approval handling', () => {
  beforeEach(() => {
    approveSpy.mockClear();
    rejectSpy.mockClear();
    runnerCtorSpy.mockClear();
    agentCtorSpy.mockClear();
  });

  it('defers approval until the host explicitly confirms the call', async () => {
    const config = {
      getToolRegistry: () => ({
        getAllTools: () => [],
      }),
      getWorkspaceContext: () => ({ getDirectories: () => ['/repo'] }),
      getTargetDir: () => '/repo',
      getProvider: () => 'openai',
      getProviderApiKey: () => 'test-key',
      getSessionId: () => 'session-123',
      getApprovalMode: () => ApprovalMode.DEFAULT,
      isToolEnabled: () => false,
    } as unknown as Config;

    const connectorRegistry = {
      get: () => ({
        id: 'openai',
        displayName: 'OpenAI',
        models: [],
        async createModel() {
          return {} as unknown;
        },
        async getModelProvider() {
          return {
            getModel: async () => ({} as unknown),
          };
        },
      }),
    } as unknown as ProviderConnectorRegistry;

    const client = new UnifiedAgentsClient(config, { connectorRegistry });
    const session = await client.createSession({
      providerId: 'openai',
      model: 'gpt-5',
    });

    const generator = client.streamResponse(session, [
      { role: 'user', content: 'list files' },
    ]);

    const first = await generator.next();
    expect(first.value).toMatchObject({
      type: 'tool-approval',
      approval: expect.objectContaining({ callId: 'call-123', name: 'read_file' }),
    });
    expect(approveSpy).not.toHaveBeenCalled();

    client.approveToolCall('call-123');
    expect(approveSpy).toHaveBeenCalledTimes(1);

    const second = await generator.next();
    const third = await generator.next();
    const fourth = await generator.next();
    const completion = await generator.next();

    expect(second.value).toMatchObject({
      type: 'tool-call',
      toolCall: expect.objectContaining({ id: 'call-123' }),
    });
    expect(third.value).toMatchObject({
      type: 'text-delta',
      delta: 'final text',
    });
    expect(fourth.value).toMatchObject({
      type: 'final',
      message: expect.objectContaining({ content: 'final text' }),
    });
    expect(completion.done).toBe(true);
  });

  it('auto-approves tool interruption events in YOLO mode', async () => {
    const config = {
      getToolRegistry: () => ({
        getAllTools: () => [],
      }),
      getWorkspaceContext: () => ({ getDirectories: () => ['/repo'] }),
      getTargetDir: () => '/repo',
      getProvider: () => 'openai',
      getProviderApiKey: () => 'test-key',
      getSessionId: () => 'session-123',
      getApprovalMode: () => ApprovalMode.YOLO,
      isToolEnabled: () => false,
    } as unknown as Config;

    const connectorRegistry = {
      get: () => ({
        id: 'openai',
        displayName: 'OpenAI',
        models: [],
        async createModel() {
          return {} as unknown;
        },
        async getModelProvider() {
          return {
            getModel: async () => ({} as unknown),
          };
        },
      }),
    } as unknown as ProviderConnectorRegistry;

    const client = new UnifiedAgentsClient(config, { connectorRegistry });
    const session = await client.createSession({
      providerId: 'openai',
      model: 'gpt-5',
    });

    const events: unknown[] = [];
    for await (const event of client.streamResponse(session, [
      { role: 'user', content: 'list files' },
    ])) {
      events.push(event);
    }

    expect(approveSpy).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      expect.objectContaining({
        type: 'tool-call',
        toolCall: expect.objectContaining({ id: 'call-123' }),
      }),
      expect.objectContaining({ type: 'text-delta', delta: 'final text' }),
      expect.objectContaining({
        type: 'final',
        message: expect.objectContaining({ content: 'final text' }),
      }),
    ]);
  });

  it('rejects pending tool calls when the host declines approval', async () => {
    const config = {
      getToolRegistry: () => ({ getAllTools: () => [] }),
      getWorkspaceContext: () => ({ getDirectories: () => ['/repo'] }),
      getTargetDir: () => '/repo',
      getProvider: () => 'openai',
      getProviderApiKey: () => 'test-key',
      getSessionId: () => 'session-123',
      getApprovalMode: () => ApprovalMode.DEFAULT,
      isToolEnabled: () => false,
    } as unknown as Config;

    const connectorRegistry = {
      get: () => ({
        id: 'openai',
        displayName: 'OpenAI',
        models: [],
        async createModel() {
          return {} as unknown;
        },
        async getModelProvider() {
          return {
            getModel: async () => ({} as unknown),
          };
        },
      }),
    } as unknown as ProviderConnectorRegistry;

    const client = new UnifiedAgentsClient(config, { connectorRegistry });
    const session = await client.createSession({ providerId: 'openai', model: 'gpt-5' });

    const generator = client.streamResponse(session, [
      { role: 'user', content: 'list files' },
    ]);

    await generator.next();
    client.rejectToolCall('call-123');
    expect(rejectSpy).toHaveBeenCalledTimes(1);

    await generator.next();
    await generator.next();
    await generator.next();
  });
});

describe('UnifiedAgentsClient Agent/Runner caching', () => {
  const baseConfig: Partial<Config> = {
    getToolRegistry: () => ({
      getAllTools: () => [],
    }),
    getWorkspaceContext: () => ({ getDirectories: () => ['/repo'] }),
    getTargetDir: () => '/repo',
    getProvider: () => 'openai',
    getProviderApiKey: () => 'test-key',
    getSessionId: () => 'session-123',
    getApprovalMode: () => ApprovalMode.DEFAULT,
    isToolEnabled: () => false,
  };

  const connectorRegistry: ProviderConnectorRegistry = {
    get: () => ({
      id: 'openai',
      displayName: 'OpenAI',
      models: [],
      async createModel() {
        return {} as unknown;
      },
      async getModelProvider() {
        return {
          getModel: async () => ({} as unknown),
        };
      },
    }),
  } as unknown as ProviderConnectorRegistry;

  it('reuses Agent and Runner instances for sequential turns with same options', async () => {
    agentCtorSpy.mockClear();
    runnerCtorSpy.mockClear();
    const client = new UnifiedAgentsClient(baseConfig as Config, { connectorRegistry });
    const session = await client.createSession({
      providerId: 'openai',
      model: 'gpt-5',
    });

    const consumeTurn = async () => {
      for await (const event of client.streamResponse(session, [
        { role: 'user', content: 'list files again' },
      ])) {
        if (event.type === 'tool-approval') {
          client.approveToolCall(event.approval.callId);
        }
      }
    };

    await consumeTurn();
    await consumeTurn();

    expect(agentCtorSpy).toHaveBeenCalledTimes(1);
    expect(runnerCtorSpy).toHaveBeenCalledTimes(1);
  });

  it('passes structured output schemas to agent outputType', async () => {
    agentCtorSpy.mockClear();
    runnerCtorSpy.mockClear();
    const client = new UnifiedAgentsClient(baseConfig as Config, { connectorRegistry });
    const session = await client.createSession({ providerId: 'openai', model: 'gpt-5' });

    const schema = z.object({ foo: z.string() });
    const iterator = client.streamResponse(
      session,
      [{ role: 'user', content: 'list files' }],
      {
        structuredOutput: {
          schema,
          schemaSignature: 'schema:v1',
          mimeType: 'application/json',
        },
      },
    );

    const first = await iterator.next();
    expect(first.value).toMatchObject({ type: 'tool-approval' });
    client.approveToolCall('call-123');

    for await (const _event of iterator) {
      // consume generator
    }

    expect(agentCtorSpy).toHaveBeenCalled();
    const agentOptions = agentCtorSpy.mock.calls[0][0];
    expect(agentOptions.outputType).toBe(schema);
  });
});
