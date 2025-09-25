import { describe, it, expect, vi, afterEach } from 'vitest';

type StubConfigOptions = {
  provider?: 'openai' | 'anthropic' | 'gemini';
  apiKey?: string;
  systemPrompt?: string;
};

function createStubConfig({
  provider = 'openai',
  apiKey,
  systemPrompt = '',
}: StubConfigOptions = {}) {
  return {
    getProvider() {
      return provider;
    },
    getProviderApiKey() {
      return apiKey;
    },
    getSystemPrompt() {
      return systemPrompt;
    },
    getToolRegistry() {
      return {
        getAllTools() {
          return [];
        },
      };
    },
    getSessionId() {
      return 'test-session';
    },
  } as const;
}

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
});

describe('Agents SDK optional connectors', () => {
  it('throws helpful error when Anthropic package is missing', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const { UnifiedAgentsClient } = await import('../packages/core/src/runtime/unifiedAgentsClient.js');
    const { createDefaultConnectorRegistry } = await import('../packages/core/src/runtime/providerConnectors.js');

    const client = new UnifiedAgentsClient(createStubConfig(), {
      connectorRegistry: createDefaultConnectorRegistry(),
    });

    await expect(
      client.createSession({ providerId: 'anthropic', model: 'claude-4.1' }),
    ).rejects.toThrow(/requires optional dependency/);
  });

  it('creates Anthropic session when package is available', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    vi.doMock('@openai/agents-extensions', () => ({
      AiSdkModel: class MockAiSdkModel {
        constructor(public readonly underlying: unknown) {}
      },
    }));

    vi.doMock(
      '@ai-sdk/anthropic',
      () => ({
        anthropic: (options: unknown) => ({
          languageModel: (modelId: string) => ({ provider: 'anthropic', modelId, options }),
        }),
        default: (options: unknown) => ({
          languageModel: (modelId: string) => ({ provider: 'anthropic', modelId, options }),
        }),
      }),
      { virtual: true },
    );

    const { UnifiedAgentsClient } = await import('../packages/core/src/runtime/unifiedAgentsClient.js');
    const { createDefaultConnectorRegistry } = await import('../packages/core/src/runtime/providerConnectors.js');

    const client = new UnifiedAgentsClient(createStubConfig(), {
      connectorRegistry: createDefaultConnectorRegistry(),
    });

    const session = await client.createSession({ providerId: 'anthropic', model: 'claude-4.1' });

    expect(session.providerId).toBe('anthropic');
    expect(session.modelHandle).toBeTruthy();
    expect(session.modelProvider).toBeTruthy();
  });

  it('throws helpful error when Gemini package is missing', async () => {
    process.env.GEMINI_API_KEY = 'test-key';

    const { UnifiedAgentsClient } = await import('../packages/core/src/runtime/unifiedAgentsClient.js');
    const { createDefaultConnectorRegistry } = await import('../packages/core/src/runtime/providerConnectors.js');

    const client = new UnifiedAgentsClient(createStubConfig(), {
      connectorRegistry: createDefaultConnectorRegistry(),
    });

    await expect(
      client.createSession({ providerId: 'gemini', model: 'gemini-2.5-pro' }),
    ).rejects.toThrow(/requires optional dependency/);
  });

  it('creates Gemini session when package is available', async () => {
    process.env.GEMINI_API_KEY = 'test-key';

    vi.doMock('@openai/agents-extensions', () => ({
      AiSdkModel: class MockAiSdkModel {
        constructor(public readonly underlying: unknown) {}
      },
    }));

    vi.doMock(
      '@ai-sdk/google',
      () => ({
        googleGenerativeAI: (options: unknown) => ({
          languageModel: (modelId: string) => ({ provider: 'gemini', modelId, options }),
        }),
        google: (options: unknown) => ({
          languageModel: (modelId: string) => ({ provider: 'gemini', modelId, options }),
        }),
        default: (options: unknown) => ({
          languageModel: (modelId: string) => ({ provider: 'gemini', modelId, options }),
        }),
      }),
      { virtual: true },
    );

    const { UnifiedAgentsClient } = await import('../packages/core/src/runtime/unifiedAgentsClient.js');
    const { createDefaultConnectorRegistry } = await import('../packages/core/src/runtime/providerConnectors.js');

    const client = new UnifiedAgentsClient(createStubConfig(), {
      connectorRegistry: createDefaultConnectorRegistry(),
    });

    const session = await client.createSession({ providerId: 'gemini', model: 'gemini-2.5-pro' });

    expect(session.providerId).toBe('gemini');
    expect(session.modelHandle).toBeTruthy();
    expect(session.modelProvider).toBeTruthy();
  });
});
