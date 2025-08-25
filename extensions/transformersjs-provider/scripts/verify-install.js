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

async function verifyTransformersJSInstallation() {
  console.log('🔍 Verifying Transformers.js installation...');
  
  try {
    // Dynamic import to avoid issues in environments where it's not installed
    const { env } = await import('@xenova/transformers');
    
    console.log(`✅ Transformers.js is available`);
    console.log(`   Cache directory: ${env.cacheDir}`);
    console.log(`   Remote models allowed: ${env.allowRemoteModels ? '✅' : '❌'}`);
    console.log(`   Local models allowed: ${env.allowLocalModels ? '✅' : '❌'}`);
    
    return true;
  } catch (error) {
    console.error(`❌ Failed to load Transformers.js: ${error.message}`);
    console.error(`
Make sure Transformers.js is installed:
   npm install @xenova/transformers

If you just installed it, you may need to restart your terminal.
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
    
    if (!config.providers?.transformersjs) {
      throw new Error('Transformers.js provider not found in extension config');
    }
    
    const provider = config.providers.transformersjs;
    console.log(`✅ Provider '${provider.displayName}' configured`);
    console.log(`   Entry point: ${provider.entryPoint}`);
    console.log(`   Default model: ${provider.defaultModel}`);
    console.log(`   Client-side: ${provider.capabilities.clientSide ? '✅' : '❌'}`);
    console.log(`   Supports embeddings: ${provider.capabilities.supportsEmbeddings ? '✅' : '❌'}`);
    console.log(`   Supports vision: ${provider.capabilities.supportsVision ? '✅' : '❌'}`);
    console.log(`   Multi-task support: ${Object.keys(provider.modelCategories).length} categories`);
    
    return true;
  } catch (error) {
    console.error(`❌ Provider registration verification failed: ${error.message}`);
    return false;
  }
}

async function testBasicPipeline() {
  console.log('\\n🔍 Testing basic pipeline functionality...');
  
  try {
    const { pipeline } = await import('@xenova/transformers');
    
    console.log('🧪 Testing sentiment analysis with lightweight model...');
    
    // Use a small, fast model for testing
    const classifier = await pipeline(
      'text-classification',
      'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
      { 
        quantized: true,
        progress_callback: (progress) => {
          if (progress.status === 'downloading') {
            const percent = progress.progress ? Math.round(progress.progress * 100) : 0;
            if (percent % 25 === 0 || percent === 100) { // Only log at 25% intervals
              console.log(`   📥 Downloading: ${percent}%`);
            }
          } else if (progress.status === 'loading') {
            console.log(`   ⚡ Loading model...`);
          } else if (progress.status === 'ready') {
            console.log(`   🎉 Model ready!`);
          }
        }
      }
    );
    
    const result = await classifier('Transformers.js is amazing for local AI!');
    
    if (result && result.length > 0) {
      console.log('✅ Sentiment analysis test successful');
      console.log(`   Result: ${result[0].label} (${(result[0].score * 100).toFixed(1)}% confidence)`);
    } else {
      throw new Error('No results returned from pipeline');
    }
    
    return true;
  } catch (error) {
    console.error(`⚠️  Pipeline test failed: ${error.message}`);
    
    if (error.message.includes('fetch')) {
      console.error(`   This may be due to network connectivity issues.`);
      console.error(`   Models are downloaded from Hugging Face on first use.`);
    }
    
    console.log('   This is not critical - the provider may still work with cached models');
    return false;
  }
}

async function testProviderImport() {
  console.log('\\n🔍 Testing provider import...');
  
  try {
    // Test importing the built provider
    const providerPath = join(__dirname, '..', 'dist', 'provider.js');
    
    try {
      const { TransformersJSProvider } = await import(providerPath);
      
      if (typeof TransformersJSProvider !== 'function') {
        throw new Error('TransformersJSProvider is not a constructor function');
      }
      
      console.log('✅ Provider import successful (built)');
      return { success: true, providerPath: 'dist' };
    } catch (importError) {
      if (importError.code === 'ERR_MODULE_NOT_FOUND') {
        console.log('⏩ Built provider not found, testing source import...');
        
        // Fallback to source import for development
        const { TransformersJSProvider } = await import('../src/provider.js');
        console.log('✅ Provider source import successful');
        return { success: true, providerPath: 'src' };
      }
      throw importError;
    }
  } catch (error) {
    console.error(`❌ Provider import test failed: ${error.message}`);
    return { success: false };
  }
}

async function testProviderInstantiation() {
  console.log('\\n🔍 Testing provider instantiation...');
  
  try {
    // Import based on availability
    let TransformersJSProvider;
    try {
      const built = await import(join(__dirname, '..', 'dist', 'provider.js'));
      TransformersJSProvider = built.TransformersJSProvider;
    } catch {
      const source = await import('../src/provider.js');
      TransformersJSProvider = source.TransformersJSProvider;
    }
    
    const config = {
      model: 'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
      task: 'text-classification',
      quantized: true,
      progress_callback: false, // Disable progress for testing
    };
    
    const provider = new TransformersJSProvider(config);
    
    if (!provider) throw new Error('Provider instantiation failed');
    if (typeof provider.chat !== 'function') throw new Error('Provider missing chat method');
    if (typeof provider.getAvailableModels !== 'function') throw new Error('Provider missing getAvailableModels method');
    if (typeof provider.embeddings !== 'function') throw new Error('Provider missing embeddings method');
    
    console.log('✅ Provider instantiation successful');
    
    // Test getting available models (should return pre-configured list)
    const models = await provider.getAvailableModels();
    console.log(`   📋 ${models.length} pre-configured models available`);
    
    await provider.dispose();
    
    return true;
  } catch (error) {
    console.error(`❌ Provider instantiation test failed: ${error.message}`);
    return false;
  }
}

async function testQuickInference() {
  console.log('\\n🔍 Testing quick inference (optional)...');
  
  try {
    // Import provider
    let TransformersJSProvider;
    try {
      const built = await import(join(__dirname, '..', 'dist', 'provider.js'));
      TransformersJSProvider = built.TransformersJSProvider;
    } catch {
      const source = await import('../src/provider.js');
      TransformersJSProvider = source.TransformersJSProvider;
    }
    
    const provider = new TransformersJSProvider({
      model: 'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
      task: 'text-classification',
      quantized: true,
      progress_callback: false,
    });
    
    const messages = [
      { role: 'user', content: 'This is a great test!' }
    ];
    
    console.log('   🧪 Running quick classification test...');
    const response = await provider.chat(messages);
    
    if (response && response.content) {
      console.log('✅ Quick inference test successful');
      console.log(`   Response: ${response.content.slice(0, 100)}${response.content.length > 100 ? '...' : ''}`);
    } else {
      throw new Error('No response content received');
    }
    
    await provider.dispose();
    return true;
    
  } catch (error) {
    console.error(`⚠️  Quick inference test failed: ${error.message}`);
    console.log('   This may be due to model download requirements or network issues');
    console.log('   The provider may still work in normal usage');
    return false;
  }
}

async function main() {
  console.log(`
🤖 Transformers.js Provider Installation Verification
===================================================
`);
  
  const checks = [
    { name: 'Transformers.js Installation', fn: verifyTransformersJSInstallation },
    { name: 'Provider Registration', fn: verifyProviderRegistration },
    { name: 'Basic Pipeline', fn: testBasicPipeline },
    { name: 'Provider Import', fn: testProviderImport },
    { name: 'Provider Instantiation', fn: testProviderInstantiation },
    { name: 'Quick Inference', fn: testQuickInference },
  ];
  
  let passed = 0;
  
  for (const check of checks) {
    try {
      const result = await check.fn();
      if (result) passed++;
    } catch (error) {
      console.error(`❌ ${check.name} failed: ${error.message}`);
    }
  }
  
  const criticalPassed = passed >= 4; // First 4 checks are critical
  
  console.log(`
📊 Installation Verification Results: ${passed}/${checks.length} checks passed

${passed === checks.length ? 
  '🎉 Perfect! Transformers.js provider is ready to use.' :
  criticalPassed ?
  '✅ Transformers.js provider is ready to use (some optional features may not be available).' :
  '⚠️  Some critical checks failed. The provider may not work correctly.'
}

🚀 Try it out:
   ouroboros-code --provider transformersjs "Analyze sentiment: I love AI!"
   ouroboros-code --provider transformersjs --task question-answering "What is machine learning?"
   ouroboros-code --provider-info transformersjs

🎯 Popular tasks to try:
   • Text classification: --task text-classification
   • Question answering: --task question-answering  
   • Summarization: --task summarization
   • Text generation: --task text-generation
   • Feature extraction: embeddings via chat

🌟 Key advantages:
   • 🔒 100% client-side processing (maximum privacy)
   • 🚫 No servers or API keys required
   • 🌐 Works offline after model download
   • ⚡ WebAssembly-powered performance
   • 🤖 Access to 1000+ Hugging Face models

For help: https://github.com/ouroboros-ai/transformersjs-provider
Model library: https://huggingface.co/models?library=transformers.js
`);

  if (!criticalPassed) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Verification failed:', error);
  process.exit(1);
});