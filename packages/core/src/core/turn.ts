/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolFunctionDeclaration } from '../runtime/agentsTypes.js';
import type {
  Part,
  PartListUnion,
  GenerateContentResponse,
  FinishReason,
} from '../runtime/genaiCompat.js';
import {
  ToolConfirmationOutcome,
  type ToolCallConfirmationDetails,
  type ToolResult,
  type ToolResultDisplay,
} from '../tools/tools.js';
import type { ToolErrorType } from '../tools/tool-error.js';
import { reportError } from '../utils/errorReporting.js';
import {
  getErrorMessage,
  UnauthorizedError,
  toFriendlyError,
} from '../utils/errors.js';
import type { Config } from '../config/config.js';
import type { AgentsClient } from './agentsClient.js';
import { UnifiedAgentsClient } from '../runtime/unifiedAgentsClient.js';
import { hasCycleInSchema } from '../tools/tools.js';
import type { UnifiedAgentMessage, UnifiedAgentToolApproval, UnifiedAgentToolCall } from '../runtime/types.js';
import { convertContentHistoryToUnifiedMessages } from '../runtime/historyConversion.js';
import type { ToolResponseParts } from '../types/toolResponses.js';

// Define a structure for tools passed to the server
export interface ServerTool {
  name: string;
  schema: ToolFunctionDeclaration;
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

export enum ConversationEventType {
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

export { ConversationEventType as GeminiEventType };

export interface StructuredError {
  message: string;
  status?: number;
}

export interface GeminiErrorEventValue {
  error: StructuredError;
}

const SCHEMA_DEPTH_MARKERS = ['schema_depth', 'schema depth', 'Schema depth'];

function isSchemaDepthMessage(message: string): boolean {
  return SCHEMA_DEPTH_MARKERS.some((marker) =>
    message.toLowerCase().includes(marker.toLowerCase()),
  );
}

function isInvalidArgumentMessage(message: string): boolean {
  return message.toLowerCase().includes('invalid argument');
}

export function maybeAnnotateSchemaDepthContext(
  config: Config,
  error: StructuredError,
): void {
  const message = error?.message ?? '';
  if (!message) {
    return;
  }

  if (!isSchemaDepthMessage(message) && !isInvalidArgumentMessage(message)) {
    return;
  }

  const registry = config.getToolRegistry?.();
  const tools =
    registry && typeof registry.getAllTools === 'function'
      ? registry.getAllTools()
      : [];

  if (!Array.isArray(tools) || tools.length === 0) {
    return;
  }

  const cyclicSchemaTools: string[] = [];
  for (const tool of tools) {
    if (!tool || typeof tool !== 'object' || !tool.schema) {
      continue;
    }
    const schema = tool.schema as {
      parametersJsonSchema?: unknown;
      parameters?: unknown;
      name?: string;
    };
    const hasCyclicParameters =
      (schema.parametersJsonSchema && hasCycleInSchema(schema.parametersJsonSchema)) ||
      (schema.parameters && hasCycleInSchema(schema.parameters));
    if (hasCyclicParameters) {
      if (typeof tool.displayName === 'string' && tool.displayName.length > 0) {
        cyclicSchemaTools.push(tool.displayName);
      } else if (typeof schema.name === 'string' && schema.name.length > 0) {
        cyclicSchemaTools.push(schema.name);
      }
    }
  }

  if (cyclicSchemaTools.length === 0) {
    return;
  }

  const extraDetails =
    `

This error was probably caused by cyclic schema references in one of the following tools, try disabling them with excludeTools:

 - ` +
    cyclicSchemaTools.join(`
 - `) +
    `
`;
  error.message += extraDetails;
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
  responseParts: ToolResponseParts;
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
  type: ConversationEventType.Content;
  value: string;
};

export type ServerGeminiThoughtEvent = {
  type: ConversationEventType.Thought;
  value: ThoughtSummary;
};

export type ServerGeminiToolCallRequestEvent = {
  type: ConversationEventType.ToolCallRequest;
  value: ToolCallRequestInfo;
};

export type ServerGeminiToolCallResponseEvent = {
  type: ConversationEventType.ToolCallResponse;
  value: ToolCallResponseInfo;
};

export type ServerGeminiToolCallConfirmationEvent = {
  type: ConversationEventType.ToolCallConfirmation;
  value: ServerToolCallConfirmationDetails;
};

export type ServerGeminiUserCancelledEvent = {
  type: ConversationEventType.UserCancelled;
};

export type ServerGeminiErrorEvent = {
  type: ConversationEventType.Error;
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
  type: ConversationEventType.ChatCompressed;
  value: ChatCompressionInfo | null;
};

export type ServerGeminiMaxSessionTurnsEvent = {
  type: ConversationEventType.MaxSessionTurns;
};

export type ServerGeminiFinishedEvent = {
  type: ConversationEventType.Finished;
  value: FinishReason;
};

export type ServerGeminiLoopDetectedEvent = {
  type: ConversationEventType.LoopDetected;
};

export type ServerGeminiCitationEvent = {
  type: ConversationEventType.Citation;
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
  private readonly agentsClient: AgentsClient;
  private readonly promptId: string;
  private readonly config: Config;

  constructor(agentsClient: AgentsClient, promptId: string, config?: Config) {
    if (!config) {
      throw new Error('Turn requires configuration context');
    }
    if (!agentsClient) {
      throw new Error('Turn requires an initialized AgentsClient');
    }
    this.agentsClient = agentsClient;
    this.promptId = promptId;
    this.config = config;
  }
  // The run method yields simpler events suitable for server logic
  async *run(
    req: PartListUnion,
    signal: AbortSignal,
  ): AsyncGenerator<ServerGeminiStreamEvent> {
    try {
      const providerId = this.config.getProvider() || 'gemini';
      yield* this.runWithUnifiedAgents(req, signal, providerId);
    } catch (e) {
      if (signal.aborted) {
        yield { type: ConversationEventType.UserCancelled };
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
      const contextForReport = [...this.agentsClient.getCuratedHistory(), wrappedReq];
      // Get the current provider name from the chat's config
      const providerName = this.config.getProvider() || 'gemini';
      const providerDisplayName = providerName.charAt(0).toUpperCase() + providerName.slice(1);
      console.log(`[Turn] Debug - providerName: ${providerName}, providerDisplayName: ${providerDisplayName}`);
      console.log(`[Turn] Debug - chat has config:`, !!this.config);
      console.log(`[Turn] Debug - config has getProvider:`, typeof this.config.getProvider);
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
      maybeAnnotateSchemaDepthContext(this.config, structuredError);
      yield { type: ConversationEventType.Error, value: { error: structuredError } };
      return;
    }
  }

  private getUnifiedAgentsClient(): UnifiedAgentsClient {
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
      const agentsClient = this.agentsClient;
      const wrappedReq = this.normalizeRequestParts(req);
      const isFunctionResponse = wrappedReq.some(part => 'functionResponse' in part);

      const historyRole = isFunctionResponse ? ('function' as const) : ('user' as const);
      await agentsClient.addHistory({
        role: historyRole,
        parts: wrappedReq,
      });

      const messages = this.buildUnifiedAgentMessages();
      const session = await client.createSession({
        providerId: provider,
        model: this.config.getModel() || 'gpt-5',
        systemPrompt: this.config.getSystemPrompt() || undefined,
      });

      this.config.setToolApprovalHandlers({
        approve: (callId, options) => client.approveToolCall(callId, options),
        reject: (callId, options) => client.rejectToolCall(callId, options),
      });

      try {
        for await (const event of client.streamResponse(session, messages)) {
          if (signal.aborted) {
            yield { type: ConversationEventType.UserCancelled };
            return;
          }

          switch (event.type) {
          case 'tool-approval': {
            const confirmation = this.createToolApprovalConfirmation(event.approval);
            if (confirmation) {
              yield {
                type: ConversationEventType.ToolCallConfirmation,
                value: confirmation,
              };
            }
            break;
          }
          case 'final': {
            const content = event.message.content ?? '';
            if (content.length > 0) {
              yield { type: ConversationEventType.Content, value: content };
              await agentsClient.addHistory({
                role: 'model',
                parts: [{ text: content }],
              });
            }
            this.finishReason = 'STOP' as FinishReason;
            yield { type: ConversationEventType.Finished, value: 'STOP' as FinishReason };
            break;
          }
          case 'error': {
            yield {
              type: ConversationEventType.Error,
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
              yield { type: ConversationEventType.Content, value: event.delta };
            }
            break;
          }
          case 'tool-call': {
            const request = this.createToolCallRequestFromUnifiedEvent(event.toolCall);
            if (request) {
              this.pendingToolCalls.push(request);
              yield {
                type: ConversationEventType.ToolCallRequest,
                value: request,
              };
            }
            break;
          }
          default:
            break;
        }
      }
    } finally {
        this.config.setToolApprovalHandlers(undefined);
      }
    } catch (error) {
      yield {
        type: ConversationEventType.Error,
        value: { error: { message: getErrorMessage(error) } },
      };
    }
  }

  private buildUnifiedAgentMessages(): UnifiedAgentMessage[] {
    return convertContentHistoryToUnifiedMessages(this.agentsClient.getHistory());
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

  private createToolApprovalConfirmation(
    approval: UnifiedAgentToolApproval,
  ): ServerToolCallConfirmationDetails | null {
    const promptLines = [
      `Tool ${approval.name} requested by the model.`,
    ];
    if (Object.keys(approval.args ?? {}).length > 0) {
      try {
        const prettyArgs = JSON.stringify(approval.args, null, 2);
        promptLines.push(`Arguments:\n${prettyArgs}`);
      } catch (_error) {
        promptLines.push(`Arguments: ${String(approval.args)}`);
      }
    }

    const promptText = promptLines.join('\n\n');

    const details: ToolCallConfirmationDetails = {
      type: 'info',
      title: `Allow tool "${approval.name}"?`,
      prompt: promptText,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedOnce) {
          this.config.approveToolCall(approval.callId, { alwaysApprove: false });
          return;
        }
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.config.approveToolCall(approval.callId, { alwaysApprove: true });
          return;
        }
        this.config.rejectToolCall(approval.callId);
      },
    };

    const request: ToolCallRequestInfo = {
      callId: approval.callId,
      name: approval.name,
      args: approval.args,
      isClientInitiated: false,
      prompt_id: this.promptId,
    };

    return {
      request,
      details,
    };
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
      prompt_id: this.promptId,
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
