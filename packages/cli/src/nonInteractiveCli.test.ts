/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config, ToolRegistry } from '@ouroboros/ouroboros-code-core';
import {
  executeToolCall,
  ToolErrorType,
  shutdownTelemetry,
} from '@ouroboros/ouroboros-code-core';
import type { AgentContentFragment } from './ui/types/agentContent.js';
import { runNonInteractive } from './nonInteractiveCli.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('./ui/hooks/atCommandProcessor.js');
vi.mock('@ouroboros/ouroboros-code-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@ouroboros/ouroboros-code-core')>();
  return {
    ...original,
    executeToolCall: vi.fn(),
    shutdownTelemetry: vi.fn(),
    isTelemetrySdkInitialized: vi.fn().mockReturnValue(true),
  };
});

describe('runNonInteractive', () => {
  let mockConfig: Config;
  let mockToolRegistry: ToolRegistry;
  let mockExecuteToolCall: vi.Mock;
  let mockShutdownTelemetry: vi.Mock;
  let consoleErrorSpy: vi.SpyInstance;
  let processStdoutSpy: vi.SpyInstance;
  let mockAgentsClient: {
    sendMessage: vi.Mock;
  };

  beforeEach(async () => {
    mockExecuteToolCall = vi.mocked(executeToolCall);
    mockShutdownTelemetry = vi.mocked(shutdownTelemetry);

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processStdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    mockToolRegistry = {
      getTool: vi.fn(),
      registerTool: vi.fn(),
      getFunctionDeclarations: vi.fn().mockReturnValue([]),
      getFunctionDeclarationsFiltered: vi.fn().mockReturnValue([]),
    } as unknown as ToolRegistry;

    mockAgentsClient = {
      sendMessage: vi.fn(),
    };

    mockConfig = {
      initialize: vi.fn().mockResolvedValue(undefined),
      getConversationClient: vi.fn().mockReturnValue(mockAgentsClient),
      getToolRegistry: vi.fn().mockReturnValue(mockToolRegistry),
      getMaxSessionTurns: vi.fn().mockReturnValue(10),
      getIdeMode: vi.fn().mockReturnValue(false),
      getFullContext: vi.fn().mockReturnValue(false),
      getContentGeneratorConfig: vi.fn().mockReturnValue({}),
      getDebugMode: vi.fn().mockReturnValue(false),
      isContinuousInputEnabled: vi.fn().mockReturnValue(false),
      isAutonomousMode: vi.fn().mockReturnValue(false),
    } as unknown as Config;

    const { handleAtCommand } = await import(
      './ui/hooks/atCommandProcessor.js'
    );
    vi.mocked(handleAtCommand).mockImplementation(async ({ query }) => ({
      processedQuery: [{ text: query }],
      shouldProceed: true,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createResponse = (
    parts: Array<Record<string, unknown>>,
  ): Record<string, unknown> => ({
    candidates: [
      {
        content: {
          role: 'model',
          parts,
        },
      },
    ],
  });

  it('should process input and write text output', async () => {
    mockAgentsClient.sendMessage.mockResolvedValue(
      createResponse([{ text: 'Hello World' }]),
    );

    await runNonInteractive(mockConfig, 'Test input', 'prompt-id-1');

    expect(mockAgentsClient.sendMessage).toHaveBeenCalledWith(
      {
        message: [{ text: 'Test input' }],
        config: expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
      },
      'prompt-id-1',
    );
    expect(processStdoutSpy).toHaveBeenCalledWith('Hello World');
    expect(processStdoutSpy).toHaveBeenCalledWith('
');
    expect(mockShutdownTelemetry).toHaveBeenCalled();
  });

  it('should handle a single tool call and respond', async () => {
    mockAgentsClient.sendMessage
      .mockResolvedValueOnce(
        createResponse([
          {
            functionCall: {
              id: 'tool-1',
              name: 'testTool',
              args: { arg1: 'value1' },
            },
          },
        ]),
      )
      .mockResolvedValueOnce(createResponse([{ text: 'Final answer' }]));

    const toolResponse: AgentContentFragment[] = [{ text: 'Tool response' }];
    mockExecuteToolCall.mockResolvedValue({ responseParts: toolResponse });

    await runNonInteractive(mockConfig, 'Use a tool', 'prompt-id-2');

    expect(mockAgentsClient.sendMessage).toHaveBeenCalledTimes(2);
    expect(mockExecuteToolCall).toHaveBeenCalledWith(
      mockConfig,
      expect.objectContaining({ name: 'testTool' }),
      expect.any(AbortSignal),
    );
    const secondCallArgs = mockAgentsClient.sendMessage.mock.calls[1][0];
    expect(secondCallArgs.message).toEqual(toolResponse);
    expect(processStdoutSpy).toHaveBeenCalledWith('Final answer');
    expect(processStdoutSpy).toHaveBeenCalledWith('
');
  });

  it('should handle error during tool execution and send fallback message', async () => {
    mockAgentsClient.sendMessage
      .mockResolvedValueOnce(
        createResponse([
          {
            functionCall: {
              id: 'tool-1',
              name: 'errorTool',
              args: {},
            },
          },
        ]),
      )
      .mockResolvedValueOnce(createResponse([{ text: 'Sorry, let me try again.' }]));

    mockExecuteToolCall.mockResolvedValue({
      error: new Error('Execution failed'),
      errorType: ToolErrorType.EXECUTION_FAILED,
      resultDisplay: 'Execution failed',
    });

    await runNonInteractive(mockConfig, 'Trigger tool error', 'prompt-id-3');

    expect(mockExecuteToolCall).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error executing tool errorTool: Execution failed',
    );
    const secondCallArgs = mockAgentsClient.sendMessage.mock.calls[1][0];
    expect(secondCallArgs.message).toEqual([
      {
        text: 'All tool calls failed. Please analyze the errors and try an alternative approach.',
      },
    ]);
    expect(processStdoutSpy).toHaveBeenCalledWith('Sorry, let me try again.');
  });

  it('should exit with error if sendMessage throws initially', async () => {
    const apiError = new Error('API connection failed');
    mockAgentsClient.sendMessage.mockRejectedValueOnce(apiError);

    await expect(
      runNonInteractive(mockConfig, 'Initial fail', 'prompt-id-4'),
    ).rejects.toThrow(apiError);
  });

  it('should not exit if a tool is not found and should report the error', async () => {
    mockAgentsClient.sendMessage
      .mockResolvedValueOnce(
        createResponse([
          {
            functionCall: {
              id: 'tool-1',
              name: 'nonexistentTool',
              args: {},
            },
          },
        ]),
      )
      .mockResolvedValueOnce(
        createResponse([{ text: "Sorry, I can't find that tool." }]),
      );

    mockExecuteToolCall.mockResolvedValue({
      error: new Error('Tool "nonexistentTool" not found in registry.'),
      resultDisplay: 'Tool "nonexistentTool" not found in registry.',
    });

    await runNonInteractive(
      mockConfig,
      'Trigger tool not found',
      'prompt-id-5',
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error executing tool nonexistentTool: Tool "nonexistentTool" not found in registry.',
    );
    const secondCallArgs = mockAgentsClient.sendMessage.mock.calls[1][0];
    expect(secondCallArgs.message).toEqual([
      {
        text: 'All tool calls failed. Please analyze the errors and try an alternative approach.',
      },
    ]);
    expect(processStdoutSpy).toHaveBeenCalledWith(
      "Sorry, I can't find that tool.",
    );
  });

  it('should exit when max session turns are exceeded', async () => {
    vi.mocked(mockConfig.getMaxSessionTurns).mockReturnValue(0);
    await expect(
      runNonInteractive(mockConfig, 'Trigger loop', 'prompt-id-6'),
    ).rejects.toThrow(
      'Reached max session turns for this session. Increase the number of turns by specifying maxSessionTurns in settings.json.',
    );
  });

  it('should preprocess @include commands before sending to the model', async () => {
    const { handleAtCommand } = await import(
      './ui/hooks/atCommandProcessor.js'
    );
    const mockHandleAtCommand = vi.mocked(handleAtCommand);

    const rawInput = 'Summarize @file.txt';
    const processedParts: AgentContentFragment[] = [
      { text: 'Summarize @file.txt' },
      { text: '
--- Content from referenced files ---
' },
      { text: 'This is the content of the file.' },
      { text: '
--- End of content ---' },
    ];

    mockHandleAtCommand.mockResolvedValue({
      processedQuery: processedParts,
      shouldProceed: true,
    });

    mockAgentsClient.sendMessage.mockResolvedValue(
      createResponse([{ text: 'Summary complete.' }]),
    );

    await runNonInteractive(mockConfig, rawInput, 'prompt-id-7');

    expect(mockAgentsClient.sendMessage).toHaveBeenCalledWith(
      {
        message: processedParts,
        config: expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
      },
      'prompt-id-7',
    );
    expect(processStdoutSpy).toHaveBeenCalledWith('Summary complete.');
  });
});
