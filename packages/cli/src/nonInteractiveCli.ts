/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config, ToolCallRequestInfo } from '@ouroboros/ouroboros-code-core';
import {
  executeToolCall,
  shutdownTelemetry,
  isTelemetrySdkInitialized,
  GeminiEventType,
  parseAndFormatApiError,
  FatalInputError,
  FatalTurnLimitedError,
} from '@ouroboros/ouroboros-code-core';
import type { Content, Part } from '@google/genai';
import * as fs from 'node:fs/promises';

import { ConsolePatcher } from './ui/utils/ConsolePatcher.js';
import { handleAtCommand } from './ui/hooks/atCommandProcessor.js';
import { ContinuousInputManager, InputCommandType, type InputCommand } from './services/continuousInputManager.js';

async function handleInputCommand(
  command: InputCommand,
  currentMessages: Content[],
  config: Config,
): Promise<'exit' | 'continue' | 'processed'> {
  switch (command.type) {
    case InputCommandType.EXIT_AUTONOMOUS:
      if (config.getDebugMode()) {
        console.debug('[Autonomous] Received exit command');
      }
      return 'exit';

    case InputCommandType.PAUSE_EXECUTION:
      if (config.getDebugMode()) {
        console.debug('[Autonomous] Execution paused');
      }
      // Wait for resume command
      return 'continue';

    case InputCommandType.RESUME_EXECUTION:
      if (config.getDebugMode()) {
        console.debug('[Autonomous] Execution resumed');
      }
      return 'continue';

    case InputCommandType.USER_MESSAGE:
      if (command.data) {
        // Add user message to the conversation
        currentMessages.push({
          role: 'user',
          parts: [{ text: command.data }],
        });
        return 'processed';
      }
      return 'continue';

    case InputCommandType.INJECT_CONTEXT:
      if (command.data) {
        // Inject context as a system message
        currentMessages.push({
          role: 'user',
          parts: [{ text: `[Context Injection]:\n${command.data}` }],
        });
        return 'processed';
      }
      return 'continue';

    case InputCommandType.INJECT_FILE:
      if (command.data) {
        try {
          const fileContent = await fs.readFile(command.data, 'utf-8');
          currentMessages.push({
            role: 'user',
            parts: [{ text: `[File Content from ${command.data}]:\n${fileContent}` }],
          });
          return 'processed';
        } catch (error) {
          console.error(`Failed to read file ${command.data}:`, error);
        }
      }
      return 'continue';

    case InputCommandType.INJECT_COMMAND:
      if (command.data) {
        // Inject as a command for the AI to execute
        currentMessages.push({
          role: 'user',
          parts: [{ text: `[Execute Command]: ${command.data}` }],
        });
        return 'processed';
      }
      return 'continue';

    default:
      return 'continue';
  }
}

export async function runNonInteractive(
  config: Config,
  input: string,
  prompt_id: string,
): Promise<void> {
  const consolePatcher = new ConsolePatcher({
    stderr: true,
    debugMode: config.getDebugMode(),
  });

  let inputManager: ContinuousInputManager | undefined;
  if (config.isContinuousInputEnabled()) {
    inputManager = new ContinuousInputManager({
      debugMode: config.getDebugMode(),
      enableProtocol: true,
    });
    inputManager.start();
  }

  try {
    consolePatcher.patch();
    // Handle EPIPE errors when the output is piped to a command that closes early.
    process.stdout.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EPIPE') {
        // Exit gracefully if the pipe is closed.
        process.exit(0);
      }
    });

    const geminiClient = config.getGeminiClient();

    const abortController = new AbortController();

    const { processedQuery, shouldProceed } = await handleAtCommand({
      query: input,
      config,
      addItem: (_item, _timestamp) => 0,
      onDebugMessage: () => {},
      messageId: Date.now(),
      signal: abortController.signal,
    });

    if (!shouldProceed || !processedQuery) {
      // An error occurred during @include processing (e.g., file not found).
      // The error message is already logged by handleAtCommand.
      throw new FatalInputError(
        'Exiting due to an error processing the @ command.',
      );
    }

    let currentMessages: Content[] = [
      { role: 'user', parts: processedQuery as Part[] },
    ];

    let turnCount = 0;
    let shouldExit = false;
    
    while (!shouldExit) {
      // Check for continuous input before each turn
      if (inputManager && inputManager.hasPendingCommands()) {
        const command = inputManager.getNextCommand();
        if (command) {
          const handled = await handleInputCommand(command, currentMessages, config);
          if (handled === 'exit') {
            shouldExit = true;
            break;
          } else if (handled === 'continue') {
            continue;
          }
        }
      }
      turnCount++;
      if (
        config.getMaxSessionTurns() >= 0 &&
        turnCount > config.getMaxSessionTurns()
      ) {
        throw new FatalTurnLimitedError(
          'Reached max session turns for this session. Increase the number of turns by specifying maxSessionTurns in settings.json.',
        );
      }
      const toolCallRequests: ToolCallRequestInfo[] = [];

      const responseStream = geminiClient.sendMessageStream(
        currentMessages[0]?.parts || [],
        abortController.signal,
        prompt_id,
      );

      for await (const event of responseStream) {
        if (abortController.signal.aborted) {
          console.error('Operation cancelled.');
          return;
        }

        if (event.type === GeminiEventType.Content) {
          process.stdout.write(event.value);
        } else if (event.type === GeminiEventType.ToolCallRequest) {
          toolCallRequests.push(event.value);
        }
      }

      if (toolCallRequests.length > 0) {
        const toolResponseParts: Part[] = [];
        for (const requestInfo of toolCallRequests) {
          const toolResponse = await executeToolCall(
            config,
            requestInfo,
            abortController.signal,
          );

          if (toolResponse.error) {
            console.error(
              `Error executing tool ${requestInfo.name}: ${toolResponse.resultDisplay || toolResponse.error.message}`,
            );
          }

          if (toolResponse.responseParts) {
            toolResponseParts.push(...toolResponse.responseParts);
          }
        }
        currentMessages = [{ role: 'user', parts: toolResponseParts }];
      } else {
        // In autonomous mode, wait for more input instead of exiting
        if (config.isAutonomousMode() && inputManager) {
          // Wait for new input
          await new Promise<void>((resolve) => {
            const checkForInput = setInterval(() => {
              if (inputManager.hasPendingCommands() || shouldExit) {
                clearInterval(checkForInput);
                resolve();
              }
            }, 100);
          });
        } else {
          process.stdout.write('\n'); // Ensure a final newline
          return;
        }
      }
    }
  } catch (error) {
    console.error(
      parseAndFormatApiError(
        error,
        config.getContentGeneratorConfig()?.authType,
      ),
    );
    throw error;
  } finally {
    if (inputManager) {
      inputManager.stop();
    }
    consolePatcher.cleanup();
    if (isTelemetrySdkInitialized()) {
      await shutdownTelemetry(config);
    }
  }
}
