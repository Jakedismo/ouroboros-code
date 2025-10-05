/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  convertContentHistoryToUnifiedMessages,
  convertContentToUnifiedMessage,
} from './historyConversion.js';
import type { Content } from './genaiCompat.js';

describe('historyConversion', () => {
  it('converts function responses with metadata and tool call ids', () => {
    const functionResponse = {
      callId: 'call-123',
      name: 'read_file',
      response: { output: 'File contents go here.' },
    };
    const content: Content = {
      role: 'tool',
      parts: [
        {
          functionResponse,
        } as never,
      ],
    };

    const message = convertContentToUnifiedMessage(content);
    expect(message).not.toBeNull();
    expect(message?.role).toBe('tool');
    expect(message?.toolCallId).toBe('call-123');
    expect(message?.metadata?.['functionResponse']).toEqual(functionResponse);
    expect(message?.content).toContain('File contents go here.');
  });

  it('preserves thought text from parts when constructing messages', () => {
    const content: Content = {
      role: 'model',
      parts: [
        { thought: 'Analyzing available options.' } as never,
        {
          functionCall: {
            name: 'read_file',
            thought: 'Need to inspect the target file before editing.',
          },
        } as never,
        { text: 'Plan drafted.' } as never,
      ],
    };

    const message = convertContentToUnifiedMessage(content);
    expect(message).not.toBeNull();
    expect(message?.role).toBe('assistant');
    expect(message?.content).toContain('Analyzing available options.');
    expect(message?.content).toContain('Need to inspect the target file before editing.');
    expect(message?.content).toContain('Plan drafted.');
  });

  it('builds unified history arrays while filtering empty entries', () => {
    const history: Content[] = [
      {
        role: 'tool',
        parts: [
          {
            functionResponse: {
              id: 'tool-45',
              name: 'glob',
              response: { output: 'Matched files: src/index.ts' },
            },
          } as never,
        ],
      },
      {
        role: 'user',
        parts: [{ text: 'Thanks!' } as never],
      },
      {
        role: 'model',
        parts: [],
      },
    ];

    const unified = convertContentHistoryToUnifiedMessages(history);
    expect(unified).toHaveLength(2);
    expect(unified[0].role).toBe('tool');
    expect(unified[0].content).toContain('Matched files: src/index.ts');
    expect(unified[1]).toEqual({ role: 'user', content: 'Thanks!' });
  });
});
