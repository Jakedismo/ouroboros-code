# Gemini Provider MCP Integration Guide

This document provides step-by-step instructions for implementing MCP tool support in the Gemini provider.

## Prerequisites

The MCP tools infrastructure is complete in the `mcp-tools/` worktree and includes:

- ✅ Unified tool interface with extensible adapter pattern
- ✅ `MCPToolManager` - Tool discovery and execution
- ✅ `ToolExecutionOrchestrator` - Parallel execution with progress tracking
- ✅ Configuration and error handling systems

**Note**: Gemini tool adapter will need to be implemented following the established pattern.

## Implementation Guide

### 1. Create Gemini Tool Adapter

First, implement `packages/core/src/providers/gemini/tool-adapter.ts`:

```typescript
import {
  ToolFormatConverter,
  UnifiedTool,
  UnifiedToolCall,
  UnifiedToolResult,
} from '../tools/unified-tool-interface.js';
import {
  Content,
  FunctionDeclaration,
  FunctionCall,
  FunctionResponse,
} from '@google/generative-ai';
import { ToolConversionError } from '../tools/error-handling.js';

/**
 * Gemini-specific tool call format.
 */
export interface GeminiFunctionCall {
  name: string;
  args: Record<string, any>;
}

/**
 * Gemini-specific function response format.
 */
export interface GeminiFunctionResponse {
  name: string;
  response: any;
}

/**
 * Tool format converter for Gemini provider.
 * Handles conversion between unified format and Gemini's function calling format.
 */
export class GeminiToolAdapter extends ToolFormatConverter {
  /**
   * Convert unified tool to Gemini FunctionDeclaration format.
   */
  toProviderFormat(tool: UnifiedTool): FunctionDeclaration {
    try {
      return {
        name: tool.name,
        description: tool.description,
        parameters: this.convertParametersToGeminiSchema(tool.parameters),
      };
    } catch (error: any) {
      throw ToolConversionError.schemaConversion(
        'unified',
        'gemini',
        `Failed to convert tool ${tool.name}: ${error.message}`,
      );
    }
  }

  /**
   * Convert Gemini function call to unified format.
   */
  fromProviderToolCall(functionCall: FunctionCall): UnifiedToolCall {
    try {
      return {
        id: this.generateCallId(),
        name: functionCall.name,
        arguments: functionCall.args || {},
      };
    } catch (error: any) {
      throw ToolConversionError.callConversion(
        'gemini',
        'unified',
        `Failed to convert function call: ${error.message}`,
      );
    }
  }

  /**
   * Convert unified tool result to Gemini function response.
   */
  toProviderToolResult(result: UnifiedToolResult): Content {
    try {
      const functionResponse: FunctionResponse = {
        name: result.toolName || 'unknown',
        response: result.content,
      };

      return {
        role: 'function',
        parts: [
          {
            functionResponse,
          },
        ],
      };
    } catch (error: any) {
      throw ToolConversionError.resultConversion(
        'unified',
        'gemini',
        `Failed to convert tool result: ${error.message}`,
      );
    }
  }

  /**
   * Format tools for Gemini API request.
   */
  formatToolsForRequest(tools: UnifiedTool[]): {
    tools: { functionDeclarations: FunctionDeclaration[] };
    toolConfig?: any;
  } {
    const functionDeclarations = tools.map((tool) =>
      this.toProviderFormat(tool),
    );

    return {
      tools: { functionDeclarations },
      toolConfig: {
        functionCallingConfig: {
          mode: 'AUTO',
          allowedFunctionNames: tools.map((t) => t.name),
        },
      },
    };
  }

  /**
   * Extract function calls from Gemini response.
   */
  extractFunctionCalls(candidate: any): FunctionCall[] {
    const functionCalls: FunctionCall[] = [];

    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.functionCall) {
          functionCalls.push(part.functionCall);
        }
      }
    }

    return functionCalls;
  }

  /**
   * Convert streaming function call chunks.
   * Gemini typically provides complete function calls in streaming, not partial ones.
   */
  accumulateStreamingFunctionCall(
    streamChunk: any,
    accumulatedCalls: GeminiFunctionCall[],
  ): GeminiFunctionCall[] {
    const candidate = streamChunk.candidates?.[0];
    if (!candidate) return accumulatedCalls;

    const functionCalls = this.extractFunctionCalls(candidate);

    for (const call of functionCalls) {
      // Check if we already have this call
      const existing = accumulatedCalls.find(
        (c) =>
          c.name === call.name &&
          JSON.stringify(c.args) === JSON.stringify(call.args),
      );

      if (!existing) {
        accumulatedCalls.push({
          name: call.name,
          args: call.args || {},
        });
      }
    }

    return accumulatedCalls;
  }

  /**
   * Check if function calls are complete.
   */
  getFunctionCallsFromChunk(chunk: any): FunctionCall[] {
    return this.extractFunctionCalls(chunk.candidates?.[0]);
  }

  /**
   * Create error result in unified format.
   */
  createErrorResult(callId: string, error: string): UnifiedToolResult {
    return {
      toolCallId: callId,
      content: error,
      isError: true,
      error,
    };
  }

  /**
   * Convert parameters to Gemini schema format.
   */
  private convertParametersToGeminiSchema(parameters: any): any {
    if (!parameters || typeof parameters !== 'object') {
      return { type: 'object', properties: {} };
    }

    // Gemini uses a similar schema format to JSON Schema
    const converted: any = {
      type: parameters.type || 'object',
      description: parameters.description,
      properties: {},
    };

    if (parameters.properties) {
      for (const [propName, propSchema] of Object.entries(
        parameters.properties,
      )) {
        converted.properties[propName] = this.convertPropertySchema(
          propSchema as any,
        );
      }
    }

    if (parameters.required && Array.isArray(parameters.required)) {
      converted.required = parameters.required;
    }

    return converted;
  }

  /**
   * Convert individual property schema.
   */
  private convertPropertySchema(schema: any): any {
    const converted: any = {
      type: schema.type,
      description: schema.description,
    };

    // Handle type-specific properties
    switch (schema.type) {
      case 'string':
        if (schema.enum) converted.enum = schema.enum;
        if (schema.pattern) converted.pattern = schema.pattern;
        if (schema.minLength) converted.minLength = schema.minLength;
        if (schema.maxLength) converted.maxLength = schema.maxLength;
        break;

      case 'number':
      case 'integer':
        if (schema.minimum !== undefined) converted.minimum = schema.minimum;
        if (schema.maximum !== undefined) converted.maximum = schema.maximum;
        if (schema.enum) converted.enum = schema.enum;
        break;

      case 'array':
        if (schema.items) {
          converted.items = this.convertPropertySchema(schema.items);
        }
        if (schema.minItems) converted.minItems = schema.minItems;
        if (schema.maxItems) converted.maxItems = schema.maxItems;
        break;

      case 'object':
        if (schema.properties) {
          converted.properties = {};
          for (const [propName, propSchema] of Object.entries(
            schema.properties,
          )) {
            converted.properties[propName] = this.convertPropertySchema(
              propSchema as any,
            );
          }
        }
        if (schema.required) converted.required = schema.required;
        break;
    }

    return converted;
  }

  /**
   * Generate unique call ID for Gemini function calls.
   */
  private generateCallId(): string {
    return `gemini_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

### 2. Provider Class Structure

Create `packages/core/src/providers/gemini/provider-with-tools.ts`:

```typescript
import {
  Content,
  GenerativeModel,
  StartChatParams,
} from '@google/generative-ai';
import { GeminiProvider } from './provider.js'; // Existing provider
import { GeminiToolAdapter } from './tool-adapter.js'; // ✅ Ready
import { MCPToolManager } from '../tools/mcp-tool-manager.js'; // ✅ Ready
import {
  ToolExecutionOrchestrator,
  ToolExecutionContext,
} from '../tools/tool-execution-flow.js'; // ✅ Ready
import {
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';

export class GeminiProviderWithMCP extends GeminiProvider {
  private toolAdapter: GeminiToolAdapter;
  private mcpManager: MCPToolManager;

  constructor(config: any) {
    super(config);
    this.toolAdapter = new GeminiToolAdapter();
    this.mcpManager = new MCPToolManager(config.configInstance);
  }

  async initialize(): Promise<void> {
    await this.mcpManager.initialize();
  }

  // Implementation details below...
}
```

### 3. Non-Streaming Tool Execution

Implement the tool execution loop for `generateContent`:

```typescript
async generateContent(
  request: GenerateContentParameters,
  userPromptId: string
): Promise<GenerateContentResponse> {
  // Get available tools from MCP manager
  const unifiedTools = this.mcpManager.getUnifiedTools();
  const { tools, toolConfig } = this.toolAdapter.formatToolsForRequest(unifiedTools);

  // Create model with tools
  const model = this.createModelWithTools(tools, toolConfig);
  const chat = model.startChat({
    history: this.convertChatHistory(request.history),
  });

  const maxRounds = this.getMaxToolRounds();
  let currentMessage = this.convertToGeminiPrompt(request.prompt);

  // Tool execution loop
  for (let round = 0; round < maxRounds; round++) {
    const result = await chat.sendMessage(currentMessage);
    const response = await result.response;

    // Extract function calls from response
    const functionCalls = this.toolAdapter.extractFunctionCalls(response.candidates?.[0]);

    if (functionCalls.length > 0) {
      // Convert to unified format
      const unifiedCalls = functionCalls.map(
        call => this.toolAdapter.fromProviderToolCall(call)
      );

      // Execute tools using orchestrator
      const orchestrator = new ToolExecutionOrchestrator(
        this.mcpManager,
        this.createExecutionContext(userPromptId)
      );

      const executionResult = await orchestrator.executeToolCallsInParallel(
        unifiedCalls
      );

      // Convert results to Gemini format and add to chat
      const functionResponses = executionResult.results.map(
        result => this.toolAdapter.toProviderToolResult(result)
      );

      // Continue conversation with function results
      for (const functionResponse of functionResponses) {
        const nextResult = await chat.sendMessage([functionResponse]);
        // Continue with next iteration if needed
      }

      // For the next round, use an empty message to let model respond to function results
      currentMessage = '';
      continue;
    } else {
      // No function calls, return final response
      return this.convertFromGeminiFormat(result);
    }
  }

  throw new Error(`Maximum tool rounds (${maxRounds}) exceeded`);
}
```

### 4. Streaming Tool Execution

**CRITICAL**: Implement streaming with function call handling:

```typescript
async *generateContentStream(
  request: GenerateContentParameters,
  userPromptId: string
): AsyncIterable<GenerateContentResponse> {
  // Get tools and prepare model
  const unifiedTools = this.mcpManager.getUnifiedTools();
  const { tools, toolConfig } = this.toolAdapter.formatToolsForRequest(unifiedTools);

  const model = this.createModelWithTools(tools, toolConfig);
  const chat = model.startChat({
    history: this.convertChatHistory(request.history),
  });

  const maxRounds = this.getMaxToolRounds();
  let currentMessage = this.convertToGeminiPrompt(request.prompt);

  for (let round = 0; round < maxRounds; round++) {
    const streamResult = await chat.sendMessageStream(currentMessage);

    let accumulatedFunctionCalls: any[] = [];
    let hasTextContent = false;
    let responseText = '';

    // Process stream chunks
    for await (const chunk of streamResult.stream) {
      // Handle function calls
      const functionCalls = this.toolAdapter.getFunctionCallsFromChunk(chunk);
      if (functionCalls.length > 0) {
        accumulatedFunctionCalls.push(...functionCalls);
      }

      // Handle text content
      if (chunk.text) {
        hasTextContent = true;
        responseText += chunk.text;
        yield this.convertStreamChunkFromGemini(chunk);
      }
    }

    // Execute accumulated function calls
    if (accumulatedFunctionCalls.length > 0) {
      // Convert to unified format
      const unifiedCalls = accumulatedFunctionCalls.map(
        call => this.toolAdapter.fromProviderToolCall(call)
      );

      const orchestrator = new ToolExecutionOrchestrator(
        this.mcpManager,
        this.createExecutionContext(userPromptId)
      );

      const executionResult = await orchestrator.executeToolCallsInParallel(
        unifiedCalls
      );

      // Stream tool results immediately
      for (const result of executionResult.results) {
        yield this.createToolResultResponse(result);
      }

      // Convert results to Gemini format for continuation
      const functionResponses = executionResult.results.map(
        result => this.toolAdapter.toProviderToolResult(result)
      );

      // Send function responses to continue conversation
      for (const functionResponse of functionResponses) {
        const nextStreamResult = await chat.sendMessageStream([functionResponse]);

        // Stream the model's response to function results
        for await (const chunk of nextStreamResult.stream) {
          if (chunk.text) {
            yield this.convertStreamChunkFromGemini(chunk);
          }
        }
      }

      // Continue to next round if needed
      currentMessage = '';
      continue;
    } else {
      // No function calls, streaming complete
      return;
    }
  }
}
```

### 5. Helper Methods

Implement required helper methods:

```typescript
private createModelWithTools(tools: any, toolConfig: any): GenerativeModel {
  return this.genAI.getGenerativeModel({
    model: this.modelName,
    tools: [tools],
    toolConfig,
    generationConfig: {
      temperature: this.config.temperature,
      maxOutputTokens: this.getMaxTokens(),
    },
  });
}

private createExecutionContext(userPromptId: string): ToolExecutionContext {
  return {
    config: this.config,
    abortSignal: new AbortController().signal,
    providerId: 'gemini',
    maxConcurrentTools: this.getMaxConcurrentTools(),
    timeoutMs: this.getToolTimeoutMs(),
    onProgress: (message, toolName) => {
      console.log(`[Gemini] ${message}`, toolName ? `(${toolName})` : '');
    },
    onConfirmation: async (details) => {
      return this.handleToolConfirmation(details);
    },
  };
}

private getMaxTokens(): number {
  return this.config.mcpConfig?.toolSettings?.gemini?.maxOutputTokens ?? 8192;
}

private getMaxToolRounds(): number {
  return this.config.mcpConfig?.toolSettings?.gemini?.maxFunctionCalls ?? 10;
}

private getMaxConcurrentTools(): number {
  return this.config.mcpConfig?.toolExecution?.maxConcurrentTools ?? 3;
}

private getToolTimeoutMs(): number {
  return this.config.mcpConfig?.toolExecution?.timeoutMs ?? 30000;
}

private createToolResultResponse(result: UnifiedToolResult): GenerateContentResponse {
  // Convert unified tool result to streaming response format
  const content = typeof result.content === 'string'
    ? result.content
    : JSON.stringify(result.content);

  return {
    candidates: [{
      content: {
        parts: [{
          text: `🔧 Function ${result.toolCallId} ${result.isError ? 'failed' : 'completed'}: ${content}`
        }],
        role: 'model',
      },
      finishReason: 'STOP',
    }],
  };
}

private convertStreamChunkFromGemini(chunk: any): GenerateContentResponse {
  // Convert Gemini stream chunk to GenerateContentResponse format
  return {
    candidates: [{
      content: {
        parts: [{ text: chunk.text || '' }],
        role: 'model',
      },
      finishReason: null,
    }],
  };
}

private async handleToolConfirmation(details: any): Promise<ToolConfirmationOutcome> {
  const mode = this.config.mcpConfig?.toolExecution?.confirmationMode ?? 'smart';

  switch (mode) {
    case 'never':
      return ToolConfirmationOutcome.ProceedOnce;
    case 'always':
      return await this.showConfirmationDialog(details);
    case 'smart':
      // Gemini-specific smart confirmation logic
      return this.shouldAutoConfirm(details)
        ? ToolConfirmationOutcome.ProceedOnce
        : await this.showConfirmationDialog(details);
  }
}

private shouldAutoConfirm(details: any): boolean {
  // Gemini-specific auto-confirmation logic
  const safeTools = ['search', 'read_file', 'get_weather', 'calculator'];
  return safeTools.includes(details.toolName);
}
```

### 6. Error Handling Integration

Use the comprehensive error system:

```typescript
import { ErrorHandler, ToolExecutionError } from '../tools/error-handling.js';

// In your streaming method:
try {
  const result = await orchestrator.executeToolCallsInParallel(unifiedCalls);
  for (const toolResult of result.results) {
    yield this.createToolResultResponse(toolResult);
  }
} catch (error) {
  const context = ErrorHandler.createToolExecutionContext(
    'gemini',
    'batch_execution',
    'streaming_context',
  );
  const providerError = ErrorHandler.handle(error, context);

  // Log with full context
  ErrorHandler.logError(providerError, context, 'warn');

  // Create error response and continue streaming
  const errorResult = providerError.toUnifiedResult('batch_error');
  yield this.createToolResultResponse(errorResult);

  // Determine if we should continue or abort
  if (!ErrorHandler.isRecoverable(providerError)) {
    throw providerError;
  }
}
```

### 7. Configuration Integration

Ensure proper configuration loading:

```typescript
constructor(config: any) {
  super(config);

  // Load MCP configuration with Gemini-specific defaults
  const mcpConfig = MultiProviderMCPConfigMerger.merge(
    config.mcpConfig || {},
    {
      ...DEFAULT_MULTI_PROVIDER_MCP_CONFIG,
      toolSettings: {
        gemini: {
          functionCallingMode: 'FUNCTION_CALLING',
          maxFunctionCalls: 10,
          allowCodeExecution: true,
          maxOutputTokens: 8192,
          toolConfig: {
            functionCallingConfig: {
              mode: 'AUTO'
            }
          }
        }
      }
    }
  );

  this.config = { ...config, mcpConfig };
  this.toolAdapter = new GeminiToolAdapter();
  this.mcpManager = new MCPToolManager(config.configInstance);
}
```

### 8. Gemini-Specific Considerations

#### Function Calling Mode

Gemini supports different function calling modes:

```typescript
// Configure function calling behavior
const toolConfig = {
  functionCallingConfig: {
    mode: 'AUTO', // AUTO, ANY, NONE
    allowedFunctionNames: tools.map((t) => t.name), // Optional restriction
  },
};
```

#### Content Format

Gemini uses a specific content format for function responses:

```typescript
// Correct function response format
const functionResponseContent: Content = {
  role: 'function',
  parts: [
    {
      functionResponse: {
        name: functionName,
        response: result.content,
      },
    },
  ],
};
```

#### Streaming Behavior

Gemini typically provides complete function calls in streaming chunks:

```typescript
// Handle complete function calls from streaming
for await (const chunk of streamResult.stream) {
  const functionCalls = this.toolAdapter.getFunctionCallsFromChunk(chunk);
  if (functionCalls.length > 0) {
    // Execute immediately - Gemini usually provides complete calls
    await this.executeFunctionCalls(functionCalls);
  }
}
```

#### Model Selection

Different Gemini models have different capabilities:

```typescript
// Choose appropriate model for function calling
const modelName =
  this.config.mcpConfig?.toolSettings?.gemini?.model || 'gemini-1.5-pro';

// Some models may have different function calling capabilities
if (modelName.includes('gemini-1.5')) {
  // Enhanced function calling support
  toolConfig.functionCallingConfig.mode = 'AUTO';
} else {
  // Basic function calling
  toolConfig.functionCallingConfig.mode = 'ANY';
}
```

### 9. Testing Requirements

#### Unit Tests

Create `packages/core/src/providers/gemini/__tests__/provider-with-tools.test.ts`:

```typescript
describe('GeminiProviderWithMCP', () => {
  it('should handle function calls correctly', async () => {
    // Test function call extraction and execution
  });

  it('should stream function results immediately', async () => {
    // Test streaming function execution
  });

  it('should handle function calling modes', async () => {
    // Test AUTO, ANY, NONE modes
  });

  it('should respect model-specific capabilities', async () => {
    // Test different model behavior
  });
});
```

#### Gemini-Specific Tests

```typescript
describe('Gemini Function Integration', () => {
  it('should handle Gemini function response format', async () => {
    // Test with actual Gemini API responses
  });

  it('should respect Gemini rate limits', async () => {
    // Test rate limiting behavior
  });

  it('should handle different model capabilities', async () => {
    // Test with gemini-1.5-pro, gemini-pro, etc.
  });
});
```

### 10. Performance Optimizations

#### Function Call Batching

Gemini can handle multiple function calls efficiently:

```typescript
// Execute multiple functions in parallel
const executionResult = await orchestrator.executeToolCallsInParallel(
  functionCalls.map((call) => this.toolAdapter.fromProviderToolCall(call)),
  {
    maxConcurrency: this.getMaxConcurrentTools(),
    failFast: false, // Continue even if some functions fail
  },
);
```

#### Streaming Efficiency

Process function calls as soon as they're complete:

```typescript
// Don't wait for stream completion to execute functions
for await (const chunk of streamResult.stream) {
  const functionCalls = this.toolAdapter.getFunctionCallsFromChunk(chunk);
  if (functionCalls.length > 0) {
    // Execute and stream results immediately
    const results = await this.executeFunctionCalls(functionCalls);
    for (const result of results) {
      yield this.createToolResultResponse(result);
    }
  }
}
```

## Validation Checklist

- [ ] GeminiToolAdapter implemented with function calling format
- [ ] Tool execution loop implemented with Gemini chat interface
- [ ] Streaming function call handling working
- [ ] Function response format correctly implemented
- [ ] Error handling with graceful degradation
- [ ] Configuration loading with Gemini defaults
- [ ] Function calling mode configuration
- [ ] Tests covering Gemini-specific scenarios
- [ ] Performance optimizations applied

## Common Pitfalls

1. **Function Response Format**: Gemini requires specific function response structure
2. **Model Capabilities**: Different models have different function calling support
3. **Streaming Completeness**: Gemini usually provides complete function calls in chunks
4. **Content Parts**: Handle mixed content (text + function calls) correctly
5. **Chat Context**: Maintain proper chat history with function calls and responses

## Gemini-Specific Features

1. **Function Calling Modes**: AUTO, ANY, NONE for different use cases
2. **Model Variety**: Different models with varying capabilities
3. **Code Execution**: Built-in support for code execution functions
4. **Rich Content**: Support for images and other media in function responses
5. **Context Length**: Large context windows for complex tool interactions

---

**Status**: Implementation Guide Complete 📋 | Ready for Gemini Integration 🚀
