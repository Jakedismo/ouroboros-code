/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';
import { darkSemanticColors } from './semantic-tokens.js';

const ouroborosNexusColors: ColorsTheme = {
  type: 'dark',
  Background: '#1A1B23',
  Foreground: '#D4D6F0',
  LightBlue: '#5EEAD4',
  AccentBlue: '#3B82F6',
  AccentPurple: '#A855F7',
  AccentCyan: '#06B6D4',
  AccentGreen: '#22C55E',
  AccentYellow: '#EAB308',
  AccentRed: '#F97316',
  DiffAdded: '#1B3B36',
  DiffRemoved: '#6B1D1D',
  Comment: '#6D7CE4',
  Gray: '#9CA3AF',
  GradientColors: ['#3B82F6', '#A855F7', '#06B6D4', '#22C55E'],
};

export const AtomOneDark: Theme = new Theme(
  'Ouroboros Nexus',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      color: ouroborosNexusColors.Foreground,
      background: ouroborosNexusColors.Background,
    },
    'hljs-comment': {
      color: ouroborosNexusColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: ouroborosNexusColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-doctag': {
      color: ouroborosNexusColors.AccentPurple,
    },
    'hljs-keyword': {
      color: ouroborosNexusColors.AccentPurple,
    },
    'hljs-formula': {
      color: ouroborosNexusColors.AccentPurple,
    },
    'hljs-section': {
      color: ouroborosNexusColors.AccentRed,
    },
    'hljs-name': {
      color: ouroborosNexusColors.AccentRed,
    },
    'hljs-selector-tag': {
      color: ouroborosNexusColors.AccentRed,
    },
    'hljs-deletion': {
      color: ouroborosNexusColors.AccentRed,
    },
    'hljs-subst': {
      color: ouroborosNexusColors.AccentRed,
    },
    'hljs-literal': {
      color: ouroborosNexusColors.AccentCyan,
    },
    'hljs-string': {
      color: ouroborosNexusColors.AccentGreen,
    },
    'hljs-regexp': {
      color: ouroborosNexusColors.AccentGreen,
    },
    'hljs-addition': {
      color: ouroborosNexusColors.AccentGreen,
    },
    'hljs-attribute': {
      color: ouroborosNexusColors.AccentGreen,
    },
    'hljs-meta-string': {
      color: ouroborosNexusColors.AccentGreen,
    },
    'hljs-built_in': {
      color: ouroborosNexusColors.AccentYellow,
    },
    'hljs-class .hljs-title': {
      color: ouroborosNexusColors.AccentYellow,
    },
    'hljs-attr': {
      color: ouroborosNexusColors.AccentYellow,
    },
    'hljs-variable': {
      color: ouroborosNexusColors.AccentYellow,
    },
    'hljs-template-variable': {
      color: ouroborosNexusColors.AccentYellow,
    },
    'hljs-type': {
      color: ouroborosNexusColors.AccentYellow,
    },
    'hljs-selector-class': {
      color: ouroborosNexusColors.AccentYellow,
    },
    'hljs-selector-attr': {
      color: ouroborosNexusColors.AccentYellow,
    },
    'hljs-selector-pseudo': {
      color: ouroborosNexusColors.AccentYellow,
    },
    'hljs-number': {
      color: ouroborosNexusColors.AccentYellow,
    },
    'hljs-symbol': {
      color: ouroborosNexusColors.AccentBlue,
    },
    'hljs-bullet': {
      color: ouroborosNexusColors.AccentBlue,
    },
    'hljs-link': {
      color: ouroborosNexusColors.AccentBlue,
      textDecoration: 'underline',
    },
    'hljs-meta': {
      color: ouroborosNexusColors.AccentBlue,
    },
    'hljs-selector-id': {
      color: ouroborosNexusColors.AccentBlue,
    },
    'hljs-title': {
      color: ouroborosNexusColors.AccentBlue,
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
  },
  ouroborosNexusColors,
  darkSemanticColors,
);