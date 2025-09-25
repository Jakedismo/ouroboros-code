import type {
  Content,
  ContentListUnion,
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';
import type { Config } from '../config/config.js';
import type { ContentGenerator } from '../core/contentGenerator.js';
import type { UnifiedAgentMessage, UnifiedAgentStreamOptions } from './types.js';
import { UnifiedAgentsClient } from './unifiedAgentsClient.js';

interface AgentsContentGeneratorOptions {
  defaultModel?: string;
}

export class AgentsContentGenerator implements ContentGenerator {
  private readonly client: UnifiedAgentsClient;

  constructor(
    private readonly config: Config,
    private readonly options: AgentsContentGeneratorOptions,
  ) {
    this.client = new UnifiedAgentsClient(config);
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    const result = await this.runAgentsRequest(request, userPromptId, false);
    return this.buildGenerateContentResponse(result.text ?? '');
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const result = await this.runAgentsRequest(request, userPromptId, true);
    if (!result.stream) {
      async function* empty() {}
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
  }> {
    const providerId = this.config.getProvider();
    const model = request.model || this.getDefaultModel();
    const systemPrompt = this.buildSystemPrompt(request);
    const messages = this.applySchemaInstruction(
      this.convertContentsToMessages(request.contents),
      request,
    );
    const streamOptions = this.buildStreamOptions(request);
    const session = await this.client.createSession({
      providerId,
      model,
      systemPrompt,
    });

    if (!streaming) {
      let finalText = '';

      for await (const event of this.client.streamResponse(session, messages, streamOptions)) {
        if (event.type === 'text-delta') {
          finalText += event.delta ?? '';
        }
        if (event.type === 'final') {
          finalText = event.message.content ?? finalText;
        }
      }

      return { text: finalText };
    }

    const self = this;

    async function* streamGenerator(): AsyncGenerator<GenerateContentResponse> {
      let accumulatedText = '';

      for await (const event of self.client.streamResponse(session, messages, streamOptions)) {
        if (event.type === 'text-delta' && event.delta) {
          accumulatedText += event.delta;
          yield self.buildStreamingResponse(event.delta, false);
        }
        if (event.type === 'final') {
          const content = event.message.content ?? accumulatedText;
          yield self.buildStreamingResponse(content, true);
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

    if (basePrompt && schemaInstruction) {
      return `${basePrompt}\n\n${schemaInstruction}`;
    }
    return basePrompt || schemaInstruction || undefined;
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
      return (contents as Content[]).map((content) => {
        const parts = Array.isArray(content.parts) ? content.parts : [];
        return {
          role: this.mapRole(content.role),
          content: this.serializeParts(parts as unknown[]),
        };
      });
    }

    return [{ role: 'user', content: (contents as string[]).join('\n') }];
  }

  private mapRole(role?: string): UnifiedAgentMessage['role'] {
    switch (role) {
      case 'model':
        return 'assistant';
      case 'tool':
        return 'tool';
      case 'user':
      case 'system':
        return role;
      default:
        return 'user';
    }
  }

  private serializeParts(parts: unknown[]): string {
    return parts
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          if ('text' in part && typeof (part as { text?: string }).text === 'string') {
            return (part as { text?: string }).text as string;
          }
          return '';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
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

  private buildGenerateContentResponse(text: string): GenerateContentResponse {
    return {
      candidates: [
        {
          content: {
            parts: [{ text }],
            role: 'model',
          },
          index: 0,
          finishReason: 'STOP' as any,
        },
      ],
      usageMetadata: {
        promptTokenCount: 0,
        candidatesTokenCount: 0,
        totalTokenCount: 0,
      } as any,
    } as GenerateContentResponse;
  }

  private buildStreamingResponse(text: string, done: boolean): GenerateContentResponse {
    return {
      candidates: [
        {
          content: {
            parts: [{ text }],
            role: 'model',
          },
          index: 0,
          finishReason: done ? ('STOP' as any) : undefined,
        },
      ],
      usageMetadata: {
        promptTokenCount: 0,
        candidatesTokenCount: 0,
        totalTokenCount: 0,
      } as any,
    } as GenerateContentResponse;
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
}
