#!/usr/bin/env node

import { Config } from './packages/core/dist/src/config/config.js';

// Simulate CLI args with enableThinking
const params = {
  cwd: process.cwd(),
  contentGeneratorConfig: {
    apiKey: 'test-key',
    model: 'gemini-2.0-flash-exp',
    authType: 'api-key',
    logLevel: 'verbose',
  },
  embeddingModel: 'text-embedding-004',
  sandbox: false,
  targetDir: process.cwd(),
  debugMode: true,
  enableThinking: true, // THIS IS THE KEY PARAMETER
  provider: 'gemini',
};

const config = new Config(params);

console.log('Config created with params:', params);
console.log('enableThinking from getEnableThinking():', config.getEnableThinking());
console.log('Config object enableThinking:', config.enableThinking);

// Try creating a provider
import { LLMProviderFactory } from './packages/core/dist/src/providers/factory.js';

const providerConfig = {
  provider: 'gemini',
  model: 'gemini-2.0-flash-exp',
  apiKey: 'test-key',
  configInstance: config,
};

try {
  const provider = LLMProviderFactory.createProvider(providerConfig);
  console.log('Provider created successfully');
  console.log('Provider config:', provider.getConfig());
  console.log('Provider supports thinking:', provider.supportsThinkingMode());
} catch (error) {
  console.log('Error creating provider:', error.message);
}