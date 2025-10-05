/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import {
  useDesignSystem,
  Surface,
  SectionHeading,
} from '../design-system/index.js';
import type { KeyBinding } from '../../config/keyBindings.js';

export interface CommandHint {
  label: string;
  commandText?: string;
  bindings?: readonly KeyBinding[];
}

interface CommandHintBarProps {
  hints: CommandHint[];
  isCompact?: boolean;
}

const formatKey = (key: string | undefined): string => {
  if (!key) {
    return '';
  }
  if (key.length === 1) {
    return key.toUpperCase();
  }
  return key.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
};

const pickBinding = (bindings: readonly KeyBinding[] | undefined): KeyBinding | undefined => {
  if (!bindings || bindings.length === 0) {
    return undefined;
  }
  const prioritized = bindings.find((binding) => binding.ctrl || binding.command || binding.shift);
  return prioritized ?? bindings[0];
};

const formatBinding = (binding: KeyBinding | undefined): string | undefined => {
  if (!binding) {
    return undefined;
  }
  const parts: string[] = [];
  if (binding.ctrl) {
    parts.push('Ctrl');
  }
  if (binding.shift) {
    parts.push('Shift');
  }
  if (binding.command) {
    parts.push('Cmd');
  }
  const key = formatKey(binding.key);
  if (key) {
    parts.push(key);
  }
  return parts.join('+') || undefined;
};

export const CommandHintBar: React.FC<CommandHintBarProps> = ({
  hints,
  isCompact = false,
}) => {
  const design = useDesignSystem();

  if (!hints.length) {
    return null;
  }

  return (
    <Surface
      width="100%"
      marginTop={1}
      paddingY={0}
      borderTone="accent"
    >
      <SectionHeading icon="⌨️" text="Hints" />
      <Box flexDirection={isCompact ? 'column' : 'row'}>
        {hints.map((hint, index) => {
          const binding = formatBinding(pickBinding(hint.bindings));
          const value = hint.commandText ?? binding;
          if (!value) {
            return null;
          }
          return (
            <Box
              key={`${hint.label}-${value}`}
              marginRight={
                !isCompact && index < hints.length - 1
                  ? design.spacing.sm
                  : design.spacing.none
              }
              marginBottom={isCompact && index < hints.length - 1 ? 1 : 0}
            >
              <Text color={design.colors.text.muted}>{hint.label}: </Text>
              <Text color={design.colors.text.link}>{value}</Text>
            </Box>
          );
        })}
      </Box>
    </Surface>
  );
};
