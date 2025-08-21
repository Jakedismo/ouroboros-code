#!/usr/bin/env node

/**
 * Lightweight unit tests for A2A system components
 * No background processes, no vitest - just logic and structure testing
 */

import { readFileSync, existsSync } from 'fs';
import { setTimeout } from 'timers/promises';

// Simple test runner
class SimpleTestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(name, testFn) {
    this.tests.push({ name, fn: testFn });
  }

  async run() {
    console.log(`🧪 Running ${this.tests.length} A2A component tests...\n`);
    
    for (const test of this.tests) {
      try {
        console.log(`▶️  ${test.name}`);
        await test.fn();
        console.log(`✅ PASS: ${test.name}\n`);
        this.passed++;
      } catch (error) {
        console.log(`❌ FAIL: ${test.name}`);
        console.log(`   Error: ${error.message}\n`);
        this.failed++;
      }
    }
    
    console.log(`📊 Test Results: ${this.passed} passed, ${this.failed} failed`);
    return this.failed === 0;
  }

  assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
  }

  assertContains(text, substring, message) {
    if (!text.includes(substring)) {
      throw new Error(message || `Expected text to contain "${substring}"`);
    }
  }
}

const runner = new SimpleTestRunner();

// Test 1: A2A Implementation Files Exist
runner.test('A2A implementation files exist', async () => {
  const files = [
    'packages/core/src/agents/AutonomousA2AHandler.ts',
    'packages/core/src/core/A2AContextInjector.ts',
    'packages/core/src/webhooks/webhook-server.ts',
    'docs/a2a-architecture.md',
    'docs/a2a-webhook-specifications.md'
  ];
  
  for (const file of files) {
    runner.assert(existsSync(file), `File ${file} should exist`);
  }
});

// Test 2: Webhook Server Port Configuration
runner.test('Webhook server uses fixed port 45123', async () => {
  const webhookServerPath = 'packages/core/src/webhooks/webhook-server.ts';
  const content = readFileSync(webhookServerPath, 'utf8');
  
  runner.assertContains(content, '45123', 'Webhook server should reference port 45123');
  runner.assertContains(content, 'Fixed port for webhook server', 'Should have comment about fixed port');
});

// Test 3: A2A Handler Implementation Structure
runner.test('AutonomousA2AHandler has required structure', async () => {
  const handlerPath = 'packages/core/src/agents/AutonomousA2AHandler.ts';
  const content = readFileSync(handlerPath, 'utf8');
  
  // Check for essential methods and properties
  runner.assertContains(content, 'class AutonomousA2AHandler', 'Should define AutonomousA2AHandler class');
  runner.assertContains(content, 'detectAvailableA2ATool', 'Should have tool detection method');
  runner.assertContains(content, 'a2a_coordinate', 'Should support a2a_coordinate tool');
  runner.assertContains(content, 'mao_inbox_poll', 'Should support mao_inbox_poll tool');
  runner.assertContains(content, 'webhook', 'Should handle webhook functionality');
});

// Test 4: A2A Context Injector Implementation
runner.test('A2AContextInjector has proper structure', async () => {
  const injectorPath = 'packages/core/src/core/A2AContextInjector.ts';
  const content = readFileSync(injectorPath, 'utf8');
  
  runner.assertContains(content, 'class A2AContextInjector', 'Should define A2AContextInjector class');
  runner.assertContains(content, 'implements ContentGenerator', 'Should implement ContentGenerator interface');
  runner.assertContains(content, 'injectA2AContext', 'Should have context injection method');
  runner.assertContains(content, 'formatA2AContext', 'Should have message formatting method');
  runner.assertContains(content, '🤖 Agent-to-Agent Messages', 'Should include A2A message header');
});

// Test 5: NonInteractive CLI Integration
runner.test('NonInteractiveCli integrates A2A handler', async () => {
  const cliPath = 'packages/cli/src/nonInteractiveCli.ts';
  const content = readFileSync(cliPath, 'utf8');
  
  runner.assertContains(content, 'AutonomousA2AHandler', 'Should import AutonomousA2AHandler');
  runner.assertContains(content, 'new AutonomousA2AHandler', 'Should instantiate A2A handler');
  runner.assertContains(content, 'a2aHandler.start()', 'Should start A2A handler');
  runner.assertContains(content, 'Autonomous agent mode initialized with A2A support', 'Should log A2A initialization');
});

// Test 6: Tool Detection Logic
runner.test('MCP tool detection logic is sound', async () => {
  const handlerPath = 'packages/core/src/agents/AutonomousA2AHandler.ts';
  const content = readFileSync(handlerPath, 'utf8');
  
  // Verify the tool detection hierarchy is implemented
  runner.assertContains(content, "toolRegistry.getTool('a2a_coordinate')", 'Should check for a2a_coordinate first');
  runner.assertContains(content, "toolRegistry.getTool('mao_inbox_poll')", 'Should check for mao_inbox_poll as fallback');
  runner.assertContains(content, 'return null', 'Should return null if no tools available');
});

// Test 7: A2A Tool Parameter Construction
runner.test('A2A handler constructs correct tool parameters', async () => {
  const handlerPath = 'packages/core/src/agents/AutonomousA2AHandler.ts';
  const content = readFileSync(handlerPath, 'utf8');
  
  // Check for a2a_coordinate parameters
  runner.assertContains(content, "action: 'inbox'", 'Should set action to inbox for a2a_coordinate');
  runner.assertContains(content, 'sessionId:', 'Should include sessionId parameter');
  runner.assertContains(content, 'unreadOnly: true', 'Should filter unread messages');
  runner.assertContains(content, 'limit: 50', 'Should set default limit to 50');
  
  // Check for mao_inbox_poll parameters
  runner.assertContains(content, 'agentId:', 'Should include agentId for mao_inbox_poll');
  runner.assertContains(content, 'includeExpired: false', 'Should exclude expired messages');
});

// Test 8: Documentation Files Structure
runner.test('A2A documentation has proper structure', async () => {
  const architecturePath = 'docs/a2a-architecture.md';
  const webhookSpecsPath = 'docs/a2a-webhook-specifications.md';
  
  const archContent = readFileSync(architecturePath, 'utf8');
  const specContent = readFileSync(webhookSpecsPath, 'utf8');
  
  // Architecture documentation checks
  runner.assertContains(archContent, '# Autonomous Agent-to-Agent (A2A) Communication Architecture', 'Should have proper architecture title');
  runner.assertContains(archContent, 'AutonomousA2AHandler', 'Should document the A2A handler');
  runner.assertContains(archContent, 'A2AContextInjector', 'Should document the context injector');
  runner.assertContains(archContent, 'dual MCP tool integration', 'Should document dual tool support');
  
  // Webhook specifications checks
  runner.assertContains(specContent, '# A2A Webhook Notification Specifications', 'Should have proper webhook specs title');
  runner.assertContains(specContent, 'http://localhost:45123/mcp-webhook', 'Should specify correct webhook endpoint');
  runner.assertContains(specContent, 'a2a_coordinate', 'Should document a2a_coordinate tool');
  runner.assertContains(specContent, 'mao_inbox_poll', 'Should document mao_inbox_poll tool');
});

// Test 9: Core Package Exports
runner.test('Core package exports A2A components', async () => {
  const indexPath = 'packages/core/src/index.ts';
  const content = readFileSync(indexPath, 'utf8');
  
  runner.assertContains(content, 'AutonomousA2AHandler', 'Should export AutonomousA2AHandler');
  runner.assertContains(content, './agents/AutonomousA2AHandler.js', 'Should export from correct path');
});

// Run all tests
runner.run().then(success => {
  if (success) {
    console.log('\n🎉 All A2A component tests passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed.');
    process.exit(1);
  }
}).catch(error => {
  console.error('❌ Test runner failed:', error);
  process.exit(1);
});