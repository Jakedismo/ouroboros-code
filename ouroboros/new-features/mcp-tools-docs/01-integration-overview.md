# MCP Multi-Provider Integration Overview

This document provides a comprehensive guide for integrating the MCP tools infrastructure with provider implementations across multiple worktrees.

## Architecture Summary

The MCP tools integration follows a clean layered architecture:

```
┌─────────────────────────────────────────┐
│         Provider Implementations        │ ← Other Worktrees
│  ┌─────────┐ ┌─────────┐ ┌──────────┐   │
│  │ OpenAI  │ │Anthropic│ │  Gemini  │   │
│  │Provider │ │Provider │ │ Provider │   │
│  └─────────┘ └─────────┘ └──────────┘   │
└─────────────┬───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│       Unified Tool Orchestrator         │ ← This Worktree
│   (Provider-agnostic tool handling)     │
└─────────────┬───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│         MCP Client & Tools              │
│     (Shared across all providers)       │
└─────────────────────────────────────────┘
```

## Key Integration Points

### 1. Tool Adapters (`packages/core/src/providers/*/tool-adapter.ts`)

Each provider needs a tool adapter that extends `ToolFormatConverter`:

```typescript
import {
  ToolFormatConverter,
  UnifiedTool,
  UnifiedToolCall,
  UnifiedToolResult,
} from '../tools/unified-tool-interface.js';

export class MyProviderToolAdapter extends ToolFormatConverter {
  toProviderFormat(tool: UnifiedTool): MyProviderTool {
    /* ... */
  }
  fromProviderToolCall(toolCall: MyProviderToolCall): UnifiedToolCall {
    /* ... */
  }
  toProviderToolResult(result: UnifiedToolResult): MyProviderResult {
    /* ... */
  }
}
```

**✅ COMPLETED**: OpenAI and Anthropic adapters are fully implemented with streaming support.

### 2. MCP-Enabled Providers (`packages/core/src/providers/*/provider-with-tools.ts`)

Provider implementations should:

- Extend existing provider classes
- Use `MCPToolManager` for tool discovery/execution
- Use `ToolExecutionOrchestrator` for parallel execution
- Handle streaming tool calls appropriately

**Example Integration Pattern:**

```typescript
export class MyProviderWithMCP extends MyProvider {
  private toolAdapter: MyProviderToolAdapter;
  private mcpManager: MCPToolManager;
  private orchestrator: ToolExecutionOrchestrator;

  async initialize(): Promise<void> {
    await this.mcpManager.initialize();
  }

  async generateContent(
    request,
    userPromptId,
  ): Promise<GenerateContentResponse> {
    const tools = this.mcpManager.getUnifiedTools();
    // Use tools in provider-specific format...
  }
}
```

### 3. Factory Integration (`packages/core/src/providers/factory-with-mcp.ts`)

The factory automatically creates MCP-enabled providers:

```typescript
// Usage in other worktrees:
const provider = await MCPEnabledProviderFactory.create({
  provider: LLMProvider.OPENAI,
  apiKey: 'your-key',
  enableMCP: true,
});
```

**✅ COMPLETED**: Factory with automatic MCP initialization, validation, and fallbacks.

## Critical Integration Requirements

### 1. Tool Execution Flow

**MUST IMPLEMENT**: Each provider must handle the tool execution loop:

1. **Tool Discovery**: Get tools from `MCPToolManager.getUnifiedTools()`
2. **Format Conversion**: Use adapter to convert to provider format
3. **Model Request**: Include tools in API request
4. **Tool Call Detection**: Parse provider response for tool calls
5. **Tool Execution**: Use `ToolExecutionOrchestrator` for parallel execution
6. **Result Integration**: Continue conversation with tool results

### 2. Streaming Support

**CRITICAL**: Streaming implementations must:

- Accumulate tool calls during streaming
- Execute complete tool calls immediately
- Handle partial tool call data correctly
- Yield intermediate responses

**Reference Implementation**: See adapters for streaming patterns.

### 3. Error Handling

**MUST USE**: The error handling system for consistency:

```typescript
import { ErrorHandler, ToolExecutionError } from '../tools/error-handling.js';

try {
  // Tool operation
} catch (error) {
  const context = ErrorHandler.createToolExecutionContext(providerId, toolName);
  const providerError = ErrorHandler.handle(error, context);
  // Handle appropriately
}
```

## Configuration Integration

### Environment Variables

Providers automatically inherit MCP configuration:

```bash
# Tool execution settings
MCP_MAX_CONCURRENT_TOOLS=5
MCP_TOOL_TIMEOUT_MS=60000
MCP_CONFIRMATION_MODE=smart

# Provider-specific
OPENAI_TOOL_CHOICE=auto
ANTHROPIC_MAX_TOOL_USE_BLOCKS=20
```

### CLI Integration

**✅ COMPLETED**: Full CLI integration with flags:

- `--provider openai|anthropic|gemini`
- `--enable-mcp` / `--disable-mcp`
- `--tool-timeout 30000`
- `--confirmation-mode always|never|smart`

## Validation & Testing

### Format Validation

**✅ COMPLETED**: Use `ToolFormatValidator` for data integrity:

```typescript
import { ToolFormatValidator } from '../tools/format-validation.js';

const validation = ToolFormatValidator.validateComplete(
  unifiedTool,
  adapter,
  context,
);
if (!validation.isValid) {
  throw new ToolConversionError(validation.errors.join('; '));
}
```

### Required Tests

Each provider implementation should include:

1. **Adapter Tests**: Tool format conversion correctness
2. **Integration Tests**: End-to-end tool execution
3. **Streaming Tests**: Tool call accumulation and execution
4. **Error Tests**: Error handling and recovery

## Performance Considerations

### Connection Management

**IMPLEMENTED**: MCP connections are:

- Shared across all providers
- Automatically reconnected on failure
- Pooled for efficiency
- Monitored for health

### Memory Management

**OPTIMIZATION READY**: Tool execution includes:

- Automatic cleanup of tool contexts
- Result caching with TTL
- Memory usage monitoring
- Resource pool management

### Concurrency Control

**✅ COMPLETED**: Built-in concurrency management:

- Configurable concurrent tool limits
- Semaphore-based resource control
- Progress tracking per tool
- Fail-fast options for critical failures

## Integration Checklist

For provider implementations in other worktrees:

### ✅ Foundation (This Worktree)

- [x] Unified tool interface
- [x] Provider-specific adapters (OpenAI, Anthropic)
- [x] MCP tool manager
- [x] Error handling system
- [x] Tool execution orchestrator
- [x] Configuration system
- [x] Factory pattern
- [x] CLI integration
- [x] Format validation

### 📋 Provider Implementation (Other Worktrees)

- [ ] Extend existing provider classes
- [ ] Integrate MCP tool manager
- [ ] Implement tool execution loops
- [ ] Add streaming tool support
- [ ] Handle error scenarios
- [ ] Add provider-specific tests
- [ ] Update provider factory registration

### 🔧 Integration Testing

- [ ] Cross-worktree integration tests
- [ ] End-to-end tool execution tests
- [ ] Performance benchmarks
- [ ] Error scenario validation
- [ ] CLI functionality tests

## Next Steps

1. **Provider Teams**: Implement tool execution loops using the provided infrastructure
2. **Testing Teams**: Create integration test suites
3. **Documentation Teams**: Update user-facing documentation
4. **Performance Teams**: Run benchmarks and optimize bottlenecks

## Support & Resources

- **Foundation Code**: All infrastructure is complete in `mcp-tools/` worktree
- **Examples**: Reference implementations in adapters and orchestrator
- **Validation**: Use format validation for all conversions
- **Error Handling**: Comprehensive error system with recovery
- **Configuration**: Full environment and CLI configuration support

---

**Status**: Foundation Complete ✅ | Ready for Provider Integration 🚀
