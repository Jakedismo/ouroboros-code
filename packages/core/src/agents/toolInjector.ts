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
import { WebFetchTool } from '../tools/web-fetch.js';
import { WebSearchTool } from '../tools/web-search.js';
import { RipGrepTool } from '../tools/ripGrep.js';

const nameOf = (name: string | undefined, fallback: string): string =>
  typeof name === 'string' && name.length > 0 ? name : fallback;

const LS_TOOL_NAME = nameOf(LSTool?.Name, 'list_directory');
const EDIT_TOOL_NAME = nameOf(EditTool?.Name, 'replace');
const GLOB_TOOL_NAME = nameOf(GlobTool?.Name, 'glob');
const GREP_TOOL_NAME = nameOf(GrepTool?.Name, 'search_file_content');
const RIPGREP_TOOL_NAME = nameOf(RipGrepTool?.Name, 'ripgrep_search');
const READ_FILE_TOOL_NAME = nameOf(ReadFileTool?.Name, 'read_file');
const READ_MANY_FILES_TOOL_NAME = nameOf(
  ReadManyFilesTool?.Name,
  'read_many_files',
);
const SHELL_TOOL_NAME = nameOf(ShellTool?.Name, 'run_shell_command');
const WRITE_FILE_TOOL_NAME = nameOf(WriteFileTool?.Name, 'write_file');
const MEMORY_TOOL_NAME = nameOf(MemoryTool?.Name, 'save_memory');
const WEB_FETCH_TOOL_NAME = nameOf(WebFetchTool?.Name, 'web_fetch');
const WEB_SEARCH_TOOL_NAME = nameOf(
  WebSearchTool?.Name,
  'google_web_search',
);


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
1. **Recon:** Map the target area with \`${LS_TOOL_NAME}\`, \`${GLOB_TOOL_NAME}\`, \`${READ_FILE_TOOL_NAME}\`, \`${READ_MANY_FILES_TOOL_NAME}\`, and \`${GREP_TOOL_NAME}\`.
2. **Plan:** Outline the minimal set of edits and tests you will perform, referencing concrete files and commands.
3. **Implement:** Apply precise changes with \`${EDIT_TOOL_NAME}\` for localized replacements or \`${WRITE_FILE_TOOL_NAME}\` when creating or rewriting full files.
4. **Verify:** Run \`${SHELL_TOOL_NAME}\` commands (tests, builds, linters) that prove the change works. Capture any failure output verbatim.
5. **Report:** Summarize the change, the verification performed, and remaining risks in your final response.

## Core Tools Cheat Sheet (arguments shown in JSON)
- \`${LS_TOOL_NAME}\` – List directory entries.
  - Required keys: path (string, absolute directory that stays inside the workspace)
  - Optional keys: ignore (string[]), file_filtering_options (respect_git_ignore/respect_gemini_ignore)
  - Example: { "path": "/absolute/dir", "ignore": ["node_modules"] }
  - Use to confirm file names or discover modules before editing.
- \`${GLOB_TOOL_NAME}\` – Locate files by pattern.
  - Required keys: pattern (string)
  - Optional keys: path (string, workspace-relative search root), case_sensitive (boolean)
  - Example: { "pattern": "src/**/*.ts", "path": "apps/api" }
  - Use to narrow the set of files before deeper inspection.
- \`${GREP_TOOL_NAME}\` – Search within files (regex supported).
  - Required keys: pattern (string)
  - Optional keys: path (string, workspace-relative), include (glob string)
  - Example: { "pattern": "function foo", "path": "packages/service", "case_sensitive": false }
  - Combine with glob results to focus on relevant files.
- \`${READ_FILE_TOOL_NAME}\` – Inspect a file or excerpt.
  - Required keys: absolute_path (string)
  - Optional keys: offset (number), limit (number)
  - Example: { "absolute_path": "/absolute/file", "offset": 0, "limit": 200 }
  - Provide 'offset'/'limit' when the file is large to avoid repeated full reads.
- \`${READ_MANY_FILES_TOOL_NAME}\` – Read multiple files/snippets.
  - Required keys: paths (string[])
  - Optional keys: include (string[]), exclude (string[]), file_filtering_options
  - Example: { "paths": ["src", "package.json"], "include": ["**/*.md"], "exclude": ["dist/**"] }
  - 'paths' are workspace-relative and can include glob patterns.
- \`${EDIT_TOOL_NAME}\` – Replace an exact region in an existing file.
  - Required keys: file_path (string, absolute), old_string (string), new_string (string)
  - Optional keys: expected_replacements (number)
  - Example: { "file_path": "/absolute/file", "old_string": "current text", "new_string": "replacement", "expected_replacements": 1 }
  - 'old_string' must include surrounding context so the match is unique; do not escape newline characters.
- \`${WRITE_FILE_TOOL_NAME}\` – Create or fully rewrite a file.
  - Required keys: file_path (string, absolute), content (string)
  - Example: { "file_path": "/absolute/new-file", "content": "full file contents" }
  - Prefer this for brand-new files or complete rewrites; use \`${EDIT_TOOL_NAME}\` for surgical edits.
- \`${SHELL_TOOL_NAME}\` – Run project commands.
  - Required keys: command (string)
  - Optional keys: description (string), directory (string)
  - Example: { "command": "npm test", "description": "Run unit tests", "directory": "packages/api" }
  - Supply a concise description explaining the command and keep commands non-interactive.
- \`${MEMORY_TOOL_NAME}\` – Persist user-specific preferences, but only when the user asks you to remember something.
  - Required keys: fact (string)
  - Example: { "fact": "My favorite editor is VS Code" }
- \`${RIPGREP_TOOL_NAME}\` – High-volume code search using ripgrep semantics.
  - Required keys: pattern (string)
  - Optional keys: path (string), include (string)
  - Example: { "pattern": "createSlice", "path": "packages", "include": "**/*.ts" }
- \`${WEB_FETCH_TOOL_NAME}\` – Fetch documentation from specific URLs when external network access is allowed.
  - Required keys: prompt (string)
  - Example: { "prompt": "Fetch https://example.com/docs/config and summarise installation steps" }
- \`${WEB_SEARCH_TOOL_NAME}\` – Perform a Google web search via Gemini to gather recent information.
  - Required keys: query (string)
  - Example: { "query": "latest Node.js LTS release" }

## Execution Tips
- Build absolute paths by combining the workspace root (visible in directory listings) with the relative path referenced in the prompt or prior tool output.
- Follow the pattern read → plan → \`${EDIT_TOOL_NAME}\`/\`${WRITE_FILE_TOOL_NAME}\` → read again to confirm → \`${SHELL_TOOL_NAME}\` for verification on every meaningful change.
- Use \`${READ_MANY_FILES_TOOL_NAME}\` or \`${GREP_TOOL_NAME}\` to gather evidence before modifying code and cite that evidence in your reasoning.
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
  
  // Add the core tool instructions
  enhancedPrompt += CORE_TOOL_INSTRUCTIONS;
  
  // Add slash command examples
  enhancedPrompt += SLASH_COMMAND_EXAMPLES;
  
  // Add a reminder about disciplined execution
  enhancedPrompt += `\n\n## Important Reminders\n\n`;
  enhancedPrompt += `1. **Validate paths before acting** — confirm locations with \`${LS_TOOL_NAME}\` or \`${GLOB_TOOL_NAME}\` so every file-based call stays inside the workspace.\n`;
  enhancedPrompt += `2. **Explain impactful actions** — provide a short rationale for edits and shell commands, and capture their output verbatim.\n`;
  enhancedPrompt += `3. **Close the loop** — after edits, run the relevant verification commands and state the result in your final summary.\n\n`;
  enhancedPrompt += `Remember: you are expected to take action, not merely offer advice. Use whichever tools best accomplish the user's goal.`;
  
  return enhancedPrompt;
}

/**
 * Get available tool names for reference
 */
export function getAvailableToolNames(): string[] {
  return [
    LS_TOOL_NAME,
    EDIT_TOOL_NAME,
    GLOB_TOOL_NAME,
    GREP_TOOL_NAME,
    READ_FILE_TOOL_NAME,
    READ_MANY_FILES_TOOL_NAME,
    SHELL_TOOL_NAME,
    WRITE_FILE_TOOL_NAME,
    MEMORY_TOOL_NAME,
    WEB_FETCH_TOOL_NAME,
    WEB_SEARCH_TOOL_NAME,
    RIPGREP_TOOL_NAME,
  ];
}
