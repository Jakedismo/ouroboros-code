import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ToolRegistry } from '../packages/core/src/tools/tool-registry.js';
import {
  DeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
} from '../packages/core/src/tools/tools.js';

vi.mock('@openai/agents', () => {
  class Agent {
    tools: any[];
    constructor(config: any) {
      Object.assign(this, config);
      this.tools = config.tools || [];
    }
  }

  class Runner {
    async run(agent: any) {
      const tool = agent.tools[0];
      const toolOutput = await tool.invoke({}, { arguments: JSON.stringify({ message: 'tool response' }) });
      const events = [
        {
          type: 'run_item_stream_event',
          name: 'message_output_created',
          item: {
            toJSON() {
              return {
                rawItem: {
                  content: [
                    {
                      type: 'output_text',
                      text: toolOutput,
                    },
                  ],
                },
              };
            },
          },
        },
      ];

      async function* iterator() {
        for (const event of events) {
          yield event;
        }
      }

      return {
        [Symbol.asyncIterator]: iterator,
        completed: Promise.resolve(),
        output: [{ text: toolOutput }],
        finalOutput: toolOutput,
      };
    }
  }

  function tool(config: any) {
    return {
      ...config,
      invoke: config.execute,
    };
  }

  function user(content: string) {
    return { role: 'user', content };
  }

  function system(content: string) {
    return { role: 'system', content };
  }

  function assistant(content: string) {
    return { role: 'assistant', content };
  }

  return { Agent, Runner, tool, user, system, assistant };
});

vi.mock('../packages/core/src/core/nonInteractiveToolExecutor.js', () => {
  return {
    executeToolCall: vi.fn(async (_config: unknown, request: { args: Record<string, unknown> }) => {
      const message = typeof request.args.message === 'string' ? request.args.message : '';
      return {
        responseParts: [{ text: message }],
        resultDisplay: message,
        error: undefined,
        errorType: undefined,
      };
    }),
  };
});

afterEach(() => {
  vi.resetModules();
});

class EchoTool extends DeclarativeTool<{ message: string }, ToolResult> {
  constructor(private readonly log: string[]) {
    super(
      'echo_tool',
      'Echo Tool',
      'Echoes the provided message',
      Kind.Other,
      {
        type: 'object',
        properties: {
          message: { type: 'string' },
        },
        required: ['message'],
      },
    );
  }

  build(params: { message: string }) {
    const message = params?.message;
    if (typeof message !== 'string' || message.length === 0) {
      throw new Error('message is required');
    }

    this.log.push(message);

    return new (class EchoInvocation extends BaseToolInvocation<{ message: string }, ToolResult> {
      async execute(): Promise<ToolResult> {
        return {
          llmContent: this.params.message,
          returnDisplay: this.params.message,
        };
      }

      getDescription(): string {
        return `Echo message: ${this.params.message}`;
      }
    })({ message });
  }
}

describe('Unified Agents runtime tool execution', () => {
  it('executes ToolRegistry tools via Agents SDK bridge', async () => {
    const registry: ToolRegistry = {
      getAllTools: () => [new EchoTool([])],
    } as unknown as ToolRegistry;

    const connector = {
      id: 'openai',
      displayName: 'Mock OpenAI',
      models: [{ id: 'mock-model', label: 'Mock Model', default: true }],
      supportsTools: true,
      async createModel(modelId: string) {
        return { id: modelId } as any;
      },
      async getModelProvider() {
        return {
          getModel: async () => ({ id: 'mock-model' } as any),
        };
      },
    };

    const connectorRegistry = {
      get(providerId: string) {
        return providerId === 'openai' ? connector : undefined;
      },
      register() {
        throw new Error('not implemented');
      },
      list() {
        return [connector];
      },
    };

    const config = {
      getToolRegistry: () => registry,
      getProvider: () => 'openai',
      getProviderApiKey: () => 'test-key',
      getSystemPrompt: () => '',
      getSessionId: () => 'session-1',
    };

    const { executeToolCall } = await import('../packages/core/src/core/nonInteractiveToolExecutor.js');
    const executeMock = vi.mocked(executeToolCall);

    const { UnifiedAgentsClient } = await import('../packages/core/src/runtime/unifiedAgentsClient.js');

    const client = new UnifiedAgentsClient(config as any, {
      connectorRegistry: connectorRegistry as any,
    });

    const session = await client.createSession({ providerId: 'openai', model: 'mock-model' });

    const events: any[] = [];

    for await (const event of client.streamResponse(session, [
      { role: 'user', content: 'Test request' },
    ])) {
      events.push(event);
    }

    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(executeMock.mock.calls[0][1]?.args).toMatchObject({ message: 'tool response' });
    const finalEvent = events.find(event => event.type === 'final');
    expect(finalEvent?.message?.content).toContain('tool response');
  });
});
