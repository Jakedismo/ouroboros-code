// @ts-nocheck
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
  type Tool as AgentsTool,
  type AgentOptions,
} from '@openai/agents';
import { ApprovalMode, type Config } from '../config/config.js';
import {
  createDefaultConnectorRegistry,
  type ProviderConnector,
  type ProviderConnectorRegistry,
} from './providerConnectors.js';
import { adaptToolsToAgents } from './toolAdapter.js';
import type {
  ToolCallRequestInfo,
  ToolCallResponseInfo,
} from '../core/turn.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type {
  UnifiedAgentMessage,
  UnifiedAgentSession,
  UnifiedAgentSessionConfig,
  UnifiedAgentsStreamEvent,
  UnifiedAgentStreamOptions,
} from './types.js';
import { SessionManager, type SessionStorage } from './sessionManager.js';
import {
  createHostedWebSearchTool,
  HOSTED_WEB_SEARCH_NAME,
} from '../tools/web-search-sdk.js';

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
  private readonly agentCache = new Map<
    string,
    { signature: string; agent: Agent<any, any> }
  >();
  private readonly runnerCache = new Map<
    string,
    { signature: string; runner: Runner }
  >();
  private readonly pendingToolApprovals = new Map<
    string,
    {
      sessionId: string;
      item: RunToolApprovalItem;
      stream: StreamedRunResult<unknown, Agent<any, any>>;
    }
  >();
  private readonly lastNonEmptyMessageBySession = new Map<string, string>();

  constructor(
    private readonly config: Config,
    options: UnifiedAgentsClientOptions = {},
  ) {
    this.connectors =
      options.connectorRegistry ?? createDefaultConnectorRegistry();
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

  async createSession(
    sessionConfig: UnifiedAgentSessionConfig,
  ): Promise<UnifiedAgentSession> {
    const connector = this.requireConnector(sessionConfig.providerId);

    const apiKeyResolver = () =>
      this.resolveApiKey(sessionConfig.providerId, sessionConfig.metadata);
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
      const providedSessionId =
        typeof sessionConfig.metadata?.['sessionId'] === 'string'
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

    // Session-first architecture: Use SessionStorage as primary source of truth
    const sessionStorage = this.sessionStorages.get(session.id);
    let inputItems: AgentInputItem[];

    if (sessionStorage) {
      // Load existing conversation history from persistent storage
      const persistedItems = await sessionStorage.getItems();

      // Convert only NEW incoming messages (not already in session)
      const newItems = this.convertMessagesToInput(
        messages,
        session.id,
        session.systemPrompt,
      );

      // Combine: existing history + new user input for this turn
      inputItems = [...persistedItems, ...newItems];

      this.debugLog(
        'session-flow',
        session.id,
        `Session: ${persistedItems.length} persisted + ${newItems.length} new = ${inputItems.length} total`,
      );
    } else {
      // No session storage - legacy ephemeral mode
      inputItems = this.convertMessagesToInput(
        messages,
        session.id,
        session.systemPrompt,
      );
      this.debugLog(
        'session-ephemeral',
        session.id,
        `Ephemeral mode: ${inputItems.length} items`,
      );
    }

    const modelSettings = this.buildModelSettings(session, options);
    const agent = this.createAgent(session, options, modelSettings);

    this.clearPendingApprovalsForSession(session.id);

    const runner = this.getRunnerForSession(session, modelSettings);

    if (this.isDebugEnabled('OUROBOROS_DEBUG_PROMPT')) {
      const prompt = session.systemPrompt ?? '';
      console.log(
        `[SYSTEM_PROMPT] Provider: ${session.providerId}, Model: ${session.model}, Length: ${prompt.length}`,
      );
      console.log(`[SYSTEM_PROMPT] Full content:\n${prompt}`);
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
      this.extractFinalOutputText(streamResult) ||
      streamedChunks.filter(Boolean).join('\n');

    // Persist conversation state to session storage after turn completes
    if (sessionStorage) {
      try {
        // streamResult.items contains the COMPLETE conversation state after this turn
        // This includes both the input we provided AND the model's response
        // We need to REPLACE the session contents, not append
        const completeState = streamResult.items ?? [];

        // Clear existing session and store the complete conversation state
        await sessionStorage.clearSession();
        await sessionStorage.addItems(completeState);

        this.debugLog(
          'session-persist',
          session.id,
          `Session updated: ${completeState.length} total items`,
        );
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

  private resolveApiKey(
    providerId: string,
    metadata?: Record<string, unknown>,
  ): string | undefined {
    const metadataApiKey =
      typeof metadata?.['apiKey'] === 'string'
        ? (metadata['apiKey'] as string)
        : undefined;
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
    modelSettings: Partial<ModelSettings>,
  ): Agent {
    const registry = this.config.getToolRegistry();
    const agentId =
      typeof session.metadata?.['agentId'] === 'string'
        ? (session.metadata['agentId'] as string)
        : undefined;
    const agentName =
      typeof session.metadata?.['agentName'] === 'string'
        ? (session.metadata['agentName'] as string)
        : undefined;
    const agentEmoji =
      typeof session.metadata?.['agentEmoji'] === 'string'
        ? (session.metadata['agentEmoji'] as string)
        : undefined;
    const adaptedTools = adaptToolsToAgents({
      registry,
      config: this.config,
      getPromptId: () => session.id,
      agentId,
      agentName,
      agentEmoji,
      onToolExecuted: this.options.onToolExecuted
        ? ({ request, response }) =>
            this.options.onToolExecuted?.({ session, request, response })
        : undefined,
    });

    const hostedTools = this.getHostedToolsForSession(session, registry);

    let tools: AgentsTool[] = adaptedTools;

    if (
      Array.isArray(options.toolsOverride) &&
      options.toolsOverride.length > 0
    ) {
      tools = options.toolsOverride;
    } else if (
      Array.isArray(options.toolsAugmentation) &&
      options.toolsAugmentation.length > 0
    ) {
      tools = [...adaptedTools, ...hostedTools, ...options.toolsAugmentation];
    } else if (hostedTools.length > 0) {
      tools = [...adaptedTools, ...hostedTools];
    }

    return this.getOrCreateAgent(session, options, tools, modelSettings);
  }

  private getOrCreateAgent(
    session: UnifiedAgentSession,
    options: UnifiedAgentStreamOptions,
    tools: AgentsTool[],
    modelSettings: Partial<ModelSettings>,
  ): Agent {
    const canCache = this.canCacheAgent(options);
    const signature = this.buildAgentSignature(
      session,
      tools,
      modelSettings,
      options.structuredOutput?.schemaSignature,
    );

    if (canCache) {
      const cached = this.agentCache.get(session.id);
      if (cached && cached.signature === signature) {
        return cached.agent;
      }
    }

    const agentOptions: AgentOptions<any, any> = {
      name: 'ouroboros-unified-agent',
      instructions:
        session.systemPrompt ?? 'You are the Ouroboros unified assistant.',
      model: session.modelHandle!,
      modelSettings,
      tools,
    };

    if (options.structuredOutput?.schema) {
      agentOptions.outputType = options.structuredOutput.schema;
    }

    const agent = new Agent(agentOptions);

    if (canCache) {
      this.agentCache.set(session.id, { signature, agent });
    }

    return agent;
  }

  private getHostedToolsForSession(
    session: UnifiedAgentSession,
    registry: ToolRegistry,
  ): AgentsTool[] {
    const hostedTools: AgentsTool[] = [];

    if (
      session.providerId === 'openai' &&
      this.config.isToolEnabled(
        [HOSTED_WEB_SEARCH_NAME, 'web_search'],
        'WebSearchTool',
      ) &&
      !registry.getTool(HOSTED_WEB_SEARCH_NAME)
    ) {
      hostedTools.push(createHostedWebSearchTool(this.config));
    }

    return hostedTools;
  }

  private canCacheAgent(options: UnifiedAgentStreamOptions): boolean {
    const hasOverrides = Array.isArray(options.toolsOverride)
      ? options.toolsOverride.length > 0
      : false;
    const hasAugmentations = Array.isArray(options.toolsAugmentation)
      ? options.toolsAugmentation.length > 0
      : false;
    return !hasOverrides && !hasAugmentations;
  }

  private buildAgentSignature(
    session: UnifiedAgentSession,
    tools: AgentsTool[],
    modelSettings: Partial<ModelSettings>,
    structuredSignature?: string,
  ): string {
    const toolNames = tools
      .map((tool) => tool.name ?? 'anonymous')
      .sort()
      .join('|');
    const settingsSignature = this.toSignatureString(modelSettings);
    return [
      session.providerId,
      session.model,
      session.systemPrompt ?? '',
      toolNames,
      settingsSignature,
      structuredSignature ?? '',
    ].join('::');
  }

  private buildRunnerSignature(
    session: UnifiedAgentSession,
    modelSettings: Partial<ModelSettings>,
  ): string {
    return [
      session.providerId,
      session.model,
      this.toSignatureString(modelSettings),
    ].join('::');
  }

  async runAgentOnce(options: {
    sessionConfig: UnifiedAgentSessionConfig & { systemPrompt?: string };
    buildAgent: (args: {
      session: UnifiedAgentSession;
      modelSettings: Partial<ModelSettings>;
    }) => Agent<any, any>;
    input: string | AgentInputItem[];
    context?: unknown;
    parallelToolCalls?: boolean;
    onAgentEvent?: (
      event:
        | { type: 'agent_start'; agent: Agent<any, any> }
        | { type: 'agent_end'; agent: Agent<any, any>; output: string }
        | {
            type: 'agent_handoff';
            from: Agent<any, any>;
            to: Agent<any, any>;
          },
    ) => void;
  }): Promise<{
    session: UnifiedAgentSession;
    runResult: Awaited<ReturnType<Runner['run']>>;
  }> {
    const session = await this.createSession(options.sessionConfig);
    const modelSettings = this.buildModelSettings(session, {
      parallelToolCalls: options.parallelToolCalls,
    });
    const agent = options.buildAgent({ session, modelSettings });
    const runner = this.getRunnerForSession(session, modelSettings);

    const handlers: Array<
      [Parameters<Runner['on']>[0], (...args: unknown[]) => void]
    > = [];

    if (options.onAgentEvent) {
      const forward = options.onAgentEvent;
      const startHandler = (_ctx: unknown, agentInstance: Agent<any, any>) => {
        forward({ type: 'agent_start', agent: agentInstance });
      };
      const endHandler = (
        _ctx: unknown,
        agentInstance: Agent<any, any>,
        output: string,
      ) => {
        forward({ type: 'agent_end', agent: agentInstance, output });
      };
      const handoffHandler = (
        _ctx: unknown,
        fromAgent: Agent<any, any>,
        toAgent: Agent<any, any>,
      ) => {
        forward({ type: 'agent_handoff', from: fromAgent, to: toAgent });
      };
      runner.on('agent_start', startHandler);
      runner.on('agent_end', endHandler);
      runner.on('agent_handoff', handoffHandler);
      handlers.push(
        ['agent_start', startHandler],
        ['agent_end', endHandler],
        ['agent_handoff', handoffHandler],
      );
    }

    try {
      const runResult = await runner.run(agent, options.input, {
        context: options.context,
      });
      return { session, runResult };
    } finally {
      for (const [event, handler] of handlers) {
        runner.off(event, handler as Parameters<Runner['off']>[1]);
      }
    }
  }

  private toSignatureString(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (Array.isArray(value)) {
      return value.map((entry) => this.toSignatureString(entry)).join(',');
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, val]) => `${key}:${this.toSignatureString(val)}`);
      return entries.join('|');
    }
    return String(value);
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
      } else if (
        initialPrompt &&
        initialPrompt.trim().length > 0 &&
        !this.lastNonEmptyMessageBySession.has(sessionId)
      ) {
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
      let fallbackText = sessionId
        ? this.lastNonEmptyMessageBySession.get(sessionId)
        : undefined;
      if (!fallbackText || fallbackText.trim().length === 0) {
        fallbackText =
          firstNonEmpty && firstNonEmpty.length > 0
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
      if (
        this.isDebugEnabled('OUROBOROS_DEBUG_PROMPT') ||
        process.env['OUROBOROS_DEBUG']
      ) {
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
        const functionResponse = message.metadata?.['functionResponse'] as
          | Record<string, unknown>
          | undefined;
        if (!functionResponse) {
          return null;
        }

        const statusRaw =
          typeof functionResponse['status'] === 'string'
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

        const callId =
          typeof functionResponse['callId'] === 'string'
            ? (functionResponse['callId'] as string)
            : typeof functionResponse['id'] === 'string'
              ? (functionResponse['id'] as string)
              : (message.toolCallId ?? 'tool-call');
        if (callId && options.seenToolResults?.has(callId)) {
          return null;
        }
        if (callId) {
          options.seenToolResults?.add(callId);
        }

        const name =
          typeof functionResponse['name'] === 'string'
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
    session: UnifiedAgentSession,
    options: UnifiedAgentStreamOptions,
  ): Partial<ModelSettings> {
    const providerId = session.providerId;
    const settings: Partial<ModelSettings> = {};

    if (typeof options.parallelToolCalls === 'boolean') {
      settings.parallelToolCalls = options.parallelToolCalls;
    } else if (providerId === 'openai') {
      settings.parallelToolCalls = this.shouldEnableParallelToolCalls(
        session.model,
      );
    }

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

  private shouldEnableParallelToolCalls(model: string | undefined): boolean {
    if (!model) {
      return false;
    }
    // Temporarily disabled for testing the TUI rendering bug
    return false; // /^gpt-5/i.test(model);
  }

  private getRunnerForSession(
    session: UnifiedAgentSession,
    modelSettings: Partial<ModelSettings>,
  ): Runner {
    const signature = this.buildRunnerSignature(session, modelSettings);
    const cached = this.runnerCache.get(session.id);
    if (cached && cached.signature === signature) {
      return cached.runner;
    }

    const runner = new Runner({
      modelProvider: session.modelProvider,
      model: session.modelHandle,
      modelSettings: modelSettings as ModelSettings,
    });

    this.runnerCache.set(session.id, { signature, runner });
    return runner;
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

    if (name === 'reasoning_item_created') {
      const reasoning = this.extractReasoningSegments(item);
      if (reasoning.length > 0) {
        return { type: 'reasoning', reasoning };
      }
      return null;
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
    const name =
      typeof rawItem?.['name'] === 'string'
        ? (rawItem['name'] as string)
        : 'unknown_tool';
    const { args } = this.parseToolArguments(rawItem?.['arguments']);

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

  private extractApprovalCallId(
    approvalItem: RunToolApprovalItem,
  ): string | undefined {
    const rawItem = approvalItem?.rawItem as
      | Record<string, unknown>
      | undefined;
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

    const name =
      typeof raw['name'] === 'string'
        ? (raw['name'] as string)
        : 'unknown_tool';
    const callId =
      typeof raw['callId'] === 'string'
        ? (raw['callId'] as string)
        : typeof raw['id'] === 'string'
          ? (raw['id'] as string)
          : undefined;
    if (!callId) {
      return null;
    }

    const { args, complete } = this.parseToolArguments(raw['arguments']);
    if (!complete) {
      return null;
    }

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

  private parseToolArguments(value: unknown): {
    args: Record<string, unknown>;
    complete: boolean;
  } {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object') {
          return { args: parsed as Record<string, unknown>, complete: true };
        }
        return {
          args: { value: parsed } as Record<string, unknown>,
          complete: true,
        };
      } catch {
        return {
          args: { raw: value } as Record<string, unknown>,
          complete: false,
        };
      }
    }

    if (value && typeof value === 'object') {
      return { args: value as Record<string, unknown>, complete: true };
    }

    return { args: { value } as Record<string, unknown>, complete: true };
  }

  private extractTextFromRunItem(item: any): string {
    const rawItem = this.getRawItem(item);
    if (!rawItem) {
      return '';
    }

    const content = (rawItem as Record<string, unknown>)['content'];
    if (Array.isArray(content)) {
      return content
        .map((part) => this.extractTextFromPart(part))
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

  private extractReasoningSegments(
    item: any,
  ): Array<{ text: string; raw?: Record<string, unknown> }> {
    const rawItem = this.getRawItem(item);
    if (!rawItem || typeof rawItem !== 'object') {
      return [];
    }

    const record = rawItem as Record<string, unknown>;
    if (record['type'] !== 'reasoning') {
      return [];
    }

    const content = Array.isArray(record['content'])
      ? (record['content'] as Array<Record<string, unknown>>)
      : [];

    const segments: Array<{ text: string; raw?: Record<string, unknown> }> = [];

    for (const entry of content) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const text =
        typeof entry['text'] === 'string' ? entry['text'].trim() : '';
      if (text.length > 0) {
        segments.push({ text, raw: record });
      }
    }

    if (segments.length === 0) {
      const rawContent = Array.isArray(record['rawContent'])
        ? (record['rawContent'] as Array<Record<string, unknown>>)
        : [];
      for (const entry of rawContent) {
        const text =
          typeof entry?.['text'] === 'string' ? entry['text'].trim() : '';
        if (text.length > 0) {
          segments.push({ text, raw: record });
        }
      }
    }

    if (segments.length === 0) {
      const fallback = record['content'];
      if (typeof fallback === 'string' && fallback.trim().length > 0) {
        segments.push({ text: fallback.trim(), raw: record });
      }
    }

    return segments;
  }

  private extractFinalOutputText(result: any): string | undefined {
    const finalOutput = result?.finalOutput;
    if (typeof finalOutput === 'string') {
      return finalOutput;
    }
    if (finalOutput && typeof finalOutput.text === 'string') {
      return finalOutput.text;
    }
    if (finalOutput && typeof finalOutput === 'object') {
      try {
        return JSON.stringify(finalOutput);
      } catch (_error) {
        return String(finalOutput);
      }
    }

    const outputParts = Array.isArray(result?.output) ? result.output : [];
    for (let i = outputParts.length - 1; i >= 0; i -= 1) {
      const part = outputParts[i];
      if (
        part &&
        typeof part.text === 'string' &&
        part.text.trim().length > 0
      ) {
        return part.text;
      }
    }
    return undefined;
  }
}
