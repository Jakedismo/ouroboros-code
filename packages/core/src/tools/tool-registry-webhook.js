/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
// WEBHOOK_EXTENSION: Webhook-enabled tool registry extension
import { ToolRegistry } from './tool-registry.js';
import { WebhookEnabledMCPTool } from './mcp-tool-webhook.js';
import { DiscoveredMCPTool } from './mcp-tool.js';
import { DEFAULT_WEBHOOK_CONFIG } from '../config/webhook-config.js';
export class WebhookEnabledToolRegistry extends ToolRegistry {
    webhookConfig;
    constructor(config, webhookConfig) {
        super(config);
        this.webhookConfig = webhookConfig || DEFAULT_WEBHOOK_CONFIG;
    }
    /**
     * Override tool registration to use webhook-enabled tools when appropriate
     */
    registerTool(tool) {
        // If this is an MCP tool and webhooks are enabled, wrap it with webhook support
        if (tool instanceof DiscoveredMCPTool && this.webhookConfig.enabled) {
            const webhookEnabledTool = new WebhookEnabledMCPTool(tool.mcpTool, tool.serverName, tool.serverToolName, tool.description, tool.parameterSchema, tool.timeout, tool.trust, undefined, // nameOverride
            true // webhookEnabled
            );
            super.registerTool(webhookEnabledTool);
        }
        else {
            // Use original tool registration for non-MCP tools or when webhooks are disabled
            super.registerTool(tool);
        }
    }
}
//# sourceMappingURL=tool-registry-webhook.js.map