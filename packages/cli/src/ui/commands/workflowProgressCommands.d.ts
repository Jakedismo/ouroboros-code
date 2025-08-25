/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { SlashCommandProcessorResult } from '../types.js';
/**
 * Process workflow progress related slash commands
 */
export declare function processWorkflowProgressCommand(command: string, args: string[]): SlashCommandProcessorResult | null;
/**
 * Get help text for workflow progress commands
 */
export declare function getWorkflowProgressHelp(): string;
