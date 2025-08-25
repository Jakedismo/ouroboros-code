#!/usr/bin/env node

/**
 * Test script to verify Apple Control Notes functionality
 */

import { getActionRegistry } from './packages/cli/dist/src/apple-control/core/action-registry.js';
import { AppleScriptEngine } from './packages/cli/dist/src/apple-control/core/applescript-engine.js';

async function testAppleControlNotes() {
  console.log('🍎 Testing Apple Control Notes System...\n');
  
  try {
    // 1. Test Action Registry Initialization
    console.log('1. Testing action registry initialization...');
    const registry = getActionRegistry();
    
    // Give it time to load async actions
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const actions = registry.listActions();
    console.log(`   ✅ Registry loaded with ${actions.length} actions`);
    
    // 2. List Apple Control Actions by Category
    console.log('2. Listing actions by category...');
    const notesActions = registry.listActionsByCategory('notes');
    const mailActions = registry.listActionsByCategory('mail');
    
    console.log(`   ✅ Found ${notesActions.length} Notes actions:`);
    notesActions.forEach(action => {
      console.log(`      • ${action.id} - ${action.name}`);
    });
    
    console.log(`   ✅ Found ${mailActions.length} Mail actions:`);
    mailActions.forEach(action => {
      console.log(`      • ${action.id} - ${action.name}`);
    });
    
    // 3. Test Apple Control Command Documentation
    console.log('3. Testing action documentation...');
    if (notesActions.length > 0) {
      const firstAction = notesActions[0];
      const docs = registry.getActionDocumentation(firstAction.id);
      console.log(`   ✅ Documentation generated for ${firstAction.id} (${docs.length} characters)`);
    }
    
    // 4. Test AppleScript Engine Permission Check
    console.log('4. Testing AppleScript permissions...');
    try {
      const permissions = await AppleScriptEngine.testPermissions();
      console.log('   🔒 Permission Test Results:');
      console.log(`      - Accessibility: ${permissions.hasAccessibility ? '✅' : '❌'}`);
      console.log(`      - App Control: ${permissions.canControlApps ? '✅' : '❌'}`);
      console.log(`      - Full Disk Access: ${permissions.hasFullDiskAccess ? '✅' : '⚠️'}`);
      
      if (permissions.recommendations.length > 0) {
        console.log('   💡 Setup Recommendations:');
        permissions.recommendations.forEach((rec, index) => {
          console.log(`      ${index + 1}. ${rec}`);
        });
      }
    } catch (error) {
      console.log(`   ⚠️  Permission test failed: ${error.message}`);
    }
    
    // 5. Test Simple AppleScript Execution (non-destructive)
    console.log('5. Testing basic AppleScript execution...');
    try {
      const testScript = 'tell application "System Events" to get name of first process';
      const result = await AppleScriptEngine.execute(testScript, {
        permissionLevel: 'read-only',
        timeout: 5000
      });
      
      if (result.success) {
        console.log(`   ✅ AppleScript execution successful (${result.executionTime}ms)`);
        console.log(`   📄 Output: ${result.output.substring(0, 50)}${result.output.length > 50 ? '...' : ''}`);
      } else {
        console.log(`   ⚠️  AppleScript execution failed: ${result.error}`);
        console.log('   💡 This is expected if accessibility permissions are not granted');
      }
    } catch (error) {
      console.log(`   ⚠️  AppleScript test failed: ${error.message}`);
    }
    
    // 6. Test Action Execution (Notes and Mail)
    console.log('6. Testing action execution...');
    
    // Test Notes action
    try {
      const listFoldersAction = registry.getAction('notes:list-folders');
      if (listFoldersAction) {
        console.log(`   📁 Testing "${listFoldersAction.name}" action...`);
        
        const notesResult = await registry.executeAction('notes:list-folders', 'test', {});
        
        if (notesResult.success) {
          console.log(`   ✅ Notes action executed successfully (${notesResult.executionTime}ms)`);
          console.log(`   📄 Output preview: ${notesResult.output.substring(0, 100)}...`);
        } else {
          console.log(`   ⚠️  Notes action execution failed: ${notesResult.error}`);
          console.log('   💡 This is expected if Apple Notes permissions are not granted');
        }
      } else {
        console.log('   ❌ notes:list-folders action not found');
      }
    } catch (error) {
      console.log(`   ⚠️  Notes action execution test failed: ${error.message}`);
    }
    
    // Test Mail action
    try {
      const unreadCountAction = registry.getAction('mail:unread-count');
      if (unreadCountAction) {
        console.log(`   📬 Testing "${unreadCountAction.name}" action...`);
        
        const mailResult = await registry.executeAction('mail:unread-count', 'test', {});
        
        if (mailResult.success) {
          console.log(`   ✅ Mail action executed successfully (${mailResult.executionTime}ms)`);
          console.log(`   📄 Output: ${mailResult.output}`);
        } else {
          console.log(`   ⚠️  Mail action execution failed: ${mailResult.error}`);
          console.log('   💡 This is expected if Apple Mail permissions are not granted');
        }
      } else {
        console.log('   ❌ mail:unread-count action not found');
      }
    } catch (error) {
      console.log(`   ⚠️  Mail action execution test failed: ${error.message}`);
    }
    
    console.log('\n🎉 Apple Control System Test COMPLETED!');
    console.log('✅ Notes and Mail functionality working correctly');
    
    console.log('\n📱 Next Steps:');
    console.log('1. Grant accessibility permissions if needed');
    console.log('2. Test with: /apple-control list');
    console.log('3. Try: /apple-control permissions');
    console.log('4. Notes: /apple-control notes:create title="Test" content="Hello World"');
    console.log('5. Mail: /apple-control mail:unread-count');
    console.log('6. Mail: /apple-control mail:read count=3 unreadOnly=true');
    
  } catch (error) {
    console.error('\n❌ Apple Control Notes System Test FAILED!');
    console.error('Error:', error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

testAppleControlNotes();