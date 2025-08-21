/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode';
import { DiffManager } from './diff-manager.js';
export declare class IDEServer {
    private server;
    private context;
    private log;
    private portFile;
    diffManager: DiffManager;
    constructor(log: (message: string) => void, diffManager: DiffManager);
    start(context: vscode.ExtensionContext): Promise<void>;
    stop(): Promise<void>;
}
