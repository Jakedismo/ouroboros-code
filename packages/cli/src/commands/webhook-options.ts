/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// WEBHOOK_EXTENSION: CLI webhook options for yargs configuration
export interface WebhookCLIOptions {
  'enable-webhooks'?: boolean;
  'webhook-port'?: number;
  'webhook-host'?: string;
  'webhook-timeout'?: number;
}

export function addWebhookOptions(yargs: ReturnType<typeof import('yargs').default>) {
  return yargs
    .option('enable-webhooks', {
      type: 'boolean',
      description: 'Enable webhook callbacks for MCP tools',
      default: false,
    })
    .option('webhook-port', {
      type: 'number',
      description: 'Port for webhook server (0 for random)',
      default: 0,
    })
    .option('webhook-host', {
      type: 'string',
      description: 'Host for webhook server',
      default: 'localhost',
    })
    .option('webhook-timeout', {
      type: 'number',
      description: 'Timeout for webhook callbacks in ms',
      default: 300000,
    });
}