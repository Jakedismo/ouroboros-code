/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { PartListUnion } from '@google/genai';
import { 
  ToolResultDisplay, 
  ToolConfirmationOutcome, 
  Kind 
} from '../../tools/tools.js';
import { Config } from '../../config/config.js';

/**
 * Provider-agnostic tool definition that can be converted to any LLM provider's format
 */
export interface UnifiedTool {
  /** Tool name (matches existing built-in tool names) */
  name: string;
  
  /** Tool description for LLM understanding */
  description: string;
  
  /** JSON schema for tool parameters */
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
  
  /** Tool categorization */
  kind?: Kind;
  
  /** Whether output should be rendered as markdown */
  isOutputMarkdown?: boolean;
  
  /** Whether tool supports streaming output */
  canUpdateOutput?: boolean;
}

/**
 * Provider-agnostic tool call from LLM
 */
export interface UnifiedToolCall {
  /** Unique identifier for this tool call */
  id: string;
  
  /** Name of the tool to execute */
  name: string;
  
  /** Raw parameters from LLM (will be validated) */
  arguments: Record<string, unknown>;
  
  /** Parameters for the tool (alias for compatibility) */
  parameters?: Record<string, unknown>;
}

/**
 * Provider-agnostic tool execution result
 */
export interface UnifiedToolResult {
  /** Tool call ID this result corresponds to */
  toolCallId: string;
  
  /** Content for LLM conversation history */
  content: PartListUnion;
  
  /** Optional display content for UI */
  display?: ToolResultDisplay;
  
  /** Whether this represents an error */
  isError: boolean;
  
  /** Whether the operation was successful */
  success: boolean;
  
  /** Whether result came from cache */
  fromCache?: boolean;
  
  /** Error details if isError is true */
  error?: {
    message: string;
    type?: string;
  };
  
  /** Optional summary of the operation */
  summary?: string;
}

/**
 * Context for tool execution across all providers
 */
export interface ToolExecutionContext {
  /** Configuration instance */
  config: Config;
  
  /** Abort signal for cancellation */
  signal: AbortSignal;
  
  /** Abort signal for cancellation (alias for compatibility) */
  abortSignal: AbortSignal;
  
  /** Optional progress callback */
  onProgress?: (message: string) => void;
  
  /** Optional confirmation handler */
  onConfirmation?: (request: ConfirmationRequest) => Promise<ToolConfirmationOutcome>;
  
  /** Optional tool call being executed */
  toolCall?: UnifiedToolCall;
  
  /** Optional provider type */
  provider?: string;
  
  /** Optional security context */
  securityContext?: any;
  
  /** Optional confirmation callback (legacy) */
  confirmationCallback?: (request: ConfirmationRequest) => Promise<boolean>;
}

/**
 * Provider-agnostic confirmation request
 */
export interface ConfirmationRequest {
  /** Name of the tool requesting confirmation */
  toolName: string;
  
  /** Human-readable description */
  description: string;
  
  /** Type of action (modify_file, execute_command, fetch_url, save_memory, etc.) */
  action: string;
  
  /** Action-specific details */
  details: Record<string, unknown>;
  
  /** Available confirmation options */
  options: string[];
}

/**
 * Base interface for provider-specific tool adapters
 */
export interface ProviderToolAdapter<TProviderTool, TProviderToolCall, TProviderToolResult> {
  /**
   * Convert unified tool to provider-specific format
   */
  toProviderFormat(unifiedTool: UnifiedTool): TProviderTool;
  
  /**
   * Convert provider tool call to unified format
   */
  fromProviderToolCall(providerCall: TProviderToolCall): UnifiedToolCall;
  
  /**
   * Convert unified result to provider-specific format
   */
  toProviderToolResult(unifiedResult: UnifiedToolResult): TProviderToolResult;
  
  /**
   * Convert provider result to unified format (if needed)
   */
  fromProviderToolResult?(providerResult: TProviderToolResult): UnifiedToolResult;
}

/**
 * Tool validation result
 */
export interface ToolValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Provider-agnostic interface for built-in tool integration
 */
export interface BuiltinToolsIntegration {
  /**
   * Initialize the tool integration
   */
  initialize(): Promise<void>;
  
  /**
   * Get all available built-in tools in provider format
   */
  getProviderTools(): unknown[];
  
  /**
   * Execute tool calls from provider response
   */
  executeToolCalls(
    toolCalls: unknown[],
    options?: {
      onProgress?: (message: string) => void;
      onConfirmation?: (request: ConfirmationRequest) => Promise<boolean>;
      abortSignal?: AbortSignal;
    }
  ): Promise<unknown[]>;
  
  /**
   * Validate tool parameters before execution
   */
  validateToolCall?(toolCall: UnifiedToolCall): ToolValidationResult;
}

/**
 * Main tool interface for built-in tools integration
 */
export interface ToolInterface {
  initialize(): Promise<void>;
  getAllTools(): UnifiedTool[];
  executeTool(toolCall: UnifiedToolCall, context: ToolExecutionContext): Promise<UnifiedToolResult>;
}