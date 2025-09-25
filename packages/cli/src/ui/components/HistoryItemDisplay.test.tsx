/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { HistoryItemDisplay } from './HistoryItemDisplay.js';
import type { HistoryItem } from '../types.js';
import { MessageType } from '../types.js';
import { SessionStatsProvider } from '../contexts/SessionContext.js';
import type { Config } from '@ouroboros/ouroboros-code-core';

// Mock child components
vi.mock('./messages/ToolGroupMessage.js', () => ({
  ToolGroupMessage: () => <div />,
}));

describe('<HistoryItemDisplay />', () => {
  const mockConfig = {} as unknown as Config;
  const baseItem = {
    id: 1,
    timestamp: 12345,
    isPending: false,
    terminalWidth: 80,
    config: mockConfig,
  };

  it('renders UserMessage for "user" type', () => {
    const item: HistoryItem = {
      ...baseItem,
      type: MessageType.USER,
      text: 'Hello',
    };
    const { lastFrame } = render(
      <HistoryItemDisplay {...baseItem} item={item} />,
    );
    expect(lastFrame()).toContain('Hello');
  });

  it('renders UserMessage for "user" type with slash command', () => {
    const item: HistoryItem = {
      ...baseItem,
      type: MessageType.USER,
      text: '/theme',
    };
    const { lastFrame } = render(
      <HistoryItemDisplay {...baseItem} item={item} />,
    );
    expect(lastFrame()).toContain('/theme');
  });

  it('renders StatsDisplay for "stats" type', () => {
    const item: HistoryItem = {
      ...baseItem,
      type: MessageType.STATS,
      duration: '1s',
    };
    const { lastFrame } = render(
      <SessionStatsProvider>
        <HistoryItemDisplay {...baseItem} item={item} />
      </SessionStatsProvider>,
    );
    expect(lastFrame()).toContain('Stats');
  });

  it('renders AboutBox for "about" type', () => {
    const item: HistoryItem = {
      ...baseItem,
      type: MessageType.ABOUT,
      cliVersion: '1.0.0',
      osVersion: 'test-os',
      sandboxEnv: 'test-env',
      modelVersion: 'test-model',
      selectedAuthType: 'test-auth',
      gcpProject: 'test-project',
      ideClient: 'test-ide',
    };
    const { lastFrame } = render(
      <HistoryItemDisplay {...baseItem} item={item} />,
    );
    expect(lastFrame()).toContain('About Ouroboros Code');
  });

  it('renders ModelStatsDisplay for "model_stats" type', () => {
    const item: HistoryItem = {
      ...baseItem,
      type: 'model_stats',
    };
    const { lastFrame } = render(
      <SessionStatsProvider>
        <HistoryItemDisplay {...baseItem} item={item} />
      </SessionStatsProvider>,
    );
    expect(lastFrame()).toContain(
      'No API calls have been made in this session.',
    );
  });

  it('renders ToolStatsDisplay for "tool_stats" type', () => {
    const item: HistoryItem = {
      ...baseItem,
      type: 'tool_stats',
    };
    const { lastFrame } = render(
      <SessionStatsProvider>
        <HistoryItemDisplay {...baseItem} item={item} />
      </SessionStatsProvider>,
    );
    expect(lastFrame()).toContain(
      'No tool calls have been made in this session.',
    );
  });

  it('renders SessionSummaryDisplay for "quit" type', () => {
    const item: HistoryItem = {
      ...baseItem,
      type: 'quit',
      duration: '1s',
    };
    const { lastFrame } = render(
      <SessionStatsProvider>
        <HistoryItemDisplay {...baseItem} item={item} />
      </SessionStatsProvider>,
    );
    expect(lastFrame()).toContain('Agent powering down. Goodbye!');
  });

  it('renders MultiAgentStatusMessage for multi-agent orchestration feedback', () => {
    const persona = {
      id: 'systems-architect',
      name: 'Systems Architect',
      emoji: '🏗️',
      description: 'Designs large-scale distributed systems',
      specialties: ['Architecture', 'Distributed systems'],
    };

    const item: HistoryItem = {
      ...baseItem,
      type: 'multi_agent_status',
      selection: {
        selectedAgents: [persona],
        reasoning: 'Selected architecture specialist for system design.',
        confidence: 0.92,
        processingTime: 1250,
        status: 'complete',
        execution: {
          totalAgents: 1,
          durationMs: 1250,
          timeline: [{ wave: 1, agents: [persona] }],
          agentResults: [
            {
              agent: persona,
              analysis: 'Analyzed requirements and proposed solution sketch.',
              solution: 'Recommended microservice architecture with event backbone.',
              confidence: 0.92,
              handoffAgentIds: [],
              tools: [
                {
                  name: 'write_file',
                  args: '{"path":"docs/ARCH.md"}',
                  output: 'Created architecture overview.',
                },
              ],
            },
          ],
          aggregateReasoning: 'Architecture plan synthesized successfully.',
        },
      },
    } as HistoryItem;

    const { lastFrame } = render(
      <HistoryItemDisplay {...baseItem} item={item} />,
    );

    expect(lastFrame()).toContain('Multi-Agent Orchestration Complete');
    expect(lastFrame()).toContain('Systems Architect');
    expect(lastFrame()).toContain('Architecture plan synthesized successfully.');
    expect(lastFrame()).toContain('write_file');
  });
});
