/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { tool } from '@openai/agents';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { Config } from '../index.js';
import type { PlanState, PlanEntry, PlanStatus } from '../core/planTypes.js';
import { clonePlanState } from '../core/planTypes.js';

/**
 * SDK-native update-plan tool for managing implementation plans
 * Follows OpenAI Agents SDK best practices
 *
 * Gap #2: Tool Definition Patterns
 * - Uses SDK's tool() function instead of BaseDeclarativeTool
 * - Zod schema instead of manual JSON schema
 * - Simple string return instead of ToolResult
 * - Manages working implementation plans (to-do lists)
 */

const planEntrySchema = z.object({
  step: z.string().describe('Human-readable description of the work item'),
  status: z.enum(['pending', 'in_progress', 'completed']).nullable().optional().describe(
    'Optional status for the step (default: pending)'
  ),
});

const updatePlanParametersSchema = z.object({
  operation: z.enum(['replace', 'append', 'clear']).nullable().optional().describe(
    'Optional: How to apply the update (default: "replace"). ' +
    '"replace" replaces the plan, "append" adds steps, "clear" removes all steps.'
  ),
  title: z.string().nullable().optional().describe(
    'Optional: Short heading for the plan. Empty string clears the title.'
  ),
  entries: z.array(planEntrySchema).nullable().optional().describe(
    'Optional: Plan entries. Required unless operation is "clear". ' +
    'Entries are applied in the order provided.'
  ),
});

export type UpdatePlanParameters = z.infer<typeof updatePlanParametersSchema>;

const STATUS_ICONS: Record<PlanStatus, string> = {
  pending: '☐',
  in_progress: '⏳',
  completed: '✅',
};

/**
 * Normalizes title string
 */
function normalizeTitle(title: string | null | undefined): string | undefined {
  if (title === null || title === undefined) {
    return undefined;
  }
  const trimmed = title.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/**
 * Normalizes entries array
 */
function normalizeEntries(entries: Array<{ step: string; status?: PlanStatus | null }> | null | undefined): PlanEntry[] {
  if (!entries) {
    return [];
  }

  return entries.map((entry) => {
    const step = entry.step.trim();
    return {
      id: randomUUID(),
      step,
      status: entry.status || 'pending',
    } satisfies PlanEntry;
  });
}

/**
 * Renders plan to string
 */
function renderPlan(plan: PlanState, operation: string): string {
  const lines: string[] = [];
  const headerTitle = plan.title ? `Plan: ${plan.title}` : 'Plan';
  lines.push(`${headerTitle} (operation: ${operation})`);

  if (plan.entries.length === 0) {
    lines.push('- _(no steps currently recorded)_');
  } else {
    plan.entries.forEach((entry, index) => {
      const marker = STATUS_ICONS[entry.status] ?? STATUS_ICONS.pending;
      lines.push(`${index + 1}. ${marker} ${entry.step}`);
    });
  }

  lines.push('');
  lines.push('Use `update_plan` to keep this list accurate.');
  return lines.join('\\n');
}

/**
 * Applies plan update operation
 */
function applyPlanUpdate(
  operation: string,
  currentPlan: PlanState,
  params: UpdatePlanParameters,
): PlanState {
  const plan = clonePlanState(currentPlan);

  if (operation === 'clear') {
    plan.entries = [];
    if (params.title !== undefined && params.title !== null) {
      plan.title = normalizeTitle(params.title);
    }
    return plan;
  }

  if (!params.entries || params.entries.length === 0) {
    throw new Error('At least one entry is required when operation is "replace" or "append".');
  }

  const newEntries = normalizeEntries(params.entries);

  if (operation === 'replace') {
    plan.entries = newEntries;
  } else if (operation === 'append') {
    plan.entries = [...plan.entries, ...newEntries];
  }

  if (params.title !== undefined && params.title !== null) {
    plan.title = normalizeTitle(params.title);
  }

  return plan;
}

/**
 * Creates the SDK-native update-plan tool
 *
 * @param config - Ouroboros configuration
 * @returns SDK Tool instance for managing implementation plans
 */
export function createUpdatePlanTool(config: Config) {
  const sdkTool = tool({
    name: 'update_plan',
    description:
      'Updates the working implementation plan (to-do list) for this session.\\n\\n' +
      '**Purpose:**\\n' +
      'Share a concise sequence of steps you intend to follow, and keep it updated ' +
      'as you make progress. Provide the full plan when replacing it so that the ' +
      'latest state is captured in the conversation history.\\n\\n' +
      '**Operations:**\\n' +
      '- `replace` (default): Replaces the entire plan\\n' +
      '- `append`: Adds steps to the end of current plan\\n' +
      '- `clear`: Removes all steps\\n\\n' +
      '**Parameters:**\\n' +
      '- operation: How to apply the update\\n' +
      '- title: Short heading for the plan\\n' +
      '- entries: Array of steps with optional status\\n\\n' +
      '**Entry Status:**\\n' +
      '- `pending` ☐: Not yet started\\n' +
      '- `in_progress` ⏳: Currently working on\\n' +
      '- `completed` ✅: Finished\\n\\n' +
      '**Examples:**\\n' +
      '- Replace: { "operation": "replace", "title": "Feature X", "entries": [{"step": "Design API"}] }\\n' +
      '- Append: { "operation": "append", "entries": [{"step": "Write tests"}] }\\n' +
      '- Clear: { "operation": "clear" }',

    parameters: updatePlanParametersSchema,

    async execute({ operation, title, entries }, signal?: AbortSignal) {
      try {
        const op = operation || 'replace';

        // Validate entries for non-clear operations
        if (op !== 'clear') {
          if (!entries || entries.length === 0) {
            return 'Error: entries array must contain at least one item unless operation is "clear"';
          }

          const emptyStep = entries.find((entry) => entry.step.trim().length === 0);
          if (emptyStep) {
            return 'Error: each plan entry must include a non-empty step description';
          }
        }

        // Get current plan state
        const existingPlan = config.getPlanState();

        // Apply update
        const updatedPlan = applyPlanUpdate(op, existingPlan, { operation: op, title, entries });

        // Save updated plan
        config.setPlanState(updatedPlan);

        // Render and return
        return renderPlan(updatedPlan, op);

      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error updating plan: ${message}`;
      }
    },
  });

  return sdkTool;
}

/**
 * Factory class for backward compatibility with tool registry
 */
export class UpdatePlanToolSDK {
  static readonly Name = 'update_plan';

  constructor(private config: Config) {}

  /**
   * Creates the SDK-native tool instance
   */
  createTool() {
    return createUpdatePlanTool(this.config);
  }
}
