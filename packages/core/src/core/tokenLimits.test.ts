/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { tokenLimit } from './tokenLimits.js';

describe('tokenLimit', () => {
  it('returns default limit for unknown models', () => {
    expect(tokenLimit('unknown-model')).toBe(1_048_576);
  });

  it('maps Gemini models to documented limits', () => {
    expect(tokenLimit('gemini-1.5-pro')).toBe(2_097_152);
    expect(tokenLimit('gemini-2.5-pro')).toBe(1_048_576);
  });

  it('normalizes OpenAI GPT-5 variants to 282k tokens', () => {
    expect(tokenLimit('gpt-5')).toBe(282_000);
    expect(tokenLimit('gpt-5-codex')).toBe(282_000);
    expect(tokenLimit('models/gpt-5-mini')).toBe(282_000);
  });

  it('maps Anthropic opus and sonnet variants', () => {
    expect(tokenLimit('claude-opus-4-1-20250805')).toBe(200_000);
    expect(tokenLimit('claude-sonnet-4-20250514[1m]')).toBe(1_000_000);
  });
});
