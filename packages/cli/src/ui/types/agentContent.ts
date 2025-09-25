/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Minimal content fragment used by the CLI when exchanging messages with the unified agents
 * runtime. Mirrors the loose structure previously provided by @google/genai without depending
 * on that SDK.
 */
export type AgentContentFragment = string | Record<string, unknown>;

/**
 * Union type representing the shapes we accept for agent message content. Historically this
 * matched Gemini's PartListUnion (string, single fragment, or array of fragments).
 */
export type AgentContent =
  | AgentContentFragment
  | AgentContentFragment[];

export function ensureAgentContentArray(
  content: AgentContent,
): AgentContentFragment[] {
  return Array.isArray(content) ? content : [content];
}

export interface AgentMessage {
  role: string;
  parts: AgentContentFragment[];
}
