import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { ToolRegistry } from '../packages/core/src/tools/tool-registry.js';
import { createDefaultConnectorRegistry } from '../packages/core/src/runtime/providerConnectors.js';
import { UnifiedAgentsClient } from '../packages/core/src/runtime/unifiedAgentsClient.js';

const RUN_MATRIX = process.env.RUN_CONNECTOR_MATRIX === 'true';
const RUN_TOOL_LOOP = process.env.RUN_CONNECTOR_TOOL_LOOP === 'true';

const PROVIDERS = [
  {
    id: 'openai',
    model: 'gpt-5',
    apiKeyEnv: 'OPENAI_API_KEY',
  },
  {
    id: 'anthropic',
    model: 'claude-3.5-sonnet',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    optionalModules: ['@ai-sdk/anthropic'],
  },
  {
    id: 'gemini',
    model: 'gemini-2.5-flash',
    apiKeyEnv: 'GEMINI_API_KEY',
    optionalModules: ['@ai-sdk/google'],
  },
] as const;

type ProviderConfig = (typeof PROVIDERS)[number];

type StubConfig = {
  getToolRegistry(): ToolRegistry;
  getProvider(): string;
  getProviderApiKey(): string | undefined;
  getSystemPrompt(): string;
  getSessionId(): string;
};

const createStubConfig = (providerId: string, apiKey?: string): StubConfig => ({
  getToolRegistry: () => ({ getAllTools: () => [] }) as unknown as ToolRegistry,
  getProvider: () => providerId,
  getProviderApiKey: () => apiKey,
  getSystemPrompt: () => 'You are a helpful assistant.',
  getSessionId: () => `session-${Date.now()}`,
});

const haveOptionalModules = async (modules: string[] | undefined) => {
  if (!modules) return true;
  for (const name of modules) {
    try {
      await import(name);
    } catch (error) {
      if (error instanceof Error && /module|cannot find/i.test(error.message)) {
        return false;
      }
      throw error;
    }
  }
  return true;
};

const runProviderSmokeTest = async (provider: ProviderConfig, apiKey: string) => {
  const config = createStubConfig(provider.id, apiKey);
  const registry = createDefaultConnectorRegistry();
  const client = new UnifiedAgentsClient(config as any, {
    connectorRegistry: registry,
  });

  const session = await client.createSession({
    providerId: provider.id,
    model: provider.model,
    systemPrompt: config.getSystemPrompt(),
  });

  const events: string[] = [];
  for await (const event of client.streamResponse(session, [
    { role: 'user', content: 'Say hello in one short sentence.' },
  ])) {
    if (event.type === 'text-delta' && event.delta) {
      events.push(event.delta);
    }
    if (event.type === 'final') {
      events.push(event.message.content ?? '');
    }
  }

  const fullText = events.join(' ').trim();
  expect(fullText.length).toBeGreaterThan(0);
  expect(/hello/i.test(fullText)).toBe(true);
};

class EchoToolRegistry implements ToolRegistry {
  constructor(private readonly providerId: string) {}

  getAllTools() {
    return [new EchoTool(this.providerId)];
  }

  getTool() {
    return undefined as any;
  }

  getFunctionDeclarations() {
    return [
      {
        name: 'echo_tool',
        description: 'Echo the provided message back to the assistant.',
        parameters: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
          required: ['message'],
        },
      },
    ];
  }

  registerTool(): void {}
  getToolByName() {
    return undefined as any;
  }
  getToolByDisplayName() {
    return undefined as any;
  }
  getTools() {
    return [];
  }
  discoverTools(): Promise<void> {
    return Promise.resolve();
  }
  getToolsByServer() {
    return [];
  }
}

class EchoTool {
  readonly name = 'echo_tool';
  readonly description = 'Echo the provided message back to the assistant.';
  readonly displayName = 'Echo Tool';
  readonly schema = {
    type: 'object',
    properties: {
      message: { type: 'string' },
    },
    required: ['message'],
  };

  constructor(private readonly providerId: string) {}

  build(params: { message: string }) {
    const output = `Provider ${this.providerId} echo: ${params.message}`;
    return {
      async execute() {
        return {
          llmContent: output,
          returnDisplay: output,
        };
      },
      async shouldConfirmExecute() {
        return false;
      },
    };
  }
}

const runToolLoop = async (provider: ProviderConfig, apiKey: string) => {
  const config = {
    ...createStubConfig(provider.id, apiKey),
    getToolRegistry: () => new EchoToolRegistry(provider.id) as unknown as ToolRegistry,
  };

  const registry = createDefaultConnectorRegistry();
  const client = new UnifiedAgentsClient(config as any, {
    connectorRegistry: registry,
  });

  const session = await client.createSession({
    providerId: provider.id,
    model: provider.model,
    systemPrompt:
      'You must use the provided function `echo_tool` exactly once before responding. Call the function with the arguments specified by the user, wait for the tool result, then summarise it for the user.',
  });

  const conversation = [
    {
      role: 'user' as const,
      content: `Call echo_tool with the message "hello from ${provider.id}" then acknowledge the result.`,
    },
  ];

  const seenToolCalls = new Set<string>();

  while (true) {
    let pendingToolCall: { id: string; name: string; args: any } | null = null;
    let finalMessage: string | null = null;

    for await (const event of client.streamResponse(session, conversation)) {
      if (event.type === 'tool-call') {
        pendingToolCall = {
          id: event.toolCall.id,
          name: event.toolCall.name,
          args: event.toolCall.arguments,
        };
      }
      if (event.type === 'final') {
        finalMessage = event.message.content ?? '';
      }
    }

    if (pendingToolCall) {
      if (seenToolCalls.has(pendingToolCall.id)) {
        throw new Error('Tool call repeated unexpectedly.');
      }
      seenToolCalls.add(pendingToolCall.id);

      const argumentMessage = pendingToolCall.args?.message ?? '';
      const toolResult = {
        result: `Provider ${provider.id} echo: ${argumentMessage}`,
      };
      const toolResponse = JSON.stringify(toolResult);

      conversation.push({
        role: 'tool',
        content: toolResponse,
        toolCallId: pendingToolCall.id,
        name: pendingToolCall.name,
      } as const);
      continue;
    }

    if (finalMessage !== null) {
      expect(seenToolCalls.size).toBeGreaterThan(0);
      expect(finalMessage.length).toBeGreaterThan(0);
      expect(finalMessage).toContain('Provider');
      expect(finalMessage).toContain('echo');
      break;
    }

    break;
  }
};

const PROVIDER_CONTEXT = await Promise.all(
  PROVIDERS.map(async (provider) => {
    const apiKey = process.env[provider.apiKeyEnv];
    const modulesAvailable = await haveOptionalModules(provider.optionalModules);
    return {
      provider,
      apiKey,
      modulesAvailable,
    };
  }),
);

const matrixDescribe = RUN_MATRIX ? describe : describe.skip;

matrixDescribe('Unified Agents provider matrix (live smoke tests)', () => {
  beforeAll(() => {
    vi.setConfig({ testTimeout: 60000 });
  });

  for (const ctx of PROVIDER_CONTEXT) {
    const { provider, apiKey, modulesAvailable } = ctx;
    const shouldRun = Boolean(apiKey) && modulesAvailable;
    const testFn = shouldRun ? it : it.skip;

    testFn(`${provider.id} responds to a simple prompt`, async () => {
      if (!shouldRun) {
        console.log(
          `Skipping ${provider.id} smoke test (key present: ${Boolean(apiKey)}, modules available: ${modulesAvailable}).`,
        );
        return;
      }

      await runProviderSmokeTest(provider, apiKey!);
    });
  }
});

const toolLoopDescribe = RUN_MATRIX && RUN_TOOL_LOOP ? describe : describe.skip;

toolLoopDescribe('Unified Agents provider tool loop (live)', () => {
  beforeAll(() => {
    vi.setConfig({ testTimeout: 60000 });
  });

  for (const ctx of PROVIDER_CONTEXT) {
    const { provider, apiKey, modulesAvailable } = ctx;
    const shouldRun = Boolean(apiKey) && modulesAvailable;
    const testFn = shouldRun ? it : it.skip;

    testFn(`${provider.id} executes echo_tool via Agents SDK`, async () => {
      if (!shouldRun) {
        console.log(
          `Skipping tool loop for ${provider.id} (key present: ${Boolean(apiKey)}, modules available: ${modulesAvailable}).`,
        );
        return;
      }

      await runToolLoop(provider, apiKey!);
    });
  }
});
