/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { Text } from 'ink';
import { ToolGroupMessage } from './ToolGroupMessage.js';
import { type IndividualToolCallDisplay, ToolCallStatus } from '../../types.js';
import type {
  Config,
  ToolCallConfirmationDetails,
} from '@ouroboros/ouroboros-code-core';
import { TOOL_STATUS } from '../../constants.js';

vi.mock('./ToolMessage.js', () => ({
  ToolMessageMemoized: function MockToolMessage({
    callId,
    name,
    description,
    status,
    emphasis,
  }: {
    callId: string;
    name: string;
    description: string;
    status: ToolCallStatus;
    emphasis: string;
  }) {
    const statusSymbolMap: Record<ToolCallStatus, string> = {
      [ToolCallStatus.Success]: TOOL_STATUS.SUCCESS,
      [ToolCallStatus.Pending]: TOOL_STATUS.PENDING,
      [ToolCallStatus.Executing]: TOOL_STATUS.EXECUTING,
      [ToolCallStatus.Confirming]: TOOL_STATUS.CONFIRMING,
      [ToolCallStatus.Canceled]: TOOL_STATUS.CANCELED,
      [ToolCallStatus.Error]: TOOL_STATUS.ERROR,
    };
    const statusSymbol = statusSymbolMap[status] ?? '?';
    return (
      <Text>
        MockTool[{callId}]: {statusSymbol} {name} - {description} ({emphasis})
      </Text>
    );
  },
}));

vi.mock('./ToolConfirmationMessage.js', () => ({
  ToolConfirmationMessage: function MockToolConfirmationMessage({
    confirmationDetails,
  }: {
    confirmationDetails: ToolCallConfirmationDetails;
  }) {
    const displayText =
      confirmationDetails?.type === 'info'
        ? (confirmationDetails as { prompt: string }).prompt
        : confirmationDetails?.title ?? 'confirm';
    return <Text>MockConfirmation: {displayText}</Text>;
  },
}));

describe('<ToolGroupMessage />', () => {
  const mockConfig: Config = {} as Config;

  const createToolCall = (
    overrides: Partial<IndividualToolCallDisplay> = {},
  ): IndividualToolCallDisplay => ({
    callId: 'tool-123',
    name: 'test-tool',
    description: 'A tool for testing',
    resultDisplay: 'Test result',
    status: ToolCallStatus.Success,
    confirmationDetails: undefined,
    renderOutputAsMarkdown: false,
    ...overrides,
  });

  const baseProps = {
    groupId: 1,
    terminalWidth: 80,
    config: mockConfig,
    isFocused: true,
  };

  it('renders a progress summary when multiple tools are present', () => {
    const toolCalls = [
      createToolCall({
        callId: 'tool-1',
        name: 'successful-tool',
        status: ToolCallStatus.Success,
      }),
      createToolCall({
        callId: 'tool-2',
        name: 'pending-tool',
        status: ToolCallStatus.Pending,
      }),
      createToolCall({
        callId: 'tool-3',
        name: 'error-tool',
        status: ToolCallStatus.Error,
      }),
    ];

    const { lastFrame } = render(
      <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
    );

    const frame = lastFrame();
    expect(frame).toContain('2/3 tools finished');
    expect(frame).toContain('MockTool[tool-1]');
    expect(frame).toContain('MockTool[tool-3]');
  });

  it('omits the summary when only a single tool is rendered', () => {
    const toolCalls = [createToolCall()];
    const { lastFrame } = render(
      <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
    );

    const frame = lastFrame();
    expect(frame).toContain('MockTool[tool-123]');
    expect(frame).not.toContain('tools finished');
  });

  it('renders the confirmation dialog for the first confirming tool only', () => {
    const toolCalls = [
      createToolCall({
        callId: 'tool-1',
        name: 'first-confirm',
        status: ToolCallStatus.Confirming,
        confirmationDetails: {
          type: 'info',
          title: 'Confirm First Tool',
          prompt: 'Confirm first tool',
          onConfirm: vi.fn(),
        },
      }),
      createToolCall({
        callId: 'tool-2',
        name: 'second-confirm',
        status: ToolCallStatus.Confirming,
        confirmationDetails: {
          type: 'info',
          title: 'Confirm Second Tool',
          prompt: 'Confirm second tool',
          onConfirm: vi.fn(),
        },
      }),
    ];

    const { lastFrame } = render(
      <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
    );

    const frame = lastFrame();
    expect(frame).toContain('MockConfirmation: Confirm first tool');
    expect(frame).not.toContain('Confirm Second Tool');
  });

  it('continues to label shell commands distinctly', () => {
    const toolCalls = [
      createToolCall({
        callId: 'shell-1',
        name: 'run_shell_command',
        description: 'Execute shell command',
        status: ToolCallStatus.Success,
      }),
    ];

    const { lastFrame } = render(
      <ToolGroupMessage {...baseProps} toolCalls={toolCalls} />,
    );

    expect(lastFrame()).toContain('run_shell_command');
  });

  it('respects available terminal height when rendering long results', () => {
    const toolCalls = [
      createToolCall({
        callId: 'tool-1',
        name: 'tool-with-result',
        resultDisplay:
          'This is a long result that might need height constraints',
      }),
      createToolCall({
        callId: 'tool-2',
        name: 'another-tool',
        resultDisplay: 'More output here',
      }),
    ];

    const { lastFrame } = render(
      <ToolGroupMessage
        {...baseProps}
        toolCalls={toolCalls}
        availableTerminalHeight={10}
      />,
    );

    const frame = lastFrame();
    expect(frame).toContain('tool-with-result');
    expect(frame).toContain('another-tool');
  });
});
