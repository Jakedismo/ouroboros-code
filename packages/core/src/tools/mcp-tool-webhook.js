/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
// WEBHOOK_EXTENSION: MCP tool extension with webhook callback support
import { DiscoveredMCPTool } from './mcp-tool.js';
import { BaseToolInvocation } from './tools.js';
import { getWebhookServer } from '../webhooks/webhook-server.js';
import { randomUUID } from 'crypto';
export class WebhookEnabledMCPTool extends DiscoveredMCPTool {
    webhookEnabled;
    constructor(mcpTool, serverName, serverToolName, description, parameterSchema, timeout, trust, nameOverride, webhookEnabled = false) {
        super(mcpTool, serverName, serverToolName, description, parameterSchema, timeout, trust, nameOverride);
        this.webhookEnabled = webhookEnabled;
    }
    createInvocation(params) {
        if (!this.webhookEnabled) {
            return super.createInvocation(params);
        }
        return new WebhookEnabledMCPToolInvocation(this, params);
    }
}
class WebhookEnabledMCPToolInvocation extends BaseToolInvocation {
    toolInvocationId;
    originalTool;
    constructor(originalTool, params = {}) {
        super(params);
        this.originalTool = originalTool;
        this.toolInvocationId = randomUUID();
    }
    getDescription() {
        return this.originalTool.description;
    }
    async execute(signal, updateOutput) {
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
                },
            };
            // Update params for execution
            this.params = webhookParams;
            // Register callback for this tool invocation
            let resultPromiseResolve;
            let resultPromiseReject;
            const resultPromise = new Promise((resolve, reject) => {
                resultPromiseResolve = resolve;
                resultPromiseReject = reject;
            });
            webhookServer.registerCallback(this.toolInvocationId, (payload) => {
                if (payload.status === 'progress' && updateOutput) {
                    updateOutput(String(payload.result?.output || ''));
                }
                else if (payload.status === 'completed') {
                    resultPromiseResolve({
                        llmContent: String(payload.result?.output || 'Tool completed via webhook'),
                        returnDisplay: `Tool completed at ${payload.completed_at}`,
                    });
                }
                else if (payload.status === 'failed') {
                    resultPromiseReject(new Error(payload.result?.error || 'Tool failed'));
                }
            });
            // Try to execute with webhook params
            try {
                // Create an invocation from the original tool with webhook params
                const originalInvocation = this.originalTool.build(webhookParams);
                // First, try synchronous execution with timeout
                const timeoutMs = 5000; // 5 seconds for sync response
                const result = await Promise.race([
                    originalInvocation.execute(signal || new AbortController().signal, updateOutput),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('ASYNC_EXECUTION')), timeoutMs)),
                ]);
                // If we got a quick response, return it
                webhookServer.unregisterCallback(this.toolInvocationId);
                return result;
            }
            catch (error) {
                if (error instanceof Error && error.message === 'ASYNC_EXECUTION') {
                    // Tool is taking too long, wait for webhook
                    if (updateOutput) {
                        updateOutput('Tool is running asynchronously. Waiting for completion webhook...');
                    }
                    // Wait for webhook callback with overall timeout
                    const overallTimeout = 300000; // 5 minutes
                    return Promise.race([
                        resultPromise,
                        new Promise((_, reject) => setTimeout(() => {
                            webhookServer.unregisterCallback(this.toolInvocationId);
                            reject(new Error('Tool execution timed out waiting for webhook'));
                        }, overallTimeout)),
                    ]);
                }
                throw error;
            }
        }
        // Fallback to normal execution if no webhook available
        const originalInvocation = this.originalTool.build(this.params);
        return originalInvocation.execute(signal || new AbortController().signal, updateOutput);
    }
}
//# sourceMappingURL=mcp-tool-webhook.js.map