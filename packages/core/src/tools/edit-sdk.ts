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
 * SDK-native edit tool using ast-grep for structural code editing
 * Follows OpenAI Agents SDK best practices
 *
 * Gap #2: Tool Definition Patterns
 * - Uses SDK's tool() function instead of BaseDeclarativeTool
 * - Zod schema instead of manual JSON schema
 * - Simple string return instead of ToolResult
 * - Leverages ast-grep for AST-based code transformations
 * - Falls back to string replacement for non-code files
 */

const editParametersSchema = z.object({
  file_path: z.string().describe(
    'Required: Absolute path to the file to edit'
  ),
  old_string: z.string().describe(
    'Required: The exact text to replace. For new files, use empty string ""'
  ),
  new_string: z.string().describe(
    'Required: The text to replace it with. For new files, this is the entire content'
  ),
  use_ast: z.boolean().nullable().optional().describe(
    'Optional: Use AST-based editing with ast-grep for code files (default: true). ' +
    'Falls back to string replacement if AST parsing fails.'
  ),
  language: z.string().nullable().optional().describe(
    'Optional: Programming language hint for AST parsing. ' +
    'Auto-detected from file extension if not provided. ' +
    'Examples: "typescript", "javascript", "python", "rust", "go"'
  ),
  expected_replacements: z.number().int().positive().nullable().optional().describe(
    'Optional: Expected number of replacements (default: 1). ' +
    'Tool will error if actual count differs from expected.'
  ),
});

export type EditParameters = z.infer<typeof editParametersSchema>;

/**
 * Language mapping from file extensions to ast-grep language identifiers
 */
const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala',
};

/**
 * Detects programming language from file extension
 */
function detectLanguage(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  return LANGUAGE_MAP[ext] || null;
}

/**
 * Performs AST-based structural code editing using ast-grep
 */
async function performASTEdit(
  filePath: string,
  oldString: string,
  newString: string,
  language: string,
  signal: AbortSignal,
  targetDir: string,
): Promise<{ success: boolean; content?: string; error?: string }> {
  try {
    // Read current file content
    const currentContent = await fs.readFile(filePath, 'utf-8');

    // Create temporary rule file for ast-grep
    const tempRuleFile = path.join(targetDir, '.ast-grep-rule.yml');

    // Build ast-grep YAML rule
    const rule = `
id: temp-edit-rule
language: ${language}
rule:
  pattern: ${JSON.stringify(oldString)}
fix: ${JSON.stringify(newString)}
`;

    await fs.writeFile(tempRuleFile, rule, 'utf-8');

    try {
      // Run ast-grep with the rule
      const astGrepArgs: string[] = ['ast-grep'];
      astGrepArgs.push('scan');
      astGrepArgs.push('--config', `"${tempRuleFile}"`);
      astGrepArgs.push('--json');
      astGrepArgs.push(`"${filePath}"`);

      const scanCommand = astGrepArgs.join(' ');
      const scanResult = await ShellExecutionService.execute(
        scanCommand,
        targetDir,
        undefined,
        signal,
      );

      // If no matches found, return error
      if (!scanResult.stdout || scanResult.stdout.trim() === '[]') {
        return {
          success: false,
          error: 'AST pattern not found in file',
        };
      }

      // Apply the fix
      const applyArgs: string[] = ['ast-grep'];
      applyArgs.push('scan');
      applyArgs.push('--config', `"${tempRuleFile}"`);
      applyArgs.push('--update-all');
      applyArgs.push(`"${filePath}"`);

      const applyCommand = applyArgs.join(' ');
      const applyResult = await ShellExecutionService.execute(
        applyCommand,
        targetDir,
        undefined,
        signal,
      );

      if (applyResult.exitCode !== 0) {
        return {
          success: false,
          error: applyResult.error?.message || 'AST edit failed',
        };
      }

      // Read updated content
      const newContent = await fs.readFile(filePath, 'utf-8');

      return {
        success: true,
        content: newContent,
      };
    } finally {
      // Clean up temp rule file
      try {
        await fs.unlink(tempRuleFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Performs simple string-based replacement editing
 */
async function performStringEdit(
  filePath: string,
  oldString: string,
  newString: string,
  expectedReplacements: number,
): Promise<{ success: boolean; content?: string; occurrences?: number; error?: string }> {
  try {
    // Check if file exists
    let currentContent: string;
    let isNewFile = false;

    try {
      currentContent = await fs.readFile(filePath, 'utf-8');
      currentContent = currentContent.replace(/\r\n/g, '\n'); // Normalize line endings
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        if (oldString === '') {
          // Creating new file
          isNewFile = true;
          currentContent = '';
        } else {
          return {
            success: false,
            error: 'File not found. Use empty old_string to create new file.',
          };
        }
      } else {
        throw error;
      }
    }

    // Handle new file creation
    if (isNewFile) {
      await fs.writeFile(filePath, newString, 'utf-8');
      return {
        success: true,
        content: newString,
        occurrences: 1,
      };
    }

    // Handle file editing
    if (oldString === '') {
      return {
        success: false,
        error: 'Cannot create file that already exists',
      };
    }

    // Count occurrences
    const occurrences = (currentContent.match(new RegExp(oldString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

    if (occurrences === 0) {
      return {
        success: false,
        occurrences: 0,
        error: 'String to replace not found in file',
      };
    }

    if (occurrences !== expectedReplacements) {
      return {
        success: false,
        occurrences,
        error: `Expected ${expectedReplacements} occurrence(s) but found ${occurrences}`,
      };
    }

    if (oldString === newString) {
      return {
        success: false,
        error: 'old_string and new_string are identical',
      };
    }

    // Perform replacement
    const newContent = currentContent.replaceAll(oldString, newString);

    if (newContent === currentContent) {
      return {
        success: false,
        error: 'No changes made - content identical',
      };
    }

    // Write updated content
    await fs.writeFile(filePath, newContent, 'utf-8');

    return {
      success: true,
      content: newContent,
      occurrences,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Creates the SDK-native edit tool with AST support
 *
 * @param config - Ouroboros configuration
 * @returns SDK Tool instance for file editing
 */
export function createEditTool(config: Config) {
  const sdkTool = tool({
    name: 'edit_file',
    description:
      'Edit files using AST-based structural editing (ast-grep) or string replacement.\\n\\n' +
      '**AST Mode (Code Files):**\\n' +
      '- Structural code transformations\\n' +
      '- Language-aware pattern matching\\n' +
      '- Preserves code structure and formatting\\n' +
      '- Auto-detects language from file extension\\n' +
      '- Falls back to string mode if AST fails\\n\\n' +
      '**String Mode (Text Files):**\\n' +
      '- Exact string matching and replacement\\n' +
      '- Works for any file type\\n' +
      '- Multiple occurrence support\\n' +
      '- Normalized line endings\\n\\n' +
      '**Creating New Files:**\\n' +
      '- Set old_string to empty string ""\\n' +
      '- Set new_string to full file content\\n\\n' +
      '**Best Practices:**\\n' +
      '- Include enough context in old_string for unique match\\n' +
      '- Specify expected_replacements for safety\\n' +
      '- Use AST mode for code refactoring\\n' +
      '- Use string mode for text files\\n\\n' +
      '**Examples:**\\n' +
      '- Rename function: { "file_path": "app.ts", "old_string": "function foo()", "new_string": "function bar()" }\\n' +
      '- Create file: { "file_path": "new.txt", "old_string": "", "new_string": "Hello World" }\\n' +
      '- Multi-replace: { "old_string": "TODO", "new_string": "DONE", "expected_replacements": 3 }',

    parameters: editParametersSchema,

    async execute({
      file_path,
      old_string,
      new_string,
      use_ast,
      language,
      expected_replacements,
    }, signal?: AbortSignal) {
      try {
        // Validate workspace boundary
        const workspaceContext = config.getWorkspaceContext();
        if (!workspaceContext.isPathWithinWorkspace(file_path)) {
          return `Error: File path is outside workspace boundary: ${file_path}`;
        }

        const expectedReps = expected_replacements ?? 1;
        const useAST = use_ast ?? true;

        // Detect or use provided language
        const detectedLang = language || detectLanguage(file_path);

        // Try AST editing for code files if enabled
        if (useAST && detectedLang && old_string !== '') {
          const astResult = await performASTEdit(
            file_path,
            old_string,
            new_string,
            detectedLang,
            signal || new AbortController().signal,
            config.getTargetDir(),
          );

          if (astResult.success) {
            const relativePath = path.relative(config.getTargetDir(), file_path);
            return `Successfully edited ${relativePath} using AST-based transformation (${detectedLang})`;
          }

          // AST failed, fall back to string mode
          // Continue to string edit below
        }

        // Perform string-based editing
        const stringResult = await performStringEdit(
          file_path,
          old_string,
          new_string,
          expectedReps,
        );

        if (!stringResult.success) {
          return `Error: ${stringResult.error}${stringResult.occurrences !== undefined ? ` (found ${stringResult.occurrences} occurrence(s))` : ''}`;
        }

        const relativePath = path.relative(config.getTargetDir(), file_path);
        const isNewFile = old_string === '';
        const mode = isNewFile ? 'created' : 'edited';
        const method = useAST && detectedLang ? `string replacement (AST fallback)` : 'string replacement';

        return `Successfully ${mode} ${relativePath} using ${method}${stringResult.occurrences ? ` (${stringResult.occurrences} replacement(s))` : ''}`;

      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error editing file: ${message}`;
      }
    },
  });

  return sdkTool;
}

/**
 * Factory class for backward compatibility with tool registry
 */
export class EditToolSDK {
  static readonly Name = 'edit_file';

  constructor(private config: Config) {}

  /**
   * Creates the SDK-native tool instance
   */
  createTool() {
    return createEditTool(this.config);
  }
}
