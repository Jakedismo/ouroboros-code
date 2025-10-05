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
import * as fs from 'node:fs/promises';

/**
 * SDK-native read-many-files tool using bat for syntax-highlighted reading
 * Follows OpenAI Agents SDK best practices
 *
 * Gap #2: Tool Definition Patterns
 * - Uses SDK's tool() function instead of BaseDeclarativeTool
 * - Zod schema instead of manual JSON schema
 * - Simple string return instead of ToolResult
 * - Leverages bat CLI for syntax highlighting and git integration
 */

const readManyFilesParametersSchema = z.object({
  paths: z.array(z.string()).describe(
    'Required: Array of file paths or glob patterns relative to workspace. ' +
    'Examples: ["src/**/*.ts"], ["README.md", "docs/*.md"]'
  ),
  include: z.array(z.string()).nullable().optional().describe(
    'Optional: Additional glob patterns to include. Merged with paths. ' +
    'Example: ["*.test.ts"]'
  ),
  exclude: z.array(z.string()).nullable().optional().describe(
    'Optional: Glob patterns to exclude. Example: ["*.log", "dist/**"]'
  ),
  recursive: z.boolean().nullable().optional().describe(
    'Optional: Search directories recursively (default: true). Mainly controlled by ** in patterns.'
  ),
  use_default_excludes: z.boolean().nullable().optional().describe(
    'Optional: Apply default exclusions like node_modules, .git (default: true)'
  ),
  file_filtering_options: z.object({
    respect_git_ignore: z.boolean().nullable().optional().describe(
      'Optional: Respect .gitignore patterns (default: true)'
    ),
    respect_ouroboros_ignore: z.boolean().nullable().optional().describe(
      'Optional: Respect .ouroborosignore patterns (default: true)'
    ),
  }).nullable().optional().describe(
    'Optional: File filtering configuration'
  ),
  show_line_numbers: z.boolean().nullable().optional().describe(
    'Optional: Show line numbers in output using bat (default: true)'
  ),
  plain_output: z.boolean().nullable().optional().describe(
    'Optional: Use plain output without decorations (default: false)'
  ),
});

export type ReadManyFilesParameters = z.infer<typeof readManyFilesParametersSchema>;

const DEFAULT_SEPARATOR_FORMAT = '--- {filePath} ---';
const DEFAULT_TERMINATOR = '\n--- End of content ---';

/**
 * Default exclusion patterns for common non-source directories
 */
function getDefaultExcludes(): string[] {
  return [
    'node_modules/**',
    '.git/**',
    'dist/**',
    'build/**',
    'coverage/**',
    '.vscode/**',
    '.idea/**',
    '*.log',
    '*.lock',
    'package-lock.json',
    'yarn.lock',
    '.DS_Store',
  ];
}

/**
 * Creates the SDK-native read-many-files tool using fd + bat
 *
 * @param config - Ouroboros configuration
 * @returns SDK Tool instance for batch file reading with syntax highlighting
 */
export function createReadManyFilesTool(config: Config) {
  const sdkTool = tool({
    name: 'read_many_files',
    description:
      'Batch read multiple files using modern fd + bat CLI tools with syntax highlighting.\\n\\n' +
      '**Capabilities:**\\n' +
      '- Glob pattern-based file discovery with fd\\n' +
      '- Syntax-highlighted content with bat\\n' +
      '- Respects .gitignore and .ouroborosignore\\n' +
      '- Parallel file processing\\n' +
      '- Line numbers and git integration\\n' +
      '- Workspace boundary enforcement\\n\\n' +
      '**Usage:**\\n' +
      '- Paths use glob patterns (e.g., "src/**/*.ts")\\n' +
      '- Include/exclude for fine-grained control\\n' +
      '- Content separated by file path markers\\n' +
      '- Efficient for reading multiple files simultaneously\\n\\n' +
      '**Use Cases:**\\n' +
      '- Overview of codebase sections\\n' +
      '- Documentation review (*.md files)\\n' +
      '- Configuration analysis\\n' +
      '- Code search across multiple files\\n\\n' +
      '**Examples:**\\n' +
      '- All TypeScript: { "paths": ["src/**/*.ts"] }\\n' +
      '- Docs + configs: { "paths": ["docs/*.md", "*.json"] }\\n' +
      '- With exclusions: { "paths": ["**/*.js"], "exclude": ["test/**"] }\\n' +
      '- Plain text: { "paths": ["**/*.txt"], "plain_output": true }',

    parameters: readManyFilesParametersSchema,

    async execute({
      paths,
      include,
      exclude,
      recursive,
      use_default_excludes,
      file_filtering_options,
      show_line_numbers,
      plain_output,
    }, signal?: AbortSignal) {
      try {
        const workspaceContext = config.getWorkspaceContext();
        const workspaceDirs = workspaceContext.getDirectories();

        // Merge paths and include patterns
        const searchPatterns = [...paths, ...(include || [])];

        // Build exclusion list
        const useDefaults = use_default_excludes ?? true;
        const customExcludes = exclude || [];
        const effectiveExcludes = useDefaults
          ? [...getDefaultExcludes(), ...customExcludes]
          : customExcludes;

        // Respect ignore files by default
        const respectGitIgnore = file_filtering_options?.respect_git_ignore ?? true;
        const respectOuroborosIgnore = file_filtering_options?.respect_ouroboros_ignore ?? true;

        // Discover files using fd
        const allFiles = new Set<string>();

        for (const dir of workspaceDirs) {
          for (const pattern of searchPatterns) {
            // Build fd command for file discovery
            const fdArgs: string[] = ['fd'];
            fdArgs.push('--glob', `"${pattern}"`);
            fdArgs.push('--type=file');
            fdArgs.push('--absolute-path');
            fdArgs.push('--color=never');

            // Hidden files
            fdArgs.push('--hidden');

            // Git ignore
            if (respectGitIgnore) {
              fdArgs.push('--no-ignore-vcs');
            }

            // Exclusions
            for (const excl of effectiveExcludes) {
              fdArgs.push(`--exclude="${excl}"`);
            }

            // Search in directory
            fdArgs.push(`"${dir}"`);

            const command = fdArgs.join(' ');
            const result = await ShellExecutionService.execute(
              command,
              config.getTargetDir(),
              undefined,
              signal || new AbortController().signal,
            );

            if (result.stdout) {
              const files = result.stdout.trim().split('\\n').filter(f => f.trim());
              for (const file of files) {
                // Security check: ensure within workspace
                if (workspaceContext.isPathWithinWorkspace(file)) {
                  allFiles.add(file);
                }
              }
            }
          }
        }

        if (allFiles.size === 0) {
          return `No files found matching patterns: ${searchPatterns.join(', ')}`;
        }

        // Sort files for consistent output
        const sortedFiles = Array.from(allFiles).sort();

        // Read files using bat
        const contentParts: string[] = [];
        const skippedFiles: Array<{ path: string; reason: string }> = [];
        const lineNumbers = show_line_numbers ?? true;
        const plain = plain_output ?? false;

        for (const filePath of sortedFiles) {
          try {
            // Check if file exists and is readable
            const stats = await fs.stat(filePath);
            if (!stats.isFile()) {
              skippedFiles.push({
                path: path.relative(config.getTargetDir(), filePath),
                reason: 'Not a regular file',
              });
              continue;
            }

            // Build bat command for syntax-highlighted reading
            const batArgs: string[] = ['bat'];
            batArgs.push(`"${filePath}"`);
            batArgs.push('--color=never'); // No ANSI color codes

            if (plain) {
              batArgs.push('--plain'); // Plain output without decorations
            } else {
              if (lineNumbers) {
                batArgs.push('--number'); // Show line numbers
              }
              batArgs.push('--decorations=always');
            }

            batArgs.push('--paging=never'); // Don't page output
            batArgs.push('--wrap=never'); // Don't wrap long lines

            const command = batArgs.join(' ');
            const result = await ShellExecutionService.execute(
              command,
              config.getTargetDir(),
              undefined,
              signal || new AbortController().signal,
            );

            if (result.exitCode === 0 && result.stdout) {
              const relativePath = path.relative(config.getTargetDir(), filePath);
              const separator = DEFAULT_SEPARATOR_FORMAT.replace('{filePath}', relativePath);
              contentParts.push(`${separator}\\n\\n${result.stdout}\\n`);
            } else {
              skippedFiles.push({
                path: path.relative(config.getTargetDir(), filePath),
                reason: result.error?.message || 'Read error',
              });
            }
          } catch (error) {
            skippedFiles.push({
              path: path.relative(config.getTargetDir(), filePath),
              reason: error instanceof Error ? error.message : String(error),
            });
          }
        }

        // Build output message
        let output = `### ReadManyFiles Result (Target: ${config.getTargetDir()})\\n\\n`;

        const successCount = contentParts.length;
        const skippedCount = skippedFiles.length;

        if (successCount > 0) {
          output += `Successfully read **${successCount} file(s)**:\\n\\n`;
        }

        if (skippedCount > 0) {
          output += `\\nSkipped **${skippedCount} file(s)**:\\n`;
          const displayCount = Math.min(5, skippedCount);
          for (let i = 0; i < displayCount; i++) {
            output += `- ${skippedFiles[i].path} (${skippedFiles[i].reason})\\n`;
          }
          if (skippedCount > 5) {
            output += `- ...and ${skippedCount - 5} more\\n`;
          }
          output += '\\n';
        }

        if (successCount === 0) {
          return output + 'No files were successfully read.';
        }

        // Add content with terminator
        contentParts.push(DEFAULT_TERMINATOR);
        output += '\\n' + contentParts.join('\\n');

        return output;

      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error reading multiple files: ${message}`;
      }
    },
  });

  return sdkTool;
}

/**
 * Factory class for backward compatibility with tool registry
 */
export class ReadManyFilesToolSDK {
  static readonly Name = 'read_many_files';

  constructor(private config: Config) {}

  /**
   * Creates the SDK-native tool instance
   */
  createTool() {
    return createReadManyFilesTool(this.config);
  }
}
