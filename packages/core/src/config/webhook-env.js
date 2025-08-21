/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Read webhook configuration from environment variables
 */
export function getWebhookConfigFromEnv() {
    const config = {};
    // Enable webhooks
    if (process.env['GEMINI_ENABLE_WEBHOOKS']) {
        config.enabled = process.env['GEMINI_ENABLE_WEBHOOKS'].toLowerCase() === 'true';
    }
    // Webhook server port
    if (process.env['GEMINI_WEBHOOK_PORT']) {
        const port = parseInt(process.env['GEMINI_WEBHOOK_PORT'], 10);
        if (!isNaN(port)) {
            config.port = port;
        }
    }
    // Webhook server host
    if (process.env['GEMINI_WEBHOOK_HOST']) {
        config.host = process.env['GEMINI_WEBHOOK_HOST'];
    }
    // Authentication mode
    if (process.env['GEMINI_WEBHOOK_AUTH_MODE']) {
        const authMode = process.env['GEMINI_WEBHOOK_AUTH_MODE'].toLowerCase();
        if (authMode === 'token' || authMode === 'hmac' || authMode === 'both') {
            config.authMode = authMode;
        }
    }
    // Auto start
    if (process.env['GEMINI_WEBHOOK_AUTO_START']) {
        config.autoStart = process.env['GEMINI_WEBHOOK_AUTO_START'].toLowerCase() === 'true';
    }
    // Timeout
    if (process.env['GEMINI_WEBHOOK_TIMEOUT']) {
        const timeout = parseInt(process.env['GEMINI_WEBHOOK_TIMEOUT'], 10);
        if (!isNaN(timeout)) {
            config.timeout = timeout;
        }
    }
    // Retry policy
    if (process.env['GEMINI_WEBHOOK_MAX_RETRIES'] || process.env['GEMINI_WEBHOOK_RETRY_DELAY']) {
        config.retryPolicy = {};
        if (process.env['GEMINI_WEBHOOK_MAX_RETRIES']) {
            const maxRetries = parseInt(process.env['GEMINI_WEBHOOK_MAX_RETRIES'], 10);
            if (!isNaN(maxRetries)) {
                config.retryPolicy.maxRetries = maxRetries;
            }
        }
        if (process.env['GEMINI_WEBHOOK_RETRY_DELAY']) {
            const retryDelay = parseInt(process.env['GEMINI_WEBHOOK_RETRY_DELAY'], 10);
            if (!isNaN(retryDelay)) {
                config.retryPolicy.retryDelay = retryDelay;
            }
        }
    }
    return config;
}
/**
 * Get webhook server configuration from environment variables
 */
export function getWebhookServerConfigFromEnv() {
    return {
        port: process.env['GEMINI_WEBHOOK_PORT'] ? parseInt(process.env['GEMINI_WEBHOOK_PORT'], 10) : undefined,
        host: process.env['GEMINI_WEBHOOK_HOST'],
        path: process.env['GEMINI_WEBHOOK_PATH'],
        authToken: process.env['GEMINI_WEBHOOK_TOKEN'],
        enableHMAC: process.env['GEMINI_WEBHOOK_AUTH_MODE'] !== 'token', // Enable HMAC unless explicitly token-only
        hmacSecret: process.env['GEMINI_WEBHOOK_HMAC_SECRET'],
    };
}
//# sourceMappingURL=webhook-env.js.map