/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  GenerateContentParameters,
  GenerateContentResponse,
} from '../runtime/genaiCompat.js';

import {
  createContentGenerator,
  createContentGeneratorConfig,
  AuthType,
} from './contentGenerator.js';
import { LoggingContentGenerator } from './loggingContentGenerator.js';
import type { ContentGenerator, ContentGeneratorConfig } from './contentGenerator.js';
import type { Config } from '../config/config.js';
import {
  ApiRequestEvent,
  ApiResponseEvent,
  ApiErrorEvent,
} from '../telemetry/types.js';

const agentsContentGeneratorMock = vi.hoisted(() => vi.fn());
const toContentsMock = vi.hoisted(() =>
  vi.fn((contents: any) => contents),
);
const logApiRequestMock = vi.hoisted(() => vi.fn());
const logApiResponseMock = vi.hoisted(() => vi.fn());
const logApiErrorMock = vi.hoisted(() => vi.fn());

vi.mock('../runtime/agentsContentGenerator.js', () => ({
  AgentsContentGenerator: agentsContentGeneratorMock,
}));

vi.mock('../code_assist/converter.js', () => ({
  toContents: toContentsMock,
}));

vi.mock('../telemetry/loggers.js', () => ({
  logApiRequest: logApiRequestMock,
  logApiResponse: logApiResponseMock,
  logApiError: logApiErrorMock,
}));

describe('createContentGenerator', () => {
  const stubConfig = {
    getModel: vi.fn().mockReturnValue('model-from-config'),
    getContentGeneratorConfig: vi.fn().mockReturnValue({ authType: AuthType.USE_GEMINI }),
  } as unknown as Config;

  const makeStubGenerator = (): ContentGenerator => ({
    generateContent: vi.fn(),
    generateContentStream: vi.fn(),
    countTokens: vi.fn(),
    embedContent: vi.fn(),
  });

  beforeEach(() => {
    agentsContentGeneratorMock.mockReset();
    toContentsMock.mockClear();
    logApiRequestMock.mockClear();
    logApiResponseMock.mockClear();
    logApiErrorMock.mockClear();
  });

  it('wraps AgentsContentGenerator with telemetry logging', async () => {
    const stubGenerator = makeStubGenerator();
    agentsContentGeneratorMock.mockImplementation(() => stubGenerator);

    const generator = await createContentGenerator(
      { model: 'request-model' },
      stubConfig,
    );

    expect(agentsContentGeneratorMock).toHaveBeenCalledWith(stubConfig, {
      defaultModel: 'model-from-config',
    });
    expect(generator).toBeInstanceOf(LoggingContentGenerator);
    expect((generator as LoggingContentGenerator).getWrapped()).toBe(
      stubGenerator,
    );
  });

  describe('telemetry integration', () => {
    let config: Config;
    let baseConfig: ContentGeneratorConfig;
    let stubGenerator: ReturnType<typeof makeStubGenerator>;
    let loggingGenerator: LoggingContentGenerator;

    beforeEach(async () => {
      config = {
        getModel: vi.fn().mockReturnValue('model-from-config'),
        getContentGeneratorConfig: vi.fn().mockReturnValue({
          authType: AuthType.USE_GEMINI,
        }),
      } as unknown as Config;

      baseConfig = { model: 'request-model' };
      stubGenerator = makeStubGenerator();
      agentsContentGeneratorMock.mockImplementation(() => stubGenerator);

      const generator = await createContentGenerator(baseConfig, config);
      loggingGenerator = generator as LoggingContentGenerator;
    });

    it('logs request and response for generateContent', async () => {
      const response = {
        candidates: [],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30,
          cachedContentTokenCount: 0,
          thoughtsTokenCount: 0,
          toolUsePromptTokenCount: 0,
        },
      } as unknown as GenerateContentResponse;

      stubGenerator.generateContent = vi
        .fn()
        .mockResolvedValue(response);

      const request: GenerateContentParameters = {
        model: 'request-model',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        config: {},
      } as GenerateContentParameters;

      await loggingGenerator.generateContent(request, 'prompt-123');

      expect(logApiRequestMock).toHaveBeenCalledTimes(1);
      const requestEvent = logApiRequestMock.mock.calls[0][1] as ApiRequestEvent;
      expect(requestEvent.model).toBe('request-model');
      expect(requestEvent.prompt_id).toBe('prompt-123');

      expect(logApiResponseMock).toHaveBeenCalledTimes(1);
      const responseEvent = logApiResponseMock.mock.calls[0][1] as ApiResponseEvent;
      expect(responseEvent.model).toBe('model-from-config');
      expect(responseEvent.prompt_id).toBe('prompt-123');
      expect(responseEvent.total_token_count).toBe(30);
      expect(logApiErrorMock).not.toHaveBeenCalled();
    });

    it('logs errors when generateContent rejects', async () => {
      const error = new Error('boom');
      stubGenerator.generateContent = vi.fn().mockRejectedValue(error);

      const request: GenerateContentParameters = {
        model: 'request-model',
        contents: [],
        config: {},
      } as GenerateContentParameters;

      await expect(
        loggingGenerator.generateContent(request, 'prompt-err'),
      ).rejects.toThrowError('boom');

      expect(logApiRequestMock).toHaveBeenCalledTimes(1);
      expect(logApiErrorMock).toHaveBeenCalledTimes(1);
      const errorEvent = logApiErrorMock.mock.calls[0][1] as ApiErrorEvent;
      expect(errorEvent.model).toBe('model-from-config');
      expect(errorEvent.prompt_id).toBe('prompt-err');
      expect(errorEvent.error).toContain('boom');
      expect(logApiResponseMock).not.toHaveBeenCalled();
    });

    it('logs response after streaming completes', async () => {
      const streamResponses: GenerateContentResponse[] = [
        ({
          candidates: [],
          usageMetadata: {
            promptTokenCount: 5,
            candidatesTokenCount: 15,
            totalTokenCount: 20,
            cachedContentTokenCount: 0,
            thoughtsTokenCount: 0,
            toolUsePromptTokenCount: 0,
          },
        } as unknown as GenerateContentResponse),
        ({
          candidates: [],
          usageMetadata: {
            promptTokenCount: 8,
            candidatesTokenCount: 12,
            totalTokenCount: 25,
            cachedContentTokenCount: 0,
            thoughtsTokenCount: 0,
            toolUsePromptTokenCount: 0,
          },
        } as unknown as GenerateContentResponse),
      ];

      stubGenerator.generateContentStream = vi
        .fn()
        .mockResolvedValue(
          (async function* () {
            for (const chunk of streamResponses) {
              yield chunk;
            }
          })(),
        );

      const request: GenerateContentParameters = {
        model: 'request-model',
        contents: [],
        config: {},
      } as GenerateContentParameters;

      const stream = await loggingGenerator.generateContentStream(
        request,
        'prompt-stream',
      );

      const collected: GenerateContentResponse[] = [];
      for await (const part of stream) {
        collected.push(part);
      }

      expect(collected).toHaveLength(2);
      expect(logApiRequestMock).toHaveBeenCalledTimes(1);
      expect(logApiResponseMock).toHaveBeenCalledTimes(1);
      const event = logApiResponseMock.mock.calls[0][1] as ApiResponseEvent;
      expect(event.total_token_count).toBe(25);
      expect(event.prompt_id).toBe('prompt-stream');
      expect(logApiErrorMock).not.toHaveBeenCalled();
    });
  });
});

describe('createContentGeneratorConfig', () => {
  const mockConfig = {
    getModel: vi.fn().mockReturnValue('gemini-pro'),
    setModel: vi.fn(),
    flashFallbackHandler: vi.fn(),
    getProxy: vi.fn(),
  } as unknown as Config;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should configure for Gemini using GEMINI_API_KEY when set', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'env-gemini-key');
    const config = await createContentGeneratorConfig(
      mockConfig,
      AuthType.USE_GEMINI,
    );
    expect(config.apiKey).toBe('env-gemini-key');
    expect(config.vertexai).toBe(false);
  });

  it('should not configure for Gemini if GEMINI_API_KEY is empty', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const config = await createContentGeneratorConfig(
      mockConfig,
      AuthType.USE_GEMINI,
    );
    expect(config.apiKey).toBeUndefined();
    expect(config.vertexai).toBeUndefined();
  });

  it('should configure for Vertex AI using GOOGLE_API_KEY when set', async () => {
    vi.stubEnv('GOOGLE_API_KEY', 'env-google-key');
    const config = await createContentGeneratorConfig(
      mockConfig,
      AuthType.USE_VERTEX_AI,
    );
    expect(config.apiKey).toBe('env-google-key');
    expect(config.vertexai).toBe(true);
  });

  it('should configure for Vertex AI using GCP project and location when set', async () => {
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'env-gcp-project');
    vi.stubEnv('GOOGLE_CLOUD_LOCATION', 'env-gcp-location');
    const config = await createContentGeneratorConfig(
      mockConfig,
      AuthType.USE_VERTEX_AI,
    );
    expect(config.vertexai).toBe(true);
    expect(config.apiKey).toBeUndefined();
  });

  it('should not configure for Vertex AI if required env vars are empty', async () => {
    vi.stubEnv('GOOGLE_API_KEY', '');
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', '');
    vi.stubEnv('GOOGLE_CLOUD_LOCATION', '');
    const config = await createContentGeneratorConfig(
      mockConfig,
      AuthType.USE_VERTEX_AI,
    );
    expect(config.apiKey).toBeUndefined();
    expect(config.vertexai).toBeUndefined();
  });
});

afterEach(() => {
  logApiRequestMock.mockClear();
  logApiResponseMock.mockClear();
  logApiErrorMock.mockClear();
  toContentsMock.mockClear();
});
