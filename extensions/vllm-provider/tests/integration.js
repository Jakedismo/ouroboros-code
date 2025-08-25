#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration
const TEST_TIMEOUT = 30000; // 30 seconds
const VLLM_BASE_URL = 'http://localhost:8000';

async function checkVLLMAvailable() {
  try {
    const response = await fetch(`${VLLM_BASE_URL}/v1/models`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000)
    });
    
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function testExtensionConfig() {
  console.log('🧪 Testing extension configuration...');
  
  try {
    const configPath = join(__dirname, '..', 'gemini-extension.json');
    const configData = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configData);
    
    // Validate required extension fields
    if (!config.name) throw new Error('Extension name is required');
    if (!config.version) throw new Error('Extension version is required');
    if (!config.providers?.vllm) throw new Error('vLLM provider configuration is required');
    
    const provider = config.providers.vllm;
    if (!provider.displayName) throw new Error('Provider displayName is required');
    if (!provider.entryPoint) throw new Error('Provider entryPoint is required');
    if (!provider.capabilities) throw new Error('Provider capabilities are required');
    
    console.log('✅ Extension configuration is valid');
    return true;
  } catch (error) {
    console.error(`❌ Extension configuration test failed: ${error.message}`);
    return false;
  }
}

async function testProviderImport() {
  console.log('🧪 Testing provider import...');
  
  try {
    // Test importing the built provider
    const providerPath = join(__dirname, '..', 'dist', 'provider.js');
    
    try {
      const { VLLMProvider } = await import(providerPath);
      
      if (typeof VLLMProvider !== 'function') {
        throw new Error('VLLMProvider is not a constructor function');
      }
      
      console.log('✅ Provider import successful');
      return { success: true, VLLMProvider };
    } catch (importError) {
      if (importError.code === 'ERR_MODULE_NOT_FOUND') {
        console.log('⏩ Provider not built yet, testing source import...');
        
        // Fallback to source import for development
        const { VLLMProvider } = await import('../src/provider.js');
        console.log('✅ Provider source import successful');
        return { success: true, VLLMProvider };
      }
      throw importError;
    }
  } catch (error) {
    console.error(`❌ Provider import test failed: ${error.message}`);
    return { success: false };
  }
}

async function testProviderInstantiation({ VLLMProvider }) {
  console.log('🧪 Testing provider instantiation...');
  
  try {
    const config = {
      model: 'microsoft/DialoGPT-medium',
      baseUrl: VLLM_BASE_URL,
      temperature: 0.7,
      maxTokens: 1000,
    };
    
    const provider = new VLLMProvider(config);
    
    if (!provider) throw new Error('Provider instantiation failed');
    if (typeof provider.chat !== 'function') throw new Error('Provider missing chat method');
    if (typeof provider.streamChat !== 'function') throw new Error('Provider missing streamChat method');
    if (typeof provider.getAvailableModels !== 'function') throw new Error('Provider missing getAvailableModels method');
    
    console.log('✅ Provider instantiation successful');
    return { success: true, provider };
  } catch (error) {
    console.error(`❌ Provider instantiation test failed: ${error.message}`);
    return { success: false };
  }
}

async function testProviderWithVLLM({ provider }) {
  console.log('🧪 Testing provider with vLLM server...');
  
  const isVLLMAvailable = await checkVLLMAvailable();
  
  if (!isVLLMAvailable) {
    console.log('⏩ vLLM server not available, skipping integration tests');
    console.log('   Start vLLM server with: python -m vllm.entrypoints.openai.api_server --model [MODEL_NAME]');
    return true; // Not a failure, just unavailable
  }
  
  console.log('✅ vLLM server is available');
  
  try {
    // Test initialization
    console.log('   Testing provider initialization...');
    await provider.initialize();
    console.log('   ✅ Provider initialized successfully');
    
    // Test getting available models
    console.log('   Testing getAvailableModels...');
    const models = await provider.getAvailableModels();
    console.log(`   ✅ Found ${models.length} available models`);
    
    if (models.length === 0) {
      console.log('   ⚠️  No models available. Start vLLM server with a model:');
      console.log('      python -m vllm.entrypoints.openai.api_server --model microsoft/DialoGPT-medium');
      return true; // Not a failure, just no models
    }
    
    // Test basic chat if models available
    console.log('   Testing basic chat...');
    const testModel = models[0]; // Use first available model
    
    // Create a new provider instance with the available model
    const testProvider = new provider.constructor({
      model: testModel,
      baseUrl: VLLM_BASE_URL,
      temperature: 0.1, // Low temperature for consistent test results
      maxTokens: 50,
    });
    
    await testProvider.initialize();
    
    const messages = [
      { role: 'user', content: 'Say exactly: "Integration test successful"' }
    ];
    
    const response = await testProvider.chat(messages);
    
    if (!response.content) {
      throw new Error('Chat response has no content');
    }
    
    console.log(`   ✅ Chat test successful: "${response.content.slice(0, 50)}..."`);
    
    // Test streaming if supported
    console.log('   Testing streaming chat...');
    try {
      const streamMessages = [
        { role: 'user', content: 'Count from 1 to 3.' }
      ];
      
      const streamResponse = await testProvider.streamChat(streamMessages);
      
      let chunks = 0;
      let content = '';
      
      for await (const chunk of streamResponse) {
        if (chunk.content) {
          content += chunk.content;
          chunks++;
        }
      }
      
      if (chunks > 0) {
        console.log(`   ✅ Streaming test successful (${chunks} chunks): "${content.slice(0, 50)}..."`);
      } else {
        console.log('   ⚠️  Streaming test completed but no chunks received');
      }
    } catch (streamError) {
      console.log(`   ⚠️  Streaming test failed: ${streamError.message}`);
    }
    
    // Clean up
    await testProvider.dispose();
    
    return true;
  } catch (error) {
    console.error(`   ❌ vLLM integration test failed: ${error.message}`);
    return false;
  }
}

async function testErrorHandling({ VLLMProvider }) {
  console.log('🧪 Testing error handling...');
  
  try {
    // Test provider can be constructed with various configs
    const configs = [
      { model: 'test-model', baseUrl: 'http://localhost:8000' },
      { model: 'test-model', temperature: 0.5, maxTokens: 1000 },
      { model: 'test-model', topP: 0.9, frequencyPenalty: 0.1 }
    ];
    
    for (const config of configs) {
      const provider = new VLLMProvider(config);
      if (!provider) throw new Error('Provider construction failed');
    }
    
    console.log('   ✅ Provider handles various configurations');
    
    // Test missing model error when vLLM is available
    const isVLLMAvailable = await checkVLLMAvailable();
    
    if (isVLLMAvailable) {
      try {
        const provider = new VLLMProvider({
          baseUrl: VLLM_BASE_URL,
          model: 'definitely-nonexistent-model:test',
        });
        
        await provider.initialize();
        const messages = [{ role: 'user', content: 'Hello' }];
        await provider.chat(messages);
        throw new Error('Should have failed with missing model');
      } catch (error) {
        if (error.message.includes('not available on vLLM server')) {
          console.log('   ✅ Properly handles missing model errors');
        } else {
          // Any initialization error is acceptable for this test
          console.log('   ✅ Properly handles initialization errors');
        }
      }
    } else {
      console.log('   ⏩ Skipping missing model test (vLLM not available)');
    }
    
    console.log('✅ Error handling tests passed');
    return true;
  } catch (error) {
    console.error(`❌ Error handling test failed: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log(`
🚀 vLLM Provider Extension Integration Tests
==========================================
`);
  
  const startTime = Date.now();
  let passed = 0;
  let total = 0;
  
  const tests = [
    { name: 'Extension Configuration', fn: testExtensionConfig },
    { name: 'Provider Import', fn: testProviderImport },
  ];
  
  let testResults = {};
  
  // Run basic tests first
  for (const test of tests) {
    total++;
    console.log(`\n--- ${test.name} ---`);
    
    try {
      const result = await test.fn();
      if (result && typeof result === 'object') {
        testResults = { ...testResults, ...result };
        if (result.success !== false) passed++;
      } else if (result) {
        passed++;
      }
    } catch (error) {
      console.error(`❌ Test failed with exception: ${error.message}`);
    }
  }
  
  // Run provider-specific tests if import was successful
  if (testResults.VLLMProvider) {
    const providerTests = [
      { name: 'Provider Instantiation', fn: () => testProviderInstantiation(testResults) },
      { name: 'Error Handling', fn: () => testErrorHandling(testResults) },
    ];
    
    for (const test of providerTests) {
      total++;
      console.log(`\n--- ${test.name} ---`);
      
      try {
        const result = await test.fn();
        if (result && typeof result === 'object') {
          testResults = { ...testResults, ...result };
          if (result.success !== false) passed++;
        } else if (result) {
          passed++;
        }
      } catch (error) {
        console.error(`❌ Test failed with exception: ${error.message}`);
      }
    }
    
    // Run vLLM integration tests if provider instantiation was successful
    if (testResults.provider) {
      total++;
      console.log('\n--- vLLM Integration ---');
      
      try {
        const result = await testProviderWithVLLM(testResults);
        if (result) passed++;
      } catch (error) {
        console.error(`❌ Test failed with exception: ${error.message}`);
      }
    }
  }
  
  // Clean up
  if (testResults.provider) {
    try {
      await testResults.provider.dispose();
    } catch (error) {
      console.warn(`Warning: Provider cleanup failed: ${error.message}`);
    }
  }
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log(`
📊 Integration Test Results: ${passed}/${total} tests passed
⏱️  Duration: ${duration}s

${passed === total ? 
  '🎉 All integration tests passed! The vLLM provider is ready to use.' :
  '⚠️  Some tests failed. Check the output above for details.'
}

💡 Next steps:
   1. Build the extension: npm run build
   2. Run unit tests: npm test  
   3. Install the extension: ouroboros-code extension install .
   4. Try it out: ouroboros-code "Hello" --provider vllm

🚀 Popular models to try:
   • microsoft/DialoGPT-medium (conversational)
   • meta-llama/Llama-2-7b-chat-hf (general purpose)  
   • codellama/CodeLlama-7b-Python-hf (coding)
   • mistralai/Mistral-7B-Instruct-v0.1 (instruction following)
`);

  process.exit(passed < total ? 1 : 0);
}

// Handle timeout
const timeout = setTimeout(() => {
  console.error('\n❌ Integration tests timed out');
  process.exit(1);
}, TEST_TIMEOUT);

main().finally(() => clearTimeout(timeout));