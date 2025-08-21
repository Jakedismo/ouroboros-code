/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { LoadedSettings } from '../../config/settings.js';
export interface SettingsContextType {
    settings: LoadedSettings;
    recomputeSettings: () => void;
}
export declare const SettingsContext: import("react").Context<SettingsContextType | null>;
export declare function useSettings(): LoadedSettings;
