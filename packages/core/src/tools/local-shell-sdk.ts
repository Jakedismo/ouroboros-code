/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { createShellTool } from './shell-sdk.js';
import type { Config } from '../index.js';

/**
 * Lightweight alias of the primary shell-sdk tool
 * Exposes identical capabilities under the `local_shell` function name
 * Ensures compatibility with Agents SDK integrations
 *
 * Gap #2: Tool Definition Patterns
 * - Alias wrapper around shell-sdk tool
 * - Same SDK pattern and execution logic
 * - Different name for compatibility
 */

/**
 * Creates the SDK-native local-shell tool (alias of run_shell_command)
 *
 * @param config - Ouroboros configuration
 * @returns SDK Tool instance identical to shell but named 'local_shell'
 */
export function createLocalShellTool(config: Config) {
  const shellTool = createShellTool(config);

  // Return the same tool with a different name
  // The SDK tool() function doesn't allow direct name mutation,
  // so we create a new tool with the same implementation
  return {
    ...shellTool,
    name: 'local_shell',
  };
}

/**
 * Factory class for backward compatibility with tool registry
 */
export class LocalShellToolSDK {
  static readonly Name = 'local_shell';

  constructor(private config: Config) {}

  /**
   * Creates the SDK-native tool instance
   */
  createTool() {
    return createLocalShellTool(this.config);
  }
}
