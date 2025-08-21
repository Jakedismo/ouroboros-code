/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../../config/config.js';
import { ToolConfirmationOutcome } from '../../tools/tools.js';
import { BuiltinToolManager } from '../tools/builtin-tool-manager.js';
import { ToolBehaviorManager } from '../tools/tool-behaviors.js';
import { FileSystemBoundary } from '../tools/filesystem-boundary.js';
import { 
  ConfirmationRequest,
  BuiltinToolsIntegration,
  ToolExecutionContext,
  UnifiedToolCall,
  ToolValidationResult
} from '../tools/unified-tool-interface.js';
import { 
  OpenAIToolAdapter,
  OpenAITool,
  OpenAIToolCall,
  OpenAIToolMessage
} from './tool-adapter.js';

/**
 * OpenAI-specific integration for Gemini CLI's built-in tools.
 * This class provides a complete implementation for using all 11 built-in tools
 * with OpenAI's API, maintaining the same behavior, security, and confirmation flows
 * as the original Gemini implementation.
 * 
 * Features:
 * - Full access to all built-in tools (file system, web, system)
 * - Consistent confirmation flows and security boundaries
 * - Error handling and validation
 * - Progress reporting and cancellation support
 */
export class OpenAIBuiltinToolsIntegration implements BuiltinToolsIntegration {
  private toolManager: BuiltinToolManager;
  private adapter: OpenAIToolAdapter;
  private behaviorManager: ToolBehaviorManager;
  private fileSystemBoundary: FileSystemBoundary;
  
  constructor(private config: Config) {
    this.toolManager = new BuiltinToolManager(config);
    this.adapter = new OpenAIToolAdapter();
    this.behaviorManager = new ToolBehaviorManager(config);
    this.fileSystemBoundary = new FileSystemBoundary(config);
  }
  
  /**
   * Initialize the tool integration system.
   * This sets up all the built-in tools and security boundaries.
   */
  async initialize(): Promise<void> {
    // Initialize the built-in tool manager
    await this.toolManager.initialize();
    
    // Initialize file system boundary enforcement
    await this.fileSystemBoundary.initialize();
    
    console.debug('[OpenAI Integration] Initialized built-in tools integration');
  }
  
  /**
   * Get all built-in tools formatted for OpenAI API.
   * Returns tools in the format expected by OpenAI's function calling API.
   * 
   * @returns Array of OpenAI-formatted tools
   */
  getProviderTools(): OpenAITool[] {
    const unifiedTools = this.toolManager.getUnifiedTools();
    return this.adapter.batchToProviderFormat(unifiedTools);
  }
  
  /**
   * Execute tool calls from OpenAI response.
   * Handles multiple tool calls in parallel while maintaining proper confirmation flows.
   * 
   * @param toolCalls - Array of OpenAI tool calls
   * @param options - Execution options
   * @returns Array of OpenAI tool messages
   */
  async executeToolCalls(
    toolCalls: unknown[],
    options: {
      onProgress?: (message: string) => void;
      onConfirmation?: (request: ConfirmationRequest) => Promise<boolean>;
      abortSignal?: AbortSignal;
    } = {}
  ): Promise<OpenAIToolMessage[]> {
    // Validate and convert tool calls
    const validatedCalls = this.validateAndConvertToolCalls(toolCalls);
    
    if (validatedCalls.length === 0) {
      return [];
    }
    
    const results: OpenAIToolMessage[] = [];
    
    // Execute tools sequentially to maintain proper confirmation flow
    // (parallel execution could lead to confirmation conflicts)
    for (const toolCall of validatedCalls) {
      try {
        const result = await this.executeSingleTool(toolCall, options);
        results.push(result);
      } catch (error) {
        console.error(`Error executing tool ${toolCall.function.name}:`, error);
        results.push(this.adapter.createErrorMessage(
          toolCall.id,
          error instanceof Error ? error.message : String(error)
        ));
      }
    }
    
    return results;
  }
  
  /**
   * Validate tool calls and convert them to proper format.
   * 
   * @private
   */
  private validateAndConvertToolCalls(toolCalls: unknown[]): OpenAIToolCall[] {
    const validCalls: OpenAIToolCall[] = [];
    
    for (const call of toolCalls) {
      if (this.adapter.isValidToolCall(call)) {
        validCalls.push(call);
      } else {
        console.warn('Invalid OpenAI tool call format:', call);
      }
    }
    
    return validCalls;
  }
  
  /**
   * Execute a single tool call with full error handling and validation.
   * 
   * @private
   */
  private async executeSingleTool(
    toolCall: OpenAIToolCall,
    options: {
      onProgress?: (message: string) => void;
      onConfirmation?: (request: ConfirmationRequest) => Promise<boolean>;
      abortSignal?: AbortSignal;
    }
  ): Promise<OpenAIToolMessage> {
    const unifiedCall = this.adapter.fromProviderToolCall(toolCall);
    
    // Validate tool security
    const securityError = this.behaviorManager.validateToolSecurity(
      unifiedCall.name,
      unifiedCall.arguments
    );
    
    if (securityError) {
      return this.adapter.createErrorMessage(toolCall.id, securityError);
    }
    
    // Create execution context
    const abortSignal = options.abortSignal || new AbortController().signal;
    const context: ToolExecutionContext = {
      config: this.config,
      signal: abortSignal,
      abortSignal: abortSignal,
      onProgress: options.onProgress,
      onConfirmation: options.onConfirmation 
        ? async (request: ConfirmationRequest) => {
            try {
              const approved = await options.onConfirmation!(request);
              return approved 
                ? ToolConfirmationOutcome.ProceedOnce 
                : ToolConfirmationOutcome.Cancel;
            } catch (error) {
              console.error('Confirmation handler error:', error);
              return ToolConfirmationOutcome.Cancel;
            }
          }
        : undefined,
    };
    
    // Execute the tool
    const result = await this.toolManager.executeTool(unifiedCall, context);
    
    // Convert result to OpenAI format
    return this.adapter.toProviderToolResult(result);
  }
  
  /**
   * Get information about available tools.
   * Useful for debugging and system introspection.
   * 
   * @returns Tool information summary
   */
  getToolInfo(): {
    totalTools: number;
    toolNames: string[];
    toolsByCategory: Record<string, string[]>;
  } {
    const tools = this.getProviderTools();
    const toolNames = this.adapter.extractToolNames(tools);
    
    // Categorize tools by their behavior/type
    const toolsByCategory: Record<string, string[]> = {
      fileSystem: [],
      web: [],
      system: [],
      other: []
    };
    
    for (const name of toolNames) {
      const kind = this.behaviorManager.getToolKind(name);
      
      if (['read', 'edit', 'search'].includes(kind)) {
        toolsByCategory['fileSystem'].push(name);
      } else if (kind === 'fetch') {
        toolsByCategory['web'].push(name);
      } else if (['execute', 'think'].includes(kind)) {
        toolsByCategory['system'].push(name);
      } else {
        toolsByCategory['other'].push(name);
      }
    }
    
    return {
      totalTools: tools.length,
      toolNames,
      toolsByCategory,
    };
  }
  
  /**
   * Check if a specific tool is available.
   * 
   * @param toolName - Name of the tool to check
   * @returns True if tool is available
   */
  hasTool(toolName: string): boolean {
    return this.toolManager.hasTool(toolName);
  }
  
  /**
   * Get the behavior configuration for a specific tool.
   * 
   * @param toolName - Name of the tool
   * @returns Tool configuration
   */
  getToolBehavior(toolName: string) {
    return this.behaviorManager.getToolConfig(toolName);
  }
  
  /**
   * Validate tool parameters before execution.
   * Provides early validation without executing the tool.
   * 
   * @param toolCall - Tool call to validate
   * @returns Validation result
   */
  validateToolCall(toolCall: UnifiedToolCall): ToolValidationResult {
    // Validate unified tool call directly since input is already unified
    if (!toolCall.name || !toolCall.id || !toolCall.arguments) {
      return {
        valid: false,
        error: 'Invalid tool call format: missing required fields'
      };
    }
    
    const unifiedCall = toolCall;
    
    // Check if tool exists
    if (!this.toolManager.hasTool(unifiedCall.name)) {
      return {
        valid: false,
        error: `Unknown tool: ${unifiedCall.name}`
      };
    }
    
    // Check security constraints
    const securityError = this.behaviorManager.validateToolSecurity(
      unifiedCall.name,
      unifiedCall.arguments
    );
    
    if (securityError) {
      return {
        valid: false,
        error: securityError
      };
    }
    
    return {
      valid: true,
    };
  }
  
  /**
   * Create a test tool call for debugging purposes.
   * 
   * @param toolName - Name of the tool
   * @param args - Tool arguments
   * @returns OpenAI tool call for testing
   */
  createTestToolCall(toolName: string, args: Record<string, unknown> = {}): OpenAIToolCall {
    return {
      id: `test_${Date.now()}`,
      type: 'function',
      function: {
        name: toolName,
        arguments: JSON.stringify(args),
      },
    };
  }
  
  /**
   * Get performance metrics about tool execution.
   * 
   * @returns Basic performance information
   */
  getPerformanceInfo(): {
    toolRegistry: boolean;
    fileSystemBoundary: boolean;
    totalBuiltinTools: number;
  } {
    return {
      toolRegistry: !!this.toolManager.getToolRegistry(),
      fileSystemBoundary: true, // Always initialized
      totalBuiltinTools: this.toolManager.getToolNames().length,
    };
  }
}