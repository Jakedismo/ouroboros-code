#!/usr/bin/env node

// Test multi-provider support with thinking mode

import { Config } from './packages/core/dist/src/config/config.js';
import { createContentGenerator } from './packages/core/dist/src/core/contentGenerator.js';

async function testProvider(providerName, apiKey) {
  console.log(`\n=== Testing ${providerName.toUpperCase()} Provider ===\n`);
  
  const params = {
    cwd: process.cwd(),
    contentGeneratorConfig: {
      model: providerName === 'gemini' ? 'gemini-2.5-pro' : 
             providerName === 'openai' ? 'gpt-5' : 
             'claude-4-1-opus-20250508',
      authType: 'api-key',
      logLevel: 'verbose',
    },
    embeddingModel: 'text-embedding-004',
    sandbox: false,
    targetDir: process.cwd(),
    debugMode: true,
    enableThinking: true, // Enable thinking mode
    provider: providerName,
    openaiApiKey: providerName === 'openai' ? apiKey : undefined,
    anthropicApiKey: providerName === 'anthropic' ? apiKey : undefined,
  };

  try {
    const config = new Config(params);
    
    console.log('Config created successfully');
    console.log('Provider:', config.getProvider());
    console.log('Thinking enabled:', config.getEnableThinking());
    
    // Create content generator (this will use the provider)
    const contentGeneratorConfig = {
      model: params.contentGeneratorConfig.model,
      authType: 'api-key',
      provider: providerName,
      openaiApiKey: params.openaiApiKey,
      anthropicApiKey: params.anthropicApiKey,
      apiKey: providerName === 'gemini' ? process.env.GEMINI_API_KEY : undefined,
    };
    
    console.log('Creating content generator...');
    const generator = await createContentGenerator(
      contentGeneratorConfig,
      config,
      'test-session'
    );
    
    console.log('Content generator created successfully');
    
    // Try a simple generation to verify it works
    const request = {
      model: params.contentGeneratorConfig.model,
      contents: [{
        role: 'user',
        parts: [{ text: 'Say "Hello from ' + providerName + '"' }]
      }]
    };
    
    console.log('Testing generation...');
    const response = await generator.generateContent(request, 'test-prompt');
    console.log('Response received:', response.candidates?.[0]?.content?.parts?.[0]?.text || 'No response');
    
    console.log(`\n✅ ${providerName.toUpperCase()} provider working!\n`);
    return true;
  } catch (error) {
    console.error(`\n❌ ${providerName.toUpperCase()} provider failed:`, error.message);
    if (error.stack && process.env.DEBUG) {
      console.error(error.stack);
    }
    return false;
  }
}

async function main() {
  console.log('Testing Multi-Provider Support with Thinking Mode');
  console.log('================================================');
  
  const results = {
    gemini: false,
    openai: false,
    anthropic: false,
  };
  
  // Test Gemini (should work with GEMINI_API_KEY env var)
  if (process.env.GEMINI_API_KEY) {
    results.gemini = await testProvider('gemini', process.env.GEMINI_API_KEY);
  } else {
    console.log('\n⚠️  Skipping Gemini: GEMINI_API_KEY not set');
  }
  
  // Test OpenAI (needs OPENAI_API_KEY)
  if (process.env.OPENAI_API_KEY) {
    results.openai = await testProvider('openai', process.env.OPENAI_API_KEY);
  } else {
    console.log('\n⚠️  Skipping OpenAI: OPENAI_API_KEY not set');
  }
  
  // Test Anthropic (needs ANTHROPIC_API_KEY)
  if (process.env.ANTHROPIC_API_KEY) {
    results.anthropic = await testProvider('anthropic', process.env.ANTHROPIC_API_KEY);
  } else {
    console.log('\n⚠️  Skipping Anthropic: ANTHROPIC_API_KEY not set');
  }
  
  // Summary
  console.log('\n=== SUMMARY ===');
  console.log('Gemini:', results.gemini ? '✅ Working' : '❌ Failed or skipped');
  console.log('OpenAI:', results.openai ? '✅ Working' : '❌ Failed or skipped');
  console.log('Anthropic:', results.anthropic ? '✅ Working' : '❌ Failed or skipped');
  
  const anyWorking = Object.values(results).some(r => r);
  if (anyWorking) {
    console.log('\n🎉 Multi-provider support is working!');
  } else {
    console.log('\n⚠️  No providers tested successfully. Set API keys to test.');
  }
}

main().catch(console.error);