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
const LS_PLACEHOLDER = '${LSTool.Name}';
const EDIT_PLACEHOLDER = '${EditTool.Name}';
const GLOB_PLACEHOLDER = '${GlobTool.Name}';
const GREP_PLACEHOLDER = '${GrepTool.Name}';
const READ_FILE_PLACEHOLDER = '${ReadFileTool.Name}';
const READ_MANY_FILES_PLACEHOLDER = '${ReadManyFilesTool.Name}';
const SHELL_PLACEHOLDER = '${ShellTool.Name}';
const WRITE_FILE_PLACEHOLDER = '${WriteFileTool.Name}';
const MEMORY_PLACEHOLDER = '${MemoryTool.Name}';

const TOOL_NAME_MAP: Record<string, string> = {
  [LS_PLACEHOLDER]: LSTool?.Name ?? 'list_directory',
  [EDIT_PLACEHOLDER]: EditTool?.Name ?? 'replace',
  [GLOB_PLACEHOLDER]: GlobTool?.Name ?? 'glob',
  [GREP_PLACEHOLDER]: GrepTool?.Name ?? 'search_file_content',
  [READ_FILE_PLACEHOLDER]: ReadFileTool?.Name ?? 'read_file',
  [READ_MANY_FILES_PLACEHOLDER]: ReadManyFilesTool?.Name ?? 'read_many_files',
  [SHELL_PLACEHOLDER]: ShellTool?.Name ?? 'run_shell_command',
  [WRITE_FILE_PLACEHOLDER]: WriteFileTool?.Name ?? 'write_file',
  [MEMORY_PLACEHOLDER]: MemoryTool?.Name ?? 'save_memory',
};

/**
 * Core tool usage instructions extracted from the main system prompt
 * This provides the fundamental workflow and tool usage patterns
 */
const CORE_TOOL_INSTRUCTIONS = `

# Tool Operations Playbook

## Ground Rules
- Keep every file or directory reference inside the workspace root shown in this session. Provide absolute paths (for example, "/workspace/app/src/index.ts"), never relative paths such as "./src/index.ts".
- Inspect existing code before editing and run the appropriate verification commands after editing to confirm the change.
- Batch reconnaissance calls (listing, globbing, searching) when they do not depend on each other, but execute edits and shell commands sequentially so you can observe each result.

## Standard Loop
1. **Recon:** Map the target area with \`${LSTool.Name}\`, \`${GlobTool.Name}\`, \`${ReadFileTool.Name}\`, \`${ReadManyFilesTool.Name}\`, and \`${GrepTool.Name}\`.
2. **Plan:** Outline the minimal set of edits and tests you will perform, referencing concrete files and commands.
3. **Implement:** Apply precise changes with \`${EditTool.Name}\` for localized replacements or \`${WriteFileTool.Name}\` when creating or rewriting full files.
4. **Verify:** Run \`${ShellTool.Name}\` commands (tests, builds, linters) that prove the change works. Capture any failure output verbatim.
5. **Report:** Summarize the change, the verification performed, and remaining risks in your final response.

## Core Tools Cheat Sheet (arguments shown in JSON)
- \`${LSTool.Name}\` – List directory entries.
  - Example: { "path": "/absolute/dir", "ignore": ["node_modules"] }
  - Use to confirm file names or discover modules before editing.
- \`${GlobTool.Name}\` – Locate files by pattern.
  - Example: { "pattern": "src/**/*.ts", "path": "/absolute/base" }
  - 'path' scopes the search; omit it to search the workspace root.
- \`${GrepTool.Name}\` – Search within files (regex supported).
  - Example: { "pattern": "function foo", "path": "/absolute/dir", "case_sensitive": false }
  - Combine with glob results to focus on relevant files.
- \`${ReadFileTool.Name}\` – Inspect a file or excerpt.
  - Example: { "absolute_path": "/absolute/file", "offset": 0, "limit": 200 }
  - Provide 'offset'/'limit' when the file is large to avoid repeated full reads.
- \`${ReadManyFilesTool.Name}\` – Read multiple files/snippets.
  - Example: { "paths": ["src", "package.json"], "include": ["**/*.md"], "exclude": ["dist/**"] }
  - 'paths' are relative to the workspace root; use this for broad surveys.
- \`${EditTool.Name}\` – Replace an exact region in an existing file.
  - Example: { "file_path": "/absolute/file", "old_string": "current text", "new_string": "replacement", "expected_replacements": 1 }
  - 'old_string' must include surrounding context so the match is unique; do not escape newline characters.
- \`${WriteFileTool.Name}\` – Create or fully rewrite a file.
  - Example: { "file_path": "/absolute/new-file", "content": "full file contents" }
  - Prefer this for brand-new files or complete rewrites; use \`${EditTool.Name}\` for surgical edits.
- \`${ShellTool.Name}\` – Run project commands.
  - Example: { "command": "npm test", "description": "Run unit tests", "directory": "packages/api" }
  - Supply a concise description explaining the command and keep commands non-interactive.
- \`${MemoryTool.Name}\` – Persist user-specific preferences, but only when the user asks you to remember something.
  - Example: { "key": "preferred_style", "value": "use functional React components" }
- \`web_fetch\` – Fetch external documentation when the task explicitly requires it and the environment permits network access.

## Execution Tips
- Build absolute paths by combining the workspace root (visible in directory listings) with the relative path referenced in the prompt or prior tool output.
- Follow the pattern read → plan → \`${EditTool.Name}\`/\`${WriteFileTool.Name}\` → read again to confirm → \`${ShellTool.Name}\` for verification on every meaningful change.
- Use \`${ReadManyFilesTool.Name}\` or \`${GrepTool.Name}\` to gather evidence before modifying code and cite that evidence in your reasoning.
- Relay tool output verbatim—especially errors—so the user can follow your steps and see proof of the result.
- Avoid redundant reads when you already hold the necessary context in conversation memory; refer back to the earlier output instead of reissuing the same call.
`;

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
  
  // Add a reminder about disciplined execution
  enhancedPrompt += `\n\n## Important Reminders\n\n`;
  enhancedPrompt += `1. **Validate paths before acting** — confirm locations with \`${LSTool.Name}\` or \`${GlobTool.Name}\` so every file-based call stays inside the workspace.\n`;
  enhancedPrompt += `2. **Explain impactful actions** — provide a short rationale for edits and shell commands, and capture their output verbatim.\n`;
  enhancedPrompt += `3. **Close the loop** — after edits, run the relevant verification commands and state the result in your final summary.\n\n`;
  enhancedPrompt += `Remember: you are expected to take action, not merely offer advice. Use whichever tools best accomplish the user's goal.`;
  
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
