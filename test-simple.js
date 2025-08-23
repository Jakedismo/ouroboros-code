#!/usr/bin/env node

// Simple test to check if providers are being selected correctly

import { Config } from './packages/core/dist/src/config/config.js';

async function testProviderSelection() {
  console.log('Testing provider selection...\n');
  
  // Test OpenAI provider selection
  const openaiParams = {
    cwd: process.cwd(),
    provider: 'openai',
    openaiApiKey: 'test-key',
    enableThinking: true,
    debugMode: true,
    targetDir: process.cwd(),
    model: 'gpt-5',
    sandboxImage: undefined,
    promptFile: undefined,
    prompt: undefined,
  };
  
  const config = new Config(openaiParams);
  
  console.log('Provider from config:', config.getProvider());
  console.log('OpenAI API Key:', config.getOpenaiApiKey());
  console.log('Thinking enabled:', config.getEnableThinking());
  console.log('Model:', config.getModel());
  
  // Try to initialize content generator
  try {
    console.log('\nInitializing content generator...');
    await config.initializeContentGenerator();
    console.log('Content generator initialized successfully');
    
    const client = config.getGeminiClient();
    console.log('Client type:', client.constructor.name);
    console.log('Client has generateContent:', typeof client.generateContent === 'function');
    
  } catch (error) {
    console.error('Error initializing:', error.message);
    console.error('Stack:', error.stack);
  }
}

testProviderSelection().catch(console.error);