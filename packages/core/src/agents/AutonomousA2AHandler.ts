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
    priority: 'low' | 'normal' | 'high' | 'urgent' | 'critical';
    auto_execute: boolean;
  };
  mcp_tool_config?: {
    tool_name: 'a2a_coordinate' | 'mao_inbox_poll';
    auto_params: {
      // a2a_coordinate parameters
      action?: 'inbox';
      sessionId?: string;
      sortBy?: 'receivedAt' | 'priority' | 'status' | 'from';
      sortOrder?: 'asc' | 'desc';
      
      // mao_inbox_poll parameters  
      agentId?: string;
      type?: 'leadership' | 'coordinator' | 'fitness' | 'consensus' | 'stigmergic' | 'phase' | 'general';
      includeExpired?: boolean;
      
      // Common parameters
      limit?: number;
      unreadOnly?: boolean;
      since?: string;
      topic?: string;
      from?: string;
      priority?: 'critical' | 'high' | 'normal' | 'low';
    };
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
  agentId: string;
  sessionId: string;
  capabilities: string[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
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
  private readonly processPid: number;

  constructor(config: Config, _mcpClientManager?: McpClientManager) {
    super();
    this.config = config;
    // TODO: Future enhancement - use _mcpClientManager for direct MCP operations
    this.debugMode = config.getDebugMode();
    this.processPid = process.pid;
    
    // Initialize agent context
    this.agentContext = {
      agentId: this.generateAgentId(),
      sessionId: `session-${Date.now()}`,
      capabilities: ['mcp-tools', 'webhook-listener', 'a2a-coordinate'],
      priority: 'medium',
      operating_mode: 'autonomous',
      pending_messages: [],
      active_conversations: new Map(),
      last_message_timestamp: new Date().toISOString(),
    };

    this.log('AutonomousA2AHandler initialized', { 
      agentId: this.agentContext.agentId, 
      sessionId: this.agentContext.sessionId,
      processPid: this.processPid
    });
  }

  /**
   * Start listening for A2A webhook notifications.
   * Activates if in autonomous mode or if experimental A2A mode is enabled.
   */
  public start(): void {
    // Start if we're in autonomous mode (non-interactive) or experimental A2A mode is enabled
    if (this.config.isInteractive() && !this.config.getExperimentalA2aMode()) {
      this.log('Skipping A2A handler activation - in interactive mode without experimental A2A flag');
      return;
    }

    this.isActive = true;
    this.setupWebhookListener();
    this.log(`A2A handler activated for ${this.config.isInteractive() ? 'interactive mode with experimental A2A' : 'autonomous mode'}`);
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
   * Get the current process PID for this handler.
   */
  public getProcessPid(): number {
    return this.processPid;
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

      // PID-based filtering: Only process messages intended for this PID or broadcasts
      if (!this.shouldProcessMessage(payload)) {
        if (this.debugMode) {
          this.log('Skipping message not targeted for this PID', {
            target_pid: payload.target_pid,
            current_pid: this.processPid,
            tool_id: payload.tool_id
          });
        }
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

    this.log('Webhook listener setup complete', { processPid: this.processPid });
  }

  /**
   * Determine if this handler should process the incoming message based on PID targeting.
   * Messages without target_pid are broadcast messages and processed by all clients.
   * Messages with target_pid are only processed if they match this process's PID.
   */
  private shouldProcessMessage(payload: WebhookPayload): boolean {
    // If no target_pid is specified, this is a broadcast message - process it
    if (payload.target_pid === undefined || payload.target_pid === null) {
      if (this.debugMode) {
        this.log('Processing broadcast message', { tool_id: payload.tool_id });
      }
      return true;
    }

    // If target_pid is specified, only process if it matches our PID
    const shouldProcess = payload.target_pid === this.processPid;
    if (this.debugMode && shouldProcess) {
      this.log('Processing targeted message', {
        tool_id: payload.tool_id,
        target_pid: payload.target_pid,
        current_pid: this.processPid
      });
    }
    
    return shouldProcess;
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
   * Auto-execute MCP tool to read A2A messages with dynamic tool detection.
   */
  private async autoExecuteA2ATool(payload: A2AWebhookPayload): Promise<AgentMessage[]> {
    // Detect available A2A tools and select the appropriate one
    const availableTool = await this.detectAvailableA2ATool();
    
    if (!availableTool) {
      throw new Error('No A2A MCP tools available (a2a_coordinate or mao_inbox_poll)');
    }

    this.log('Using A2A tool', { tool: availableTool });

    if (availableTool === 'a2a_coordinate') {
      return this.executeA2ACoordinateTool(payload);
    } else if (availableTool === 'mao_inbox_poll') {
      return this.executeMaoInboxPollTool(payload);
    }

    throw new Error(`Unknown A2A tool: ${availableTool}`);
  }

  /**
   * Detect which A2A MCP tools are available in the tool registry.
   */
  private async detectAvailableA2ATool(): Promise<'a2a_coordinate' | 'mao_inbox_poll' | null> {
    const toolRegistry = this.config.getToolRegistry();
    
    // Check for a2a_coordinate tool first (preferred)
    if (toolRegistry.getTool('a2a_coordinate')) {
      return 'a2a_coordinate';
    }
    
    // Fallback to mao_inbox_poll tool
    if (toolRegistry.getTool('mao_inbox_poll')) {
      return 'mao_inbox_poll';
    }
    
    this.log('No A2A tools detected in registry', {
      availableTools: toolRegistry.getAllTools().map(t => t.name)
    });
    
    return null;
  }

  /**
   * Execute a2a_coordinate tool with inbox action.
   */
  private async executeA2ACoordinateTool(payload: A2AWebhookPayload): Promise<AgentMessage[]> {
    const toolParams = {
      action: 'inbox',
      sessionId: this.agentContext.sessionId,
      limit: 50,
      unreadOnly: true,
      sortBy: 'receivedAt',
      sortOrder: 'desc',
      // Include any additional parameters from payload if provided
      ...(payload.mcp_tool_config?.auto_params || {})
    };
    
    this.log('Executing a2a_coordinate tool for A2A inbox', { params: toolParams });

    const toolCallRequest: ToolCallRequestInfo = {
      callId: `a2a-coord-${Date.now()}`,
      name: 'a2a_coordinate',
      args: toolParams,
      isClientInitiated: false,
      prompt_id: 'autonomous-a2a'
    };

    const abortController = new AbortController();
    const toolResponse = await executeToolCall(this.config, toolCallRequest, abortController.signal);
    
    if (toolResponse.error) {
      throw new Error(`a2a_coordinate tool execution failed: ${toolResponse.error.message}`);
    }
    
    return this.parseA2ACoordinateResponse(toolResponse.responseParts);
  }

  /**
   * Execute mao_inbox_poll tool for agents without webhook support.
   */
  private async executeMaoInboxPollTool(payload: A2AWebhookPayload): Promise<AgentMessage[]> {
    const toolParams = {
      agentId: this.agentContext.agentId,
      unreadOnly: true,
      limit: 50,
      includeExpired: false,
      // Include any additional parameters from payload if provided
      ...(payload.mcp_tool_config?.auto_params || {})
    };
    
    this.log('Executing mao_inbox_poll tool for A2A inbox', { params: toolParams });

    const toolCallRequest: ToolCallRequestInfo = {
      callId: `mao-poll-${Date.now()}`,
      name: 'mao_inbox_poll',
      args: toolParams,
      isClientInitiated: false,
      prompt_id: 'autonomous-a2a'
    };

    const abortController = new AbortController();
    const toolResponse = await executeToolCall(this.config, toolCallRequest, abortController.signal);
    
    if (toolResponse.error) {
      throw new Error(`mao_inbox_poll tool execution failed: ${toolResponse.error.message}`);
    }
    
    return this.parseMaoInboxPollResponse(toolResponse.responseParts);
  }

  /**
   * Parse a2a_coordinate tool response into AgentMessage objects.
   */
  private parseA2ACoordinateResponse(toolResult: unknown): AgentMessage[] {
    try {
      // Handle different possible result formats
      let responseData: any;
      
      if (typeof toolResult === 'string') {
        responseData = JSON.parse(toolResult);
      } else if (typeof toolResult === 'object' && toolResult !== null) {
        responseData = toolResult;
      } else {
        throw new Error('Invalid tool result format');
      }

      // Check if response follows the a2a_coordinate schema
      if (!responseData.success) {
        this.log('A2A coordinate tool returned error', { 
          error: responseData.error,
          response: responseData 
        });
        return [];
      }

      const messages = responseData.data?.messages || [];
      
      this.log('Parsed A2A coordinate response', { 
        messageCount: messages.length,
        unreadCount: responseData.data?.unreadCount || 0,
        hasMore: responseData.data?.hasMore || false
      });

      // Convert a2a_coordinate message format to AgentMessage format
      return messages.map((msg: any): AgentMessage => ({
        id: msg.id,
        sender_agent: msg.from,
        content: this.extractMessageContent(msg.payload),
        timestamp: msg.receivedAt,
        priority: this.mapA2APriority(msg.priority),
        context_data: {
          messageType: msg.messageType,
          topic: msg.topic,
          status: msg.status,
          attachments: msg.attachments,
          metadata: msg.metadata
        },
        requires_response: this.determineResponseRequirement(msg)
      }));
    } catch (error) {
      this.log('Failed to parse A2A coordinate response', { 
        error: getErrorMessage(error), 
        toolResult 
      });
      return [];
    }
  }

  /**
   * Extract readable content from message payload.
   */
  private extractMessageContent(payload: any): string {
    if (typeof payload === 'string') {
      return payload;
    } else if (typeof payload === 'object' && payload !== null) {
      // If payload has a 'content' or 'message' field, use that
      if (payload.content) return payload.content;
      if (payload.message) return payload.message;
      if (payload.text) return payload.text;
      // Otherwise, stringify the object
      return JSON.stringify(payload);
    } else {
      return String(payload || '');
    }
  }

  /**
   * Map a2a_coordinate priority to AgentMessage priority.
   */
  private mapA2APriority(priority: string): 'low' | 'medium' | 'high' | 'urgent' {
    switch (priority) {
      case 'critical': return 'urgent';
      case 'urgent': return 'urgent';
      case 'high': return 'high';
      case 'normal': return 'medium';
      case 'low': return 'low';
      default: return 'medium';
    }
  }

  /**
   * Parse mao_inbox_poll tool response into AgentMessage objects.
   */
  private parseMaoInboxPollResponse(toolResult: unknown): AgentMessage[] {
    try {
      // Handle different possible result formats
      let responseData: any;
      
      if (typeof toolResult === 'string') {
        responseData = JSON.parse(toolResult);
      } else if (typeof toolResult === 'object' && toolResult !== null) {
        responseData = toolResult;
      } else {
        throw new Error('Invalid tool result format');
      }

      // Check if response follows the mao_inbox_poll schema
      if (!responseData.success) {
        this.log('mao_inbox_poll tool returned error', { 
          error: responseData.error,
          response: responseData 
        });
        return [];
      }

      const messages = responseData.data?.messages || [];
      
      this.log('Parsed mao_inbox_poll response', { 
        messageCount: messages.length,
        stats: responseData.data?.stats,
        notice: responseData.data?.notice
      });

      // Convert mao_inbox_poll message format to AgentMessage format
      return messages.map((msg: any): AgentMessage => ({
        id: msg.id,
        sender_agent: msg.from,
        content: this.extractMaoMessageContent(msg.content),
        timestamp: msg.timestamp,
        priority: this.mapMaoPriority(msg.priority),
        context_data: {
          type: msg.type,
          status: msg.status,
          attempts: msg.attempts,
          expiresAt: msg.expiresAt,
          metadata: msg.metadata
        },
        requires_response: this.determineMaoResponseRequirement(msg)
      }));
    } catch (error) {
      this.log('Failed to parse mao_inbox_poll response', { 
        error: getErrorMessage(error), 
        toolResult 
      });
      return [];
    }
  }

  /**
   * Extract readable content from mao message content.
   */
  private extractMaoMessageContent(content: any): string {
    if (typeof content === 'string') {
      return content;
    } else if (typeof content === 'object' && content !== null) {
      // If content has a 'message' or 'content' field, use that
      if (content.message) return content.message;
      if (content.content) return content.content;
      if (content.text) return content.text;
      if (content.description) return content.description;
      // Otherwise, stringify the object
      return JSON.stringify(content);
    } else {
      return String(content || '');
    }
  }

  /**
   * Map mao_inbox_poll priority to AgentMessage priority.
   */
  private mapMaoPriority(priority: string): 'low' | 'medium' | 'high' | 'urgent' {
    switch (priority) {
      case 'critical': return 'urgent';
      case 'high': return 'high';
      case 'normal': return 'medium';
      case 'low': return 'low';
      default: return 'medium';
    }
  }

  /**
   * Determine if mao message requires a response based on type, priority and metadata.
   */
  private determineMaoResponseRequirement(msg: any): boolean {
    // Leadership and coordinator messages typically require response
    if (msg.type === 'leadership' || msg.type === 'coordinator') return true;
    
    // Critical priority always requires response
    if (msg.priority === 'critical') return true;
    
    // Check metadata for explicit response requirement
    if (msg.metadata?.requiresResponse === true) return true;
    if (msg.metadata?.requestId) return true; // Request messages need responses
    
    // Consensus and fitness messages may require response
    if ((msg.type === 'consensus' || msg.type === 'fitness') && msg.priority === 'high') return true;
    
    return false;
  }

  /**
   * Determine if message requires a response based on content and metadata.
   */
  private determineResponseRequirement(msg: any): boolean {
    // Check if message explicitly requires response
    if (msg.metadata?.requires_response === true) return true;
    if (msg.metadata?.requiresResponse === true) return true;
    
    // High priority messages typically require response
    if (msg.priority === 'urgent' || msg.priority === 'critical') return true;
    
    // Direct messages (non-broadcast) may require response
    if (msg.messageType === 'direct' && msg.priority !== 'low') return true;
    
    return false;
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