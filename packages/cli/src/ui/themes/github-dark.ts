/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';
import { darkSemanticColors } from './semantic-tokens.js';

const ouroborosSpiralColors: ColorsTheme = {
  type: 'dark',
  Background: '#0D1117',
  Foreground: '#F0F6FC',
  LightBlue: '#58A6FF',
  AccentBlue: '#1F6FEB',
  AccentPurple: '#D2A8FF',
  AccentCyan: '#39D0D8',
  AccentGreen: '#56D364',
  AccentYellow: '#F2CC60',
  AccentRed: '#FF7B72',
  DiffAdded: '#1B4332',
  DiffRemoved: '#6F2232',
  Comment: '#8B949E',
  Gray: '#7D8590',
  GradientColors: ['#1F6FEB', '#D2A8FF', '#39D0D8', '#56D364'],
};

export const GitHubDark: Theme = new Theme(
  'Ouroboros Spiral',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      color: ouroborosSpiralColors.Foreground,
      background: ouroborosSpiralColors.Background,
    },
    'hljs-comment': {
      color: ouroborosSpiralColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: ouroborosSpiralColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-keyword': {
      color: ouroborosSpiralColors.AccentRed,
      fontWeight: 'bold',
    },
    'hljs-selector-tag': {
      color: ouroborosSpiralColors.AccentRed,
      fontWeight: 'bold',
    },
    'hljs-subst': {
      color: ouroborosSpiralColors.Foreground,
    },
    'hljs-number': {
      color: ouroborosSpiralColors.LightBlue,
    },
    'hljs-literal': {
      color: ouroborosSpiralColors.LightBlue,
    },
    'hljs-variable': {
      color: ouroborosSpiralColors.AccentYellow,
    },
    'hljs-template-variable': {
      color: ouroborosSpiralColors.AccentYellow,
    },
    'hljs-tag .hljs-attr': {
      color: ouroborosSpiralColors.AccentYellow,
    },
    'hljs-string': {
      color: ouroborosSpiralColors.AccentCyan,
    },
    'hljs-doctag': {
      color: ouroborosSpiralColors.AccentCyan,
    },
    'hljs-title': {
      color: ouroborosSpiralColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-section': {
      color: ouroborosSpiralColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-selector-id': {
      color: ouroborosSpiralColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-type': {
      color: ouroborosSpiralColors.AccentGreen,
      fontWeight: 'bold',
    },
    'hljs-class .hljs-title': {
      color: ouroborosSpiralColors.AccentGreen,
      fontWeight: 'bold',
    },
    'hljs-tag': {
      color: ouroborosSpiralColors.AccentGreen,
    },
    'hljs-name': {
      color: ouroborosSpiralColors.AccentGreen,
    },
    'hljs-attribute': {
      color: ouroborosSpiralColors.LightBlue,
    },
    'hljs-regexp': {
      color: ouroborosSpiralColors.AccentCyan,
    },
    'hljs-link': {
      color: ouroborosSpiralColors.AccentCyan,
    },
    'hljs-symbol': {
      color: ouroborosSpiralColors.AccentPurple,
    },
    'hljs-bullet': {
      color: ouroborosSpiralColors.AccentPurple,
    },
    'hljs-built_in': {
      color: ouroborosSpiralColors.LightBlue,
    },
    'hljs-builtin-name': {
      color: ouroborosSpiralColors.LightBlue,
    },
    'hljs-meta': {
      color: ouroborosSpiralColors.LightBlue,
      fontWeight: 'bold',
    },
    'hljs-deletion': {
      background: '#86181D',
      color: ouroborosSpiralColors.AccentRed,
    },
    'hljs-addition': {
      background: '#144620',
      color: ouroborosSpiralColors.AccentGreen,
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
  },
  ouroborosSpiralColors,
  darkSemanticColors,
);