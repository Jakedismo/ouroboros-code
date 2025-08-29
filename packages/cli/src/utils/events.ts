/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';

export enum AppEvent {
  OpenDebugConsole = 'open-debug-console',
  LogError = 'log-error',
  // UI redesign events
  ToggleSidebar = 'toggle-sidebar',
  ToggleContextPanel = 'toggle-context-panel',
  ToggleWorkflowProgress = 'toggle-workflow-progress',
  OpenCommandPalette = 'open-command-palette',
  CloseCommandPalette = 'close-command-palette',
  ExecuteSlashCommand = 'execute-slash-command',
  ResetUILayout = 'reset-ui-layout',
  SetFocusRegion = 'set-focus-region',
  SetLayoutMode = 'set-layout-mode',
}

export const appEvents = new EventEmitter();