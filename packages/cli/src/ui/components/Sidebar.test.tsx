/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import stripAnsi from 'strip-ansi';
import { Sidebar } from './Sidebar.js';
import { renderWithProviders } from '../../test-utils/render.js';

describe('<Sidebar />', () => {
  it('shows session metadata and quick actions', () => {
    const { lastFrame } = renderWithProviders(
      <Sidebar model="gpt-4" provider="openai" branchName="main" />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Session Navigator');
    expect(frame).toContain('Provider: openai');
    expect(frame).toContain('Model: gpt-4');
    expect(frame).toContain('Quick actions');
  });

  it('uses the compact heading when requested', () => {
    const { lastFrame } = renderWithProviders(
      <Sidebar compact model="gemini" provider="google" />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Navigator');
  });
});
