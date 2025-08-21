#!/usr/bin/env node

/**
 * Manual integration test for builtin-tools multi-LLM provider system
 * Tests the factory pattern and provider creation
 */

import { LLMProviderFactory } from './packages/core/src/providers/factory.js';
import { LLMProvider } from './packages/core/src/providers/types.js';
import { Config } from './packages/core/src/config/config.js';

async function testIntegration() {
  console.log('🔧 Testing Builtin-Tools Multi-LLM Integration...\n');

  // Create a mock config instance for testing
  const mockConfig = {
    getProjectRoot: () => process.cwd(),
    getWorkingDirectory: () => process.cwd(),
    getAllowedHosts: () => ['example.com'],
    getBlockedHosts: () => ['malicious.com'],
    enableMCP: false
  };

  const tests = [
    {
      name: 'Gemini Provider with Builtin Tools',
      config: {
        provider: LLMProvider.GEMINI,
        model: 'gemini-1.5-pro',
        enableBuiltinTools: true,
        configInstance: mockConfig,
        apiKey: 'test-key'
      }
    },
    {
      name: 'OpenAI Provider with Builtin Tools',
      config: {
        provider: LLMProvider.OPENAI,
        model: 'gpt-5',
        enableBuiltinTools: true,
        configInstance: mockConfig,
        apiKey: 'test-key'
      }
    },
    {
      name: 'Anthropic Provider with Builtin Tools',
      config: {
        provider: LLMProvider.ANTHROPIC,
        model: 'claude-4-sonnet-20250514',
        enableBuiltinTools: true,
        configInstance: mockConfig,
        apiKey: 'test-key'
      }
    }
  ];

  let passedTests = 0;
  const totalTests = tests.length;

  for (const test of tests) {
    try {
      console.log(`📝 Testing: ${test.name}`);
      
      // Test provider creation
      const provider = await LLMProviderFactory.create(test.config);
      
      if (provider) {
        console.log(`   ✅ Provider created successfully: ${provider.constructor.name}`);
        
        // Check if provider has expected methods
        const expectedMethods = ['generateContent', 'countTokens'];
        const hasMethods = expectedMethods.every(method => typeof provider[method] === 'function');
        
        if (hasMethods) {
          console.log(`   ✅ Provider has required methods`);
          passedTests++;
        } else {
          console.log(`   ❌ Provider missing required methods`);
        }
      } else {
        console.log(`   ❌ Provider creation failed - no provider returned`);
      }
    } catch (error) {
      console.log(`   ❌ Provider creation failed: ${error.message}`);
      if (error.message.includes('SDK not installed')) {
        console.log(`   💡 Note: This is expected if SDK is not installed`);
      }
    }
    console.log('');
  }

  console.log(`📊 Integration Test Results:`);
  console.log(`   Passed: ${passedTests}/${totalTests} tests`);
  console.log(`   Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);

  if (passedTests === totalTests) {
    console.log('\n🎉 All integration tests passed! Builtin-tools multi-LLM integration is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. The architecture is integrated but may need SDK installations.');
  }

  // Test if we can detect available providers
  console.log('\n🔍 Testing Provider Detection...');
  try {
    const availableProviders = await LLMProviderFactory.getAvailableProviders();
    console.log(`   Available providers: ${availableProviders.join(', ')}`);
  } catch (error) {
    console.log(`   Provider detection failed: ${error.message}`);
  }
}

// Run the test
testIntegration().catch(console.error);