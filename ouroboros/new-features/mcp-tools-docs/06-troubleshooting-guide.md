# MCP Tools Troubleshooting Guide

This document provides solutions for common issues encountered when integrating MCP tools across different providers.

## Quick Diagnostic Checklist

When encountering MCP tool issues, run through this checklist:

```bash
# 1. Verify MCP infrastructure is available
ls packages/core/src/providers/tools/

# 2. Check tool adapter exists for your provider
ls packages/core/src/providers/{your-provider}/tool-adapter.ts

# 3. Verify configuration is loaded
grep -r "mcpConfig" packages/core/src/config/

# 4. Test MCP connections
node -e "console.log(require('./packages/core/src/providers/tools/mcp-tool-manager.js'))"

# 5. Validate tool formats
npm run test:validation
```

## Common Issues and Solutions

### 1. Tool Discovery Issues

#### Problem: No tools found from MCP servers

**Symptoms:**

```javascript
const tools = mcpManager.getUnifiedTools();
console.log(tools); // []
```

**Diagnosis:**

```typescript
// Check if MCP servers are configured
const serverConfigs = config.getMCPServerConfigs();
console.log('MCP Servers:', Object.keys(serverConfigs));

// Verify server connections
const manager = new MCPToolManager(config);
await manager.initialize();
console.log('Connected servers:', manager.getConnectedServers());
```

**Solutions:**

1. **MCP Server Configuration Missing**

   ```typescript
   // ❌ Missing configuration
   const config = {};

   // ✅ Correct configuration
   const config = {
     mcpServers: {
       'example-server': {
         command: 'node',
         args: ['mcp-server.js'],
       },
     },
   };
   ```

2. **Server Command Path Issues**

   ```bash
   # ❌ Relative paths may fail
   command: './server.js'

   # ✅ Use absolute paths or ensure PATH is correct
   command: '/full/path/to/server.js'
   # or
   command: 'node', args: ['/full/path/to/server.js']
   ```

3. **Connection Timeout**

   ```typescript
   // Increase timeout in configuration
   const mcpConfig = {
     toolExecution: {
       timeoutMs: 60000, // Increase from default 30s
       connectionTimeoutMs: 10000, // Add connection timeout
     },
   };
   ```

4. **Server Process Issues**

   ```bash
   # Test server manually
   node your-mcp-server.js

   # Check server logs
   tail -f mcp-server.log
   ```

#### Problem: Tools discovered but not converted correctly

**Symptoms:**

```javascript
// Tools are found but have undefined/null properties
const tools = mcpManager.getUnifiedTools();
console.log(tools[0]); // { name: undefined, description: null, ... }
```

**Diagnosis:**

```typescript
// Check raw MCP tool format
const rawTools = await mcpClient.listTools();
console.log('Raw MCP tools:', rawTools);

// Test conversion manually
const adapter = new YourProviderToolAdapter();
try {
  const converted = rawTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
  }));
  console.log('Converted tools:', converted);
} catch (error) {
  console.error('Conversion error:', error);
}
```

**Solutions:**

1. **MCP Tool Schema Issues**

   ```typescript
   // ❌ MCP server returns malformed schema
   {
     name: "tool",
     description: null, // Should be string
     inputSchema: undefined // Should be object
   }

   // ✅ Fix MCP server to return proper schema
   {
     name: "tool",
     description: "Tool description",
     inputSchema: {
       type: "object",
       properties: {
         param: { type: "string" }
       }
     }
   }
   ```

2. **Schema Validation Failures**

   ```typescript
   // Add validation before conversion
   import { ToolFormatValidator } from '../tools/format-validation.js';

   const rawTool = await mcpClient.listTools()[0];
   const unifiedTool = convertMCPToUnified(rawTool);

   const context = ToolFormatValidator.createContext('your-provider');
   const validation = ToolFormatValidator.validateUnifiedTool(
     unifiedTool,
     context,
   );

   if (!validation.isValid) {
     console.error('Tool validation failed:', validation.errors);
     // Handle invalid tool
   }
   ```

### 2. Tool Execution Issues

#### Problem: Tool calls not executed

**Symptoms:**

```javascript
// Provider makes tool call but execution never happens
const response = await provider.generateContent(request);
// No tool results in response
```

**Diagnosis:**

```typescript
// Check if tools are detected in provider response
const toolCalls = adapter.extractToolCallsFromResponse(response);
console.log('Detected tool calls:', toolCalls);

// Verify tool execution path
if (toolCalls.length > 0) {
  const unifiedCalls = toolCalls.map((call) =>
    adapter.fromProviderToolCall(call),
  );
  console.log('Unified calls:', unifiedCalls);

  // Test execution manually
  const orchestrator = new ToolExecutionOrchestrator(mcpManager, context);
  const result = await orchestrator.executeToolCallsInParallel(unifiedCalls);
  console.log('Execution result:', result);
}
```

**Solutions:**

1. **Tool Call Detection Issues**

   ```typescript
   // ❌ Missing tool call extraction
   async generateContent(request) {
     const response = await this.client.complete(request);
     // Missing: const toolCalls = this.extractToolCalls(response);
     return this.convertResponse(response);
   }

   // ✅ Proper tool call detection
   async generateContent(request) {
     const response = await this.client.complete(request);
     const toolCalls = this.toolAdapter.extractToolCallsFromResponse(response);

     if (toolCalls.length > 0) {
       // Execute tools and continue conversation
       const unifiedCalls = toolCalls.map(call =>
         this.toolAdapter.fromProviderToolCall(call)
       );
       const results = await this.executeTools(unifiedCalls);
       // Add results to conversation and continue
     }

     return this.convertResponse(response);
   }
   ```

2. **Tool Execution Loop Missing**

   ```typescript
   // ❌ No execution loop
   async generateContent(request) {
     const response = await this.client.complete(request);
     return this.convertResponse(response);
   }

   // ✅ Proper execution loop
   async generateContent(request) {
     let messages = this.convertToProviderFormat(request);
     const maxRounds = this.getMaxToolRounds();

     for (let round = 0; round < maxRounds; round++) {
       const response = await this.client.complete({ messages });
       const toolCalls = this.extractToolCalls(response);

       if (toolCalls.length === 0) {
         return this.convertResponse(response); // No more tools
       }

       // Execute tools and add results to messages
       const results = await this.executeTools(toolCalls);
       messages = this.addToolResultsToMessages(messages, results);
     }
   }
   ```

3. **Orchestrator Configuration Issues**

   ```typescript
   // ❌ Missing execution context
   const orchestrator = new ToolExecutionOrchestrator(mcpManager); // Missing context

   // ✅ Proper context configuration
   const context = {
     config: this.config,
     abortSignal: new AbortController().signal,
     providerId: 'your-provider',
     maxConcurrentTools: 3,
     timeoutMs: 30000,
     onProgress: (message, toolName) => console.log(`[${toolName}] ${message}`),
     onConfirmation: async (details) => this.handleConfirmation(details),
   };
   const orchestrator = new ToolExecutionOrchestrator(mcpManager, context);
   ```

#### Problem: Tool execution hangs or times out

**Symptoms:**

```javascript
// Tool execution never completes
const result = await orchestrator.executeToolCall(toolCall);
// Hangs indefinitely or times out
```

**Diagnosis:**

```typescript
// Add timeout and abort signal
const abortController = new AbortController();
const timeoutId = setTimeout(() => {
  abortController.abort();
  console.log('Tool execution aborted due to timeout');
}, 30000);

try {
  const result = await orchestrator.executeToolCall(
    toolCall,
    abortController.signal,
  );
  clearTimeout(timeoutId);
  console.log('Tool completed:', result);
} catch (error) {
  clearTimeout(timeoutId);
  console.error('Tool execution error:', error);
}
```

**Solutions:**

1. **MCP Server Not Responding**

   ```bash
   # Test MCP server directly
   echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | your-mcp-server

   # Check if server is stuck
   ps aux | grep your-mcp-server

   # Kill and restart if needed
   pkill -f your-mcp-server
   ```

2. **Timeout Configuration**

   ```typescript
   // ❌ Default timeout too short
   const config = {
     toolExecution: {
       timeoutMs: 5000, // Too short for complex tools
     },
   };

   // ✅ Appropriate timeout
   const config = {
     toolExecution: {
       timeoutMs: 60000, // 60 seconds
       maxRetries: 3,
       retryDelayMs: 1000,
     },
   };
   ```

3. **Tool Input Validation**
   ```typescript
   // Add input validation before execution
   const validation = ToolFormatValidator.validateToolCall(toolCall, context);
   if (!validation.isValid) {
     throw new ToolExecutionError(
       `Invalid tool call: ${validation.errors.join(', ')}`,
     );
   }
   ```

### 3. Streaming Issues

#### Problem: Streaming tool calls not accumulated correctly

**Symptoms:**

```javascript
// Partial tool calls executed too early
// or tool calls never complete
for await (const chunk of stream) {
  // Chunks processed but tools not executed
}
```

**Diagnosis:**

```typescript
// Add debugging to streaming accumulation
let accumulatedCalls = [];
for await (const chunk of stream) {
  accumulatedCalls = adapter.accumulateStreamingToolCall(
    chunk,
    accumulatedCalls,
  );
  console.log('Accumulated calls:', accumulatedCalls.length);
  console.log(
    'Complete calls:',
    adapter.getCompleteToolCalls(accumulatedCalls),
  );
}
```

**Solutions:**

1. **Premature Tool Execution**

   ```typescript
   // ❌ Executing incomplete tool calls
   for await (const chunk of stream) {
     const toolCalls = adapter.extractToolCallsFromChunk(chunk);
     if (toolCalls.length > 0) {
       await this.executeTools(toolCalls); // May be incomplete!
     }
   }

   // ✅ Accumulate and execute complete calls only
   let accumulatedCalls = [];
   for await (const chunk of stream) {
     accumulatedCalls = adapter.accumulateStreamingToolCall(
       chunk,
       accumulatedCalls,
     );
     const completeCalls = adapter.getCompleteToolCalls(accumulatedCalls);

     if (completeCalls.length > 0) {
       await this.executeTools(completeCalls);
       // Remove executed calls from accumulation
       accumulatedCalls = adapter.removeExecutedCalls(
         accumulatedCalls,
         completeCalls,
       );
     }
   }
   ```

2. **JSON Parsing Issues in Streams**

   ```typescript
   // ❌ Parsing partial JSON
   const args = JSON.parse(chunk.function.arguments); // May be incomplete

   // ✅ Accumulate JSON and parse when complete
   if (chunk.function?.arguments) {
     currentCall.argumentsAccumulator += chunk.function.arguments;

     try {
       // Test if JSON is complete
       const parsed = JSON.parse(currentCall.argumentsAccumulator);
       currentCall.arguments = parsed;
       currentCall.isComplete = true;
     } catch (e) {
       // Still accumulating, continue
     }
   }
   ```

3. **Provider-Specific Streaming Patterns**

   ```typescript
   // OpenAI streaming pattern
   accumulateStreamingToolCall(chunk: any, accumulated: any[]): any[] {
     if (!chunk.choices?.[0]?.delta?.tool_calls) return accumulated;

     for (const toolCallDelta of chunk.choices[0].delta.tool_calls) {
       const index = toolCallDelta.index;
       if (!accumulated[index]) {
         accumulated[index] = { id: toolCallDelta.id, function: { name: '', arguments: '' } };
       }

       if (toolCallDelta.function?.name) {
         accumulated[index].function.name += toolCallDelta.function.name;
       }
       if (toolCallDelta.function?.arguments) {
         accumulated[index].function.arguments += toolCallDelta.function.arguments;
       }
     }

     return accumulated;
   }

   // Anthropic streaming pattern
   accumulateStreamingToolUse(event: any, current: any): any {
     if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
       return {
         id: event.content_block.id,
         name: event.content_block.name,
         input: ''
       };
     }

     if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
       if (current) {
         current.input += event.delta.partial_json;
       }
     }

     return current;
   }
   ```

### 4. Format Conversion Issues

#### Problem: Tool format conversion failures

**Symptoms:**

```javascript
// Conversion throws errors or returns invalid data
const providerFormat = adapter.toProviderFormat(unifiedTool);
// Error: Cannot convert tool schema
```

**Diagnosis:**

```typescript
// Test conversion step by step
try {
  console.log('Original tool:', unifiedTool);

  const providerFormat = adapter.toProviderFormat(unifiedTool);
  console.log('Provider format:', providerFormat);

  // Test round-trip conversion if possible
  if (adapter.fromFunctionDeclaration) {
    const roundTrip = adapter.fromFunctionDeclaration(providerFormat);
    console.log('Round trip:', roundTrip);
  }

  // Validate the conversion
  const validation = ToolFormatValidator.validateConversion(
    unifiedTool,
    adapter,
    ToolFormatValidator.createContext('provider'),
  );
  console.log('Validation result:', validation);
} catch (error) {
  console.error('Conversion error:', error);
  console.error('Tool that failed:', unifiedTool);
}
```

**Solutions:**

1. **Schema Type Mismatches**

   ```typescript
   // ❌ Incorrect parameter type mapping
   convertParameterType(type: string): string {
     switch (type) {
       case 'string': return 'string';
       case 'number': return 'number';
       // Missing: integer, boolean, array, object
       default: return 'string'; // Wrong fallback
     }
   }

   // ✅ Complete type mapping
   convertParameterType(type: string): string {
     const typeMap = {
       'string': 'string',
       'number': 'number',
       'integer': 'integer',
       'boolean': 'boolean',
       'array': 'array',
       'object': 'object'
     };

     if (!typeMap[type]) {
       throw new ToolConversionError(`Unsupported parameter type: ${type}`);
     }

     return typeMap[type];
   }
   ```

2. **Nested Schema Handling**

   ```typescript
   // ❌ Not handling nested objects
   convertParameterSchema(schema: any): any {
     return {
       type: schema.type,
       description: schema.description
       // Missing: properties, items, etc.
     };
   }

   // ✅ Recursive schema conversion
   convertParameterSchema(schema: any): any {
     const converted: any = {
       type: schema.type,
       description: schema.description
     };

     if (schema.type === 'object' && schema.properties) {
       converted.properties = {};
       for (const [name, prop] of Object.entries(schema.properties)) {
         converted.properties[name] = this.convertParameterSchema(prop as any);
       }
       if (schema.required) converted.required = schema.required;
     }

     if (schema.type === 'array' && schema.items) {
       converted.items = this.convertParameterSchema(schema.items);
     }

     return converted;
   }
   ```

3. **Provider-Specific Constraints**
   ```typescript
   // Add provider-specific validation
   toProviderFormat(tool: UnifiedTool): ProviderTool {
     // Validate before conversion
     const context = ToolFormatValidator.createContext(this.providerId);
     const validation = ToolFormatValidator.validateUnifiedTool(tool, context);

     if (!validation.isValid) {
       throw new ToolConversionError(
         `Tool validation failed: ${validation.errors.join(', ')}`
       );
     }

     // Apply provider-specific transformations
     const converted = this.baseConversion(tool);
     return this.applyProviderConstraints(converted);
   }
   ```

### 5. Configuration Issues

#### Problem: MCP configuration not loaded

**Symptoms:**

```javascript
// Configuration is undefined or has default values
console.log(config.mcpConfig); // undefined or {}
```

**Diagnosis:**

```typescript
// Check configuration loading chain
console.log('Environment variables:');
console.log('MCP_MAX_CONCURRENT_TOOLS:', process.env.MCP_MAX_CONCURRENT_TOOLS);
console.log('MCP_TOOL_TIMEOUT_MS:', process.env.MCP_TOOL_TIMEOUT_MS);

// Check config merging
import { loadConfigFromEnvironment } from '../config/multi-provider-mcp-config.js';
const envConfig = loadConfigFromEnvironment({});
console.log('Environment config:', envConfig);

// Check final merged config
const finalConfig = MultiProviderMCPConfigMerger.merge(userConfig, envConfig);
console.log('Final config:', finalConfig);
```

**Solutions:**

1. **Environment Variable Issues**

   ```bash
   # ❌ Environment variables not set
   # Check if variables are available
   env | grep MCP

   # ✅ Set required variables
   export MCP_MAX_CONCURRENT_TOOLS=5
   export MCP_TOOL_TIMEOUT_MS=60000
   export MCP_CONFIRMATION_MODE=smart
   ```

2. **Config File Loading**

   ```typescript
   // ❌ Config file not found or malformed
   try {
     const configFile = await import('./mcp-config.json');
     console.log('Config file loaded:', configFile);
   } catch (error) {
     console.error('Config file error:', error);
     // Use defaults or prompt user
   }

   // ✅ Robust config loading with fallbacks
   async loadMCPConfig(): Promise<MultiProviderMCPConfig> {
     let config = DEFAULT_MULTI_PROVIDER_MCP_CONFIG;

     // Try to load from file
     try {
       const fileConfig = await this.loadConfigFile();
       config = MultiProviderMCPConfigMerger.merge(fileConfig, config);
     } catch (error) {
       console.warn('Could not load config file, using defaults:', error.message);
     }

     // Load from environment
     config = loadConfigFromEnvironment(config);

     // Validate final config
     const errors = MultiProviderMCPConfigValidator.validate(config);
     if (errors.length > 0) {
       throw new Error(`Invalid MCP configuration: ${errors.join(', ')}`);
     }

     return config;
   }
   ```

3. **Provider-Specific Config Issues**

   ```typescript
   // ❌ Provider config not applied
   constructor(config: any) {
     super(config);
     // Missing: MCP config setup
   }

   // ✅ Proper provider config initialization
   constructor(config: any) {
     super(config);

     // Merge provider-specific MCP config
     const mcpConfig = MultiProviderMCPConfigMerger.merge(
       config.mcpConfig || {},
       {
         toolSettings: {
           [this.providerId]: this.getDefaultToolSettings()
         }
       }
     );

     this.config = { ...config, mcpConfig };
     this.toolAdapter = new ProviderToolAdapter();
     this.mcpManager = new MCPToolManager(config.configInstance);
   }
   ```

## Debugging Tools and Techniques

### 1. Enable Debug Logging

```typescript
// Enable comprehensive logging
const config = {
  debug: {
    logToolCalls: true,
    logToolResults: true,
    logConversions: true,
    logMCPCommunication: true,
    enablePerformanceMetrics: true,
  },
};
```

### 2. Tool Execution Tracing

```typescript
// Add execution tracing
const orchestrator = new ToolExecutionOrchestrator(mcpManager, {
  ...context,
  onProgress: (message, toolName, stage) => {
    console.log(
      `[${new Date().toISOString()}] [${toolName}] ${stage}: ${message}`,
    );
  },
  onToolStart: (toolCall) => {
    console.log(`🔧 Starting tool: ${toolCall.name} (${toolCall.id})`);
  },
  onToolComplete: (result) => {
    console.log(
      `✅ Tool completed: ${result.toolCallId} ${result.isError ? 'with errors' : 'successfully'}`,
    );
  },
});
```

### 3. MCP Communication Debugging

```bash
# Enable MCP debug mode
export MCP_DEBUG=1
export MCP_LOG_LEVEL=debug

# Capture MCP communication
export MCP_TRACE_FILE=mcp-trace.log

# Run your application
npm run start 2>&1 | tee debug.log
```

### 4. Memory and Performance Monitoring

```typescript
// Monitor tool execution performance
class PerformanceMonitor {
  static async monitorToolExecution<T>(
    operation: () => Promise<T>,
    toolName: string,
  ): Promise<T> {
    const startTime = process.hrtime.bigint();
    const startMemory = process.memoryUsage().heapUsed;

    try {
      const result = await operation();

      const endTime = process.hrtime.bigint();
      const endMemory = process.memoryUsage().heapUsed;

      console.log(`Tool ${toolName} performance:`, {
        duration: `${Number(endTime - startTime) / 1000000}ms`,
        memoryDelta: `${(endMemory - startMemory) / 1024 / 1024}MB`,
      });

      return result;
    } catch (error) {
      console.error(`Tool ${toolName} failed:`, error);
      throw error;
    }
  }
}

// Usage
const result = await PerformanceMonitor.monitorToolExecution(
  () => orchestrator.executeToolCall(toolCall),
  toolCall.name,
);
```

## Provider-Specific Troubleshooting

### OpenAI Provider Issues

1. **Function Calling Format**

   ```typescript
   // Verify OpenAI function format is correct
   const tools = [
     {
       type: 'function',
       function: {
         name: 'function_name',
         description: 'Function description',
         parameters: {
           /* JSON Schema */
         },
       },
     },
   ];
   ```

2. **Streaming Tool Calls**
   ```typescript
   // OpenAI streams tool calls in delta format
   // Check for proper accumulation
   if (chunk.choices[0]?.delta?.tool_calls) {
     // Handle incremental tool call data
   }
   ```

### Anthropic Provider Issues

1. **Tool Use Format**

   ```typescript
   // Anthropic uses tool_use blocks
   const tools = [
     {
       name: 'tool_name',
       description: 'Tool description',
       input_schema: {
         /* JSON Schema */
       },
     },
   ];
   ```

2. **Content Block Handling**
   ```typescript
   // Check for mixed content (text + tool_use)
   for (const block of response.content) {
     if (block.type === 'text') {
       // Handle text content
     } else if (block.type === 'tool_use') {
       // Handle tool use
     }
   }
   ```

### Gemini Provider Issues

1. **Function Calling Mode**

   ```typescript
   // Verify function calling mode is set
   const model = genAI.getGenerativeModel({
     model: 'gemini-1.5-pro',
     tools: [{ functionDeclarations }],
     toolConfig: {
       functionCallingConfig: {
         mode: 'AUTO', // or 'ANY', 'NONE'
       },
     },
   });
   ```

2. **Function Response Format**
   ```typescript
   // Gemini requires specific function response format
   const content = {
     role: 'function',
     parts: [
       {
         functionResponse: {
           name: functionName,
           response: result,
         },
       },
     ],
   };
   ```

## Emergency Recovery Procedures

### 1. MCP Server Recovery

```bash
#!/bin/bash
# mcp-recovery.sh - Emergency MCP server recovery script

echo "🚨 MCP Emergency Recovery Started"

# Kill all MCP server processes
echo "Stopping MCP servers..."
pkill -f mcp-server
sleep 2

# Clear MCP connection cache
echo "Clearing MCP cache..."
rm -rf ~/.cache/mcp-connections/

# Restart core services
echo "Restarting application..."
npm run restart

echo "✅ Recovery complete"
```

### 2. Tool Execution Reset

```typescript
// Emergency tool execution reset
class EmergencyRecovery {
  static async resetToolExecution(mcpManager: MCPToolManager): Promise<void> {
    console.log('🚨 Performing emergency tool execution reset');

    // Cancel all pending tool executions
    mcpManager.cancelAllExecutions();

    // Reconnect to MCP servers
    await mcpManager.reconnectAllServers();

    // Validate tool availability
    const tools = mcpManager.getUnifiedTools();
    console.log(`✅ ${tools.length} tools available after reset`);

    // Test basic tool execution
    if (tools.length > 0) {
      try {
        await mcpManager.testToolConnection(tools[0].name);
        console.log('✅ Tool execution test passed');
      } catch (error) {
        console.error('❌ Tool execution test failed:', error);
      }
    }
  }
}
```

### 3. Configuration Fallback

```typescript
// Configuration fallback system
export function createFallbackConfig(): MultiProviderMCPConfig {
  console.warn('⚠️ Using fallback MCP configuration');

  return {
    mcpServers: {}, // No MCP servers - tools disabled
    toolSettings: {
      openai: { maxToolRounds: 1 },
      anthropic: { maxToolUseBlocks: 1 },
      gemini: { maxFunctionCalls: 1 },
    },
    toolExecution: {
      maxConcurrentTools: 1,
      timeoutMs: 10000,
      confirmationMode: 'always',
      enableRetry: false,
    },
    debug: {
      logToolCalls: true,
      logToolResults: true,
      enablePerformanceMetrics: false,
    },
  };
}
```

## Support Resources

### Documentation Links

- [Integration Overview](./01-integration-overview.md) - Architecture and integration points
- [OpenAI Integration](./02-openai-provider-integration.md) - OpenAI-specific implementation
- [Anthropic Integration](./03-anthropic-provider-integration.md) - Anthropic-specific implementation
- [Gemini Integration](./04-gemini-provider-integration.md) - Gemini-specific implementation
- [Testing Guide](./05-testing-guide.md) - Comprehensive testing strategies

### Debug Commands

```bash
# Quick diagnostic
npm run mcp:diagnose

# Test tool adapters
npm run test:adapters

# Validate configurations
npm run config:validate

# Performance benchmark
npm run perf:tools

# Generate debug report
npm run debug:report
```

### Getting Help

1. **Check Logs First**
   - Application logs: `tail -f logs/app.log`
   - MCP logs: `tail -f logs/mcp.log`
   - Error logs: `tail -f logs/error.log`

2. **Run Diagnostics**

   ```bash
   npm run mcp:health-check
   npm run tools:validate
   npm run config:check
   ```

3. **Create Bug Report**
   Include:
   - Provider type and version
   - MCP server configurations
   - Tool names and schemas
   - Error messages with stack traces
   - Configuration files (sanitized)
   - Steps to reproduce

---

**Status**: Troubleshooting Guide Complete 🔧 | Ready for Issue Resolution ✅
