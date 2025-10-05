/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { tool } from '@openai/agents';
import { z } from 'zod';
import type { Config } from '../index.js';
import { processSingleFileContent } from '../utils/fileUtils.js';

/**
 * SDK-native read_file tool implementation
 * Follows OpenAI Agents SDK best practices for tool definitions
 *
 * Gap #2: Tool Definition Patterns
 * - Uses SDK's tool() function instead of BaseDeclarativeTool class
 * - Zod schema instead of manual JSON schema
 * - Simple string return instead of ToolResult complex type
 */

const readFileParametersSchema = z.object({
  absolute_path: z.string().describe(
    'The absolute path to the file to read. ' +
    'Must be an absolute path, not a relative path.'
  ),
  offset: z.number().int().positive().nullable().optional().describe(
    'Optional: For text files, the line number to start reading from (1-based). ' +
    'Use this with limit to read specific portions of large files.'
  ),
  limit: z.number().int().positive().nullable().optional().describe(
    'Optional: For text files, the maximum number of lines to read. ' +
    'When combined with offset, allows reading specific sections of files.'
  ),
});

export type ReadFileParameters = z.infer<typeof readFileParametersSchema>;

/**
 * Creates the SDK-native read_file tool
 *
 * @param config - Ouroboros configuration for file system access
 * @returns SDK Tool instance for file reading
 */
export function createReadFileTool(config: Config) {
  const sdkTool = tool({
    name: 'read_file',
    description:
      'Reads and returns the content of a specified file from the local filesystem. ' +
      'You can access any file directly by using this tool. ' +
      'Assume this tool is able to read all files on the machine. ' +
      'If the User provides a path to a file assume that path is valid. ' +
      'It is okay to read a file that does not exist; an error will be returned.\n\n' +
      '**Usage:**\n' +
      '- The file_path parameter must be an absolute path, not a relative path\n' +
      '- By default, it reads up to 2000 lines starting from the beginning of the file\n' +
      '- You can optionally specify a line offset and limit (especially handy for long files)\n' +
      '- Any lines longer than 2000 characters will be truncated\n' +
      '- Results are returned using cat -n format, with line numbers starting at 1\n' +
      '- This tool allows reading images (eg PNG, JPG, etc) when the LLM is multimodal\n' +
      '- This tool can read PDF files (.pdf), processing them page by page\n' +
      '- This tool can read Jupyter notebooks (.ipynb files) with all cells and outputs\n' +
      '- This tool can only read files, not directories\n\n' +
      '**Performance:**\n' +
      '- You can call multiple tools in parallel for better performance\n' +
      '- Speculative parallel reads are better than sequential when exploring files',

    parameters: readFileParametersSchema,

    async execute({ absolute_path, offset, limit }) {
      try {
        // Validate absolute path requirement
        if (!absolute_path.startsWith('/')) {
          return `Error: The file_path must be an absolute path, but received: ${absolute_path}\n` +
                 `Please provide an absolute path starting with '/'.`;
        }

        // Process file content using existing service
        // Handle nullable optional parameters (null becomes undefined)
        const result = await processSingleFileContent(
          absolute_path,
          config.getTargetDir(),
          config.getFileSystemService(),
          offset ?? undefined,
          limit ?? undefined,
        );

        // Handle errors
        if (result.error) {
          const errorType = result.errorType || 'UNKNOWN_ERROR';
          return `Error reading file (${errorType}): ${result.error}\n` +
                 `File: ${absolute_path}` +
                 (result.returnDisplay ? `\n${result.returnDisplay}` : '');
        }

        // Return successful content
        // SDK pattern: Simple string return, not complex ToolResult object
        const content = result.llmContent || '';
        const display = result.returnDisplay || '';

        if (content && display && content !== display) {
          // Both content and display available
          return `${display}\n\n${content}`;
        }

        return content || display || 'File read successfully but content is empty.';
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Unexpected error reading file: ${message}\nFile: ${absolute_path}`;
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
export class ReadFileToolSDK {
  static readonly Name = 'read_file';

  constructor(private config: Config) {}

  /**
   * Creates the SDK-native tool instance
   * Called by tool registry during initialization
   */
  createTool() {
    return createReadFileTool(this.config);
  }
}
