import { jsx as _jsx } from "react/jsx-runtime";
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState } from 'react';
import { sessionId } from '@ouroboros/code-cli-core';
import { loadSettings } from '../config/settings.js';
import { themeManager } from './themes/theme-manager.js';
import { SettingsContext } from './contexts/SettingsContext.js';
import { AppWrapper } from './App.js';
import { loadCliConfig } from '../config/config.js';
export const MainComponent = ({ initialConfig, settings, startupWarnings, version, workspaceRoot, extensions, argv, }) => {
    const [currentSettings, setCurrentSettings] = useState(settings);
    const [config, setConfig] = useState(initialConfig);
    const recomputeSettings = () => {
        const newSettings = loadSettings(workspaceRoot);
        setCurrentSettings(newSettings);
    };
    React.useEffect(() => {
        const recomputeConfigAndTheme = async () => {
            // Don't run on initial mount, since the initial config is correct.
            if (currentSettings === settings) {
                return;
            }
            // Reload config
            const newConfig = await loadCliConfig(currentSettings.merged, extensions, sessionId, argv);
            await newConfig.initialize();
            if (newConfig.getIdeMode()) {
                await newConfig.getIdeClient().connect();
            }
            // Reload themes
            themeManager.loadCustomThemes(currentSettings.merged.customThemes);
            if (currentSettings.merged.theme) {
                if (!themeManager.setActiveTheme(currentSettings.merged.theme)) {
                    console.warn(`Warning: Theme "${currentSettings.merged.theme}" not found.`);
                }
            }
            setConfig(newConfig);
        };
        recomputeConfigAndTheme();
    }, [currentSettings, settings, extensions, argv, workspaceRoot]);
    const contextValue = {
        settings: currentSettings,
        recomputeSettings,
    };
    return (_jsx(React.StrictMode, { children: _jsx(SettingsContext.Provider, { value: contextValue, children: _jsx(AppWrapper, { config: config, startupWarnings: startupWarnings, version: version }) }) }));
};
//# sourceMappingURL=MainComponent.js.map