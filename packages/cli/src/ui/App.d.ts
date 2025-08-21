/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { type Config } from '@ouroboros/code-cli-core';
interface AppProps {
    config: Config;
    startupWarnings?: string[];
    version: string;
}
export declare const AppWrapper: (props: AppProps) => import("react/jsx-runtime").JSX.Element;
export {};
