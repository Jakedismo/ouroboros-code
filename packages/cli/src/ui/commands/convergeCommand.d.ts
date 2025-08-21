/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { SlashCommand } from './types.js';
/**
 * /converge command - Unified synthesis of all provider responses
 *
 * This command queries multiple LLM providers and synthesizes their
 * responses into a unified, comprehensive answer.
 *
 * Usage:
 *   /converge "Your question here"
 *   /converge --providers gemini,openai "Complex query"
 *   /converge --strategy consensus "Controversial topic"
 */
export declare const convergeCommand: SlashCommand;
