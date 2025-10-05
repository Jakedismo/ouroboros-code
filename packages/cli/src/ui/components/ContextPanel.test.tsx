/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import stripAnsi from 'strip-ansi';
import { ApprovalMode } from '@ouroboros/ouroboros-code-core';
import { ContextPanel } from './ContextPanel.js';
import { renderWithProviders } from '../../test-utils/render.js';

describe('<ContextPanel />', () => {
  it('summarises workspace context', () => {
    const { lastFrame } = renderWithProviders(
      <ContextPanel
        model="gemini-2.0-pro"
        provider="google"
        geminiMdFileCount={2}
        contextFileNames={['GEMINI.md', 'notes.md']}
        approvalMode={ApprovalMode.DEFAULT}
        mcpServers={{}}
        blockedMcpServers={{}}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Workspace Context');
    expect(frame).toContain('Provider: google');
    expect(frame).toContain('Model: gemini-2.0-pro');
  });

  it('renders compact title when compact flag is set', () => {
    const { lastFrame } = renderWithProviders(
      <ContextPanel
        compact
        model="gemini"
        provider="google"
        geminiMdFileCount={0}
        contextFileNames={[]}
        approvalMode={ApprovalMode.DEFAULT}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Context');
  });
});
