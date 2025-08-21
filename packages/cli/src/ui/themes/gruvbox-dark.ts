/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';
import { darkSemanticColors } from './semantic-tokens.js';

const gruvboxDarkColors: ColorsTheme = {
  type: 'dark',
  Background: '#282828',
  Foreground: '#ebdbb2',
  LightBlue: '#83a598',
  AccentBlue: '#458588',
  AccentPurple: '#b16286',
  AccentCyan: '#689d6a',
  AccentGreen: '#98971a',
  AccentYellow: '#d79921',
  AccentRed: '#cc241d',
  DiffAdded: '#3c3a24',
  DiffRemoved: '#442323',
  Comment: '#928374',
  Gray: '#a89984',
  GradientColors: ['#458588', '#689d6a', '#98971a', '#d79921'],
};

export const GruvboxDark: Theme = new Theme(
  'Gruvbox Dark',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: gruvboxDarkColors.Background,
      color: gruvboxDarkColors.Foreground,
    },
    'hljs-keyword': {
      color: gruvboxDarkColors.AccentRed,
      fontWeight: 'bold',
    },
    'hljs-selector-tag': {
      color: gruvboxDarkColors.AccentRed,
      fontWeight: 'bold',
    },
    'hljs-literal': {
      color: gruvboxDarkColors.AccentPurple,
    },
    'hljs-section': {
      color: gruvboxDarkColors.AccentYellow,
      fontWeight: 'bold',
    },
    'hljs-link': {
      color: gruvboxDarkColors.AccentBlue,
    },
    'hljs-function .hljs-keyword': {
      color: gruvboxDarkColors.AccentCyan,
    },
    'hljs-subst': {
      color: gruvboxDarkColors.Foreground,
    },
    'hljs-string': {
      color: gruvboxDarkColors.AccentGreen,
    },
    'hljs-title': {
      color: gruvboxDarkColors.AccentYellow,
      fontWeight: 'bold',
    },
    'hljs-name': {
      color: gruvboxDarkColors.AccentBlue,
      fontWeight: 'bold',
    },
    'hljs-type': {
      color: gruvboxDarkColors.AccentYellow,
    },
    'hljs-attribute': {
      color: gruvboxDarkColors.AccentCyan,
    },
    'hljs-symbol': {
      color: gruvboxDarkColors.AccentPurple,
    },
    'hljs-bullet': {
      color: gruvboxDarkColors.AccentYellow,
    },
    'hljs-addition': {
      color: gruvboxDarkColors.AccentGreen,
    },
    'hljs-variable': {
      color: gruvboxDarkColors.AccentBlue,
    },
    'hljs-template-tag': {
      color: gruvboxDarkColors.AccentRed,
    },
    'hljs-template-variable': {
      color: gruvboxDarkColors.AccentBlue,
    },
    'hljs-comment': {
      color: gruvboxDarkColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: gruvboxDarkColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-deletion': {
      color: gruvboxDarkColors.AccentRed,
    },
    'hljs-meta': {
      color: gruvboxDarkColors.Comment,
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
    'hljs-number': {
      color: gruvboxDarkColors.AccentPurple,
    },
    'hljs-built_in': {
      color: gruvboxDarkColors.AccentYellow,
    },
    'hljs-class .hljs-title': {
      color: gruvboxDarkColors.AccentCyan,
    },
    'hljs-regexp': {
      color: gruvboxDarkColors.AccentCyan,
    },
  },
  gruvboxDarkColors,
  darkSemanticColors,
);