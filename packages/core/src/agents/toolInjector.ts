/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tool Usage Injection for Agent Prompts
 * 
 * This module provides functionality to inject tool usage examples and references
 * into agent system prompts, similar to how the main system prompt includes tool examples.
 */

import { LSTool } from '../tools/ls.js';
import { EditTool } from '../tools/edit.js';
import { GlobTool } from '../tools/glob.js';
import { GrepTool } from '../tools/grep.js';
import { ReadFileTool } from '../tools/read-file.js';
import { ReadManyFilesTool } from '../tools/read-many-files.js';
import { ShellTool } from '../tools/shell.js';
import { WriteFileTool } from '../tools/write-file.js';
import { MemoryTool } from '../tools/memoryTool.js';

/**
 * Map of tool placeholders to actual tool names for injection
 */
const TOOL_NAME_MAP = {
  '${LSTool.Name}': LSTool.Name,
  '${EditTool.Name}': EditTool.Name,
  '${GlobTool.Name}': GlobTool.Name,
  '${GrepTool.Name}': GrepTool.Name,
  '${ReadFileTool.Name}': ReadFileTool.Name,
  '${ReadManyFilesTool.Name}': ReadManyFilesTool.Name,
  '${ShellTool.Name}': ShellTool.Name,
  '${WriteFileTool.Name}': WriteFileTool.Name,
  '${MemoryTool.Name}': MemoryTool.Name,
} as const;

/**
 * Core tool usage instructions extracted from the main system prompt
 * This provides the fundamental workflow and tool usage patterns
 */
const CORE_TOOL_INSTRUCTIONS = `

# Core Tool Usage Instructions

## Primary Workflows

### Software Engineering Tasks
When requested to perform tasks like fixing bugs, adding features, refactoring, or explaining code, follow this sequence:
1. **Understand:** Think about the user's request and the relevant codebase context. Use '${GrepTool.Name}' and '${GlobTool.Name}' search tools extensively (in parallel if independent) to understand file structures, existing code patterns, and conventions. Use '${ReadFileTool.Name}' and '${ReadManyFilesTool.Name}' to understand context and validate any assumptions you may have.
2. **Plan:** Build a coherent and grounded (based on the understanding in step 1) plan for how you intend to resolve the user's task. Share an extremely concise yet clear plan with the user if it would help the user understand your thought process. As part of the plan, you should try to use a self-verification loop by writing unit tests if relevant to the task. Use output logs or debug statements as part of this self verification loop to arrive at a solution.
3. **Implement:** Use the available tools (e.g., '${EditTool.Name}', '${WriteFileTool.Name}' '${ShellTool.Name}' ...) to act on the plan, strictly adhering to the project's established conventions.
4. **Verify (Tests):** If applicable and feasible, verify the changes using the project's testing procedures. Identify the correct test commands and frameworks by examining 'README' files, build/package configuration (e.g., 'package.json'), or existing test execution patterns. NEVER assume standard test commands.
5. **Verify (Standards):** VERY IMPORTANT: After making code changes, execute the project-specific build, linting and type-checking commands (e.g., 'tsc', 'npm run lint', 'ruff check .') that you have identified for this project (or obtained from the user). This ensures code quality and adherence to standards.

## Tool Usage Guidelines

- **File Paths:** Always use absolute paths when referring to files with tools like '${ReadFileTool.Name}' or '${WriteFileTool.Name}'. Relative paths are not supported. You must provide an absolute path.
- **Parallelism:** Execute multiple independent tool calls in parallel when feasible (i.e. searching the codebase).
- **Command Execution:** Use the '${ShellTool.Name}' tool for running shell commands, remembering the safety rule to explain modifying commands first.
- **Background Processes:** Use background processes (via \`&\`) for commands that are unlikely to stop on their own, e.g. \`node server.js &\`.
- **Interactive Commands:** Try to avoid shell commands that are likely to require user interaction. Use non-interactive versions of commands when available.
- **Remembering Facts:** Use the '${MemoryTool.Name}' tool to remember specific, *user-related* facts or preferences when the user explicitly asks.
- **Respect User Confirmations:** Most tool calls will first require confirmation from the user. If a user cancels a function call, respect their choice and do _not_ try to make the function call again unless requested.

## Available Tools

### File Operations
- **${ReadFileTool.Name}**: Read file contents to understand code structure and implementation
- **${WriteFileTool.Name}**: Create new files when implementing features or tests
- **${EditTool.Name}**: Modify existing files with precise replacements (preferred for editing)
- **${ReadManyFilesTool.Name}**: Read multiple files efficiently for broader context
- **${LSTool.Name}**: List directory contents to understand project structure

### Search Tools
- **${GlobTool.Name}**: Find files using patterns (e.g., "**/*.ts" for TypeScript files)
- **${GrepTool.Name}**: Search for specific patterns across the codebase

### Execution Tools
- **${ShellTool.Name}**: Execute shell commands for building, testing, and running code
- **${MemoryTool.Name}**: Remember user-specific preferences and information

## Tool Usage Examples

<example>
user: list files here.
model: [tool_call: ${LSTool.Name} for path '/path/to/project']
</example>

<example>
user: start the server implemented in server.js
model: [tool_call: ${ShellTool.Name} for 'node server.js &' because it must run in the background]
</example>

<example>
user: Refactor the auth logic in src/auth.py to use the requests library instead of urllib.
model: I'll analyze the code and check for a test safety net before planning any changes.
[tool_call: ${GlobTool.Name} for path 'tests/test_auth.py']
[tool_call: ${ReadFileTool.Name} for absolute_path '/path/to/tests/test_auth.py']
(After analysis)
I'll also confirm 'requests' is a dependency.
[tool_call: ${ReadFileTool.Name} for absolute_path '/path/to/requirements.txt']
(After confirming)
Here's the plan:
1. Replace the 'urllib' calls with 'requests'.
2. Add proper error handling for the new network calls.
3. Run the project's linter and tests to verify the changes.

[tool_call: ${EditTool.Name} to apply the refactoring to 'src/auth.py']
Refactoring complete. Running verification...
[tool_call: ${ShellTool.Name} for 'ruff check src/auth.py && pytest']
</example>`;

/**
 * Additional tool examples for slash commands that agents can use
 */
const SLASH_COMMAND_EXAMPLES = `

## Ouroboros Slash Commands

In addition to the core tools above, you can leverage these powerful slash commands for specialized tasks:

### Available Slash Commands

- **/analyze** - Deep analysis of code, architecture, or complex topics
- **/codereview** - Comprehensive code review with security, performance, and style analysis  
- **/debug** - Systematic debugging with root cause analysis
- **/docgen** - Generate professional documentation with examples and usage guides
- **/testgen** - Create comprehensive test suites including edge cases
- **/refactor** - Safely restructure code while preserving functionality
- **/secaudit** - Security vulnerability analysis with remediation guidance
- **/precommit** - Run automated pre-commit validations
- **/planner** - Create detailed project plans with dependencies
- **/tracer** - Map code execution paths and data flow
- **/thinkdeep** - Apply advanced reasoning to complex problems

### When to Use Slash Commands

Slash commands are particularly useful for:
- **Complex Analysis**: Use /analyze or /thinkdeep for deep insights
- **Code Quality**: Use /codereview, /refactor for improving code
- **Testing & Security**: Use /testgen, /secaudit for comprehensive coverage
- **Planning & Documentation**: Use /planner, /docgen for structured outputs

Note: These commands complement your core tools - use them when you need specialized, comprehensive assistance beyond basic file operations.`;

/**
 * Injects tool usage examples and resolves tool name placeholders in an agent prompt
 * 
 * @param agentPrompt The raw agent system prompt from markdown file
 * @param agentSpecialties List of agent specialties (kept for compatibility but not used for filtering)
 * @returns Enhanced prompt with tool injection and resolved tool names
 */
export function injectToolExamples(agentPrompt: string, agentSpecialties: string[] = []): string {
  // Start with the agent's domain expertise
  let enhancedPrompt = agentPrompt;
  
  // Add a transition section
  enhancedPrompt += `\n\n---\n\n# Tool Usage for Implementation\n\nAs an expert agent, you have access to ALL tools to implement your knowledge. Use any tool that helps accomplish the user's goals effectively.\n`;
  
  // Add the core tool instructions (with placeholders)
  let coreInstructions = CORE_TOOL_INSTRUCTIONS;
  
  // Replace tool name placeholders with actual tool names in core instructions
  for (const [placeholder, actualName] of Object.entries(TOOL_NAME_MAP)) {
    coreInstructions = coreInstructions.replace(new RegExp(escapeRegExp(placeholder), 'g'), actualName);
  }
  
  enhancedPrompt += coreInstructions;
  
  // Add slash command examples
  enhancedPrompt += SLASH_COMMAND_EXAMPLES;
  
  // Add a reminder about taking action with ALL available tools
  enhancedPrompt += `\n\n## Important Reminders\n\n`;
  enhancedPrompt += `1. **You have access to ALL tools** - Use any combination that best solves the problem\n`;
  enhancedPrompt += `2. **Take action, don't just advise** - Use tools to implement solutions directly\n`;
  enhancedPrompt += `3. **Think like an expert** - Your domain knowledge combined with tool usage makes you powerful\n`;
  enhancedPrompt += `4. **Be proactive** - Anticipate needs and use tools to provide comprehensive solutions\n\n`;
  enhancedPrompt += `Remember: You're not limited to certain tools based on your specialty. Use whatever tools are most appropriate for the task at hand.`;
  
  return enhancedPrompt;
}


/**
 * Escape special regex characters in a string
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get available tool names for reference
 */
export function getAvailableToolNames(): string[] {
  return Object.values(TOOL_NAME_MAP);
}