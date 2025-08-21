/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { Config } from '../config/config.js';
import { McpClientManager } from '../tools/mcp-client-manager.js';
import { executeToolCall } from '../core/nonInteractiveToolExecutor.js';
import { ToolCallRequestInfo } from '../index.js';
import { getWebhookServer, WebhookPayload } from '../webhooks/webhook-server.js';
import { getErrorMessage } from '../utils/errors.js';

// A2A-specific webhook payload structure
export interface A2AWebhookPayload extends WebhookPayload {
  notification_type: 'a2a_message' | 'tool_completion' | 'agent_request';
  agent_data?: {
    sender_agent_id: string;
    receiver_agent_id: string;
    message_count: number;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    auto_execute: boolean;
  };
  mcp_tool_config?: {
    tool_name: string;
    auto_params: Record<string, unknown>;
  };
}

// Agent message structure for context injection
export interface AgentMessage {
  id: string;
  sender_agent: string;
  content: string;
  timestamp: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  context_data?: Record<string, unknown>;
  requires_response?: boolean;
}

// Agent context for managing conversation state
export interface AgentContext {
  agent_id: string;
  operating_mode: 'interactive' | 'autonomous';
  pending_messages: AgentMessage[];
  active_conversations: Map<string, AgentMessage[]>;
  last_message_timestamp: string;
}

/**
 * Handles autonomous agent-to-agent communication via webhooks and MCP tools.
 * This class operates in the background during autonomous mode to:
 * 1. Listen for A2A webhook notifications
 * 2. Auto-execute MCP tools to read messages
 * 3. Inject messages into agent context for LLM processing
 * 4. Manage agent conversation state
 */
export class AutonomousA2AHandler extends EventEmitter {
  private config: Config;
  private agentContext: AgentContext;
  private isActive: boolean = false;
  private debugMode: boolean;

  constructor(config: Config, _mcpClientManager?: McpClientManager) {
    super();
    this.config = config;
    // TODO: Future enhancement - use _mcpClientManager for direct MCP operations
    this.debugMode = config.getDebugMode();
    
    // Initialize agent context
    this.agentContext = {
      agent_id: this.generateAgentId(),
      operating_mode: 'autonomous',
      pending_messages: [],
      active_conversations: new Map(),
      last_message_timestamp: new Date().toISOString(),
    };

    this.log('AutonomousA2AHandler initialized', { agent_id: this.agentContext.agent_id });
  }

  /**
   * Start listening for A2A webhook notifications.
   * Only activates if the config indicates autonomous mode.
   */
  public start(): void {
    // Only start if we're in autonomous mode (non-interactive)
    if (this.config.isInteractive()) {
      this.log('Skipping A2A handler activation - in interactive mode');
      return;
    }

    this.isActive = true;
    this.setupWebhookListener();
    this.log('A2A handler activated for autonomous mode');
  }

  /**
   * Stop listening for webhook notifications and cleanup.
   */
  public stop(): void {
    this.isActive = false;
    const webhookServer = getWebhookServer();
    webhookServer.removeAllListeners('tool-completion');
    this.log('A2A handler deactivated');
  }

  /**
   * Get pending messages for injection into LLM context.
   */
  public getPendingMessages(): AgentMessage[] {
    return [...this.agentContext.pending_messages];
  }

  /**
   * Clear pending messages after they've been processed.
   */
  public clearPendingMessages(): void {
    this.agentContext.pending_messages = [];
  }

  /**
   * Get agent context for external access.
   */
  public getAgentContext(): Readonly<AgentContext> {
    return { ...this.agentContext };
  }

  /**
   * Setup webhook listener for A2A notifications.
   */
  private setupWebhookListener(): void {
    const webhookServer = getWebhookServer();
    
    webhookServer.on('tool-completion', async (payload: WebhookPayload) => {
      if (!this.isActive) {
        return;
      }

      try {
        if (this.isA2AMessage(payload)) {
          await this.processA2AMessage(payload as A2AWebhookPayload);
        }
      } catch (error) {
        this.log('Error processing webhook payload', { error: getErrorMessage(error) });
      }
    });

    this.log('Webhook listener setup complete');
  }

  /**
   * Check if a webhook payload is an A2A message.
   */
  private isA2AMessage(payload: WebhookPayload): boolean {
    const a2aPayload = payload as A2AWebhookPayload;
    return (
      a2aPayload.notification_type === 'a2a_message' &&
      !!a2aPayload.agent_data &&
      a2aPayload.agent_data.auto_execute === true
    );
  }

  /**
   * Process an A2A message notification.
   */
  private async processA2AMessage(payload: A2AWebhookPayload): Promise<void> {
    this.log('Processing A2A message', {
      sender: payload.agent_data?.sender_agent_id,
      message_count: payload.agent_data?.message_count,
      priority: payload.agent_data?.priority,
    });

    try {
      // Auto-execute MCP tool to read messages
      const messages = await this.autoExecuteA2ATool(payload);
      
      if (messages.length > 0) {
        // Inject messages into agent context
        this.injectMessagesIntoContext(messages);
        
        // Emit event for external listeners
        this.emit('a2a-messages-received', {
          messages,
          sender: payload.agent_data?.sender_agent_id,
          priority: payload.agent_data?.priority,
        });
        
        this.log('A2A messages processed successfully', {
          message_count: messages.length,
          urgent_count: messages.filter(m => m.priority === 'urgent').length,
        });
      }
    } catch (error) {
      this.log('Failed to process A2A message', { 
        error: getErrorMessage(error),
        tool_name: payload.mcp_tool_config?.tool_name,
      });
    }
  }

  /**
   * Auto-execute MCP tool to read A2A messages.
   */
  private async autoExecuteA2ATool(payload: A2AWebhookPayload): Promise<AgentMessage[]> {
    if (!payload.mcp_tool_config) {
      throw new Error('No MCP tool configuration in A2A payload');
    }

    const { tool_name, auto_params } = payload.mcp_tool_config;
    
    this.log('Executing MCP tool for A2A', { tool_name, params: auto_params });

    // Create tool call request info
    const toolCallRequest: ToolCallRequestInfo = {
      callId: `a2a-${Date.now()}`,
      name: tool_name,
      args: auto_params || {},
      isClientInitiated: false,
      prompt_id: 'autonomous-a2a'
    };

    // Execute the MCP tool (e.g., 'ouroboros_a2a_reader')
    const toolResponse = await executeToolCall(this.config, toolCallRequest);
    
    if (toolResponse.error) {
      throw new Error(`A2A tool execution failed: ${toolResponse.error.message}`);
    }
    
    // Parse the tool result into agent messages
    return this.parseA2AMessages(toolResponse.responseParts);
  }

  /**
   * Parse MCP tool result into AgentMessage objects.
   */
  private parseA2AMessages(toolResult: unknown): AgentMessage[] {
    try {
      // Handle different possible result formats
      let messageData: any;
      
      if (typeof toolResult === 'string') {
        messageData = JSON.parse(toolResult);
      } else if (typeof toolResult === 'object' && toolResult !== null) {
        messageData = toolResult;
      } else {
        throw new Error('Invalid tool result format');
      }

      // Extract messages from result
      const messages = Array.isArray(messageData) ? messageData : messageData.messages || [messageData];
      
      return messages.map((msg: any, index: number) => ({
        id: msg.id || `a2a-${Date.now()}-${index}`,
        sender_agent: msg.sender_agent || msg.sender || 'unknown',
        content: msg.content || msg.message || String(msg),
        timestamp: msg.timestamp || new Date().toISOString(),
        priority: msg.priority || 'medium',
        context_data: msg.context_data || msg.metadata,
        requires_response: msg.requires_response || false,
      })) as AgentMessage[];

    } catch (error) {
      this.log('Failed to parse A2A messages', { error: getErrorMessage(error) });
      return [];
    }
  }

  /**
   * Inject messages into agent context for LLM processing.
   */
  private injectMessagesIntoContext(messages: AgentMessage[]): void {
    // Add to pending messages
    this.agentContext.pending_messages.push(...messages);
    
    // Update conversation tracking
    messages.forEach(message => {
      const senderConversation = this.agentContext.active_conversations.get(message.sender_agent) || [];
      senderConversation.push(message);
      this.agentContext.active_conversations.set(message.sender_agent, senderConversation);
    });
    
    // Update last message timestamp
    this.agentContext.last_message_timestamp = new Date().toISOString();
    
    // Handle urgent messages with immediate attention
    const urgentMessages = messages.filter(m => m.priority === 'urgent');
    if (urgentMessages.length > 0) {
      this.handleUrgentMessages(urgentMessages);
    }
  }

  /**
   * Handle urgent priority messages that need immediate attention.
   */
  private handleUrgentMessages(urgentMessages: AgentMessage[]): void {
    this.log('Processing urgent A2A messages', { count: urgentMessages.length });
    
    // Emit urgent message event for immediate processing
    this.emit('urgent-a2a-messages', urgentMessages);
    
    // Move urgent messages to front of queue
    this.agentContext.pending_messages = [
      ...urgentMessages,
      ...this.agentContext.pending_messages.filter(m => m.priority !== 'urgent'),
    ];
  }

  /**
   * Generate a unique agent ID for this instance.
   */
  private generateAgentId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `ouroboros-agent-${timestamp}-${random}`;
  }

  /**
   * Logging utility with debug mode support.
   */
  private log(message: string, data?: Record<string, unknown>): void {
    if (this.debugMode) {
      console.debug(`[A2A Handler] ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
  }
}