/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentContentFragment, AgentMessage } from '@ouroboros/ouroboros-code-core';

export type AgentContent = AgentContentFragment | AgentContentFragment[];

export function ensureAgentContentArray(
  content: AgentContent,
): AgentContentFragment[] {
  return Array.isArray(content) ? content : [content];
}

export type { AgentContentFragment, AgentMessage };
