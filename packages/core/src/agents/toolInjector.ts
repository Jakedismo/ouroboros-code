/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
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
import { LocalShellTool } from '../tools/local-shell.js';
import { ImageGenerationTool } from '../tools/image-generation.js';

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
const LOCAL_SHELL_TOOL_NAME = nameOf(LocalShellTool?.Name, 'local_shell');
const WRITE_FILE_TOOL_NAME = nameOf(WriteFileTool?.Name, 'write_file');
const MEMORY_TOOL_NAME = nameOf(MemoryTool?.Name, 'save_memory');
const WEB_FETCH_TOOL_NAME = nameOf(WebFetchTool?.Name, 'web_fetch');
const WEB_SEARCH_TOOL_NAME = nameOf(
  WebSearchTool?.Name,
  'google_web_search',
);
const IMAGE_GENERATION_TOOL_NAME = nameOf(
  ImageGenerationTool?.Name,
  'generate_image',
);

export interface SlashCommandSummary {
  name: string;
  description: string;
}

interface ToolGuide {
  key: string;
  primaryName: string;
  identifiers: string[];
  legacyClassName?: string;
  aliasNames?: string[];
  cheatSheetLines: string[];
}

const TOOL_GUIDES: ToolGuide[] = [
  {
    key: 'ls',
    primaryName: LS_TOOL_NAME,
    identifiers: [LS_TOOL_NAME, 'ls'],
    legacyClassName: 'LSTool',
    cheatSheetLines: [
      `- \`${LS_TOOL_NAME}\` – List directory entries.`,
      '  - Required keys: path (string, absolute directory that stays inside the workspace)',
      '  - Optional keys: ignore (string[]), file_filtering_options (respect_git_ignore/respect_gemini_ignore)',
      '  - Example: { "path": "/absolute/dir", "ignore": ["node_modules"] }',
      '  - Use to confirm file names or discover modules before editing.',
    ],
  },
  {
    key: 'glob',
    primaryName: GLOB_TOOL_NAME,
    identifiers: [GLOB_TOOL_NAME],
    legacyClassName: 'GlobTool',
    cheatSheetLines: [
      `- \`${GLOB_TOOL_NAME}\` – Locate files by pattern.`,
      '  - Required keys: pattern (string)',
      '  - Optional keys: path (string, workspace-relative search root), case_sensitive (boolean)',
      '  - Example: { "pattern": "src/**/*.ts", "path": "apps/api" }',
      '  - Use to narrow the set of files before deeper inspection.',
    ],
  },
  {
    key: 'grep',
    primaryName: GREP_TOOL_NAME,
    identifiers: [GREP_TOOL_NAME],
    legacyClassName: 'GrepTool',
    cheatSheetLines: [
      `- \`${GREP_TOOL_NAME}\` – Search within files (regex supported).`,
      '  - Required keys: pattern (string)',
      '  - Optional keys: path (string, workspace-relative), include (glob string)',
      '  - Example: { "pattern": "function foo", "path": "packages/service", "case_sensitive": false }',
      '  - Combine with glob results to focus on relevant files.',
    ],
  },
  {
    key: 'ripgrep',
    primaryName: RIPGREP_TOOL_NAME,
    identifiers: [RIPGREP_TOOL_NAME, 'ripgrep'],
    legacyClassName: 'RipGrepTool',
    cheatSheetLines: [
      `- \`${RIPGREP_TOOL_NAME}\` – High-volume code search using ripgrep semantics.`,
      '  - Required keys: pattern (string)',
      '  - Optional keys: path (string), include (string)',
      '  - Example: { "pattern": "createSlice", "path": "packages", "include": "**/*.ts" }',
    ],
  },
  {
    key: 'read_file',
    primaryName: READ_FILE_TOOL_NAME,
    identifiers: [READ_FILE_TOOL_NAME],
    legacyClassName: 'ReadFileTool',
    cheatSheetLines: [
      `- \`${READ_FILE_TOOL_NAME}\` – Inspect a file or excerpt.`,
      '  - Required keys: absolute_path (string)',
      '  - Optional keys: offset (number), limit (number)',
      '  - Example: { "absolute_path": "/absolute/file", "offset": 0, "limit": 200 }',
      '  - Provide offset/limit when the file is large to avoid repeated full reads.',
    ],
  },
  {
    key: 'read_many_files',
    primaryName: READ_MANY_FILES_TOOL_NAME,
    identifiers: [READ_MANY_FILES_TOOL_NAME],
    legacyClassName: 'ReadManyFilesTool',
    cheatSheetLines: [
      `- \`${READ_MANY_FILES_TOOL_NAME}\` – Read multiple files/snippets.`,
      '  - Required keys: paths (string[])',
      '  - Optional keys: include (string[]), exclude (string[]), file_filtering_options',
      '  - Example: { "paths": ["src", "package.json"], "include": ["**/*.md"], "exclude": ["dist/**"] }',
      '  - Paths are workspace-relative and can include glob patterns.',
    ],
  },
  {
    key: 'edit',
    primaryName: EDIT_TOOL_NAME,
    identifiers: [EDIT_TOOL_NAME],
    legacyClassName: 'EditTool',
    cheatSheetLines: [
      `- \`${EDIT_TOOL_NAME}\` – Replace an exact region in an existing file.`,
      '  - Required keys: file_path (string, absolute), old_string (string), new_string (string)',
      '  - Optional keys: expected_replacements (number)',
      '  - Example: { "file_path": "/absolute/file", "old_string": "current text", "new_string": "replacement", "expected_replacements": 1 }',
      '  - old_string must include surrounding context so the match is unique; do not escape newline characters.',
    ],
  },
  {
    key: 'write_file',
    primaryName: WRITE_FILE_TOOL_NAME,
    identifiers: [WRITE_FILE_TOOL_NAME],
    legacyClassName: 'WriteFileTool',
    cheatSheetLines: [
      `- \`${WRITE_FILE_TOOL_NAME}\` – Create or fully rewrite a file.`,
      '  - Required keys: file_path (string, absolute), content (string)',
      '  - Example: { "file_path": "/absolute/new-file", "content": "full file contents" }',
      '  - Prefer this for brand-new files or complete rewrites; use the replace tool for surgical edits.',
    ],
  },
  {
    key: 'shell',
    primaryName: SHELL_TOOL_NAME,
    identifiers: [SHELL_TOOL_NAME, LOCAL_SHELL_TOOL_NAME],
    legacyClassName: 'ShellTool',
    aliasNames: [LOCAL_SHELL_TOOL_NAME],
    cheatSheetLines: [
      `- \`${SHELL_TOOL_NAME}\` – Run project commands.`,
      `  - Alias: \`${LOCAL_SHELL_TOOL_NAME}\` is available for integrations expecting local_shell.`,
      '  - Required keys: command (string)',
      '  - Optional keys: description (string), directory (string)',
      '  - Example: { "command": "npm test", "description": "Run unit tests", "directory": "packages/api" }',
      '  - Supply a concise description explaining the command and keep commands non-interactive.',
    ],
  },
  {
    key: 'memory',
    primaryName: MEMORY_TOOL_NAME,
    identifiers: [MEMORY_TOOL_NAME],
    legacyClassName: 'MemoryTool',
    cheatSheetLines: [
      `- \`${MEMORY_TOOL_NAME}\` – Persist user-specific preferences, but only when the user asks you to remember something.`,
      '  - Required keys: fact (string)',
      '  - Example: { "fact": "My favorite editor is VS Code" }',
    ],
  },
  {
    key: 'web_fetch',
    primaryName: WEB_FETCH_TOOL_NAME,
    identifiers: [WEB_FETCH_TOOL_NAME],
    legacyClassName: 'WebFetchTool',
    cheatSheetLines: [
      `- \`${WEB_FETCH_TOOL_NAME}\` – Fetch documentation from specific URLs when external network access is allowed.`,
      '  - Required keys: prompt (string)',
      '  - Example: { "prompt": "Fetch https://example.com/docs/config and summarise installation steps" }',
    ],
  },
  {
    key: 'web_search',
    primaryName: WEB_SEARCH_TOOL_NAME,
    identifiers: [WEB_SEARCH_TOOL_NAME, 'web_search'],
    legacyClassName: 'WebSearchTool',
    cheatSheetLines: [
      `- \`${WEB_SEARCH_TOOL_NAME}\` – Perform a Google web search (requires network-enabled provider).`,
      '  - Required keys: query (string)',
      '  - Example: { "query": "latest Node.js LTS release" }',
      '  - Treat this as a last resort once repository evidence and fetched documentation have been exhausted. Summarize results with source citations and explain if search is unavailable.',
    ],
  },
  {
    key: 'image',
    primaryName: IMAGE_GENERATION_TOOL_NAME,
    identifiers: [IMAGE_GENERATION_TOOL_NAME],
    legacyClassName: 'ImageGenerationTool',
    cheatSheetLines: [
      `- \`${IMAGE_GENERATION_TOOL_NAME}\` – Generate a placeholder SVG to scaffold visual assets.`,
      '  - Required keys: prompt (string)',
      '  - Optional keys: width (integer), height (integer), backgroundColor (string), textColor (string)',
      '  - Example: { "prompt": "Dark UI dashboard hero", "width": 1280, "height": 720 }',
    ],
  },
];

const DEFAULT_SLASH_COMMANDS: SlashCommandSummary[] = [
  { name: '/help', description: 'List available commands and usage hints.' },
  { name: '/agents', description: 'Show the active specialists and manage their roster.' },
  { name: '/agent', description: 'Activate or deactivate a specific specialist agent.' },
  { name: '/tools', description: 'Display tool availability and approval settings for this session.' },
  { name: '/stats', description: 'Summarize tool usage, token counts, and session timing.' },
  { name: '/memory', description: 'Inspect or clear stored user memories.' },
  { name: '/docs', description: 'Open documentation for commands, prompts, and workflows.' },
  { name: '/model', description: 'Switch the underlying language model.' },
  { name: '/provider', description: 'Change the model provider (Gemini, OpenAI, Anthropic).' },
  { name: '/clear', description: 'Reset the visible chat history without ending the session.' },
];

const LEGACY_SHARED_TOOLING_APPENDIX = `
# Tool Operations Playbook

## Environment Primer
- You are operating entirely inside the user's checked-out repository. Treat the workspace on disk as the source of truth for code, tests, and configuration.
- Resolve questions by inspecting files and running local commands before considering external sources. Reach for web search only when the repository cannot reasonably answer the question (for example, to check upstream release notes or API docs).
- Every tool call, path, and command must stay within the workspace sandbox. Never assume network access for anything except the explicit web tools provided.

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
${TOOL_GUIDES.map((guide) => guide.cheatSheetLines.join('\n')).join('\n')}

## Execution Tips
- Build absolute paths by combining the workspace root (visible in directory listings) with the relative path referenced in the prompt or prior tool output.
- Follow the pattern read → plan → \`${EDIT_TOOL_NAME}\`/\`${WRITE_FILE_TOOL_NAME}\` → read again to confirm → \`${SHELL_TOOL_NAME}\` for verification on every meaningful change.
- Use \`${READ_MANY_FILES_TOOL_NAME}\` or \`${GREP_TOOL_NAME}\` to gather evidence before modifying code and cite that evidence in your reasoning.
- Relay tool output verbatim—especially errors—so the user can follow your steps and see proof of the result.
- Avoid redundant reads when you already hold the necessary context in conversation memory; refer back to the earlier output instead of reissuing the same call.

## Ouroboros Slash Commands

In addition to the core tools above, you can leverage these powerful slash commands for specialized tasks:

${DEFAULT_SLASH_COMMANDS.map((command) => `- **${command.name}** - ${command.description}`).join('\n')}

## Important Reminders

1. **Validate paths before acting** — confirm locations with \`${LS_TOOL_NAME}\` or \`${GLOB_TOOL_NAME}\` so every file-based call stays inside the workspace.
2. **Explain impactful actions** — provide a short rationale for edits and shell commands, and capture their output verbatim.
3. **Close the loop** — after edits, run the relevant verification commands and state the result in your final summary.

Remember: you are expected to take action, not merely offer advice. Use whichever tools best accomplish the user's goal.
`;

function isToolActive(config: Config, guide: ToolGuide): boolean {
  if (!config.isToolEnabled(guide.identifiers, guide.legacyClassName)) {
    return false;
  }

  const registry = config.getToolRegistry();
  return guide.identifiers.some((id) => !!registry.getTool(id));
}

function pickGuides(keys: string[], available: Map<string, ToolGuide>): ToolGuide[] {
  return keys
    .map((key) => available.get(key))
    .filter((guide): guide is ToolGuide => Boolean(guide));
}

function formatToolList(names: string[]): string {
  if (names.length === 0) {
    return '';
  }
  return names.map((name) => `\`${name}\``).join(', ');
}

function resolveName(
  available: Map<string, ToolGuide>,
  key: string,
  fallback: string,
): string {
  return available.get(key)?.primaryName ?? fallback;
}

function buildCorePrimer(available: Map<string, ToolGuide>): string {
  const reconGuides = pickGuides(
    ['ls', 'glob', 'read_file', 'read_many_files', 'grep'],
    available,
  );
  const reconStep = reconGuides.length
    ? `1. **Recon:** Map the target area with ${formatToolList(
        reconGuides.map((guide) => guide.primaryName),
      )}.`
    : '1. **Recon:** Map the target area with whichever inspection tools are available.';

  const implementGuides = pickGuides(['edit', 'write_file'], available);
  const implementTools = implementGuides.map((guide) => guide.primaryName);
  const implementStep = implementTools.length
    ? `3. **Implement:** Apply precise changes with ${formatToolList(
        implementTools,
      )}.`
    : '3. **Implement:** Apply precise, minimal changes using the available editing tools.';

  const verifyGuides = pickGuides(['shell'], available);
  const verifyStep = verifyGuides.length
    ? `4. **Verify:** Run ${formatToolList(
        verifyGuides.map((guide) => guide.primaryName),
      )} commands (tests, builds, linters) that prove the change works. Capture any failure output verbatim.`
    : '4. **Verify:** Run the appropriate project commands that demonstrate the change works, capturing any failure output verbatim.';

  return [
    '# Tool Operations Playbook',
    '## Environment Primer',
    '- You are operating entirely inside the user\'s checked-out repository. Treat the workspace on disk as the source of truth for code, tests, and configuration.',
    '- Resolve questions by inspecting files and running local commands before considering external sources. Reach for web search only when the repository cannot reasonably answer the question.',
    '- Every tool call, path, and command must stay within the workspace sandbox. Never assume network access for anything except the explicit web tools provided.',
    '## Ground Rules',
    '- Keep every file or directory reference inside the workspace root shown in this session. Provide absolute paths (for example, "/workspace/app/src/index.ts"), never relative paths such as "./src/index.ts".',
    '- Inspect existing code before editing and run the appropriate verification commands after editing to confirm the change.',
    '- Batch reconnaissance calls (listing, globbing, searching) when they do not depend on each other, but execute edits and shell commands sequentially so you can observe each result.',
    '## Standard Loop',
    reconStep,
    '2. **Plan:** Outline the minimal set of edits and tests you will perform, referencing concrete files and commands.',
    implementStep,
    verifyStep,
    '5. **Report:** Summarize the change, the verification performed, and remaining risks in your final response.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function buildCheatSheet(availableGuides: ToolGuide[]): string {
  if (availableGuides.length === 0) {
    return '';
  }

  const sorted = [...availableGuides].sort((a, b) =>
    a.primaryName.localeCompare(b.primaryName),
  );

  const lines: string[] = ['## Core Tools Cheat Sheet (arguments shown in JSON)'];
  for (const guide of sorted) {
    lines.push(...guide.cheatSheetLines);
  }
  return lines.join('\n');
}

function buildExecutionTips(available: Map<string, ToolGuide>): string {
  const lsName = resolveName(available, 'ls', 'directory listing tools');
  const globName = resolveName(available, 'glob', 'glob search tools');
  const editName = resolveName(available, 'edit', 'editing tools');
  const writeName = resolveName(available, 'write_file', 'writing tools');
  const shellName = resolveName(available, 'shell', 'project commands');
  const readManyName = resolveName(
    available,
    'read_many_files',
    'batch reading tools',
  );
  const grepName = resolveName(available, 'grep', 'search tools');

  return [
    '## Execution Tips',
    `- Build absolute paths by combining the workspace root with the relative path referenced in the prompt or prior tool output. Validate with ${formatToolList(
      [lsName, globName],
    )}.`,
    `- Follow the pattern read → plan → ${formatToolList([
      editName,
      writeName,
    ])} → read again to confirm → ${shellName} for verification on every meaningful change.`,
    `- Use ${formatToolList([
      readManyName,
      grepName,
    ])} to gather evidence before modifying code and cite that evidence in your reasoning.`,
    '- Relay tool output verbatim—especially errors—so the user can follow your steps and see proof of the result.',
    '- Avoid redundant reads when you already hold the necessary context in conversation memory; refer back to earlier output instead of repeating the call.',
  ].join('\n');
}

function buildImportantReminders(available: Map<string, ToolGuide>): string {
  const lsName = resolveName(available, 'ls', LS_TOOL_NAME);
  const globName = resolveName(available, 'glob', GLOB_TOOL_NAME);
  const shellName = resolveName(available, 'shell', SHELL_TOOL_NAME);

  return [
    '## Important Reminders',
    `1. **Validate paths before acting** — confirm locations with ${formatToolList([
      lsName,
      globName,
    ])} so every file-based call stays inside the workspace.`,
    '2. **Explain impactful actions** — provide a short rationale for edits and shell commands, and capture their output verbatim.',
    `3. **Close the loop** — after edits, run the relevant verification commands with ${shellName} (or equivalent) and state the result in your final summary.`,
    '',
    'Remember: you are expected to take action, not merely offer advice. Use whichever tools best accomplish the user\'s goal.',
  ].join('\n');
}

function buildSlashCommandSection(
  slashCommands: SlashCommandSummary[],
): string {
  if (slashCommands.length === 0) {
    return '';
  }

  const lines = ['## Ouroboros Slash Commands', '', 'These commands complement your tools:'];
  for (const { name, description } of slashCommands) {
    lines.push(`- **${name}** - ${description}`);
  }
  return lines.join('\n');
}

export function buildSharedToolingAppendix(
  config: Config,
  options: { slashCommandSummaries?: SlashCommandSummary[] } = {},
): string {
  const activeGuides = TOOL_GUIDES.filter((guide) => isToolActive(config, guide));
  const availableMap = new Map<string, ToolGuide>(
    activeGuides.map((guide) => [guide.key, guide]),
  );

  const sections: string[] = [];
  sections.push(buildCorePrimer(availableMap));
  const cheatSheet = buildCheatSheet(activeGuides);
  if (cheatSheet) {
    sections.push(cheatSheet);
  }
  sections.push(buildExecutionTips(availableMap));

  const slashCommands =
    options.slashCommandSummaries ?? DEFAULT_SLASH_COMMANDS;
  const slashSection = buildSlashCommandSection(slashCommands);
  if (slashSection) {
    sections.push(slashSection);
  }

  sections.push(buildImportantReminders(availableMap));

  if (
    process.env['OUROBOROS_DEBUG_TOOL_EXAMPLES'] ||
    process.env['OUROBOROS_DEBUG']
  ) {
    const enabledNames = activeGuides.flatMap((guide) => [
      guide.primaryName,
      ...(guide.aliasNames ?? []),
    ]);
    console.debug(
      '[ToolInjector] shared appendix covers tools:',
      enabledNames.join(', '),
    );
  }

  return sections.join('\n\n');
}

export interface ToolInjectionOptions {
  includeSharedAppendix?: boolean;
  config?: Config;
  slashCommandSummaries?: SlashCommandSummary[];
}

export function injectToolExamples(
  agentPrompt: string,
  agentSpecialties: string[] = [],
  options: ToolInjectionOptions = {},
): string {
  const { includeSharedAppendix = true } = options;
  const trimmedPrompt = agentPrompt.trim();
  const blocks: string[] = [trimmedPrompt];

  if (agentSpecialties.length > 0) {
    const specialtyList = agentSpecialties
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, 6);
    if (specialtyList.length > 0) {
      blocks.push(
        '### Engagement Focus',
        `- Prioritize user needs tied to: ${specialtyList.join(', ')}.`,
        '- Cite evidence from repository tools before recommending architectural changes.',
        '- Keep reasoning concise and actionable so the orchestrator can merge contributions quickly.',
      );
    }
  }

  blocks.push(
    '### Collaboration Principles',
    '- Surface key findings in bullet form and flag open questions explicitly.',
    '- Reference earlier context instead of repeating tool calls when the evidence is already available.',
    '- Hand off follow-up work by naming the ideal specialist (by agent ID) when another perspective is required.',
  );

  if (includeSharedAppendix) {
    if (options.config) {
      blocks.push(
        buildSharedToolingAppendix(options.config, {
          slashCommandSummaries: options.slashCommandSummaries,
        }),
      );
    } else {
      blocks.push(LEGACY_SHARED_TOOLING_APPENDIX.trim());
    }
  }

  return blocks.join('\n\n');
}

export function getAvailableToolNames(): string[] {
  const names = new Set<string>();
  for (const guide of TOOL_GUIDES) {
    for (const identifier of guide.identifiers) {
      names.add(identifier);
    }
    for (const alias of guide.aliasNames ?? []) {
      names.add(alias);
    }
  }
  return Array.from(names);
}
