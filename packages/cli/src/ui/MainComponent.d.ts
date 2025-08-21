/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Config } from '@ouroboros/code-cli-core';
import { LoadedSettings } from '../config/settings.js';
import { CliArgs } from '../config/config.js';
import { Extension } from '../config/extension.js';
interface MainComponentProps {
    initialConfig: Config;
    settings: LoadedSettings;
    startupWarnings: string[];
    version: string;
    workspaceRoot: string;
    extensions: Extension[];
    argv: CliArgs;
}
export declare const MainComponent: ({ initialConfig, settings, startupWarnings, version, workspaceRoot, extensions, argv, }: MainComponentProps) => import("react/jsx-runtime").JSX.Element;
export {};
