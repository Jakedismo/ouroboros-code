/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { SlashCommand, CommandKind, CommandContext, MessageActionReturn } from '../ui/commands/types.js';
import { MultiProviderOrchestrator } from '@ouroboros/code-cli-core';
/**
 * /challenge command - Run adversarial challenges between providers
 *
 * Usage:
 *   /challenge "Can AI be conscious?"
 *   /challenge --target openai "Explain quantum computing"
 *   /challenge --target gemini --challengers openai,anthropic "Is P=NP?"
 *   /challenge --rounds 2 --focus logic "Prove this theorem"
 */
export declare class ChallengeCommand implements SlashCommand {
    private _orchestrator;
    name: string;
    description: string;
    kind: CommandKind;
    private challenger;
    constructor(_orchestrator: MultiProviderOrchestrator);
    action: (_context: CommandContext, argsStr: string) => Promise<MessageActionReturn>;
    /**
     * Parse command arguments
     */
    private parseArguments;
    /**
     * Create insights summary from the challenge report
     */
    private createInsightsSummary;
    /**
     * Generate key takeaway based on analysis
     */
    private generateTakeaway;
    /**
     * Get help text for the command
     */
    getHelp(): string;
}
