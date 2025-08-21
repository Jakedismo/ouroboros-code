# Anthropic Provider MCP Integration Guide

This document provides step-by-step instructions for implementing MCP tool support in the Anthropic (Claude) provider.

## Prerequisites

The MCP tools infrastructure is complete in the `mcp-tools/` worktree and includes:

- ✅ `AnthropicToolAdapter` - Complete format conversion with streaming support
- ✅ `MCPToolManager` - Tool discovery and execution
- ✅ `ToolExecutionOrchestrator` - Parallel execution with progress tracking
- ✅ Configuration and error handling systems

## Implementation Guide

### 1. Provider Class Structure

Create `packages/core/src/providers/anthropic/provider-with-tools.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicProvider } from './provider.js'; // Existing provider
import { AnthropicToolAdapter } from './tool-adapter.js'; // ✅ Ready
import { MCPToolManager } from '../tools/mcp-tool-manager.js'; // ✅ Ready
import {
  ToolExecutionOrchestrator,
  ToolExecutionContext,
} from '../tools/tool-execution-flow.js'; // ✅ Ready
import {
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';

export class AnthropicProviderWithMCP extends AnthropicProvider {
  private toolAdapter: AnthropicToolAdapter;
  private mcpManager: MCPToolManager;

  constructor(config: any) {
    super(config);
    this.toolAdapter = new AnthropicToolAdapter();
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
  const { tools } = this.toolAdapter.formatToolsForRequest(unifiedTools);

  // Convert request to Anthropic format with tools
  const anthropicRequest = {
    ...this.convertToAnthropicFormat(request),
    tools,
    max_tokens: this.getMaxTokens(),
  };

  let messages = [...anthropicRequest.messages];
  const maxRounds = this.getMaxToolRounds();

  // Tool execution loop
  for (let round = 0; round < maxRounds; round++) {
    const response = await this.client.messages.create({
      ...anthropicRequest,
      messages,
    });

    // Extract tool use blocks from response
    const toolUseBlocks = this.toolAdapter.extractToolUseBlocks(response.content);

    if (toolUseBlocks.length > 0) {
      // Add assistant message with tool use
      messages.push({
        role: 'assistant',
        content: response.content,
      });

      // Convert to unified format
      const unifiedCalls = toolUseBlocks.map(
        toolUse => this.toolAdapter.fromProviderToolCall(toolUse)
      );

      // Execute tools using orchestrator
      const orchestrator = new ToolExecutionOrchestrator(
        this.mcpManager,
        this.createExecutionContext(userPromptId)
      );

      const executionResult = await orchestrator.executeToolCallsInParallel(
        unifiedCalls
      );

      // Convert results to Anthropic format
      const toolResults = executionResult.results.map(
        result => this.toolAdapter.toProviderToolResult(result)
      );

      // Add tool results as user message
      messages.push(this.toolAdapter.formatToolResultsAsMessage(toolResults));

      // Continue to next round
      continue;
    } else {
      // No tool use, return final response
      return this.convertFromAnthropicFormat(response);
    }
  }

  throw new Error(`Maximum tool rounds (${maxRounds}) exceeded`);
}
```

### 3. Streaming Tool Execution

**CRITICAL**: Implement streaming with tool use accumulation:

```typescript
async *generateContentStream(
  request: GenerateContentParameters,
  userPromptId: string
): AsyncIterable<GenerateContentResponse> {
  // Get tools and prepare request
  const unifiedTools = this.mcpManager.getUnifiedTools();
  const { tools } = this.toolAdapter.formatToolsForRequest(unifiedTools);

  const anthropicRequest = {
    ...this.convertToAnthropicFormat(request),
    tools,
    stream: true,
    max_tokens: this.getMaxTokens(),
  };

  let messages = [...anthropicRequest.messages];
  const maxRounds = this.getMaxToolRounds();

  for (let round = 0; round < maxRounds; round++) {
    const stream = await this.client.messages.create(anthropicRequest);

    let currentToolUse: Partial<AnthropicToolUse> | null = null;
    const completedToolUses: AnthropicToolUse[] = [];
    let hasTextContent = false;
    let assistantContent: any[] = [];

    // Process stream events
    for await (const event of stream) {
      // Handle tool use events
      currentToolUse = this.toolAdapter.accumulateStreamingToolUse(
        event,
        currentToolUse
      );

      // Check if tool use is complete
      if (this.toolAdapter.isToolUseComplete(currentToolUse)) {
        completedToolUses.push(currentToolUse as AnthropicToolUse);
        assistantContent.push(currentToolUse);

        // Execute tool immediately for streaming feedback
        const unifiedCall = this.toolAdapter.fromProviderToolCall(currentToolUse);
        const orchestrator = new ToolExecutionOrchestrator(
          this.mcpManager,
          this.createExecutionContext(userPromptId)
        );

        try {
          const result = await orchestrator.executeToolCall(unifiedCall);

          // Stream tool result immediately
          yield this.createToolResultResponse(result);
        } catch (error) {
          const errorResult = this.toolAdapter.createErrorResult(
            currentToolUse.id!,
            error.message
          );
          yield this.createToolResultResponse(errorResult);
        }

        currentToolUse = null;
      }

      // Handle text content
      if (event.type === 'content_block_delta' &&
          event.delta?.type === 'text_delta') {
        hasTextContent = true;
        yield this.convertStreamEventFromAnthropic(event);

        // Track content for message history
        assistantContent.push({
          type: 'text',
          text: event.delta.text,
        });
      }
    }

    // Process completed tool uses
    if (completedToolUses.length > 0) {
      // Add assistant message with tool uses
      messages.push({
        role: 'assistant',
        content: assistantContent,
      });

      // Execute any remaining tools and format results
      const orchestrator = new ToolExecutionOrchestrator(
        this.mcpManager,
        this.createExecutionContext(userPromptId)
      );

      const allResults = [];
      for (const toolUse of completedToolUses) {
        try {
          const unifiedCall = this.toolAdapter.fromProviderToolCall(toolUse);
          const result = await orchestrator.executeToolCall(unifiedCall);
          allResults.push(result);
        } catch (error) {
          const errorResult = this.toolAdapter.createErrorResult(
            toolUse.id,
            error.message
          );
          allResults.push(errorResult);
        }
      }

      // Convert results to Anthropic format
      const toolResults = allResults.map(
        result => this.toolAdapter.toProviderToolResult(result)
      );

      // Add tool results as user message
      messages.push(this.toolAdapter.formatToolResultsAsMessage(toolResults));

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
    config: this.config,
    abortSignal: new AbortController().signal,
    providerId: 'anthropic',
    maxConcurrentTools: this.getMaxConcurrentTools(),
    timeoutMs: this.getToolTimeoutMs(),
    onProgress: (message, toolName) => {
      console.log(`[Anthropic] ${message}`, toolName ? `(${toolName})` : '');
    },
    onConfirmation: async (details) => {
      return this.handleToolConfirmation(details);
    },
  };
}

private getMaxTokens(): number {
  return this.config.mcpConfig?.toolSettings?.anthropic?.maxTokens ?? 4096;
}

private getMaxToolRounds(): number {
  return this.config.mcpConfig?.toolSettings?.anthropic?.maxToolRounds ?? 10;
}

private getMaxConcurrentTools(): number {
  return this.config.mcpConfig?.toolExecution?.maxConcurrentTools ?? 3;
}

private getToolTimeoutMs(): number {
  return this.config.mcpConfig?.toolSettings?.anthropic?.toolUseTimeoutMs ?? 30000;
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
          text: `🔧 Tool ${result.toolCallId} ${result.isError ? 'failed' : 'completed'}: ${content}`
        }],
        role: 'model',
      },
      finishReason: 'STOP',
    }],
  };
}

private convertStreamEventFromAnthropic(event: any): GenerateContentResponse {
  // Convert Anthropic stream event to GenerateContentResponse format
  return {
    candidates: [{
      content: {
        parts: [{ text: event.delta?.text || '' }],
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
      // Anthropic-specific smart confirmation logic
      return this.shouldAutoConfirm(details)
        ? ToolConfirmationOutcome.ProceedOnce
        : await this.showConfirmationDialog(details);
  }
}

private shouldAutoConfirm(details: any): boolean {
  // Anthropic-specific auto-confirmation logic
  const safeTools = ['search', 'read_file', 'get_weather'];
  return safeTools.includes(details.toolName);
}
```

### 5. Error Handling Integration

Use the comprehensive error system:

```typescript
import { ErrorHandler, ToolExecutionError } from '../tools/error-handling.js';

// In your streaming method:
try {
  const result = await orchestrator.executeToolCall(unifiedCall);
  yield this.createToolResultResponse(result);
} catch (error) {
  const context = ErrorHandler.createToolExecutionContext(
    'anthropic',
    unifiedCall.name,
    unifiedCall.id,
  );
  const providerError = ErrorHandler.handle(error, context);

  // Log with full context
  ErrorHandler.logError(providerError, context, 'warn');

  // Create error response and continue streaming
  const errorResult = providerError.toUnifiedResult(unifiedCall.id);
  yield this.createToolResultResponse(errorResult);

  // Add error to message history
  const toolResult = this.toolAdapter.toProviderToolResult(errorResult);
  // Add to results for next round...
}
```

### 6. Configuration Integration

Ensure proper configuration loading:

```typescript
constructor(config: any) {
  super(config);

  // Load MCP configuration with Anthropic-specific defaults
  const mcpConfig = MultiProviderMCPConfigMerger.merge(
    config.mcpConfig || {},
    {
      ...DEFAULT_MULTI_PROVIDER_MCP_CONFIG,
      toolSettings: {
        anthropic: {
          maxToolUseBlocks: 20,
          toolUseTimeoutMs: 30000,
          streamToolUse: true,
          allowNestedToolCalls: false,
          maxToolResultTokens: 4096,
        }
      }
    }
  );

  this.config = { ...config, mcpConfig };
  this.toolAdapter = new AnthropicToolAdapter();
  this.mcpManager = new MCPToolManager(config.configInstance);
}
```

### 7. Anthropic-Specific Considerations

#### Message Format

Anthropic uses a specific message format for tool results:

```typescript
// Correct tool result message format
const toolResultMessage = {
  role: 'user',
  content: [
    {
      type: 'tool_result',
      tool_use_id: result.toolCallId,
      content: result.content,
      is_error: result.isError,
    },
  ],
};
```

#### Streaming Tool Use

Anthropic streams tool use in chunks that need to be accumulated:

```typescript
// Handle incremental JSON in tool input
if (
  event.type === 'content_block_delta' &&
  event.delta?.type === 'input_json_delta'
) {
  currentToolUse.input += event.delta.partial_json;
}
```

#### Content Block Management

Track different content types in responses:

```typescript
// Handle mixed content (text + tool use)
const contentBlocks = response.content;
for (const block of contentBlocks) {
  if (block.type === 'text') {
    // Handle text content
  } else if (block.type === 'tool_use') {
    // Handle tool use
  }
}
```

### 8. Testing Requirements

#### Unit Tests

Create `packages/core/src/providers/anthropic/__tests__/provider-with-tools.test.ts`:

```typescript
describe('AnthropicProviderWithMCP', () => {
  it('should handle tool use blocks correctly', async () => {
    // Test tool use extraction and execution
  });

  it('should stream tool results immediately', async () => {
    // Test streaming tool execution
  });

  it('should handle mixed content blocks', async () => {
    // Test text + tool use responses
  });

  it('should accumulate streaming tool input', async () => {
    // Test JSON accumulation from streaming
  });
});
```

#### Anthropic-Specific Tests

```typescript
describe('Anthropic Tool Integration', () => {
  it('should handle Claude tool use format', async () => {
    // Test with actual Claude API responses
  });

  it('should respect Anthropic rate limits', async () => {
    // Test rate limiting behavior
  });

  it('should handle large tool results', async () => {
    // Test with results near token limits
  });
});
```

### 9. Performance Optimizations

#### Concurrent Tool Use

Anthropic allows multiple tool uses in parallel:

```typescript
// Execute multiple tools concurrently
const executionResult = await orchestrator.executeToolCallsInParallel(
  toolUseBlocks.map((block) => this.toolAdapter.fromProviderToolCall(block)),
  {
    maxConcurrency: this.getMaxConcurrentTools(),
    failFast: false, // Continue even if some tools fail
  },
);
```

#### Streaming Efficiency

Stream tool results as soon as they complete:

```typescript
// Don't wait for all tools to complete before streaming results
if (this.toolAdapter.isToolUseComplete(currentToolUse)) {
  // Execute and stream immediately
  const result = await orchestrator.executeToolCall(unifiedCall);
  yield this.createToolResultResponse(result);
}
```

## Validation Checklist

- [ ] Tool execution loop implemented with Anthropic message format
- [ ] Streaming tool use accumulation working
- [ ] Content block handling for mixed responses
- [ ] Error handling with graceful degradation
- [ ] Configuration loading with Anthropic defaults
- [ ] Rate limiting and timeout handling
- [ ] Tests covering Anthropic-specific scenarios
- [ ] Performance optimizations applied

## Common Pitfalls

1. **Message Format**: Anthropic requires specific tool_result format
2. **Streaming Accumulation**: Handle partial JSON in tool input correctly
3. **Content Blocks**: Don't assume single content type in responses
4. **Token Limits**: Respect Anthropic's token limits for tool results
5. **Rate Limiting**: Handle Anthropic's rate limits gracefully

## Anthropic-Specific Features

1. **System Messages**: Can include tool descriptions in system message
2. **Rich Content**: Support for images and other media in tool results
3. **Function Calling**: Native tool use with structured input/output
4. **Streaming**: Real-time tool execution during response generation

---

**Status**: Infrastructure Ready ✅ | Implementation Guide Complete 📋
