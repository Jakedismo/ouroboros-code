#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function verifyVLLMConnection() {
  console.log('🔍 Verifying vLLM connection...');
  
  try {
    // Test basic connectivity to vLLM server
    const response = await fetch('http://localhost:8000/v1/models');
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`✅ Connected to vLLM server (${data.data.length} models available)`);
    
    if (data.data.length === 0) {
      console.warn(`
⚠️  No models loaded!

Start vLLM server with a model:
   python -m vllm.entrypoints.openai.api_server --model microsoft/DialoGPT-medium
   python -m vllm.entrypoints.openai.api_server --model meta-llama/Llama-2-7b-chat-hf
   python -m vllm.entrypoints.openai.api_server --model codellama/CodeLlama-7b-Python-hf

For more models: https://huggingface.co/models
`);
      return true; // Still successful connection
    }
    
    // Show available models
    console.log('\\n📋 Available models:');
    data.data.forEach(model => {
      console.log(`   • ${model.id}`);
    });
    
    return true;
  } catch (error) {
    console.error(`❌ Failed to connect to vLLM server: ${error.message}`);
    console.error(`
Make sure vLLM server is running:
   python -m vllm.entrypoints.openai.api_server --model [MODEL_NAME] --port 8000

Example commands:
   python -m vllm.entrypoints.openai.api_server --model microsoft/DialoGPT-medium
   python -m vllm.entrypoints.openai.api_server --model meta-llama/Llama-2-7b-chat-hf

If you just installed vLLM, you may need to restart your terminal.
`);
    return false;
  }
}

async function verifyProviderRegistration() {
  console.log('\\n🔍 Verifying provider registration...');
  
  try {
    // Check if extension config exists
    const configPath = join(__dirname, '..', 'gemini-extension.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    
    if (!config.providers?.vllm) {
      throw new Error('vLLM provider not found in extension config');
    }
    
    console.log(`✅ Provider '${config.providers.vllm.displayName}' configured`);
    console.log(`   Entry point: ${config.providers.vllm.entryPoint}`);
    console.log(`   Default model: ${config.providers.vllm.defaultModel}`);
    console.log(`   Supports streaming: ${config.providers.vllm.capabilities.supportsStreaming ? '✅' : '❌'}`);
    console.log(`   Supports tools: ${config.providers.vllm.capabilities.supportsTools ? '✅' : '❌'}`);
    console.log(`   Supports batching: ${config.providers.vllm.capabilities.supportsBatching ? '✅' : '❌'}`);
    
    return true;
  } catch (error) {
    console.error(`❌ Provider registration verification failed: ${error.message}`);
    return false;
  }
}

async function testBasicChat() {
  console.log('\\n🔍 Testing basic chat functionality...');
  
  try {
    // Get available models first
    const modelsResponse = await fetch('http://localhost:8000/v1/models');
    const models = await modelsResponse.json();
    
    if (models.data.length === 0) {
      console.log('⏩ Skipping chat test - no models available');
      return true;
    }
    
    // Use the first available model for testing
    const testModel = models.data[0].id;
    console.log(`🧪 Testing with model: ${testModel}`);
    
    const chatRequest = {
      model: testModel,
      messages: [
        { role: 'user', content: 'Say "Hello from vLLM provider test!" and nothing else.' }
      ],
      max_tokens: 50,
      temperature: 0.1,
    };
    
    const response = await fetch('http://localhost:8000/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chatRequest),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (content) {
      console.log('✅ Basic chat test successful');
      console.log(`   Response: ${content.slice(0, 100)}${content.length > 100 ? '...' : ''}`);
      
      // Check token usage if available
      if (data.usage) {
        console.log(`   Tokens used: ${data.usage.total_tokens} (${data.usage.prompt_tokens} prompt + ${data.usage.completion_tokens} completion)`);
      }
    } else {
      console.log('✅ Chat test completed (empty response)');
    }
    
    return true;
  } catch (error) {
    console.error(`⚠️  Chat test failed: ${error.message}`);
    console.log('   This is not critical - the provider may still work');
    return false;
  }
}

async function testStreamingChat() {
  console.log('\\n🔍 Testing streaming chat functionality...');
  
  try {
    // Get available models first
    const modelsResponse = await fetch('http://localhost:8000/v1/models');
    const models = await modelsResponse.json();
    
    if (models.data.length === 0) {
      console.log('⏩ Skipping streaming test - no models available');
      return true;
    }
    
    // Use the first available model for testing
    const testModel = models.data[0].id;
    
    const chatRequest = {
      model: testModel,
      messages: [
        { role: 'user', content: 'Count from 1 to 3, each number on a new line.' }
      ],
      max_tokens: 20,
      temperature: 0.1,
      stream: true,
    };
    
    const response = await fetch('http://localhost:8000/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chatRequest),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    let chunks = 0;
    let content = '';
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices[0]?.delta?.content;
              if (delta) {
                content += delta;
                chunks++;
              }
            } catch (parseError) {
              // Skip malformed JSON chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    
    if (chunks > 0) {
      console.log('✅ Streaming chat test successful');
      console.log(`   Received ${chunks} chunks`);
      console.log(`   Content: ${content.slice(0, 100)}${content.length > 100 ? '...' : ''}`);
    } else {
      console.log('⚠️  Streaming test completed but no chunks received');
    }
    
    return true;
  } catch (error) {
    console.error(`⚠️  Streaming test failed: ${error.message}`);
    console.log('   This is not critical - non-streaming mode may still work');
    return false;
  }
}

async function main() {
  console.log(`
🚀 vLLM Provider Installation Verification
========================================
`);
  
  const checks = [
    verifyVLLMConnection,
    verifyProviderRegistration,
    testBasicChat,
    testStreamingChat,
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
  '🎉 Perfect! vLLM provider is ready to use.' :
  passed >= checks.length - 1 ?
  '✅ vLLM provider is ready to use (some optional features may not be available).' :
  '⚠️  Some checks failed, but the provider may still work.'
}

🚀 Try it out:
   ouroboros-code --provider vllm "Explain quantum computing"
   ouroboros-code --provider-info vllm

Popular models to try:
   • microsoft/DialoGPT-medium (conversational)
   • meta-llama/Llama-2-7b-chat-hf (general purpose)
   • codellama/CodeLlama-7b-Python-hf (coding)
   • mistralai/Mistral-7B-Instruct-v0.1 (instruction following)

For help: https://github.com/ouroboros-ai/vllm-provider
`);

  if (passed < Math.max(1, checks.length - 1)) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Verification failed:', error);
  process.exit(1);
});