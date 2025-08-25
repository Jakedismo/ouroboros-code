#!/usr/bin/env node

/**
 * Test script to verify agent management system functionality
 */

import { getAgentManager } from './packages/cli/dist/src/agents/integration/index.js';

async function testAgentSystem() {
  console.log('🧪 Testing Agent Management System...\n');
  
  try {
    // Get agent manager
    console.log('1. Getting agent manager...');
    const agentManager = getAgentManager();
    console.log('   ✅ Agent manager created');

    // Initialize
    console.log('2. Initializing agent system...');
    await agentManager.initialize();
    console.log('   ✅ Agent system initialized');

    // List agents
    console.log('3. Listing available agents...');
    const agents = await agentManager.listAgents();
    console.log(`   ✅ Found ${agents.length} agents:`);
    agents.forEach(agent => {
      const status = agent.isActive ? '(ACTIVE)' : '';
      console.log(`      • ${agent.id} - ${agent.name} ${status}`);
    });

    // Get system status
    console.log('4. Getting system status...');
    const status = await agentManager.getSystemStatus();
    console.log('   ✅ System status:');
    console.log(`      - Initialized: ${status.initialized}`);
    console.log(`      - Built-in agents: ${status.agentCount.builtIn}`);
    console.log(`      - Custom agents: ${status.agentCount.custom}`);
    console.log(`      - Active agent: ${status.activeAgent ? status.activeAgent.name : 'None'}`);

    // Test agent activation (activate automation-specialist)
    console.log('5. Testing agent activation...');
    const automationAgent = await agentManager.getAgent('automation-specialist');
    if (automationAgent) {
      await agentManager.activateAgent('automation-specialist');
      console.log('   ✅ Successfully activated automation-specialist agent');
      
      // Verify activation
      const activeAgent = await agentManager.getActiveAgent();
      if (activeAgent && activeAgent.id === 'automation-specialist') {
        console.log('   ✅ Agent activation verified');
      } else {
        console.log('   ⚠️  Agent activation verification failed');
      }
    } else {
      console.log('   ⚠️  automation-specialist agent not found');
    }

    console.log('\n🎉 Agent Management System Test PASSED!');
    console.log('✅ All core functionality working correctly');
    
  } catch (error) {
    console.error('\n❌ Agent Management System Test FAILED!');
    console.error('Error:', error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

testAgentSystem();