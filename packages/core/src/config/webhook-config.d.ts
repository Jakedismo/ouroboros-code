/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export interface WebhookConfiguration {
    enabled?: boolean;
    port?: number;
    host?: string;
    authMode?: 'token' | 'hmac' | 'both';
    autoStart?: boolean;
    timeout?: number;
    retryPolicy?: {
        maxRetries?: number;
        retryDelay?: number;
    };
}
export declare const DEFAULT_WEBHOOK_CONFIG: WebhookConfiguration;
