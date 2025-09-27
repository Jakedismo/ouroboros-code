/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Content } from '../runtime/genaiCompat.js';
import type { AgentsClient } from '../core/agentsClient.js';
import { checkNextSpeaker } from './nextSpeakerChecker.js';

const abortSignal = new AbortController().signal;

describe('checkNextSpeaker', () => {
  let generateJson: ReturnType<typeof vi.fn>;
  let getCuratedHistory: ReturnType<typeof vi.fn>;
  let getHistory: ReturnType<typeof vi.fn>;
  let agentsClient: AgentsClient;

  const setHistories = (curated: Content[], comprehensive?: Content[]) => {
    getCuratedHistory.mockReturnValue(curated);
    getHistory.mockReturnValue(comprehensive ?? curated);
  };

  beforeEach(() => {
    generateJson = vi.fn();
    getCuratedHistory = vi.fn();
    getHistory = vi.fn();
    agentsClient = {
      generateJson,
      getCuratedHistory,
      getHistory,
    } as unknown as AgentsClient;
  });

  it('returns null when history is empty', async () => {
    setHistories([], []);
    const result = await checkNextSpeaker(agentsClient, abortSignal);
    expect(result).toBeNull();
    expect(generateJson).not.toHaveBeenCalled();
  });

  it('returns model when last comprehensive message is a function response', async () => {
    setHistories(
      [
        { role: 'model', parts: [{ text: 'I will call a tool' }] },
      ],
      [
        { role: 'user', parts: [{ text: 'Please do X' }] },
        {
          role: 'user',
          parts: [
            {
              functionResponse: { name: 'tool', response: { ok: true } },
            },
          ],
        },
      ],
    );

    const result = await checkNextSpeaker(agentsClient, abortSignal);
    expect(result).toEqual({
      reasoning:
        'The last message was a function response, so the model should speak next.',
      next_speaker: 'model',
    });
    expect(generateJson).not.toHaveBeenCalled();
  });

  it('invokes AgentsClient.generateJson when analysis is required', async () => {
    setHistories([
      {
        role: 'model',
        parts: [{ text: 'What would you like me to do next?' }],
      },
    ]);

    generateJson.mockResolvedValue({
      reasoning: 'Waiting for the user.',
      next_speaker: 'user',
    });

    const response = await checkNextSpeaker(agentsClient, abortSignal, {
      getModel: () => 'gpt-5',
    } as unknown as Parameters<typeof checkNextSpeaker>[2]);

    expect(generateJson).toHaveBeenCalled();
    expect(response).toEqual({
      reasoning: 'Waiting for the user.',
      next_speaker: 'user',
    });
  });
});
