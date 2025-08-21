/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { HistoryItem } from '../types.js';
import { SettingScope } from '../../config/settings.js';
interface UseThemeCommandReturn {
    isThemeDialogOpen: boolean;
    openThemeDialog: () => void;
    handleThemeSelect: (themeName: string | undefined, scope: SettingScope) => void;
    handleThemeHighlight: (themeName: string | undefined) => void;
}
export declare const useThemeCommand: (setThemeError: (error: string | null) => void, addItem: (item: Omit<HistoryItem, "id">, timestamp: number) => void) => UseThemeCommandReturn;
export {};
