/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export interface WebhookCLIOptions {
    'enable-webhooks'?: boolean;
    'webhook-port'?: number;
    'webhook-host'?: string;
    'webhook-timeout'?: number;
}
export declare function addWebhookOptions(yargs: ReturnType<typeof import('yargs').default>): import("yargs").Argv<{
    "enable-webhooks": boolean;
} & {
    "webhook-port": number;
} & {
    "webhook-host": string;
} & {
    "webhook-timeout": number;
}>;
