#!/usr/bin/env node

/**
 * BASIC SESSION FUNCTIONALITY TEST
 * 
 * Tests core session management functions without complex integration
 */

import { execSync } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

async function createTestProject() {
  const testDir = join(tmpdir(), `session-test-${Date.now()}`);
  await fs.mkdir(testDir, { recursive: true });
  
  // Create package.json
  const packageJson = {
    name: "session-test-project",
    version: "1.0.0"
  };
  
  await fs.writeFile(
    join(testDir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );
  
  return testDir;
}

async function testBuildIntegrity() {
  console.log('🔍 Testing build integrity...');
  
  try {
    execSync('npm run build', { stdio: 'pipe', cwd: process.cwd() });
    console.log('✅ Build completed successfully');
    return true;
  } catch (error) {
    console.log('❌ Build failed:', error.message);
    return false;
  }
}

async function testSessionImports() {
  console.log('🔍 Testing session module imports...');
  
  try {
    // Test if key modules can be imported
    const modules = [
      './packages/cli/dist/src/session/session-manager.js',
      './packages/cli/dist/src/session/session-integration-manager.js',
      './packages/cli/dist/src/session/workflow-session-integration.js',
      './packages/cli/dist/src/session/agent-session-integration.js',
      './packages/cli/dist/src/commands/session-commands.js',
      './packages/cli/dist/src/commands/cli-session-integration.js'
    ];
    
    for (const modulePath of modules) {
      try {
        const moduleExports = await import(modulePath);
        
        if (!moduleExports || Object.keys(moduleExports).length === 0) {
          throw new Error(`Module ${modulePath} has no exports`);
        }
        
        console.log(`✅ Module loaded: ${modulePath.split('/').pop()}`);
      } catch (moduleError) {
        console.log(`❌ Module failed: ${modulePath} - ${moduleError.message}`);
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.log('❌ Module import test failed:', error.message);
    return false;
  }
}

async function testSessionManagerBasics() {
  console.log('🔍 Testing basic session manager functionality...');
  
  try {
    // Import session manager
    const { getSessionManager } = await import('./packages/cli/dist/src/session/session-manager.js');
    const sessionManager = getSessionManager();
    
    console.log('✅ SessionManager imported and instantiated');
    
    // Test basic operations
    const initialSession = sessionManager.getCurrentSession();
    console.log(`✅ getCurrentSession: ${initialSession ? 'active session' : 'no active session'}`);
    
    return true;
  } catch (error) {
    console.log('❌ SessionManager basic test failed:', error.message);
    return false;
  }
}

async function testSessionCommandsClass() {
  console.log('🔍 Testing SessionCommands class...');
  
  try {
    const { SessionCommands } = await import('./packages/cli/dist/src/commands/session-commands.js');
    const sessionCommands = new SessionCommands();
    
    console.log('✅ SessionCommands class instantiated');
    return true;
  } catch (error) {
    console.log('❌ SessionCommands test failed:', error.message);
    return false;
  }
}

async function testCLIIntegration() {
  console.log('🔍 Testing CLI session integration...');
  
  try {
    const { sessionCLI } = await import('./packages/cli/dist/src/commands/cli-session-integration.js');
    
    // Test suggestion functionality
    const suggestions = sessionCLI.suggestSessionCommands('/session list');
    console.log(`✅ CLI suggestions working: ${suggestions.length} suggestions`);
    
    // Test completion functionality
    const completions = sessionCLI.getCompletions('/session ');
    console.log(`✅ CLI completions working: ${completions.length} completions`);
    
    return true;
  } catch (error) {
    console.log('❌ CLI integration test failed:', error.message);
    return false;
  }
}

async function runBasicTests() {
  console.log('🧪 BASIC SESSION FUNCTIONALITY TESTS');
  console.log('═══════════════════════════════════════════════════════════');
  
  const tests = [
    { name: 'Build Integrity', fn: testBuildIntegrity },
    { name: 'Session Imports', fn: testSessionImports },
    { name: 'Session Manager Basics', fn: testSessionManagerBasics },
    { name: 'Session Commands Class', fn: testSessionCommandsClass },
    { name: 'CLI Integration', fn: testCLIIntegration }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    console.log(`\n🔬 Running: ${test.name}`);
    console.log('─'.repeat(50));
    
    try {
      const result = await test.fn();
      
      if (result) {
        console.log(`✅ ${test.name} PASSED`);
        passed++;
      } else {
        console.log(`❌ ${test.name} FAILED`);
        failed++;
      }
    } catch (testError) {
      console.log(`❌ ${test.name} FAILED: ${testError.message}`);
      failed++;
    }
  }
  
  console.log('\n📊 TEST RESULTS');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${passed + failed}`);
  
  if (failed === 0) {
    console.log('\n🎉 ALL BASIC TESTS PASSED!');
    console.log('💡 Session management system is ready for use.');
    console.log('');
    console.log('🔧 Available session commands:');
    console.log('  /session list --interactive    # Interactive session browser');
    console.log('  /session recover --quick       # Quick session recovery');
    console.log('  /session status                # Show current session');
    console.log('  /session stats                 # Show session statistics');
    console.log('  /session checkpoint "desc"     # Create checkpoint');
    console.log('');
    return true;
  } else {
    console.log(`\n💥 ${failed} TESTS FAILED`);
    return false;
  }
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runBasicTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test runner failed:', error);
      process.exit(1);
    });
}

export { runBasicTests };