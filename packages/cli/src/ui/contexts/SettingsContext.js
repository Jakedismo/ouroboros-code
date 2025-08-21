/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { createContext, useContext } from 'react';
// This context is initialized in gemini.tsx with the loaded settings.
export const SettingsContext = createContext(null);
export function useSettings() {
    const context = useContext(SettingsContext);
    if (!context) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context.settings;
}
//# sourceMappingURL=SettingsContext.js.map