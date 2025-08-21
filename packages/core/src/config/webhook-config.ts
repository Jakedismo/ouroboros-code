/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// WEBHOOK_EXTENSION: Webhook configuration interface and defaults
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

export const DEFAULT_WEBHOOK_CONFIG: WebhookConfiguration = {
  enabled: false,
  port: 45123, // Fixed port for webhook server
  host: 'localhost',
  authMode: 'both',
  autoStart: true,
  timeout: 300000, // 5 minutes
  retryPolicy: {
    maxRetries: 3,
    retryDelay: 1000,
  },
};