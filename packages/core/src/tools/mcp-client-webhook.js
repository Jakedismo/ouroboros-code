/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { getWebhookServer } from '../webhooks/webhook-server.js';
import { connectToMcpServer as originalConnect } from './mcp-client.js';
/**
 * Enhanced MCP connection that includes webhook configuration
 */
export async function connectToMcpServerWithWebhook(mcpServerName, mcpServerConfig, debugMode, workspaceContext, enableWebhooks = false) {
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
        }
        catch (error) {
            // Option 2: Include in client metadata during connection
            console.debug('[MCP Webhook] Server may not support webhook configuration:', error);
        }
    }
    return client;
}
//# sourceMappingURL=mcp-client-webhook.js.map