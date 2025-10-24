#!/usr/bin/env node

console.log('Testing TUI rendering with parallel tool calls ENABLED...');
console.log(
  'This SHOULD exhibit the duplicate rendering bug with OpenAI provider.',
);
console.log('');
console.log('To test:');
console.log(
  '1. First re-enable parallel tool calls by uncommenting the return statements in:',
);
console.log('   - packages/core/src/runtime/agentsContentGenerator.ts');
console.log('   - packages/core/src/runtime/unifiedAgentsClient.ts');
console.log('2. Rebuild: npm run build');
console.log('3. Start CLI: npm run start -- --provider openai');
console.log('4. Execute multiple tools simultaneously:');
console.log('   - /read-file package.json');
console.log('   - /list-dir .');
console.log('   - /run-command echo "test"');
console.log('5. Observe: Tools should show duplicate/flickering rendering');
console.log('');
console.log(
  'Expected behavior: Parallel tool execution, unstable rendering (the bug)',
);
console.log('If no bug occurs, the memoization fix is working.');
console.log('If bug occurs, parallel tool calls are still the root cause.');
