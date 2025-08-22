/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Config,
  ToolCallRequestInfo,
  executeToolCall,
  shutdownTelemetry,
  isTelemetrySdkInitialized,
  GeminiEventType,
  parseAndFormatApiError,
  AutonomousA2AHandler,
} from '@ouroboros/code-cli-core';
import { Content, Part, FunctionCall } from '@google/genai';

import { ConsolePatcher } from './ui/utils/ConsolePatcher.js';

/**
 * Execute a single task loop (one complete interaction cycle)
 * @param config - Configuration object
 * @param input - Initial input string
 * @param prompt_id - Unique prompt identifier
 * @param a2aHandler - Autonomous A2A handler instance
 * @param globalTurnCount - Global turn counter (for autonomous mode)
 * @returns Object with completion status and updated turn count
 */
async function executeTaskLoop(
  config: Config,
  input: string,
  prompt_id: string,
  a2aHandler: AutonomousA2AHandler | undefined,
  globalTurnCount = { count: 0 }
): Promise<{ completed: boolean; reachedMaxTurns: boolean }> {
  const geminiClient = config.getGeminiClient();
  const abortController = new AbortController();
  let currentMessages: Content[] = [
    { role: 'user', parts: [{ text: input }] },
  ];
  let turnCount = 0;
  
  while (true) {
    turnCount++;
    globalTurnCount.count++;
    
    if (
      config.getMaxSessionTurns() >= 0 &&
      globalTurnCount.count > config.getMaxSessionTurns()
    ) {
      console.error(
        '\n🛑 Reached max session turns for this session. Increase the number of turns by specifying maxSessionTurns in settings.json.',
      );
      return { completed: true, reachedMaxTurns: true };
    }
    
    const functionCalls: FunctionCall[] = [];

    const responseStream = geminiClient.sendMessageStream(
      currentMessages[0]?.parts || [],
      abortController.signal,
      prompt_id,
    );

    for await (const event of responseStream) {
      if (abortController.signal.aborted) {
        console.error('Operation cancelled.');
        return { completed: true, reachedMaxTurns: false };
      }

      if (event.type === GeminiEventType.Content) {
        process.stdout.write(event.value);
      } else if (event.type === GeminiEventType.ToolCallRequest) {
        const toolCallRequest = event.value;
        const fc: FunctionCall = {
          name: toolCallRequest.name,
          args: toolCallRequest.args,
          id: toolCallRequest.callId,
        };
        functionCalls.push(fc);
      }
    }

    if (functionCalls.length > 0) {
      const toolResponseParts: Part[] = [];

      for (const fc of functionCalls) {
        const callId = fc.id ?? `${fc.name}-${Date.now()}`;
        const requestInfo: ToolCallRequestInfo = {
          callId,
          name: fc.name as string,
          args: (fc.args ?? {}) as Record<string, unknown>,
          isClientInitiated: false,
          prompt_id,
        };

        const toolResponse = await executeToolCall(
          config,
          requestInfo,
          abortController.signal,
        );

        if (toolResponse.error) {
          console.error(
            `Error executing tool ${fc.name}: ${toolResponse.resultDisplay || toolResponse.error.message}`,
          );
        }

        if (toolResponse.responseParts) {
          const parts = Array.isArray(toolResponse.responseParts)
            ? toolResponse.responseParts
            : [toolResponse.responseParts];
          for (const part of parts) {
            if (typeof part === 'string') {
              toolResponseParts.push({ text: part });
            } else if (part) {
              toolResponseParts.push(part);
            }
          }
        }
      }
      currentMessages = [{ role: 'user', parts: toolResponseParts }];
    } else {
      process.stdout.write('\n'); // Ensure a final newline
      return { completed: true, reachedMaxTurns: false };
    }
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

  // Initialize A2A system for autonomous mode
  let a2aHandler: AutonomousA2AHandler | undefined;

  try {
    consolePatcher.patch();
    // Handle EPIPE errors when the output is piped to a command that closes early.
    process.stdout.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EPIPE') {
        // Exit gracefully if the pipe is closed.
        process.exit(0);
      }
    });

    // Initialize A2A handler for autonomous mode
    const mcpClientManager = config.getMCPClientManager();
    a2aHandler = new AutonomousA2AHandler(config, mcpClientManager);
    
    // TODO: Future enhancement - use A2A-aware content generation instead of legacy GeminiClient
    // Get content generator and wrap with A2A context injector
    // const baseContentGenerator = await config.getContentGenerator();
    // const wrappedContentGenerator = new A2AContextInjector(
    //   baseContentGenerator,
    //   config,
    //   a2aHandler,
    // );

    // Start A2A handler to listen for webhook notifications
    a2aHandler.start();

    if (config.getDebugMode()) {
      console.debug('[A2A] Autonomous agent mode initialized with A2A support');
    }

    // Execute the task and exit upon completion
    const globalTurnCount = { count: 0 };
    await executeTaskLoop(config, input, prompt_id, a2aHandler, globalTurnCount);
  } catch (error) {
    console.error(
      parseAndFormatApiError(
        error,
        config.getContentGeneratorConfig()?.authType,
      ),
    );
    process.exit(1);
  } finally {
    // Cleanup A2A handler
    if (a2aHandler) {
      a2aHandler.stop();
      if (config.getDebugMode()) {
        console.debug('[A2A] Autonomous A2A handler stopped');
      }
    }
    
    consolePatcher.cleanup();
    if (isTelemetrySdkInitialized()) {
      await shutdownTelemetry(config);
    }
  }
}

/**
 * Run autonomous mode - execute initial task then continue running for follow-up inputs
 * @param config - Configuration object  
 * @param input - Initial input string
 * @param prompt_id - Unique prompt identifier
 */
export async function runAutonomous(
  config: Config,
  input: string,
  prompt_id: string,
): Promise<void> {
  const consolePatcher = new ConsolePatcher({
    stderr: true,
    debugMode: config.getDebugMode(),
  });

  // Initialize A2A system for autonomous mode
  let a2aHandler: AutonomousA2AHandler | undefined;
  let globalTurnCount = { count: 0 };
  let isRunning = true;

  try {
    consolePatcher.patch();
    
    // Handle EPIPE errors when the output is piped to a command that closes early.
    process.stdout.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EPIPE') {
        // Exit gracefully if the pipe is closed.
        process.exit(0);
      }
    });

    // Initialize A2A handler for autonomous mode
    const mcpClientManager = config.getMCPClientManager();
    a2aHandler = new AutonomousA2AHandler(config, mcpClientManager);
    
    // Start A2A handler to listen for webhook notifications
    a2aHandler.start();

    if (config.getDebugMode()) {
      console.debug('[A2A] Autonomous agent mode initialized with A2A support');
    }

    // Execute initial task
    console.log('🤖 Starting autonomous mode with initial task...');
    const result = await executeTaskLoop(config, input, prompt_id, a2aHandler, globalTurnCount);
    
    if (result.reachedMaxTurns) {
      console.log('🛑 Autonomous mode terminated: Max session turns reached.');
      return;
    }
    
    // Initial task completed, enter persistent autonomous mode
    console.log('\n✅ Initial task completed. Autonomous mode activated.');
    console.log('💡 Listening for new inputs... (Ctrl+C to exit)');
    console.log('💬 Type new prompts and press Enter, or send A2A messages via webhooks.');
    
    // Set up signal handlers for graceful shutdown
    setupSignalHandlers(() => {
      isRunning = false;
      console.log('\n👋 Shutting down autonomous mode...');
    });
    
    // Enter persistent mode - listen for stdin input
    await enterPersistentMode(config, a2aHandler, globalTurnCount, () => isRunning);
    
  } catch (error) {
    console.error(
      parseAndFormatApiError(
        error,
        config.getContentGeneratorConfig()?.authType,
      ),
    );
    process.exit(1);
  } finally {
    // Cleanup A2A handler
    if (a2aHandler) {
      a2aHandler.stop();
      if (config.getDebugMode()) {
        console.debug('[A2A] Autonomous A2A handler stopped');
      }
    }
    
    consolePatcher.cleanup();
    if (isTelemetrySdkInitialized()) {
      await shutdownTelemetry(config);
    }
  }
}

/**
 * Enter persistent autonomous mode - listen for inputs indefinitely
 */
async function enterPersistentMode(
  config: Config,
  a2aHandler: AutonomousA2AHandler | undefined,
  globalTurnCount: { count: number },
  isRunning: () => boolean,
): Promise<void> {
  const readline = await import('readline');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '🤖 autonomous> ',
  });
  
  // Display prompt
  rl.prompt();
  
  return new Promise((resolve) => {
    rl.on('line', async (input: string) => {
      const trimmedInput = input.trim();
      
      if (!trimmedInput) {
        rl.prompt();
        return;
      }
      
      // Handle special commands
      if (trimmedInput === '/exit' || trimmedInput === '/quit') {
        console.log('👋 Exiting autonomous mode...');
        rl.close();
        return resolve();
      }
      
      if (trimmedInput === '/status') {
        console.log(`📊 Status: Turn count: ${globalTurnCount.count}, Max turns: ${config.getMaxSessionTurns()}`);
        rl.prompt();
        return;
      }
      
      try {
        // Execute the new task
        console.log('\n🔄 Processing new task...');
        const prompt_id = Math.random().toString(16).slice(2);
        const result = await executeTaskLoop(config, trimmedInput, prompt_id, a2aHandler, globalTurnCount);
        
        if (result.reachedMaxTurns) {
          console.log('🛑 Autonomous mode terminated: Max session turns reached.');
          rl.close();
          return resolve();
        }
        
        console.log('\n✅ Task completed. Ready for next input.');
        
      } catch (error) {
        console.error('❌ Error processing task:', error);
      }
      
      if (isRunning()) {
        rl.prompt();
      } else {
        rl.close();
        resolve();
      }
    });
    
    rl.on('close', () => {
      resolve();
    });
  });
}

/**
 * Set up signal handlers for graceful shutdown
 */
function setupSignalHandlers(onShutdown: () => void): void {
  process.on('SIGINT', () => {
    onShutdown();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    onShutdown();
    process.exit(0);
  });
}
