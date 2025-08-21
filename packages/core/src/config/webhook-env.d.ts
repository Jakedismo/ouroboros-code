/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { WebhookConfiguration } from './webhook-config.js';
/**
 * Read webhook configuration from environment variables
 */
export declare function getWebhookConfigFromEnv(): Partial<WebhookConfiguration>;
/**
 * Get webhook server configuration from environment variables
 */
export declare function getWebhookServerConfigFromEnv(): {
    port: number | undefined;
    host: string | undefined;
    path: string | undefined;
    authToken: string | undefined;
    enableHMAC: boolean;
    hmacSecret: string | undefined;
};
