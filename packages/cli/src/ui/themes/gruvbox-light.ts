/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';
import { lightSemanticColors } from './semantic-tokens.js';

const gruvboxLightColors: ColorsTheme = {
  type: 'light',
  Background: '#fbf1c7',
  Foreground: '#3c3836',
  LightBlue: '#076678',
  AccentBlue: '#458588',
  AccentPurple: '#8f3f71',
  AccentCyan: '#427b58',
  AccentGreen: '#79740e',
  AccentYellow: '#b57614',
  AccentRed: '#9d0006',
  DiffAdded: '#e8e4b0',
  DiffRemoved: '#f2d5c9',
  Comment: '#928374',
  Gray: '#7c6f64',
  GradientColors: ['#458588', '#427b58', '#79740e', '#b57614'],
};

export const GruvboxLight: Theme = new Theme(
  'Gruvbox Light',
  'light',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: gruvboxLightColors.Background,
      color: gruvboxLightColors.Foreground,
    },
    'hljs-keyword': {
      color: gruvboxLightColors.AccentRed,
      fontWeight: 'bold',
    },
    'hljs-selector-tag': {
      color: gruvboxLightColors.AccentRed,
      fontWeight: 'bold',
    },
    'hljs-literal': {
      color: gruvboxLightColors.AccentPurple,
    },
    'hljs-section': {
      color: gruvboxLightColors.AccentYellow,
      fontWeight: 'bold',
    },
    'hljs-link': {
      color: gruvboxLightColors.AccentBlue,
    },
    'hljs-function .hljs-keyword': {
      color: gruvboxLightColors.AccentCyan,
    },
    'hljs-subst': {
      color: gruvboxLightColors.Foreground,
    },
    'hljs-string': {
      color: gruvboxLightColors.AccentGreen,
    },
    'hljs-title': {
      color: gruvboxLightColors.AccentYellow,
      fontWeight: 'bold',
    },
    'hljs-name': {
      color: gruvboxLightColors.AccentBlue,
      fontWeight: 'bold',
    },
    'hljs-type': {
      color: gruvboxLightColors.AccentYellow,
    },
    'hljs-attribute': {
      color: gruvboxLightColors.AccentCyan,
    },
    'hljs-symbol': {
      color: gruvboxLightColors.AccentPurple,
    },
    'hljs-bullet': {
      color: gruvboxLightColors.AccentYellow,
    },
    'hljs-addition': {
      color: gruvboxLightColors.AccentGreen,
    },
    'hljs-variable': {
      color: gruvboxLightColors.AccentBlue,
    },
    'hljs-template-tag': {
      color: gruvboxLightColors.AccentRed,
    },
    'hljs-template-variable': {
      color: gruvboxLightColors.AccentBlue,
    },
    'hljs-comment': {
      color: gruvboxLightColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: gruvboxLightColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-deletion': {
      color: gruvboxLightColors.AccentRed,
    },
    'hljs-meta': {
      color: gruvboxLightColors.Comment,
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
      color: gruvboxLightColors.AccentPurple,
    },
    'hljs-built_in': {
      color: gruvboxLightColors.AccentYellow,
    },
    'hljs-class .hljs-title': {
      color: gruvboxLightColors.AccentCyan,
    },
    'hljs-regexp': {
      color: gruvboxLightColors.AccentCyan,
    },
  },
  gruvboxLightColors,
  lightSemanticColors,
);