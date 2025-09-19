#!/usr/bin/env node

// Simple test to verify agent selection works from the dev environment
import { AgentSelectorService } from './packages/core/dist/index.js';

async function testAgentSelection() {
  try {
    console.log('🔍 Testing Agent Selection Service...');
    
    const selectorService = AgentSelectorService.getInstance();
    
    // Initialize with OpenAI  
    await selectorService.initialize('openai', process.env.OPENAI_API_KEY, 'gpt-5-codex');
    
    console.log('✅ Service initialized');
    
    // Enable auto mode
    selectorService.setAutoMode(true);
    console.log('✅ Auto mode enabled');
    
    // Test agent selection
    const testPrompt = "analyze this package.json and tell me about the dependencies";
    console.log(`🧪 Testing prompt: "${testPrompt}"`);
    
    const result = await selectorService.analyzeAndSelectAgents(testPrompt);
    
    console.log('📊 Results:', JSON.stringify(result, null, 2));
    console.log('✅ Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

testAgentSelection();
