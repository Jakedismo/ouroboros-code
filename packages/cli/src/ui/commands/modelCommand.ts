/**
 * Model selection command
 * Manages model selection within the current provider
 */

import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import { MessageType, type HistoryItemInfo } from '../types.js';
import { appEvents, AppEvent } from '../../utils/events.js';

// Model configurations organized by provider
const MODEL_CONFIGS = {
  openai: {
    'gpt-5': {
      description: 'General-purpose GPT-5 with comprehensive reasoning',
      capabilities: ['reasoning', 'analysis', 'creative'],
      contextWindow: '2M tokens',
    },
    'gpt-5-codex': {
      description: 'Coding-optimized GPT-5 variant with extended reasoning depth',
      capabilities: ['reasoning', 'coding', 'analysis'],
      contextWindow: '2M tokens',
    },
  },
  anthropic: {
    'claude-sonnet-4-20250514[1m]': {
      description: 'Claude Sonnet 4 (May 2025, 1m) with expanded thinking budget',
      capabilities: ['reasoning', 'analysis', 'writing'],
      contextWindow: '1M tokens',
    },
    'claude-sonnet-4-20250514': {
      description: 'Claude Sonnet 4 (May 2025) balanced for everyday coding and docs',
      capabilities: ['reasoning', 'coding', 'analysis'],
      contextWindow: '1M tokens',
    },
    'claude-opus-4-1-20250805': {
      description: 'Claude Opus 4.1 (Aug 2025) for maximum depth and oversight',
      capabilities: ['reasoning', 'analysis', 'coding'],
      contextWindow: '2M tokens',
    },
  },
  gemini: {
    'gemini-2.5-pro': {
      description: 'Advanced Gemini model with multimodal capabilities',
      capabilities: ['multimodal', 'reasoning', 'coding'],
      contextWindow: '1M tokens',
    },
  },
} as const;

type ProviderType = keyof typeof MODEL_CONFIGS;

export const modelCommand: SlashCommand = {
  name: 'model',
  altNames: ['m'],
  kind: CommandKind.BUILT_IN,
  description: 'Switch model or show available models for current provider',
  action: async (context, args) => {
    const modelName = args?.trim();
    const currentProvider = getCurrentProvider(context);
    
    if (!currentProvider || !MODEL_CONFIGS[currentProvider as ProviderType]) {
      const errorItem: Omit<HistoryItemInfo, 'id'> = {
        type: MessageType.INFO,
        text: `❌ **Unknown Provider: ${currentProvider}**

Please use \`/provider\` to set a valid provider first.
Available providers: openai, anthropic, gemini`,
      };
      context.ui.addItem(errorItem, Date.now());
      return;
    }

    const providerModels = MODEL_CONFIGS[currentProvider as ProviderType];
    
    if (!modelName) {
      // Show available models for current provider
      const currentModel = getCurrentModel(context, currentProvider);
      const modelList = Object.entries(providerModels)
        .map(([model, config]) => {
          const indicator = model === currentModel ? '🟢' : '⚫';
          const capabilities = config.capabilities.join(', ');
          return `${indicator} **${model}**\n   ${config.description}\n   Capabilities: ${capabilities}\n   Context: ${config.contextWindow}`;
        })
        .join('\n\n');

      const infoItem: Omit<HistoryItemInfo, 'id'> = {
        type: MessageType.INFO,
        text: `🤖 **Model Management**

**Current Provider:** ${getProviderDisplayName(currentProvider)}
**Current Model:** ${currentModel || 'Default'}

**Available Models:**
${modelList}

**Usage:**
• \`/model ${Object.keys(providerModels)[0]}\` - Switch to specific model
• \`/provider\` - Change provider
• \`/model\` - Show this list

**Note:** Model changes take effect immediately for new messages.`,
      };
      context.ui.addItem(infoItem, Date.now());
      return;
    }

    // Validate model for current provider
    if (!providerModels[modelName as keyof typeof providerModels]) {
      const availableModels = Object.keys(providerModels).join(', ');
      const errorItem: Omit<HistoryItemInfo, 'id'> = {
        type: MessageType.INFO,
        text: `❌ **Invalid Model: ${modelName}**

Model "${modelName}" is not available for provider "${currentProvider}".

**Available models for ${getProviderDisplayName(currentProvider)}:**
${availableModels}

Use \`/model\` to see detailed information about each model.`,
      };
      context.ui.addItem(errorItem, Date.now());
      return;
    }

    // Switch model
    const modelConfig = providerModels[modelName as keyof typeof providerModels];
    await switchModel(context, currentProvider, modelName, modelConfig);
  },
};

function getConfig(context: any) {
  return context?.services?.config ?? context?.config ?? null;
}

function getCurrentProvider(context: any): string | null {
  const config = getConfig(context);
  if (config && typeof config.getProvider === 'function') {
    return config.getProvider();
  }
  if (config && typeof config.provider === 'string') {
    return config.provider;
  }
  return process.env['OUROBOROS_PROVIDER'] || 'gemini';
}

function getCurrentModel(context: any, provider: string): string | null {
  const config = getConfig(context);
  if (config && typeof config.getModel === 'function') {
    return config.getModel();
  }
  const providerDefaults = {
    openai: 'gpt-5',
    anthropic: 'claude-sonnet-4-20250514[1m]',
    gemini: 'gemini-2.5-pro',
  } as const;
  return providerDefaults[provider as keyof typeof providerDefaults] || null;
}

function getProviderDisplayName(provider: string): string {
  const displayNames = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    gemini: 'Google Gemini',
  } as const;
  
  return displayNames[provider as keyof typeof displayNames] || provider;
}

async function switchModel(context: any, provider: string, modelName: string, modelConfig: any) {
  try {
    const config = getConfig(context);
    if (config && typeof config.setModel === 'function') {
      await config.setModel(modelName);
      console.log(`[Model] Successfully switched to ${modelName} for provider ${provider}`);
    } else {
      console.warn('[Model] Config.setModel not available, model switch may not persist');
    }

    appEvents.emit(AppEvent.ProviderChanged, { provider, model: modelName });

    const successItem: Omit<HistoryItemInfo, 'id'> = {
      type: MessageType.INFO,
      text: `🔄 **Model Switched**

**Provider:** ${getProviderDisplayName(provider)}
**New Model:** ${modelName}
**Description:** ${modelConfig.description}
**Capabilities:** ${modelConfig.capabilities.join(', ')}
**Context Window:** ${modelConfig.contextWindow}

**✅ Active Now:** All new messages will use ${modelName}

**Tip:** Use \`/model\` to switch models anytime, or \`/provider\` to change providers.`,
    };
    context.ui.addItem(successItem, Date.now());
  } catch (error) {
    const errorItem: Omit<HistoryItemInfo, 'id'> = {
      type: MessageType.INFO,
      text: `❌ **Failed to Switch Model**

Error: ${error instanceof Error ? error.message : String(error)}

The model selection was not applied. Please try again or check your configuration.`,
    };
    context.ui.addItem(errorItem, Date.now());
    console.error(`[Model] Failed to switch to ${modelName}:`, error);
  }
}
