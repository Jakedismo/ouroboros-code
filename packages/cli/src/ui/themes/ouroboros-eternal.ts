/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ColorsTheme, Theme } from './theme.js';
import { SemanticColors } from './semantic-tokens.js';

/**
 * Ouroboros Eternal Theme - Dark theme with emerald and gold accents
 * Represents the eternal cycle of the serpent with rich, mystical colors
 */
const ouroborosEternalColors: ColorsTheme = {
  type: 'dark',
  Background: '#0A0E1A',  // Deep midnight blue
  Foreground: '#E8E2D5',  // Warm off-white
  LightBlue: '#6FAADB',   // Sky blue
  AccentBlue: '#4A90E2',  // Bright blue
  AccentPurple: '#9B59B6', // Royal purple
  AccentCyan: '#50E3C2',  // Bright cyan/turquoise
  AccentGreen: '#50C878', // Emerald green (the serpent)
  AccentYellow: '#FFD700', // Gold (the crown/wisdom)
  AccentRed: '#E74C3C',   // Crimson
  DiffAdded: '#1B3A2F',   // Dark emerald for additions
  DiffRemoved: '#3A1B1B', // Dark crimson for removals
  Comment: '#7B8FA6',     // Muted blue-gray
  Gray: '#95A5A6',        // Silver gray
  GradientColors: ['#50C878', '#FFD700', '#9B59B6'], // Emerald → Gold → Purple
};

const ouroborosEternalSemanticColors: SemanticColors = {
  text: {
    primary: ouroborosEternalColors.Foreground,
    secondary: ouroborosEternalColors.Gray,
    link: ouroborosEternalColors.AccentCyan,
    accent: ouroborosEternalColors.AccentGreen,
  },
  background: {
    primary: ouroborosEternalColors.Background,
    diff: {
      added: ouroborosEternalColors.DiffAdded,
      removed: ouroborosEternalColors.DiffRemoved,
    },
  },
  border: {
    default: ouroborosEternalColors.Gray,
    focused: ouroborosEternalColors.AccentGreen,
  },
  ui: {
    comment: ouroborosEternalColors.Comment,
    symbol: ouroborosEternalColors.AccentYellow,
    gradient: ouroborosEternalColors.GradientColors,
  },
  status: {
    error: ouroborosEternalColors.AccentRed,
    success: ouroborosEternalColors.AccentGreen,
    warning: ouroborosEternalColors.AccentYellow,
  },
};

export const OuroborosEternal: Theme = new Theme(
  'Ouroboros Eternal',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: ouroborosEternalColors.Background,
      color: ouroborosEternalColors.Foreground,
    },
    'hljs-keyword': {
      color: ouroborosEternalColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-literal': {
      color: ouroborosEternalColors.AccentGreen,
    },
    'hljs-symbol': {
      color: ouroborosEternalColors.AccentYellow,
    },
    'hljs-name': {
      color: ouroborosEternalColors.AccentBlue,
    },
    'hljs-link': {
      color: ouroborosEternalColors.AccentCyan,
      textDecoration: 'underline',
    },
    'hljs-built_in': {
      color: ouroborosEternalColors.AccentCyan,
    },
    'hljs-type': {
      color: ouroborosEternalColors.AccentGreen,
    },
    'hljs-number': {
      color: ouroborosEternalColors.AccentYellow,
    },
    'hljs-class': {
      color: ouroborosEternalColors.AccentGreen,
      fontWeight: 'bold',
    },
    'hljs-string': {
      color: ouroborosEternalColors.AccentYellow,
    },
    'hljs-meta-string': {
      color: ouroborosEternalColors.AccentYellow,
    },
    'hljs-regexp': {
      color: ouroborosEternalColors.AccentRed,
    },
    'hljs-template-tag': {
      color: ouroborosEternalColors.AccentRed,
    },
    'hljs-subst': {
      color: ouroborosEternalColors.Foreground,
    },
    'hljs-function': {
      color: ouroborosEternalColors.AccentCyan,
    },
    'hljs-title': {
      color: ouroborosEternalColors.AccentGreen,
    },
    'hljs-params': {
      color: ouroborosEternalColors.Foreground,
    },
    'hljs-formula': {
      color: ouroborosEternalColors.Foreground,
    },
    'hljs-comment': {
      color: ouroborosEternalColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: ouroborosEternalColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-doctag': {
      color: ouroborosEternalColors.AccentYellow,
    },
    'hljs-meta': {
      color: ouroborosEternalColors.Gray,
    },
    'hljs-meta-keyword': {
      color: ouroborosEternalColors.Gray,
    },
    'hljs-tag': {
      color: ouroborosEternalColors.AccentPurple,
    },
    'hljs-variable': {
      color: ouroborosEternalColors.AccentGreen,
    },
    'hljs-template-variable': {
      color: ouroborosEternalColors.AccentGreen,
    },
    'hljs-attr': {
      color: ouroborosEternalColors.LightBlue,
    },
    'hljs-attribute': {
      color: ouroborosEternalColors.LightBlue,
    },
    'hljs-builtin-name': {
      color: ouroborosEternalColors.AccentCyan,
    },
    'hljs-section': {
      color: ouroborosEternalColors.AccentYellow,
      fontWeight: 'bold',
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-bullet': {
      color: ouroborosEternalColors.AccentYellow,
    },
    'hljs-selector-tag': {
      color: ouroborosEternalColors.AccentPurple,
    },
    'hljs-selector-id': {
      color: ouroborosEternalColors.AccentGreen,
    },
    'hljs-selector-class': {
      color: ouroborosEternalColors.AccentYellow,
    },
    'hljs-selector-attr': {
      color: ouroborosEternalColors.AccentCyan,
    },
    'hljs-selector-pseudo': {
      color: ouroborosEternalColors.AccentPurple,
    },
    'hljs-addition': {
      backgroundColor: ouroborosEternalColors.DiffAdded,
      display: 'inline-block',
      width: '100%',
    },
    'hljs-deletion': {
      backgroundColor: ouroborosEternalColors.DiffRemoved,
      display: 'inline-block',
      width: '100%',
    },
  },
  ouroborosEternalColors,
  ouroborosEternalSemanticColors,
);