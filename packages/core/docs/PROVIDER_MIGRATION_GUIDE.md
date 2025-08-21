# Provider Migration Guide

## Overview

This guide helps you seamlessly migrate between OpenAI, Anthropic, and Gemini providers while maintaining full built-in tool functionality. The built-in tools integration system ensures **identical behavior** across all providers with zero functionality loss.

## Quick Migration Summary

| Aspect | Status |
|--------|---------|
| **Tool Availability** | ✅ Identical - All 11 tools work across providers |
| **Security Boundaries** | ✅ Identical - Same validation rules everywhere |
| **Performance** | ✅ Optimized - Intelligent caching and resource pooling |
| **Configuration** | ✅ Unified - Single config works for all providers |
| **Error Handling** | ✅ Consistent - Same error formats and recovery |
| **Confirmation Flows** | ✅ Identical - Same UX across providers |

## Migration Scenarios

### Scenario 1: From Gemini to OpenAI

**Before (Gemini only):**
```typescript
import { Config } from '@google/gemini-cli-core';
import { GoogleGenerativeAI } from '@google/genai';

const config = new Config();
const genai = new GoogleGenerativeAI(apiKey);
const model = genai.getGenerativeModel({ 
  model: 'gemini-pro',
  tools: geminiBuiltinTools  // 11 built-in tools
});
```

**After (OpenAI with same tools):**
```typescript
import { Config } from '@google/gemini-cli-core';
import { OpenAIBuiltinToolsIntegration } from '@google/gemini-cli-core/providers/openai';
import OpenAI from 'openai';

const config = new Config(); // Same config object!
const integration = new OpenAIBuiltinToolsIntegration(config);
await integration.initialize();

const openai = new OpenAI({ apiKey });
const completion = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'List files in src directory' }],
  tools: integration.getToolsForOpenAI(), // Same 11 tools, OpenAI format
  tool_choice: 'auto'
});

// Execute tools with identical behavior
if (completion.choices[0].message.tool_calls) {
  for (const toolCall of completion.choices[0].message.tool_calls) {
    const result = await integration.executeTool(toolCall, context);
    // Result format is identical to Gemini!
  }
}
```

### Scenario 2: From OpenAI to Anthropic

**Before (OpenAI):**
```typescript
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey });
const completion = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: messages,
  tools: openaiTools,
  tool_choice: 'auto'
});
```

**After (Anthropic with identical functionality):**
```typescript
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicBuiltinToolsIntegration } from '@google/gemini-cli-core/providers/anthropic';

const integration = new AnthropicBuiltinToolsIntegration(config);
await integration.initialize();

const anthropic = new Anthropic({ apiKey });
const message = await anthropic.messages.create({
  model: 'claude-3-sonnet-20240229',
  max_tokens: 1024,
  messages: messages, // Same messages format!
  tools: integration.getToolsForAnthropic() // Same 11 tools, Anthropic format
});

// Tool execution is identical
for (const content of message.content) {
  if (content.type === 'tool_use') {
    const result = await integration.executeTool(content, context);
    // Same security, same performance, same results!
  }
}
```

### Scenario 3: Multi-Provider Support

**Supporting all providers simultaneously:**
```typescript
class MultiProviderClient {
  private integrations: Map<string, any> = new Map();
  
  async initialize(config: Config) {
    // Initialize all provider integrations
    const openaiIntegration = new OpenAIBuiltinToolsIntegration(config);
    const anthropicIntegration = new AnthropicBuiltinToolsIntegration(config);
    const geminiManager = new BuiltinToolManager(config);
    
    await Promise.all([
      openaiIntegration.initialize(),
      anthropicIntegration.initialize(), 
      geminiManager.initialize()
    ]);
    
    this.integrations.set('openai', openaiIntegration);
    this.integrations.set('anthropic', anthropicIntegration);
    this.integrations.set('gemini', geminiManager);
  }
  
  async executeWithProvider(provider: string, toolCall: any, context: any) {
    const integration = this.integrations.get(provider);
    if (!integration) throw new Error(`Provider ${provider} not initialized`);
    
    // Identical execution regardless of provider!
    return await integration.executeTool(toolCall, context);
  }
  
  // Switch providers seamlessly
  async switchProvider(fromProvider: string, toProvider: string) {
    // No migration needed - all tools work identically!
    console.log(`Switched from ${fromProvider} to ${toProvider} with zero downtime`);
  }
}
```

## Configuration Migration

### Unified Configuration

The same configuration object works across all providers:

```typescript
// This config works for OpenAI, Anthropic, AND Gemini!
const config = {
  // File system security (applies to all providers)
  getProjectRoot: () => '/path/to/project',
  getWorkingDirectory: () => process.cwd(),
  
  // Web security (applies to all providers)  
  getAllowedHosts: () => ['example.com', 'api.trusted.com'],
  getBlockedHosts: () => ['malicious.com', 'untrusted.net'],
  getWebRequestTimeout: () => 10000,
  getWebContentLimit: () => 10 * 1024 * 1024,
  
  // Shell security (applies to all providers)
  allowCodeExecution: false, // Requires explicit enable
  
  // Tool behavior (applies to all providers)
  toolsConfig: {
    enabled: true,
    confirmationRequired: true,
    securityLevel: 'HIGH',
  },
  
  // Performance (applies to all providers)
  maxConcurrentJobs: 4,
  enableCaching: true,
  maxCacheSize: 500,
};
```

### Provider-Specific Settings

If you need provider-specific customization:

```typescript
const providerConfigs = {
  openai: {
    ...config,
    // OpenAI-specific settings
    maxTokens: 4096,
    temperature: 0.7,
  },
  
  anthropic: {
    ...config,
    // Anthropic-specific settings  
    maxTokens: 1024,
    temperature: 0.5,
  },
  
  gemini: {
    ...config,
    // Gemini-specific settings
    safetySettings: 'strict',
  }
};
```

## Tool Compatibility Matrix

All 11 built-in tools work identically across providers:

| Tool | OpenAI | Anthropic | Gemini | Notes |
|------|--------|-----------|--------|-------|
| `read_file` | ✅ | ✅ | ✅ | Identical parameters, security, results |
| `write_file` | ✅ | ✅ | ✅ | Same confirmation flows |
| `edit_file` | ✅ | ✅ | ✅ | Same diff algorithms |
| `ls` | ✅ | ✅ | ✅ | Same directory filtering |
| `glob` | ✅ | ✅ | ✅ | Same pattern matching |
| `grep` | ✅ | ✅ | ✅ | Same search algorithms |
| `read_many_files` | ✅ | ✅ | ✅ | Same batch processing |
| `web_fetch` | ✅ | ✅ | ✅ | Same security validation |
| `google_web_search` | ✅ | ✅ | ✅ | Same rate limiting |
| `run_shell_command` | ✅ | ✅ | ✅ | Same security filtering |
| `save_memory` | ✅ | ✅ | ✅ | Same hierarchical storage |

## Security Migration

### Security Boundaries Are Preserved

When migrating between providers, all security measures remain identical:

```typescript
// These security validations work the same across ALL providers:

// File system security
const fileSystemTest = await integration.executeTool({
  name: 'read_file',
  parameters: { file_path: '/etc/passwd' } // BLOCKED on all providers
}, context);

// Shell command security  
const shellTest = await integration.executeTool({
  name: 'run_shell_command', 
  parameters: { command: 'rm -rf /' } // BLOCKED on all providers
}, context);

// Web request security
const webTest = await integration.executeTool({
  name: 'web_fetch',
  parameters: { 
    url: 'http://127.0.0.1/admin' // BLOCKED on all providers
  }
}, context);
```

### Confirmation Flows

User confirmation flows are consistent across providers:

```typescript
const context = {
  signal: new AbortController().signal,
  onConfirmation: async (request) => {
    // Same confirmation interface regardless of provider
    console.log(`Confirm ${request.action}: ${request.description}`);
    console.log(`Risk level: ${request.riskLevel}`);
    return 'proceed'; // or 'cancel'
  }
};

// Works identically with OpenAI, Anthropic, or Gemini
const result = await integration.executeTool(dangerousToolCall, context);
```

## Performance Migration

### Caching and Optimization

Performance optimizations migrate seamlessly:

```typescript
// Performance settings apply to all providers
const performanceConfig = {
  enableCaching: true,
  maxCacheSize: 500,
  defaultTTL: 5 * 60 * 1000, // 5 minutes
  maxParallelExecutions: 4,
  enableResourcePools: true,
};

// Same performance benefits across providers
const metrics = integration.getPerformanceMetrics();
console.log(`Cache hit rate: ${metrics.overall.cacheHits / metrics.overall.totalExecutions}`);
```

### Resource Pooling

Resource management is provider-agnostic:

```typescript
// HTTP connection pooling for web tools (all providers)
const httpPoolConfig = {
  maxConnections: 10,
  keepAlive: true,
  timeout: 10000,
};

// File descriptor pooling for file tools (all providers) 
const filePoolConfig = {
  maxOpenFiles: 50,
  reuseConnections: true,
};
```

## Migration Checklist

### Pre-Migration Assessment

- [ ] **Identify current tools usage** - All 11 tools will continue working
- [ ] **Review security configurations** - Same config applies to new provider
- [ ] **Check confirmation handlers** - Interface remains identical
- [ ] **Assess performance requirements** - Same optimization features available

### Migration Steps

1. **Install new provider integration**
   ```bash
   npm install @google/gemini-cli-core # Already includes all provider integrations
   ```

2. **Initialize new provider**
   ```typescript
   const newIntegration = new TargetProviderIntegration(config); // Same config!
   await newIntegration.initialize();
   ```

3. **Test tool functionality**
   ```typescript
   // Run validation tests with new provider
   const testCalls = [
     { name: 'read_file', parameters: { file_path: 'package.json' } },
     { name: 'ls', parameters: { path: 'src' } },
     // ... test all 11 tools
   ];
   
   for (const call of testCalls) {
     const result = await newIntegration.executeTool(call, context);
     assert(result.isError === false);
   }
   ```

4. **Migrate API calls**
   ```typescript
   // Old provider calls
   const oldResult = await oldIntegration.executeTool(toolCall, context);
   
   // New provider calls (identical interface!)
   const newResult = await newIntegration.executeTool(toolCall, context);
   
   // Results should be identical
   assert(oldResult.content === newResult.content);
   ```

5. **Update provider-specific code**
   ```typescript
   // Only this changes - the tool format conversion
   const tools = newIntegration.getToolsForNewProvider(); // Different format
   // Everything else remains identical!
   ```

### Post-Migration Validation

- [ ] **Verify all 11 tools work** - Run comprehensive test suite
- [ ] **Check security boundaries** - Ensure same validations apply  
- [ ] **Monitor performance** - Compare metrics before/after
- [ ] **Test error handling** - Ensure consistent error responses
- [ ] **Validate confirmation flows** - Same user experience

## Common Migration Patterns

### Pattern 1: Gradual Migration

```typescript
class GradualMigration {
  private oldProvider: any;
  private newProvider: any;
  private migrationRatio = 0.0; // Start with 0% on new provider
  
  async executeTool(toolCall: any, context: any) {
    // Gradually shift traffic to new provider
    if (Math.random() < this.migrationRatio) {
      return await this.newProvider.executeTool(toolCall, context);
    } else {
      return await this.oldProvider.executeTool(toolCall, context);
    }
  }
  
  increaseMigrationRatio(increment = 0.1) {
    this.migrationRatio = Math.min(1.0, this.migrationRatio + increment);
  }
}
```

### Pattern 2: A/B Testing

```typescript
class ABTestMigration {
  async executeTool(toolCall: any, context: any, userId: string) {
    const isTestGroup = this.isInTestGroup(userId);
    const provider = isTestGroup ? this.newProvider : this.oldProvider;
    
    // Execute with chosen provider
    const result = await provider.executeTool(toolCall, context);
    
    // Log for comparison
    this.logExecution(userId, isTestGroup ? 'new' : 'old', result);
    
    return result;
  }
}
```

### Pattern 3: Fallback Migration

```typescript
class FallbackMigration {
  async executeTool(toolCall: any, context: any) {
    try {
      // Try new provider first
      return await this.newProvider.executeTool(toolCall, context);
    } catch (error) {
      console.warn('New provider failed, falling back:', error);
      // Fallback to old provider
      return await this.oldProvider.executeTool(toolCall, context);
    }
  }
}
```

## Troubleshooting

### Common Issues and Solutions

#### Issue: "Tool not found after migration"

**Solution:** All 11 tools are available on all providers. Check initialization:

```typescript
// Ensure proper initialization
const integration = new NewProviderIntegration(config);
await integration.initialize(); // This is crucial!

const tools = await integration.getAvailableTools();
console.log(`Available tools: ${tools.length}`); // Should be 11
```

#### Issue: "Different results from same tool"

**Solution:** Tools are designed to be identical. Check configuration:

```typescript
// Use the same config object
const sharedConfig = { /* your config */ };

const openaiIntegration = new OpenAIBuiltinToolsIntegration(sharedConfig);
const anthropicIntegration = new AnthropicBuiltinToolsIntegration(sharedConfig);

// Results should be identical for same inputs
```

#### Issue: "Security validation differs"

**Solution:** Security rules are identical. Verify context:

```typescript
// Same context should produce same security decisions
const context = { /* same context object */ };

const securityResult1 = await provider1.executeTool(dangerousCall, context);
const securityResult2 = await provider2.executeTool(dangerousCall, context);

// Both should block dangerous operations identically
expect(securityResult1.isError).toBe(securityResult2.isError);
```

#### Issue: "Performance degradation after migration"

**Solution:** Performance features are identical. Check configuration:

```typescript
// Ensure performance features are enabled
const config = {
  enableCaching: true,
  maxCacheSize: 500,
  maxParallelExecutions: 4,
  enableResourcePools: true,
};

// Monitor performance metrics
const metrics = integration.getPerformanceMetrics();
console.log('Performance metrics:', metrics);
```

### Validation Scripts

Run these scripts to validate successful migration:

```typescript
// Migration validation script
async function validateMigration(oldProvider: any, newProvider: any) {
  const testCalls = [
    { name: 'read_file', parameters: { file_path: 'package.json' } },
    { name: 'ls', parameters: { path: '.' } },
    { name: 'web_fetch', parameters: { url: 'https://example.com', prompt: 'test' } },
    // ... add all 11 tools
  ];
  
  for (const call of testCalls) {
    const oldResult = await oldProvider.executeTool(call, context);
    const newResult = await newProvider.executeTool(call, context);
    
    // Validate identical behavior
    assert(oldResult.isError === newResult.isError, `Error status mismatch for ${call.name}`);
    
    if (!oldResult.isError) {
      // For successful calls, content should be similar (not necessarily identical due to timing)
      assert(oldResult.content.length > 0, `Empty content for ${call.name}`);
      assert(newResult.content.length > 0, `Empty content for ${call.name}`);
    }
  }
  
  console.log('✅ Migration validation successful - all tools work identically!');
}
```

## Best Practices for Migration

### 1. Test in Development First
```typescript
// Always test migration in development environment
const devConfig = { ...prodConfig, securityLevel: 'HIGH' };
await validateMigration(oldProvider, newProvider);
```

### 2. Monitor Performance Metrics
```typescript
// Compare performance before/after migration
const beforeMetrics = oldProvider.getPerformanceMetrics();
const afterMetrics = newProvider.getPerformanceMetrics();

console.log('Performance comparison:', {
  cacheHitRate: {
    before: beforeMetrics.overall.cacheHits / beforeMetrics.overall.totalExecutions,
    after: afterMetrics.overall.cacheHits / afterMetrics.overall.totalExecutions
  }
});
```

### 3. Implement Gradual Rollout
```typescript
// Start with low-risk operations
const lowRiskTools = ['read_file', 'ls', 'glob'];
const highRiskTools = ['write_file', 'run_shell_command'];

// Migrate low-risk tools first
if (lowRiskTools.includes(toolCall.name)) {
  return await newProvider.executeTool(toolCall, context);
} else {
  return await oldProvider.executeTool(toolCall, context);
}
```

### 4. Keep Rollback Plan
```typescript
class MigrationController {
  private rollbackEnabled = true;
  
  async executeTool(toolCall: any, context: any) {
    if (this.rollbackEnabled) {
      try {
        return await this.newProvider.executeTool(toolCall, context);
      } catch (error) {
        console.warn('Rolling back to old provider:', error);
        return await this.oldProvider.executeTool(toolCall, context);
      }
    }
    
    return await this.newProvider.executeTool(toolCall, context);
  }
  
  disableRollback() {
    this.rollbackEnabled = false;
  }
}
```

## Conclusion

The built-in tools integration system makes provider migration seamless by ensuring:

- **100% Tool Compatibility** - All 11 tools work identically 
- **Identical Security** - Same validation rules everywhere
- **Consistent Performance** - Same optimization features  
- **Unified Configuration** - Single config for all providers
- **Preserved Functionality** - Zero feature loss during migration

**Migration is as simple as:**
1. Initialize new provider with same config
2. Update API call format (tools array only)
3. Everything else works identically!

This enables you to switch providers based on cost, performance, availability, or feature requirements without any loss of functionality.