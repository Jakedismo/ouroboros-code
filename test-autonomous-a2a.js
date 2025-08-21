#!/usr/bin/env node

/**
 * Test script to verify autonomous A2A system functionality
 */

import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

async function testAutonomousA2A() {
  console.log('🧪 Testing Autonomous A2A System...');
  
  // Test 1: Check that autonomous mode is detected with --prompt flag
  console.log('\n1️⃣ Testing autonomous mode detection with --prompt flag...');
  
  const autonomousProcess = spawn('node', ['bundle/ouroboros-code.js', '--debug', '--prompt', 'Test autonomous mode with A2A support'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'test' }
  });
  
  let debugOutput = '';
  let foundA2AInit = false;
  let foundWebhookServer = false;
  let authToken = null;
  
  // Capture debug output
  autonomousProcess.stdout.on('data', (data) => {
    const output = data.toString();
    debugOutput += output;
    console.log('[STDOUT]', output.trim());
    
    // Check for A2A initialization
    if (output.includes('[A2A]') && output.includes('Autonomous agent mode initialized')) {
      foundA2AInit = true;
      console.log('✅ Found A2A handler initialization');
    }
    
    // Check for webhook server startup
    if (output.includes('[Webhook Server]') && output.includes('Started at')) {
      foundWebhookServer = true;
      console.log('✅ Found webhook server startup');
    }
    
    // Extract auth token
    if (output.includes('Auth token:')) {
      const matches = output.match(/Auth token:\s*([a-f0-9]+)/);
      if (matches) {
        authToken = matches[1];
        console.log(`✅ Extracted auth token: ${authToken.substring(0, 8)}...`);
      }
    }
  });
  
  autonomousProcess.stderr.on('data', (data) => {
    const output = data.toString();
    debugOutput += output;
    console.log('[STDERR]', output.trim());
  });
  
  // Give it some time to initialize
  await setTimeout(5000);
  
  // Test 2: Send a webhook notification if webhook server is running
  if (foundWebhookServer && authToken) {
    console.log('\n2️⃣ Testing webhook notification...');
    
    try {
      const testPayload = {
        notification_type: 'a2a_message',
        agent_data: {
          sender_agent_id: 'test-sender',
          receiver_agent_id: 'test-receiver',
          message_count: 1,
          priority: 'urgent',
          auto_execute: true
        }
      };
      
      const response = await fetch('http://localhost:45123/mcp-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(testPayload)
      });
      
      console.log(`📡 Webhook response status: ${response.status}`);
      
      if (response.ok) {
        console.log('✅ Webhook notification sent successfully');
      } else {
        console.log('⚠️  Webhook notification failed');
      }
      
    } catch (error) {
      console.log('❌ Webhook test failed:', error.message);
    }
  } else {
    console.log('⚠️  Skipping webhook test - server not detected or auth token missing');
  }
  
  // Clean up
  autonomousProcess.kill('SIGTERM');
  await setTimeout(1000);
  
  // Test results
  console.log('\n📊 Test Results:');
  console.log(`  A2A Handler Initialization: ${foundA2AInit ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Webhook Server Startup: ${foundWebhookServer ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Auth Token Extraction: ${authToken ? '✅ PASS' : '❌ FAIL'}`);
  
  if (foundA2AInit && foundWebhookServer && authToken) {
    console.log('\n🎉 Autonomous A2A system is working correctly!');
    return true;
  } else {
    console.log('\n⚠️  Some tests failed. Check the debug output above.');
    return false;
  }
}

testAutonomousA2A().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('❌ Test failed with error:', error);
  process.exit(1);
});