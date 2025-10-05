import type {
  Content,
  ContentListUnion,
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  FunctionCall,
  GenerateContentParameters,
  GenerateContentResponse,
  GenerateContentResponseCandidate,
  GenerateContentResponseUsageMetadata,
  Part,
  FinishReason,
} from './genaiCompat.js';
import type { Config } from '../config/config.js';
import type { ContentGenerator } from '../core/contentGenerator.js';
import type { UnifiedAgentMessage, UnifiedAgentStreamOptions, UnifiedAgentToolCall } from './types.js';
import type { AnyDeclarativeTool } from '../tools/tools.js';
import { UnifiedAgentsClient } from './unifiedAgentsClient.js';
import {
  convertContentHistoryToUnifiedMessages,
  convertContentToUnifiedMessage,
} from './historyConversion.js';
import { SessionManager } from './sessionManager.js';
import { Storage } from '../config/storage.js';

interface AgentsContentGeneratorOptions {
  defaultModel?: string;
}

export class AgentsContentGenerator implements ContentGenerator {
  private readonly client: UnifiedAgentsClient;
  private readonly sessionManager: SessionManager;
  private runtimePrimerCache?: string;

  constructor(
    private readonly config: Config,
    private readonly options: AgentsContentGeneratorOptions,
  ) {
    // Create SessionManager with global storage directory
    const storageDir = Storage.getSessionStorageDir();
    this.sessionManager = new SessionManager(storageDir);

    // Inject SessionManager into UnifiedAgentsClient
    this.client = new UnifiedAgentsClient(config, {
      sessionManager: this.sessionManager,
    });
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    const result = await this.runAgentsRequest(request, userPromptId, false);
    return this.buildResponseChunk({
      textParts: result.text ? [result.text] : undefined,
      functionCalls:
        result.functionCalls && result.functionCalls.length > 0
          ? result.functionCalls
          : undefined,
      finishReason: 'STOP',
      usage: result.usage,
    });
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const result = await this.runAgentsRequest(request, userPromptId, true);
    if (!result.stream) {
      async function* empty(): AsyncGenerator<GenerateContentResponse> {}
      return empty();
    }
    return result.stream;
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    const contentString = this.serializeContentUnion(request.contents);
    const tokenEstimate = Math.ceil(contentString.length / 4);

    return {
      totalTokens: tokenEstimate,
      totalBillableCharacters: contentString.length,
    } as CountTokensResponse;
  }

  async embedContent(_request: EmbedContentParameters): Promise<EmbedContentResponse> {
    throw new Error('Embeddings are not supported in the unified Agents runtime yet.');
  }

  private async runAgentsRequest(
    request: GenerateContentParameters,
    userPromptId: string,
    streaming: boolean,
  ): Promise<{
    text?: string;
    stream?: AsyncGenerator<GenerateContentResponse>;
    functionCalls?: FunctionCall[];
    usage?: GenerateContentResponseUsageMetadata;
  }> {
    const providerId = this.config.getProvider();
    const model = request.model || this.getDefaultModel();
    const systemPrompt = this.buildSystemPrompt(request);
    const messages = this.applySchemaInstruction(
      this.convertContentsToMessages(request.contents),
      request,
    );
    const streamOptions = this.buildStreamOptions(request);

    // Pass session ID through metadata for persistence
    const sessionId = this.config.getSessionId();
    const session = await this.client.createSession({
      providerId,
      model,
      systemPrompt,
      metadata: {
        sessionId, // Used for session restoration
      },
    });

    if (!streaming) {
      let finalText = '';
      const functionCalls: FunctionCall[] = [];
      let usage: GenerateContentResponseUsageMetadata | undefined;

      for await (const event of this.client.streamResponse(
        session,
        messages,
        streamOptions,
      )) {
        if (event.type === 'usage') {
          usage = this.mapUsage(event.usage);
          continue;
        }

        if (event.type === 'text-delta') {
          finalText += event.delta ?? '';
          continue;
        }

        if (event.type === 'tool-call') {
          functionCalls.push(this.normalizeFunctionCall(event.toolCall));
          continue;
        }

        if (event.type === 'error') {
          throw event.error;
        }

        if (event.type === 'final') {
          const content = event.message.content;
          if (typeof content === 'string' && content.length > 0) {
            finalText = content;
          }
        }
      }

      return { text: finalText, functionCalls, usage };
    }

    const self = this;

    async function* streamGenerator(): AsyncGenerator<GenerateContentResponse> {
      let accumulatedText = '';
      let pendingUsage: GenerateContentResponseUsageMetadata | undefined;

      for await (const event of self.client.streamResponse(
        session,
        messages,
        streamOptions,
      )) {
        if (event.type === 'usage') {
          pendingUsage = self.mapUsage(event.usage);
          continue;
        }

        if (event.type === 'text-delta') {
          const delta = event.delta ?? '';
          if (delta) {
            accumulatedText += delta;
            yield self.buildResponseChunk({
              textParts: [delta],
              usage: pendingUsage,
            });
            pendingUsage = undefined;
          }
          continue;
        }

        if (event.type === 'tool-call') {
          yield self.buildResponseChunk({
            functionCalls: [self.normalizeFunctionCall(event.toolCall)],
            usage: pendingUsage,
          });
          pendingUsage = undefined;
          continue;
        }

        if (event.type === 'error') {
          throw event.error;
        }

        if (event.type === 'final') {
          const finalText = event.message.content ?? '';
          const remaining = finalText.startsWith(accumulatedText)
            ? finalText.slice(accumulatedText.length)
            : finalText;
          if (remaining) {
            accumulatedText += remaining;
            yield self.buildResponseChunk({
              textParts: [remaining],
              usage: pendingUsage,
            });
            pendingUsage = undefined;
          }
          yield self.buildResponseChunk({
            finishReason: 'STOP' as FinishReason,
            usage: pendingUsage,
          });
          pendingUsage = undefined;
        }
      }
    }

    return { stream: streamGenerator() };
  }

  private buildStreamOptions(request: GenerateContentParameters): UnifiedAgentStreamOptions {
    const config = request.config ?? {};
    const streamOptions: UnifiedAgentStreamOptions = {};

    if (this.config.getProvider() !== 'openai') {
      if (typeof config.maxOutputTokens === 'number') {
        streamOptions.maxOutputTokens = config.maxOutputTokens;
      }
      if (typeof config.temperature === 'number') {
        streamOptions.temperature = config.temperature;
      }
    }

    return streamOptions;
  }

  private buildSystemPrompt(request: GenerateContentParameters): string | undefined {
    const basePrompt = this.extractSystemPrompt(request.config?.systemInstruction);
    const schemaInstruction = this.describeExpectedResponse(request);
    const runtimePrimer = this.getRuntimePrimer();

    const segments = [basePrompt, runtimePrimer, schemaInstruction].filter(
      (segment): segment is string => typeof segment === 'string' && segment.trim().length > 0,
    );

    if (segments.length === 0) {
      return undefined;
    }

    return segments.join('\n\n');
  }

  private applySchemaInstruction(
    messages: UnifiedAgentMessage[],
    request: GenerateContentParameters,
  ): UnifiedAgentMessage[] {
    const schemaInstruction = this.describeExpectedResponse(request);
    if (!schemaInstruction) {
      return messages;
    }

    if (messages.length === 0) {
      return [{ role: 'user', content: schemaInstruction }];
    }

    const last = messages[messages.length - 1];
    if (last.role === 'user') {
      last.content = `${last.content}\n\n${schemaInstruction}`.trim();
    } else {
      messages.push({ role: 'user', content: schemaInstruction });
    }

    return messages;
  }

  private describeExpectedResponse(request: GenerateContentParameters): string | undefined {
    const config = request.config ?? {};
    const schema = config.responseJsonSchema;
    const mimeType = typeof config.responseMimeType === 'string' ? config.responseMimeType : undefined;

    if (!schema && !mimeType) {
      return undefined;
    }

    const segments: string[] = [];

    if (mimeType) {
      segments.push(`Respond using strictly the ${mimeType} MIME type with no surrounding prose.`);
    }

    if (schema && typeof schema === 'object') {
      try {
        const schemaJson = JSON.stringify(schema);
        segments.push(`Your entire reply MUST be valid JSON that conforms to this schema: ${schemaJson}. Do not wrap the JSON in markdown fences.`);
      } catch {
        segments.push('Your reply must be valid JSON matching the requested schema.');
      }
    }

    return segments.join('\n');
  }

  private convertContentsToMessages(contents: ContentListUnion): UnifiedAgentMessage[] {
    if (typeof contents === 'string') {
      return [{ role: 'user', content: contents }];
    }

    if (!Array.isArray(contents) || contents.length === 0) {
      return [{ role: 'user', content: '' }];
    }

    const first = contents[0] as Content | string;
    if (first && typeof first === 'object' && 'role' in first) {
      const unifiedMessages = convertContentHistoryToUnifiedMessages(
        contents as Content[],
      );
      if (unifiedMessages.length > 0) {
        return unifiedMessages;
      }
      const fallback = convertContentToUnifiedMessage(first as Content);
      if (fallback) {
        return [fallback];
      }
      return [{ role: 'user', content: '' }];
    }

    return [{ role: 'user', content: (contents as string[]).join('\n') }];
  }

  private serializeContentUnion(content: ContentListUnion): string {
    if (typeof content === 'string') {
      return content;
    }

    if (!Array.isArray(content) || content.length === 0) {
      return '';
    }

    const first = content[0] as Content | string;
    if (first && typeof first === 'object' && 'role' in first) {
      return (content as Content[])
        .map((item) => this.serializeParts(item.parts ?? []))
        .filter(Boolean)
        .join('\n');
    }

    return (content as string[]).join('\n');
  }

  private buildResponseChunk(options: {
    textParts?: string[];
    functionCalls?: FunctionCall[];
    finishReason?: FinishReason;
    usage?: GenerateContentResponseUsageMetadata;
  }): GenerateContentResponse {
    const parts: Part[] = [];

    for (const text of options.textParts ?? []) {
      if (typeof text === 'string' && text.length > 0) {
        parts.push({ text });
      }
    }

    const normalizedCalls = (options.functionCalls ?? []).map((call) => ({
      ...call,
      args: call.args ?? {},
    }));

    for (const call of normalizedCalls) {
      parts.push({ functionCall: call });
    }

    const candidate: GenerateContentResponseCandidate = {
      index: 0,
    };

    if (parts.length > 0) {
      candidate.content = {
        role: 'model',
        parts,
      };
    }

    if (normalizedCalls.length > 0) {
      candidate.functionCalls = normalizedCalls;
    }

    if (options.finishReason) {
      candidate.finishReason = options.finishReason;
    }

    const response: GenerateContentResponse = {
      candidates: [candidate],
    };

    if (options.usage) {
      response.usageMetadata = options.usage;
    }

    return response;
  }

  private normalizeFunctionCall(call: UnifiedAgentToolCall): FunctionCall {
    return {
      id: call.id,
      name: call.name,
      args: this.normalizeToolArguments(call.arguments),
    };
  }

  private normalizeToolArguments(value: unknown): Record<string, unknown> {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object') {
          return { ...(parsed as Record<string, unknown>) };
        }
        return { value: parsed };
      } catch {
        return { value };
      }
    }

    if (Array.isArray(value)) {
      return { value };
    }

    if (value && typeof value === 'object') {
      return { ...(value as Record<string, unknown>) };
    }

    return {};
  }

  private mapUsage(usage: unknown): GenerateContentResponseUsageMetadata | undefined {
    if (!usage || typeof usage !== 'object') {
      return undefined;
    }

    const numericEntries: GenerateContentResponseUsageMetadata = {};

    for (const [key, value] of Object.entries(usage as Record<string, unknown>)) {
      if (typeof value === 'number') {
        numericEntries[key] = value;
      }
    }

    return Object.keys(numericEntries).length > 0 ? numericEntries : undefined;
  }

  private getDefaultModel(): string {
    return this.options.defaultModel || this.config.getModel();
  }

  private extractSystemPrompt(value: unknown): string | undefined {
    if (typeof value === 'string') {
      return value;
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => (typeof item === 'string' ? item : ''))
        .filter(Boolean)
        .join('\n') || undefined;
    }

    return undefined;
  }

  private getRuntimePrimer(): string {
    if (typeof this.runtimePrimerCache === 'string') {
      return this.runtimePrimerCache;
    }

    const workspaceRoot = this.config.getTargetDir?.() ?? this.config.getProjectRoot?.() ?? process.cwd();
    const registry = this.config.getToolRegistry?.();
    const tools = registry && typeof registry.getAllTools === 'function'
      ? (registry.getAllTools() as AnyDeclarativeTool[])
      : [];

    const toolSummaries = tools
      .map((tool) => this.describeTool(tool))
      .filter(Boolean)
      .join('\n');

    const primerSections = [
      '# Ouroboros Coding Agent Operations Briefing',
      `- You are a hands-on software engineer operating directly inside the repository rooted at \`${workspaceRoot}\`. Inspect and modify files there to satisfy the user.`,
      '- Always ground decisions in repository evidence. Prefer local inspection and commands before turning to the network tools.',
      '- Conversation history persists across turns. Reference prior tool output and user context instead of repeating the same calls.',
      '- Keep tool arguments explicit, especially absolute paths inside the workspace. Confirm edits with targeted reads and follow up with verification commands.',
      '',
      '## Available Tooling Cheat Sheet',
      toolSummaries.length > 0
        ? toolSummaries
        : '- Tool schemas are already registered. Call the appropriate function tools as needed; supply JSON arguments that match their parameter names.',
    ];

    const primer = primerSections
      .filter((section) => typeof section === 'string' && section.trim().length > 0)
      .join('\n');

    this.runtimePrimerCache = primer;
    return primer;
  }

  private describeTool(tool: AnyDeclarativeTool): string {
    const name = tool.displayName ?? tool.name;
    const description = typeof tool.description === 'string' ? tool.description.trim() : '';
    const schema = (tool.schema?.parametersJsonSchema ?? tool.schema?.parameters) as
      | Record<string, unknown>
      | undefined;

    if (!schema || typeof schema !== 'object') {
      return `- ${name}${description ? ` – ${description}` : ''}`;
    }

    const properties = (schema['properties'] ?? {}) as Record<string, any>;
    const requiredList = Array.isArray(schema['required'])
      ? (schema['required'] as string[])
      : [];

    const required = requiredList
      .map((key) => this.describeToolParameter(key, properties[key]))
      .filter(Boolean)
      .join(', ');
    const optional = Object.keys(properties)
      .filter((key) => !requiredList.includes(key))
      .map((key) => this.describeToolParameter(key, properties[key]))
      .filter(Boolean)
      .join(', ');

    const segments = [`- ${name}${description ? ` – ${description}` : ''}`];
    if (required) {
      segments.push(`  - Required: ${required}`);
    }
    if (optional) {
      segments.push(`  - Optional: ${optional}`);
    }

    return segments.join('\n');
  }

  private describeToolParameter(key: string, schema: unknown): string | undefined {
    const record = schema && typeof schema === 'object' ? (schema as Record<string, unknown>) : undefined;
    const typeValue = typeof record?.['type'] === 'string' ? (record?.['type'] as string) : undefined;
    const description = typeof record?.['description'] === 'string' ? record?.['description'] as string : undefined;
    const type = Array.isArray(record?.['enum'])
      ? `enum(${(record?.['enum'] as unknown[])
        .slice(0, 4)
        .map((value) => JSON.stringify(value))
        .join(', ')}${(record?.['enum'] as unknown[]).length > 4 ? ', …' : ''})`
      : typeValue ?? 'value';
    const summary = description ? `${key}: ${type} – ${description}` : `${key}: ${type}`;
    return summary.trim();
  }
}
