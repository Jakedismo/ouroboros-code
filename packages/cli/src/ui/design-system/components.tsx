/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PropsWithChildren } from 'react';
import { Box, type BoxProps, Text } from 'ink';
import { useDesignSystem } from './index.js';

export type SurfaceVariant = 'base' | 'elevated' | 'sunken' | 'transparent';
export type SurfaceBorderTone =
  | 'none'
  | 'default'
  | 'accent'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger';

export interface SurfaceProps
  extends PropsWithChildren<
    BoxProps & {
      variant?: SurfaceVariant;
      borderTone?: SurfaceBorderTone;
    }
  > {}

const resolveBackgroundColor = (
  variant: SurfaceVariant,
  baseColors: ReturnType<typeof useDesignSystem>['colors']['surface'],
): string | undefined => {
  switch (variant) {
    case 'base':
      return baseColors.base;
    case 'sunken':
      return baseColors.sunken;
    case 'elevated':
      return baseColors.elevated;
    case 'transparent':
    default:
      return undefined;
  }
};

const resolveBorderColor = (
  tone: SurfaceBorderTone,
  design: ReturnType<typeof useDesignSystem>,
): string | undefined => {
  switch (tone) {
    case 'none':
      return undefined;
    case 'accent':
      return design.colors.text.accent;
    case 'info':
      return design.colors.status.info;
    case 'success':
      return design.colors.status.success;
    case 'warning':
      return design.colors.status.warning;
    case 'danger':
      return design.colors.status.error;
    case 'default':
    default:
      return design.colors.surface.border;
  }
};

export const Surface = ({
  variant = 'elevated',
  borderTone = 'default',
  children,
  borderStyle,
  borderColor,
  backgroundColor,
  paddingX,
  paddingY,
  ...rest
}: SurfaceProps) => {
  const design = useDesignSystem();
  const resolvedBackgroundColor =
    backgroundColor ?? resolveBackgroundColor(variant, design.colors.surface);
  const resolvedBorderColor =
    borderColor ?? resolveBorderColor(borderTone, design);
  const resolvedBorderStyle =
    borderTone === 'none' && borderStyle === undefined
      ? undefined
      : borderStyle ?? 'round';

  return (
    <Box
      borderStyle={resolvedBorderStyle}
      borderColor={resolvedBorderColor}
      backgroundColor={resolvedBackgroundColor}
      paddingX={paddingX ?? design.spacing.sm}
      paddingY={paddingY ?? 0}
      {...rest}
    >
      {children}
    </Box>
  );
};

export type SectionHeadingTone =
  | 'accent'
  | 'muted'
  | 'default'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger';

export interface SectionHeadingProps {
  readonly icon?: string;
  readonly text: string;
  readonly tone?: SectionHeadingTone;
}

const resolveHeadingColor = (
  tone: SectionHeadingTone,
  design: ReturnType<typeof useDesignSystem>,
): string => {
  switch (tone) {
    case 'muted':
      return design.colors.text.muted;
    case 'info':
      return design.colors.status.info;
    case 'success':
      return design.colors.status.success;
    case 'warning':
      return design.colors.status.warning;
    case 'danger':
      return design.colors.status.error;
    case 'accent':
      return design.colors.text.accent;
    case 'default':
    default:
      return design.colors.text.primary;
  }
};

export const SectionHeading = ({
  icon,
  text,
  tone = 'accent',
}: SectionHeadingProps) => {
  const design = useDesignSystem();
  const color = resolveHeadingColor(tone, design);
  const content =
    design.typography.label.transform === 'uppercase'
      ? text.toUpperCase()
      : text;

  return (
    <Text color={color}>
      {icon ? `${icon} ` : ''}
      {content}
    </Text>
  );
};
