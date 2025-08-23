/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ColorsTheme, Theme } from './theme.js';
import { SemanticColors } from './semantic-tokens.js';

/**
 * Ouroboros Cosmic Theme - Dark theme with nebula and stardust colors
 * Represents the cosmic cycle and universal renewal
 */
const ouroborosCosmicColors: ColorsTheme = {
  type: 'dark',
  Background: '#0F0817',  // Deep space purple-black
  Foreground: '#E6E1F5',  // Soft lavender white
  LightBlue: '#B794F6',   // Light purple
  AccentBlue: '#667EEA',  // Indigo blue
  AccentPurple: '#ED64A6', // Hot pink
  AccentCyan: '#4FD1C5',  // Mint cyan
  AccentGreen: '#48BB78', // Jade green
  AccentYellow: '#F6E05E', // Cosmic gold
  AccentRed: '#FC8181',   // Coral pink
  DiffAdded: '#1A202C',   // Dark space blue
  DiffRemoved: '#2D1B2E', // Dark purple
  Comment: '#A78BFA',     // Soft purple
  Gray: '#9CA3AF',        // Cool gray
  GradientColors: ['#667EEA', '#ED64A6', '#4FD1C5', '#F6E05E'], // Nebula gradient
};

const ouroborosCosmicSemanticColors: SemanticColors = {
  text: {
    primary: ouroborosCosmicColors.Foreground,
    secondary: ouroborosCosmicColors.Gray,
    link: ouroborosCosmicColors.AccentCyan,
    accent: ouroborosCosmicColors.AccentPurple,
  },
  background: {
    primary: ouroborosCosmicColors.Background,
    diff: {
      added: ouroborosCosmicColors.DiffAdded,
      removed: ouroborosCosmicColors.DiffRemoved,
    },
  },
  border: {
    default: ouroborosCosmicColors.Gray,
    focused: ouroborosCosmicColors.AccentPurple,
  },
  ui: {
    comment: ouroborosCosmicColors.Comment,
    symbol: ouroborosCosmicColors.AccentYellow,
    gradient: ouroborosCosmicColors.GradientColors,
  },
  status: {
    error: ouroborosCosmicColors.AccentRed,
    success: ouroborosCosmicColors.AccentGreen,
    warning: ouroborosCosmicColors.AccentYellow,
  },
};

export const OuroborosCosmic: Theme = new Theme(
  'Ouroboros Cosmic',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: ouroborosCosmicColors.Background,
      color: ouroborosCosmicColors.Foreground,
    },
    'hljs-keyword': {
      color: ouroborosCosmicColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-literal': {
      color: ouroborosCosmicColors.AccentBlue,
    },
    'hljs-symbol': {
      color: ouroborosCosmicColors.AccentYellow,
    },
    'hljs-name': {
      color: ouroborosCosmicColors.AccentCyan,
    },
    'hljs-link': {
      color: ouroborosCosmicColors.AccentCyan,
      textDecoration: 'underline',
    },
    'hljs-built_in': {
      color: ouroborosCosmicColors.AccentCyan,
    },
    'hljs-type': {
      color: ouroborosCosmicColors.AccentBlue,
    },
    'hljs-number': {
      color: ouroborosCosmicColors.AccentYellow,
    },
    'hljs-class': {
      color: ouroborosCosmicColors.AccentGreen,
      fontWeight: 'bold',
    },
    'hljs-string': {
      color: ouroborosCosmicColors.AccentYellow,
    },
    'hljs-meta-string': {
      color: ouroborosCosmicColors.AccentYellow,
    },
    'hljs-regexp': {
      color: ouroborosCosmicColors.AccentRed,
    },
    'hljs-template-tag': {
      color: ouroborosCosmicColors.AccentRed,
    },
    'hljs-subst': {
      color: ouroborosCosmicColors.Foreground,
    },
    'hljs-function': {
      color: ouroborosCosmicColors.AccentPurple,
    },
    'hljs-title': {
      color: ouroborosCosmicColors.AccentCyan,
    },
    'hljs-params': {
      color: ouroborosCosmicColors.Foreground,
    },
    'hljs-formula': {
      color: ouroborosCosmicColors.Foreground,
    },
    'hljs-comment': {
      color: ouroborosCosmicColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: ouroborosCosmicColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-doctag': {
      color: ouroborosCosmicColors.AccentYellow,
    },
    'hljs-meta': {
      color: ouroborosCosmicColors.Gray,
    },
    'hljs-meta-keyword': {
      color: ouroborosCosmicColors.Gray,
    },
    'hljs-tag': {
      color: ouroborosCosmicColors.AccentPurple,
    },
    'hljs-variable': {
      color: ouroborosCosmicColors.AccentGreen,
    },
    'hljs-template-variable': {
      color: ouroborosCosmicColors.AccentGreen,
    },
    'hljs-attr': {
      color: ouroborosCosmicColors.LightBlue,
    },
    'hljs-attribute': {
      color: ouroborosCosmicColors.LightBlue,
    },
    'hljs-builtin-name': {
      color: ouroborosCosmicColors.AccentCyan,
    },
    'hljs-section': {
      color: ouroborosCosmicColors.AccentYellow,
      fontWeight: 'bold',
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-bullet': {
      color: ouroborosCosmicColors.AccentYellow,
    },
    'hljs-selector-tag': {
      color: ouroborosCosmicColors.AccentPurple,
    },
    'hljs-selector-id': {
      color: ouroborosCosmicColors.AccentGreen,
    },
    'hljs-selector-class': {
      color: ouroborosCosmicColors.AccentYellow,
    },
    'hljs-selector-attr': {
      color: ouroborosCosmicColors.AccentCyan,
    },
    'hljs-selector-pseudo': {
      color: ouroborosCosmicColors.AccentPurple,
    },
    'hljs-addition': {
      backgroundColor: ouroborosCosmicColors.DiffAdded,
      display: 'inline-block',
      width: '100%',
    },
    'hljs-deletion': {
      backgroundColor: ouroborosCosmicColors.DiffRemoved,
      display: 'inline-block',
      width: '100%',
    },
  },
  ouroborosCosmicColors,
  ouroborosCosmicSemanticColors,
);