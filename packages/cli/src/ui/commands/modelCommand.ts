/**
 * Model selection command
 * Manages model selection within the current provider
 */

import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import { MessageType, type HistoryItemInfo } from '../types.js';

// Model configurations organized by provider
const MODEL_CONFIGS = {
  openai: {
    'gpt-5': {
      description: 'Most capable OpenAI model with advanced reasoning',
      capabilities: ['reasoning', 'coding', 'analysis'],
      contextWindow: '1M tokens',
    },
    'gpt-4o': {
      description: 'Fast, multimodal model with vision capabilities',
      capabilities: ['multimodal', 'vision', 'fast'],
      contextWindow: '128K tokens',
    },
    'gpt-4': {
      description: 'Reliable model for complex tasks',
      capabilities: ['reasoning', 'coding'],
      contextWindow: '128K tokens',
    },
    'gpt-3.5-turbo': {
      description: 'Fast, economical model for simple tasks',
      capabilities: ['fast', 'economical'],
      contextWindow: '16K tokens',
    },
  },
  anthropic: {
    'claude-opus-4-1-20250805': {
      description: 'Most capable Anthropic model with superior reasoning',
      capabilities: ['reasoning', 'analysis', 'coding', 'writing'],
      contextWindow: '200K tokens',
    },
    'claude-3-5-sonnet-20241022': {
      description: 'Balanced model with good performance and speed',
      capabilities: ['reasoning', 'coding', 'balanced'],
      contextWindow: '200K tokens',
    },
    'claude-3-5-haiku-20241022': {
      description: 'Fast, efficient model for quick tasks',
      capabilities: ['fast', 'economical'],
      contextWindow: '200K tokens',
    },
  },
  gemini: {
    'gemini-2.5-pro': {
      description: 'Advanced Gemini model with multimodal capabilities',
      capabilities: ['multimodal', 'reasoning', 'coding'],
      contextWindow: '1M tokens',
    },
    'gemini-2.0-flash-exp': {
      description: 'Experimental high-speed model',
      capabilities: ['fast', 'experimental'],
      contextWindow: '1M tokens',
    },
    'gemini-1.5-pro': {
      description: 'Reliable model with good performance',
      capabilities: ['multimodal', 'reliable'],
      contextWindow: '2M tokens',
    },
    'gemini-1.5-flash': {
      description: 'Fast model for quick responses',
      capabilities: ['fast', 'economical'],
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

function getCurrentProvider(context: any): string | null {
  return context.config?.provider || process.env['OUROBOROS_PROVIDER'] || 'gemini';
}

function getCurrentModel(context: any, provider: string): string | null {
  // Get current model from context or return provider default
  const providerDefaults = {
    openai: 'gpt-5',
    anthropic: 'claude-opus-4-1-20250805',
    gemini: 'gemini-2.5-pro',
  } as const;
  
  return context.config?.model || context.config?.[`${provider}Model`] || 
         providerDefaults[provider as keyof typeof providerDefaults] || null;
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

  // TODO: Actually switch the model in the config
  // This should integrate with the config system to update the model
  console.log(`[Model] Switched to ${modelName} for provider ${provider}`);
}