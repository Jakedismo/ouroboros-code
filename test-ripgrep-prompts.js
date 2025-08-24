#!/usr/bin/env node
import { getCoreSystemPrompt } from './packages/core/dist/src/core/prompts.js';

console.log('=== Testing System Prompt Generation ===\n');

// Test with default (Grep)
console.log('1. Testing with default Grep tool:');
const grepPrompt = getCoreSystemPrompt('', { useRipgrep: false });
const hasGrep = grepPrompt.includes('search_file_content') || grepPrompt.includes('GrepTool');
const hasRipGrep = grepPrompt.includes('ripgrep') || grepPrompt.includes('RipGrep');
console.log(`   - Contains Grep references: ${hasGrep}`);
console.log(`   - Contains RipGrep references: ${hasRipGrep}`);
console.log(`   - Result: ${hasGrep && !hasRipGrep ? 'PASS' : 'FAIL'}\n`);

// Test with RipGrep enabled
console.log('2. Testing with RipGrep enabled:');
const ripgrepPrompt = getCoreSystemPrompt('', { useRipgrep: true });
// search_file_content may still appear in the tools list, but should be alongside ripgrep references
const hasOnlyGrep = ripgrepPrompt.includes('search_file_content') && !ripgrepPrompt.includes('ripgrep');
const hasRipGrep2 = ripgrepPrompt.includes('ripgrep') || ripgrepPrompt.includes('RipGrep');
const hasRipGrepTool = ripgrepPrompt.includes("'ripgrep'") || ripgrepPrompt.includes('RipGrepTool');
console.log(`   - Contains only Grep references (no RipGrep): ${hasOnlyGrep}`);
console.log(`   - Contains RipGrep references: ${hasRipGrep2}`);
console.log(`   - Contains RipGrep tool references: ${hasRipGrepTool}`);
console.log(`   - Result: ${!hasOnlyGrep && hasRipGrep2 ? 'PASS' : 'FAIL'}\n`);

// Test with claude-code flavour
console.log('3. Testing claude-code flavour with RipGrep:');
const claudePrompt = getCoreSystemPrompt('', { flavour: 'claude-code', useRipgrep: true });
const hasTemplates = claudePrompt.includes('{{SEARCH_TOOL}}');
const hasRipGrepInClaude = claudePrompt.includes('ripgrep');
console.log(`   - Contains template markers: ${hasTemplates}`);
console.log(`   - Contains RipGrep references: ${hasRipGrepInClaude}`);
console.log(`   - Result: ${!hasTemplates && hasRipGrepInClaude ? 'PASS' : 'FAIL'}\n`);

console.log('=== Test Complete ===');