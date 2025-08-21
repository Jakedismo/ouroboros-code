/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { SlashCommand } from './types.js';
/**
 * /compare command - Side-by-side provider comparison
 *
 * This command queries multiple providers and presents their responses
 * side-by-side for easy comparison.
 *
 * Usage:
 *   /compare "Your question"
 *   /compare --providers gemini,openai "Complex problem"
 *   /compare --format table "Technical question"
 */
export declare const compareCommand: SlashCommand;
