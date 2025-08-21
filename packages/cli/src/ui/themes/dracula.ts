/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';
import { darkSemanticColors } from './semantic-tokens.js';

const ouroborosVoidColors: ColorsTheme = {
  type: 'dark',
  Background: '#0B0F1A',
  Foreground: '#E8E3FF',
  LightBlue: '#9D7AEA',
  AccentBlue: '#7C3AED',
  AccentPurple: '#C084FC',
  AccentCyan: '#34D5C9',
  AccentGreen: '#10B981',
  AccentYellow: '#FBBF24',
  AccentRed: '#EF4444',
  DiffAdded: '#1B3B36',
  DiffRemoved: '#6B1D1D',
  Comment: '#6366F1',
  Gray: '#8B8DCD',
  GradientColors: ['#7C3AED', '#C084FC', '#34D5C9', '#FBBF24'],
};

export const Dracula: Theme = new Theme(
  'Ouroboros Void',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: ouroborosVoidColors.Background,
      color: ouroborosVoidColors.Foreground,
    },
    'hljs-keyword': {
      color: ouroborosVoidColors.AccentBlue,
      fontWeight: 'bold',
    },
    'hljs-selector-tag': {
      color: ouroborosVoidColors.AccentBlue,
      fontWeight: 'bold',
    },
    'hljs-literal': {
      color: ouroborosVoidColors.AccentBlue,
      fontWeight: 'bold',
    },
    'hljs-section': {
      color: ouroborosVoidColors.AccentBlue,
      fontWeight: 'bold',
    },
    'hljs-link': {
      color: ouroborosVoidColors.AccentBlue,
    },
    'hljs-function .hljs-keyword': {
      color: ouroborosVoidColors.AccentPurple,
    },
    'hljs-subst': {
      color: ouroborosVoidColors.Foreground,
    },
    'hljs-string': {
      color: ouroborosVoidColors.AccentYellow,
    },
    'hljs-title': {
      color: ouroborosVoidColors.AccentYellow,
      fontWeight: 'bold',
    },
    'hljs-name': {
      color: ouroborosVoidColors.AccentYellow,
      fontWeight: 'bold',
    },
    'hljs-type': {
      color: ouroborosVoidColors.AccentCyan,
      fontWeight: 'bold',
    },
    'hljs-attribute': {
      color: ouroborosVoidColors.AccentYellow,
    },
    'hljs-symbol': {
      color: ouroborosVoidColors.AccentCyan,
    },
    'hljs-bullet': {
      color: ouroborosVoidColors.AccentYellow,
    },
    'hljs-addition': {
      color: ouroborosVoidColors.AccentGreen,
    },
    'hljs-variable': {
      color: ouroborosVoidColors.AccentPurple,
    },
    'hljs-template-tag': {
      color: ouroborosVoidColors.AccentYellow,
    },
    'hljs-template-variable': {
      color: ouroborosVoidColors.AccentPurple,
    },
    'hljs-comment': {
      color: ouroborosVoidColors.Comment,
    },
    'hljs-quote': {
      color: ouroborosVoidColors.Comment,
    },
    'hljs-deletion': {
      color: ouroborosVoidColors.AccentRed,
    },
    'hljs-meta': {
      color: ouroborosVoidColors.Comment,
    },
    'hljs-doctag': {
      fontWeight: 'bold',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
  },
  ouroborosVoidColors,
  darkSemanticColors,
);