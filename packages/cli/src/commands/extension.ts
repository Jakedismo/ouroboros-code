/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { Argv, CommandModule } from 'yargs';
import { installExtension } from './extension/install.js';
import { uninstallExtension } from './extension/uninstall.js';
import { listExtensions } from './extension/list.js';

export const extensionCommand: CommandModule = {
  command: 'extension',
  describe: 'Manage extensions for Ouroboros Code',
  builder: (yargs: Argv) =>
    yargs
      .command(installExtension)
      .command(uninstallExtension)
      .command(listExtensions)
      .demandCommand(1, 'You need to specify an extension command.')
      .version(false),
  handler: () => {
    // This will never be called due to demandCommand
  },
};