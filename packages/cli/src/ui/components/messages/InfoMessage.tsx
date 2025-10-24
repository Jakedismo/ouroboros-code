/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text } from 'ink';
import { Colors } from '../../colors.js';
import { RenderInline } from '../../utils/InlineMarkdownRenderer.js';

interface InfoMessageProps {
  text: string;
}

export const InfoMessage: React.FC<InfoMessageProps> = ({ text }) => {
  return (
    <Text wrap="wrap" color={Colors.AccentYellow}>
      ℹ <RenderInline text={text} />
    </Text>
  );
};
