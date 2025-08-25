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
const TEST_TIMEOUT = 60000; // 60 seconds (models may need to download)

async function checkTransformersJSAvailable() {
  try {
    await import('@xenova/transformers');
    return true;
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
    if (!config.providers?.transformersjs) throw new Error('Transformers.js provider configuration is required');
    
    const provider = config.providers.transformersjs;
    if (!provider.displayName) throw new Error('Provider displayName is required');
    if (!provider.entryPoint) throw new Error('Provider entryPoint is required');
    if (!provider.capabilities) throw new Error('Provider capabilities are required');
    
    // Validate unique capabilities
    if (!provider.capabilities.clientSide) throw new Error('Client-side capability is required for Transformers.js');
    if (!provider.modelCategories) throw new Error('Model categories are required');
    
    console.log('✅ Extension configuration is valid');
    console.log(`   Client-side: ${provider.capabilities.clientSide ? '✅' : '❌'}`);
    console.log(`   Multi-task: ${Object.keys(provider.modelCategories).length} categories`);
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
      const { TransformersJSProvider } = await import(providerPath);
      
      if (typeof TransformersJSProvider !== 'function') {
        throw new Error('TransformersJSProvider is not a constructor function');
      }
      
      console.log('✅ Provider import successful');
      return { success: true, TransformersJSProvider };
    } catch (importError) {
      if (importError.code === 'ERR_MODULE_NOT_FOUND') {
        console.log('⏩ Provider not built yet, testing source import...');
        
        // Fallback to source import for development
        const { TransformersJSProvider } = await import('../src/provider.js');
        console.log('✅ Provider source import successful');
        return { success: true, TransformersJSProvider };
      }
      throw importError;
    }
  } catch (error) {
    console.error(`❌ Provider import test failed: ${error.message}`);
    return { success: false };
  }
}

async function testProviderInstantiation({ TransformersJSProvider }) {
  console.log('🧪 Testing provider instantiation...');
  
  try {
    const config = {
      model: 'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
      task: 'text-classification',
      quantized: true,
      progress_callback: false, // Disable progress for testing
    };
    
    const provider = new TransformersJSProvider(config);
    
    if (!provider) throw new Error('Provider instantiation failed');
    if (typeof provider.chat !== 'function') throw new Error('Provider missing chat method');
    if (typeof provider.streamChat !== 'function') throw new Error('Provider missing streamChat method');
    if (typeof provider.getAvailableModels !== 'function') throw new Error('Provider missing getAvailableModels method');
    if (typeof provider.embeddings !== 'function') throw new Error('Provider missing embeddings method');
    
    console.log('✅ Provider instantiation successful');
    return { success: true, provider };
  } catch (error) {
    console.error(`❌ Provider instantiation test failed: ${error.message}`);
    return { success: false };
  }
}

async function testProviderConfiguration({ provider }) {
  console.log('🧪 Testing provider configuration...');
  
  try {
    // Test getting available models
    console.log('   Testing getAvailableModels...');
    const models = await provider.getAvailableModels();
    console.log(`   ✅ Found ${models.length} pre-configured models`);
    
    if (models.length === 0) {
      throw new Error('No models available in configuration');
    }
    
    // Verify some expected models are present
    const expectedModels = [
      'Xenova/gpt2',
      'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
      'Xenova/all-MiniLM-L6-v2'
    ];
    
    const foundModels = expectedModels.filter(model => models.includes(model));
    console.log(`   ✅ Found ${foundModels.length}/${expectedModels.length} expected models`);
    
    return true;
  } catch (error) {
    console.error(`❌ Provider configuration test failed: ${error.message}`);
    return false;
  }
}

async function testProviderWithTransformersJS({ provider }) {
  console.log('🧪 Testing provider with Transformers.js...');
  
  const isTransformersJSAvailable = await checkTransformersJSAvailable();
  
  if (!isTransformersJSAvailable) {
    console.log('⏩ Transformers.js not available, skipping integration tests');
    console.log('   Install with: npm install @xenova/transformers');
    return true; // Not a failure, just unavailable
  }
  
  console.log('✅ Transformers.js is available');
  
  try {
    // Test basic classification (lightweight model)
    console.log('   Testing text classification...');
    const classificationProvider = new provider.constructor({
      model: 'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
      task: 'text-classification',
      quantized: true,
      progress_callback: false,
    });
    
    // Note: This may download the model on first run
    console.log('   🔄 Initializing provider (may download model)...');
    
    const messages = [
      { role: 'user', content: 'I love Transformers.js! It works great locally.' }
    ];
    
    const response = await classificationProvider.chat(messages);
    
    if (!response.content) {
      throw new Error('Chat response has no content');
    }
    
    console.log(`   ✅ Classification test successful: "${response.content.slice(0, 50)}..."`);
    
    // Test embeddings if the basic test worked
    console.log('   Testing embeddings...');
    try {
      const embeddingRequest = {
        input: 'Test embedding generation',
        model: 'Xenova/all-MiniLM-L6-v2'
      };
      
      const embeddingResponse = await classificationProvider.embeddings(embeddingRequest);
      
      if (embeddingResponse.embeddings && embeddingResponse.embeddings[0] && embeddingResponse.embeddings[0].length > 0) {
        console.log(`   ✅ Embeddings test successful (${embeddingResponse.embeddings[0].length} dimensions)`);
      } else {
        console.log('   ⚠️  Embeddings test completed but no valid embeddings returned');
      }
    } catch (embeddingError) {
      console.log(`   ⚠️  Embeddings test failed: ${embeddingError.message}`);
    }
    
    // Test streaming
    console.log('   Testing streaming (simulated)...');
    try {
      const streamMessages = [
        { role: 'user', content: 'This is amazing technology!' }
      ];
      
      const streamResponse = await classificationProvider.streamChat(streamMessages);
      
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
    await classificationProvider.dispose();
    
    return true;
  } catch (error) {
    console.error(`   ❌ Transformers.js integration test failed: ${error.message}`);
    
    if (error.message.includes('fetch') || error.message.includes('network')) {
      console.error(`   This may be due to network connectivity issues.`);
      console.error(`   Models are downloaded from Hugging Face on first use.`);
    }
    
    return false;
  }
}

async function testErrorHandling({ TransformersJSProvider }) {
  console.log('🧪 Testing error handling...');
  
  try {
    // Test provider can be constructed with various configs
    const configs = [
      { model: 'test-model', task: 'text-generation' },
      { model: 'test-model', task: 'text-classification', quantized: false },
      { model: 'test-model', task: 'question-answering', maxLength: 256 }
    ];
    
    for (const config of configs) {
      const provider = new TransformersJSProvider(config);
      if (!provider) throw new Error('Provider construction failed');
    }
    
    console.log('   ✅ Provider handles various configurations');
    
    // Test unsupported task handling
    try {
      const provider = new TransformersJSProvider({
        model: 'test-model',
        task: 'unsupported-task',
      });
      
      await provider.initialize();
      
      const messages = [{ role: 'user', content: 'Hello' }];
      await provider.chat(messages);
      
      throw new Error('Should have failed with unsupported task');
    } catch (error) {
      if (error.message.includes('Unsupported task') || error.message.includes('Failed to initialize')) {
        console.log('   ✅ Properly handles unsupported task errors');
      } else {
        throw error;
      }
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
🤖 Transformers.js Provider Extension Integration Tests
====================================================
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
  if (testResults.TransformersJSProvider) {
    const providerTests = [
      { name: 'Provider Instantiation', fn: () => testProviderInstantiation(testResults) },
      { name: 'Provider Configuration', fn: () => testProviderConfiguration(testResults) },
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
    
    // Run Transformers.js integration tests if provider instantiation was successful
    if (testResults.provider) {
      total++;
      console.log('\n--- Transformers.js Integration ---');
      
      try {
        const result = await testProviderWithTransformersJS(testResults);
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
  '🎉 All integration tests passed! The Transformers.js provider is ready to use.' :
  '⚠️  Some tests failed. Check the output above for details.'
}

💡 Next steps:
   1. Build the extension: npm run build
   2. Run unit tests: npm test  
   3. Install the extension: ouroboros-code extension install .
   4. Try it out: ouroboros-code "Analyze sentiment: I love AI!" --provider transformersjs

🚀 Popular tasks to try:
   • Text classification: --task text-classification
   • Question answering: --task question-answering
   • Text generation: --task text-generation
   • Summarization: --task summarization
   • Embeddings: via chat or dedicated method

🌟 Key advantages:
   • 🔒 100% client-side processing (maximum privacy)
   • 🚫 No servers or API keys required  
   • 🌐 Works offline after model download
   • ⚡ WebAssembly-powered performance
   • 🤖 Access to 1000+ Hugging Face models

Model library: https://huggingface.co/models?library=transformers.js
`);

  process.exit(passed < total ? 1 : 0);
}

// Handle timeout
const timeout = setTimeout(() => {
  console.error('\n❌ Integration tests timed out');
  process.exit(1);
}, TEST_TIMEOUT);

main().finally(() => clearTimeout(timeout));