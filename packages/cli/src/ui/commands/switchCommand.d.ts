/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { SlashCommand } from './types.js';
/**
 * /switch command - Switch between LLM providers
 *
 * This command allows you to switch the active provider for your session.
 * Also available as /provider.
 *
 * Usage:
 *   /switch                  - Show current provider
 *   /switch openai           - Switch to OpenAI
 *   /switch anthropic        - Switch to Anthropic
 *   /switch gemini           - Switch to Gemini
 *   /provider --list         - List all providers with status
 */
export declare const switchCommand: SlashCommand;
