/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageType } from '../types.js';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import { appEvents, AppEvent } from '../../utils/events.js';

type LayoutTarget = 'sidebar' | 'activity';
type LayoutAction = 'show' | 'hide' | 'toggle';

const parseLayoutArgs = (
  context: CommandContext,
  args: string,
): { target?: LayoutTarget; action: LayoutAction } => {
  const raw = context.invocation?.raw?.toLowerCase() ?? '';

  if (raw.startsWith('/showsidebar')) {
    return { target: 'sidebar', action: 'show' };
  }
  if (raw.startsWith('/hidesidebar')) {
    return { target: 'sidebar', action: 'hide' };
  }
  if (raw.startsWith('/togglesidebar')) {
    return { target: 'sidebar', action: 'toggle' };
  }
  if (raw.startsWith('/showactivity')) {
    return { target: 'activity', action: 'show' };
  }
  if (raw.startsWith('/hideactivity')) {
    return { target: 'activity', action: 'hide' };
  }
  if (raw.startsWith('/toggleactivity')) {
    return { target: 'activity', action: 'toggle' };
  }

  const [rawTarget, rawAction] = args.trim().split(/\s+/).filter(Boolean);

  let target: LayoutTarget | undefined;
  if (rawTarget === 'sidebar' || rawTarget === 'activity') {
    target = rawTarget;
  }

  let action: LayoutAction = 'toggle';
  if (rawAction === 'show' || rawAction === 'hide' || rawAction === 'toggle') {
    action = rawAction;
  }

  return { target, action };
};

const emitLayoutEvent = (target: LayoutTarget, action: LayoutAction) => {
  if (target === 'sidebar') {
    appEvents.emit(AppEvent.ToggleSidebar, action);
  } else {
    appEvents.emit(AppEvent.ToggleActivityRail, action);
  }
};

export const layoutCommand: SlashCommand = {
  name: 'layout',
  altNames: [
    'showsidebar',
    'hidesidebar',
    'togglesidebar',
    'showactivity',
    'hideactivity',
    'toggleactivity',
  ],
  description:
    'Control the CLI layout. Usage: /layout <sidebar|activity> [show|hide|toggle]',
  kind: CommandKind.BUILT_IN,
  action: (context: CommandContext, args: string) => {
    const { target, action } = parseLayoutArgs(context, args);

    if (!target) {
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text:
            'Usage: /layout <sidebar|activity> [show|hide|toggle]\nAliases: /showsidebar, /hidesidebar, /toggleactivity, /showactivity, /hideactivity.',
        },
        Date.now(),
      );
      return;
    }

    emitLayoutEvent(target, action);

    const targetLabel = target === 'sidebar' ? 'Sidebar' : 'Recent activity';
    const actionLabel =
      action === 'toggle'
        ? 'toggled'
        : action === 'show'
          ? 'shown'
          : 'hidden';

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: `✅ ${targetLabel} ${actionLabel}.`,
      },
      Date.now(),
    );
  },
};
