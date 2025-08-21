/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { SlashCommand } from './types.js';
/**
 * /race command - Fastest provider wins
 *
 * This command sends your query to all providers and returns the first
 * response received, optimizing for speed.
 *
 * Usage:
 *   /race "Quick question"
 *   /race --timeout 5000 "Time-sensitive query"
 *   /race --providers gemini,openai "Urgent request"
 */
export declare const raceCommand: SlashCommand;
