/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Content,
  GenerateContentConfig,
  GenerateContentResponse,
  SendMessageParameters,
  Part,
  Tool,
} from '../runtime/genaiCompat.js';
import { createUserContent } from '../runtime/genaiCompat.js';
import { getResponseText } from '../utils/partUtils.js';
import type { Config } from '../config/config.js';
import type { UserTierId } from '../code_assist/types.js';
import type {
  ContentGenerator,
  ContentGeneratorConfig,
} from './contentGenerator.js';

import { getCompressionPrompt } from './prompts.js';
import { tokenLimit } from './tokenLimits.js';
import {
  CompressionStatus,
  type ChatCompressionInfo,
} from './turn.js';
import { isFunctionResponse } from '../utils/messageInspectors.js';
import { logChatCompression } from '../telemetry/loggers.js';
import { makeChatCompressionEvent } from '../telemetry/types.js';

const COMPRESSION_TOKEN_THRESHOLD = 0.7;
const COMPRESSION_PRESERVE_THRESHOLD = 0.3;

const COMPRESSION_MESSAGE =
  'First, reason in your scratchpad. Then, generate the <state_snapshot>.';

function findIndexAfterFraction(history: Content[], fraction: number): number {
  if (fraction <= 0 || fraction >= 1) {
    throw new Error('Fraction must be between 0 and 1');
  }

  const contentLengths = history.map((content) =>
    JSON.stringify(content).length,
  );

  const totalCharacters = contentLengths.reduce(
    (sum, length) => sum + length,
    0,
  );
  const targetCharacters = totalCharacters * fraction;

  let charactersSoFar = 0;
  for (let i = 0; i < contentLengths.length; i++) {
    charactersSoFar += contentLengths[i];
    if (charactersSoFar >= targetCharacters) {
      return i;
    }
  }
  return contentLengths.length;
}

function sanitizeHistoryParts(history: Content[], stripThoughts: boolean): Content[] {
  if (!stripThoughts) {
    return history.map((content) => ({ ...content }));
  }

  return history.map((content) => {
    if (!content.parts || content.parts.length === 0) {
      return { ...content };
    }

    const sanitizedParts = content.parts.map((part) => {
      if (part && typeof part === 'object' && 'thoughtSignature' in part) {
        const { thoughtSignature: _ignored, ...rest } = part as Part & {
          thoughtSignature?: unknown;
        };
        return { ...rest } as Part;
      }
      return part;
    });

    return { ...content, parts: sanitizedParts };
  });
}

function curateHistory(history: Content[]): Content[] {
  if (!history || history.length === 0) {
    return [];
  }

  const curated: Content[] = [];
  const length = history.length;
  let index = 0;

  const isValidContent = (content: Content): boolean => {
    if (!content.parts || content.parts.length === 0) {
      return false;
    }
    return content.parts.every((part) => {
      if (!part) {
        return false;
      }
      if (typeof (part as any).text === 'string') {
        return (part as any).text.length > 0;
      }
      if ((part as any).functionCall || (part as any).functionResponse) {
        return true;
      }
      return true;
    });
  };

  while (index < length) {
    const entry = history[index];
    if (entry.role === 'user') {
      curated.push(entry);
      index += 1;
      continue;
    }

    const modelOutputs: Content[] = [];
    let valid = true;
    while (index < length && history[index].role === 'model') {
      const candidate = history[index];
      modelOutputs.push(candidate);
      if (valid && !isValidContent(candidate)) {
        valid = false;
      }
      index += 1;
    }

    if (valid) {
      curated.push(...modelOutputs);
    }
  }

  return curated;
}

/**
 * Provider-neutral Agents SDK client that backs the runtime chat experience.
 * Originally introduced as a compatibility shim, it now serves as the primary
 * conversation client so callers can interact with the unified multi-provider
 * stack without referencing legacy Gemini APIs.
 */
export class AgentsClient {
  private contentGenerator?: ContentGenerator;
  private history: Content[] = [];
  private systemInstruction?: string;
  private hasFailedCompressionAttempt = false;
  private initialized = false;
  private tools: Tool[] | undefined;

  constructor(private readonly config: Config) {}

  async initialize(contentGeneratorConfig: ContentGeneratorConfig) {
    const { createContentGenerator } = await import('./contentGenerator.js');
    this.contentGenerator = await createContentGenerator(
      contentGeneratorConfig,
      this.config,
      this.config.getSessionId(),
    );
    this.initialized = true;
  }

  isInitialized(): boolean {
    return this.initialized && !!this.contentGenerator;
  }

  getContentGenerator(): ContentGenerator {
    if (!this.contentGenerator) {
      throw new Error('AgentsClient not initialized');
    }
    return this.contentGenerator;
  }

  getHistory(): Content[] {
    return [...this.history];
  }

  getCuratedHistory(): Content[] {
    return curateHistory(this.history);
  }

  setHistory(history: Content[], options: { stripThoughts?: boolean } = {}) {
    const sanitized = sanitizeHistoryParts(history, options.stripThoughts ?? false);
    this.history = [...sanitized];
  }

  async addHistory(content: Content): Promise<void> {
    this.history.push(content);
  }

  setSystemInstruction(instruction: string): void {
    this.systemInstruction = instruction;
  }

  clearSystemInstruction(): void {
    this.systemInstruction = undefined;
  }

  getSystemInstruction(): string | undefined {
    return this.systemInstruction;
  }

  async resetChat(): Promise<void> {
    this.history = [];
  }

  async setTools(tools?: Tool[]): Promise<void> {
    if (!Array.isArray(tools) || tools.length === 0) {
      this.tools = undefined;
      return;
    }
    this.tools = tools.map((tool) => ({ ...tool }));
  }

  async sendMessage(
    params: SendMessageParameters,
    prompt_id: string,
  ): Promise<GenerateContentResponse> {
    const userContent = createUserContent(params.message);
    const requestContents = [...this.history, userContent];
    const generator = this.getContentGenerator();
    const model = this.config.getModel();
    const config: GenerateContentConfig = {
      ...this.getGenerateContentConfig(),
      ...(params.config ?? {}),
    };

    const response = await generator.generateContent(
      {
        model,
        contents: requestContents,
        config,
      },
      prompt_id,
    );

    this.history.push(userContent);
    const outputContent = response.candidates?.[0]?.content;
    if (outputContent) {
      this.history.push(outputContent as Content);
    }
    return response;
  }

  async sendMessageStream(
    params: SendMessageParameters,
    prompt_id: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const userContent = createUserContent(params.message);
    const requestContents = [...this.history, userContent];
    const generator = this.getContentGenerator();
    const model = this.config.getModel();
    const config: GenerateContentConfig = {
      ...this.getGenerateContentConfig(),
      ...(params.config ?? {}),
    };

    const stream = await generator.generateContentStream(
      {
        model,
        contents: requestContents,
        config,
      },
      prompt_id,
    );

    this.history.push(userContent);
    const self = this;
    async function* wrappedStream() {
      const aggregatedTextParts: Part[] = [];
      for await (const chunk of stream) {
        const candidateParts = chunk.candidates?.[0]?.content?.parts;
        if (Array.isArray(candidateParts)) {
          for (const part of candidateParts as Part[]) {
            if (part && typeof part.text === 'string' && part.text.length > 0) {
              aggregatedTextParts.push({ text: part.text });
            }
          }
        }
        yield chunk;
      }

      if (aggregatedTextParts.length > 0) {
        self.history.push({
          role: 'model',
          parts: aggregatedTextParts,
        });
      }
    }

    return wrappedStream();
  }

  async tryCompressChat(
    promptId: string,
    force = false,
  ): Promise<ChatCompressionInfo> {
    const curatedHistory = this.getHistory();

    if (
      curatedHistory.length === 0 ||
      (this.hasFailedCompressionAttempt && !force)
    ) {
      return {
        originalTokenCount: 0,
        newTokenCount: 0,
        compressionStatus: CompressionStatus.NOOP,
      };
    }

    const generator = this.getContentGenerator();
    const model = this.config.getModel();
    const { totalTokens: originalTokenCount } = await generator.countTokens({
      model,
      contents: curatedHistory,
    });

    if (typeof originalTokenCount !== 'number') {
      console.warn(`Could not determine token count for model ${model}.`);
      this.hasFailedCompressionAttempt = !force && true;
      return {
        originalTokenCount: 0,
        newTokenCount: 0,
        compressionStatus:
          CompressionStatus.COMPRESSION_FAILED_TOKEN_COUNT_ERROR,
      };
    }

    const threshold =
      this.config.getChatCompression()?.contextPercentageThreshold ??
      COMPRESSION_TOKEN_THRESHOLD;

    if (!force && originalTokenCount < threshold * tokenLimit(model)) {
      return {
        originalTokenCount,
        newTokenCount: originalTokenCount,
        compressionStatus: CompressionStatus.NOOP,
      };
    }

    let compressBeforeIndex = findIndexAfterFraction(
      curatedHistory,
      1 - COMPRESSION_PRESERVE_THRESHOLD,
    );

    while (
      compressBeforeIndex < curatedHistory.length &&
      (curatedHistory[compressBeforeIndex]?.role === 'model' ||
        isFunctionResponse(curatedHistory[compressBeforeIndex]))
    ) {
      compressBeforeIndex++;
    }

    const historyToCompress = curatedHistory.slice(0, compressBeforeIndex);
    const historyToKeep = curatedHistory.slice(compressBeforeIndex);

    if (historyToCompress.length === 0) {
      return {
        originalTokenCount,
        newTokenCount: originalTokenCount,
        compressionStatus: CompressionStatus.NOOP,
      };
    }

    const compressionResponse = await generator.generateContent(
      {
        model,
        contents: [
          ...historyToCompress,
          {
            role: 'user',
            parts: [{ text: COMPRESSION_MESSAGE }],
          },
        ],
        config: {
          ...this.getGenerateContentConfig(),
          systemInstruction: getCompressionPrompt(),
          maxOutputTokens: originalTokenCount,
        },
      },
      promptId,
    );

    const summary = (getResponseText(compressionResponse) ?? '').trim();
    if (!summary) {
      this.history = curatedHistory;
      this.hasFailedCompressionAttempt = !force && true;
      return {
        originalTokenCount,
        newTokenCount: originalTokenCount,
        compressionStatus:
          CompressionStatus.COMPRESSION_FAILED_TOKEN_COUNT_ERROR,
      };
    }

    const renewedHistory: Content[] = [
      {
        role: 'user',
        parts: [{ text: summary }],
      },
      {
        role: 'model',
        parts: [{ text: 'Got it. Thanks for the additional context!' }],
      },
      ...historyToKeep,
    ];

    const { totalTokens: newTokenCount } = await generator.countTokens({
      model: this.config.getModel(),
      contents: renewedHistory,
    });

    if (typeof newTokenCount !== 'number') {
      console.warn('Could not determine compressed history token count.');
      this.history = curatedHistory;
      this.hasFailedCompressionAttempt = !force && true;
      return {
        originalTokenCount,
        newTokenCount: originalTokenCount,
        compressionStatus:
          CompressionStatus.COMPRESSION_FAILED_TOKEN_COUNT_ERROR,
      };
    }

    logChatCompression(
      this.config,
      makeChatCompressionEvent({
        tokens_before: originalTokenCount,
        tokens_after: newTokenCount,
      }),
    );

    if (newTokenCount > originalTokenCount) {
      this.history = curatedHistory;
      this.hasFailedCompressionAttempt = !force && true;
      return {
        originalTokenCount,
        newTokenCount,
        compressionStatus:
          CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
      };
    }

    this.history = renewedHistory;
    this.hasFailedCompressionAttempt = false;

    return {
      originalTokenCount,
      newTokenCount,
      compressionStatus: CompressionStatus.COMPRESSED,
    };
  }

  async generateJson(
    contents: Content[],
    schema: Record<string, unknown>,
    abortSignal: AbortSignal,
    model?: string,
    config: GenerateContentConfig = {},
  ): Promise<Record<string, unknown>> {
    const generator = this.getContentGenerator();
    const requestConfig: GenerateContentConfig = {
      ...this.getGenerateContentConfig(),
      ...config,
      responseMimeType: 'application/json',
      responseJsonSchema: schema,
    };
    if (abortSignal) {
      (requestConfig as Record<string, unknown>)["abortSignal"] = abortSignal;
    }

    const response = await generator.generateContent(
      {
        model: model ?? this.config.getModel(),
        contents,
        config: requestConfig,
      },
      this.config.getSessionId(),
    );

    let textContent = (getResponseText(response) ?? '').trim();
    if (!textContent) {
      throw new Error('AgentsClient.generateJson returned an empty response');
    }

    const fencedPrefix = '```json';
    const fencedSuffix = '```';
    if (textContent.startsWith(fencedPrefix) && textContent.endsWith(fencedSuffix)) {
      textContent = textContent.slice(fencedPrefix.length, -fencedSuffix.length).trim();
    }

    try {
      return JSON.parse(textContent) as Record<string, unknown>;
    } catch (error) {
      throw new Error(`Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async generateContent(
    contents: Content[],
    generationConfig: GenerateContentConfig,
    abortSignal?: AbortSignal,
    model?: string,
  ): Promise<GenerateContentResponse> {
    const generator = this.getContentGenerator();
    const requestConfig: GenerateContentConfig = {
      ...this.getGenerateContentConfig(),
      ...generationConfig,
    };
    if (abortSignal) {
      (requestConfig as Record<string, unknown>)['abortSignal'] = abortSignal;
    }

    return generator.generateContent(
      {
        model: model ?? this.config.getModel(),
        contents,
        config: requestConfig,
      },
      this.config.getSessionId(),
    );
  }

  getGenerateContentConfig(): GenerateContentConfig {
    const base: GenerateContentConfig = {
      temperature: 0,
      topP: 1,
    };

    if (this.systemInstruction) {
      base.systemInstruction = this.systemInstruction;
    }
    if (this.tools && this.tools.length > 0) {
      base.tools = this.tools.map((tool) => ({ ...tool }));
    }

    return base;
  }

  getUserTier(): UserTierId | undefined {
    return this.contentGenerator?.userTier;
  }
}
