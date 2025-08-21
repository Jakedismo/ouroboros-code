# OpenAI Provider MCP Integration Guide

This document provides step-by-step instructions for implementing MCP tool support in the OpenAI provider.

## Prerequisites

The MCP tools infrastructure is complete in the `mcp-tools/` worktree and includes:

- ✅ `OpenAIToolAdapter` - Complete format conversion with streaming support
- ✅ `MCPToolManager` - Tool discovery and execution
- ✅ `ToolExecutionOrchestrator` - Parallel execution with progress tracking
- ✅ Configuration and error handling systems

## Implementation Guide

### 1. Provider Class Structure

Create `packages/core/src/providers/openai/provider-with-tools.ts`:

```typescript
import OpenAI from 'openai';
import { OpenAIProvider } from './provider.js'; // Existing provider
import { OpenAIToolAdapter } from './tool-adapter.js'; // ✅ Ready
import { MCPToolManager } from '../tools/mcp-tool-manager.js'; // ✅ Ready
import {
  ToolExecutionOrchestrator,
  ToolExecutionContext,
} from '../tools/tool-execution-flow.js'; // ✅ Ready
import {
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';

export class OpenAIProviderWithMCP extends OpenAIProvider {
  private toolAdapter: OpenAIToolAdapter;
  private mcpManager: MCPToolManager;

  constructor(config: any) {
    super(config);
    this.toolAdapter = new OpenAIToolAdapter();
    this.mcpManager = new MCPToolManager(config.configInstance);
  }

  async initialize(): Promise<void> {
    await this.mcpManager.initialize();
  }

  // Implementation details below...
}
```

### 2. Non-Streaming Tool Execution

Implement the tool execution loop for `generateContent`:

```typescript
async generateContent(
  request: GenerateContentParameters,
  userPromptId: string
): Promise<GenerateContentResponse> {
  // Get available tools from MCP manager
  const unifiedTools = this.mcpManager.getUnifiedTools();
  const { tools, tool_choice } = this.toolAdapter.formatToolsForRequest(unifiedTools);

  // Convert request to OpenAI format with tools
  const openaiRequest = {
    ...this.convertToOpenAIFormat(request),
    tools,
    tool_choice,
  };

  let messages = [...openaiRequest.messages];
  const maxRounds = this.getMaxToolRounds(); // From config

  // Tool execution loop
  for (let round = 0; round < maxRounds; round++) {
    const response = await this.client.chat.completions.create({
      ...openaiRequest,
      messages,
    });

    const choice = response.choices[0];

    // Check if model wants to call tools
    if (choice.message.tool_calls?.length > 0) {
      // Add assistant message with tool calls
      messages.push(choice.message);

      // Convert to unified format
      const unifiedCalls = choice.message.tool_calls.map(
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

      // Add tool results to messages
      for (const result of executionResult.results) {
        const toolMessage = this.toolAdapter.toProviderToolResult(result);
        messages.push(toolMessage);
      }

      // Continue to next round
      continue;
    } else {
      // No more tool calls, return final response
      return this.convertFromOpenAIFormat(response);
    }
  }

  throw new Error(`Maximum tool rounds (${maxRounds}) exceeded`);
}
```

### 3. Streaming Tool Execution

**CRITICAL**: Implement streaming with tool call accumulation:

```typescript
async *generateContentStream(
  request: GenerateContentParameters,
  userPromptId: string
): AsyncIterable<GenerateContentResponse> {
  // Get tools and prepare request
  const unifiedTools = this.mcpManager.getUnifiedTools();
  const { tools, tool_choice } = this.toolAdapter.formatToolsForRequest(unifiedTools);

  const openaiRequest = {
    ...this.convertToOpenAIFormat(request),
    tools,
    tool_choice,
    stream: true,
  };

  let messages = [...openaiRequest.messages];
  const maxRounds = this.getMaxToolRounds();

  for (let round = 0; round < maxRounds; round++) {
    const stream = await this.client.chat.completions.create(openaiRequest);

    let accumulatedToolCalls: any[] = [];
    let hasContent = false;

    // Process stream chunks
    for await (const chunk of stream) {
      const choice = chunk.choices[0];

      // Handle tool calls in stream
      if (choice?.delta?.tool_calls) {
        accumulatedToolCalls = this.toolAdapter.accumulateStreamingToolCall(
          chunk,
          accumulatedToolCalls
        );
      }

      // Handle text content
      if (choice?.delta?.content) {
        hasContent = true;
        yield this.convertStreamChunkFromOpenAI(chunk);
      }

      // Handle stream end
      if (choice?.finish_reason) {
        break;
      }
    }

    // Execute complete tool calls
    const completeToolCalls = this.toolAdapter.getCompleteToolCalls(accumulatedToolCalls);

    if (completeToolCalls.length > 0) {
      // Add assistant message with tool calls
      messages.push({
        role: 'assistant',
        content: hasContent ? null : '',
        tool_calls: completeToolCalls,
      });

      // Convert to unified format and execute
      const unifiedCalls = completeToolCalls.map(
        call => this.toolAdapter.fromProviderToolCall(call)
      );

      const orchestrator = new ToolExecutionOrchestrator(
        this.mcpManager,
        this.createExecutionContext(userPromptId)
      );

      const executionResult = await orchestrator.executeToolCallsInParallel(
        unifiedCalls
      );

      // Stream tool results
      for (const result of executionResult.results) {
        yield this.createToolResultResponse(result);

        // Add to messages for next round
        const toolMessage = this.toolAdapter.toProviderToolResult(result);
        messages.push(toolMessage);
      }

      // Continue to next round
      continue;
    } else {
      // No tools executed, streaming complete
      return;
    }
  }
}
```

### 4. Helper Methods

Implement required helper methods:

```typescript
private createExecutionContext(userPromptId: string): ToolExecutionContext {
  return {
    config: this.config, // Your config instance
    abortSignal: new AbortController().signal,
    providerId: 'openai',
    maxConcurrentTools: this.getMaxConcurrentTools(),
    timeoutMs: this.getToolTimeoutMs(),
    onProgress: (message, toolName) => {
      console.log(`[OpenAI] ${message}`, toolName ? `(${toolName})` : '');
    },
    onConfirmation: async (details) => {
      // Handle tool confirmation - integrate with your UI
      return this.handleToolConfirmation(details);
    },
  };
}

private getMaxToolRounds(): number {
  // Get from provider-specific config or use default
  return this.config.mcpConfig?.toolSettings?.openai?.maxToolRounds ?? 10;
}

private getMaxConcurrentTools(): number {
  return this.config.mcpConfig?.toolExecution?.maxConcurrentTools ?? 3;
}

private getToolTimeoutMs(): number {
  return this.config.mcpConfig?.toolExecution?.timeoutMs ?? 30000;
}

private createToolResultResponse(result: UnifiedToolResult): GenerateContentResponse {
  // Convert unified tool result to streaming response format
  return {
    candidates: [{
      content: {
        parts: [{ text: `Tool ${result.toolCallId} result: ${result.content}` }],
        role: 'model',
      },
      finishReason: 'STOP',
    }],
  };
}

private async handleToolConfirmation(details: any): Promise<ToolConfirmationOutcome> {
  // Integrate with your existing confirmation system
  // For now, auto-approve based on config
  const mode = this.config.mcpConfig?.toolExecution?.confirmationMode ?? 'smart';

  switch (mode) {
    case 'never':
      return ToolConfirmationOutcome.ProceedOnce;
    case 'always':
      // Show confirmation dialog
      return await this.showConfirmationDialog(details);
    case 'smart':
      // Smart confirmation based on tool risk
      return this.shouldAutoConfirm(details)
        ? ToolConfirmationOutcome.ProceedOnce
        : await this.showConfirmationDialog(details);
  }
}
```

### 5. Error Handling Integration

Use the comprehensive error system:

```typescript
import { ErrorHandler, ToolExecutionError } from '../tools/error-handling.js';

// In your methods, wrap tool operations:
try {
  const result = await orchestrator.executeToolCallsInParallel(unifiedCalls);
} catch (error) {
  const context = ErrorHandler.createToolExecutionContext(
    'openai',
    'batch_execution',
  );
  const providerError = ErrorHandler.handle(error, context);

  // Log error with context
  ErrorHandler.logError(providerError, context);

  // Convert to appropriate response
  const errorResult = providerError.toUnifiedResult('batch_error');
  const toolMessage = this.toolAdapter.toProviderToolResult(errorResult);
  messages.push(toolMessage);

  // Continue execution or throw based on severity
  if (ErrorHandler.isRecoverable(providerError)) {
    continue; // Try next round
  } else {
    throw providerError;
  }
}
```

### 6. Configuration Integration

Ensure proper configuration loading:

```typescript
constructor(config: any) {
  super(config);

  // Load MCP configuration with OpenAI-specific defaults
  const mcpConfig = MultiProviderMCPConfigMerger.merge(
    config.mcpConfig || {},
    {
      ...DEFAULT_MULTI_PROVIDER_MCP_CONFIG,
      toolSettings: {
        openai: {
          parallelToolCalls: true,
          maxToolRounds: 10,
          toolChoice: 'auto',
          toolCallTimeoutMs: 30000,
        }
      }
    }
  );

  this.config = { ...config, mcpConfig };
  this.toolAdapter = new OpenAIToolAdapter();
  this.mcpManager = new MCPToolManager(config.configInstance);
}
```

### 7. Factory Integration

Update factory registration (if not using dynamic imports):

```typescript
// In factory-with-mcp.ts, the factory will automatically load your provider:
case LLMProvider.OPENAI:
  const { OpenAIProviderWithMCP } = await import('./openai/provider-with-tools.js');
  provider = new OpenAIProviderWithMCP(config);
  await provider.initialize();
  break;
```

## Testing Requirements

### 1. Unit Tests

Create `packages/core/src/providers/openai/__tests__/provider-with-tools.test.ts`:

```typescript
describe('OpenAIProviderWithMCP', () => {
  it('should execute tools in non-streaming mode', async () => {
    // Test tool execution loop
  });

  it('should handle streaming tool calls', async () => {
    // Test streaming with tool accumulation
  });

  it('should handle tool errors gracefully', async () => {
    // Test error scenarios
  });

  it('should respect concurrency limits', async () => {
    // Test parallel execution limits
  });
});
```

### 2. Integration Tests

Test with actual MCP tools:

```typescript
describe('OpenAI MCP Integration', () => {
  it('should execute real MCP tools', async () => {
    // End-to-end integration test
  });
});
```

## Performance Considerations

1. **Tool Call Batching**: OpenAI supports parallel tool calls - use them
2. **Streaming Efficiency**: Accumulate tool calls efficiently during streaming
3. **Error Recovery**: Handle partial failures gracefully
4. **Connection Reuse**: Reuse HTTP connections for tool execution

## Validation Checklist

- [ ] Tool execution loop implemented
- [ ] Streaming tool support added
- [ ] Error handling integrated
- [ ] Configuration properly loaded
- [ ] Factory integration complete
- [ ] Tests written and passing
- [ ] Performance optimizations applied
- [ ] Documentation updated

## Common Pitfalls

1. **Tool Call Accumulation**: Don't execute partial tool calls from streaming
2. **Message History**: Maintain correct OpenAI message format
3. **Error Handling**: Don't let tool errors break the conversation
4. **Configuration**: Use provider-specific settings from MCP config
5. **Timeouts**: Respect both OpenAI and MCP timeouts

---

**Status**: Infrastructure Ready ✅ | Implementation Guide Complete 📋
