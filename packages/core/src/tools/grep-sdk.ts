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
 * SDK-native grep tool implementation using ripgrep (rg)
 * Follows OpenAI Agents SDK best practices
 *
 * Gap #2: Tool Definition Patterns
 * - Uses SDK's tool() function instead of BaseDeclarativeTool
 * - Zod schema instead of manual JSON schema
 * - Simple string return instead of ToolResult
 * - Leverages modern ripgrep CLI for blazing-fast search
 */

const grepParametersSchema = z.object({
  pattern: z.string().describe(
    'The regular expression pattern to search for in file contents'
  ),
  path: z.string().nullable().optional().describe(
    'Optional: The directory to search in (relative to workspace root). ' +
    'If not specified, searches all workspace directories.'
  ),
  include: z.string().nullable().optional().describe(
    'Optional: File pattern to include in the search (e.g., "*.js", "*.{ts,tsx}")'
  ),
  case_sensitive: z.boolean().nullable().optional().describe(
    'Optional: Whether the search should be case-sensitive (default: false)'
  ),
  max_matches: z.number().int().positive().nullable().optional().describe(
    'Optional: Maximum number of matches to return (default: 1000)'
  ),
  context_lines: z.number().int().nonnegative().nullable().optional().describe(
    'Optional: Number of context lines to show before and after each match (default: 0)'
  ),
});

export type GrepParameters = z.infer<typeof grepParametersSchema>;

/**
 * Creates the SDK-native grep tool using ripgrep
 *
 * @param config - Ouroboros configuration
 * @returns SDK Tool instance for ultra-fast content search
 */
export function createGrepTool(config: Config) {
  const sdkTool = tool({
    name: 'grep',
    description:
      'Blazing-fast content search tool using ripgrep (rg). ' +
      'Searches for regex patterns in file contents with intelligent filtering.\\n\\n' +
      '**Features:**\\n' +
      '- Ultra-fast parallel regex search\\n' +
      '- Respects .gitignore by default\\n' +
      '- File type filtering (e.g., *.ts, *.{js,jsx})\\n' +
      '- Context lines support\\n' +
      '- Workspace-aware searching\\n' +
      '- Results grouped by file with line numbers\\n\\n' +
      '**Usage:**\\n' +
      '- Pattern uses regex syntax (e.g., "function\\\\s+\\\\w+", "TODO:")\\n' +
      '- Include supports glob patterns for file filtering\\n' +
      '- Case-insensitive by default\\n' +
      '- Context lines show surrounding code\\n\\n' +
      '**Examples:**\\n' +
      '- Simple search: { "pattern": "import React" }\\n' +
      '- With file filter: { "pattern": "TODO", "include": "*.ts" }\\n' +
      '- Specific directory: { "pattern": "useState", "path": "src/components" }\\n' +
      '- With context: { "pattern": "export", "context_lines": 2 }',

    parameters: grepParametersSchema,

    async execute({ pattern, path: searchPath, include, case_sensitive, max_matches, context_lines }, signal?: AbortSignal) {
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

        // Build ripgrep command
        const rgArgs: string[] = ['rg'];

        // Pattern
        rgArgs.push(`"${pattern}"`);

        // Case sensitivity
        if (!(case_sensitive ?? false)) {
          rgArgs.push('--ignore-case');
        }

        // File filtering
        if (include) {
          rgArgs.push(`--glob="${include}"`);
        }

        // Line numbers and formatting
        rgArgs.push('--line-number', '--no-heading', '--with-filename');

        // Context lines
        const contextLines = context_lines ?? 0;
        if (contextLines > 0) {
          rgArgs.push(`--context=${contextLines}`);
        }

        // Max matches
        const maxMatches = max_matches ?? 1000;
        rgArgs.push(`--max-count=${maxMatches}`);

        // Color for better parsing (disabled for clean output)
        rgArgs.push('--color=never');

        // Follow symlinks
        rgArgs.push('--follow');

        // Add search directories
        for (const dir of searchDirectories) {
          rgArgs.push(`"${dir}"`);
        }

        // Execute ripgrep
        const command = rgArgs.join(' ');
        const result = await ShellExecutionService.execute(
          command,
          config.getTargetDir(),
          undefined,
          signal || new AbortController().signal,
        );

        // Handle no matches (rg returns exit code 1 for no matches)
        if (result.exitCode === 1 || (!result.stdout || !result.stdout.trim())) {
          let searchLocation = searchPath
            ? `in path "${searchPath}"`
            : searchDirectories.length > 1
            ? `across ${searchDirectories.length} workspace directories`
            : `in the workspace directory`;

          let message = `No matches found for pattern "${pattern}" ${searchLocation}`;
          if (include) {
            message += ` (filter: "${include}")`;
          }
          return message;
        }

        // Handle other errors
        if (result.error && result.exitCode !== 1) {
          return `Error during grep search: ${result.error.message}\\nPattern: ${pattern}`;
        }

        // Parse ripgrep output
        const stdout = result.stdout?.trim() || '';
        const lines = stdout.split('\\n');

        // Group matches by file
        const matchesByFile: Record<string, Array<{ lineNumber: number; line: string }>> = {};

        for (const line of lines) {
          if (!line.trim()) continue;

          // Parse rg output format: file:line_number:content
          const firstColon = line.indexOf(':');
          if (firstColon === -1) continue;

          const secondColon = line.indexOf(':', firstColon + 1);
          if (secondColon === -1) continue;

          const filePath = line.substring(0, firstColon);
          const lineNumber = parseInt(line.substring(firstColon + 1, secondColon), 10);
          const content = line.substring(secondColon + 1);

          if (!isNaN(lineNumber)) {
            if (!matchesByFile[filePath]) {
              matchesByFile[filePath] = [];
            }
            matchesByFile[filePath].push({ lineNumber, line: content });
          }
        }

        // Format output
        const totalMatches = Object.values(matchesByFile).reduce((sum, matches) => sum + matches.length, 0);
        const fileCount = Object.keys(matchesByFile).length;

        let searchLocation = searchPath
          ? `in path "${searchPath}"`
          : searchDirectories.length > 1
          ? `across ${searchDirectories.length} workspace directories`
          : `in the workspace directory`;

        let output = `Found ${totalMatches} match(es) in ${fileCount} file(s) for pattern "${pattern}" ${searchLocation}`;
        if (include) {
          output += ` (filter: "${include}")`;
        }
        output += ':\\n---\\n';

        // Add matches grouped by file
        for (const [filePath, matches] of Object.entries(matchesByFile)) {
          const relativePath = path.relative(config.getTargetDir(), filePath);
          output += `File: ${relativePath}\\n`;

          for (const match of matches) {
            const trimmedLine = match.line.trim();
            output += `L${match.lineNumber}: ${trimmedLine}\\n`;
          }
          output += '---\\n';
        }

        return output.trim();

      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error during grep search operation: ${message}\\nPattern: ${pattern}`;
      }
    },
  });

  return sdkTool;
}

/**
 * Factory class for backward compatibility with tool registry
 */
export class GrepToolSDK {
  static readonly Name = 'grep';

  constructor(private config: Config) {}

  /**
   * Creates the SDK-native tool instance
   */
  createTool() {
    return createGrepTool(this.config);
  }
}
