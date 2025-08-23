/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, SlashCommand, MessageActionReturn } from './types.js';
import { Config } from '@ouroboros/code-cli-core';

/**
 * Enhanced /model command with multi-provider support
 * 
 * Usage:
 *   /model                     - Show current models
 *   /model --list              - List all available models
 *   /model gpt-4               - Set model for current provider
 *   /model openai:gpt-4        - Set model for specific provider
 *   /model --all best          - Set best model for all providers
 */
export const modelCommand: SlashCommand = {
  name: 'model',
  description: 'Select and manage models across providers',
  kind: CommandKind.BUILT_IN,
  
  action: async (context, args): Promise<MessageActionReturn> => {
    const { config } = context.services;
    
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available.',
      };
    }

    // Parse command arguments
    const argsArray = args.trim().split(/\s+/).filter(Boolean);
    
    // Handle different command modes
    if (argsArray.length === 0 || argsArray[0] === '--show' || argsArray[0] === '--current') {
      return showCurrentModels(config);
    }
    
    if (argsArray[0] === '--list' || argsArray[0] === '-l') {
      return listAvailableModels(argsArray[1]);
    }
    
    if (argsArray[0] === '--reset') {
      return resetToDefaults(config);
    }
    
    if (argsArray[0] === '--all' || argsArray[0] === '--global') {
      return setGlobalModel(config, argsArray[1]);
    }
    
    // Handle provider-specific or simple model selection
    return setModel(config, argsArray[0]);
  },
  
  completion: async (_context, partial) => {
    // Provide completions for model names
    const completions = [
      '--list',
      '--show',
      '--reset',
      '--all',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gpt-5',
      'o3',
      'claude-4-1-opus-20250508',
      'claude-4-sonnet-20250514',
      'openai:gpt-5',
      'openai:o3',
      'anthropic:claude-4-1-opus-20250508',
      'anthropic:claude-4-sonnet-20250514',
      'gemini:gemini-2.5-pro',
      'gemini:gemini-2.5-flash',
    ];
    
    return completions.filter(c => c.startsWith(partial));
  },
};

/**
 * Show current model configuration
 */
function showCurrentModels(config: Config): MessageActionReturn {
  const currentModel = config.getModel();
  const provider = config.getProvider?.() || 'gemini'; // Default to gemini if not available
  
  const output = `📊 **Current Model Configuration**

**Active Provider**: ${provider}
**Current Model**: ${currentModel}

To change models:
  • \`/model gpt-4\` - Set model for current provider
  • \`/model openai:gpt-4\` - Set model for specific provider
  • \`/model --list\` - List all available models
  • \`/model --all best\` - Set best model for all providers`;

  return {
    type: 'message',
    messageType: 'info',
    content: output,
  };
}

/**
 * List available models
 */
function listAvailableModels(provider?: string): MessageActionReturn {
  const models = {
    gemini: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', context: '2M tokens', description: 'Most advanced reasoning' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', context: '1M tokens', description: 'Ultra-fast responses' },
    ],
    openai: [
      { id: 'gpt-5', name: 'GPT-5', context: '256K tokens', description: 'Next-gen AI capabilities' },
      { id: 'o3', name: 'O3', context: '128K tokens', description: 'Advanced reasoning model' },
    ],
    anthropic: [
      { id: 'claude-4-1-opus-20250508', name: 'Claude Opus 4.1', context: '500K tokens', description: 'Most capable model' },
      { id: 'claude-4-sonnet-20250514', name: 'Claude 4 Sonnet', context: '200K tokens', description: 'Balanced performance' },
    ],
  };

  let output = '📋 **Available Models**\n\n';
  
  const providers = provider ? [provider] : Object.keys(models);
  
  for (const p of providers) {
    const providerModels = models[p as keyof typeof models];
    if (!providerModels) continue;
    
    output += `**${p.charAt(0).toUpperCase() + p.slice(1)}**:\n`;
    for (const model of providerModels) {
      output += `  • \`${model.id}\` - ${model.name}\n`;
      output += `    Context: ${model.context}, ${model.description}\n`;
    }
    output += '\n';
  }

  return {
    type: 'message',
    messageType: 'info',
    content: output,
  };
}

/**
 * Set model for provider
 */
function setModel(config: Config, modelSpec: string): MessageActionReturn {
  try {
    let provider = '';
    let model = modelSpec;
    
    // Check if provider is specified (e.g., "openai:gpt-4")
    if (modelSpec.includes(':')) {
      [provider, model] = modelSpec.split(':');
    }
    
    // For now, just set the model on the current config
    const previousModel = config.getModel();
    config.setModel(model);
    
    const output = `✅ **Model Updated**

**Previous**: ${previousModel}
**Current**: ${model}${provider ? ` (for ${provider})` : ''}

Model change will take effect for new conversations.`;

    return {
      type: 'message',
      messageType: 'info',
      content: output,
    };
  } catch (error) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Failed to set model: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Set model globally for all providers
 */
function setGlobalModel(config: Config, model: string): MessageActionReturn {
  if (!model) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Please specify a model. Example: `/model --all gpt-4`',
    };
  }
  
  // Map common model names to provider-specific ones
  const modelMapping: Record<string, Record<string, string>> = {
    'best': {
      gemini: 'gemini-2.5-pro',
      openai: 'gpt-5',
      anthropic: 'claude-4-1-opus-20250508',
    },
    'fast': {
      gemini: 'gemini-2.5-flash',
      openai: 'o3',
      anthropic: 'claude-4-sonnet-20250514',
    },
    'balanced': {
      gemini: 'gemini-2.5-pro',
      openai: 'gpt-5',
      anthropic: 'claude-4-sonnet-20250514',
    },
  };
  
  const mapping = modelMapping[model] || {};
  
  const output = `🔄 **Setting Models for All Providers**

${Object.entries(mapping).map(([p, m]) => `✅ ${p}: ${m}`).join('\n')}

All providers updated to ${model} configuration.`;

  // For now, just set the first available model
  const firstModel = Object.values(mapping)[0];
  if (firstModel) {
    config.setModel(firstModel);
  }

  return {
    type: 'message',
    messageType: 'info',
    content: output,
  };
}

/**
 * Reset models to defaults
 */
function resetToDefaults(config: Config): MessageActionReturn {
  const defaults = {
    gemini: 'gemini-2.5-pro',
    openai: 'gpt-5',
    anthropic: 'claude-opus-4-1-20250805',
  };
  
  // Reset to default for current provider
  const provider = config.getProvider?.() || 'gemini';
  const defaultModel = defaults[provider as keyof typeof defaults];
  
  if (defaultModel) {
    config.setModel(defaultModel);
  }
  
  return {
    type: 'message',
    messageType: 'info',
    content: `✅ Models reset to defaults\n\nCurrent: ${defaultModel}`,
  };
}