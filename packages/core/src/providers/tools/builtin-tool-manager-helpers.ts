/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { PartListUnion } from '@google/genai';
import { 
  AnyDeclarativeTool,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome 
} from '../../tools/tools.js';
import { 
  UnifiedTool, 
  UnifiedToolCall, 
  UnifiedToolResult, 
  ToolExecutionContext,
  ConfirmationRequest 
} from './unified-tool-interface.js';
import { ToolBehaviorManager } from './tool-behaviors.js';
import { FileSystemBoundary } from './filesystem-boundary.js';
import { ShellToolSecurity } from './shell-tool-security.js';
import { WebToolsHandler } from './web-tools-handler.js';
import { ResourcePoolFactory } from './resource-pools.js';

/**
 * Security validation result
 */
export interface SecurityValidationResult {
  allowed: boolean;
  reason?: string;
  riskLevel?: 'SAFE' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  requiresConfirmation?: boolean;
}

/**
 * Helper methods for the BuiltinToolManager to maintain clean separation of concerns
 */
export class BuiltinToolManagerHelpers {
  
  /**
   * Execute tool with resource pooling and error handling
   */
  static async executeToolOptimized(
    tool: AnyDeclarativeTool,
    toolCall: UnifiedToolCall,
    context: ToolExecutionContext,
    toolBehaviors: ToolBehaviorManager,
    fileSystemBoundary: FileSystemBoundary,
    shellSecurity: ShellToolSecurity,
    webHandler: WebToolsHandler
  ): Promise<UnifiedToolResult> {
    let resourcePool: unknown = null;
    let resource: unknown = null;
    
    try {
      // Acquire appropriate resource if needed
      const resourceType = this.getResourceTypeForTool(toolCall.name);
      if (resourceType) {
        resourcePool = this.getResourcePool(resourceType) as any;
        resource = await (resourcePool as any).acquire(5000); // 5 second timeout
      }
      
      // Build tool invocation (parameters might be undefined)
      const invocation = tool.build(toolCall.parameters || {});
      
      // Handle confirmation flow if needed
      const confirmationDetails = await invocation.shouldConfirmExecute(context.signal);
      if (confirmationDetails) {
        const confirmed = await this.handleConfirmation(confirmationDetails, context);
        if (!confirmed) {
          return {
            toolCallId: toolCall.id,
            content: 'Tool execution cancelled by user',
            isError: false,
            success: false,
          };
        }
      }
      
      // Execute tool with just signal (and optional updateOutput)
      const toolResult = await invocation.execute(
        context.signal,
        context.onProgress // Use onProgress as updateOutput if available
      );
      
      return this.convertFromToolResult(toolCall.id, toolResult);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[BuiltinToolManagerHelpers] Tool execution failed:`, error);
      
      return {
        toolCallId: toolCall.id,
        content: `Tool execution failed: ${errorMessage}`,
        isError: true,
        success: false,
      };
      
    } finally {
      // Release resource back to pool
      if (resourcePool && resource) {
        (resourcePool as any).release(resource);
      }
    }
  }
  
  /**
   * Validate tool security across all security components
   */
  static async validateToolSecurity(
    toolCall: UnifiedToolCall,
    context: ToolExecutionContext,
    toolBehaviors: ToolBehaviorManager,
    fileSystemBoundary: FileSystemBoundary,
    shellSecurity: ShellToolSecurity,
    webHandler: WebToolsHandler
  ): Promise<SecurityValidationResult> {
    try {
      // Check if tool is safe to execute
      const isSafe = toolBehaviors.isToolSafe(toolCall.name);
      if (!isSafe && !context.confirmationCallback) {
        return {
          allowed: false,
          reason: `Tool ${toolCall.name} requires confirmation but no callback provided`,
          riskLevel: 'HIGH',
        };
      }
      
      // Tool-specific security validation
      switch (this.getToolCategory(toolCall.name)) {
        case 'filesystem':
          return await this.validateFileSystemTool(toolCall, fileSystemBoundary);
          
        case 'system':
          if (toolCall.name === 'run_shell_command') {
            return this.validateShellTool(toolCall, shellSecurity);
          }
          break;
          
        case 'web':
          return this.validateWebTool(toolCall, webHandler);
      }
      
      // Default validation
      const defaultConfig = toolBehaviors.getToolConfig(toolCall.name);
      const riskLevel = defaultConfig.requiresConfirmation ? 'MODERATE' : 'SAFE';
      return {
        allowed: true,
        riskLevel: riskLevel as any,
        requiresConfirmation: defaultConfig.requiresConfirmation,
      };
      
    } catch (error) {
      console.error('[BuiltinToolManagerHelpers] Security validation failed:', error);
      return {
        allowed: false,
        reason: 'Security validation error',
        riskLevel: 'CRITICAL',
      };
    }
  }
  
  /**
   * Validate file system tool operations
   */
  private static async validateFileSystemTool(
    toolCall: UnifiedToolCall,
    fileSystemBoundary: FileSystemBoundary
  ): Promise<SecurityValidationResult> {
    const filePath = toolCall.parameters?.['file_path'] || toolCall.parameters?.['path'];
    
    if (filePath && typeof filePath === 'string') {
      try {
        await fileSystemBoundary.validatePath(filePath);
      } catch (error) {
        return {
          allowed: false,
          reason: error instanceof Error ? error.message : 'Path validation failed',
          riskLevel: 'HIGH',
        };
      }
      
      // Check if path should be ignored (like .git, node_modules)
      if (await fileSystemBoundary.shouldIgnorePath(filePath)) {
        return {
          allowed: false,
          reason: 'Path is in ignore list (git ignore, system directories)',
          riskLevel: 'MODERATE',
        };
      }
    }
    
    // Check for batch operations
    const filePaths = toolCall.parameters?.['file_paths'] || toolCall.parameters?.['paths'];
    if (Array.isArray(filePaths)) {
      for (const path of filePaths) {
        if (typeof path === 'string') {
          try {
            await fileSystemBoundary.validatePath(path);
          } catch (error) {
            return {
              allowed: false,
              reason: `Invalid path in batch operation: ${error instanceof Error ? error.message : 'Path validation failed'}`,
              riskLevel: 'HIGH',
            };
          }
        }
      }
    }
    
    return {
      allowed: true,
      riskLevel: 'SAFE',
    };
  }
  
  /**
   * Validate shell tool commands
   */
  private static validateShellTool(
    toolCall: UnifiedToolCall,
    shellSecurity: ShellToolSecurity
  ): SecurityValidationResult {
    const command = toolCall.parameters?.['command'];
    
    if (!command || typeof command !== 'string') {
      return {
        allowed: false,
        reason: 'Invalid or missing shell command',
        riskLevel: 'HIGH',
      };
    }
    
    const validation = shellSecurity.validateCommand(command);
    
    return {
      allowed: validation.allowed,
      reason: validation.reason,
      riskLevel: validation.securityLevel?.toUpperCase() as any,
      requiresConfirmation: validation.securityLevel?.toUpperCase() !== 'SAFE',
    };
  }
  
  /**
   * Validate web tool requests
   */
  private static validateWebTool(
    toolCall: UnifiedToolCall,
    webHandler: WebToolsHandler
  ): SecurityValidationResult {
    // Extract URLs based on tool type
    if (toolCall.name === 'web_fetch') {
      const prompt = toolCall.parameters?.['prompt'];
      if (typeof prompt === 'string') {
        const validation = webHandler.validatePromptUrls(prompt);
        
        if (!validation.overallAllowed) {
          const blockedUrls = validation.validationResults
            .filter(result => !result.allowed)
            .map((result, index) => validation.urls[index]);
          
          return {
            allowed: false,
            reason: `Blocked URLs detected: ${blockedUrls.join(', ')}`,
            riskLevel: 'HIGH',
          };
        }
        
        // Check if any URLs require confirmation
        const requiresConfirmation = validation.validationResults
          .some(result => result.requiresConfirmation);
        
        return {
          allowed: true,
          riskLevel: validation.highestRiskLevel,
          requiresConfirmation,
        };
      }
    } else if (toolCall.name === 'google_web_search') {
      // Web search is generally safe, but check for malicious queries
      const query = toolCall.parameters?.['query'];
      if (typeof query === 'string') {
        // Basic validation for search queries
        const suspiciousPatterns = [/<script>/i, /javascript:/i, /data:/i];
        const hasSuspiciousContent = suspiciousPatterns.some(pattern => 
          pattern.test(query)
        );
        
        if (hasSuspiciousContent) {
          return {
            allowed: false,
            reason: 'Suspicious patterns detected in search query',
            riskLevel: 'MODERATE',
          };
        }
      }
    }
    
    return {
      allowed: true,
      riskLevel: 'SAFE',
    };
  }
  
  /**
   * Handle tool confirmation flow
   */
  private static async handleConfirmation(
    confirmationDetails: ToolCallConfirmationDetails,
    context: ToolExecutionContext
  ): Promise<boolean> {
    if (!context.confirmationCallback) {
      // No confirmation callback provided, default to allowing
      console.warn('[BuiltinToolManagerHelpers] No confirmation callback provided, defaulting to allow');
      return true;
    }
    
    try {
      const confirmRequest: ConfirmationRequest = {
        toolName: confirmationDetails.type === 'exec' ? 
          confirmationDetails.rootCommand || 'unknown' : 'unknown',
        description: this.formatConfirmationMessage(confirmationDetails),
        action: confirmationDetails.type,
        details: {
          title: confirmationDetails.title || 'Confirm Tool Execution',
          type: confirmationDetails.type,
        },
        options: ['proceed', 'cancel'],
      };
      
      const confirmed = await context.confirmationCallback(confirmRequest);
      
      // Handle confirmation outcome
      if (confirmed) {
        if (confirmationDetails.onConfirm) {
          await confirmationDetails.onConfirm(
            ToolConfirmationOutcome.ProceedOnce // Since callback returns boolean, we can't distinguish always vs once
          );
        }
        return true;
      }
      
      return false;
      
    } catch (error) {
      console.error('[BuiltinToolManagerHelpers] Confirmation failed:', error);
      return false; // Default to reject on error
    }
  }
  
  /**
   * Format confirmation message for user display
   */
  private static formatConfirmationMessage(confirmationDetails: ToolCallConfirmationDetails): string {
    switch (confirmationDetails.type) {
      case 'exec':
        const execDetails = confirmationDetails;
        return `Execute command: ${execDetails.command}`;
        
      case 'info':
        const infoDetails = confirmationDetails;
        if (infoDetails.urls && infoDetails.urls.length > 0) {
          return `Fetch content from: ${infoDetails.urls.join(', ')}`;
        }
        return infoDetails.prompt || 'Execute tool operation';
        
      default:
        return 'Confirm tool execution';
    }
  }
  
  /**
   * Convert internal ToolResult to UnifiedToolResult
   */
  private static convertFromToolResult(toolCallId: string, result: ToolResult): UnifiedToolResult {
    // Convert llmContent to proper format
    let content: PartListUnion;
    if (typeof result.llmContent === 'string') {
      content = result.llmContent;
    } else if (Array.isArray(result.llmContent)) {
      content = result.llmContent;
    } else if (result.llmContent && typeof result.llmContent === 'object') {
      // If it's a FileDiff or other object, convert to text
      content = JSON.stringify(result.llmContent);
    } else if (result.returnDisplay && typeof result.returnDisplay === 'string') {
      content = result.returnDisplay;
    } else if (result.returnDisplay && typeof result.returnDisplay === 'object') {
      content = JSON.stringify(result.returnDisplay);
    } else {
      content = '';
    }
    
    return {
      toolCallId,
      content,
      isError: false, // ToolResult doesn't have explicit error field
      success: true, // Assume success if we got a result
      display: result.returnDisplay,
    };
  }
  
  /**
   * Create error result with consistent format
   */
  static createErrorResult(toolCallId: string, errorMessage: string): UnifiedToolResult {
    return {
      toolCallId,
      content: errorMessage,
      isError: true,
      success: false,
      fromCache: false,
    };
  }
  
  /**
   * Get resource type needed for a tool
   */
  private static getResourceTypeForTool(toolName: string): string | null {
    const resourceMap: Record<string, string> = {
      'web_fetch': 'http',
      'google_web_search': 'http',
      'read_file': 'files',
      'write_file': 'files',
      'edit_file': 'files',
      'read_many_files': 'files',
    };
    
    return resourceMap[toolName] || null;
  }
  
  /**
   * Get resource pool for a resource type
   */
  private static getResourcePool(resourceType: string): unknown {
    switch (resourceType) {
      case 'http':
        return ResourcePoolFactory.getHttpPool();
      case 'files':
        return ResourcePoolFactory.getFilePool();
      default:
        return null;
    }
  }
  
  /**
   * Get tool category for security validation
   */
  static getToolCategory(toolName: string): 'filesystem' | 'web' | 'system' | 'other' {
    const categoryMap: Record<string, string> = {
      'read_file': 'filesystem',
      'write_file': 'filesystem',
      'edit_file': 'filesystem',
      'ls': 'filesystem',
      'glob': 'filesystem',
      'grep': 'filesystem',
      'read_many_files': 'filesystem',
      'web_fetch': 'web',
      'google_web_search': 'web',
      'run_shell_command': 'system',
      'save_memory': 'system',
    };
    
    return (categoryMap[toolName] as any) || 'other';
  }
  
  /**
   * Check if tool results should be cached
   */
  static shouldCacheResult(toolName: string): boolean {
    const cacheableTools = [
      'read_file',
      'web_fetch',
      'google_web_search',
      'ls',
      'glob',
      'grep',
    ];
    
    return cacheableTools.includes(toolName);
  }
  
  /**
   * Pre-warm commonly used tools for better initial performance
   */
  static async preWarmTools(builtinTools: Map<string, AnyDeclarativeTool>): Promise<void> {
    const commonTools = ['read_file', 'write_file', 'ls'];
    
    // Pre-create resource pools
    ResourcePoolFactory.getHttpPool();
    ResourcePoolFactory.getFilePool();
    
    console.debug(`[BuiltinToolManagerHelpers] Pre-warmed ${commonTools.length} common tools`);
  }
  
  /**
   * Record execution statistics
   */
  static recordExecution(
    toolName: string,
    executionTime: number,
    success: boolean,
    stats: any, // Stats object structure varies by implementation
    performanceOptimizer: any // Performance optimizer is an external system
  ): void {
    // Update internal statistics
    if (success) {
      stats.successfulExecutions++;
    }
    
    // Update execution times (keep last 50)
    stats.lastExecutionTimes.push(executionTime);
    if (stats.lastExecutionTimes.length > 50) {
      stats.lastExecutionTimes.shift();
    }
    
    // Calculate average execution time
    stats.averageExecutionTime = 
      stats.lastExecutionTimes.reduce((a: number, b: number) => a + b, 0) / stats.lastExecutionTimes.length;
    
    // Record in performance optimizer
    performanceOptimizer.recordExecution(toolName, executionTime, success);
  }
  
  /**
   * Convert Gemini schema to unified tool format
   */
  static convertToUnified(declaration: unknown, tool: AnyDeclarativeTool): UnifiedTool {
    const decl = declaration as any;
    return {
      name: tool.name,
      description: tool.description,
      parameters: decl.parameters || {
        type: 'object',
        properties: {},
        required: [],
      },
      kind: (tool as any).kind,
      isOutputMarkdown: (tool as any).isOutputMarkdown,
      canUpdateOutput: (tool as any).canUpdateOutput,
    };
  }
}