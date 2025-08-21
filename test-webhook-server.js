#!/usr/bin/env node

/**
 * Test script to verify webhook server functionality
 */

import { WebhookServer } from './dist/packages/core/src/webhooks/webhook-server.js';

async function testWebhookServer() {
  console.log('🧪 Testing Webhook Server...');
  
  const server = new WebhookServer({
    port: 45123,
    host: 'localhost'
  });

  try {
    const webhookUrl = await server.start();
    console.log(`✅ Webhook server started successfully at: ${webhookUrl}`);
    
    const config = server.getWebhookConfig();
    console.log('📋 Server Configuration:');
    console.log(`  - URL: ${config.url}`);
    console.log(`  - Auth Token: ${config.authToken ? config.authToken.substring(0, 8) + '...' : 'None'}`);
    console.log(`  - HMAC Secret: ${config.hmacSecret ? 'Configured' : 'Not configured'}`);
    
    // Test basic connectivity
    console.log('\n🔍 Testing connectivity...');
    const response = await fetch(config.url, {
      method: 'GET'
    });
    
    if (response.status === 405) {
      console.log('✅ Webhook endpoint responds correctly (405 Method Not Allowed for GET)');
    } else {
      console.log(`⚠️  Unexpected response status: ${response.status}`);
    }
    
    await server.stop();
    console.log('✅ Webhook server stopped cleanly');
    
  } catch (error) {
    console.error('❌ Webhook server test failed:', error.message);
    process.exit(1);
  }
}

testWebhookServer().catch(console.error);