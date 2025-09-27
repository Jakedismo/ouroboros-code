/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type { Content } from '../runtime/agentsTypes.js';
import { findIndexAfterFraction } from './client.js';

describe('findIndexAfterFraction', () => {
  const history: Content[] = [
    { role: 'user', parts: [{ text: 'This is the first message.' }] },
    { role: 'model', parts: [{ text: 'This is the second message.' }] },
    { role: 'user', parts: [{ text: 'This is the third message.' }] },
    { role: 'model', parts: [{ text: 'This is the fourth message.' }] },
    { role: 'user', parts: [{ text: 'This is the fifth message.' }] },
  ];

  it('throws for non-positive fractions', () => {
    expect(() => findIndexAfterFraction(history, 0)).toThrow(
      'Fraction must be between 0 and 1',
    );
  });

  it('throws for fractions >= 1', () => {
    expect(() => findIndexAfterFraction(history, 1)).toThrow(
      'Fraction must be between 0 and 1',
    );
  });

  it('returns the index that satisfies the fraction threshold', () => {
    expect(findIndexAfterFraction(history, 0.5)).toBe(2);
  });

  it('handles edge cases gracefully', () => {
    expect(findIndexAfterFraction([], 0.5)).toBe(0);
    expect(findIndexAfterFraction(history.slice(0, 1), 0.5)).toBe(0);
  });
});
