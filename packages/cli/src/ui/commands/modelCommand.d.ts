/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { SlashCommand } from './types.js';
/**
 * Enhanced /model command with multi-provider support
 *
 * Usage:
 *   /model                     - Show current models
 *   /model --list              - List all available models
 *   /model gpt-4               - Set model for current provider
 *   /model openai:gpt-4        - Set model for specific provider
 *   /model --all best          - Set best model for all providers
 */
export declare const modelCommand: SlashCommand;
