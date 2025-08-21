/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { EventEmitter } from 'events';
export interface WebhookPayload {
    tool_id: string;
    server_name: string;
    status: 'completed' | 'failed' | 'progress';
    result?: {
        output: unknown;
        error?: string;
    };
    started_at: string;
    completed_at?: string;
    metadata?: Record<string, unknown>;
}
export interface WebhookServerConfig {
    port?: number;
    host?: string;
    path?: string;
    authToken?: string;
    enableHMAC?: boolean;
    hmacSecret?: string;
}
export declare class WebhookServer extends EventEmitter {
    private server?;
    private readonly activeCallbacks;
    private readonly config;
    private webhookUrl?;
    constructor(config?: WebhookServerConfig);
    start(): Promise<string>;
    private handleRequest;
    private validateHMAC;
    private handleWebhook;
    registerCallback(toolId: string, callback: (payload: WebhookPayload) => void): void;
    unregisterCallback(toolId: string): void;
    getWebhookConfig(): {
        url: string | undefined;
        authToken: string | undefined;
        hmacSecret: string | undefined;
    };
    stop(): Promise<void>;
}
export declare function getWebhookServer(config?: WebhookServerConfig): WebhookServer;
