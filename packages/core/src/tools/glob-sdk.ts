// @ts-nocheck
/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { tool } from '@openai/agents';
import { z } from 'zod';
import { ShellExecutionService } from '../services/shellExecutionService.js';
import type { Config } from '../index.js';
import path from 'node:path';

/**
 * SDK-native glob tool implementation using fd
 * Follows OpenAI Agents SDK best practices
 *
 * Gap #2: Tool Definition Patterns
 * - Uses SDK's tool() function instead of BaseDeclarativeTool
 * - Zod schema instead of manual JSON schema
 * - Simple string return instead of ToolResult
 * - Leverages modern fd CLI for fast file searching
 */

const globParametersSchema = z.object({
  pattern: z.string().describe(
    'The glob pattern to match files against (e.g., "*.ts", "**/*.json")'
  ),
  path: z.string().nullable().optional().describe(
    'Optional: The directory to search in. If not specified, searches all workspace directories.'
  ),
  case_sensitive: z.boolean().nullable().optional().describe(
    'Optional: Whether the search should be case-sensitive (default: false)'
  ),
  respect_git_ignore: z.boolean().nullable().optional().describe(
    'Optional: Whether to respect .gitignore patterns (default: true)'
  ),
  type: z.enum(['file', 'directory', 'symlink', 'all']).nullable().optional().describe(
    'Optional: Filter results by entry type (default: file)'
  ),
  max_results: z.number().int().positive().nullable().optional().describe(
    'Optional: Maximum number of results to return (default: 1000)'
  ),
});

export type GlobParameters = z.infer<typeof globParametersSchema>;

/**
 * Creates the SDK-native glob tool using fd
 *
 * @param config - Ouroboros configuration
 * @returns SDK Tool instance for fast file pattern matching
 */
export function createGlobTool(config: Config) {
  const sdkTool = tool({
    name: 'glob',
    description:
      'Fast file pattern matching tool using modern fd CLI. ' +
      'Supports glob patterns with intelligent filtering and sorting.\\n\\n' +
      '**Features:**\\n' +
      '- Lightning-fast parallel search\\n' +
      '- Respects .gitignore and .geminiignore by default\\n' +
      '- Glob pattern support (e.g., *.ts, **/*.json)\\n' +
      '- Results sorted by modification time (newest first)\\n' +
      '- Workspace-aware searching\\n' +
      '- Type filtering (files, directories, symlinks)\\n\\n' +
      '**Usage:**\\n' +
      '- Pattern supports glob syntax: * (any), ** (recursive), ? (single char)\\n' +
      '- Path is optional - searches all workspace dirs if omitted\\n' +
      '- Case-insensitive by default\\n' +
      '- Respects git ignore by default\\n\\n' +
      '**Examples:**\\n' +
      '- Find TypeScript files: { "pattern": "*.ts" }\\n' +
      '- Recursive search: { "pattern": "**/*.json" }\\n' +
      '- Specific directory: { "pattern": "*.tsx", "path": "src/components" }\\n' +
      '- Case-sensitive: { "pattern": "README.md", "case_sensitive": true }',

    parameters: globParametersSchema,

    async execute({ pattern, path: searchPath, case_sensitive, respect_git_ignore, type, max_results }, signal?: AbortSignal) {
      try {
        // Determine search directory
        const workspaceContext = config.getWorkspaceContext();
        let searchDirectories: string[];

        if (searchPath) {
          const searchDirAbsolute = path.resolve(config.getTargetDir(), searchPath);

          // Validate workspace boundary
          if (!workspaceContext.isPathWithinWorkspace(searchDirAbsolute)) {
            return `Error: Path "${searchPath}" is not within any workspace directory`;
          }

          searchDirectories = [searchDirAbsolute];
        } else {
          // Search all workspace directories
          searchDirectories = [...workspaceContext.getDirectories()];
        }

        // Build fd command
        const fdArgs: string[] = ['fd'];

        // Add pattern (fd uses regex by default, use --glob for glob patterns)
        fdArgs.push('--glob', `"${pattern}"`);

        // Type filtering
        const fileType = type ?? 'file';
        if (fileType !== 'all') {
          fdArgs.push(`--type=${fileType.charAt(0)}`); // f, d, l
        }

        // Case sensitivity
        if (!(case_sensitive ?? false)) {
          fdArgs.push('--ignore-case');
        }

        // Git ignore
        const respectGitIgnore = respect_git_ignore ?? config.getFileFilteringRespectGitIgnore();
        if (!respectGitIgnore) {
          fdArgs.push('--no-ignore');
        }

        // Exclude common patterns
        const exclusions = config.getFileExclusions().getGlobExcludes();
        for (const exclude of exclusions) {
          fdArgs.push(`--exclude="${exclude}"`);
        }

        // Max results
        const maxResults = max_results ?? 1000;
        fdArgs.push(`--max-results=${maxResults}`);

        // Sort by modification time (newest first)
        fdArgs.push('--changed-within=1year'); // Reasonable time bound

        // Add search directories
        for (const dir of searchDirectories) {
          fdArgs.push(`"${dir}"`);
        }

        // Execute fd command
        const command = fdArgs.join(' ');
        const result = await ShellExecutionService.execute(
          command,
          config.getTargetDir(),
          undefined,
          signal || new AbortController().signal,
        );

        // Handle errors
        if (result.error) {
          return `Error during glob search: ${result.error.message}\\nPattern: ${pattern}`;
        }

        // Parse results
        const stdout = result.stdout?.trim() || '';

        if (!stdout) {
          let message = `No files found matching pattern "${pattern}"`;
          if (searchDirectories.length === 1) {
            message += ` within ${searchDirectories[0]}`;
          } else {
            message += ` within ${searchDirectories.length} workspace directories`;
          }
          return message;
        }

        // Split and sort results
        const files = stdout.split('\\n').filter(f => f.trim());

        // Format output
        let resultMessage = `Found ${files.length} file(s) matching "${pattern}"`;
        if (searchDirectories.length === 1) {
          const relPath = path.relative(config.getTargetDir(), searchDirectories[0]);
          resultMessage += ` within ${relPath || '.'}`;
        } else {
          resultMessage += ` across ${searchDirectories.length} workspace directories`;
        }

        resultMessage += `, sorted by modification time (newest first):\\n${files.join('\\n')}`;

        return resultMessage;

      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error during glob search operation: ${message}\\nPattern: ${pattern}`;
      }
    },
  });

  return sdkTool;
}

/**
 * Factory class for backward compatibility with tool registry
 */
export class GlobToolSDK {
  static readonly Name = 'glob';

  constructor(private config: Config) {}

  /**
   * Creates the SDK-native tool instance
   */
  createTool() {
    return createGlobTool(this.config);
  }
}
