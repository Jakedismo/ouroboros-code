import { jsx as _jsx } from "react/jsx-runtime";
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { render } from 'ink-testing-library';
import { KeypressProvider } from '../ui/contexts/KeypressContext.js';
import { SettingsContext } from '../ui/contexts/SettingsContext.js';
export const renderWithProviders = (component, settings) => render(_jsx(KeypressProvider, { kittyProtocolEnabled: true, children: _jsx(SettingsContext.Provider, { value: { settings: settings, recomputeSettings: () => { } }, children: component }) }));
//# sourceMappingURL=render.js.map