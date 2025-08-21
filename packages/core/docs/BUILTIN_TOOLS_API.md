# Built-in Tools Integration API Documentation

## Overview

The Built-in Tools Integration system provides seamless access to Gemini CLI's 11 built-in tools across OpenAI, Anthropic, and Gemini providers with identical functionality, enterprise-grade performance, and comprehensive security validation.

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Built-in Tools Integration                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────┐ │
│  │   OpenAI         │  │   Anthropic      │  │   Gemini    │ │
│  │   Provider       │  │   Provider       │  │   Provider  │ │
│  └──────────────────┘  └──────────────────┘  └─────────────┘ │
│           │                       │                   │      │
│           └───────────────┬───────────────────────────┘      │
│                           │                                  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              BuiltinToolManager                         │ │
│  │  • Performance Optimization (Caching, Parallelization) │ │
│  │  • Security Validation (Multi-layer)                   │ │
│  │  • Resource Management (Pooling, Cleanup)              │ │
│  │  • Unified Tool Interface                               │ │
│  └─────────────────────────────────────────────────────────┘ │
│                           │                                  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                 11 Built-in Tools                       │ │
│  │  File System: read_file, write_file, edit_file, ls,     │ │
│  │               glob, grep, read_many_files (7 tools)     │ │
│  │  Web: web_fetch, google_web_search (2 tools)           │ │
│  │  System: run_shell_command, save_memory (2 tools)      │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Security Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Security Validation Layers               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Layer 1: Tool Configuration & Enablement                   │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ ToolBehaviorManager: Tool allowlisting, risk levels    │ │
│  └─────────────────────────────────────────────────────────┘ │
│                           │                                  │
│  Layer 2: Category-Specific Security                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │FileSystem    │  │Shell Command │  │Web Request       │   │
│  │Boundary      │  │Security      │  │Validation        │   │
│  │• Path Validation│ • Command Filter│ • Private IP Block│   │
│  │• Traversal Block│ • Injection Prev│ • URL Validation │   │
│  │• Git Ignore    │  • Resource Limit│ • Content Limits │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
│                           │                                  │
│  Layer 3: Confirmation & Resource Management                │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ • User Confirmation for High-Risk Operations           │ │
│  │ • Resource Pooling & Cleanup                           │ │
│  │ • Rate Limiting & DoS Prevention                       │ │
│  │ • Circuit Breaker Patterns                             │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## API Reference

### BuiltinToolManager

The core manager class that orchestrates all built-in tool operations with performance optimization and security validation.

#### Constructor

```typescript
constructor(config: Config, toolRegistry?: ToolRegistry)
```

**Parameters:**
- `config`: Configuration object with security and performance settings
- `toolRegistry`: Optional tool registry (auto-created if not provided)

#### Core Methods

##### `initialize(): Promise<void>`

Initializes the tool manager with all security components and performance optimization features.

```typescript
const toolManager = new BuiltinToolManager(config);
await toolManager.initialize();
```

##### `getUnifiedTools(): UnifiedTool[]`

Returns all built-in tools in unified format for provider conversion.

```typescript
const tools = toolManager.getUnifiedTools();
console.log(`Available tools: ${tools.length}`); // 11 tools
```

##### `executeTool(toolCall: UnifiedToolCall, context: ToolExecutionContext): Promise<UnifiedToolResult>`

Executes a single built-in tool with comprehensive security validation and performance optimization.

```typescript
const toolCall: UnifiedToolCall = {
  id: 'read-config',
  name: 'read_file',
  parameters: { file_path: 'package.json' }
};

const context: ToolExecutionContext = {
  signal: new AbortController().signal,
  onProgress: (progress) => console.log('Progress:', progress),
  onConfirmation: async (request) => {
    // Handle confirmation for high-risk operations
    return 'proceed'; // or 'cancel'
  }
};

const result = await toolManager.executeTool(toolCall, context);
```

##### `executeMultipleTools(toolCalls: UnifiedToolCall[], context: ToolExecutionContext, options?: ExecutionOptions): Promise<Map<string, UnifiedToolResult>>`

Executes multiple tools with intelligent coordination, parallel processing, and dependency analysis.

```typescript
const toolCalls = [
  { id: '1', name: 'read_file', parameters: { file_path: 'src/index.ts' } },
  { id: '2', name: 'ls', parameters: { path: 'src/' } },
  { id: '3', name: 'grep', parameters: { pattern: 'export', path: 'src/' } }
];

const results = await toolManager.executeMultipleTools(toolCalls, context, {
  enableParallelization: true,
  maxConcurrentExecutions: 3,
  enableCaching: true
});

for (const [id, result] of results) {
  console.log(`Tool ${id}:`, result.content);
}
```

#### Performance Methods

##### `getPerformanceMetrics(): PerformanceMetrics`

Returns comprehensive performance metrics including cache hits, execution times, and resource usage.

```typescript
const metrics = toolManager.getPerformanceMetrics();
console.log('Cache hit rate:', metrics.overall.cacheHits / metrics.overall.totalExecutions);
console.log('Average execution time:', metrics.overall.averageExecutionTime);
```

##### `optimizeToolOrder(toolCalls: UnifiedToolCall[]): UnifiedToolCall[]`

Optimizes the execution order of multiple tools based on dependencies and performance characteristics.

```typescript
const optimizedOrder = toolManager.optimizeToolOrder(toolCalls);
```

##### `estimateExecutionTime(toolCalls: UnifiedToolCall[]): number`

Estimates the total execution time for a set of tools based on historical performance data.

```typescript
const estimatedMs = toolManager.estimateExecutionTime(toolCalls);
console.log(`Estimated completion time: ${estimatedMs}ms`);
```

#### Security Methods

##### `getSpecializedHandlers(): SecurityHandlers`

Returns specialized security handlers for advanced operations.

```typescript
const handlers = toolManager.getSpecializedHandlers();
// handlers.filesystem, handlers.shell, handlers.web, handlers.memory
```

##### `invalidateCache(tags: string[]): number`

Invalidates cached results by tags (e.g., after file modifications).

```typescript
const invalidated = toolManager.invalidateCache(['file-ops', 'src-directory']);
```

## Provider-Specific Usage

### OpenAI Provider Integration

```typescript
import { OpenAIBuiltinToolsIntegration } from '@google/gemini-cli-core/providers/openai';

// Initialize with built-in tools
const integration = new OpenAIBuiltinToolsIntegration(config);
await integration.initialize();

// Get tools for OpenAI API
const openaiTools = integration.getToolsForOpenAI();

// Use in OpenAI completion
const completion = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'List files in the src directory' }],
  tools: openaiTools,
  tool_choice: 'auto'
});

// Execute tool calls
if (completion.choices[0].message.tool_calls) {
  for (const toolCall of completion.choices[0].message.tool_calls) {
    const result = await integration.executeTool(toolCall, context);
    console.log('Tool result:', result);
  }
}
```

### Anthropic Provider Integration

```typescript
import { AnthropicBuiltinToolsIntegration } from '@google/gemini-cli-core/providers/anthropic';

// Initialize with built-in tools
const integration = new AnthropicBuiltinToolsIntegration(config);
await integration.initialize();

// Get tools for Anthropic API
const anthropicTools = integration.getToolsForAnthropic();

// Use in Anthropic completion
const message = await anthropic.messages.create({
  model: 'claude-3-sonnet-20240229',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Read the package.json file' }],
  tools: anthropicTools
});

// Execute tool calls
if (message.content.some(c => c.type === 'tool_use')) {
  for (const content of message.content) {
    if (content.type === 'tool_use') {
      const result = await integration.executeTool(content, context);
      console.log('Tool result:', result);
    }
  }
}
```

### Gemini Provider (Direct)

```typescript
import { BuiltinToolManager } from '@google/gemini-cli-core/providers/tools';

// Direct usage with Gemini
const toolManager = new BuiltinToolManager(config);
await toolManager.initialize();

// Tools are already in Gemini format
const geminiTools = toolManager.getUnifiedTools().map(tool => tool.schema);

// Use with Gemini API directly
const model = genai.getGenerativeModel({ 
  model: 'gemini-pro',
  tools: geminiTools
});
```

## Built-in Tools Reference

### File System Tools (7 tools)

#### `read_file`
Reads content from a single file within project boundaries.

```typescript
{
  name: 'read_file',
  parameters: { file_path: string }
}
```

**Security:** Validates path is within project root, blocks system files, respects git ignore.

#### `write_file`
Writes content to a file within project boundaries.

```typescript
{
  name: 'write_file', 
  parameters: { file_path: string, content: string }
}
```

**Security:** Requires confirmation, validates write permissions, prevents overwriting critical files.

#### `edit_file`
Edits existing files using find-and-replace operations.

```typescript
{
  name: 'edit_file',
  parameters: { file_path: string, old_text: string, new_text: string }
}
```

**Security:** Validates file exists and is writable, requires confirmation for large changes.

#### `ls`
Lists directory contents with optional filtering.

```typescript
{
  name: 'ls',
  parameters: { path: string, show_hidden?: boolean }
}
```

**Security:** Restricts to project boundaries, filters sensitive directories.

#### `glob`
Finds files matching glob patterns.

```typescript
{
  name: 'glob',
  parameters: { pattern: string, path?: string }
}
```

**Security:** Validates patterns don't escape project root, limits result size.

#### `grep`
Searches for patterns in files.

```typescript
{
  name: 'grep',
  parameters: { pattern: string, path?: string, glob?: string }
}
```

**Security:** Validates search scope, prevents searching sensitive files.

#### `read_many_files`
Reads multiple files efficiently with batch validation.

```typescript
{
  name: 'read_many_files',
  parameters: { file_paths: string[] }
}
```

**Security:** Validates all paths, enforces batch size limits, optimizes with resource pooling.

### Web Tools (2 tools)

#### `web_fetch`
Fetches content from web URLs with comprehensive security validation.

```typescript
{
  name: 'web_fetch',
  parameters: { url: string, prompt: string }
}
```

**Security Features:**
- Private IP address blocking (192.168.x.x, 10.x.x.x, 127.x.x.x, etc.)
- Cloud metadata endpoint blocking (AWS, GCP, Azure)
- Protocol validation (blocks javascript:, data:, file:)
- Content size limits (configurable, default 10MB)
- Request timeout enforcement
- Domain allowlisting support

#### `google_web_search`
Performs Google web searches with query validation.

```typescript
{
  name: 'google_web_search',
  parameters: { query: string, num_results?: number }
}
```

**Security:** Validates queries for malicious patterns, enforces rate limits.

### System Tools (2 tools)

#### `run_shell_command`
Executes shell commands with comprehensive security filtering.

```typescript
{
  name: 'run_shell_command',
  parameters: { command: string }
}
```

**Security Features:**
- Dangerous command blocking (`rm -rf /`, `sudo`, privilege escalation)
- Command injection prevention (`;`, `&&`, `|`, backticks)
- Resource exhaustion prevention (fork bombs, infinite loops)
- Environment variable manipulation detection
- Requires confirmation for all but safest commands

**Blocked Commands Include:**
- Destructive operations: `rm -rf`, `format`, `dd if=/dev/zero`
- Privilege escalation: `sudo`, `su`, `runas`
- Network exploitation: `nc -l`, reverse shells
- Persistence mechanisms: cron modifications, service installation

#### `save_memory`
Saves content to hierarchical memory system with size limits.

```typescript
{
  name: 'save_memory',
  parameters: { content: string, tags?: string[] }
}
```

**Security:** Validates content size, prevents memory exhaustion attacks.

## Configuration

### Security Configuration

```typescript
const config = {
  // File system security
  getProjectRoot: () => '/path/to/project',
  
  // Web security  
  getAllowedHosts: () => ['example.com', 'api.service.com'],
  getBlockedHosts: () => ['malicious.com'],
  getWebRequestTimeout: () => 10000,
  getWebContentLimit: () => 10 * 1024 * 1024, // 10MB
  
  // Tool configuration
  toolsConfig: {
    enabled: true,
    confirmationRequired: true,
    securityLevel: 'HIGH', // 'SAFE' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'
  },
  
  // Performance configuration
  maxConcurrentJobs: 4,
  enableCodeExecution: false, // Requires explicit enable
  allowNetworkAccess: true,
};
```

### CLI Configuration

Built-in tools can be configured via CLI settings:

```bash
# Enable/disable specific tools
gemini config set tools.read_file.enabled true
gemini config set tools.run_shell_command.enabled false

# Set security levels
gemini config set tools.security_level HIGH
gemini config set tools.confirmation_required true

# Performance settings
gemini config set tools.enable_caching true
gemini config set tools.max_parallel_executions 4
```

## Performance Optimization

### Intelligent Caching

The system provides multi-level caching with automatic invalidation:

```typescript
// Cache configuration
const cacheConfig = {
  maxCacheSize: 500,
  defaultTTL: 5 * 60 * 1000, // 5 minutes
  enableIntelligentInvalidation: true,
};

// Cache by tool type
const cacheableTool = ['read_file', 'ls', 'glob', 'grep', 'web_fetch'];
```

### Resource Pooling

Efficient resource management with connection pooling:

```typescript
// HTTP connection pooling for web tools
const httpPool = {
  maxConnections: 10,
  keepAlive: true,
  timeout: 10000,
};

// File descriptor pooling for file operations
const filePool = {
  maxOpenFiles: 50,
  cleanup: true,
};
```

### Parallel Execution

Intelligent parallelization with dependency analysis:

```typescript
const executionOptions = {
  enableParallelization: true,
  maxConcurrentExecutions: 4,
  dependencyAnalysis: true,
  resourceOptimization: true,
};
```

## Error Handling

### Security Errors

```typescript
// File system security violation
{
  isError: true,
  content: "Security validation failed: Path outside project root",
  error: {
    type: 'SECURITY_VIOLATION',
    securityLevel: 'HIGH',
    details: 'Attempted access to /etc/passwd'
  }
}

// Shell command blocked
{
  isError: true,
  content: "Command blocked: rm -rf / is dangerous",
  error: {
    type: 'COMMAND_BLOCKED',
    securityLevel: 'CRITICAL',
    reason: 'Destructive filesystem operation'
  }
}

// Web request blocked
{
  isError: true,
  content: "URL blocked: Private IP address detected",
  error: {
    type: 'URL_BLOCKED', 
    securityLevel: 'HIGH',
    blockedUrl: 'http://192.168.1.1/admin'
  }
}
```

### Performance Errors

```typescript
// Circuit breaker open
{
  isError: true,
  content: "Tool temporarily unavailable (circuit breaker open)",
  error: {
    type: 'CIRCUIT_BREAKER_OPEN',
    retryAfter: 30000,
    failureRate: 0.75
  }
}

// Resource exhaustion
{
  isError: true,
  content: "Resource limit exceeded",
  error: {
    type: 'RESOURCE_LIMIT_EXCEEDED',
    resource: 'memory',
    limit: 100 * 1024 * 1024
  }
}
```

## Best Practices

### Security Best Practices

1. **Always validate user input** before passing to tools
2. **Use confirmation callbacks** for high-risk operations
3. **Configure allowlists** for web requests and shell commands
4. **Monitor execution metrics** for unusual patterns
5. **Implement proper error handling** for security violations

### Performance Best Practices

1. **Enable caching** for read-heavy operations
2. **Use batch operations** when processing multiple files
3. **Leverage parallel execution** for independent operations
4. **Monitor resource usage** and adjust limits accordingly
5. **Implement proper cleanup** in error scenarios

### Integration Best Practices

1. **Initialize once** and reuse tool managers
2. **Handle async operations** properly with AbortController
3. **Implement proper logging** for debugging and monitoring
4. **Use type-safe interfaces** for tool parameters
5. **Test across all providers** to ensure consistency

## Examples

### Complete File Processing Workflow

```typescript
import { BuiltinToolManager } from '@google/gemini-cli-core/providers/tools';

async function processProject(config: Config) {
  const toolManager = new BuiltinToolManager(config);
  await toolManager.initialize();
  
  const context: ToolExecutionContext = {
    signal: new AbortController().signal,
    onProgress: (progress) => console.log('Progress:', progress),
    onConfirmation: async (request) => {
      console.log(`Confirm: ${request.action} - ${request.description}`);
      return 'proceed';
    }
  };
  
  // Step 1: List project files
  const lsResult = await toolManager.executeTool({
    id: 'list-files',
    name: 'ls',
    parameters: { path: 'src', show_hidden: false }
  }, context);
  
  // Step 2: Find TypeScript files
  const globResult = await toolManager.executeTool({
    id: 'find-ts-files',
    name: 'glob', 
    parameters: { pattern: '**/*.ts', path: 'src' }
  }, context);
  
  // Step 3: Search for TODO comments
  const grepResult = await toolManager.executeTool({
    id: 'find-todos',
    name: 'grep',
    parameters: { pattern: 'TODO|FIXME', glob: '**/*.ts' }
  }, context);
  
  // Step 4: Process results with performance metrics
  const metrics = toolManager.getPerformanceMetrics();
  console.log(`Processed in ${metrics.overall.averageExecutionTime}ms`);
  console.log(`Cache hit rate: ${(metrics.overall.cacheHits / metrics.overall.totalExecutions * 100).toFixed(1)}%`);
  
  return {
    files: lsResult.content,
    tsFiles: globResult.content, 
    todos: grepResult.content,
    performance: metrics
  };
}
```

### Multi-Provider Tool Execution

```typescript
async function executeAcrossProviders(toolCall: UnifiedToolCall, context: ToolExecutionContext) {
  const providers = {
    openai: new OpenAIBuiltinToolsIntegration(config),
    anthropic: new AnthropicBuiltinToolsIntegration(config), 
    gemini: new BuiltinToolManager(config)
  };
  
  // Initialize all providers
  await Promise.all(Object.values(providers).map(p => p.initialize()));
  
  // Execute same tool across all providers
  const results = await Promise.all([
    providers.openai.executeTool(toolCall, context),
    providers.anthropic.executeTool(toolCall, context),
    providers.gemini.executeTool(toolCall, context)
  ]);
  
  // Verify identical results
  const [openaiResult, anthropicResult, geminiResult] = results;
  
  console.log('Results identical:', 
    openaiResult.content === anthropicResult.content && 
    anthropicResult.content === geminiResult.content
  );
  
  return results;
}
```

This API documentation demonstrates the comprehensive, secure, and high-performance built-in tools integration system that enables identical tool behavior across all LLM providers with enterprise-grade features.