/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { tool } from '@openai/agents';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import type { Config } from '../index.js';

/**
 * SDK-native write_file tool implementation
 * Follows OpenAI Agents SDK best practices for tool definitions
 *
 * Gap #2: Tool Definition Patterns
 * - Uses SDK's tool() function instead of BaseDeclarativeTool class
 * - Zod schema instead of manual JSON schema
 * - Simple string return instead of ToolResult complex type
 */

const writeFileParametersSchema = z.object({
  file_path: z.string().describe(
    'The absolute path to the file to write. ' +
    'Must be an absolute path, not a relative path. ' +
    'The file will be created if it does not exist, or overwritten if it does.'
  ),
  content: z.string().describe(
    'The complete content to write to the file. ' +
    'This will replace the entire file contents.'
  ),
  modified_by_user: z.boolean().nullable().optional().describe(
    'Optional: Whether the proposed content was modified by the user.'
  ),
  ai_proposed_content: z.string().nullable().optional().describe(
    'Optional: Initially proposed content before user modifications.'
  ),
});

export type WriteFileParameters = z.infer<typeof writeFileParametersSchema>;

/**
 * Creates the SDK-native write_file tool
 *
 * @param config - Ouroboros configuration for file system access
 * @returns SDK Tool instance for file writing
 */
export function createWriteFileTool(config: Config) {
  const sdkTool = tool({
    name: 'write_file',
    description:
      'Writes content to a specified file, creating it if it does not exist or overwriting it if it does. ' +
      'You can use this tool to create new files or update existing ones. ' +
      'The file will be created with all necessary parent directories.\n\n' +
      '**Usage:**\n' +
      '- The file_path parameter must be an absolute path, not a relative path\n' +
      '- The content will completely replace any existing file content\n' +
      '- Parent directories will be created automatically if they do not exist\n' +
      '- This tool is suitable for creating new files or performing complete rewrites\n' +
      '- For surgical edits to existing files, use the edit tool instead\n\n' +
      '**Examples:**\n' +
      '- Creating a new file: { "file_path": "/workspace/src/new-file.ts", "content": "export const greeting = \\"hello\\";" }\n' +
      '- Overwriting a file: { "file_path": "/workspace/config.json", "content": "{\\"version\\": \\"2.0.0\\"}" }\n\n' +
      '**Performance:**\n' +
      '- You can call multiple tools in parallel for better performance\n' +
      '- Consider using parallel writes for independent files',

    parameters: writeFileParametersSchema,

    async execute({ file_path, content, modified_by_user, ai_proposed_content }) {
      try {
        // Validate absolute path requirement
        if (!file_path.startsWith('/')) {
          return `Error: The file_path must be an absolute path, but received: ${file_path}\n` +
                 `Please provide an absolute path starting with '/'.`;
        }

        // Check if file exists
        let fileExists = false;
        let originalContent = '';
        try {
          originalContent = await config.getFileSystemService().readTextFile(file_path);
          fileExists = true;
        } catch (err: any) {
          if (err.code !== 'ENOENT') {
            // File exists but couldn't be read (permissions, etc.)
            return `Error: Cannot read existing file at ${file_path}: ${err.message}\n` +
                   `Please check file permissions and try again.`;
          }
          // File doesn't exist (ENOENT) - this is OK, we'll create it
        }

        // Create parent directories if they don't exist
        const dirName = path.dirname(file_path);
        if (!fs.existsSync(dirName)) {
          fs.mkdirSync(dirName, { recursive: true });
        }

        // Write the file
        await config.getFileSystemService().writeTextFile(file_path, content);

        // Generate success message
        const operation = fileExists ? 'overwrote' : 'created';
        const lines = content.split('\n').length;

        let message = `Successfully ${operation} file: ${file_path}\n`;
        message += `Lines written: ${lines}\n`;

        if (modified_by_user) {
          message += `Note: Content was modified by user\n`;
        }

        if (fileExists) {
          const originalLines = originalContent.split('\n').length;
          const delta = lines - originalLines;
          message += `Changed from ${originalLines} to ${lines} lines (${delta >= 0 ? '+' : ''}${delta})\n`;
        }

        return message;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error writing file: ${message}\nFile: ${file_path}`;
      }
    },
  });

  // Return SDK tool - SDK uses `invoke` method internally
  return sdkTool;
}

/**
 * Factory function for backward compatibility with tool registry
 *
 * This allows gradual migration from BaseDeclarativeTool to SDK pattern.
 * The tool registry can instantiate this tool the same way as legacy tools.
 */
export class WriteFileToolSDK {
  static readonly Name = 'write_file';

  constructor(private config: Config) {}

  /**
   * Creates the SDK-native tool instance
   * Called by tool registry during initialization
   */
  createTool() {
    return createWriteFileTool(this.config);
  }
}
