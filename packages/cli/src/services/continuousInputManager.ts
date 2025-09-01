/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import * as readline from 'node:readline';
import { Readable } from 'node:stream';

export enum InputCommandType {
  INJECT_CONTEXT = 'INJECT_CONTEXT',
  INJECT_FILE = 'INJECT_FILE',
  INJECT_COMMAND = 'INJECT_COMMAND',
  PAUSE_EXECUTION = 'PAUSE_EXECUTION',
  RESUME_EXECUTION = 'RESUME_EXECUTION',
  EXIT_AUTONOMOUS = 'EXIT_AUTONOMOUS',
  USER_MESSAGE = 'USER_MESSAGE',
}

export interface InputCommand {
  type: InputCommandType;
  data?: string;
  timestamp: number;
}

export interface ContinuousInputManagerOptions {
  debugMode?: boolean;
  inputStream?: Readable;
  enableProtocol?: boolean;
}

/**
 * Manages continuous input from stdin during headless sessions.
 * Supports both raw user messages and special control commands.
 */
export class ContinuousInputManager extends EventEmitter {
  private readonly debugMode: boolean;
  private readonly enableProtocol: boolean;
  private readonly inputQueue: InputCommand[] = [];
  private rlInterface: readline.Interface | null = null;
  private isPaused = false;
  private isCollectingContext = false;
  private contextBuffer: string[] = [];
  private inputStream: Readable;

  constructor(options: ContinuousInputManagerOptions = {}) {
    super();
    this.debugMode = options.debugMode || false;
    this.enableProtocol = options.enableProtocol !== false;
    this.inputStream = options.inputStream || process.stdin;
  }

  /**
   * Start monitoring stdin for continuous input
   */
  start(): void {
    if (this.rlInterface) {
      return; // Already started
    }

    this.rlInterface = readline.createInterface({
      input: this.inputStream,
      output: process.stdout,
      terminal: false,
    });

    this.rlInterface.on('line', (line: string) => {
      this.processInputLine(line);
    });

    this.rlInterface.on('close', () => {
      this.emit('close');
    });

    if (this.debugMode) {
      console.debug('[ContinuousInputManager] Started monitoring stdin');
    }
  }

  /**
   * Stop monitoring stdin
   */
  stop(): void {
    if (this.rlInterface) {
      this.rlInterface.close();
      this.rlInterface = null;
    }
    this.inputQueue.length = 0;
    this.contextBuffer.length = 0;
    this.isCollectingContext = false;
  }

  /**
   * Process a single line of input
   */
  private processInputLine(line: string): void {
    // Handle protocol commands if enabled
    if (this.enableProtocol && line.startsWith('#')) {
      this.handleProtocolCommand(line);
      return;
    }

    // If we're collecting context, add to buffer
    if (this.isCollectingContext) {
      this.contextBuffer.push(line);
      return;
    }

    // Otherwise, treat as a regular user message
    if (!this.isPaused && line.trim()) {
      const command: InputCommand = {
        type: InputCommandType.USER_MESSAGE,
        data: line,
        timestamp: Date.now(),
      };
      this.enqueueCommand(command);
    }
  }

  /**
   * Handle special protocol commands
   */
  private handleProtocolCommand(line: string): void {
    const trimmed = line.trim();

    switch (trimmed) {
      case '#INJECT_CONTEXT':
        this.isCollectingContext = true;
        this.contextBuffer = [];
        break;

      case '#END_CONTEXT':
        if (this.isCollectingContext) {
          const contextData = this.contextBuffer.join('\n');
          this.enqueueCommand({
            type: InputCommandType.INJECT_CONTEXT,
            data: contextData,
            timestamp: Date.now(),
          });
          this.contextBuffer = [];
          this.isCollectingContext = false;
        }
        break;

      case '#PAUSE_EXECUTION':
        this.isPaused = true;
        this.enqueueCommand({
          type: InputCommandType.PAUSE_EXECUTION,
          timestamp: Date.now(),
        });
        break;

      case '#RESUME_EXECUTION':
        this.isPaused = false;
        this.enqueueCommand({
          type: InputCommandType.RESUME_EXECUTION,
          timestamp: Date.now(),
        });
        break;

      case '#EXIT_AUTONOMOUS':
        this.enqueueCommand({
          type: InputCommandType.EXIT_AUTONOMOUS,
          timestamp: Date.now(),
        });
        break;

      default:
        // Check for parameterized commands
        if (trimmed.startsWith('#INJECT_FILE ')) {
          const filePath = trimmed.substring('#INJECT_FILE '.length).trim();
          this.enqueueCommand({
            type: InputCommandType.INJECT_FILE,
            data: filePath,
            timestamp: Date.now(),
          });
        } else if (trimmed.startsWith('#INJECT_COMMAND ')) {
          const command = trimmed.substring('#INJECT_COMMAND '.length).trim();
          this.enqueueCommand({
            type: InputCommandType.INJECT_COMMAND,
            data: command,
            timestamp: Date.now(),
          });
        }
        break;
    }
  }

  /**
   * Add a command to the queue and emit event
   */
  private enqueueCommand(command: InputCommand): void {
    this.inputQueue.push(command);
    this.emit('command', command);
    
    if (this.debugMode) {
      console.debug(`[ContinuousInputManager] Enqueued command: ${command.type}`, 
        command.data ? `(${command.data.substring(0, 50)}...)` : '');
    }
  }

  /**
   * Get the next command from the queue
   */
  getNextCommand(): InputCommand | undefined {
    return this.inputQueue.shift();
  }

  /**
   * Check if there are pending commands
   */
  hasPendingCommands(): boolean {
    return this.inputQueue.length > 0;
  }

  /**
   * Get all pending commands without removing them
   */
  peekCommands(): InputCommand[] {
    return [...this.inputQueue];
  }

  /**
   * Clear all pending commands
   */
  clearQueue(): void {
    this.inputQueue.length = 0;
  }

  /**
   * Check if execution is currently paused
   */
  isExecutionPaused(): boolean {
    return this.isPaused;
  }

  /**
   * Manually pause execution
   */
  pauseExecution(): void {
    this.isPaused = true;
  }

  /**
   * Manually resume execution
   */
  resumeExecution(): void {
    this.isPaused = false;
  }
}