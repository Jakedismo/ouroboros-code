#!/usr/bin/env node

// Test Anthropic provider with agent selection
import { AgentSelectorService } from './packages/core/dist/src/agents/agentSelectorService.js';

async function testAnthropicAgentSelection() {
  try {
    console.log('🔍 Testing Agent Selection with Anthropic...');
    
    const selectorService = AgentSelectorService.getInstance();
    
    // Initialize with Anthropic
    await selectorService.initialize('anthropic', process.env.ANTHROPIC_API_KEY, 'claude-3-5-sonnet-latest');
    
    console.log('✅ Anthropic service initialized');
    
    // Enable auto mode
    selectorService.setAutoMode(true);
    console.log('✅ Auto mode enabled');
    
    // Test agent selection
    const testPrompt = "help me optimize a React component for better performance";
    console.log(`🧪 Testing prompt: "${testPrompt}"`);
    
    const result = await selectorService.analyzeAndSelectAgents(testPrompt);
    
    console.log('📊 Results:', JSON.stringify(result, null, 2));
    console.log('✅ Anthropic test completed successfully!');
    
  } catch (error) {
    console.error('❌ Anthropic test failed:', error.message);
    console.error(error.stack);
  }
}

testAnthropicAgentSelection();