/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type { HistoryItem } from '../types.js';
import { ToolCallStatus } from '../types.js';
import { renderWithProviders } from '../../test-utils/render.js';
import { HistoryActivityRail } from './HistoryActivityRail.js';

const baseHistory: HistoryItem[] = [
  { id: 1, type: 'user', text: 'Open the project README.' },
  { id: 2, type: 'gemini', text: 'Sure thing! Here is what I found.' },
  {
    id: 3,
    type: 'tool_group',
    tools: [
      {
        callId: 'call-1',
        name: 'local_shell',
        description: 'Run a shell command',
        status: ToolCallStatus.Success,
        confirmationDetails: undefined,
        resultDisplay: undefined,
      },
    ],
  },
];

describe('<HistoryActivityRail />', () => {
  it('renders recent activity entries with icons', () => {
    const { lastFrame } = renderWithProviders(
      <HistoryActivityRail history={baseHistory} maxItems={3} />,
    );

    const frame = lastFrame();
    expect(frame).toContain('🗂');
    expect(frame).toContain('🙋 User');
    expect(frame).toContain('🤖 Gemini');
    expect(frame).toContain('🛠️ Tools');
  });

  it('includes pending items at the front of the rail', () => {
    const { lastFrame } = renderWithProviders(
      <HistoryActivityRail
        history={baseHistory.slice(0, 1)}
        pendingItems={baseHistory.slice(1).map(({ id, ...rest }) => rest)}
        maxItems={2}
      />,
    );

    const frame = lastFrame();
    expect(frame?.indexOf('⏳ Pending')).toBeLessThan(
      frame?.indexOf('🙋 User') ?? Number.POSITIVE_INFINITY,
    );
  });

  it('renders nothing when history and pending items are empty', () => {
    const { lastFrame } = renderWithProviders(
      <HistoryActivityRail history={[]} pendingItems={[]} />,
    );

    expect(lastFrame()).toBe('');
  });
});
