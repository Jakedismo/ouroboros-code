/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ColorsTheme, Theme } from './theme.js';
import { SemanticColors } from './semantic-tokens.js';

/**
 * Ouroboros Infinity Theme - Light theme with amethyst and copper accents
 * Represents the infinite wisdom and continuous renewal
 */
const ouroborosInfinityColors: ColorsTheme = {
  type: 'light',
  Background: '#FBF7F4',  // Warm parchment white
  Foreground: '#2C2416',  // Rich dark brown
  LightBlue: '#87CEEB',   // Sky blue
  AccentBlue: '#5B7C99',  // Steel blue
  AccentPurple: '#8B4789', // Deep amethyst
  AccentCyan: '#4A9B8E',  // Teal green
  AccentGreen: '#6B8E23', // Olive green (nature's cycle)
  AccentYellow: '#B8860B', // Dark goldenrod
  AccentRed: '#CD5C5C',   // Indian red
  DiffAdded: '#E6F3E6',   // Light mint
  DiffRemoved: '#FFE6E6', // Light pink
  Comment: '#8B7355',     // Warm brown
  Gray: '#708090',        // Slate gray
  GradientColors: ['#8B4789', '#B8860B', '#4A9B8E'], // Amethyst → Gold → Teal
};

const ouroborosInfinitySemanticColors: SemanticColors = {
  text: {
    primary: ouroborosInfinityColors.Foreground,
    secondary: ouroborosInfinityColors.Gray,
    link: ouroborosInfinityColors.AccentBlue,
    accent: ouroborosInfinityColors.AccentPurple,
  },
  background: {
    primary: ouroborosInfinityColors.Background,
    diff: {
      added: ouroborosInfinityColors.DiffAdded,
      removed: ouroborosInfinityColors.DiffRemoved,
    },
  },
  border: {
    default: ouroborosInfinityColors.Gray,
    focused: ouroborosInfinityColors.AccentPurple,
  },
  ui: {
    comment: ouroborosInfinityColors.Comment,
    symbol: ouroborosInfinityColors.AccentYellow,
    gradient: ouroborosInfinityColors.GradientColors,
  },
  status: {
    error: ouroborosInfinityColors.AccentRed,
    success: ouroborosInfinityColors.AccentGreen,
    warning: ouroborosInfinityColors.AccentYellow,
  },
};

export const OuroborosInfinity: Theme = new Theme(
  'Ouroboros Infinity',
  'light',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: ouroborosInfinityColors.Background,
      color: ouroborosInfinityColors.Foreground,
    },
    'hljs-keyword': {
      color: ouroborosInfinityColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-literal': {
      color: ouroborosInfinityColors.AccentGreen,
    },
    'hljs-symbol': {
      color: ouroborosInfinityColors.AccentYellow,
    },
    'hljs-name': {
      color: ouroborosInfinityColors.AccentBlue,
    },
    'hljs-link': {
      color: ouroborosInfinityColors.AccentCyan,
      textDecoration: 'underline',
    },
    'hljs-built_in': {
      color: ouroborosInfinityColors.AccentCyan,
    },
    'hljs-type': {
      color: ouroborosInfinityColors.AccentGreen,
    },
    'hljs-number': {
      color: ouroborosInfinityColors.AccentYellow,
    },
    'hljs-class': {
      color: ouroborosInfinityColors.AccentGreen,
      fontWeight: 'bold',
    },
    'hljs-string': {
      color: ouroborosInfinityColors.AccentYellow,
    },
    'hljs-meta-string': {
      color: ouroborosInfinityColors.AccentYellow,
    },
    'hljs-regexp': {
      color: ouroborosInfinityColors.AccentRed,
    },
    'hljs-template-tag': {
      color: ouroborosInfinityColors.AccentRed,
    },
    'hljs-subst': {
      color: ouroborosInfinityColors.Foreground,
    },
    'hljs-function': {
      color: ouroborosInfinityColors.AccentCyan,
    },
    'hljs-title': {
      color: ouroborosInfinityColors.AccentGreen,
    },
    'hljs-params': {
      color: ouroborosInfinityColors.Foreground,
    },
    'hljs-formula': {
      color: ouroborosInfinityColors.Foreground,
    },
    'hljs-comment': {
      color: ouroborosInfinityColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: ouroborosInfinityColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-doctag': {
      color: ouroborosInfinityColors.AccentYellow,
    },
    'hljs-meta': {
      color: ouroborosInfinityColors.Gray,
    },
    'hljs-meta-keyword': {
      color: ouroborosInfinityColors.Gray,
    },
    'hljs-tag': {
      color: ouroborosInfinityColors.AccentPurple,
    },
    'hljs-variable': {
      color: ouroborosInfinityColors.AccentGreen,
    },
    'hljs-template-variable': {
      color: ouroborosInfinityColors.AccentGreen,
    },
    'hljs-attr': {
      color: ouroborosInfinityColors.LightBlue,
    },
    'hljs-attribute': {
      color: ouroborosInfinityColors.LightBlue,
    },
    'hljs-builtin-name': {
      color: ouroborosInfinityColors.AccentCyan,
    },
    'hljs-section': {
      color: ouroborosInfinityColors.AccentYellow,
      fontWeight: 'bold',
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-bullet': {
      color: ouroborosInfinityColors.AccentYellow,
    },
    'hljs-selector-tag': {
      color: ouroborosInfinityColors.AccentPurple,
    },
    'hljs-selector-id': {
      color: ouroborosInfinityColors.AccentGreen,
    },
    'hljs-selector-class': {
      color: ouroborosInfinityColors.AccentYellow,
    },
    'hljs-selector-attr': {
      color: ouroborosInfinityColors.AccentCyan,
    },
    'hljs-selector-pseudo': {
      color: ouroborosInfinityColors.AccentPurple,
    },
    'hljs-addition': {
      backgroundColor: ouroborosInfinityColors.DiffAdded,
      display: 'inline-block',
      width: '100%',
    },
    'hljs-deletion': {
      backgroundColor: ouroborosInfinityColors.DiffRemoved,
      display: 'inline-block',
      width: '100%',
    },
  },
  ouroborosInfinityColors,
  ouroborosInfinitySemanticColors,
);