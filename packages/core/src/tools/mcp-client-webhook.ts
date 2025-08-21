/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// WEBHOOK_EXTENSION: Enhanced MCP connection with webhook configuration support
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { MCPServerConfig } from '../config/config.js';
import { getWebhookServer } from '../webhooks/webhook-server.js';
import { connectToMcpServer as originalConnect } from './mcp-client.js';
import { WorkspaceContext } from '../utils/workspaceContext.js';

/**
 * Enhanced MCP connection that includes webhook configuration
 */
export async function connectToMcpServerWithWebhook(
  mcpServerName: string,
  mcpServerConfig: MCPServerConfig,
  debugMode: boolean,
  workspaceContext: WorkspaceContext,
  enableWebhooks: boolean = false
): Promise<Client> {
  const client = await originalConnect(mcpServerName, mcpServerConfig, debugMode, workspaceContext);
  
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
      console.debug(`[MCP Webhook] Configured webhook for server '${mcpServerName}' at ${webhookUrl}`);
    } catch (error) {
      // Option 2: Include in client metadata during connection
      console.debug('[MCP Webhook] Server may not support webhook configuration:', error);
    }
  }
  
  return client;
}