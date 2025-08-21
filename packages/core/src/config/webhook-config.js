/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export const DEFAULT_WEBHOOK_CONFIG = {
    enabled: false,
    port: 0, // Random available port
    host: 'localhost',
    authMode: 'both',
    autoStart: true,
    timeout: 300000, // 5 minutes
    retryPolicy: {
        maxRetries: 3,
        retryDelay: 1000,
    },
};
//# sourceMappingURL=webhook-config.js.map