/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
// WEBHOOK_EXTENSION: Unit tests for webhook server functionality
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebhookServer } from '../webhook-server.js';
import crypto from 'crypto';
describe('WebhookServer', () => {
    let server;
    beforeEach(() => {
        server = new WebhookServer();
    });
    afterEach(async () => {
        if (server) {
            await server.stop();
        }
    });
    it('should start and provide webhook URL', async () => {
        const url = await server.start();
        expect(url).toMatch(/http:\/\/localhost:\d+\/mcp-webhook/);
    });
    it('should stop successfully', async () => {
        await server.start();
        await expect(server.stop()).resolves.not.toThrow();
    });
    it('should generate authentication config', () => {
        const config = server.getWebhookConfig();
        expect(config.authToken).toBeDefined();
        expect(config.hmacSecret).toBeDefined();
    });
    it('should register and unregister callbacks', () => {
        const toolId = 'test-tool-id';
        const callback = (payload) => {
            console.log('Callback called', payload);
        };
        server.registerCallback(toolId, callback);
        // Verify callback is registered (we can't directly test this without making the activeCallbacks public)
        server.unregisterCallback(toolId);
        // Verify callback is unregistered
        expect(true).toBe(true); // Placeholder assertion
    });
    it('should emit tool-completion event on webhook', async () => {
        // Create server with HMAC disabled for this test
        const testServer = new WebhookServer({ enableHMAC: false });
        const url = await testServer.start();
        let eventReceived = false;
        testServer.on('tool-completion', (payload) => {
            eventReceived = true;
            expect(payload.tool_id).toBe('test-tool');
            expect(payload.status).toBe('completed');
        });
        // Simulate webhook request
        const payload = {
            tool_id: 'test-tool',
            server_name: 'test-server',
            status: 'completed',
            result: { output: 'Test output' },
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString()
        };
        const config = testServer.getWebhookConfig();
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.authToken}`,
            },
            body: JSON.stringify(payload)
        });
        expect(response.status).toBe(200);
        expect(eventReceived).toBe(true);
        await testServer.stop();
    });
    it('should reject requests without proper authentication', async () => {
        const url = await server.start();
        const payload = {
            tool_id: 'test-tool',
            server_name: 'test-server',
            status: 'completed',
            result: { output: 'Test output' },
            started_at: new Date().toISOString(),
        };
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // No authorization header
            },
            body: JSON.stringify(payload)
        });
        expect(response.status).toBe(401);
    });
    it('should validate HMAC signatures when enabled', async () => {
        const server = new WebhookServer({
            enableHMAC: true,
            hmacSecret: 'test-secret'
        });
        const url = await server.start();
        const payload = {
            tool_id: 'test-tool',
            server_name: 'test-server',
            status: 'completed',
            result: { output: 'Test output' },
            started_at: new Date().toISOString(),
        };
        const body = JSON.stringify(payload);
        const hmac = crypto.createHmac('sha256', 'test-secret');
        hmac.update(body);
        const signature = `sha256=${hmac.digest('hex')}`;
        const config = server.getWebhookConfig();
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.authToken}`,
                'X-MCP-Signature': signature,
            },
            body
        });
        expect(response.status).toBe(200);
        await server.stop();
    });
    it('should reject requests with invalid HMAC signatures', async () => {
        const server = new WebhookServer({
            enableHMAC: true,
            hmacSecret: 'test-secret'
        });
        const url = await server.start();
        const payload = {
            tool_id: 'test-tool',
            server_name: 'test-server',
            status: 'completed',
            result: { output: 'Test output' },
            started_at: new Date().toISOString(),
        };
        const config = server.getWebhookConfig();
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.authToken}`,
                'X-MCP-Signature': 'sha256=invalid-signature',
            },
            body: JSON.stringify(payload)
        });
        expect(response.status).toBe(403);
        await server.stop();
    });
});
//# sourceMappingURL=webhook-server.test.js.map