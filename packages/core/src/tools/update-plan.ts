/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import type { ToolInvocation, ToolResult } from './tools.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
} from './tools.js';
import type { Config } from '../config/config.js';
import type { PlanState, PlanEntry, PlanStatus } from '../core/planTypes.js';
import { clonePlanState } from '../core/planTypes.js';

export type UpdatePlanOperation = 'replace' | 'append' | 'clear';

export interface UpdatePlanEntryInput {
  step: string;
  status?: PlanStatus;
}

export interface UpdatePlanParams {
  operation?: UpdatePlanOperation;
  title?: string;
  entries?: UpdatePlanEntryInput[];
}

const PLAN_TOOL_NAME = 'update_plan';
const PLAN_TOOL_DESCRIPTION = `
Updates the working implementation plan (to-do list) for this session.

Use this tool to share a concise sequence of steps you intend to follow, and to
keep it updated as you make progress. Provide the full plan when replacing it so
that the latest state is captured in the conversation history.

Parameters:
- \`operation\` (optional): \`"replace"\` (default) replaces the plan,
  \`"append"\` adds steps to the end, \`"clear"\` removes all steps.
- \`title\` (optional): Short heading for the plan.
- \`entries\` (array): Required unless \`operation\` is \`"clear"\`. Each entry
  needs a \`step\` string and optional \`status\` (\`"pending"\`,
  \`"in_progress"\`, or \`"completed"\`).
`;

const updatePlanSchema = {
  type: 'object',
  properties: {
    operation: {
      type: 'string',
      enum: ['replace', 'append', 'clear'],
      description:
        'How to apply the update. Defaults to "replace" when not provided.',
    },
    title: {
      type: 'string',
      description: 'Optional heading for the plan. Empty string clears the title.',
    },
    entries: {
      type: 'array',
      description:
        'Plan entries. Required unless operation is "clear". Entries are applied in the order provided.',
      items: {
        type: 'object',
        properties: {
          step: {
            type: 'string',
            description: 'Human-readable description of the work item.',
          },
          status: {
            type: 'string',
            enum: ['pending', 'in_progress', 'completed'],
            description: 'Optional status for the step. Defaults to pending.',
          },
        },
        required: ['step'],
      },
    },
  },
};

const STATUS_ICONS: Record<PlanStatus, string> = {
  pending: '☐',
  in_progress: '⏳',
  completed: '✅',
};

function normaliseTitle(title: string | undefined): string | undefined {
  if (title === undefined) {
    return undefined;
  }
  const trimmed = title.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function normaliseEntries(
  entries: UpdatePlanEntryInput[] | undefined,
): PlanEntry[] {
  if (!entries) {
    return [];
  }

  return entries.map((entry) => {
    const step = entry.step.trim();
    return {
      id: randomUUID(),
      step,
      status: entry.status ?? 'pending',
    } satisfies PlanEntry;
  });
}

function renderPlan(
  plan: PlanState,
  operation: UpdatePlanOperation,
): string {
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
  return lines.join('\n');
}

class UpdatePlanToolInvocation extends BaseToolInvocation<
  UpdatePlanParams,
  ToolResult
> {
  constructor(private readonly config: Config, params: UpdatePlanParams) {
    super(params);
  }

  getDescription(): string {
    const operation = this.params.operation ?? 'replace';
    return `${operation} plan`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const operation = this.params.operation ?? 'replace';
    const existingPlan = this.config.getPlanState();
    const updatedPlan = applyPlanUpdate(operation, existingPlan, this.params);

    this.config.setPlanState(updatedPlan);

    const renderedPlan = renderPlan(updatedPlan, operation);

    return {
      llmContent: renderedPlan,
      returnDisplay: renderedPlan,
    };
  }
}

function applyPlanUpdate(
  operation: UpdatePlanOperation,
  currentPlan: PlanState,
  params: UpdatePlanParams,
): PlanState {
  const plan = clonePlanState(currentPlan);

  if (operation === 'clear') {
    plan.entries = [];
    if (params.title !== undefined) {
      plan.title = normaliseTitle(params.title);
    }
    return plan;
  }

  if (!params.entries || params.entries.length === 0) {
    throw new Error('At least one entry is required when operation is "replace" or "append".');
  }

  const newEntries = normaliseEntries(params.entries);

  if (operation === 'replace') {
    plan.entries = newEntries;
  } else if (operation === 'append') {
    plan.entries = [...plan.entries, ...newEntries];
  }

  if (params.title !== undefined) {
    plan.title = normaliseTitle(params.title);
  }

  return plan;
}

export class UpdatePlanTool extends BaseDeclarativeTool<
  UpdatePlanParams,
  ToolResult
> {
  static readonly Name: string = PLAN_TOOL_NAME;

  constructor(private readonly config: Config) {
    super(
      PLAN_TOOL_NAME,
      PLAN_TOOL_NAME,
      PLAN_TOOL_DESCRIPTION,
      Kind.Think,
      updatePlanSchema,
      true,
      false,
    );
  }

  protected override validateToolParamValues(params: UpdatePlanParams): string | null {
    const operation = params.operation ?? 'replace';

    if (operation !== 'clear') {
      if (!params.entries || params.entries.length === 0) {
        return 'The entries array must contain at least one item unless operation is "clear".';
      }

      const emptyStep = params.entries.find(
        (entry) => entry.step.trim().length === 0,
      );
      if (emptyStep) {
        return 'Each plan entry must include a non-empty step description.';
      }
    }

    return null;
  }

  protected createInvocation(
    params: UpdatePlanParams,
  ): ToolInvocation<UpdatePlanParams, ToolResult> {
    return new UpdatePlanToolInvocation(this.config, params);
  }
}
