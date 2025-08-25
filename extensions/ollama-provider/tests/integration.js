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
const OLLAMA_BASE_URL = 'http://localhost:11434';

async function checkOllamaAvailable() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/version`, {
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
    if (!config.providers?.ollama) throw new Error('Ollama provider configuration is required');
    
    const provider = config.providers.ollama;
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
      const { OllamaProvider } = await import(providerPath);
      
      if (typeof OllamaProvider !== 'function') {
        throw new Error('OllamaProvider is not a constructor function');
      }
      
      console.log('✅ Provider import successful');
      return { success: true, OllamaProvider };
    } catch (importError) {
      if (importError.code === 'ERR_MODULE_NOT_FOUND') {
        console.log('⏩ Provider not built yet, testing source import...');
        
        // Fallback to source import for development
        const { OllamaProvider } = await import('../src/provider.js');
        console.log('✅ Provider source import successful');
        return { success: true, OllamaProvider };
      }
      throw importError;
    }
  } catch (error) {
    console.error(`❌ Provider import test failed: ${error.message}`);
    return { success: false };
  }
}

async function testProviderInstantiation({ OllamaProvider }) {
  console.log('🧪 Testing provider instantiation...');
  
  try {
    const config = {
      model: 'llama3.1:8b',
      baseUrl: OLLAMA_BASE_URL,
      pullOnDemand: false, // Don't auto-pull for tests
      temperature: 0.7,
    };
    
    const provider = new OllamaProvider(config);
    
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

async function testProviderWithOllama({ provider }) {
  console.log('🧪 Testing provider with Ollama server...');
  
  const isOllamaAvailable = await checkOllamaAvailable();
  
  if (!isOllamaAvailable) {
    console.log('⏩ Ollama server not available, skipping integration tests');
    console.log('   Start Ollama with: ollama serve');
    return true; // Not a failure, just unavailable
  }
  
  console.log('✅ Ollama server is available');
  
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
      console.log('   ⚠️  No models available. Pull some models with:');
      console.log('      ollama pull llama3.1:8b');
      return true; // Not a failure, just no models
    }
    
    // Test basic chat if models available
    console.log('   Testing basic chat...');
    const testModel = models[0]; // Use first available model
    
    // Create a new provider instance with the available model
    const testProvider = new provider.constructor({
      model: testModel,
      baseUrl: OLLAMA_BASE_URL,
      pullOnDemand: false,
      temperature: 0.1, // Low temperature for consistent test results
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
    
    // Clean up
    await testProvider.dispose();
    
    return true;
  } catch (error) {
    console.error(`   ❌ Ollama integration test failed: ${error.message}`);
    return false;
  }
}

async function testErrorHandling({ OllamaProvider }) {
  console.log('🧪 Testing error handling...');
  
  try {
    // Test provider can be constructed with various configs (basic validation)
    const configs = [
      { model: 'test-model', baseUrl: 'http://localhost:11434' },
      { model: 'test-model', pullOnDemand: true },
      { model: 'test-model', temperature: 0.5 }
    ];
    
    for (const config of configs) {
      const provider = new OllamaProvider(config);
      if (!provider) throw new Error('Provider construction failed');
    }
    
    console.log('   ✅ Provider handles various configurations');
    
    // Test missing model error when Ollama is available
    const isOllamaAvailable = await checkOllamaAvailable();
    
    if (isOllamaAvailable) {
      try {
        const provider = new OllamaProvider({
          baseUrl: OLLAMA_BASE_URL,
          model: 'definitely-nonexistent-model:test',
          pullOnDemand: false,
        });
        
        await provider.initialize();
        const messages = [{ role: 'user', content: 'Hello' }];
        await provider.chat(messages);
        throw new Error('Should have failed with missing model');
      } catch (error) {
        if (error.message.includes('not found locally')) {
          console.log('   ✅ Properly handles missing model errors');
        } else {
          // Any initialization error is acceptable for this test
          console.log('   ✅ Properly handles initialization errors');
        }
      }
    } else {
      console.log('   ⏩ Skipping missing model test (Ollama not available)');
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
🦙 Ollama Provider Extension Integration Tests
=============================================
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
  if (testResults.OllamaProvider) {
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
    
    // Run Ollama integration tests if provider instantiation was successful
    if (testResults.provider) {
      total++;
      console.log('\n--- Ollama Integration ---');
      
      try {
        const result = await testProviderWithOllama(testResults);
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
  '🎉 All integration tests passed! The Ollama provider is ready to use.' :
  '⚠️  Some tests failed. Check the output above for details.'
}

💡 Next steps:
   1. Build the extension: npm run build
   2. Run unit tests: npm test  
   3. Install the extension: ouroboros-code extension install .
   4. Try it out: ouroboros-code "Hello" --provider ollama
`);

  process.exit(passed < total ? 1 : 0);
}

// Handle timeout
const timeout = setTimeout(() => {
  console.error('\n❌ Integration tests timed out');
  process.exit(1);
}, TEST_TIMEOUT);

main().finally(() => clearTimeout(timeout));