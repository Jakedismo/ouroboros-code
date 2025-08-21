/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export function addWebhookOptions(yargs) {
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
//# sourceMappingURL=webhook-options.js.map