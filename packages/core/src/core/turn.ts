/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Part,
  PartListUnion,
  GenerateContentResponse,
  FunctionDeclaration,
  FinishReason,
  Content,
} from '@google/genai';
import type {
  ToolCallConfirmationDetails,
  ToolResult,
  ToolResultDisplay,
} from '../tools/tools.js';
import type { ToolErrorType } from '../tools/tool-error.js';
import { reportError } from '../utils/errorReporting.js';
import {
  getErrorMessage,
  UnauthorizedError,
  toFriendlyError,
} from '../utils/errors.js';
import type { GeminiChat } from './geminiChat.js';
import type { Config } from '../config/config.js';
import { UnifiedAgentsClient } from '../runtime/unifiedAgentsClient.js';
import type { UnifiedAgentMessage, UnifiedAgentToolCall } from '../runtime/types.js';

// Define a structure for tools passed to the server
export interface ServerTool {
  name: string;
  schema: FunctionDeclaration;
  // The execute method signature might differ slightly or be wrapped
  execute(
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ToolResult>;
  shouldConfirmExecute(
    params: Record<string, unknown>,
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false>;
}

export enum GeminiEventType {
  Content = 'content',
  ToolCallRequest = 'tool_call_request',
  ToolCallResponse = 'tool_call_response',
  ToolCallConfirmation = 'tool_call_confirmation',
  UserCancelled = 'user_cancelled',
  Error = 'error',
  ChatCompressed = 'chat_compressed',
  Thought = 'thought',
  MaxSessionTurns = 'max_session_turns',
  Finished = 'finished',
  LoopDetected = 'loop_detected',
  Citation = 'citation',
}

export interface StructuredError {
  message: string;
  status?: number;
}

export interface GeminiErrorEventValue {
  error: StructuredError;
}

export interface ToolCallRequestInfo {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  isClientInitiated: boolean;
  prompt_id: string;
  agentId?: string;
  agentName?: string;
  agentEmoji?: string;
}

export interface ToolCallResponseInfo {
  callId: string;
  responseParts: Part[];
  resultDisplay: ToolResultDisplay | undefined;
  error: Error | undefined;
  errorType: ToolErrorType | undefined;
}

export interface ServerToolCallConfirmationDetails {
  request: ToolCallRequestInfo;
  details: ToolCallConfirmationDetails;
}

export type ThoughtSummary = {
  subject: string;
  description: string;
};

export type ServerGeminiContentEvent = {
  type: GeminiEventType.Content;
  value: string;
};

export type ServerGeminiThoughtEvent = {
  type: GeminiEventType.Thought;
  value: ThoughtSummary;
};

export type ServerGeminiToolCallRequestEvent = {
  type: GeminiEventType.ToolCallRequest;
  value: ToolCallRequestInfo;
};

export type ServerGeminiToolCallResponseEvent = {
  type: GeminiEventType.ToolCallResponse;
  value: ToolCallResponseInfo;
};

export type ServerGeminiToolCallConfirmationEvent = {
  type: GeminiEventType.ToolCallConfirmation;
  value: ServerToolCallConfirmationDetails;
};

export type ServerGeminiUserCancelledEvent = {
  type: GeminiEventType.UserCancelled;
};

export type ServerGeminiErrorEvent = {
  type: GeminiEventType.Error;
  value: GeminiErrorEventValue;
};

export enum CompressionStatus {
  /** The compression was successful */
  COMPRESSED = 1,

  /** The compression failed due to the compression inflating the token count */
  COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,

  /** The compression failed due to an error counting tokens */
  COMPRESSION_FAILED_TOKEN_COUNT_ERROR,

  /** The compression was not necessary and no action was taken */
  NOOP,
}

export interface ChatCompressionInfo {
  originalTokenCount: number;
  newTokenCount: number;
  compressionStatus: CompressionStatus;
}

export type ServerGeminiChatCompressedEvent = {
  type: GeminiEventType.ChatCompressed;
  value: ChatCompressionInfo | null;
};

export type ServerGeminiMaxSessionTurnsEvent = {
  type: GeminiEventType.MaxSessionTurns;
};

export type ServerGeminiFinishedEvent = {
  type: GeminiEventType.Finished;
  value: FinishReason;
};

export type ServerGeminiLoopDetectedEvent = {
  type: GeminiEventType.LoopDetected;
};

export type ServerGeminiCitationEvent = {
  type: GeminiEventType.Citation;
  value: string;
};

// The original union type, now composed of the individual types
export type ServerGeminiStreamEvent =
  | ServerGeminiChatCompressedEvent
  | ServerGeminiCitationEvent
  | ServerGeminiContentEvent
  | ServerGeminiErrorEvent
  | ServerGeminiFinishedEvent
  | ServerGeminiLoopDetectedEvent
  | ServerGeminiMaxSessionTurnsEvent
  | ServerGeminiThoughtEvent
  | ServerGeminiToolCallConfirmationEvent
  | ServerGeminiToolCallRequestEvent
  | ServerGeminiToolCallResponseEvent
  | ServerGeminiUserCancelledEvent;

// A turn manages the agentic loop turn within the server context.
export class Turn {
  readonly pendingToolCalls: ToolCallRequestInfo[] = [];
  private debugResponses: GenerateContentResponse[] = [];
  finishReason: FinishReason | undefined = undefined;
  private unifiedAgentsClient?: UnifiedAgentsClient;

  constructor(
    private readonly chat: GeminiChat,
    private readonly prompt_id: string,
    private readonly config?: Config,
  ) {}
  // The run method yields simpler events suitable for server logic
  async *run(
    req: PartListUnion,
    signal: AbortSignal,
  ): AsyncGenerator<ServerGeminiStreamEvent> {
    try {
      const providerId = this.config?.getProvider?.() || 'gemini';
      yield* this.runWithUnifiedAgents(req, signal, providerId);
    } catch (e) {
      if (signal.aborted) {
        yield { type: GeminiEventType.UserCancelled };
        // Regular cancellation error, fail gracefully.
        return;
      }

      const error = toFriendlyError(e);
      if (error instanceof UnauthorizedError) {
        throw error;
      }

      // Wrap the request in a proper message object if it's a raw string
      const wrappedReq = typeof req === 'string' 
        ? { role: 'user', parts: [{ text: req }] }
        : Array.isArray(req)
        ? { role: 'user', parts: req }
        : req;
      const contextForReport = [...this.chat.getHistory(/*curated*/ true), wrappedReq];
      // Get the current provider name from the chat's config
      const providerName = (this.chat as any).config?.getProvider?.() || 'Gemini';
      const providerDisplayName = providerName.charAt(0).toUpperCase() + providerName.slice(1);
      console.log(`[Turn] Debug - providerName: ${providerName}, providerDisplayName: ${providerDisplayName}`);
      console.log(`[Turn] Debug - chat has config:`, !!(this.chat as any).config);
      console.log(`[Turn] Debug - config has getProvider:`, typeof (this.chat as any).config?.getProvider);
      await reportError(
        error,
        `Error when talking to ${providerDisplayName} API`,
        contextForReport,
        'Turn.run-sendMessageStream',
      );
      const status =
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        typeof (error as { status: unknown }).status === 'number'
          ? (error as { status: number }).status
          : undefined;
      const structuredError: StructuredError = {
        message: getErrorMessage(error),
        status,
      };
      await this.chat.maybeIncludeSchemaDepthContext(structuredError);
      yield { type: GeminiEventType.Error, value: { error: structuredError } };
      return;
    }
  }

  private getUnifiedAgentsClient(): UnifiedAgentsClient {
    if (!this.config) {
      throw new Error('Unified agents runtime requires configuration context');
    }
    if (!this.unifiedAgentsClient) {
      this.unifiedAgentsClient = new UnifiedAgentsClient(this.config);
    }
    return this.unifiedAgentsClient;
  }

  private async *runWithUnifiedAgents(
    req: PartListUnion,
    signal: AbortSignal,
    provider: string,
  ): AsyncGenerator<ServerGeminiStreamEvent> {
    try {
      const client = this.getUnifiedAgentsClient();
      const wrappedReq = this.normalizeRequestParts(req);
      const isFunctionResponse = wrappedReq.some(part => 'functionResponse' in part);

      const historyRole = isFunctionResponse ? ('function' as const) : ('user' as const);
      this.chat.addHistory({
        role: historyRole,
        parts: wrappedReq,
      });

      const messages = this.buildUnifiedAgentMessages();
      const session = await client.createSession({
        providerId: provider,
        model: this.config?.getModel() || 'gpt-5',
        systemPrompt: this.config?.getSystemPrompt() || undefined,
      });

      for await (const event of client.streamResponse(session, messages)) {
        if (signal.aborted) {
          yield { type: GeminiEventType.UserCancelled };
          return;
        }

        switch (event.type) {
          case 'final': {
            const content = event.message.content ?? '';
            if (content.length > 0) {
              yield { type: GeminiEventType.Content, value: content };
              this.chat.addHistory({ role: 'model', parts: [{ text: content }] });
            }
            this.finishReason = 'STOP' as FinishReason;
            yield { type: GeminiEventType.Finished, value: 'STOP' as FinishReason };
            break;
          }
          case 'error': {
            yield {
              type: GeminiEventType.Error,
              value: {
                error: {
                  message: event.error?.message || 'Unified runtime error',
                },
              },
            };
            break;
          }
          case 'text-delta': {
            if (event.delta) {
              yield { type: GeminiEventType.Content, value: event.delta };
            }
            break;
          }
          case 'tool-call': {
            const request = this.createToolCallRequestFromUnifiedEvent(event.toolCall);
            if (request) {
              this.pendingToolCalls.push(request);
              yield {
                type: GeminiEventType.ToolCallRequest,
                value: request,
              };
            }
            break;
          }
          default:
            break;
        }
      }
    } catch (error) {
      yield {
        type: GeminiEventType.Error,
        value: { error: { message: getErrorMessage(error) } },
      };
    }
  }

  private buildUnifiedAgentMessages(): UnifiedAgentMessage[] {
    const history = this.chat.getHistory();
    const messages: UnifiedAgentMessage[] = [];
    for (const entry of history) {
      const unified = this.convertContentToUnifiedMessage(entry);
      if (unified) {
        messages.push(unified);
      }
    }
    return messages;
  }

  private convertContentToUnifiedMessage(content: Content): UnifiedAgentMessage | null {
    const roleMap: Record<string, UnifiedAgentMessage['role']> = {
      user: 'user',
      model: 'assistant',
      system: 'system',
      function: 'tool',
      tool: 'tool',
    };

    const roleKey = typeof content.role === 'string' ? content.role : 'user';
    const role = roleMap[roleKey] ?? 'user';
    const text = this.extractTextFromParts(content.parts);
    if (!text) {
      return null;
    }

    return {
      role,
      content: text,
    };
  }

  private normalizeRequestParts(req: PartListUnion): Part[] {
    if (typeof req === 'string') {
      return [{ text: req }];
    }

    if (Array.isArray(req)) {
      return req.map(part => (typeof part === 'string' ? { text: part } : part));
    }

    if (typeof req === 'object' && req !== null) {
      const maybePart = req as Part;
      if (typeof maybePart === 'object') {
        return [maybePart];
      }
    }

    return [{ text: String(req) }];
  }

  private extractTextFromParts(parts: Part[] | undefined): string {
    if (!parts || parts.length === 0) {
      return '';
    }
    const textParts: string[] = [];
    for (const part of parts) {
      const maybeText = (part as any).text;
      if (typeof maybeText === 'string' && maybeText.trim().length > 0) {
        textParts.push(maybeText.trim());
        continue;
      }

      const functionResponse = (part as any).functionResponse;
      if (functionResponse && typeof functionResponse === 'object') {
        try {
          textParts.push(JSON.stringify(functionResponse));
        } catch {
          // Ignore serialization issues
        }
      }
    }
    return textParts.join('\n').trim();
  }

  private createToolCallRequestFromUnifiedEvent(toolCall: UnifiedAgentToolCall) {
    if (!toolCall) {
      return null;
    }

    const args = this.normalizeToolArguments(toolCall.arguments);
    return {
      callId: toolCall.id,
      name: toolCall.name,
      args,
      isClientInitiated: false,
      prompt_id: this.prompt_id,
    } satisfies ToolCallRequestInfo;
  }

  private normalizeToolArguments(args: unknown): Record<string, unknown> {
    if (args === null || args === undefined) {
      return {};
    }

    if (typeof args === 'string') {
      try {
        const parsed = JSON.parse(args);
        if (parsed && typeof parsed === 'object') {
          return parsed as Record<string, unknown>;
        }
        return { value: parsed } as Record<string, unknown>;
      } catch {
        return { value: args } as Record<string, unknown>;
      }
    }

    if (typeof args === 'object') {
      return args as Record<string, unknown>;
    }

    return { value: args } as Record<string, unknown>;
  }

  getDebugResponses(): GenerateContentResponse[] {
    return this.debugResponses;
  }
}
