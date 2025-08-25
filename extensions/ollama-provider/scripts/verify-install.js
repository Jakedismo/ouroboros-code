#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { Ollama } from 'ollama';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function verifyOllamaConnection() {
  console.log('🔍 Verifying Ollama connection...');
  
  try {
    const client = new Ollama({
      host: 'http://localhost:11434'
    });
    
    // Test basic connectivity
    const models = await client.list();
    console.log(`✅ Connected to Ollama (${models.models.length} models available)`);
    
    if (models.models.length === 0) {
      console.warn(`
⚠️  No models found! 

Install some models to get started:
   ollama pull llama3.1:8b     # Good general purpose model
   ollama pull codellama:7b    # Code-focused model  
   ollama pull phi3:mini       # Lightweight model

For more models: https://ollama.ai/library
`);
      return true; // Still successful connection
    }
    
    // Show available models
    console.log('\n📋 Available models:');
    models.models.forEach(model => {
      const sizeGB = (model.size / (1024 ** 3)).toFixed(1);
      console.log(`   • ${model.name} (${sizeGB} GB)`);
    });
    
    return true;
  } catch (error) {
    console.error(`❌ Failed to connect to Ollama: ${error.message}`);
    console.error(`
Make sure Ollama is running:
   ollama serve

If you just installed Ollama, you may need to restart your terminal.
`);
    return false;
  }
}

async function verifyProviderRegistration() {
  console.log('\n🔍 Verifying provider registration...');
  
  try {
    // Check if extension config exists
    const configPath = join(__dirname, '..', 'gemini-extension.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    
    if (!config.providers?.ollama) {
      throw new Error('Ollama provider not found in extension config');
    }
    
    console.log(`✅ Provider '${config.providers.ollama.displayName}' configured`);
    console.log(`   Entry point: ${config.providers.ollama.entryPoint}`);
    console.log(`   Default model: ${config.providers.ollama.defaultModel}`);
    console.log(`   Supports tools: ${config.providers.ollama.capabilities.supportsTools ? '✅' : '❌'}`);
    console.log(`   Supports streaming: ${config.providers.ollama.capabilities.supportsStreaming ? '✅' : '❌'}`);
    
    return true;
  } catch (error) {
    console.error(`❌ Provider registration verification failed: ${error.message}`);
    return false;
  }
}

async function testBasicChat() {
  console.log('\n🔍 Testing basic chat functionality...');
  
  try {
    const client = new Ollama({
      host: 'http://localhost:11434'
    });
    
    // Get available models
    const models = await client.list();
    if (models.models.length === 0) {
      console.log('⏩ Skipping chat test - no models available');
      return true;
    }
    
    // Use the first available model for testing
    const testModel = models.models[0].name;
    console.log(`🧪 Testing with model: ${testModel}`);
    
    const response = await client.chat({
      model: testModel,
      messages: [{ role: 'user', content: 'Say "Hello from Ollama provider test!"' }],
      stream: false,
    });
    
    if (response.message.content.includes('Hello from Ollama provider test!')) {
      console.log('✅ Basic chat test successful');
      console.log(`   Response: ${response.message.content.slice(0, 100)}...`);
    } else {
      console.log('✅ Chat test completed (response may vary)');
      console.log(`   Response: ${response.message.content.slice(0, 100)}...`);
    }
    
    return true;
  } catch (error) {
    console.error(`⚠️  Chat test failed: ${error.message}`);
    console.log('   This is not critical - the provider may still work');
    return false;
  }
}

async function main() {
  console.log(`
🦙 Ollama Provider Installation Verification
=========================================
`);
  
  const checks = [
    verifyOllamaConnection,
    verifyProviderRegistration,
    testBasicChat,
  ];
  
  let passed = 0;
  
  for (const check of checks) {
    try {
      const result = await check();
      if (result) passed++;
    } catch (error) {
      console.error(`❌ Check failed: ${error.message}`);
    }
  }
  
  console.log(`
📊 Installation Verification Results: ${passed}/${checks.length} checks passed

${passed === checks.length ? 
  '🎉 Perfect! Ollama provider is ready to use.' :
  '⚠️  Some checks failed, but the provider may still work.'}

🚀 Try it out:
   ouroboros-code --provider ollama "Explain quantum computing"
   ouroboros-code --provider-info ollama

For help: https://github.com/ouroboros-ai/ollama-provider
`);

  if (passed < checks.length) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Verification failed:', error);
  process.exit(1);
});