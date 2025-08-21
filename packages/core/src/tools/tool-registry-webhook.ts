/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// WEBHOOK_EXTENSION: Webhook-enabled tool registry extension
import { ToolRegistry } from './tool-registry.js';
import { WebhookEnabledMCPTool } from './mcp-tool-webhook.js';
import { DiscoveredMCPTool } from './mcp-tool.js';
import { Config } from '../config/config.js';
import { WebhookConfiguration, DEFAULT_WEBHOOK_CONFIG } from '../config/webhook-config.js';
import { AnyDeclarativeTool } from './tools.js';

export class WebhookEnabledToolRegistry extends ToolRegistry {
  private webhookConfig: WebhookConfiguration;
  
  constructor(config: Config, webhookConfig?: WebhookConfiguration) {
    super(config);
    this.webhookConfig = webhookConfig || DEFAULT_WEBHOOK_CONFIG;
  }
  
  /**
   * Override tool registration to use webhook-enabled tools when appropriate
   */
  override registerTool(tool: AnyDeclarativeTool): void {
    // If this is an MCP tool and webhooks are enabled, wrap it with webhook support
    if (tool instanceof DiscoveredMCPTool && this.webhookConfig.enabled) {
      const webhookEnabledTool = new WebhookEnabledMCPTool(
        (tool as unknown as { mcpTool: DiscoveredMCPTool['mcpTool'] }).mcpTool,
        tool.serverName,
        tool.serverToolName,
        tool.description,
        tool.parameterSchema,
        (tool as unknown as { timeout?: number }).timeout,
        (tool as unknown as { trust?: boolean }).trust,
        undefined, // nameOverride
        true // webhookEnabled
      );
      super.registerTool(webhookEnabledTool);
    } else {
      // Use original tool registration for non-MCP tools or when webhooks are disabled
      super.registerTool(tool);
    }
  }
}