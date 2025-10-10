/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import stripAnsi from 'strip-ansi';
import { Sidebar } from './Sidebar.js';
import { renderWithProviders } from '../../test-utils/render.js';
import { appEvents, AppEvent } from '../../utils/events.js';
import { setTimeout as delay } from 'node:timers/promises';

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

  it('supports slash search to filter and launch quick actions', async () => {
    const emitSpy = vi.spyOn(appEvents, 'emit');
    try {
      const { lastFrame, stdin } = renderWithProviders(
        <Sidebar interactive model="gemini" provider="google" />,
      );

      stdin.write('/');
      await delay(0);
      stdin.write('tools');
      await delay(0);

      const frame = stripAnsi(lastFrame() ?? '');
      expect(frame).toContain('Search actions');
      expect(frame).toContain('/tools');

      stdin.write('\r');
      await delay(0);

      expect(emitSpy).toHaveBeenCalledWith(
        AppEvent.ExecuteSlashCommand,
        '/tools',
      );
    } finally {
      emitSpy.mockRestore();
    }
  });

  it('explains when no quick actions match the search query', async () => {
    const { lastFrame, stdin } = renderWithProviders(
      <Sidebar interactive model="gemini" provider="google" />,
    );

    stdin.write('/');
    await delay(0);
    stdin.write('zzz');
    await delay(0);

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('No quick actions match');
  });
});
