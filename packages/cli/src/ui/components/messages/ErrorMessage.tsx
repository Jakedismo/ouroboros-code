/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text } from 'ink';
import { Colors } from '../../colors.js';

interface ErrorMessageProps {
  text: string;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ text }) => {
  return (
    <Text wrap="wrap" color={Colors.AccentRed}>
      ✕ {text}
    </Text>
  );
};
