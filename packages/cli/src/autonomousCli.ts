/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '@ouroboros/ouroboros-code-core';
import {
  shutdownTelemetry,
  isTelemetrySdkInitialized,
  parseAndFormatApiError,
} from '@ouroboros/ouroboros-code-core';
import * as net from 'node:net';
import { ConsolePatcher } from './ui/utils/ConsolePatcher.js';
import { runNonInteractive } from './nonInteractiveCli.js';

const A2A_PORT = 45123;
const A2A_HOST = '127.0.0.1';

interface A2AMessage {
  type: 'task' | 'context' | 'status' | 'result';
  data: unknown;
  timestamp: number;
  sender?: string;
}

/**
 * Runs the CLI in autonomous mode with continuous execution and A2A communication support
 */
export async function runAutonomous(
  config: Config,
  initialPrompt: string,
  prompt_id: string,
): Promise<void> {
  const consolePatcher = new ConsolePatcher({
    stderr: true,
    debugMode: config.getDebugMode(),
  });

  try {
    consolePatcher.patch();

    console.log('🤖 Starting Ouroboros in Autonomous Mode');
    console.log(`📡 A2A Communication enabled on port ${A2A_PORT}`);
    console.log('📝 Input commands available:');
    console.log('  #INJECT_CONTEXT ... #END_CONTEXT - Inject context');
    console.log('  #INJECT_FILE <path> - Inject file content');
    console.log('  #INJECT_COMMAND <cmd> - Execute command');
    console.log('  #PAUSE_EXECUTION - Pause execution');
    console.log('  #RESUME_EXECUTION - Resume execution');
    console.log('  #EXIT_AUTONOMOUS - Exit autonomous mode');
    console.log('');

    // Start A2A server if experimental mode is enabled
    let a2aServer: net.Server | undefined;
    if (config.getDebugMode() || process.env['EXPERIMENTAL_A2A_MODE'] === 'true') {
      a2aServer = await startA2AServer(config);
    }

    // Run the main non-interactive loop with continuous input support
    await runNonInteractive(config, initialPrompt, prompt_id);

    // Cleanup A2A server
    if (a2aServer) {
      await new Promise<void>((resolve) => {
        a2aServer.close(() => resolve());
      });
    }

    console.log('✅ Autonomous mode completed');
  } catch (error) {
    console.error(
      parseAndFormatApiError(
        error,
        config.getContentGeneratorConfig()?.authType,
      ),
    );
    throw error;
  } finally {
    consolePatcher.cleanup();
    if (isTelemetrySdkInitialized()) {
      await shutdownTelemetry(config);
    }
  }
}

/**
 * Starts the A2A (Agent-to-Agent) communication server
 */
async function startA2AServer(config: Config): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      if (config.getDebugMode()) {
        console.debug(`[A2A] New connection from ${socket.remoteAddress}`);
      }

      socket.on('data', (data) => {
        try {
          const message = JSON.parse(data.toString()) as A2AMessage;
          handleA2AMessage(message, socket, config);
        } catch (error) {
          console.error('[A2A] Failed to parse message:', error);
          socket.write(JSON.stringify({
            type: 'error',
            data: 'Invalid message format',
            timestamp: Date.now(),
          }));
        }
      });

      socket.on('error', (error) => {
        if (config.getDebugMode()) {
          console.debug('[A2A] Socket error:', error);
        }
      });

      socket.on('close', () => {
        if (config.getDebugMode()) {
          console.debug('[A2A] Connection closed');
        }
      });
    });

    server.on('error', (error) => {
      if ((error as any).code === 'EADDRINUSE') {
        console.warn(`[A2A] Port ${A2A_PORT} is already in use`);
        // Don't fail, just continue without A2A
        resolve(server);
      } else {
        reject(error);
      }
    });

    server.listen(A2A_PORT, A2A_HOST, () => {
      if (config.getDebugMode()) {
        console.debug(`[A2A] Server listening on ${A2A_HOST}:${A2A_PORT}`);
      }
      resolve(server);
    });
  });
}

/**
 * Handles incoming A2A messages
 */
function handleA2AMessage(
  message: A2AMessage,
  socket: net.Socket,
  config: Config,
): void {
  if (config.getDebugMode()) {
    console.debug('[A2A] Received message:', message.type, message.sender);
  }

  switch (message.type) {
    case 'task':
      // Handle task delegation from another agent
      socket.write(JSON.stringify({
        type: 'status',
        data: 'Task received and queued',
        timestamp: Date.now(),
      }));
      break;

    case 'context':
      // Handle context sharing from another agent
      socket.write(JSON.stringify({
        type: 'status',
        data: 'Context received',
        timestamp: Date.now(),
      }));
      break;

    case 'status':
      // Handle status query
      socket.write(JSON.stringify({
        type: 'status',
        data: {
          mode: 'autonomous',
          active: true,
          capabilities: ['task', 'context', 'multi-provider'],
        },
        timestamp: Date.now(),
      }));
      break;

    default:
      socket.write(JSON.stringify({
        type: 'error',
        data: `Unknown message type: ${message.type}`,
        timestamp: Date.now(),
      }));
  }
}

/**
 * Client function to send messages to other agents via A2A
 */
export async function sendA2AMessage(
  message: A2AMessage,
  targetHost: string = A2A_HOST,
  targetPort: number = A2A_PORT,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();

    client.connect(targetPort, targetHost, () => {
      client.write(JSON.stringify(message));
    });

    client.on('data', (data) => {
      try {
        const response = JSON.parse(data.toString());
        client.destroy();
        resolve(response);
      } catch (error) {
        reject(error);
      }
    });

    client.on('error', (error) => {
      reject(error);
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      client.destroy();
      reject(new Error('A2A communication timeout'));
    }, 5000);
  });
}