/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';
import { darkSemanticColors } from './semantic-tokens.js';

const ouroborosAuroraColors: ColorsTheme = {
  type: 'dark',
  Background: '#1A0B2E',
  Foreground: '#E1E5FE',
  LightBlue: '#7DD3FC',
  AccentBlue: '#3B82F6',
  AccentPurple: '#A855F7',
  AccentCyan: '#22D3EE',
  AccentGreen: '#34D399',
  AccentYellow: '#FBBF24',
  AccentRed: '#F472B6',
  DiffAdded: '#1B4A3A',
  DiffRemoved: '#6B1D2A',
  Comment: '#9333EA',
  Gray: '#A78BFA',
  GradientColors: ['#3B82F6', '#A855F7', '#F472B6', '#22D3EE', '#34D399'],
};

export const ShadesOfPurple: Theme = new Theme(
  'Ouroboros Aurora',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      color: ouroborosAuroraColors.Foreground,
      background: ouroborosAuroraColors.Background,
    },
    'hljs-comment': {
      color: ouroborosAuroraColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: ouroborosAuroraColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-keyword': {
      color: ouroborosAuroraColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-selector-tag': {
      color: ouroborosAuroraColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-literal': {
      color: ouroborosAuroraColors.AccentBlue,
    },
    'hljs-section': {
      color: ouroborosAuroraColors.AccentRed,
      fontWeight: 'bold',
    },
    'hljs-link': {
      color: ouroborosAuroraColors.AccentBlue,
    },
    'hljs-subst': {
      color: ouroborosAuroraColors.Foreground,
    },
    'hljs-string': {
      color: ouroborosAuroraColors.AccentGreen,
    },
    'hljs-title': {
      color: ouroborosAuroraColors.AccentYellow,
      fontWeight: 'bold',
    },
    'hljs-name': {
      color: ouroborosAuroraColors.AccentRed,
      fontWeight: 'bold',
    },
    'hljs-type': {
      color: ouroborosAuroraColors.AccentCyan,
      fontWeight: 'bold',
    },
    'hljs-attribute': {
      color: ouroborosAuroraColors.AccentYellow,
    },
    'hljs-symbol': {
      color: ouroborosAuroraColors.AccentCyan,
    },
    'hljs-bullet': {
      color: ouroborosAuroraColors.AccentRed,
    },
    'hljs-addition': {
      color: ouroborosAuroraColors.AccentGreen,
    },
    'hljs-variable': {
      color: ouroborosAuroraColors.AccentRed,
    },
    'hljs-template-tag': {
      color: ouroborosAuroraColors.AccentYellow,
    },
    'hljs-template-variable': {
      color: ouroborosAuroraColors.AccentRed,
    },
    'hljs-deletion': {
      color: ouroborosAuroraColors.AccentRed,
    },
    'hljs-meta': {
      color: ouroborosAuroraColors.Comment,
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
      color: ouroborosAuroraColors.LightBlue,
    },
    'hljs-regexp': {
      color: ouroborosAuroraColors.AccentGreen,
    },
    'hljs-built_in': {
      color: ouroborosAuroraColors.AccentCyan,
    },
    'hljs-class .hljs-title': {
      color: ouroborosAuroraColors.AccentYellow,
      fontWeight: 'bold',
    },
    'hljs-function .hljs-title': {
      color: ouroborosAuroraColors.AccentBlue,
    },
  },
  ouroborosAuroraColors,
  darkSemanticColors,
);