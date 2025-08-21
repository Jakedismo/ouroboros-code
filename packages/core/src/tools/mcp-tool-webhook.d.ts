/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { DiscoveredMCPTool } from './mcp-tool.js';
import { ToolInvocation, ToolResult } from './tools.js';
export interface MCPWebhookMetadata {
    webhook_url?: string;
    webhook_auth_token?: string;
    webhook_hmac_secret?: string;
    tool_invocation_id?: string;
}
export declare class WebhookEnabledMCPTool extends DiscoveredMCPTool {
    private webhookEnabled;
    constructor(mcpTool: DiscoveredMCPTool['mcpTool'], serverName: string, serverToolName: string, description: string, parameterSchema: unknown, timeout?: number, trust?: boolean, nameOverride?: string, webhookEnabled?: boolean);
    protected createInvocation(params: Record<string, unknown>): ToolInvocation<Record<string, unknown>, ToolResult>;
}
