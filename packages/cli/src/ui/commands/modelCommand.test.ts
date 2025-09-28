/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('../../utils/events.js', async () => {
  const actual = await vi.importActual<typeof import('../../utils/events.js')>(
    '../../utils/events.js',
  );
  return {
    ...actual,
    appEvents: {
      ...actual.appEvents,
      emit: vi.fn(),
    },
  };
});

import { modelCommand } from './modelCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { appEvents, AppEvent } from '../../utils/events.js';
import type { CommandContext } from './types.js';

const mockedAppEvents = appEvents as unknown as { emit: Mock };

describe('modelCommand', () => {
  let context: CommandContext;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists models for the current OpenAI provider', async () => {
    const setModel = vi.fn().mockResolvedValue(undefined);
    const config = {
      getProvider: () => 'openai',
      getModel: () => 'gpt-5',
      setModel,
    };
    context = createMockCommandContext({
      services: {
        config: config as unknown as CommandContext['services']['config'],
      },
    });
    (context as unknown as { config: typeof config }).config = config;

    if (!modelCommand.action) {
      throw new Error('modelCommand must expose an action');
    }

    await modelCommand.action(context, '');

    expect(setModel).not.toHaveBeenCalled();
    expect(context.ui.addItem).toHaveBeenCalledTimes(1);
    const [{ text }] = (context.ui.addItem as Mock).mock.calls[0];
    expect(text).toContain('gpt-5');
    expect(text).toContain('gpt-5-codex');
    expect(text).not.toContain('claude-opus-4-1-20250805');
  });

  it('switches anthropic provider to claude-sonnet-4-20250514', async () => {
    const setModel = vi.fn().mockResolvedValue(undefined);
    const config = {
      getProvider: () => 'anthropic',
      getModel: () => 'claude-sonnet-4-20250514[1m]',
      setModel,
    };
    context = createMockCommandContext({
      services: {
        config: config as unknown as CommandContext['services']['config'],
      },
    });
    (context as unknown as { config: typeof config }).config = config;

    if (!modelCommand.action) {
      throw new Error('modelCommand must expose an action');
    }

    await modelCommand.action(context, 'claude-sonnet-4-20250514');

    expect(setModel).toHaveBeenCalledWith('claude-sonnet-4-20250514');
    const { calls } = (context.ui.addItem as Mock).mock;
    const successCall = calls.at(-1);
    expect(successCall).toBeDefined();
    const [{ text }] = successCall as [{ text: string }];
    expect(text).toContain('**New Model:** claude-sonnet-4-20250514');

    expect(mockedAppEvents.emit).toHaveBeenCalledWith(AppEvent.ProviderChanged, {
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
    });
  });
});
