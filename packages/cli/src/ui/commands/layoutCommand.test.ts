/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { layoutCommand } from './layoutCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';
import { appEvents, AppEvent } from '../../utils/events.js';

describe('layoutCommand', () => {
  const emitSpy = vi.spyOn(appEvents, 'emit');

  beforeEach(() => {
    emitSpy.mockClear();
  });

  afterEach(() => {
    emitSpy.mockReset();
  });

  it('emits sidebar show when invoked via args', () => {
    const ctx = createMockCommandContext({
      invocation: { raw: '/layout sidebar show', name: 'layout', args: 'sidebar show' },
    });

    if (!layoutCommand.action) throw new Error('layout command missing action');
    layoutCommand.action(ctx, 'sidebar show');

    expect(emitSpy).toHaveBeenCalledWith(AppEvent.ToggleSidebar, 'show');
    expect(ctx.ui.addItem).toHaveBeenCalledWith(
      {
        type: MessageType.INFO,
        text: '✅ Sidebar shown.',
      },
      expect.any(Number),
    );
  });

  it('supports alias /showsidebar', () => {
    const ctx = createMockCommandContext({
      invocation: { raw: '/showsidebar', name: 'layout', args: '' },
    });

    if (!layoutCommand.action) throw new Error('layout command missing action');
    layoutCommand.action(ctx, '');

    expect(emitSpy).toHaveBeenCalledWith(AppEvent.ToggleSidebar, 'show');
  });

  it('renders usage when target missing', () => {
    const ctx = createMockCommandContext({
      invocation: { raw: '/layout', name: 'layout', args: '' },
    });

    if (!layoutCommand.action) throw new Error('layout command missing action');
    layoutCommand.action(ctx, '');

    expect(ctx.ui.addItem).toHaveBeenCalledWith(
      {
        type: MessageType.INFO,
        text:
          'Usage: /layout <sidebar|activity> [show|hide|toggle]\nAliases: /showsidebar, /hidesidebar, /toggleactivity, /showactivity, /hideactivity.',
      },
      expect.any(Number),
    );
  });
});
