/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';
import { darkSemanticColors } from './semantic-tokens.js';

const ayuMirageColors: ColorsTheme = {
  type: 'dark',
  Background: '#1F2430',
  Foreground: '#CBCCC6',
  LightBlue: '#5CCFE6',
  AccentBlue: '#36A3D9',
  AccentPurple: '#E57FD8',
  AccentCyan: '#95E6CB',
  AccentGreen: '#B8CC52',
  AccentYellow: '#FFD100',
  AccentRed: '#FF3333',
  DiffAdded: '#273732',
  DiffRemoved: '#3E2835',
  Comment: '#5C6773',
  Gray: '#707A8C',
  GradientColors: ['#36A3D9', '#95E6CB', '#B8CC52', '#FFD100'],
};

export const AyuMirage: Theme = new Theme(
  'Ayu Mirage',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: ayuMirageColors.Background,
      color: ayuMirageColors.Foreground,
    },
    'hljs-keyword': {
      color: ayuMirageColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-selector-tag': {
      color: ayuMirageColors.AccentRed,
      fontWeight: 'bold',
    },
    'hljs-literal': {
      color: ayuMirageColors.AccentPurple,
    },
    'hljs-section': {
      color: ayuMirageColors.AccentBlue,
      fontWeight: 'bold',
    },
    'hljs-link': {
      color: ayuMirageColors.AccentCyan,
    },
    'hljs-function .hljs-keyword': {
      color: ayuMirageColors.AccentPurple,
    },
    'hljs-subst': {
      color: ayuMirageColors.Foreground,
    },
    'hljs-string': {
      color: ayuMirageColors.AccentGreen,
    },
    'hljs-title': {
      color: ayuMirageColors.AccentYellow,
      fontWeight: 'bold',
    },
    'hljs-name': {
      color: ayuMirageColors.AccentBlue,
      fontWeight: 'bold',
    },
    'hljs-type': {
      color: ayuMirageColors.AccentCyan,
    },
    'hljs-attribute': {
      color: ayuMirageColors.AccentYellow,
    },
    'hljs-symbol': {
      color: ayuMirageColors.AccentPurple,
    },
    'hljs-bullet': {
      color: ayuMirageColors.AccentYellow,
    },
    'hljs-addition': {
      color: ayuMirageColors.AccentGreen,
    },
    'hljs-variable': {
      color: ayuMirageColors.AccentCyan,
    },
    'hljs-template-tag': {
      color: ayuMirageColors.AccentRed,
    },
    'hljs-template-variable': {
      color: ayuMirageColors.AccentCyan,
    },
    'hljs-comment': {
      color: ayuMirageColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: ayuMirageColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-deletion': {
      color: ayuMirageColors.AccentRed,
    },
    'hljs-meta': {
      color: ayuMirageColors.Comment,
    },
    'hljs-doctag': {
      fontWeight: 'bold',
      color: ayuMirageColors.AccentYellow,
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-number': {
      color: ayuMirageColors.AccentPurple,
    },
    'hljs-built_in': {
      color: ayuMirageColors.AccentYellow,
    },
    'hljs-class .hljs-title': {
      color: ayuMirageColors.AccentBlue,
    },
    'hljs-regexp': {
      color: ayuMirageColors.AccentCyan,
    },
    'hljs-params': {
      color: ayuMirageColors.Foreground,
    },
    'hljs-tag': {
      color: ayuMirageColors.AccentRed,
    },
    'hljs-tag .hljs-name': {
      color: ayuMirageColors.AccentRed,
    },
    'hljs-tag .hljs-attr': {
      color: ayuMirageColors.AccentYellow,
    },
  },
  ayuMirageColors,
  darkSemanticColors,
);