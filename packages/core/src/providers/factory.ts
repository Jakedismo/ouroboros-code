import { OpenAIProvider } from './openai/index.js';
import { AnthropicProvider } from './anthropic/index.js';
import { GeminiProvider } from './gemini/index.js';
import type { Provider, ProviderOptions, ProviderFactory } from './types.js';

export class LLMProviderFactory implements ProviderFactory {
  private static instance: LLMProviderFactory;
  private providers: Map<string, Provider> = new Map();
  
  private constructor() {}
  
  static getInstance(): LLMProviderFactory {
    if (!LLMProviderFactory.instance) {
      LLMProviderFactory.instance = new LLMProviderFactory();
    }
    return LLMProviderFactory.instance;
  }
  
  createProvider(type: 'openai' | 'anthropic' | 'gemini', options?: ProviderOptions): Provider {
    const key = `${type}-${JSON.stringify(options || {})}`;
    
    if (this.providers.has(key)) {
      return this.providers.get(key)!;
    }
    
    let provider: Provider;
    
    switch (type) {
      case 'openai':
        provider = new OpenAIProvider(options);
        break;
      case 'anthropic':
        provider = new AnthropicProvider(options);
        break;
      case 'gemini':
        provider = new GeminiProvider(options);
        break;
      default:
        throw new Error(`Unknown provider type: ${type}`);
    }
    
    this.providers.set(key, provider);
    return provider;
  }
  
  clearCache(): void {
    this.providers.clear();
  }
}

// Convenience function for creating providers
export function createProvider(type: 'openai' | 'anthropic' | 'gemini', options?: ProviderOptions): Provider {
  return LLMProviderFactory.getInstance().createProvider(type, options);
}

// Export types
export type { Provider, ProviderOptions, Message, StreamingResponse, ToolCall } from './types.js';