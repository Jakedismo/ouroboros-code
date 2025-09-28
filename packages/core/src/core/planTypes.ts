/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

export type PlanStatus = 'pending' | 'in_progress' | 'completed';

export interface PlanEntry {
  id: string;
  step: string;
  status: PlanStatus;
}

export interface PlanState {
  title?: string;
  entries: PlanEntry[];
}

export function clonePlanState(plan: PlanState): PlanState {
  return {
    title: plan.title,
    entries: plan.entries.map((entry) => ({ ...entry })),
  };
}
