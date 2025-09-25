/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Represents a single fragment of tool output. Providers may return raw strings or structured
 * objects (e.g. function response payloads, binary metadata descriptors). The shape is left
 * intentionally loose so the runtime can operate without provider SDK types.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolResponsePart = any;

/**
 * Canonical container for tool output fragments.
 */
export type ToolResponseParts = ToolResponsePart[];
