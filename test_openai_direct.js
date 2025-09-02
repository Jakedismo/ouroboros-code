#!/usr/bin/env node

// Test direct OpenAI provider to isolate the JSON issue
import { OpenAIProvider } from './packages/core/dist/src/providers/openai/index.js';

async function testDirectOpenAI() {
  try {
    console.log('🔍 Testing direct OpenAI provider...');
    
    const provider = new OpenAIProvider({
      apiKey: process.env.OPENAI_API_KEY,
      model: 'gpt-4o', // Use a working model instead of gpt-5-nano
    });
    
    console.log('✅ Provider created');
    
    // Test the same message structure that AgentSelectorService uses
    const messages = [
      { role: 'system', content: 'You are a helpful assistant. Respond with valid JSON.' },
      { role: 'user', content: 'test message' },
    ];
    
    console.log('🧪 Testing with simple messages:', JSON.stringify(messages, null, 2));
    
    const response = await provider.generateCompletion(messages, {
      temperature: 0.1,
      maxTokens: 300,
      response_format: { type: 'json_object' },
    });
    
    console.log('📊 Response:', response);
    console.log('✅ Direct OpenAI test completed successfully!');
    
  } catch (error) {
    console.error('❌ Direct OpenAI test failed:', error.message);
    console.error(error.stack);
  }
}

testDirectOpenAI();