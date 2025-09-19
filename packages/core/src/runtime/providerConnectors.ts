import type { Model, ModelProvider } from '@openai/agents';
import { OpenAIProvider } from '@openai/agents-openai';
import { AiSdkModel } from '@openai/agents-extensions';

export interface ProviderConnectorContext {
  resolveApiKey(): string | undefined;
  environment?: Record<string, string | undefined>;
}

export interface ProviderModelDescriptor {
  id: string;
  label: string;
  default?: boolean;
}

export interface ProviderConnector {
  id: string;
  displayName: string;
  models: ProviderModelDescriptor[];
  createModel(modelId: string, context: ProviderConnectorContext): Promise<Model>;
  supportsTools?: boolean;
  getModelProvider?(context: ProviderConnectorContext): Promise<ModelProvider>;
}

export class ProviderConnectorRegistry {
  private readonly connectors = new Map<string, ProviderConnector>();

  register(connector: ProviderConnector): void {
    this.connectors.set(connector.id, connector);
  }

  get(providerId: string): ProviderConnector | undefined {
    return this.connectors.get(providerId);
  }

  list(): ProviderConnector[] {
    return Array.from(this.connectors.values());
  }
}

export function createDefaultConnectorRegistry(): ProviderConnectorRegistry {
  const registry = new ProviderConnectorRegistry();
  registry.register(createOpenAIConnector());
  registry.register(createAnthropicConnector());
  registry.register(createGeminiConnector());
  return registry;
}

const DEFAULT_OPENAI_MODELS: ProviderModelDescriptor[] = [
  { id: 'gpt-5-codex', label: 'GPT-5 Codex', default: true },
  { id: 'gpt-5', label: 'GPT-5' },
];

function createOpenAIConnector(): ProviderConnector {
  return {
    id: 'openai',
    displayName: 'OpenAI',
    models: DEFAULT_OPENAI_MODELS,
    supportsTools: true,
    async createModel(modelId: string, context: ProviderConnectorContext): Promise<Model> {
      const provider = new OpenAIProvider({
        apiKey: context.resolveApiKey(),
      });
      return provider.getModel(modelId);
    },
    async getModelProvider(context: ProviderConnectorContext): Promise<ModelProvider> {
      return new OpenAIProvider({
        apiKey: context.resolveApiKey(),
      });
    },
  };
}

const DEFAULT_ANTHROPIC_MODELS: ProviderModelDescriptor[] = [
  { id: 'claude-sonnet-4-20250514[1m]', label: 'Claude Sonnet 4 (2025-05-14, 1m)', default: true },
  { id: 'claude-opus-4-1-20250805', label: 'Claude Opus 4.1 (2025-08-05)' },
];

function createAnthropicConnector(): ProviderConnector {
  return {
    id: 'anthropic',
    displayName: 'Anthropic Claude',
    models: DEFAULT_ANTHROPIC_MODELS,
    supportsTools: true,
    async createModel(modelId: string, context: ProviderConnectorContext): Promise<Model> {
      const languageModel = await createAnthropicLanguageModel(context, modelId);
      return new AiSdkModel(languageModel);
    },
    async getModelProvider(context: ProviderConnectorContext): Promise<ModelProvider> {
      return {
        getModel: async (modelName?: string) => {
          const targetModel = modelName || DEFAULT_ANTHROPIC_MODELS.find(m => m.default)?.id || DEFAULT_ANTHROPIC_MODELS[0].id;
          const languageModel = await createAnthropicLanguageModel(context, targetModel);
          return new AiSdkModel(languageModel);
        },
      };
    },
  };
}

const DEFAULT_GEMINI_MODELS: ProviderModelDescriptor[] = [
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', default: true },
];

function createGeminiConnector(): ProviderConnector {
  return {
    id: 'gemini',
    displayName: 'Google Gemini',
    models: DEFAULT_GEMINI_MODELS,
    supportsTools: true,
    async createModel(modelId: string, context: ProviderConnectorContext): Promise<Model> {
      const languageModel = await createGeminiLanguageModel(context, modelId);
      return new AiSdkModel(languageModel);
    },
    async getModelProvider(context: ProviderConnectorContext): Promise<ModelProvider> {
      return {
        getModel: async (modelName?: string) => {
          const targetModel = modelName || DEFAULT_GEMINI_MODELS.find(m => m.default)?.id || DEFAULT_GEMINI_MODELS[0].id;
          const languageModel = await createGeminiLanguageModel(context, targetModel);
          return new AiSdkModel(languageModel);
        },
      };
    },
  };
}

async function createAnthropicLanguageModel(
  context: ProviderConnectorContext,
  modelId: string,
): Promise<any> {
  const apiKey = context.resolveApiKey();
  if (!apiKey) {
    throw new Error('Anthropic API key is required. Set ANTHROPIC_API_KEY or configure the CLI option.');
  }

  const mod = await loadOptionalModule<typeof import('@ai-sdk/anthropic')>('@ai-sdk/anthropic', 'Anthropic Claude');
  const anthropicFactory = mod?.anthropic ?? (mod as unknown as { default?: any })?.default;

  if (typeof anthropicFactory !== 'function') {
    throw new Error('The @ai-sdk/anthropic package does not expose the expected `anthropic` factory.');
  }

  const providerInstance = await Promise.resolve(anthropicFactory({ apiKey }));
  const languageModel = await resolveLanguageModel(providerInstance, modelId);
  if (!languageModel) {
    throw new Error(`Unable to create Anthropic model for identifier "${modelId}".`);
  }
  return languageModel;
}

async function createGeminiLanguageModel(
  context: ProviderConnectorContext,
  modelId: string,
): Promise<any> {
  const apiKey = context.resolveApiKey();
  if (!apiKey) {
    throw new Error('Google Gemini API key is required. Set GEMINI_API_KEY or GOOGLE_API_KEY.');
  }

  const mod = await loadOptionalModule<typeof import('@ai-sdk/google')>('@ai-sdk/google', 'Google Gemini');
  const googleFactory = mod?.googleGenerativeAI ?? mod?.google ?? (mod as unknown as { default?: any })?.default;

  if (typeof googleFactory !== 'function') {
    throw new Error('The @ai-sdk/google package does not expose the expected `google` or `googleGenerativeAI` factory.');
  }

  const providerInstance = await Promise.resolve(googleFactory({ apiKey }));

  const prioritizedModelId = preferGeminiPrefix(modelId);
  let languageModel = await resolveLanguageModel(providerInstance, prioritizedModelId);

  if (!languageModel && prioritizedModelId !== modelId) {
    languageModel = await resolveLanguageModel(providerInstance, modelId);
  }

  if (!languageModel) {
    throw new Error(`Unable to create Gemini model for identifier "${modelId}".`);
  }
  return languageModel;
}

function preferGeminiPrefix(modelId: string): string {
  return modelId.startsWith('models/') ? modelId : `models/${modelId}`;
}

async function loadOptionalModule<T>(specifier: string, providerName: string): Promise<T> {
  try {
    return (await import(specifier)) as T;
  } catch (error: unknown) {
    if (isModuleNotFoundError(error, specifier)) {
      throw new Error(
        `${providerName} support requires optional dependency "${specifier}". Install it to enable this provider.`,
      );
    }
    throw error;
  }
}

function isModuleNotFoundError(error: unknown, specifier: string): boolean {
  if (!error) return false;
  const message = typeof error === 'object' && error !== null ? (error as { message?: string }).message : undefined;
  if (typeof message === 'string' && message.includes(specifier)) {
    return true;
  }
  // Node 20+ sets code property when module missing
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: string }).code;
    if (code === 'ERR_MODULE_NOT_FOUND') {
      return true;
    }
  }
  return false;
}

async function resolveLanguageModel(providerInstance: any, modelId: string): Promise<any> {
  if (!providerInstance) {
    return null;
  }

  if (typeof providerInstance === 'function') {
    try {
      const result = await Promise.resolve(providerInstance(modelId));
      if (result) {
        return result;
      }
    } catch (error) {
      if (!isUnsupportedModelError(error)) {
        throw error;
      }
    }
  }

  if (typeof providerInstance.languageModel === 'function') {
    const candidate = await Promise.resolve(providerInstance.languageModel(modelId));
    if (candidate) {
      return candidate;
    }
  }

  if (typeof providerInstance.chat === 'function') {
    const candidate = await Promise.resolve(providerInstance.chat(modelId));
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function isUnsupportedModelError(error: unknown): boolean {
  if (!error) return false;
  const message = typeof error === 'object' && error !== null ? (error as { message?: string }).message : undefined;
  return typeof message === 'string' && message.toLowerCase().includes('model');
}
