import {
  Agent,
  Runner,
  assistant,
  system,
  user,
  type AgentInputItem,
  type ModelProvider,
  type ModelSettings,
  type RunStreamEvent,
  type StreamedRunResult,
  type RunToolApprovalItem,
} from '@openai/agents';
import { ApprovalMode, type Config } from '../config/config.js';
import {
  createDefaultConnectorRegistry,
  type ProviderConnector,
  type ProviderConnectorRegistry,
} from './providerConnectors.js';
import { adaptToolsToAgents } from './toolAdapter.js';
import type { ToolCallRequestInfo, ToolCallResponseInfo } from '../core/turn.js';
import type {
  UnifiedAgentMessage,
  UnifiedAgentSession,
  UnifiedAgentSessionConfig,
  UnifiedAgentsStreamEvent,
  UnifiedAgentStreamOptions,
} from './types.js';
import { SessionManager, type SessionStorage } from './sessionManager.js';

export interface UnifiedAgentsClientOptions {
  connectorRegistry?: ProviderConnectorRegistry;
  sessionManager?: SessionManager;
  onToolExecuted?: (payload: {
    session: UnifiedAgentSession;
    request: ToolCallRequestInfo;
    response: ToolCallResponseInfo;
  }) => void;
}

export class UnifiedAgentsClient {
  private readonly connectors: ProviderConnectorRegistry;
  private readonly options: UnifiedAgentsClientOptions;
  private readonly sessionManager?: SessionManager;
  private readonly sessionStorages = new Map<string, SessionStorage>();
  private readonly pendingToolApprovals = new Map<
    string,
    {
      sessionId: string;
      item: RunToolApprovalItem;
      stream: StreamedRunResult<unknown, Agent<any, any>>;
    }
  >();
  private readonly lastNonEmptyMessageBySession = new Map<string, string>();

  constructor(private readonly config: Config, options: UnifiedAgentsClientOptions = {}) {
    this.connectors = options.connectorRegistry ?? createDefaultConnectorRegistry();
    this.sessionManager = options.sessionManager;
    this.options = options;
  }

  private isDebugEnabled(extraEnv?: string): boolean {
    if (this.config.getDebugMode?.() === true) {
      return true;
    }
    if (extraEnv && process.env[extraEnv]) {
      return true;
    }
    if (process.env['OUROBOROS_DEBUG']) {
      return true;
    }
    return false;
  }

  private debugLog(tag: string, ...args: unknown[]): void {
    if (this.isDebugEnabled()) {
      console.debug(`[UnifiedAgentsClient][${tag}]`, ...args);
    }
  }

  getConfig(): Config {
    return this.config;
  }

  getConnectors(): ProviderConnectorRegistry {
    return this.connectors;
  }

  private getApprovalMode(): ApprovalMode {
    return this.config.getApprovalMode?.() ?? ApprovalMode.DEFAULT;
  }

  async createSession(sessionConfig: UnifiedAgentSessionConfig): Promise<UnifiedAgentSession> {
    const connector = this.requireConnector(sessionConfig.providerId);

    const apiKeyResolver = () => this.resolveApiKey(sessionConfig.providerId, sessionConfig.metadata);
    const context = { resolveApiKey: apiKeyResolver };

    const [modelHandle, modelProvider] = await Promise.all([
      connector.createModel(sessionConfig.model, context),
      this.resolveModelProvider(connector, context, sessionConfig.model),
    ]);

    // Use persistent session ID if SessionManager is available
    let sessionId: string;
    let sessionStorage: SessionStorage | undefined;

    if (this.sessionManager) {
      // Check if session ID is provided in metadata (for session restoration)
      const providedSessionId = typeof sessionConfig.metadata?.['sessionId'] === 'string'
        ? (sessionConfig.metadata['sessionId'] as string)
        : undefined;

      if (providedSessionId) {
        // Restore existing session
        sessionId = providedSessionId;
        sessionStorage = this.sessionManager.getOrCreateSession(sessionId);
        this.debugLog('session-restored', sessionId);
      } else {
        // Create new persistent session
        sessionId = `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        sessionStorage = this.sessionManager.getOrCreateSession(sessionId);
        this.debugLog('session-created', sessionId);
      }

      // Cache the session storage
      this.sessionStorages.set(sessionId, sessionStorage);
    } else {
      // Fall back to ephemeral session ID if no SessionManager
      sessionId = `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      this.debugLog('session-ephemeral', sessionId);
    }

    return {
      id: sessionId,
      providerId: sessionConfig.providerId,
      model: sessionConfig.model,
      metadata: sessionConfig.metadata,
      modelHandle,
      modelProvider,
      systemPrompt: sessionConfig.systemPrompt,
    };
  }

  async *streamResponse(
    session: UnifiedAgentSession,
    messages: UnifiedAgentMessage[],
    options: UnifiedAgentStreamOptions = {},
  ): AsyncGenerator<UnifiedAgentsStreamEvent> {
    if (!session.modelHandle || !session.modelProvider) {
      throw new Error('UnifiedAgentsClient session is missing model context.');
    }

    // Retrieve existing conversation history from session storage
    const sessionStorage = this.sessionStorages.get(session.id);
    let inputItems: AgentInputItem[];

    if (sessionStorage) {
      // Load persisted conversation items
      const persistedItems = await sessionStorage.getItems();

      // Convert new messages to input items
      const newItems = this.convertMessagesToInput(messages, session.id, session.systemPrompt);

      // Combine persisted + new items
      inputItems = [...persistedItems, ...newItems];

      this.debugLog('session-load', session.id, `${persistedItems.length} persisted + ${newItems.length} new`);
    } else {
      // No session storage - use ephemeral conversion
      inputItems = this.convertMessagesToInput(messages, session.id, session.systemPrompt);
    }

    const agent = this.createAgent(session, options);

    this.clearPendingApprovalsForSession(session.id);

    const runner = new Runner({
      modelProvider: session.modelProvider,
      model: session.modelHandle,
      modelSettings: this.buildModelSettings(session.providerId, options) as ModelSettings,
    });

    if (this.isDebugEnabled('OUROBOROS_DEBUG_PROMPT')) {
      this.debugLog(
        'prompt',
        session.providerId,
        session.model,
        (session.systemPrompt ?? '').slice(0, 800),
      );
    }

    const streamResult = (await runner.run(agent, inputItems, {
      stream: true,
    })) as StreamedRunResult<unknown, Agent<any, any>>;
    const streamedChunks: string[] = [];

    for await (const event of streamResult as AsyncIterable<RunStreamEvent>) {
      const handled = this.handleRunStreamEvent(
        event,
        streamedChunks,
        streamResult,
        session,
      );
      if (handled) {
        yield handled;
      }
    }

    await streamResult.completed;

    this.clearPendingApprovalsForSession(session.id);

    const finalText =
      this.extractFinalOutputText(streamResult) || streamedChunks.filter(Boolean).join('\n');

    // Persist conversation items to session storage after turn completes
    if (sessionStorage) {
      try {
        // Get final result items from the completed run
        const resultItems = streamResult.items ?? [];

        // Add new conversation items to session storage
        await sessionStorage.addItems(resultItems);

        this.debugLog('session-persist', session.id, `${resultItems.length} items stored`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Failed to persist session ${session.id}:`, message);
      }
    }

    yield {
      type: 'final',
      message: {
        role: 'assistant',
        content: finalText,
      },
    };
  }

  private requireConnector(providerId: string): ProviderConnector {
    const connector = this.connectors.get(providerId);
    if (!connector) {
      throw new Error(`Unknown provider connector: ${providerId}`);
    }
    return connector;
  }

  private resolveApiKey(providerId: string, metadata?: Record<string, unknown>): string | undefined {
    const metadataApiKey = typeof metadata?.['apiKey'] === 'string' ? (metadata['apiKey'] as string) : undefined;
    if (metadataApiKey) return metadataApiKey;

    if (providerId === this.config.getProvider()) {
      const providerKey = this.config.getProviderApiKey();
      if (providerKey) return providerKey;
    }

    switch (providerId) {
      case 'openai':
        return process.env['OPENAI_API_KEY'];
      case 'anthropic':
        return process.env['ANTHROPIC_API_KEY'];
      case 'gemini':
        return process.env['GEMINI_API_KEY'] || process.env['GOOGLE_API_KEY'];
      default:
        return undefined;
    }
  }

  private async resolveModelProvider(
    connector: ProviderConnector,
    context: { resolveApiKey: () => string | undefined },
    modelId: string,
  ): Promise<ModelProvider> {
    if (connector.getModelProvider) {
      return connector.getModelProvider(context);
    }
    return {
      getModel: async (modelName?: string) => {
        const resolvedModel = modelName ?? modelId;
        if (!resolvedModel) {
          throw new Error('Model name is required to resolve model provider.');
        }
        return connector.createModel(resolvedModel, context);
      },
    };
  }

  private createAgent(
    session: UnifiedAgentSession,
    options: UnifiedAgentStreamOptions,
  ): Agent {
    const registry = this.config.getToolRegistry();
    const agentId = typeof session.metadata?.['agentId'] === 'string'
      ? (session.metadata['agentId'] as string)
      : undefined;
    const agentName = typeof session.metadata?.['agentName'] === 'string'
      ? (session.metadata['agentName'] as string)
      : undefined;
    const agentEmoji = typeof session.metadata?.['agentEmoji'] === 'string'
      ? (session.metadata['agentEmoji'] as string)
      : undefined;
    const adaptedTools = adaptToolsToAgents({
      registry,
      config: this.config,
      getPromptId: () => session.id,
      agentId,
      agentName,
      agentEmoji,
      onToolExecuted:
        this.options.onToolExecuted
          ? ({ request, response }) =>
              this.options.onToolExecuted?.({ session, request, response })
          : undefined,
    });

    let tools = adaptedTools;

    if (Array.isArray(options.toolsOverride) && options.toolsOverride.length > 0) {
      tools = options.toolsOverride;
    } else if (
      Array.isArray(options.toolsAugmentation) &&
      options.toolsAugmentation.length > 0
    ) {
      tools = [...adaptedTools, ...options.toolsAugmentation];
    }

    return new Agent({
      name: 'ouroboros-unified-agent',
      instructions: session.systemPrompt ?? 'You are the Ouroboros unified assistant.',
      model: session.modelHandle!,
      modelSettings: this.buildModelSettings(session.providerId, options),
      tools,
    });
  }

  private convertMessagesToInput(
    messages: UnifiedAgentMessage[],
    sessionId?: string,
    initialPrompt?: string,
  ): AgentInputItem[] {
    const converted: AgentInputItem[] = [];
    const seenToolResults = new Set<string>();
    const firstNonEmpty = messages
      .map((msg) => (msg.content ?? '').trim())
      .find((content) => content.length > 0);

    if (sessionId) {
      if (firstNonEmpty && firstNonEmpty.length > 0) {
        this.lastNonEmptyMessageBySession.set(sessionId, firstNonEmpty);
      } else if (initialPrompt && initialPrompt.trim().length > 0 && !this.lastNonEmptyMessageBySession.has(sessionId)) {
        this.lastNonEmptyMessageBySession.set(sessionId, initialPrompt.trim());
      }
    }

    for (const message of messages) {
      const mapped = this.mapMessageToAgentInput(message, {
        seenToolResults,
        sessionId,
      });
      if (mapped) {
        converted.push(mapped);
      } else if (sessionId) {
        const rawText = (message.content ?? '').trim();
        if (rawText.length > 0 && message.role !== 'tool') {
          this.lastNonEmptyMessageBySession.set(sessionId, rawText);
        }
      }
    }

    if (converted.length === 0) {
      let fallbackText = sessionId ? this.lastNonEmptyMessageBySession.get(sessionId) : undefined;
      if (!fallbackText || fallbackText.trim().length === 0) {
        fallbackText = firstNonEmpty && firstNonEmpty.length > 0
          ? firstNonEmpty
          : initialPrompt?.trim();
      }
      if (!fallbackText || fallbackText.trim().length === 0) {
        fallbackText = 'Please continue the task based on prior context.';
      }
      converted.push(user(fallbackText));
      if (sessionId) {
        this.lastNonEmptyMessageBySession.set(sessionId, fallbackText);
      }
      if (this.isDebugEnabled('OUROBOROS_DEBUG_PROMPT') || process.env['OUROBOROS_DEBUG']) {
        this.debugLog('fallback-input', fallbackText);
      }
    }

    return converted;
  }

  private mapMessageToAgentInput(
    message: UnifiedAgentMessage,
    options: { seenToolResults?: Set<string>; sessionId?: string } = {},
  ): AgentInputItem | null {
    const text = (message.content ?? '').trim();

    switch (message.role) {
      case 'system': {
        if (options.sessionId && text.length > 0) {
          this.lastNonEmptyMessageBySession.set(options.sessionId, text);
        }
        return text.length > 0 ? system(text) : null;
      }
      case 'assistant': {
        if (options.sessionId && text.length > 0) {
          this.lastNonEmptyMessageBySession.set(options.sessionId, text);
        }
        return text.length > 0 ? assistant(text) : null;
      }
      case 'tool': {
        const functionResponse = message.metadata?.['functionResponse'] as Record<string, unknown> | undefined;
        if (!functionResponse) {
          return null;
        }

        const statusRaw = typeof functionResponse['status'] === 'string'
          ? (functionResponse['status'] as string)
          : undefined;
        const status = statusRaw ? statusRaw.toLowerCase() : 'completed';
        const terminalStatuses = new Set([
          'completed',
          'complete',
          'success',
          'succeeded',
          'ok',
          'done',
        ]);
        if (!terminalStatuses.has(status)) {
          return null;
        }

        const callId = typeof functionResponse['callId'] === 'string'
          ? (functionResponse['callId'] as string)
          : typeof functionResponse['id'] === 'string'
            ? (functionResponse['id'] as string)
            : message.toolCallId ?? 'tool-call';
        if (callId && options.seenToolResults?.has(callId)) {
          return null;
        }
        if (callId) {
          options.seenToolResults?.add(callId);
        }

        const name = typeof functionResponse['name'] === 'string'
          ? (functionResponse['name'] as string)
          : 'tool';
        const rawOutput = functionResponse['response'];
        let outputText: string;
        if (typeof rawOutput === 'string') {
          outputText = rawOutput;
        } else if (rawOutput && typeof rawOutput === 'object') {
          try {
            outputText = JSON.stringify(rawOutput);
          } catch {
            outputText = String(rawOutput);
          }
        } else if (text.length > 0) {
          outputText = text;
        } else {
          outputText = '';
        }

        if (options.sessionId && outputText.trim().length > 0) {
          this.lastNonEmptyMessageBySession.set(options.sessionId, outputText);
        }
        return {
          type: 'function_call_result',
          status,
          name,
          callId,
          output: {
            type: 'text',
            text: outputText,
          },
        } as AgentInputItem;
      }
      case 'user':
      default: {
        if (options.sessionId && text.length > 0) {
          this.lastNonEmptyMessageBySession.set(options.sessionId, text);
        }
        return text.length > 0 ? user(text) : null;
      }
    }
  }

  private buildModelSettings(
    providerId: string,
    options: UnifiedAgentStreamOptions,
  ): Partial<ModelSettings> {
    const settings: Partial<ModelSettings> = {};
    if (providerId !== 'openai') {
      if (typeof options.temperature === 'number') {
        settings.temperature = options.temperature;
      }
      if (typeof options.maxOutputTokens === 'number') {
        settings.maxTokens = options.maxOutputTokens;
      }
    }
    return settings;
  }

  private handleRunStreamEvent(
    event: RunStreamEvent,
    streamedChunks: string[],
    streamResult: StreamedRunResult<unknown, Agent<any, any>>,
    session: UnifiedAgentSession,
  ): UnifiedAgentsStreamEvent | null {
    if ((event as { type?: string }).type === 'run_item_stream_event') {
      return this.handleRunItemStreamEvent(
        event as any,
        streamedChunks,
        streamResult,
        session,
      );
    }
    return null;
  }

  private handleRunItemStreamEvent(
    event: any,
    streamedChunks: string[],
    streamResult: StreamedRunResult<unknown, Agent<any, any>>,
    session: UnifiedAgentSession,
  ): UnifiedAgentsStreamEvent | null {
    const name: string | undefined = event?.name;
    const item = event?.item;

    if (!name || !item) {
      return null;
    }

    if (name === 'message_output_created') {
      const text = this.extractTextFromRunItem(item);
      if (text) {
        streamedChunks.push(text);
        return { type: 'text-delta', delta: text };
      }
      return null;
    }

    if (name === 'tool_approval_requested') {
      const approvalEvent = this.handleToolApprovalRequested(
        item as RunToolApprovalItem,
        streamResult,
        session.id,
      );
      if (approvalEvent) {
        return approvalEvent;
      }
      return null;
    }

    if (name === 'tool_called') {
      const request = this.createToolCallRequestFromRunItem(item);
      if (request) {
        return {
          type: 'tool-call',
          toolCall: {
            id: request.callId,
            name: request.name,
            arguments: request.args,
          },
        };
      }
    }

    return null;
  }

  private handleToolApprovalRequested(
    approvalItem: RunToolApprovalItem,
    streamResult: StreamedRunResult<unknown, Agent<any, any>>,
    sessionId: string,
  ): UnifiedAgentsStreamEvent | null {
    const callId = this.extractApprovalCallId(approvalItem);
    if (!callId) {
      return null;
    }

    if (this.getApprovalMode() === ApprovalMode.YOLO) {
      try {
        streamResult.state.approve(approvalItem, { alwaysApprove: true });
      } catch (error) {
        console.warn('Failed to auto-approve tool request in YOLO mode', error);
      }
      return null;
    }

    this.pendingToolApprovals.set(callId, {
      sessionId,
      item: approvalItem,
      stream: streamResult,
    });
    const rawItem = approvalItem.rawItem as Record<string, unknown> | undefined;
    const name = typeof rawItem?.['name'] === 'string' ? (rawItem['name'] as string) : 'unknown_tool';
    const args = this.parseToolArguments(rawItem?.['arguments']);

    return {
      type: 'tool-approval',
      approval: {
        callId,
        name,
        args,
      },
    };
  }

  approveToolCall(callId: string, options?: { alwaysApprove?: boolean }): void {
    const pending = this.pendingToolApprovals.get(callId);
    if (!pending) {
      return;
    }

    try {
      pending.stream.state.approve(pending.item, {
        alwaysApprove: options?.alwaysApprove ?? false,
      });
      if (this.isDebugEnabled('OUROBOROS_DEBUG_TOOL_CALLS')) {
        this.debugLog('tool-approve', callId, options ?? {});
      }
    } catch (error) {
      console.warn('Failed to approve tool call', error);
    } finally {
      this.pendingToolApprovals.delete(callId);
    }
  }

  rejectToolCall(callId: string, options?: { alwaysReject?: boolean }): void {
    const pending = this.pendingToolApprovals.get(callId);
    if (!pending) {
      return;
    }

    try {
      pending.stream.state.reject(pending.item, {
        alwaysReject: options?.alwaysReject ?? false,
      });
      if (this.isDebugEnabled('OUROBOROS_DEBUG_TOOL_CALLS')) {
        this.debugLog('tool-reject', callId, options ?? {});
      }
    } catch (error) {
      console.warn('Failed to reject tool call', error);
    } finally {
      this.pendingToolApprovals.delete(callId);
    }
  }

  private clearPendingApprovalsForSession(sessionId: string): void {
    for (const [callId, pending] of this.pendingToolApprovals) {
      if (pending.sessionId === sessionId) {
        this.pendingToolApprovals.delete(callId);
      }
    }
  }

  private extractApprovalCallId(approvalItem: RunToolApprovalItem): string | undefined {
    const rawItem = approvalItem?.rawItem as Record<string, unknown> | undefined;
    if (!rawItem) {
      return undefined;
    }

    const callId = rawItem['callId'] ?? rawItem['id'];
    return typeof callId === 'string' ? callId : undefined;
  }

  private createToolCallRequestFromRunItem(item: any) {
    const rawItem = this.getRawItem(item);
    if (!rawItem || typeof rawItem !== 'object') {
      return null;
    }

    const raw = rawItem as Record<string, unknown>;
    const type = raw['type'];
    if (type !== 'function_call') {
      return null;
    }

    const name = typeof raw['name'] === 'string' ? (raw['name'] as string) : 'unknown_tool';
    const callId =
      (typeof raw['callId'] === 'string' && (raw['callId'] as string)) ||
      (typeof raw['id'] === 'string' && (raw['id'] as string)) ||
      `call-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const args = this.parseToolArguments(raw['arguments']);

    if (this.isDebugEnabled('OUROBOROS_DEBUG_TOOL_CALLS')) {
      this.debugLog('tool-request', name, args);
    }

    return {
      callId,
      name,
      args,
      isClientInitiated: false,
      prompt_id: this.config.getSessionId(),
    };
  }

  private parseToolArguments(value: unknown): Record<string, unknown> {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object') {
          return parsed as Record<string, unknown>;
        }
        return { value: parsed } as Record<string, unknown>;
      } catch {
        return { value } as Record<string, unknown>;
      }
    }

    if (value && typeof value === 'object') {
      return value as Record<string, unknown>;
    }

    return { value } as Record<string, unknown>;
  }

  private extractTextFromRunItem(item: any): string {
    const rawItem = this.getRawItem(item);
    if (!rawItem) {
      return '';
    }

    const content = (rawItem as Record<string, unknown>)['content'];
    if (Array.isArray(content)) {
      return content
        .map(part => this.extractTextFromPart(part))
        .filter(Boolean)
        .join('\n');
    }

    const output = (rawItem as Record<string, unknown>)['output'];
    if (output && typeof output === 'object') {
      const text = (output as Record<string, unknown>)['text'];
      if (typeof text === 'string') {
        return text;
      }
    }

    return '';
  }

  private extractTextFromPart(part: unknown): string {
    if (!part || typeof part !== 'object') {
      return '';
    }

    const text = (part as Record<string, unknown>)['text'];
    if (typeof text === 'string') {
      return text;
    }

    const outputText = (part as Record<string, unknown>)['output'];
    if (outputText && typeof outputText === 'object') {
      const nested = (outputText as Record<string, unknown>)['text'];
      if (typeof nested === 'string') {
        return nested;
      }
    }

    return '';
  }

  private getRawItem(item: any): unknown {
    if (!item) return undefined;
    if (typeof item.toJSON === 'function') {
      const json = item.toJSON();
      if (json && typeof json === 'object') {
        return (json as Record<string, unknown>)['rawItem'];
      }
    }
    if ('rawItem' in item) {
      return (item as Record<string, unknown>)['rawItem'];
    }
    return undefined;
  }

  private extractFinalOutputText(result: any): string | undefined {
    const finalOutput = result?.finalOutput;
    if (typeof finalOutput === 'string') {
      return finalOutput;
    }
    if (finalOutput && typeof finalOutput.text === 'string') {
      return finalOutput.text;
    }

    const outputParts = Array.isArray(result?.output) ? result.output : [];
    for (let i = outputParts.length - 1; i >= 0; i -= 1) {
      const part = outputParts[i];
      if (part && typeof part.text === 'string' && part.text.trim().length > 0) {
        return part.text;
      }
    }
    return undefined;
  }
}
