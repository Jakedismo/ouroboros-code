# MCP Webhook Callbacks Implementation Plan for Gemini CLI

## Executive Summary

This plan outlines how to add webhook callback functionality to Gemini CLI, enabling MCP servers to notify the agent when long-running tools complete. The implementation maintains full upstream compatibility by using an extension-based approach that doesn't modify core MCP client code.

## Current Architecture Analysis

### MCP Integration Points

- **MCP Client**: `packages/core/src/tools/mcp-client.ts` - Handles MCP server connections
- **MCP Tool Wrapper**: `packages/core/src/tools/mcp-tool.ts` - `DiscoveredMCPToolInvocation` class wraps MCP tools
- **Tool Execution**: Tools implement `BaseToolInvocation` with `execute()` method returning `ToolResult`
- **MCP Configuration**: `MCPServerConfig` class in `packages/core/src/config/config.ts`
- **Tool Registry**: `packages/core/src/tools/tool-registry.ts` manages tool discovery

## Implementation Strategy

### 1. Webhook Server Module

Create a new module that provides webhook server capabilities without modifying existing code.

**Location**: `packages/core/src/webhooks/webhook-server.ts`

```typescript
import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { EventEmitter } from 'events';
import crypto from 'crypto';
import { Config } from '../config/config.js';

export interface WebhookPayload {
  tool_id: string;
  server_name: string;
  status: 'completed' | 'failed' | 'progress';
  result?: {
    output: any;
    error?: string;
  };
  started_at: string;
  completed_at?: string;
  metadata?: Record<string, any>;
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
  private readonly activeCallbacks: Map<
    string,
    (payload: WebhookPayload) => void
  >;
  private readonly config: WebhookServerConfig;
  private webhookUrl?: string;

  constructor(config: WebhookServerConfig = {}) {
    super();
    this.config = {
      port: config.port || 0, // 0 means random available port
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
    if (
      this.config.authToken &&
      authHeader !== `Bearer ${this.config.authToken}`
    ) {
      res.writeHead(401);
      res.end();
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
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
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );
  }

  private handleWebhook(payload: WebhookPayload) {
    console.debug(
      `[Webhook Server] Received webhook for tool ${payload.tool_id}`,
    );
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

  registerCallback(
    toolId: string,
    callback: (payload: WebhookPayload) => void,
  ) {
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
    webhookServerInstance = new WebhookServer(config);
  }
  return webhookServerInstance;
}
```

### 2. MCP Tool Extension with Webhook Support

Create an extended MCP tool class that supports webhook callbacks without modifying the original.

**Location**: `packages/core/src/tools/mcp-tool-webhook.ts`

```typescript
import { DiscoveredMCPTool } from './mcp-tool.js';
import { ToolInvocation, ToolResult } from './tools.js';
import {
  getWebhookServer,
  WebhookPayload,
} from '../webhooks/webhook-server.js';
import { v4 as uuidv4 } from 'uuid';

export interface MCPWebhookMetadata {
  webhook_url?: string;
  webhook_auth_token?: string;
  webhook_hmac_secret?: string;
  tool_invocation_id?: string;
}

export class WebhookEnabledMCPTool extends DiscoveredMCPTool {
  private webhookEnabled: boolean;

  constructor(
    mcpTool: any,
    serverName: string,
    name: string,
    description: string,
    webhookEnabled: boolean = false,
  ) {
    super(mcpTool, serverName, name, description);
    this.webhookEnabled = webhookEnabled;
  }

  build(
    params: Record<string, unknown>,
  ): ToolInvocation<Record<string, unknown>, ToolResult> {
    if (!this.webhookEnabled) {
      return super.build(params);
    }

    return new WebhookEnabledMCPToolInvocation(
      this.mcpTool,
      this.serverName,
      this.serverToolName,
      params,
    );
  }
}

class WebhookEnabledMCPToolInvocation extends DiscoveredMCPToolInvocation {
  private toolInvocationId: string;

  constructor(
    mcpTool: any,
    serverName: string,
    serverToolName: string,
    params: Record<string, unknown>,
  ) {
    super(mcpTool, serverName, serverToolName, params);
    this.toolInvocationId = uuidv4();
  }

  async execute(
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
  ): Promise<ToolResult> {
    const webhookServer = getWebhookServer();
    const webhookConfig = webhookServer.getWebhookConfig();

    // Inject webhook metadata into params if webhook is available
    if (webhookConfig.url) {
      const webhookParams = {
        ...this.params,
        __mcp_webhook_metadata: {
          webhook_url: webhookConfig.url,
          webhook_auth_token: webhookConfig.authToken,
          webhook_hmac_secret: webhookConfig.hmacSecret,
          tool_invocation_id: this.toolInvocationId,
        } as MCPWebhookMetadata,
      };

      // Register callback for this tool invocation
      let resultPromiseResolve: ((result: ToolResult) => void) | undefined;
      let resultPromiseReject: ((error: Error) => void) | undefined;

      const resultPromise = new Promise<ToolResult>((resolve, reject) => {
        resultPromiseResolve = resolve;
        resultPromiseReject = reject;
      });

      webhookServer.registerCallback(
        this.toolInvocationId,
        (payload: WebhookPayload) => {
          if (payload.status === 'progress' && updateOutput) {
            updateOutput(payload.result?.output || '');
          } else if (payload.status === 'completed') {
            resultPromiseResolve!({
              llmContent:
                payload.result?.output || 'Tool completed via webhook',
              returnDisplay: `Tool completed at ${payload.completed_at}`,
            });
          } else if (payload.status === 'failed') {
            resultPromiseReject!(
              new Error(payload.result?.error || 'Tool failed'),
            );
          }
        },
      );

      // Try to execute with webhook params
      try {
        // First, try synchronous execution with timeout
        const timeoutMs = 5000; // 5 seconds for sync response
        const result = await Promise.race([
          super.execute(signal, updateOutput),
          new Promise<ToolResult>((_, reject) =>
            setTimeout(() => reject(new Error('ASYNC_EXECUTION')), timeoutMs),
          ),
        ]);

        // If we got a quick response, return it
        webhookServer.unregisterCallback(this.toolInvocationId);
        return result;
      } catch (error: any) {
        if (error.message === 'ASYNC_EXECUTION') {
          // Tool is taking too long, wait for webhook
          if (updateOutput) {
            updateOutput(
              'Tool is running asynchronously. Waiting for completion webhook...',
            );
          }

          // Wait for webhook callback with overall timeout
          const overallTimeout = 300000; // 5 minutes
          return Promise.race([
            resultPromise,
            new Promise<ToolResult>((_, reject) =>
              setTimeout(() => {
                webhookServer.unregisterCallback(this.toolInvocationId);
                reject(
                  new Error('Tool execution timed out waiting for webhook'),
                );
              }, overallTimeout),
            ),
          ]);
        }
        throw error;
      }
    }

    // Fallback to normal execution if no webhook available
    return super.execute(signal, updateOutput);
  }
}
```

### 3. MCP Connection Enhancement

Extend MCP connection to pass webhook configuration during initialization.

**Location**: `packages/core/src/tools/mcp-client-webhook.ts`

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { MCPServerConfig } from '../config/config.js';
import { getWebhookServer } from '../webhooks/webhook-server.js';
import { connectToMcpServer as originalConnect } from './mcp-client.js';

/**
 * Enhanced MCP connection that includes webhook configuration
 */
export async function connectToMcpServerWithWebhook(
  mcpServerConfig: MCPServerConfig,
  enableWebhooks: boolean = false,
): Promise<Client> {
  const client = await originalConnect(mcpServerConfig);

  if (enableWebhooks) {
    const webhookServer = getWebhookServer();
    const webhookUrl = await webhookServer.start();
    const webhookConfig = webhookServer.getWebhookConfig();

    // Send webhook configuration to MCP server via initialization or custom method
    // This depends on MCP server implementation
    try {
      // Option 1: Send via custom notification
      await client.notification({
        method: 'webhook/configure',
        params: {
          url: webhookUrl,
          authToken: webhookConfig.authToken,
          hmacSecret: webhookConfig.hmacSecret,
        },
      });
    } catch (error) {
      // Option 2: Include in client metadata during connection
      console.debug(
        '[MCP Webhook] Server may not support webhook configuration:',
        error,
      );
    }
  }

  return client;
}
```

### 4. Configuration Extension

Extend configuration to support webhook settings.

**Location**: `packages/core/src/config/webhook-config.ts`

```typescript
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
```

### 5. Tool Registry Integration

Modify tool discovery to use webhook-enabled tools when appropriate.

**Location**: `packages/core/src/tools/tool-registry-webhook.ts`

```typescript
import { ToolRegistry } from './tool-registry.js';
import { WebhookEnabledMCPTool } from './mcp-tool-webhook.js';
import { Config } from '../config/config.js';

export class WebhookEnabledToolRegistry extends ToolRegistry {
  private webhookConfig: WebhookConfiguration;

  constructor(config: Config, webhookConfig?: WebhookConfiguration) {
    super(config);
    this.webhookConfig = webhookConfig || DEFAULT_WEBHOOK_CONFIG;
  }

  // Override MCP tool discovery to use webhook-enabled tools
  protected createMCPTool(
    mcpTool: any,
    serverName: string,
    name: string,
    description: string,
  ): DiscoveredMCPTool {
    if (this.webhookConfig.enabled) {
      return new WebhookEnabledMCPTool(
        mcpTool,
        serverName,
        name,
        description,
        true,
      );
    }
    return super.createMCPTool(mcpTool, serverName, name, description);
  }
}
```

### 6. CLI Integration

Add CLI flags to enable webhook functionality.

**Location**: `packages/cli/src/commands/webhook-options.ts`

```typescript
export interface WebhookCLIOptions {
  'enable-webhooks'?: boolean;
  'webhook-port'?: number;
  'webhook-host'?: string;
  'webhook-timeout'?: number;
}

export function addWebhookOptions(yargs: any) {
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
```

### 7. MCP Server Implementation Guide

Provide documentation for MCP server developers to implement webhook support.

**Location**: `docs/mcp-webhook-server-guide.md`

````markdown
# MCP Server Webhook Implementation Guide

## Overview

MCP servers can notify Gemini CLI when long-running tools complete by sending webhook callbacks.

## Webhook Configuration Reception

MCP servers should accept webhook configuration via:

1. Custom notification method `webhook/configure`
2. Tool parameters with `__mcp_webhook_metadata` field

## Webhook Payload Format

```json
{
  "tool_id": "unique-invocation-id",
  "server_name": "your-mcp-server",
  "status": "completed|failed|progress",
  "result": {
    "output": "Tool execution result",
    "error": "Error message if failed"
  },
  "started_at": "2025-01-20T10:00:00Z",
  "completed_at": "2025-01-20T10:05:00Z",
  "metadata": {
    "custom": "fields"
  }
}
```
````

## Security

1. **Token Authentication**: Include `Authorization: Bearer <token>` header
2. **HMAC Signature**: Include `X-MCP-Signature: sha256=<signature>` header
3. **HTTPS**: Use HTTPS in production environments

## Example Implementation

```python
import requests
import hmac
import hashlib
import json

def send_webhook(webhook_url, auth_token, hmac_secret, payload):
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {auth_token}'
    }

    body = json.dumps(payload)

    if hmac_secret:
        signature = hmac.new(
            hmac_secret.encode(),
            body.encode(),
            hashlib.sha256
        ).hexdigest()
        headers['X-MCP-Signature'] = f'sha256={signature}'

    response = requests.post(webhook_url, json=payload, headers=headers)
    return response.status_code == 200
```

````

### 8. Testing Strategy

#### Unit Tests
```typescript
// packages/core/src/webhooks/__tests__/webhook-server.test.ts
describe('WebhookServer', () => {
  it('should start and provide webhook URL', async () => {
    const server = new WebhookServer();
    const url = await server.start();
    expect(url).toMatch(/http:\/\/localhost:\d+\/mcp-webhook/);
    await server.stop();
  });

  it('should validate authentication', async () => {
    // Test token and HMAC validation
  });

  it('should handle webhook payloads', async () => {
    // Test payload processing
  });
});
````

#### Integration Tests

```typescript
// integration-tests/test-mcp-webhook.ts
describe('MCP Webhook Integration', () => {
  it('should receive webhook for long-running tool', async () => {
    // Start webhook server
    // Execute MCP tool
    // Simulate webhook callback
    // Verify result
  });
});
```

### 9. Environment Variables

```bash
# Enable webhook support
GEMINI_ENABLE_WEBHOOKS=true

# Webhook server configuration
GEMINI_WEBHOOK_PORT=8080
GEMINI_WEBHOOK_HOST=0.0.0.0
GEMINI_WEBHOOK_PATH=/mcp-webhook

# Security
GEMINI_WEBHOOK_AUTH_MODE=both  # token, hmac, or both
GEMINI_WEBHOOK_TOKEN=your-secret-token
GEMINI_WEBHOOK_HMAC_SECRET=your-hmac-secret

# Timeouts
GEMINI_WEBHOOK_TIMEOUT=300000  # 5 minutes
```

### 10. Usage Examples

#### Basic Usage

```bash
# Enable webhooks for MCP tools
gemini --enable-webhooks "Run a long analysis task"

# With custom webhook configuration
gemini --enable-webhooks --webhook-port 8080 --webhook-timeout 600000 "Process large dataset"
```

#### Programmatic Usage

```typescript
import { Config } from '@google/gemini-cli-core';
import { getWebhookServer } from './webhooks/webhook-server.js';

const config = new Config({
  // ... existing config
});

// Start webhook server
const webhookServer = getWebhookServer({
  port: 8080,
  enableHMAC: true,
});

await webhookServer.start();

// Listen for tool completions
webhookServer.on('tool-completion', (payload) => {
  console.log(
    `Tool ${payload.tool_id} completed with status: ${payload.status}`,
  );
});
```

## Maintenance Strategy

### 1. Minimal Core Modifications

- All webhook functionality is in separate modules
- Original MCP client code remains untouched
- Use inheritance and composition over modification

### 2. Feature Toggle

- Webhook support is disabled by default
- Can be enabled via CLI flag or environment variable
- No impact on existing functionality when disabled

### 3. Backward Compatibility

- Falls back to synchronous execution if webhook fails
- Works with MCP servers that don't support webhooks
- Maintains all existing tool interfaces

### 4. Upstream Sync Process

```bash
# Regular sync from upstream
git fetch upstream
git checkout main
git merge upstream/main

# Rebase webhook feature branch
git checkout feature/mcp-webhooks
git rebase main

# Run tests to ensure compatibility
npm test
```

### 5. Documentation

- Clear separation between core and webhook features
- Mark all webhook code with comments: `// WEBHOOK_EXTENSION`
- Maintain separate documentation for webhook features

## Benefits

1. **Non-Blocking Execution**: Long-running tools don't block the CLI
2. **Progress Updates**: Receive real-time progress via webhooks
3. **Scalability**: Better resource utilization for async operations
4. **Reliability**: Automatic retry and timeout handling
5. **Security**: Built-in authentication and HMAC validation

## Potential Challenges & Solutions

### Challenge 1: Network Configuration

**Solution**: Support multiple webhook transports (HTTP, WebSocket, Unix socket)

### Challenge 2: Firewall/NAT Issues

**Solution**: Support reverse proxy and ngrok integration for external MCP servers

### Challenge 3: Tool Result Correlation

**Solution**: Use unique invocation IDs and maintain mapping table

### Challenge 4: Webhook Server Lifecycle

**Solution**: Automatic start/stop with proper cleanup handlers

## Conclusion

This webhook implementation provides a robust, extensible solution for asynchronous MCP tool execution while maintaining full compatibility with the upstream Gemini CLI repository. The modular design ensures easy maintenance and allows for future enhancements without disrupting core functionality.
