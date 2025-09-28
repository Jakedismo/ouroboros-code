/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UpdatePlanTool } from './update-plan.js';
import type { PlanState } from '../core/planTypes.js';
import { clonePlanState } from '../core/planTypes.js';
import type { Config } from '../config/config.js';

class StubPlanConfig {
  private plan: PlanState = { entries: [] };

  getPlanState(): PlanState {
    return clonePlanState(this.plan);
  }

  setPlanState(plan: PlanState): void {
    this.plan = clonePlanState(plan);
  }

  get currentPlan(): PlanState {
    return this.plan;
  }
}

describe('UpdatePlanTool', () => {
  let config: StubPlanConfig;
  let tool: UpdatePlanTool;

  beforeEach(() => {
    config = new StubPlanConfig();
    tool = new UpdatePlanTool(config as unknown as Config);
  });

  it('replaces the existing plan', async () => {
    const invocation = tool.build({
      operation: 'replace',
      title: 'Implementation Plan',
      entries: [
        { step: 'Review requirements' },
        { step: 'Update service layer', status: 'in_progress' },
      ],
    });

    const result = await invocation.execute(new AbortController().signal);

    const plan = config.currentPlan;
    expect(plan.title).toBe('Implementation Plan');
    expect(plan.entries).toHaveLength(2);
    expect(plan.entries[0].step).toBe('Review requirements');
    expect(plan.entries[0].status).toBe('pending');
    expect(plan.entries[1].status).toBe('in_progress');
    expect(result.llmContent).toContain('Implementation Plan');
    expect(result.llmContent).toContain('Review requirements');
  });

  it('appends new entries to the existing plan', async () => {
    const replaceInvocation = tool.build({
      entries: [{ step: 'Initial setup' }],
    });
    await replaceInvocation.execute(new AbortController().signal);

    const appendInvocation = tool.build({
      operation: 'append',
      entries: [
        { step: 'Implement feature' },
        { step: 'Write tests', status: 'in_progress' },
      ],
    });
    await appendInvocation.execute(new AbortController().signal);

    const plan = config.currentPlan;
    expect(plan.entries).toHaveLength(3);
    expect(plan.entries.map((entry) => entry.step)).toEqual([
      'Initial setup',
      'Implement feature',
      'Write tests',
    ]);
    expect(plan.entries[2].status).toBe('in_progress');
  });

  it('clears the plan', async () => {
    const replaceInvocation = tool.build({
      entries: [{ step: 'Existing item' }],
    });
    await replaceInvocation.execute(new AbortController().signal);

    const clearInvocation = tool.build({
      operation: 'clear',
      title: '',
    });
    await clearInvocation.execute(new AbortController().signal);

    const plan = config.currentPlan;
    expect(plan.entries).toHaveLength(0);
    expect(plan.title).toBeUndefined();
  });

  it('throws when entries are missing for replace or append', () => {
    expect(() => tool.build({ operation: 'append' })).toThrow(
      /entries.*least one/i,
    );
  });
});
