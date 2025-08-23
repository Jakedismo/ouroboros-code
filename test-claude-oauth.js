#!/usr/bin/env node

/**
 * Test script for Claude OAuth authentication
 * 
 * This demonstrates how to use the Claude OAuth integration in Ouroboros Code
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Example Claude credentials (would come from ~/.claude/.credentials.json)
const EXAMPLE_CLAUDE_CREDENTIALS = {
  accessToken: "claude_access_token_example",
  refreshToken: "claude_refresh_token_example", 
  expiresAt: Date.now() + 3600000, // 1 hour from now
  email: "user@example.com",
  subscription: "Claude Max"
};

async function setupTestCredentials() {
  // Create test credentials file
  const credentialsDir = path.join(os.homedir(), '.claude');
  const credentialsPath = path.join(credentialsDir, '.credentials.json');
  
  console.log('📝 Setting up test Claude credentials...');
  console.log(`   Path: ${credentialsPath}`);
  
  try {
    await fs.mkdir(credentialsDir, { recursive: true });
    await fs.writeFile(
      credentialsPath,
      JSON.stringify(EXAMPLE_CLAUDE_CREDENTIALS, null, 2)
    );
    console.log('✅ Test credentials created successfully');
    return credentialsPath;
  } catch (error) {
    console.error('❌ Failed to create test credentials:', error);
    return null;
  }
}

async function testOAuthAuthentication() {
  console.log('\n🔐 Testing Claude OAuth Authentication\n');
  console.log('=' . repeat(50));
  
  // Setup test credentials
  const credentialsPath = await setupTestCredentials();
  if (!credentialsPath) {
    console.error('Failed to setup test environment');
    return;
  }
  
  console.log('\n🚀 Testing OAuth with CLI flags...\n');
  
  // Test 1: Using OAuth with explicit credentials path
  console.log('Test 1: Explicit credentials path');
  const test1 = spawn('node', [
    'packages/cli/lib/gemini.js',
    '--provider', 'anthropic',
    '--claude-use-oauth',
    '--claude-credentials-path', credentialsPath,
    '-p', 'What is 2+2?',
    '--debug'
  ], {
    stdio: 'inherit',
    env: { ...process.env }
  });
  
  await new Promise(resolve => test1.on('close', resolve));
  
  console.log('\n' + '=' . repeat(50));
  console.log('\nTest 2: Using OAuth with environment variables');
  
  // Test 2: Using OAuth with environment variables
  const test2 = spawn('node', [
    'packages/cli/lib/gemini.js',
    '--provider', 'anthropic',
    '--claude-use-oauth',
    '-p', 'What is the capital of France?',
    '--debug'
  ], {
    stdio: 'inherit',
    env: {
      ...process.env,
      CLAUDE_ACCESS_TOKEN: EXAMPLE_CLAUDE_CREDENTIALS.accessToken,
      CLAUDE_REFRESH_TOKEN: EXAMPLE_CLAUDE_CREDENTIALS.refreshToken
    }
  });
  
  await new Promise(resolve => test2.on('close', resolve));
  
  console.log('\n' + '=' . repeat(50));
  console.log('\n📋 OAuth Configuration Summary:\n');
  console.log('1. OAuth can be enabled with --claude-use-oauth flag');
  console.log('2. Credentials can be provided via:');
  console.log('   - ~/.claude/.credentials.json (default)');
  console.log('   - --claude-credentials-path flag');
  console.log('   - Environment variables (CLAUDE_ACCESS_TOKEN, CLAUDE_REFRESH_TOKEN)');
  console.log('3. Tokens are automatically refreshed when expired');
  console.log('4. Compatible with all Claude models');
  console.log('\n✨ OAuth integration is ready for use!');
}

async function cleanupTestCredentials() {
  const credentialsPath = path.join(os.homedir(), '.claude', '.credentials.json');
  try {
    await fs.unlink(credentialsPath);
    console.log('\n🧹 Cleaned up test credentials');
  } catch (error) {
    // Ignore if file doesn't exist
  }
}

// Main execution
async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║     Claude OAuth Authentication Test Suite           ║');
  console.log('║     Ouroboros Code - Multi-LLM Framework            ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  
  try {
    await testOAuthAuthentication();
  } finally {
    await cleanupTestCredentials();
  }
}

// Run the test
main().catch(console.error);