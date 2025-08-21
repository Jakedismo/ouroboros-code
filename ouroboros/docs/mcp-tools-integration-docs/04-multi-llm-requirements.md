# Multi-LLM Provider Integration Requirements

## Overview

This document outlines the specific requirements and integration points needed when integrating the MCP tools system with a multi-LLM provider architecture. Since the multi-LLM provider system was not present during the initial development of this MCP tools integration, this guide provides the necessary bridge between the two systems.

## Critical Integration Requirements

### 1. Provider Factory Integration

The existing multi-LLM provider factory must be extended to support MCP-enabled providers.

#### Required Changes to Provider Factory

**File**: `packages/core/src/providers/factory-with-mcp.ts` (already created)

The factory needs to:

- Initialize MCP tool managers for each provider type
- Handle provider-specific MCP configurations
- Ensure proper dependency injection of MCP components

```typescript
// Integration point with multi-LLM factory
export class MultiLLMProviderFactory {
  static async createProvider(
    type: 'openai' | 'anthropic' | 'gemini',
    config: ProviderConfig & MCPConfig,
  ): Promise<BaseProvider> {
    // Initialize MCP components first
    const mcpToolManager = await this.initializeMCPToolManager(config.mcp);
    const toolAdapter = this.createToolAdapter(type);

    switch (type) {
      case 'openai':
        return new OpenAIProviderWithMCP({
          ...config,
          mcpToolManager,
          toolAdapter,
        });

      case 'anthropic':
        return new AnthropicProviderWithMCP({
          ...config,
          mcpToolManager,
          toolAdapter,
        });

      case 'gemini':
        return new GeminiProviderWithMCP({
          ...config,
          mcpToolManager,
          toolAdapter,
        });
    }
  }
}
```

### 2. Provider Base Class Extension

All provider base classes need to be extended to support MCP tool integration.

#### Required Interface Extensions

```typescript
// New interface that all providers must implement
interface MCPCapableProvider extends BaseProvider {
  getMCPToolManager(): MCPToolManager;
  executeToolsWithMCP(calls: UnifiedToolCall[]): Promise<UnifiedToolResult[]>;
  discoverMCPTools(): Promise<UnifiedTool[]>;
  syncToolsAcrossProviders(): Promise<void>;
}
```

#### Provider Implementation Requirements

Each provider class needs:

1. **MCP Tool Manager Integration**

```typescript
export class OpenAIProviderWithMCP
  extends OpenAIProvider
  implements MCPCapableProvider
{
  private mcpToolManager: MCPToolManager;
  private toolAdapter: OpenAIToolAdapter;
  private performanceOptimizer: PerformanceOptimizer;

  constructor(config: OpenAIProviderConfig & MCPProviderConfig) {
    super(config);
    this.initializeMCPComponents(config.mcp);
  }

  async executeToolsWithMCP(
    calls: UnifiedToolCall[],
  ): Promise<UnifiedToolResult[]> {
    return await this.mcpToolManager.executeMultipleTools(calls);
  }
}
```

2. **Tool Discovery Integration**

```typescript
async discoverMCPTools(): Promise<UnifiedTool[]> {
  return await this.mcpToolManager.discoverTools();
}

async syncToolsAcrossProviders(): Promise<void> {
  // Integration with ToolDiscoverySync
  await this.toolDiscoverySync.synchronizeTools();
}
```

### 3. Configuration System Integration

The multi-LLM configuration system must be extended to support MCP-specific settings.

#### Configuration Schema Requirements

**File**: `packages/core/src/config/multi-provider-config.ts` (needs modification)

```typescript
interface ExtendedProviderConfig {
  // Existing provider config
  apiKey: string;
  baseURL?: string;
  timeout?: number;

  // New MCP integration config
  mcp?: {
    enabled: boolean;
    toolExecutionTimeoutMs: number;
    maxConcurrentTools: number;
    connectionPoolSize: number;
    cacheConfig: CacheConfig;
    retryConfig: RetryConfig;
    performanceOptimization: boolean;
    memoryManagement: MemoryManagementConfig;
  };
}
```

#### Provider-Specific MCP Configurations

```typescript
export const MULTI_LLM_MCP_CONFIG = {
  providers: {
    openai: {
      mcp: {
        enabled: true,
        toolExecutionTimeoutMs: 45000, // Optimized for OpenAI's response times
        maxConcurrentTools: 5, // OpenAI handles moderate concurrency well
        connectionPoolSize: 3,
        performanceOptimization: true,
        cacheConfig: {
          ttlMs: 300000, // 5-minute cache for stability
          maxSize: 1000,
          evictionStrategy: 'lru',
        },
      },
    },
    anthropic: {
      mcp: {
        enabled: true,
        toolExecutionTimeoutMs: 60000, // Anthropic needs longer timeouts
        maxConcurrentTools: 3, // More conservative concurrency
        connectionPoolSize: 2,
        performanceOptimization: true,
        cacheConfig: {
          ttlMs: 600000, // 10-minute cache for consistency
          maxSize: 800,
          evictionStrategy: 'hybrid',
        },
      },
    },
    gemini: {
      mcp: {
        enabled: true,
        toolExecutionTimeoutMs: 30000, // Gemini is typically faster
        maxConcurrentTools: 8, // Handles high concurrency well
        connectionPoolSize: 4,
        performanceOptimization: true,
        cacheConfig: {
          ttlMs: 180000, // 3-minute cache for responsiveness
          maxSize: 1200,
          evictionStrategy: 'lfu',
        },
      },
    },
  },
};
```

### 4. Request Routing Integration

The multi-LLM request router must be aware of MCP tool capabilities.

#### Router Enhancement Requirements

```typescript
export class MultiLLMRouter {
  private toolDiscoverySync: ToolDiscoverySync;
  private providerCapabilities: Map<string, ProviderCapabilities>;

  async routeRequest(request: LLMRequest): Promise<string> {
    // Check if request requires MCP tools
    const requiresMCPTools = this.detectMCPToolRequirement(request);

    if (requiresMCPTools) {
      // Get providers that have required tools
      const availableTools =
        await this.toolDiscoverySync.getSynchronizedTools();
      const capableProviders = this.findProvidersWithTools(
        request.requiredTools,
        availableTools,
      );

      // Route to optimal provider based on tool availability and performance
      return this.selectOptimalProvider(capableProviders, request);
    }

    return this.standardRouting(request);
  }
}
```

### 5. Tool Discovery Service Integration

The multi-LLM system needs a centralized tool discovery service.

#### Service Requirements

**File**: `packages/core/src/services/multi-llm-tool-discovery.ts` (needs creation)

```typescript
export class MultiLLMToolDiscoveryService {
  private toolDiscoverySync: ToolDiscoverySync;
  private providerManagers: Map<string, MCPToolManager>;

  constructor(providers: MCPCapableProvider[]) {
    this.toolDiscoverySync = new ToolDiscoverySync();
    this.initializeProviders(providers);
  }

  async initializeProviders(providers: MCPCapableProvider[]): Promise<void> {
    for (const provider of providers) {
      const toolManager = provider.getMCPToolManager();
      this.toolDiscoverySync.registerProvider(provider.getId(), toolManager);
    }

    // Initial synchronization
    await this.toolDiscoverySync.synchronizeTools(true);
  }

  async getAllAvailableTools(): Promise<UnifiedTool[]> {
    return this.toolDiscoverySync.getSynchronizedTools();
  }

  async getProviderTools(providerId: string): Promise<UnifiedTool[]> {
    return this.toolDiscoverySync.getProviderTools(providerId);
  }
}
```

### 6. Error Handling Integration

Multi-LLM error handling must account for MCP-specific errors.

#### Error Classification Requirements

```typescript
export enum MultiLLMErrorType {
  // Existing error types
  PROVIDER_UNAVAILABLE = 'provider_unavailable',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',

  // New MCP-specific error types
  MCP_TOOL_UNAVAILABLE = 'mcp_tool_unavailable',
  MCP_CONNECTION_FAILED = 'mcp_connection_failed',
  MCP_TOOL_EXECUTION_TIMEOUT = 'mcp_tool_execution_timeout',
  MCP_TOOL_SYNC_FAILED = 'mcp_tool_sync_failed',
  MCP_FORMAT_CONVERSION_ERROR = 'mcp_format_conversion_error',
}

export class MultiLLMMCPErrorHandler {
  async handleMCPError(
    error: MCPError,
    context: ExecutionContext,
  ): Promise<ErrorRecoveryAction> {
    switch (error.type) {
      case 'MCP_CONNECTION_FAILED':
        return this.handleConnectionFailure(error, context);

      case 'MCP_TOOL_EXECUTION_TIMEOUT':
        return this.handleExecutionTimeout(error, context);

      case 'MCP_TOOL_SYNC_FAILED':
        return this.handleSyncFailure(error, context);

      default:
        return this.defaultErrorRecovery(error, context);
    }
  }
}
```

### 7. Performance Monitoring Integration

Multi-LLM performance monitoring must include MCP metrics.

#### Metrics Integration Requirements

```typescript
interface MultiLLMPerformanceMetrics {
  // Existing metrics
  providerResponseTimes: Record<string, number>;
  providerSuccessRates: Record<string, number>;

  // New MCP metrics
  mcpToolExecutionTimes: Record<string, number>;
  mcpCacheHitRates: Record<string, number>;
  mcpConnectionHealth: Record<string, boolean>;
  mcpToolSyncStatus: {
    lastSyncTime: number;
    syncSuccessRate: number;
    conflictsResolved: number;
  };
}
```

### 8. CLI Integration Requirements

The multi-LLM CLI must support MCP-specific commands and configurations.

#### CLI Command Extensions

```bash
# New MCP-specific commands
gemini --provider openai --enable-mcp --list-tools
gemini --provider all --mcp-sync-tools
gemini --provider anthropic --mcp-health-check
gemini --mcp-performance-report

# Configuration commands
gemini config set mcp.enabled true
gemini config set mcp.providers openai,anthropic,gemini
gemini config set mcp.performance.caching true
```

## Implementation Checklist

### Phase 1: Core Integration (Required)

- [ ] Extend provider factory to create MCP-enabled providers
- [ ] Implement MCPCapableProvider interface for all provider classes
- [ ] Integrate MCP configuration with multi-LLM config system
- [ ] Add MCP-aware request routing logic
- [ ] Create centralized tool discovery service
- [ ] Extend error handling for MCP-specific errors

### Phase 2: Advanced Features (Recommended)

- [ ] Integrate performance monitoring with MCP metrics
- [ ] Add CLI commands for MCP management
- [ ] Implement cross-provider tool usage analytics
- [ ] Add tool recommendation system based on provider capabilities
- [ ] Implement intelligent provider selection based on tool requirements

### Phase 3: Optimization (Optional)

- [ ] Add predictive tool caching based on usage patterns
- [ ] Implement dynamic provider scaling based on tool demand
- [ ] Add tool execution load balancing across providers
- [ ] Implement tool dependency resolution and batching

## Migration Path

### Existing Multi-LLM Systems

1. **Gradual Integration**
   - Start with single provider MCP integration
   - Add tool discovery synchronization
   - Enable cross-provider tool execution
   - Add performance optimization

2. **Compatibility Maintenance**
   - Ensure backward compatibility with existing provider interfaces
   - Add feature flags for MCP functionality
   - Provide migration utilities for existing configurations

3. **Testing Strategy**
   - Test each provider integration independently
   - Test cross-provider tool synchronization
   - Load test with multiple concurrent tool executions
   - Verify performance optimization benefits

## Dependencies and Prerequisites

### Required Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "events": "^3.3.0"
  }
}
```

### System Requirements

- Multi-LLM provider system must support dependency injection
- Configuration system must support nested provider-specific configs
- Error handling system must support custom error types
- Performance monitoring system must support custom metrics
- CLI system must support plugin architecture

## Success Criteria

### Functional Requirements

- ✅ All providers can discover and execute MCP tools
- ✅ Tool synchronization works across all active providers
- ✅ Performance optimization provides measurable improvements
- ✅ Error handling gracefully manages MCP-specific failures
- ✅ Configuration allows fine-tuning per provider

### Performance Requirements

- Tool execution latency < 2x baseline (achieved through caching)
- Memory usage growth < 10% (achieved through cleanup)
- Cache hit rate > 80% for repeated tool executions
- Connection reuse rate > 90% during active sessions

### Reliability Requirements

- MCP connection failures don't impact non-tool operations
- Tool synchronization failures are recoverable
- Performance degradation is gradual, not cliff-edge
- System continues operating with partial tool availability

This integration provides a seamless bridge between the MCP tools system and multi-LLM provider architecture, enabling powerful cross-provider tool execution capabilities.
