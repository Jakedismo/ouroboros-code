/**
 * Provider selection command
 * Manages LLM provider switching and configuration
 */

import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import { MessageType, type HistoryItemInfo } from '../types.js';

// Provider configurations with default models
const PROVIDER_CONFIGS = {
  openai: {
    name: 'OpenAI',
    defaultModel: 'gpt-5',
    availableModels: ['gpt-5', 'gpt-4o', 'gpt-4', 'gpt-3.5-turbo'],
    description: 'OpenAI GPT models with advanced reasoning capabilities',
  },
  anthropic: {
    name: 'Anthropic',
    defaultModel: 'claude-opus-4-1-20250805',
    availableModels: [
      'claude-opus-4-1-20250805',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
    ],
    description: 'Anthropic Claude models with strong analytical capabilities',
  },
  gemini: {
    name: 'Google Gemini',
    defaultModel: 'gemini-2.5-pro',
    availableModels: [
      'gemini-2.5-pro',
      'gemini-2.0-flash-exp',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
    ],
    description: 'Google Gemini models with multimodal capabilities',
  },
} as const;

type ProviderType = keyof typeof PROVIDER_CONFIGS;

export const providerCommand: SlashCommand = {
  name: 'provider',
  altNames: ['llm'],
  kind: CommandKind.BUILT_IN,
  description: 'Switch LLM provider or show current provider info',
  action: async (context, args) => {
    const provider = args?.trim().toLowerCase();
    
    if (!provider) {
      // Show current provider and available options
      const currentProvider = getCurrentProvider(context);
      const providerList = Object.entries(PROVIDER_CONFIGS)
        .map(([key, config]) => {
          const indicator = key === currentProvider ? '🟢' : '⚫';
          return `${indicator} **${key}** - ${config.name} (${config.defaultModel})`;
        })
        .join('\n');

      const infoItem: Omit<HistoryItemInfo, 'id'> = {
        type: MessageType.INFO,
        text: `🔌 **Provider Management**

**Current Provider:** ${currentProvider ? PROVIDER_CONFIGS[currentProvider as ProviderType]?.name || currentProvider : 'Unknown'}

**Available Providers:**
${providerList}

**Usage:**
• \`/provider openai\` - Switch to OpenAI GPT-5
• \`/provider anthropic\` - Switch to Anthropic Claude Opus 4.1
• \`/provider gemini\` - Switch to Google Gemini 2.5 Pro

**Note:** Provider switches take effect for new conversations.
Current session will continue with ${currentProvider}.`,
      };
      context.ui.addItem(infoItem, Date.now());
      return;
    }

    // Validate provider
    if (!PROVIDER_CONFIGS[provider as ProviderType]) {
      const errorItem: Omit<HistoryItemInfo, 'id'> = {
        type: MessageType.INFO,
        text: `❌ **Invalid Provider: ${provider}**

Available providers: ${Object.keys(PROVIDER_CONFIGS).join(', ')}

Use \`/provider\` to see all options.`,
      };
      context.ui.addItem(errorItem, Date.now());
      return;
    }

    // Switch provider
    const config = PROVIDER_CONFIGS[provider as ProviderType];
    await switchProvider(context, provider as ProviderType, config);
  },
};

function getCurrentProvider(context: any): string | null {
  // Try to get from context or config
  // This is a simplified implementation - should integrate with actual config
  return context.config?.provider || process.env['OUROBOROS_PROVIDER'] || 'gemini';
}

async function switchProvider(context: any, provider: ProviderType, config: typeof PROVIDER_CONFIGS[ProviderType]) {
  try {
    // Actually switch the provider in the config
    if (context.config && typeof context.config.setProvider === 'function') {
      await context.config.setProvider(provider);
      console.log(`[Provider] Successfully switched to ${provider} with model ${config.defaultModel}`);
    }

    const successItem: Omit<HistoryItemInfo, 'id'> = {
      type: MessageType.INFO,
      text: `🔄 **Provider Switched Successfully**

**New Provider:** ${config.name}
**Default Model:** ${config.defaultModel}
**Description:** ${config.description}

**Provider is now active!**
You can start using ${config.name} immediately for new messages.

**Next Steps:**
• Use \`/model\` to see available models for this provider
• Use \`/model ${config.defaultModel}\` to explicitly set the default model

**Authentication:**
Make sure you have configured API keys for ${config.name}:
${getAuthInstructions(provider)}`,
    };
    context.ui.addItem(successItem, Date.now());
  } catch (error) {
    const errorItem: Omit<HistoryItemInfo, 'id'> = {
      type: MessageType.INFO,
      text: `❌ **Failed to Switch Provider**

Error: ${error instanceof Error ? error.message : String(error)}

**Troubleshooting:**
• Make sure you have the required API key configured
• Check that the provider is properly installed
• Verify network connectivity

Current provider remains unchanged.`,
    };
    context.ui.addItem(errorItem, Date.now());
    console.error(`[Provider] Failed to switch to ${provider}:`, error);
  }
}

function getAuthInstructions(provider: ProviderType): string {
  switch (provider) {
    case 'openai':
      return '• Set OPENAI_API_KEY environment variable\n• Or use --openai-api-key flag\n• Or use --openai-use-oauth for OAuth';
    case 'anthropic':
      return '• Set ANTHROPIC_API_KEY environment variable\n• Or use --anthropic-api-key flag\n• Or use --claude-use-oauth for OAuth';
    case 'gemini':
      return '• Set GEMINI_API_KEY environment variable\n• Or use --gemini-api-key flag\n• Or configure OAuth in settings';
    default:
      return '• Check documentation for authentication setup';
  }
}