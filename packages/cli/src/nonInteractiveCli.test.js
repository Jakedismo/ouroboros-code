/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { executeToolCall, ToolErrorType, shutdownTelemetry, GeminiEventType, } from '@ouroboros/code-cli-core';
import { runNonInteractive } from './nonInteractiveCli.js';
import { vi } from 'vitest';
// Mock core modules
vi.mock('@ouroboros/code-cli-core', async (importOriginal) => {
    const original = await importOriginal();
    return {
        ...original,
        executeToolCall: vi.fn(),
        shutdownTelemetry: vi.fn(),
        isTelemetrySdkInitialized: vi.fn().mockReturnValue(true),
    };
});
describe('runNonInteractive', () => {
    let mockConfig;
    let mockToolRegistry;
    let mockCoreExecuteToolCall;
    let mockShutdownTelemetry;
    let consoleErrorSpy;
    let processExitSpy;
    let processStdoutSpy;
    let mockGeminiClient;
    beforeEach(() => {
        mockCoreExecuteToolCall = vi.mocked(executeToolCall);
        mockShutdownTelemetry = vi.mocked(shutdownTelemetry);
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        processExitSpy = vi
            .spyOn(process, 'exit')
            .mockImplementation((() => { }));
        processStdoutSpy = vi
            .spyOn(process.stdout, 'write')
            .mockImplementation(() => true);
        mockToolRegistry = {
            getTool: vi.fn(),
            getFunctionDeclarations: vi.fn().mockReturnValue([]),
        };
        mockGeminiClient = {
            sendMessageStream: vi.fn(),
        };
        mockConfig = {
            initialize: vi.fn().mockResolvedValue(undefined),
            getGeminiClient: vi.fn().mockReturnValue(mockGeminiClient),
            getToolRegistry: vi.fn().mockReturnValue(mockToolRegistry),
            getMaxSessionTurns: vi.fn().mockReturnValue(10),
            getIdeMode: vi.fn().mockReturnValue(false),
            getFullContext: vi.fn().mockReturnValue(false),
            getContentGeneratorConfig: vi.fn().mockReturnValue({}),
            getDebugMode: vi.fn().mockReturnValue(false),
        };
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });
    async function* createStreamFromEvents(events) {
        for (const event of events) {
            yield event;
        }
    }
    it('should process input and write text output', async () => {
        const events = [
            { type: GeminiEventType.Content, value: 'Hello' },
            { type: GeminiEventType.Content, value: ' World' },
        ];
        mockGeminiClient.sendMessageStream.mockReturnValue(createStreamFromEvents(events));
        await runNonInteractive(mockConfig, 'Test input', 'prompt-id-1');
        expect(mockGeminiClient.sendMessageStream).toHaveBeenCalledWith([{ text: 'Test input' }], expect.any(AbortSignal), 'prompt-id-1');
        expect(processStdoutSpy).toHaveBeenCalledWith('Hello');
        expect(processStdoutSpy).toHaveBeenCalledWith(' World');
        expect(processStdoutSpy).toHaveBeenCalledWith('\n');
        expect(mockShutdownTelemetry).toHaveBeenCalled();
    });
    it('should handle a single tool call and respond', async () => {
        const toolCallEvent = {
            type: GeminiEventType.ToolCallRequest,
            value: {
                callId: 'tool-1',
                name: 'testTool',
                args: { arg1: 'value1' },
                isClientInitiated: false,
                prompt_id: 'prompt-id-2',
            },
        };
        const toolResponse = [{ text: 'Tool response' }];
        mockCoreExecuteToolCall.mockResolvedValue({ responseParts: toolResponse });
        const firstCallEvents = [toolCallEvent];
        const secondCallEvents = [
            { type: GeminiEventType.Content, value: 'Final answer' },
        ];
        mockGeminiClient.sendMessageStream
            .mockReturnValueOnce(createStreamFromEvents(firstCallEvents))
            .mockReturnValueOnce(createStreamFromEvents(secondCallEvents));
        await runNonInteractive(mockConfig, 'Use a tool', 'prompt-id-2');
        expect(mockGeminiClient.sendMessageStream).toHaveBeenCalledTimes(2);
        expect(mockCoreExecuteToolCall).toHaveBeenCalledWith(mockConfig, expect.objectContaining({ name: 'testTool' }), expect.any(AbortSignal));
        expect(mockGeminiClient.sendMessageStream).toHaveBeenNthCalledWith(2, [{ text: 'Tool response' }], expect.any(AbortSignal), 'prompt-id-2');
        expect(processStdoutSpy).toHaveBeenCalledWith('Final answer');
        expect(processStdoutSpy).toHaveBeenCalledWith('\n');
    });
    it('should handle error during tool execution and should send error back to the model', async () => {
        const toolCallEvent = {
            type: GeminiEventType.ToolCallRequest,
            value: {
                callId: 'tool-1',
                name: 'errorTool',
                args: {},
                isClientInitiated: false,
                prompt_id: 'prompt-id-3',
            },
        };
        mockCoreExecuteToolCall.mockResolvedValue({
            error: new Error('Execution failed'),
            errorType: ToolErrorType.EXECUTION_FAILED,
            responseParts: {
                functionResponse: {
                    name: 'errorTool',
                    response: {
                        output: 'Error: Execution failed',
                    },
                },
            },
            resultDisplay: 'Execution failed',
        });
        const finalResponse = [
            {
                type: GeminiEventType.Content,
                value: 'Sorry, let me try again.',
            },
        ];
        mockGeminiClient.sendMessageStream
            .mockReturnValueOnce(createStreamFromEvents([toolCallEvent]))
            .mockReturnValueOnce(createStreamFromEvents(finalResponse));
        await runNonInteractive(mockConfig, 'Trigger tool error', 'prompt-id-3');
        expect(mockCoreExecuteToolCall).toHaveBeenCalled();
        expect(consoleErrorSpy).toHaveBeenCalledWith('Error executing tool errorTool: Execution failed');
        expect(processExitSpy).not.toHaveBeenCalled();
        expect(mockGeminiClient.sendMessageStream).toHaveBeenCalledTimes(2);
        expect(mockGeminiClient.sendMessageStream).toHaveBeenNthCalledWith(2, [
            {
                functionResponse: {
                    name: 'errorTool',
                    response: {
                        output: 'Error: Execution failed',
                    },
                },
            },
        ], expect.any(AbortSignal), 'prompt-id-3');
        expect(processStdoutSpy).toHaveBeenCalledWith('Sorry, let me try again.');
    });
    it('should exit with error if sendMessageStream throws initially', async () => {
        const apiError = new Error('API connection failed');
        mockGeminiClient.sendMessageStream.mockImplementation(() => {
            throw apiError;
        });
        await runNonInteractive(mockConfig, 'Initial fail', 'prompt-id-4');
        expect(consoleErrorSpy).toHaveBeenCalledWith('[API Error: API connection failed]');
        expect(processExitSpy).toHaveBeenCalledWith(1);
    });
    it('should not exit if a tool is not found, and should send error back to model', async () => {
        const toolCallEvent = {
            type: GeminiEventType.ToolCallRequest,
            value: {
                callId: 'tool-1',
                name: 'nonexistentTool',
                args: {},
                isClientInitiated: false,
                prompt_id: 'prompt-id-5',
            },
        };
        mockCoreExecuteToolCall.mockResolvedValue({
            error: new Error('Tool "nonexistentTool" not found in registry.'),
            resultDisplay: 'Tool "nonexistentTool" not found in registry.',
        });
        const finalResponse = [
            {
                type: GeminiEventType.Content,
                value: "Sorry, I can't find that tool.",
            },
        ];
        mockGeminiClient.sendMessageStream
            .mockReturnValueOnce(createStreamFromEvents([toolCallEvent]))
            .mockReturnValueOnce(createStreamFromEvents(finalResponse));
        await runNonInteractive(mockConfig, 'Trigger tool not found', 'prompt-id-5');
        expect(mockCoreExecuteToolCall).toHaveBeenCalled();
        expect(consoleErrorSpy).toHaveBeenCalledWith('Error executing tool nonexistentTool: Tool "nonexistentTool" not found in registry.');
        expect(processExitSpy).not.toHaveBeenCalled();
        expect(mockGeminiClient.sendMessageStream).toHaveBeenCalledTimes(2);
        expect(processStdoutSpy).toHaveBeenCalledWith("Sorry, I can't find that tool.");
    });
    it('should exit when max session turns are exceeded', async () => {
        vi.mocked(mockConfig.getMaxSessionTurns).mockReturnValue(0);
        await runNonInteractive(mockConfig, 'Trigger loop', 'prompt-id-6');
        expect(consoleErrorSpy).toHaveBeenCalledWith('\n Reached max session turns for this session. Increase the number of turns by specifying maxSessionTurns in settings.json.');
    });
});
//# sourceMappingURL=nonInteractiveCli.test.js.map