#!/usr/bin/env node

// Test script to verify custom command loading and execution
import { Config, Storage } from './packages/core/dist/index.js';
import { FileCommandLoader } from './packages/cli/dist/services/FileCommandLoader.js';

async function testCustomCommands() {
  const config = new Config();
  const loader = new FileCommandLoader(config);
  
  console.log('Loading custom commands...');
  const commands = await loader.loadCommands(new AbortController().signal);
  
  console.log(`Found ${commands.length} custom commands:`);
  for (const cmd of commands) {
    console.log(`  - ${cmd.name}: ${cmd.description}`);
    console.log(`    Has action: ${!!cmd.action}`);
    console.log(`    Kind: ${cmd.kind}`);
  }
  
  // Find and test the "test" command
  const testCommand = commands.find(cmd => cmd.name === 'test');
  if (testCommand) {
    console.log('\nTesting the "test" command:');
    const context = {
      invocation: {
        raw: '/test',
        name: 'test',
        args: ''
      },
      services: { config },
      ui: {},
      session: { sessionShellAllowlist: new Set() }
    };
    
    const result = await testCommand.action(context, '');
    console.log('Result:', result);
  } else {
    console.log('\n"test" command not found!');
  }
}

testCustomCommands().catch(console.error);