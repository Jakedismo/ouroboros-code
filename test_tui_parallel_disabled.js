#!/usr/bin/env node

console.log('Testing TUI rendering with parallel tool calls DISABLED...');
console.log(
  'This should NOT exhibit the duplicate rendering bug even with OpenAI provider.',
);
console.log('');
console.log('To test:');
console.log('1. Start CLI: npm run start -- --provider openai');
console.log('2. Execute multiple tools simultaneously:');
console.log('   - /read-file package.json');
console.log('   - /list-dir .');
console.log('   - /run-command echo "test"');
console.log('3. Observe: Tools should render cleanly without duplicates');
console.log('');
console.log('Expected behavior: Sequential tool execution, stable rendering');
console.log('If bug still occurs, the fix is incomplete.');
console.log(
  'If no bug occurs, parallel tool calls were indeed the root cause.',
);
