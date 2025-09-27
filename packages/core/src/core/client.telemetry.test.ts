/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ConversationEventType, CompressionStatus } from './turn.js';

describe('Telemetry enums', () => {
  it('exposes Gemini event types for downstream consumers', () => {
    expect(ConversationEventType.Content).toBe('content');
    expect(ConversationEventType.ToolCallRequest).toBe('tool_call_request');
  });

  it('exposes compression status states', () => {
    expect(CompressionStatus.COMPRESSED).toBe(1);
    expect(CompressionStatus.NOOP).toBe(4);
  });
});
