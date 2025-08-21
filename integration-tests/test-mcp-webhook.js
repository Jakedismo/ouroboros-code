/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
// WEBHOOK_EXTENSION: Integration tests for end-to-end webhook functionality
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getWebhookServer } from '../packages/core/src/webhooks/webhook-server.js';
describe('MCP Webhook Integration', () => {
    let webhookServer;
    beforeEach(async () => {
        // Start webhook server for each test
        webhookServer = getWebhookServer();
        await webhookServer.start();
    });
    afterEach(async () => {
        // Clean up webhook server
        if (webhookServer) {
            await webhookServer.stop();
        }
    });
    it('should receive webhook for long-running tool', async () => {
        // This is a placeholder test since we don't have a real MCP server to test against
        // In a real scenario, this would:
        // 1. Start webhook server
        // 2. Execute MCP tool with webhook metadata
        // 3. Simulate webhook callback from MCP server
        // 4. Verify result is received correctly
        const webhookUrl = webhookServer.getWebhookConfig().url;
        expect(webhookUrl).toBeDefined();
        // Simulate receiving a webhook
        let callbackReceived = false;
        const testToolId = 'test-tool-123';
        webhookServer.registerCallback(testToolId, (payload) => {
            callbackReceived = true;
            expect(payload.tool_id).toBe(testToolId);
            expect(payload.status).toBe('completed');
        });
        // Simulate webhook payload from MCP server
        const payload = {
            tool_id: testToolId,
            server_name: 'test-mcp-server',
            status: 'completed',
            result: {
                output: 'Long-running task completed successfully'
            },
            started_at: new Date(Date.now() - 5000).toISOString(),
            completed_at: new Date().toISOString()
        };
        const config = webhookServer.getWebhookConfig();
        const response = await fetch(config.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.authToken}`,
            },
            body: JSON.stringify(payload)
        });
        expect(response.status).toBe(200);
        expect(callbackReceived).toBe(true);
    });
    it('should handle webhook timeout scenario', async () => {
        // Test webhook timeout handling
        const testToolId = 'timeout-tool-456';
        let timeoutOccurred = false;
        const timeoutPromise = new Promise((resolve) => {
            setTimeout(() => {
                timeoutOccurred = true;
                resolve('timeout');
            }, 1000); // Short timeout for test
        });
        const callbackPromise = new Promise((resolve) => {
            webhookServer.registerCallback(testToolId, (payload) => {
                resolve(payload);
            });
        });
        const result = await Promise.race([timeoutPromise, callbackPromise]);
        // In this test, timeout should occur first
        expect(result).toBe('timeout');
        expect(timeoutOccurred).toBe(true);
    });
    it('should handle progress updates via webhook', async () => {
        const testToolId = 'progress-tool-789';
        const progressUpdates = [];
        webhookServer.registerCallback(testToolId, (payload) => {
            if (payload.status === 'progress') {
                progressUpdates.push(payload.result?.output || '');
            }
        });
        const config = webhookServer.getWebhookConfig();
        // Send multiple progress updates
        for (let i = 1; i <= 3; i++) {
            const payload = {
                tool_id: testToolId,
                server_name: 'test-mcp-server',
                status: 'progress',
                result: {
                    output: `Progress update ${i}/3`
                },
                started_at: new Date(Date.now() - 10000).toISOString()
            };
            await fetch(config.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.authToken}`,
                },
                body: JSON.stringify(payload)
            });
            // Small delay between updates
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        expect(progressUpdates).toHaveLength(3);
        expect(progressUpdates[0]).toBe('Progress update 1/3');
        expect(progressUpdates[2]).toBe('Progress update 3/3');
    });
});
//# sourceMappingURL=test-mcp-webhook.js.map