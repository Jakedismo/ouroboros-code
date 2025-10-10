/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createContext,
  type PropsWithChildren,
  useContext,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { themeManager } from '../themes/theme-manager.js';
import type { SemanticColors } from '../themes/semantic-tokens.js';
import type { ThemeType } from '../themes/theme.js';
import {
  createDesignTokens,
  type DesignSystemSnapshot,
  type DesignTokens,
} from './tokens.js';

interface ThemeSnapshot {
  readonly name: string;
  readonly type: ThemeType;
  readonly semantics: SemanticColors;
}

const DesignSystemContext = createContext<DesignTokens | null>(null);

let cachedSnapshot: ThemeSnapshot | null = null;

const getSnapshot = (): ThemeSnapshot => {
  const activeTheme = themeManager.getActiveTheme();
  const semantics = themeManager.getSemanticColors();

  if (
    cachedSnapshot &&
    cachedSnapshot.name === activeTheme.name &&
    cachedSnapshot.type === activeTheme.type &&
    cachedSnapshot.semantics === semantics
  ) {
    return cachedSnapshot;
  }

  cachedSnapshot = {
    name: activeTheme.name,
    type: activeTheme.type,
    semantics,
  };

  return cachedSnapshot;
};

const subscribe = (listener: () => void) => themeManager.subscribe(listener);

export const DesignSystemProvider = ({
  children,
}: PropsWithChildren<unknown>) => {
  const snapshot = useSyncExternalStore<ThemeSnapshot>(
    subscribe,
    getSnapshot,
    getSnapshot,
  );

  const tokens = useMemo<DesignTokens>(() => {
    const designSnapshot: DesignSystemSnapshot = {
      name: snapshot.name,
      type: snapshot.type,
      semantics: snapshot.semantics,
    };
    return createDesignTokens(designSnapshot);
  }, [snapshot]);

  return (
    <DesignSystemContext.Provider value={tokens}>
      {children}
    </DesignSystemContext.Provider>
  );
};

export const useDesignSystem = (): DesignTokens => {
  const context = useContext(DesignSystemContext);
  if (!context) {
    throw new Error('useDesignSystem must be used within a DesignSystemProvider');
  }
  return context;
};
