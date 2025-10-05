/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { ShellTool } from './shell.js';

/**
 * A lightweight alias of the primary shell tool that exposes the same
 * capabilities under the `local_shell` function name. This ensures
 * compatibility with Agents SDK integrations that expect a dedicated
 * local-shell entry while still leveraging the hardened execution logic
 * from {@link ShellTool}.
 */
export class LocalShellTool extends ShellTool {
  static override Name = 'local_shell';

  constructor(config: Config) {
    super(config, {
      name: LocalShellTool.Name,
      displayName: 'Local Shell',
      description:
        'The tool `local_shell` executes shell commands directly within the project workspace. '
        + 'It mirrors the behaviour of `run_shell_command`, including command validation, '
        + 'background process tracking, and structured output.',
    });
  }
}
