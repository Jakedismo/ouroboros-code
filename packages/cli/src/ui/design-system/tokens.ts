/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Colors } from '../colors.js';
import type { SemanticColors } from '../themes/semantic-tokens.js';
import type { ThemeType } from '../themes/theme.js';
import { CSS_NAME_TO_HEX_MAP } from '../themes/color-utils.js';

const INK_BASE_COLOR_MAP: Record<string, string> = {
  black: '#000000',
  red: '#ff0000',
  green: '#00ff00',
  yellow: '#ffff00',
  blue: '#0000ff',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  white: '#ffffff',
  gray: '#808080',
  grey: '#808080',
  blackbright: '#4d4d4d',
  redbright: '#ff4d4d',
  greenbright: '#4dff4d',
  yellowbright: '#ffff4d',
  bluebright: '#4d4dff',
  cyanbright: '#4dffff',
  magentabright: '#ff4dff',
  whitebright: '#ffffff',
};

function normalizeHex(color: string): string | null {
  if (!color) {
    return null;
  }
  const trimmed = color.trim();
  const lower = trimmed.toLowerCase();

  if (lower.startsWith('#')) {
    if (/^#[0-9a-f]{3}$/i.test(lower)) {
      const r = lower[1];
      const g = lower[2];
      const b = lower[3];
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    if (/^#[0-9a-f]{6}$/i.test(lower)) {
      return lower;
    }
    return null;
  }

  if (CSS_NAME_TO_HEX_MAP[lower]) {
    return CSS_NAME_TO_HEX_MAP[lower];
  }

  if (INK_BASE_COLOR_MAP[lower]) {
    return INK_BASE_COLOR_MAP[lower];
  }

  return null;
}

function channelToHex(channel: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(channel)));
  return clamped.toString(16).padStart(2, '0');
}

function adjustColor(color: string, amount: number): string {
  const hex = normalizeHex(color);
  if (!hex) {
    return color;
  }

  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  const adjustChannel = (channel: number) => {
    if (amount >= 0) {
      return channel + (255 - channel) * amount;
    }
    return channel * (1 + amount);
  };

  const nextR = adjustChannel(r);
  const nextG = adjustChannel(g);
  const nextB = adjustChannel(b);

  return `#${channelToHex(nextR)}${channelToHex(nextG)}${channelToHex(nextB)}`;
}

export type DesignMode = 'dark' | 'light' | 'monochrome';

export interface DesignTokens {
  readonly mode: DesignMode;
  readonly meta: {
    readonly themeName: string;
  };
  readonly colors: {
    readonly surface: {
      readonly base: string;
      readonly elevated: string;
      readonly sunken: string;
      readonly border: string;
      readonly focus: string;
      readonly gradient: string[];
    };
    readonly text: {
      readonly primary: string;
      readonly secondary: string;
      readonly accent: string;
      readonly link: string;
      readonly muted: string;
    };
    readonly status: {
      readonly success: string;
      readonly warning: string;
      readonly error: string;
      readonly info: string;
    };
  };
  readonly spacing: {
    readonly none: 0;
    readonly xs: 1;
    readonly sm: 2;
    readonly md: 3;
    readonly lg: 4;
    readonly xl: 6;
  };
  readonly shape: {
    readonly radius: {
      readonly sm: number;
      readonly md: number;
      readonly lg: number;
    };
  };
  readonly typography: {
    readonly label: {
      readonly transform: 'uppercase' | 'none';
      readonly letterSpacing: number;
    };
  };
}

export interface DesignSystemSnapshot {
  readonly name: string;
  readonly type: ThemeType;
  readonly semantics: SemanticColors;
}

export function createDesignTokens({
  name,
  type,
  semantics,
}: DesignSystemSnapshot): DesignTokens {
  const mode: DesignMode =
    type === 'light' ? 'light' : type === 'ansi' ? 'monochrome' : 'dark';

  const baseSurface = semantics.background.primary;
  const elevatedSurface =
    mode === 'light'
      ? adjustColor(baseSurface, 0.05)
      : adjustColor(baseSurface, 0.12);
  const sunkenSurface =
    mode === 'light'
      ? adjustColor(baseSurface, -0.12)
      : adjustColor(baseSurface, -0.16);

  const gradientCandidates =
    semantics.ui.gradient ?? Colors.GradientColors ?? [
      Colors.AccentBlue,
      Colors.AccentPurple,
      Colors.AccentCyan,
    ];
  const gradient = gradientCandidates.filter(Boolean);
  if (gradient.length < 2) {
    gradient.push(Colors.AccentBlue, Colors.AccentPurple);
  }

  return {
    mode,
    meta: {
      themeName: name,
    },
    colors: {
      surface: {
        base: baseSurface,
        elevated: elevatedSurface,
        sunken: sunkenSurface,
        border: semantics.border.default,
        focus: semantics.border.focused,
        gradient,
      },
      text: {
        primary: semantics.text.primary,
        secondary: semantics.text.secondary,
        accent: semantics.text.accent,
        link: semantics.text.link,
        muted:
          mode === 'light'
            ? adjustColor(semantics.text.secondary, -0.1)
            : adjustColor(semantics.text.secondary, 0.15),
      },
      status: {
        success: semantics.status.success,
        warning: semantics.status.warning,
        error: semantics.status.error,
        info: Colors.AccentCyan,
      },
    },
    spacing: {
      none: 0,
      xs: 1,
      sm: 2,
      md: 3,
      lg: 4,
      xl: 6,
    },
    shape: {
      radius: {
        sm: 0,
        md: 1,
        lg: 2,
      },
    },
    typography: {
      label: {
        transform: 'uppercase',
        letterSpacing: 0.08,
      },
    },
  } as const;
}
