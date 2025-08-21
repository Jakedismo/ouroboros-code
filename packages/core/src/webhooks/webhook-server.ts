/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// WEBHOOK_EXTENSION: MCP webhook callback server implementation
import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { EventEmitter } from 'events';
import crypto from 'crypto';
import { getWebhookServerConfigFromEnv } from '../config/webhook-env.js';

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

export class WebhookServer extends EventEmitter {
  private server?: Server;
  private readonly activeCallbacks: Map<string, (payload: WebhookPayload) => void>;
  private readonly config: WebhookServerConfig;
  private webhookUrl?: string;
  
  constructor(config: WebhookServerConfig = {}) {
    super();
    this.config = {
      port: config.port || 45123, // Fixed port for webhook server
      host: config.host || 'localhost',
      path: config.path || '/mcp-webhook',
      authToken: config.authToken || crypto.randomBytes(32).toString('hex'),
      enableHMAC: config.enableHMAC ?? true,
      hmacSecret: config.hmacSecret || crypto.randomBytes(32).toString('hex'),
    };
    this.activeCallbacks = new Map();
  }
  
  async start(): Promise<string> {
    if (this.server) {
      return this.webhookUrl!;
    }
    
    this.server = createServer(this.handleRequest.bind(this));
    
    return new Promise((resolve, reject) => {
      this.server!.listen(this.config.port, this.config.host, () => {
        const address = this.server!.address();
        if (typeof address === 'object' && address !== null) {
          const actualPort = address.port;
          this.webhookUrl = `http://${this.config.host}:${actualPort}${this.config.path}`;
          console.debug(`[Webhook Server] Started at ${this.webhookUrl}`);
          resolve(this.webhookUrl);
        } else {
          reject(new Error('Failed to get server address'));
        }
      });
    });
  }
  
  private handleRequest(req: IncomingMessage, res: ServerResponse) {
    if (req.method !== 'POST' || req.url !== this.config.path) {
      res.writeHead(404);
      res.end();
      return;
    }
    
    // Validate authentication
    const authHeader = req.headers['authorization'];
    if (this.config.authToken && authHeader !== `Bearer ${this.config.authToken}`) {
      res.writeHead(401);
      res.end();
      return;
    }
    
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        // Validate HMAC if enabled
        if (this.config.enableHMAC) {
          const signature = req.headers['x-mcp-signature'] as string;
          if (!this.validateHMAC(body, signature)) {
            res.writeHead(403);
            res.end();
            return;
          }
        }
        
        const payload = JSON.parse(body) as WebhookPayload;
        this.handleWebhook(payload);
        res.writeHead(200);
        res.end();
      } catch (error) {
        console.error('[Webhook Server] Error processing webhook:', error);
        res.writeHead(400);
        res.end();
      }
    });
  }
  
  private validateHMAC(body: string, signature: string): boolean {
    if (!signature || !this.config.hmacSecret) return false;
    const hmac = crypto.createHmac('sha256', this.config.hmacSecret);
    hmac.update(body);
    const expectedSignature = `sha256=${hmac.digest('hex')}`;
    
    // Ensure both signatures are the same length to avoid timingSafeEqual errors
    if (signature.length !== expectedSignature.length) {
      return false;
    }
    
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (_error) {
      return false;
    }
  }
  
  private handleWebhook(payload: WebhookPayload) {
    console.debug(`[Webhook Server] Received webhook for tool ${payload.tool_id}`);
    this.emit('tool-completion', payload);
    
    // Call specific callback if registered
    const callback = this.activeCallbacks.get(payload.tool_id);
    if (callback) {
      callback(payload);
      if (payload.status === 'completed' || payload.status === 'failed') {
        this.activeCallbacks.delete(payload.tool_id);
      }
    }
  }
  
  registerCallback(toolId: string, callback: (payload: WebhookPayload) => void) {
    this.activeCallbacks.set(toolId, callback);
  }
  
  unregisterCallback(toolId: string) {
    this.activeCallbacks.delete(toolId);
  }
  
  getWebhookConfig() {
    return {
      url: this.webhookUrl,
      authToken: this.config.authToken,
      hmacSecret: this.config.enableHMAC ? this.config.hmacSecret : undefined,
    };
  }
  
  async stop() {
    if (this.server) {
      return new Promise<void>((resolve) => {
        this.server!.close(() => {
          this.server = undefined;
          this.webhookUrl = undefined;
          console.debug('[Webhook Server] Stopped');
          resolve();
        });
      });
    }
  }
}

// Singleton instance manager
let webhookServerInstance: WebhookServer | undefined;

export function getWebhookServer(config?: WebhookServerConfig): WebhookServer {
  if (!webhookServerInstance) {
    // Merge environment config with provided config, giving precedence to provided config
    const envConfig = getWebhookServerConfigFromEnv();
    const mergedConfig = { ...envConfig, ...config };
    webhookServerInstance = new WebhookServer(mergedConfig);
  }
  return webhookServerInstance;
}