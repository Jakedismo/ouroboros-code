#!/usr/bin/env node

/**
 * SESSION RECOVERY TESTING SCRIPT
 * 
 * This script tests the complete session recovery system:
 * 1. Session creation and persistence
 * 2. Session recovery across different projects
 * 3. Crash scenario recovery
 * 4. Integration with workflow and agent systems
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration
const TEST_CONFIG = {
  timeout: 30000,
  tempDirs: [],
  originalCwd: process.cwd()
};

// Helper functions
function log(message) {
  console.log(`[TEST] ${message}`);
}

function error(message) {
  console.error(`[ERROR] ${message}`);
}

function success(message) {
  console.log(`[SUCCESS] ${message}`);
}

async function createTempProject(name) {
  const tempDir = join(tmpdir(), `ouroboros-test-${name}-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });
  
  // Create a simple package.json
  const packageJson = {
    name: `test-project-${name}`,
    version: '1.0.0',
    description: 'Test project for session recovery'
  };
  
  await fs.writeFile(
    join(tempDir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );
  
  // Create some test files
  await fs.writeFile(
    join(tempDir, 'README.md'),
    `# Test Project ${name}\n\nThis is a test project for session recovery.`
  );
  
  // Create src directory first
  await fs.mkdir(join(tempDir, 'src'), { recursive: true });
  await fs.writeFile(
    join(tempDir, 'src', 'index.js'),
    'console.log("Hello from test project");'
  );
  
  // Initialize git repo
  try {
    process.chdir(tempDir);
    execSync('git init', { stdio: 'pipe' });
    execSync('git add .', { stdio: 'pipe' });
    execSync('git commit -m "Initial commit"', { stdio: 'pipe' });
  } catch (gitError) {
    log(`Git setup failed for ${tempDir}: ${gitError.message}`);
  }
  
  TEST_CONFIG.tempDirs.push(tempDir);
  return tempDir;
}

async function cleanup() {
  process.chdir(TEST_CONFIG.originalCwd);
  
  for (const dir of TEST_CONFIG.tempDirs) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
      log(`Cleaned up temp directory: ${dir}`);
    } catch (err) {
      error(`Failed to cleanup ${dir}: ${err.message}`);
    }
  }
}

// Test functions
async function testSessionIntegrationManager() {
  log('Testing SessionIntegrationManager...');
  
  try {
    // Import the session integration manager
    const { initializeSessionIntegrationSystem } = await import('./packages/cli/dist/src/session/session-integration-manager.js');
    
    const manager = await initializeSessionIntegrationSystem();
    success('SessionIntegrationManager initialized successfully');
    
    // Test system status
    const status = manager.getSystemStatus();
    
    if (!status.session || !status.integrations || !status.health) {
      throw new Error('Missing required status components');
    }
    
    success(`System status retrieved - Health: ${status.health.overallHealth}`);
    
    return true;
  } catch (testError) {
    error(`SessionIntegrationManager test failed: ${testError.message}`);
    return false;
  }
}

async function testSessionPersistence() {
  log('Testing session persistence...');
  
  try {
    // Create a temp project
    const projectPath = await createTempProject('persistence');
    process.chdir(projectPath);
    
    // Import session components
    const { getSessionManager } = await import('./packages/cli/dist/src/session/session-manager.js');
    const { initializeSessionIntegrationSystem } = await import('./packages/cli/dist/src/session/session-integration-manager.js');
    
    // Initialize the system
    const manager = await initializeSessionIntegrationSystem();
    
    // Start a session
    const session = await manager.startIntegratedSession({
      projectPath: projectPath,
      sessionName: 'TestSession',
      agentId: 'automation-specialist'
    });
    
    success(`Session created: ${session.id.substring(0, 8)}`);
    
    // Simulate some activity
    const sessionManager = getSessionManager();
    sessionManager.recordCommand();
    sessionManager.recordActivity();
    
    // Create a checkpoint
    await sessionManager.createManualCheckpoint('Test checkpoint');
    success('Manual checkpoint created');
    
    // End the session
    await sessionManager.endSession('test_complete');
    success('Session ended successfully');
    
    return true;
  } catch (testError) {
    error(`Session persistence test failed: ${testError.message}`);
    return false;
  }
}

async function testSessionRecovery() {
  log('Testing session recovery...');
  
  try {
    // Create a temp project
    const projectPath = await createTempProject('recovery');
    process.chdir(projectPath);
    
    // Import session components
    const { getSessionManager } = await import('./packages/cli/dist/src/session/session-manager.js');
    const { initializeSessionIntegrationSystem } = await import('./packages/cli/dist/src/session/session-integration-manager.js');
    
    // Initialize the system and create a session
    const manager = await initializeSessionIntegrationSystem();
    const originalSession = await manager.startIntegratedSession({
      projectPath: projectPath,
      sessionName: 'RecoveryTestSession',
      agentId: 'automation-specialist'
    });
    
    const sessionId = originalSession.id;
    success(`Original session created: ${sessionId.substring(0, 8)}`);
    
    // Simulate some activity and end session
    const sessionManager = getSessionManager();
    sessionManager.recordCommand();
    await sessionManager.createManualCheckpoint('Before recovery test');
    await sessionManager.endSession('test_simulation');
    
    // Test recovery
    const recoveredSession = await manager.recoverIntegratedSession(sessionId, {
      restoreWorkflows: true,
      restoreAgent: true,
      restoreEnvironment: false
    });
    
    if (!recoveredSession) {
      throw new Error('Session recovery returned null');
    }
    
    if (recoveredSession.id !== sessionId) {
      throw new Error('Recovered session has different ID');
    }
    
    success(`Session recovered successfully: ${recoveredSession.id.substring(0, 8)}`);
    
    return true;
  } catch (testError) {
    error(`Session recovery test failed: ${testError.message}`);
    return false;
  }
}

async function testCrossProjectRecovery() {
  log('Testing cross-project recovery...');
  
  try {
    // Create two temp projects
    const project1 = await createTempProject('cross1');
    const project2 = await createTempProject('cross2');
    
    const { initializeSessionIntegrationSystem } = await import('./packages/cli/dist/src/session/session-integration-manager.js');
    
    // Start session in project1
    process.chdir(project1);
    const manager1 = await initializeSessionIntegrationSystem();
    const session1 = await manager1.startIntegratedSession({
      projectPath: project1,
      sessionName: 'Project1Session',
      agentId: 'automation-specialist'
    });
    
    const sessionId1 = session1.id;
    success(`Session started in project1: ${sessionId1.substring(0, 8)}`);
    
    // End session in project1
    await manager1.sessionManager.endSession('switching_projects');
    
    // Switch to project2 and try to find sessions
    process.chdir(project2);
    const manager2 = await initializeSessionIntegrationSystem();
    
    // Should not find sessions from project1 when searching for project2 sessions
    const project2Sessions = await manager2.sessionManager.findRecoverySessions(project2);
    
    if (project2Sessions.length > 0) {
      error('Found sessions in project2 that should not exist');
      return false;
    }
    
    // Should find sessions when searching without project filter
    const allSessions = await manager2.sessionManager.findRecoverySessions();
    const foundProject1Session = allSessions.find(s => s.id === sessionId1);
    
    if (!foundProject1Session) {
      throw new Error('Could not find project1 session in global search');
    }
    
    success('Cross-project session isolation working correctly');
    
    return true;
  } catch (testError) {
    error(`Cross-project recovery test failed: ${testError.message}`);
    return false;
  }
}

async function testWorkflowIntegration() {
  log('Testing workflow integration...');
  
  try {
    const projectPath = await createTempProject('workflow');
    process.chdir(projectPath);
    
    const { getWorkflowSessionIntegration } = await import('./packages/cli/dist/src/session/workflow-session-integration.js');
    const { initializeSessionIntegrationSystem } = await import('./packages/cli/dist/src/session/session-integration-manager.js');
    
    // Initialize integrated system
    const manager = await initializeSessionIntegrationSystem();
    const session = await manager.startIntegratedSession({
      projectPath: projectPath,
      agentId: 'automation-specialist'
    });
    
    // Test workflow integration
    const workflowIntegration = getWorkflowSessionIntegration();
    await workflowIntegration.initialize();
    
    // Create a mock workflow
    const workflowDefinition = {
      steps: [
        { id: 'step1', name: 'Test Step', command: 'echo "test"' }
      ]
    };
    
    const workflowId = await workflowIntegration.startWorkflowInSession(workflowDefinition);
    success(`Workflow started: ${workflowId}`);
    
    // Test workflow summary
    const summary = workflowIntegration.getSessionWorkflowSummary();
    
    if (summary.activeWorkflows !== 1) {
      throw new Error(`Expected 1 active workflow, got ${summary.activeWorkflows}`);
    }
    
    success('Workflow integration working correctly');
    
    return true;
  } catch (testError) {
    error(`Workflow integration test failed: ${testError.message}`);
    return false;
  }
}

async function testAgentIntegration() {
  log('Testing agent integration...');
  
  try {
    const projectPath = await createTempProject('agent');
    process.chdir(projectPath);
    
    const { getAgentSessionIntegration } = await import('./packages/cli/dist/src/session/agent-session-integration.js');
    const { initializeSessionIntegrationSystem } = await import('./packages/cli/dist/src/session/session-integration-manager.js');
    
    // Initialize integrated system
    const manager = await initializeSessionIntegrationSystem();
    const session = await manager.startIntegratedSession({
      projectPath: projectPath,
      agentId: 'automation-specialist'
    });
    
    // Test agent integration
    const agentIntegration = getAgentSessionIntegration();
    await agentIntegration.initialize();
    
    // Test agent stats
    const stats = agentIntegration.getAgentSessionStats();
    
    if (stats.currentAgent !== 'automation-specialist') {
      throw new Error(`Expected agent 'automation-specialist', got '${stats.currentAgent}'`);
    }
    
    // Test agent performance update
    agentIntegration.updateAgentPerformance('automation-specialist', {
      commandExecuted: true,
      success: true
    });
    
    success('Agent integration working correctly');
    
    return true;
  } catch (testError) {
    error(`Agent integration test failed: ${testError.message}`);
    return false;
  }
}

// Main test runner
async function runAllTests() {
  log('🧪 Starting SESSION RECOVERY TESTING...');
  log('═══════════════════════════════════════════════════════════');
  
  const tests = [
    { name: 'Session Integration Manager', fn: testSessionIntegrationManager },
    { name: 'Session Persistence', fn: testSessionPersistence },
    { name: 'Session Recovery', fn: testSessionRecovery },
    { name: 'Cross-Project Recovery', fn: testCrossProjectRecovery },
    { name: 'Workflow Integration', fn: testWorkflowIntegration },
    { name: 'Agent Integration', fn: testAgentIntegration }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    log(`\n🔬 Running: ${test.name}`);
    log('─'.repeat(50));
    
    try {
      const result = await Promise.race([
        test.fn(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Test timeout')), TEST_CONFIG.timeout)
        )
      ]);
      
      if (result) {
        success(`✅ ${test.name} PASSED`);
        passed++;
      } else {
        error(`❌ ${test.name} FAILED`);
        failed++;
      }
    } catch (testError) {
      error(`❌ ${test.name} FAILED: ${testError.message}`);
      failed++;
    }
  }
  
  log('\n📊 TEST RESULTS');
  log('═══════════════════════════════════════════════════════════');
  log(`✅ Passed: ${passed}`);
  log(`❌ Failed: ${failed}`);
  log(`📊 Total: ${passed + failed}`);
  
  if (failed === 0) {
    success('🎉 ALL TESTS PASSED - SESSION RECOVERY SYSTEM IS WORKING!');
    return true;
  } else {
    error(`💥 ${failed} TESTS FAILED - SESSION RECOVERY NEEDS FIXES`);
    return false;
  }
}

// Handle cleanup on exit
process.on('exit', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Run tests
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test runner failed:', error);
      process.exit(1);
    });
}

export { runAllTests };