/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Stellar Ouroboros — Dark Gold/Green Gradient Theme for Highlight.js.
 * Designed for superb contrast in dark-mode with a luxurious emerald→gold accent flow.
 */

import { type ColorsTheme, Theme } from './theme.js';

const ouroborosDefault: ColorsTheme = {
  type: 'dark',

  // Core palette
  Background: '#0b0f14', // deep-space black/blue
  Foreground: '#E9F2E9', // moonlight ink on dark
  LightBlue: '#8FD3AA', // repurposed as "mint edge" accent
  AccentBlue: '#3AA981', // cool-emerald border/secondary
  AccentPurple: '#7A8B74', // used for comments: muted sage
  AccentCyan: '#9FE3C1', // bright mint-cyan for names/defs
  AccentGreen: '#3CD67A', // primary string/positive
  AccentYellow: '#F5C84C', // gold for titles/types/important
  AccentRed: '#FF6B6B', // errors/deletions

  DiffAdded: '#10281E', // deep emerald glass
  DiffRemoved: '#2A1619', // deep crimson glass
  Comment: '#7A8B74', // same as AccentPurple (sage)
  Gray: '#6B7280',

  // Gradient sweep: emerald → lime → gold
  GradientColors: ['#00C853', '#7ED957', '#F5C84C'],
  Primary: '#00C853', // emerald star
  White: '#E9F2E9',
  Warning: '#F5C84C',
};

// Extended accents not in ColorsTheme interface
const extra = {
  AccentYellowAlt: '#E3B341', // warmer antique gold
  AccentOrange: '#F2B94B', // golden-amber for keywords/meta
  AccentPink: '#FFB4C1', // soft coral for numbers/literals
  AccentLightGreen: '#A6F5C1', // params/properties highlight
  AccentDeepGreen: '#1B9E5A', // operators
  AccentTeal: '#36C3A8', // special/builtins
  Glow: '0 0 0.75rem #00c85355', // soft emerald glow
};

export const StellarOuroboros = new Theme(
  'Stellar Ouroboros',
  'dark',
  {
    // Base
    hljs: {
      display: 'block',
      overflowX: 'auto',
      background: ouroborosDefault.Background,
      color: ouroborosDefault.Foreground,
      textShadow: 'none',
    },

    // Titles / headings
    'hljs-title': {
      color: ouroborosDefault.AccentYellow,
      fontWeight: '600',
      textDecoration: 'none',
    },

    // Names / definitions
    'hljs-name': {
      color: ouroborosDefault.AccentCyan,
      fontWeight: '600',
    },

    // Tags
    'hljs-tag': {
      color: ouroborosDefault.Foreground,
    },

    // Attributes
    'hljs-attr': {
      color: extra.AccentYellowAlt,
      fontStyle: 'italic',
    },

    // Built-ins / selectors / sections
    'hljs-built_in': {
      color: extra.AccentTeal,
    },
    'hljs-selector-tag': {
      color: extra.AccentOrange,
      fontWeight: '500',
    },
    'hljs-section': {
      color: extra.AccentOrange,
    },

    // Keywords
    'hljs-keyword': {
      color: extra.AccentOrange,
      fontWeight: '600',
    },

    // Default text and substitutions
    'hljs-subst': {
      color: ouroborosDefault.Foreground,
    },

    // Strings & green family
    'hljs-string': { color: ouroborosDefault.AccentGreen },
    'hljs-attribute': { color: ouroborosDefault.AccentGreen },
    'hljs-symbol': { color: ouroborosDefault.AccentGreen },
    'hljs-bullet': { color: ouroborosDefault.AccentGreen },
    'hljs-addition': { color: ouroborosDefault.AccentGreen },
    'hljs-code': { color: ouroborosDefault.AccentGreen },
    'hljs-regexp': { color: ouroborosDefault.AccentGreen },
    'hljs-selector-class': { color: ouroborosDefault.AccentGreen },
    'hljs-selector-attr': { color: ouroborosDefault.AccentGreen },
    'hljs-selector-pseudo': { color: ouroborosDefault.AccentGreen },
    'hljs-template-tag': { color: ouroborosDefault.AccentGreen },
    'hljs-quote': { color: ouroborosDefault.AccentGreen },
    'hljs-char': { color: ouroborosDefault.AccentGreen },

    // Deletions / errors
    'hljs-deletion': {
      color: ouroborosDefault.AccentRed,
    },
    'hljs-important': {
      color: ouroborosDefault.AccentRed,
      fontWeight: '700',
    },

    // Meta
    'hljs-meta': { color: extra.AccentOrange },
    'hljs-meta-string': { color: extra.AccentOrange },

    // Comments (sage, subtle)
    'hljs-comment': {
      color: ouroborosDefault.Comment,
      fontStyle: 'italic',
    },

    // Literals & numbers (coral/pink)
    'hljs-literal': {
      color: extra.AccentPink,
      fontWeight: '500',
    },
    'hljs-number': {
      color: extra.AccentPink,
    },

    // Emphasis / strong
    'hljs-emphasis': { fontStyle: 'italic' },
    'hljs-strong': { fontWeight: 'bold' },

    // Diff helpers
    'hljs-diff': { color: ouroborosDefault.Foreground },
    'hljs-meta.hljs-diff': { color: ouroborosDefault.AccentBlue },

    // Line numbers
    'hljs-ln': { color: ouroborosDefault.Gray },
    'hljs.hljs-line-numbers': {
      borderRight: `1px solid ${ouroborosDefault.Gray}`,
    },
    'hljs.hljs-line-numbers .hljs-ln-numbers': {
      color: ouroborosDefault.Gray,
      paddingRight: '1em',
    },
    'hljs.hljs-line-numbers .hljs-ln-code': {
      paddingLeft: '1em',
    },

    // Typing / variable-ish
    'hljs-type': {
      color: ouroborosDefault.AccentYellow,
      fontWeight: '600',
    },
    'hljs-variable': { color: ouroborosDefault.AccentYellow },
    'hljs-template-variable': { color: ouroborosDefault.AccentGreen },

    // Functions
    'hljs-function': { color: ouroborosDefault.AccentCyan },
    'hljs-function .hljs-keyword': { color: extra.AccentTeal },
    'hljs-params': {
      color: extra.AccentLightGreen,
      fontStyle: 'italic',
    },

    // Classes
    'hljs-class': {
      color: ouroborosDefault.AccentCyan,
      fontWeight: '700',
      textShadow: extra.Glow,
    },

    // Properties
    'hljs-property': { color: ouroborosDefault.AccentBlue },

    // Operators
    'hljs-operator': { color: extra.AccentDeepGreen },

    // Punctuation
    'hljs-punctuation': { color: ouroborosDefault.Gray },

    // CSS IDs
    'hljs-selector-id': {
      color: ouroborosDefault.AccentYellow,
      fontWeight: '700',
    },

    // Escape sequences
    'hljs-escape': {
      color: extra.AccentPink,
      fontWeight: '700',
    },

    // Meta keywords
    'hljs-meta-keyword': {
      color: extra.AccentOrange,
      fontWeight: '700',
    },

    // Built-in names
    'hljs-builtin-name': {
      color: extra.AccentTeal,
    },

    // Modules / namespaces
    'hljs-module': { color: ouroborosDefault.AccentCyan },
    'hljs-namespace': { color: ouroborosDefault.LightBlue },

    // Formulas
    'hljs-formula': {
      color: ouroborosDefault.AccentCyan,
      fontStyle: 'italic',
    },

    // Language-specific niceties
    'hljs-decorator': { color: extra.AccentTeal, fontWeight: '700' },
    'hljs-symbol.ruby': { color: extra.AccentPink },
    'hljs-keyword.sql': {
      color: extra.AccentOrange,
      textTransform: 'uppercase',
    },
    'hljs-section.markdown': {
      color: ouroborosDefault.AccentYellow,
      fontWeight: '700',
    },
    'hljs-attr.json': { color: ouroborosDefault.AccentCyan },

    // HTML/XML specifics
    'hljs-tag .hljs-name': { color: ouroborosDefault.AccentRed },
    'hljs-tag .hljs-attr': { color: extra.AccentYellowAlt },

    // Selection styling (emerald→gold glass gradient)
    'hljs::selection': {
      background:
        'linear-gradient(90deg, #00C85366 0%, #7ED95755 50%, #F5C84C44 100%)',
    },
    'hljs ::-moz-selection': {
      background:
        'linear-gradient(90deg, #00C85366 0%, #7ED95755 50%, #F5C84C44 100%)',
    },

    // Highlighted lines (subtle emerald veil)
    'hljs .hljs-highlight': {
      background: '#00C85322',
      display: 'block',
      width: '100%',
    },

    // Optional: code blocks with gradient border accent
    '.hljs, pre.hljs': {
      border: '1px solid #1B2A22',
      boxShadow: 'inset 0 0 0 1px #0f1a15',
      backgroundImage:
        'linear-gradient(180deg, rgba(0,200,83,0.08), rgba(245,200,76,0.04))',
    },
  },
  ouroborosDefault,
);
