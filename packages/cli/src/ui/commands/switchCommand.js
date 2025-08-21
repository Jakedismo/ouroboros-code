/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { CommandKind } from './types.js';
/**
 * /switch command - Switch between LLM providers
 *
 * This command allows you to switch the active provider for your session.
 * Also available as /provider.
 *
 * Usage:
 *   /switch                  - Show current provider
 *   /switch openai           - Switch to OpenAI
 *   /switch anthropic        - Switch to Anthropic
 *   /switch gemini           - Switch to Gemini
 *   /provider --list         - List all providers with status
 */
export const switchCommand = {
    name: 'switch',
    altNames: ['provider'],
    description: 'Switch between LLM providers',
    kind: CommandKind.BUILT_IN,
    action: async (context, args) => {
        const { config } = context.services;
        if (!config) {
            return {
                type: 'message',
                messageType: 'error',
                content: 'Configuration not available.',
            };
        }
        const argsArray = args.trim().split(/\s+/).filter(Boolean);
        // Show current provider if no args
        if (argsArray.length === 0) {
            return showCurrentProvider(config);
        }
        // List all providers
        if (argsArray[0] === '--list' || argsArray[0] === '-l') {
            return listProviders();
        }
        // Switch to specified provider
        return switchToProvider(config, argsArray[0]);
    },
    completion: async (_context, partial) => {
        const completions = [
            'gemini',
            'openai',
            'anthropic',
            '--list',
        ];
        return completions.filter(c => c.startsWith(partial));
    },
};
/**
 * Show current provider information
 */
function showCurrentProvider(config) {
    const provider = config.getProvider?.() || 'gemini';
    const model = config.getModel();
    const providerInfo = {
        gemini: {
            name: 'Google Gemini',
            icon: '🔷',
            description: 'Advanced reasoning, 1M token context, multimodal support',
        },
        openai: {
            name: 'OpenAI',
            icon: '🟢',
            description: 'GPT models, strong coding, creative writing',
        },
        anthropic: {
            name: 'Anthropic Claude',
            icon: '🟣',
            description: 'Constitutional AI, 200K context, nuanced reasoning',
        },
    };
    const info = providerInfo[provider] || { name: provider, icon: '❓', description: 'Unknown provider' };
    return {
        type: 'message',
        messageType: 'info',
        content: `${info.icon} **Current Provider: ${info.name}**

**Active Model**: ${model}
**Features**: ${info.description}

To switch providers:
• \`/switch openai\` - Switch to OpenAI
• \`/switch anthropic\` - Switch to Anthropic  
• \`/switch gemini\` - Switch to Gemini
• \`/switch --list\` - Show all providers`,
    };
}
/**
 * List all available providers
 */
function listProviders() {
    return {
        type: 'message',
        messageType: 'info',
        content: `📋 **Available LLM Providers**

🔷 **Gemini** (Google)
  • Models: gemini-2.5-pro, gemini-2.5-flash
  • Strengths: Multimodal, 2M token context, ultra-fast
  • Best for: General tasks, long documents, images
  • Status: ✅ Available

🟢 **OpenAI**
  • Models: gpt-5, o3
  • Strengths: Next-gen AI, advanced reasoning
  • Best for: Complex tasks, code generation, analysis
  • Status: ${hasOpenAIKey() ? '✅ Configured' : '⚠️ Needs API key'}

🟣 **Anthropic** (Claude)
  • Models: claude-opus-4-1-20250805, claude-4-sonnet-20250514
  • Strengths: Constitutional AI, nuanced reasoning
  • Best for: Writing, analysis, ethical considerations
  • Status: ${hasAnthropicKey() ? '✅ Configured' : '⚠️ Needs API key'}

**Quick Switch:**
• \`/switch gemini\` - Google's Gemini
• \`/switch openai\` - OpenAI GPT
• \`/switch anthropic\` - Anthropic Claude

**Configuration:**
${!hasOpenAIKey() ? '• Set OPENAI_API_KEY environment variable for OpenAI\n' : ''}${!hasAnthropicKey() ? '• Set ANTHROPIC_API_KEY environment variable for Anthropic' : ''}`,
    };
}
/**
 * Switch to a different provider
 */
function switchToProvider(config, provider) {
    const normalizedProvider = provider.toLowerCase();
    // Validate provider
    const validProviders = ['gemini', 'openai', 'anthropic'];
    if (!validProviders.includes(normalizedProvider)) {
        return {
            type: 'message',
            messageType: 'error',
            content: `Invalid provider: ${provider}. Valid options: gemini, openai, anthropic`,
        };
    }
    // Check API key availability
    if (normalizedProvider === 'openai' && !hasOpenAIKey()) {
        return {
            type: 'message',
            messageType: 'error',
            content: `OpenAI requires an API key. Please set the OPENAI_API_KEY environment variable.`,
        };
    }
    if (normalizedProvider === 'anthropic' && !hasAnthropicKey()) {
        return {
            type: 'message',
            messageType: 'error',
            content: `Anthropic requires an API key. Please set the ANTHROPIC_API_KEY environment variable.`,
        };
    }
    // Get provider details
    const providerDetails = {
        gemini: { icon: '🔷', name: 'Google Gemini', defaultModel: 'gemini-2.5-pro' },
        openai: { icon: '🟢', name: 'OpenAI', defaultModel: 'gpt-5' },
        anthropic: { icon: '🟣', name: 'Anthropic Claude', defaultModel: 'claude-opus-4-1-20250805' },
    };
    const details = providerDetails[normalizedProvider];
    // Actually switch the provider
    config.setProvider(normalizedProvider);
    config.setModel(details.defaultModel);
    return {
        type: 'message',
        messageType: 'info',
        content: `${details.icon} **Switched to ${details.name}**

**Default Model**: ${details.defaultModel}
**Status**: Active

Provider will be used for new conversations.
Use \`/model\` to change the model for this provider.`,
    };
}
/**
 * Check if OpenAI API key is configured
 */
function hasOpenAIKey() {
    return !!process.env.OPENAI_API_KEY;
}
/**
 * Check if Anthropic API key is configured
 */
function hasAnthropicKey() {
    return !!process.env.ANTHROPIC_API_KEY;
}
//# sourceMappingURL=switchCommand.js.map