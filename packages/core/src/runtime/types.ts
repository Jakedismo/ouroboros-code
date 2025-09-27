import type { Model, ModelProvider } from '@openai/agents';

export type UnifiedAgentRole = 'system' | 'user' | 'assistant' | 'tool';

export interface UnifiedAgentMessage {
  role: UnifiedAgentRole;
  content: string;
  toolCallId?: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

export interface UnifiedAgentToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

export type UnifiedAgentsStreamEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'tool-call'; toolCall: UnifiedAgentToolCall }
  | { type: 'final'; message: UnifiedAgentMessage }
  | { type: 'error'; error: Error }
  | { type: 'usage'; usage: Record<string, unknown> };

export interface UnifiedAgentSession {
  id: string;
  providerId: string;
  model: string;
  metadata?: Record<string, unknown>;
  modelHandle?: Model;
  modelProvider?: ModelProvider;
  systemPrompt?: string;
}

export interface UnifiedAgentSessionConfig {
  providerId: string;
  model: string;
  systemPrompt?: string;
  tools?: Array<unknown>;
  metadata?: Record<string, unknown>;
}

export interface UnifiedAgentStreamOptions {
  temperature?: number;
  maxOutputTokens?: number;
  toolChoice?: 'auto' | 'none' | { type: 'function'; name: string };
  reasoningEffort?: 'low' | 'medium' | 'high';
}

export type { AgentStreamEvent, AgentContentFragment, AgentMessage, AgentToolInvocation, AgentToolResult, AgentFunctionCall, ToolFunctionDeclaration } from './agentsTypes.js';
