/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { tool } from '@openai/agents';
import { z } from 'zod';
import { ShellExecutionService } from '../services/shellExecutionService.js';
import type { Config } from '../index.js';
import { makeRelative } from '../utils/paths.js';

/**
 * SDK-native ls tool implementation using eza
 * Follows OpenAI Agents SDK best practices
 *
 * Gap #2: Tool Definition Patterns
 * - Uses SDK's tool() function instead of BaseDeclarativeTool
 * - Zod schema instead of manual JSON schema
 * - Simple string return instead of ToolResult
 * - Leverages modern eza CLI for enhanced directory listing
 */

const lsParametersSchema = z.object({
  path: z.string().describe(
    'The absolute path to the directory to list. ' +
    'Must be an absolute path, not a relative path.'
  ),
  ignore: z.array(z.string()).nullable().optional().describe(
    'Optional: Array of glob patterns to ignore (e.g., ["*.log", "node_modules"])'
  ),
  file_filtering_options: z.object({
    respect_git_ignore: z.boolean().nullable().optional(),
    respect_gemini_ignore: z.boolean().nullable().optional(),
  }).nullable().optional().describe(
    'Optional: File filtering options for .gitignore and .geminiignore'
  ),
  tree: z.boolean().nullable().optional().describe(
    'Optional: Display directory structure as a tree (default: false)'
  ),
  level: z.number().int().positive().nullable().optional().describe(
    'Optional: Maximum depth for tree view (default: 2)'
  ),
});

export type LSParameters = z.infer<typeof lsParametersSchema>;

/**
 * Creates the SDK-native ls tool using eza
 *
 * @param config - Ouroboros configuration
 * @returns SDK Tool instance for enhanced directory listing
 */
export function createLSTool(config: Config) {
  const sdkTool = tool({
    name: 'ls',
    description:
      'Lists the contents of a directory using modern eza CLI tool. ' +
      'Provides enhanced directory listing with git status, file types, and tree views.\\n\\n' +
      '**Features:**\\n' +
      '- Git status integration (modified, staged, untracked files)\\n' +
      '- Respects .gitignore and .geminiignore patterns\\n' +
      '- Tree view support for nested directory visualization\\n' +
      '- File type indicators and size information\\n' +
      '- Sorted output (directories first, then alphabetically)\\n\\n' +
      '**Usage:**\\n' +
      '- The path parameter must be an absolute path\\n' +
      '- Use tree: true for hierarchical directory structure\\n' +
      '- Customize depth with level parameter (default: 2)\\n' +
      '- Ignore patterns support glob syntax\\n\\n' +
      '**Examples:**\\n' +
      '- Basic listing: { "path": "/workspace/src" }\\n' +
      '- Tree view: { "path": "/workspace", "tree": true, "level": 3 }\\n' +
      '- With ignores: { "path": "/workspace", "ignore": ["*.log", "node_modules"] }',

    parameters: lsParametersSchema,

    async execute({ path, ignore, file_filtering_options, tree, level }, signal?: AbortSignal) {
      try {
        // Validation: Must be absolute path
        if (!path.startsWith('/')) {
          return `Error: The path must be an absolute path, but received: ${path}\\n` +
                 `Please provide an absolute path starting with '/'.`;
        }

        // Build eza command with options
        const ezaArgs: string[] = ['eza'];

        // Long listing format with git status
        ezaArgs.push('--long', '--git', '--group-directories-first');

        // Tree view if requested
        if (tree) {
          ezaArgs.push('--tree');
          const treeLevel = level ?? 2;
          ezaArgs.push(`--level=${treeLevel}`);
        }

        // Git ignore handling
        const respectGitIgnore = file_filtering_options?.respect_git_ignore ?? true;
        if (respectGitIgnore) {
          ezaArgs.push('--git-ignore');
        }

        // Add ignore patterns
        if (ignore && ignore.length > 0) {
          for (const pattern of ignore) {
            ezaArgs.push(`--ignore-glob="${pattern}"`);
          }
        }

        // Add target directory
        ezaArgs.push(`"${path}"`);

        // Execute eza command
        const command = ezaArgs.join(' ');
        const result = await ShellExecutionService.execute(
          command,
          config.getTargetDir(),
          undefined,
          signal || new AbortController().signal,
        );

        // Handle errors
        if (result.error) {
          // Check for common errors
          if (result.stderr?.includes('No such file or directory')) {
            return `Error: Directory not found: ${path}`;
          }
          if (result.stderr?.includes('Not a directory')) {
            return `Error: Path is not a directory: ${path}`;
          }
          if (result.stderr?.includes('Permission denied')) {
            return `Error: Permission denied accessing: ${path}`;
          }

          return `Error: ${result.error.message}\\nPath: ${path}`;
        }

        // Handle empty directories
        if (!result.stdout || result.stdout.trim() === '') {
          const relativePath = makeRelative(path, config.getTargetDir());
          return `Directory ${relativePath} is empty.`;
        }

        // Return eza output with context
        const relativePath = makeRelative(path, config.getTargetDir());
        let output = `Directory listing for ${relativePath}:\\n\\n${result.stdout}`;

        // Add gemini ignore filtering note if applicable
        const respectGeminiIgnore = file_filtering_options?.respect_gemini_ignore ?? true;
        if (respectGeminiIgnore) {
          output += '\\n\\nNote: .geminiignore patterns are respected';
        }

        return output;

      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error listing directory: ${message}\\nPath: ${path}`;
      }
    },
  });

  return sdkTool;
}

/**
 * Factory class for backward compatibility with tool registry
 */
export class LSToolSDK {
  static readonly Name = 'ls';

  constructor(private config: Config) {}

  /**
   * Creates the SDK-native tool instance
   */
  createTool() {
    return createLSTool(this.config);
  }
}
