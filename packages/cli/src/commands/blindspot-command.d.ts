/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { SlashCommand, CommandKind, CommandContext, MessageActionReturn } from '../ui/commands/types.js';
import { MultiProviderOrchestrator } from '@ouroboros/code-cli-core';
/**
 * /blindspot command - Detect blindspots across provider responses
 *
 * Usage:
 *   /blindspot "What are the security implications?"
 *   /blindspot --providers gemini,openai "Analyze this design"
 *   /blindspot --input response.txt "Check this response for gaps"
 */
export declare class BlindspotCommand implements SlashCommand {
    private _orchestrator;
    name: string;
    description: string;
    kind: CommandKind;
    private detector;
    constructor(_orchestrator: MultiProviderOrchestrator);
    action: (_context: CommandContext, argsStr: string) => Promise<MessageActionReturn>;
    /**
     * Parse command arguments
     */
    private parseArguments;
    /**
     * Create summary statistics
     */
    private createSummary;
    /**
     * Get help text for the command
     */
    getHelp(): string;
}
