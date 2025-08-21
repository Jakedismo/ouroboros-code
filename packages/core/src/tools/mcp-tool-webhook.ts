/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// WEBHOOK_EXTENSION: MCP tool extension with webhook callback support
import { DiscoveredMCPTool } from './mcp-tool.js';
import { ToolInvocation, ToolResult, BaseToolInvocation } from './tools.js';
import { getWebhookServer, WebhookPayload } from '../webhooks/webhook-server.js';
import { randomUUID } from 'crypto';

export interface MCPWebhookMetadata {
  webhook_url?: string;
  webhook_auth_token?: string;
  webhook_hmac_secret?: string;
  tool_invocation_id?: string;
}

export class WebhookEnabledMCPTool extends DiscoveredMCPTool {
  private webhookEnabled: boolean;
  
  constructor(
    mcpTool: DiscoveredMCPTool['mcpTool'],
    serverName: string,
    serverToolName: string,
    description: string,
    parameterSchema: unknown,
    timeout?: number,
    trust?: boolean,
    nameOverride?: string,
    webhookEnabled: boolean = false
  ) {
    super(mcpTool, serverName, serverToolName, description, parameterSchema, timeout, trust, nameOverride);
    this.webhookEnabled = webhookEnabled;
  }
  
  protected override createInvocation(params: Record<string, unknown>): ToolInvocation<Record<string, unknown>, ToolResult> {
    if (!this.webhookEnabled) {
      return super.createInvocation(params);
    }
    
    return new WebhookEnabledMCPToolInvocation(this, params);
  }
}

class WebhookEnabledMCPToolInvocation extends BaseToolInvocation<Record<string, unknown>, ToolResult> {
  private toolInvocationId: string;
  private originalTool: DiscoveredMCPTool;
  
  constructor(
    originalTool: DiscoveredMCPTool,
    params: Record<string, unknown> = {}
  ) {
    super(params);
    this.originalTool = originalTool;
    this.toolInvocationId = randomUUID();
  }
  
  getDescription(): string {
    return this.originalTool.description;
  }
  
  async execute(signal?: AbortSignal, updateOutput?: (output: string) => void): Promise<ToolResult> {
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
      
      // Update params for execution
      (this as WebhookEnabledMCPToolInvocation & { params: Record<string, unknown> }).params = webhookParams;
      
      // Register callback for this tool invocation
      let resultPromiseResolve: ((result: ToolResult) => void) | undefined;
      let resultPromiseReject: ((error: Error) => void) | undefined;
      
      const resultPromise = new Promise<ToolResult>((resolve, reject) => {
        resultPromiseResolve = resolve;
        resultPromiseReject = reject;
      });
      
      webhookServer.registerCallback(this.toolInvocationId, (payload: WebhookPayload) => {
        if (payload.status === 'progress' && updateOutput) {
          updateOutput(String(payload.result?.output || ''));
        } else if (payload.status === 'completed') {
          resultPromiseResolve!({
            llmContent: String(payload.result?.output || 'Tool completed via webhook'),
            returnDisplay: `Tool completed at ${payload.completed_at}`,
          });
        } else if (payload.status === 'failed') {
          resultPromiseReject!(new Error(payload.result?.error || 'Tool failed'));
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
          new Promise<ToolResult>((_, reject) => 
            setTimeout(() => reject(new Error('ASYNC_EXECUTION')), timeoutMs)
          ),
        ]);
        
        // If we got a quick response, return it
        webhookServer.unregisterCallback(this.toolInvocationId);
        return result;
      } catch (error: unknown) {
        if (error instanceof Error && error.message === 'ASYNC_EXECUTION') {
          // Tool is taking too long, wait for webhook
          if (updateOutput) {
            updateOutput('Tool is running asynchronously. Waiting for completion webhook...');
          }
          
          // Wait for webhook callback with overall timeout
          const overallTimeout = 300000; // 5 minutes
          return Promise.race([
            resultPromise,
            new Promise<ToolResult>((_, reject) =>
              setTimeout(() => {
                webhookServer.unregisterCallback(this.toolInvocationId);
                reject(new Error('Tool execution timed out waiting for webhook'));
              }, overallTimeout)
            ),
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