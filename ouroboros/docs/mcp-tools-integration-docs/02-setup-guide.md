# Setup Guide

## Prerequisites

### System Requirements

- Node.js >= 18.0.0
- TypeScript >= 5.0.0
- Git worktree setup (for development)

### Dependencies

The MCP tools integration system requires the following packages:

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.24.3",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "openai": "^4.0.0",
    "events": "^3.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  }
}
```

## Installation Steps

### 1. Environment Setup

#### Development Environment

```bash
# Navigate to the mcp-tools worktree
cd /Users/jokkeruokolainen/Documents/Solita/GenAI/IDE/mcp-tools

# Install dependencies
npm install

# Build packages
npm run build:packages
```

#### Production Environment

```bash
# Install production dependencies
npm ci --production

# Build for production
npm run build

# Verify installation
npm run typecheck
```

### 2. Configuration Setup

#### Basic Configuration

Create or update your MCP configuration file:

```typescript
// packages/core/src/config/multi-provider-mcp-config.ts
export const MCP_PROVIDER_CONFIG = {
  enabled: true,
  providers: {
    openai: {
      enabled: true,
      toolExecutionTimeoutMs: 45000,
      maxConcurrentTools: 5,
      connectionPoolSize: 3,
      cacheConfig: {
        ttlMs: 300000,
        maxSize: 1000,
        evictionStrategy: 'lru',
      },
      retryConfig: {
        maxRetries: 3,
        initialDelayMs: 1000,
        backoffMultiplier: 2,
      },
    },
    anthropic: {
      enabled: true,
      toolExecutionTimeoutMs: 60000,
      maxConcurrentTools: 3,
      connectionPoolSize: 2,
      cacheConfig: {
        ttlMs: 600000,
        maxSize: 800,
        evictionStrategy: 'hybrid',
      },
      retryConfig: {
        maxRetries: 2,
        initialDelayMs: 1500,
        backoffMultiplier: 1.8,
      },
    },
    gemini: {
      enabled: true,
      toolExecutionTimeoutMs: 30000,
      maxConcurrentTools: 8,
      connectionPoolSize: 4,
      cacheConfig: {
        ttlMs: 180000,
        maxSize: 1200,
        evictionStrategy: 'lfu',
      },
      retryConfig: {
        maxRetries: 4,
        initialDelayMs: 800,
        backoffMultiplier: 2.2,
      },
    },
  },
  shared: {
    toolDiscovery: {
      syncIntervalMs: 30000,
      cacheTimeoutMs: 300000,
      conflictResolution: 'latest',
    },
    memoryManagement: {
      cleanupIntervalMs: 60000,
      memoryPressureThreshold: 0.8,
      aggressiveCleanupThreshold: 0.9,
    },
    monitoring: {
      metricsCollectionIntervalMs: 10000,
      healthCheckIntervalMs: 30000,
      eventLoggingLevel: 'info',
    },
  },
};
```

#### CLI Configuration

Update CLI configuration to support MCP providers:

```typescript
// packages/cli/src/config/mcp-provider-config.ts
export interface MCPCLIConfig {
  enableMCP: boolean;
  providers: string[];
  debugMode: boolean;
  metricsOutput?: string;
}

export const DEFAULT_MCP_CLI_CONFIG: MCPCLIConfig = {
  enableMCP: true,
  providers: ['openai', 'anthropic', 'gemini'],
  debugMode: false,
  metricsOutput: undefined,
};
```

### 3. MCP Server Configuration

#### Server Discovery

Configure MCP servers that will be available to all providers:

```json
// .gemini/mcp-servers.json
{
  "servers": {
    "filesystem": {
      "command": "node",
      "args": ["./mcp-server-filesystem.js"],
      "env": {
        "WORKSPACE_ROOT": "/path/to/workspace"
      }
    },
    "web-search": {
      "command": "python",
      "args": ["-m", "mcp_server_web_search"],
      "env": {
        "SEARCH_API_KEY": "your-api-key"
      }
    },
    "database": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-database"],
      "env": {
        "DATABASE_URL": "postgresql://localhost:5432/mydb"
      }
    }
  }
}
```

#### Health Check Configuration

```typescript
// Server health monitoring configuration
export const MCP_SERVER_HEALTH_CONFIG = {
  healthCheckIntervalMs: 30000,
  reconnectDelayMs: 5000,
  maxReconnectAttempts: 5,
  circuitBreakerThreshold: 3,
  circuitBreakerResetTimeoutMs: 60000,
};
```

### 4. Provider Integration

#### OpenAI Integration

```typescript
// packages/core/src/providers/openai/openai-provider-with-mcp.ts
export class OpenAIProviderWithMCP extends OpenAIProvider {
  private mcpToolManager: MCPToolManager;
  private toolAdapter: OpenAIToolAdapter;

  constructor(config: OpenAIProviderConfig & MCPProviderConfig) {
    super(config);
    this.toolAdapter = new OpenAIToolAdapter();
    this.mcpToolManager = new MCPToolManager(config.mcp, this.toolAdapter);
  }
}
```

#### Anthropic Integration

```typescript
// packages/core/src/providers/anthropic/anthropic-provider-with-mcp.ts
export class AnthropicProviderWithMCP extends AnthropicProvider {
  private mcpToolManager: MCPToolManager;
  private toolAdapter: AnthropicToolAdapter;

  constructor(config: AnthropicProviderConfig & MCPProviderConfig) {
    super(config);
    this.toolAdapter = new AnthropicToolAdapter();
    this.mcpToolManager = new MCPToolManager(config.mcp, this.toolAdapter);
  }
}
```

## Environment Variables

### Required Environment Variables

```bash
# Provider API Keys
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
GOOGLE_API_KEY=your-gemini-key

# MCP Configuration
MCP_ENABLED=true
MCP_DEBUG_MODE=false
MCP_METRICS_OUTPUT=/var/log/mcp-metrics.log

# Performance Tuning
MCP_CACHE_SIZE=1000
MCP_CONNECTION_POOL_SIZE=5
MCP_HEALTH_CHECK_INTERVAL=30000
```

### Optional Environment Variables

```bash
# Advanced Configuration
MCP_TOOL_DISCOVERY_INTERVAL=30000
MCP_MEMORY_CLEANUP_INTERVAL=60000
MCP_PERFORMANCE_LOGGING=true
MCP_CONNECTION_TIMEOUT=10000
MCP_RETRY_MAX_ATTEMPTS=3
MCP_CIRCUIT_BREAKER_THRESHOLD=5
```

## Verification Steps

### 1. Build Verification

```bash
# Verify all packages build successfully
npm run build:packages

# Check TypeScript compilation
npm run typecheck

# Run linting
npm run lint
```

### 2. Configuration Verification

```bash
# Verify MCP configuration
node -e "
const config = require('./packages/core/src/config/multi-provider-mcp-config.ts');
console.log('MCP Config loaded successfully:', !!config.MCP_PROVIDER_CONFIG);
"

# Test MCP server connections
npm run test -- --grep="MCP connection"
```

### 3. Integration Testing

```bash
# Run integration tests
npm run test:integration:all

# Test specific provider integrations
npm test -- packages/core/src/providers/__tests__/tool-adapters.test.ts
```

### 4. Performance Baseline

```bash
# Start with performance monitoring
MCP_PERFORMANCE_LOGGING=true npm run start

# Run performance benchmarks
npm run test:performance
```

## Common Setup Issues

### Issue: MCP Server Connection Failures

**Symptoms**: Connection timeouts, server not found errors
**Solution**:

```bash
# Check server configuration
cat .gemini/mcp-servers.json

# Verify server executables
which node
which python
which npx

# Test server startup manually
node ./mcp-server-filesystem.js
```

### Issue: Tool Discovery Sync Failures

**Symptoms**: Tools not appearing across all providers
**Solution**:

```typescript
// Force tool synchronization
const sync = new ToolDiscoverySync();
await sync.synchronizeTools(true);
```

### Issue: Memory Usage Growth

**Symptoms**: Increasing memory consumption over time
**Solution**:

```bash
# Enable aggressive cleanup
MCP_MEMORY_CLEANUP_AGGRESSIVE=true npm run start

# Monitor memory usage
node --max-old-space-size=4096 npm run start
```

### Issue: Performance Degradation

**Symptoms**: Slow tool execution, high latency
**Solution**:

```typescript
// Check cache hit rates
const optimizer = new PerformanceOptimizer();
console.log('Cache stats:', optimizer.getMetrics().cache);

// Increase cache sizes
MCP_CACHE_SIZE=2000 npm run start
```

## Development Setup

### Git Worktree Configuration

```bash
# Verify you're in the correct worktree
git worktree list
git branch --show-current  # Should show: feature/mcp-tools-integration

# Sync with latest changes
git fetch origin
git rebase origin/dev/base
```

### Development Commands

```bash
# Start in development mode
npm run start

# Start with debugging
npm run debug

# Run with performance monitoring
MCP_PERFORMANCE_LOGGING=true npm run start

# Full development checks
npm run preflight
```

## Next Steps

After completing setup:

1. Review [03-integration-guide.md](./03-integration-guide.md) for detailed integration steps
2. Check [04-multi-llm-requirements.md](./04-multi-llm-requirements.md) for multi-provider considerations
3. Test your setup with [12-testing-strategies.md](./12-testing-strategies.md)

Your MCP tools integration system is now ready for development and deployment!
