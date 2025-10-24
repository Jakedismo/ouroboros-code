/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';

export interface ProgressBarProps {
  readonly percent: number;
  readonly leftPad?: number;
  readonly rightPad?: number;
  readonly barWidth?: number;
  readonly barCharacter?: string;
  readonly barColor?: string;
  readonly backgroundColor?: string;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const DEFAULT_EMPTY_CHARACTER = '░';

const repeat = (character: string, count: number): string =>
  count > 0 ? character.repeat(count) : '';

export const ProgressBar: React.FC<ProgressBarProps> = ({
  percent,
  leftPad = 0,
  rightPad = 0,
  barWidth,
  barCharacter = '█',
  barColor,
  backgroundColor,
}) => {
  const columns =
    typeof barWidth === 'number' && barWidth > 0
      ? Math.floor(barWidth)
      : Math.max(
          0,
          (process.stdout?.columns ?? 80) - Math.max(0, leftPad) - Math.max(0, rightPad),
        );

  const normalized = Number.isFinite(percent) ? clamp(percent, 0, 1) : 0;
  const filledColumns = Math.round(columns * normalized);
  const emptyColumns = Math.max(columns - filledColumns, 0);

  return (
    <Box flexDirection="row">
      {leftPad > 0 ? <Text>{repeat(' ', leftPad)}</Text> : null}
      {filledColumns > 0 ? (
        <Text color={barColor}>{repeat(barCharacter, filledColumns)}</Text>
      ) : null}
      {emptyColumns > 0 ? (
        <Text color={backgroundColor}>
          {repeat(DEFAULT_EMPTY_CHARACTER, emptyColumns)}
        </Text>
      ) : null}
      {rightPad > 0 ? <Text>{repeat(' ', rightPad)}</Text> : null}
    </Box>
  );
};

export default ProgressBar;
