/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  darkSemanticColors,
  lightSemanticColors,
} from '../themes/semantic-tokens.js';
import { createDesignTokens } from './tokens.js';

describe('createDesignTokens', () => {
  it('produces consistent metadata and gradients for dark themes', () => {
    const tokens = createDesignTokens({
      name: 'Dark Test',
      type: 'dark',
      semantics: darkSemanticColors,
    });

    expect(tokens.mode).toBe('dark');
    expect(tokens.meta.themeName).toBe('Dark Test');
    expect(tokens.colors.surface.gradient.length).toBeGreaterThanOrEqual(2);
    expect(tokens.colors.surface.elevated).not.toBe(tokens.colors.surface.base);
  });

  it('lightens and darkens surfaces for light themes', () => {
    const tokens = createDesignTokens({
      name: 'Light Test',
      type: 'light',
      semantics: lightSemanticColors,
    });

    expect(tokens.mode).toBe('light');
    expect(tokens.colors.surface.elevated).not.toBe(tokens.colors.surface.base);
    expect(tokens.colors.surface.sunken).not.toBe(tokens.colors.surface.base);
    expect(tokens.colors.text.muted).not.toBe(tokens.colors.text.secondary);
  });
});
