/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Config,
  ToolCallRequestInfo,
} from '@ouroboros/ouroboros-code-core';
import {
  executeToolCall,
  shutdownTelemetry,
  isTelemetrySdkInitialized,
  parseAndFormatApiError,
  FatalInputError,
  FatalTurnLimitedError,
  getResponseText,
} from '@ouroboros/ouroboros-code-core';

// Duplicate fingerprint computation logic from CoreToolScheduler
function stableSerialize(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys.map(
    (key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`,
  );
  return `{${entries.join(',')}}`;
}

function normalizeArgsForFingerprint(args: unknown): unknown {
  if (typeof args === 'string') {
    try {
      return normalizeArgsForFingerprint(JSON.parse(args));
    } catch (_error) {
      return args;
    }
  }
  if (Array.isArray(args)) {
    return args.map((entry) => normalizeArgsForFingerprint(entry));
  }
  if (args && typeof args === 'object') {
    const record = args as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(record)) {
      result[key] = normalizeArgsForFingerprint(record[key]);
    }
    return result;
  }
  return args;
}

function computeToolCallFingerprint(name: string, args: unknown): string {
  const normalizedArgs = normalizeArgsForFingerprint(args);
  return `${name}::${stableSerialize(normalizedArgs)}`;
}
import type {
  AgentMessage,
  AgentContentFragment,
} from './ui/types/agentContent.js';
import type {
  FunctionCall,
  Part,
  PartListUnion,
  GenerateContentConfig,
} from '@ouroboros/ouroboros-code-core';
import { ensureAgentContentArray } from './ui/types/agentContent.js';
import * as fs from 'node:fs/promises';
import { ConsolePatcher } from './ui/utils/ConsolePatcher.js';

// Function to strip ANSI escape codes
function stripAnsiCodes(str: string): string {
  return str.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');
}
import { handleAtCommand } from './ui/hooks/atCommandProcessor.js';
import {
  ContinuousInputManager,
  InputCommandType,
  type InputCommand,
} from './services/continuousInputManager.js';

async function handleInputCommand(
  command: InputCommand,
  currentMessages: AgentMessage[],
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
            parts: [
              { text: `[File Content from ${command.data}]:\n${fileContent}` },
            ],
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

    const agentsClient = config.getConversationClient();

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

    const messageQueue: AgentMessage[] = [
      { role: 'user', parts: ensureAgentContentArray(processedQuery) },
    ];

    let turnCount = 0;
    let shouldExit = false;

    while (!shouldExit) {
      // Check for continuous input before each turn
      if (inputManager && inputManager.hasPendingCommands()) {
        const command = inputManager.getNextCommand();
        if (command) {
          const handled = await handleInputCommand(
            command,
            messageQueue,
            config,
          );
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

      const toolDeclarations = config
        .getToolRegistry()
        .getFunctionDeclarations();
      const generationConfig: GenerateContentConfig = {
        abortSignal: abortController.signal,
      };
      if (toolDeclarations.length > 0) {
        generationConfig.tools = [{ functionDeclarations: toolDeclarations }];
      }

      if (messageQueue.length === 0) {
        if (config.isAutonomousMode() && inputManager) {
          await new Promise<void>((resolve) => {
            const checkForInput = setInterval(() => {
              if (
                inputManager.hasPendingCommands() ||
                shouldExit ||
                messageQueue.length > 0
              ) {
                clearInterval(checkForInput);
                resolve();
              }
            }, 100);
          });
          continue;
        }
        break;
      }

      const nextMessage = messageQueue.shift();
      if (!nextMessage) {
        continue;
      }

      const messageParts = (nextMessage.parts ?? []) as PartListUnion;
      const response = await agentsClient.sendMessage(
        {
          message: messageParts,
          config: generationConfig,
        },
        prompt_id,
      );

      if (abortController.signal.aborted) {
        console.error('Operation cancelled.');
        return;
      }

      const candidate = response.candidates?.[0];
      const responseParts =
        candidate && Array.isArray(candidate.content?.parts)
          ? (candidate.content!.parts as Part[])
          : [];

      const functionCalls = responseParts
        .map((part) => part.functionCall)
        .filter((call): call is FunctionCall => Boolean(call));

      // Deduplicate function calls based on fingerprint (name + normalized args)
      const seenFingerprints = new Set<string>();
      const uniqueFunctionCalls = functionCalls.filter((call) => {
        const fingerprint = computeToolCallFingerprint(call.name ?? 'unknown', call.args);
        if (seenFingerprints.has(fingerprint)) {
          return false;
        }
        seenFingerprints.add(fingerprint);
        return true;
      });

      const responseText = getResponseText(response) ?? '';
      if (responseText) {
        process.stdout.write(stripAnsiCodes(responseText));
      }

      if (uniqueFunctionCalls.length > 0) {
        const toolResponseParts: AgentContentFragment[] = [];
        for (const functionCall of uniqueFunctionCalls) {
          const requestInfo: ToolCallRequestInfo = {
            callId:
              functionCall.id ?? `${functionCall.name ?? 'tool'}-${Date.now()}`,
            name: functionCall.name ?? 'unknown_tool',
            args: (functionCall.args ?? {}) as Record<string, unknown>,
            isClientInitiated: true,
            prompt_id,
          };

           const toolResponse = await executeToolCall(
             config,
             requestInfo,
             abortController.signal,
           );

           if (toolResponse.error) {
             const displayText = typeof toolResponse.resultDisplay === 'string'
               ? toolResponse.resultDisplay
               : toolResponse.error.message;
             console.error(
               `Error executing tool ${requestInfo.name}: ${stripAnsiCodes(displayText)}`,
             );
           }

           if (toolResponse.responseParts) {
             // Strip ANSI codes from all response parts to prevent TUI rendering in plain text output
             const strippedResponseParts = toolResponse.responseParts.map(part => {
               if (typeof part === 'string') {
                 return { text: stripAnsiCodes(part) };
               }
               if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
                 return { ...part, text: stripAnsiCodes(part.text) };
               }
               return part;
             });
             toolResponseParts.push(...strippedResponseParts);
           }
        }
        if (toolResponseParts.length === 0) {
          toolResponseParts.push({
            text: 'All tool calls failed. Please analyze the errors and try an alternative approach.',
          });
        }
        messageQueue.unshift({ role: 'user', parts: toolResponseParts });
      } else {
        // In autonomous mode, wait for more input instead of exiting
        if (config.isAutonomousMode() && inputManager) {
          // Wait for new input
          await new Promise<void>((resolve) => {
            const checkForInput = setInterval(() => {
              if (
                inputManager.hasPendingCommands() ||
                shouldExit ||
                messageQueue.length > 0
              ) {
                clearInterval(checkForInput);
                resolve();
              }
            }, 100);
          });
        } else {
          if (!responseText.endsWith('\n')) {
            process.stdout.write('\n');
          }
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
