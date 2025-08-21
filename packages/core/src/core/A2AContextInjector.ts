/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  GenerateContentParameters,
  GenerateContentResponse,
  Content,
  Part,
} from '@google/genai';
import { toContents } from '../code_assist/converter.js';
import { ContentGenerator } from './contentGenerator.js';
import { Config } from '../config/config.js';
import { AutonomousA2AHandler, AgentMessage } from '../agents/AutonomousA2AHandler.js';

/**
 * A decorator that wraps a ContentGenerator to inject A2A messages into prompts
 * during autonomous mode operation. This enables seamless agent-to-agent communication
 * by automatically including pending messages in the LLM context.
 */
export class A2AContextInjector implements ContentGenerator {
  private config: Config;
  private wrapped: ContentGenerator;
  private a2aHandler?: AutonomousA2AHandler;

  constructor(
    wrapped: ContentGenerator,
    config: Config,
    a2aHandler?: AutonomousA2AHandler,
  ) {
    this.wrapped = wrapped;
    this.config = config;
    this.a2aHandler = a2aHandler;
  }

  /**
   * Set the A2A handler for this injector.
   */
  public setA2AHandler(handler: AutonomousA2AHandler): void {
    this.a2aHandler = handler;
  }

  /**
   * Get the wrapped content generator.
   */
  public getWrapped(): ContentGenerator {
    return this.wrapped;
  }

  /**
   * Generate content with A2A context injection.
   * If in autonomous mode and there are pending A2A messages,
   * they will be injected into the prompt context.
   */
  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    const modifiedRequest = await this.injectA2AContext(request);
    return this.wrapped.generateContent(modifiedRequest, userPromptId);
  }

  /**
   * Generate content stream with A2A context injection.
   */
  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const modifiedRequest = await this.injectA2AContext(request);
    return this.wrapped.generateContentStream(modifiedRequest, userPromptId);
  }

  /**
   * Count tokens - pass through to wrapped generator.
   */
  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    return this.wrapped.countTokens(request);
  }

  /**
   * Embed content - pass through to wrapped generator.
   */
  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    return this.wrapped.embedContent(request);
  }

  /**
   * Get user tier from wrapped generator.
   */
  get userTier() {
    return this.wrapped.userTier;
  }

  /**
   * Inject A2A messages into the request context if in autonomous mode.
   */
  private async injectA2AContext(
    request: GenerateContentParameters,
  ): Promise<GenerateContentParameters> {
    // Only inject context in autonomous mode
    if (this.config.isInteractive() || !this.a2aHandler) {
      return request;
    }

    // Get pending A2A messages
    const pendingMessages = this.a2aHandler.getPendingMessages();
    if (pendingMessages.length === 0) {
      return request;
    }

    // Format A2A messages for injection
    const a2aContext = this.formatA2AContext(pendingMessages);
    
    // Inject into the request
    const modifiedRequest = this.prependA2AContext(request, a2aContext);
    
    // Clear pending messages after injection
    this.a2aHandler.clearPendingMessages();
    
    // Log injection for debugging
    if (this.config.getDebugMode()) {
      console.debug(`[A2A Context] Injected ${pendingMessages.length} messages into prompt context`);
    }

    return modifiedRequest;
  }

  /**
   * Format A2A messages into a context string for LLM consumption.
   */
  private formatA2AContext(messages: AgentMessage[]): string {
    const urgentMessages = messages.filter(m => m.priority === 'urgent');
    const normalMessages = messages.filter(m => m.priority !== 'urgent');
    
    let context = `\n## 🤖 Agent-to-Agent Messages\n\n`;
    context += `You have received ${messages.length} message(s) from other agents:\n\n`;

    // Process urgent messages first
    if (urgentMessages.length > 0) {
      context += `### ⚠️ URGENT MESSAGES (${urgentMessages.length})\n\n`;
      urgentMessages.forEach((message, index) => {
        context += this.formatSingleMessage(message, index + 1);
      });
      context += `\n`;
    }

    // Process normal priority messages
    if (normalMessages.length > 0) {
      context += `### 📨 Regular Messages (${normalMessages.length})\n\n`;
      normalMessages.forEach((message, index) => {
        context += this.formatSingleMessage(message, urgentMessages.length + index + 1);
      });
    }

    context += `\n**Instructions for A2A Message Processing:**\n`;
    context += `- Review all messages above and incorporate relevant information into your response\n`;
    context += `- If any message requires immediate action or response, prioritize it\n`;
    context += `- If a message contains context data, use it to inform your decisions\n`;
    context += `- Maintain awareness of ongoing conversations with other agents\n`;
    
    if (urgentMessages.length > 0) {
      context += `- **URGENT**: ${urgentMessages.length} message(s) require immediate attention\n`;
    }
    
    context += `\n---\n\n`;

    return context;
  }

  /**
   * Format a single A2A message for display in context.
   */
  private formatSingleMessage(message: AgentMessage, index: number): string {
    let formatted = `**Message ${index}** (from ${message.sender_agent}):\n`;
    formatted += `- **Priority:** ${message.priority.toUpperCase()}\n`;
    formatted += `- **Timestamp:** ${message.timestamp}\n`;
    formatted += `- **Content:** ${message.content}\n`;
    
    // Add type information if available (for mao_inbox_poll messages)
    if (message.context_data?.['type']) {
      formatted += `- **Message Type:** ${message.context_data['type']}\n`;
    }
    
    // Add status information if available
    if (message.context_data?.['status']) {
      formatted += `- **Status:** ${message.context_data['status']}\n`;
    }
    
    // Add additional context data
    if (message.context_data && Object.keys(message.context_data).length > 0) {
      const contextCopy = { ...message.context_data };
      delete contextCopy['type']; // Already displayed above
      delete contextCopy['status']; // Already displayed above
      
      if (Object.keys(contextCopy).length > 0) {
        formatted += `- **Context Data:** ${JSON.stringify(contextCopy)}\n`;
      }
    }
    
    if (message.requires_response) {
      formatted += `- **⚠️ REQUIRES RESPONSE**\n`;
    }
    
    formatted += `\n`;
    return formatted;
  }

  /**
   * Prepend A2A context to the request contents.
   */
  private prependA2AContext(
    request: GenerateContentParameters,
    a2aContext: string,
  ): GenerateContentParameters {
    if (!request.contents) {
      return request;
    }

    // Convert ContentListUnion to Content[] array
    const contentsArray = toContents(request.contents);
    if (contentsArray.length === 0) {
      return request;
    }

    // Clone the request to avoid mutation
    const modifiedRequest = { ...request };
    
    // Get the first content item (usually the user's input)
    const firstContent = contentsArray[0];
    if (!firstContent.parts || firstContent.parts.length === 0) {
      return request;
    }

    // Create new content with A2A context prepended
    const modifiedParts: Part[] = [];
    
    // Add A2A context as the first part
    modifiedParts.push({ text: a2aContext });
    
    // Add original parts
    firstContent.parts.forEach((part: Part) => {
      if (part.text) {
        // If it's a text part, append it to the A2A context
        modifiedParts.push({ text: part.text });
      } else {
        // For non-text parts (images, etc.), add them as-is
        modifiedParts.push(part);
      }
    });

    // Create modified content
    const modifiedContent: Content = {
      ...firstContent,
      parts: modifiedParts,
    };

    // Create modified contents array
    modifiedRequest.contents = [
      modifiedContent,
      ...contentsArray.slice(1), // Keep remaining contents unchanged
    ];

    return modifiedRequest;
  }
}