/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { tool } from '@openai/agents';
import { z } from 'zod';
import os from 'node:os';
import path from 'node:path';
import type { Config } from '../index.js';
import { ShellExecutionService } from '../services/shellExecutionService.js';

/**
 * SDK-native run_shell_command tool implementation
 * Follows OpenAI Agents SDK best practices for tool definitions
 *
 * Gap #2: Tool Definition Patterns
 * - Uses SDK's tool() function instead of BaseDeclarativeTool class
 * - Zod schema instead of manual JSON schema
 * - Simple string return instead of ToolResult complex type
 */

function getCommandDescription(): string {
  if (os.platform() === 'win32') {
    return 'Exact command to execute as `cmd.exe /c <command>`';
  } else {
    return 'Exact bash command to execute as `bash -c <command>`';
  }
}

function getShellToolDescription(): string {
  const returnedInfo = `

The following information is returned:

Command: Executed command.
Directory: Directory (relative to project root) where command was executed, or \`(root)\`.
Stdout: Output on stdout stream. Can be \`(empty)\` or partial on error and for any unwaited background processes.
Stderr: Output on stderr stream. Can be \`(empty)\` or partial on error and for any unwaited background processes.
Error: Error or \`(none)\` if no error was reported for the subprocess.
Exit Code: Exit code or \`(none)\` if terminated by signal.
Signal: Signal number or \`(none)\` if no signal was received.
Background PIDs: List of background processes started or \`(none)\`.
Process Group PGID: Process group started or \`(none)\``;

  if (os.platform() === 'win32') {
    return `The tool \`run_shell_command\` executes a given shell command as \`cmd.exe /c <command>\`. Command can start background processes using \`start /b\`.${returnedInfo}`;
  }

  return `The tool \`run_shell_command\` executes a given shell command as \`bash -c <command>\`. Command can start background processes using \`&\`. Command is executed as a subprocess that leads its own process group. Command process group can be terminated as \`kill -- -PGID\` or signaled as \`kill -s SIGNAL -- -PGID\`.${returnedInfo}`;
}

const shellParametersSchema = z.object({
  command: z.string().describe(getCommandDescription()),
  description: z.string().nullable().optional().describe(
    'Brief description of the command for the user. Be specific and concise. ' +
    'Ideally a single sentence. Can be up to 3 sentences for clarity. No line breaks.'
  ),
  directory: z.string().nullable().optional().describe(
    '(OPTIONAL) Directory to run the command in, if not the project root directory. ' +
    'Must be relative to the project root directory and must already exist.'
  ),
});

export type ShellParameters = z.infer<typeof shellParametersSchema>;

/**
 * Creates the SDK-native run_shell_command tool
 *
 * @param config - Ouroboros configuration for shell execution
 * @returns SDK Tool instance for shell command execution
 */
export function createShellTool(config: Config) {
  const sdkTool = tool({
    name: 'run_shell_command',
    description: getShellToolDescription(),
    parameters: shellParametersSchema,

    async execute({ command, description, directory }, signal?: AbortSignal) {
      try {
        // Validation: Command cannot be empty
        if (!command.trim()) {
          return 'Error: Command cannot be empty.';
        }

        // Validation: Directory checks if provided
        if (directory) {
          if (path.isAbsolute(directory)) {
            return 'Error: Directory cannot be absolute. Please refer to workspace directories by their name.';
          }

          const workspaceDirs = config.getWorkspaceContext().getDirectories();
          const matchingDirs = workspaceDirs.filter(
            (dir) => path.basename(dir) === directory,
          );

          if (matchingDirs.length === 0) {
            return `Error: Directory '${directory}' is not a registered workspace directory.`;
          }

          if (matchingDirs.length > 1) {
            return `Error: Directory name '${directory}' is ambiguous as it matches multiple workspace directories.`;
          }
        }

        // Determine execution directory
        const targetDir = config.getTargetDir();
        let cwd = targetDir;
        if (directory) {
          const workspaceDirs = config.getWorkspaceContext().getDirectories();
          const matchingDirs = workspaceDirs.filter(
            (dir) => path.basename(dir) === directory,
          );
          if (matchingDirs.length === 1) {
            cwd = matchingDirs[0];
          }
        }

        // Execute the command
        const result = await ShellExecutionService.execute(
          command,
          cwd,
          undefined, // eventHandler - not needed for SDK pattern
          signal || new AbortController().signal,
        );

        // Build response string (SDK pattern: simple string return)
        const parts: string[] = [];

        parts.push(`Command: ${command}`);
        parts.push(`Directory: ${directory || '(root)'}`);

        if (result.stdout) {
          parts.push(`Stdout: ${result.stdout}`);
        } else {
          parts.push(`Stdout: (empty)`);
        }

        if (result.stderr) {
          parts.push(`Stderr: ${result.stderr}`);
        } else {
          parts.push(`Stderr: (empty)`);
        }

        if (result.error) {
          parts.push(`Error: ${result.error.message}`);
        } else {
          parts.push(`Error: (none)`);
        }

        if (result.exitCode !== null) {
          parts.push(`Exit Code: ${result.exitCode}`);
        } else {
          parts.push(`Exit Code: (none)`);
        }

        if (result.signal) {
          parts.push(`Signal: ${result.signal}`);
        } else {
          parts.push(`Signal: (none)`);
        }

        if (result.backgroundPids && result.backgroundPids.length > 0) {
          parts.push(`Background PIDs: ${result.backgroundPids.join(', ')}`);
        } else {
          parts.push(`Background PIDs: (none)`);
        }

        if (result.pgid) {
          parts.push(`Process Group PGID: ${result.pgid}`);
        } else {
          parts.push(`Process Group PGID: (none)`);
        }

        const llmContent = parts.join('\n');

        // Handle errors/abort in return message
        if (result.aborted) {
          return `${llmContent}\n\nCommand cancelled by user.`;
        }

        if (result.signal) {
          return `${llmContent}\n\nCommand terminated by signal: ${result.signal}`;
        }

        if (result.error) {
          return `${llmContent}\n\nCommand failed: ${result.error.message}`;
        }

        if (result.exitCode !== null && result.exitCode !== 0) {
          return `${llmContent}\n\nCommand exited with code: ${result.exitCode}`;
        }

        return llmContent;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error executing shell command: ${message}\nCommand: ${command}`;
      }
    },
  });

  // Return SDK tool - SDK uses `invoke` method internally
  return sdkTool;
}

/**
 * Factory class for backward compatibility with tool registry
 *
 * This allows gradual migration from BaseDeclarativeTool to SDK pattern.
 * The tool registry can instantiate this tool the same way as legacy tools.
 */
export class ShellToolSDK {
  static readonly Name = 'run_shell_command';

  constructor(private config: Config) {}

  /**
   * Creates the SDK-native tool instance
   * Called by tool registry during initialization
   */
  createTool() {
    return createShellTool(this.config);
  }
}
