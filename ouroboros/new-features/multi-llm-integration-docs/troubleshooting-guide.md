# Multi-LLM Provider Troubleshooting Guide

## 🎯 Overview

This comprehensive troubleshooting guide addresses common issues, error patterns, and resolution strategies for the Multi-LLM Provider system. It covers provider-specific problems, tool execution issues, configuration errors, and performance concerns.

## 📋 Quick Diagnostic Commands

### System Health Check

```bash
# Check overall system status
gemini --health-check

# Test all configured providers
gemini --test-providers

# Validate configuration
gemini --validate-config

# Check tool compatibility
gemini --check-tool-compatibility

# Review recent logs
gemini --show-logs --last 24h
```

### Provider-Specific Tests

```bash
# Test specific provider
gemini "Hello, world!" --provider openai
gemini "Hello, world!" --provider anthropic
gemini "Hello, world!" --provider gemini

# Test with tools
gemini "List files in current directory" --provider openai
gemini "Read package.json file" --provider anthropic
```

## 🚨 Common Issues and Solutions

### 1. Provider Connection Issues

#### Issue: "Provider 'openai' not available"

**Symptoms:**

- Error when using `--provider openai`
- Provider not listed in `--test-providers`
- Configuration appears correct

**Diagnosis:**

```bash
# Check API key configuration
echo $OPENAI_API_KEY

# Validate configuration
gemini --validate-config --provider openai

# Test direct API connectivity
curl -H "Authorization: Bearer $OPENAI_API_KEY" https://api.openai.com/v1/models
```

**Solutions:**

1. **Missing API Key**

   ```bash
   export OPENAI_API_KEY="your-api-key-here"
   # Or add to ~/.gemini/settings.json
   ```

2. **Invalid API Key Format**

   ```json
   {
     "llm": {
       "providers": {
         "openai": {
           "apiKey": "sk-..." // Must start with sk-
         }
       }
     }
   }
   ```

3. **Network Connectivity Issues**

   ```bash
   # Test network connectivity
   ping api.openai.com

   # Check proxy settings
   echo $HTTP_PROXY
   echo $HTTPS_PROXY
   ```

4. **Firewall/Corporate Network**
   ```json
   {
     "llm": {
       "providers": {
         "openai": {
           "baseURL": "https://your-proxy.company.com/openai",
           "timeout": 60000
         }
       }
     }
   }
   ```

#### Issue: "Authentication failed for provider 'anthropic'"

**Symptoms:**

- 401 or 403 errors
- "Invalid API key" messages
- Provider connection timeouts

**Solutions:**

1. **Check API Key Validity**

   ```bash
   # Validate Anthropic API key
   curl -H "x-api-key: $ANTHROPIC_API_KEY" https://api.anthropic.com/v1/models
   ```

2. **Verify Key Permissions**
   - Ensure key has required scopes
   - Check usage limits and quotas
   - Verify account is in good standing

3. **Configuration Correction**
   ```json
   {
     "llm": {
       "providers": {
         "anthropic": {
           "apiKey": "${ANTHROPIC_API_KEY}",
           "baseURL": "https://api.anthropic.com",
           "timeout": 30000
         }
       }
     }
   }
   ```

### 2. Tool Execution Problems

#### Issue: "Tool 'read_file' failed with provider 'openai'"

**Symptoms:**

- Tools work with Gemini but fail with other providers
- Inconsistent tool behavior
- Tool execution timeouts

**Diagnosis:**

```bash
# Check tool compatibility
gemini --check-tool-compatibility --provider openai

# Test specific tool
gemini "Read the README.md file" --provider openai --debug

# Check tool logs
gemini --show-tool-logs --filter "read_file"
```

**Solutions:**

1. **Provider Tool Compatibility**

   ```typescript
   // Check if tool is compatible with provider
   const compatibility = toolRegistry.getToolCompatibility(
     'read_file',
     'openai',
   );
   if (!compatibility.supported) {
     console.log('Reason:', compatibility.reason);
     console.log('Alternatives:', compatibility.alternatives);
   }
   ```

2. **Tool Configuration Issues**

   ```json
   {
     "tools": {
       "read_file": {
         "enabled": true,
         "providerOverrides": {
           "openai": {
             "maxFileSize": "10MB",
             "allowedExtensions": ["txt", "md", "json"]
           }
         }
       }
     }
   }
   ```

3. **Permission Problems**
   ```json
   {
     "approval": {
       "toolSpecificSettings": {
         "read_file": {
           "mode": "auto",
           "providerOverrides": {
             "openai": "default"
           }
         }
       }
     }
   }
   ```

#### Issue: "Shell command blocked by security policy"

**Symptoms:**

- Shell commands fail with security errors
- "Command not allowed" messages
- Inconsistent command execution

**Solutions:**

1. **Review Security Configuration**

   ```json
   {
     "security": {
       "shell": {
         "allowedCommands": ["ls", "pwd", "git", "npm"],
         "enforcementLevel": "warn", // Change from "block"
         "providerOverrides": {
           "openai": {
             "strictMode": false
           }
         }
       }
     }
   }
   ```

2. **Add Commands to Allowlist**

   ```bash
   # Add safe commands to configuration
   gemini --add-allowed-command "git status"
   gemini --add-allowed-command "npm test"
   ```

3. **Temporary Override**
   ```bash
   # Use YOLO mode for development
   gemini "Run tests" --approval-mode yolo
   ```

### 3. Configuration Issues

#### Issue: "Configuration validation failed"

**Symptoms:**

- Startup errors
- Invalid configuration warnings
- Conflicting settings

**Diagnosis:**

```bash
# Detailed configuration validation
gemini --validate-config --verbose

# Check configuration hierarchy
gemini --show-config --source

# Validate specific sections
gemini --validate-config --section llm.providers
```

**Solutions:**

1. **Fix JSON Syntax Errors**

   ```bash
   # Validate JSON syntax
   cat ~/.gemini/settings.json | jq .

   # Common fixes:
   # - Remove trailing commas
   # - Fix quote marks
   # - Ensure proper nesting
   ```

2. **Resolve Configuration Conflicts**

   ```json
   {
     "llm": {
       "defaultProvider": "gemini", // Must match a configured provider
       "providers": {
         "gemini": {
           "enabled": true, // Must be enabled
           "apiKey": "${GEMINI_API_KEY}"
         }
       }
     }
   }
   ```

3. **Environment Variable Issues**

   ```bash
   # Check environment variables
   gemini --show-env-vars

   # Fix common issues
   export GEMINI_API_KEY="actual-key-not-placeholder"
   unset OPENAI_API_KEY # If not using OpenAI
   ```

#### Issue: "Provider configuration not found"

**Symptoms:**

- Default provider not working
- Missing provider configurations
- Fallback behavior not working

**Solutions:**

1. **Complete Provider Configuration**

   ```json
   {
     "llm": {
       "defaultProvider": "gemini",
       "providers": {
         "gemini": {
           "apiKey": "${GEMINI_API_KEY}",
           "model": "gemini-1.5-pro",
           "enabled": true
         },
         "openai": {
           "apiKey": "${OPENAI_API_KEY}",
           "model": "gpt-4",
           "enabled": true
         }
       }
     }
   }
   ```

2. **Fallback Configuration**
   ```json
   {
     "llm": {
       "failoverStrategy": {
         "enabled": true,
         "fallbackProviders": ["openai", "anthropic"],
         "retryAttempts": 2
       }
     }
   }
   ```

### 4. Performance Issues

#### Issue: "Slow response times"

**Symptoms:**

- Requests taking longer than expected
- Timeouts occurring frequently
- Performance degradation over time

**Diagnosis:**

```bash
# Performance benchmarking
gemini --benchmark --providers all

# Check response times
gemini --test-performance --iterations 10

# Monitor resource usage
gemini --show-metrics --real-time
```

**Solutions:**

1. **Optimize Provider Selection**

   ```json
   {
     "llm": {
       "providers": {
         "gemini": {
           "model": "gemini-1.5-flash", // Faster model
           "timeout": 30000
         },
         "openai": {
           "model": "gpt-3.5-turbo", // Faster than GPT-4
           "timeout": 15000
         }
       }
     }
   }
   ```

2. **Enable Caching**

   ```json
   {
     "performance": {
       "caching": {
         "enabled": true,
         "ttl": 3600,
         "maxSize": "500MB"
       }
     }
   }
   ```

3. **Concurrent Request Limits**
   ```json
   {
     "performance": {
       "concurrency": {
         "maxConcurrentRequests": 5, // Reduce if hitting limits
         "queueTimeout": 30000
       }
     }
   }
   ```

#### Issue: "High memory usage"

**Symptoms:**

- Memory consumption growing over time
- Out of memory errors
- System slowdowns

**Solutions:**

1. **Memory Optimization**

   ```json
   {
     "performance": {
       "memory": {
         "maxHeapSize": "2GB",
         "gcOptimization": true,
         "clearCacheInterval": 3600
       }
     }
   }
   ```

2. **Reduce Cache Size**
   ```json
   {
     "performance": {
       "caching": {
         "maxSize": "100MB", // Reduce from default
         "strategy": "lru"
       }
     }
   }
   ```

### 5. MCP Integration Issues

#### Issue: "MCP server connection failed"

**Symptoms:**

- MCP tools not available
- Server startup failures
- Tool discovery issues

**Diagnosis:**

```bash
# Check MCP server status
gemini --list-mcp-servers --status

# Test MCP server directly
gemini --test-mcp-server database-tools

# Check MCP logs
gemini --show-mcp-logs --server database-tools
```

**Solutions:**

1. **Fix Server Configuration**

   ```json
   {
     "mcpServers": {
       "database-tools": {
         "command": "node",
         "args": ["mcp-servers/database/index.js"],
         "env": {
           "DB_CONNECTION": "postgresql://localhost:5432/mydb"
         },
         "timeout": 10000,
         "trust": false
       }
     }
   }
   ```

2. **Server Dependencies**

   ```bash
   # Install missing dependencies
   cd mcp-servers/database
   npm install

   # Check server can start independently
   node index.js
   ```

3. **Provider Compatibility**
   ```json
   {
     "mcpServers": {
       "database-tools": {
         "supportedProviders": ["gemini", "openai", "anthropic"],
         "providerConfigs": {
           "openai": {
             "timeout": 15000
           }
         }
       }
     }
   }
   ```

## 🔍 Advanced Troubleshooting

### Debug Mode and Logging

#### Enable Debug Logging

```bash
# Enable debug mode
export GEMINI_DEBUG=true
export GEMINI_LOG_LEVEL=debug

# Run with verbose output
gemini "test command" --debug --verbose

# Save logs to file
gemini "test command" --log-file debug.log
```

#### Debug Configuration

```json
{
  "logging": {
    "level": "debug",
    "outputs": ["console", "file"],
    "file": {
      "path": "~/.gemini/logs/debug.log",
      "maxSize": "50MB",
      "rotate": true
    },
    "providers": {
      "logRequests": true,
      "logResponses": true,
      "logErrors": true
    }
  }
}
```

### Network Debugging

#### Check Network Connectivity

```bash
# Test provider endpoints
curl -I https://api.openai.com/v1/models
curl -I https://api.anthropic.com/v1/models
curl -I https://generativelanguage.googleapis.com/v1/models

# Check DNS resolution
nslookup api.openai.com
nslookup api.anthropic.com

# Test with proxy
curl --proxy http://proxy.company.com:8080 https://api.openai.com/v1/models
```

#### Proxy Configuration

```json
{
  "network": {
    "proxy": {
      "http": "http://proxy.company.com:8080",
      "https": "https://proxy.company.com:8080",
      "noProxy": ["localhost", "127.0.0.1"]
    },
    "timeout": 60000,
    "retries": 3
  }
}
```

### Provider-Specific Debugging

#### OpenAI Debugging

```bash
# Test OpenAI API directly
curl https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 100
  }'
```

#### Anthropic Debugging

```bash
# Test Anthropic API directly
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 100,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

## 📊 Error Code Reference

### Provider Error Codes

#### Common HTTP Status Codes

| Code | Provider | Meaning                  | Solution                                 |
| ---- | -------- | ------------------------ | ---------------------------------------- |
| 401  | All      | Invalid API key          | Check API key configuration              |
| 403  | All      | Insufficient permissions | Verify account permissions               |
| 429  | All      | Rate limit exceeded      | Implement retry logic or reduce requests |
| 500  | All      | Provider server error    | Wait and retry, check provider status    |
| 503  | All      | Service unavailable      | Check provider status page               |

#### Provider-Specific Errors

**OpenAI Error Codes:**

- `invalid_api_key`: API key format incorrect
- `model_not_found`: Requested model not available
- `context_length_exceeded`: Prompt too long for model
- `rate_limit_exceeded`: Request rate too high

**Anthropic Error Codes:**

- `authentication_error`: API key invalid or missing
- `permission_error`: Insufficient permissions
- `not_found_error`: Resource not found
- `rate_limit_error`: Rate limit exceeded

**Gemini Error Codes:**

- `PERMISSION_DENIED`: API key or permissions issue
- `RESOURCE_EXHAUSTED`: Quota exceeded
- `INVALID_ARGUMENT`: Invalid request parameters
- `UNAVAILABLE`: Service temporarily unavailable

### Application Error Codes

#### Configuration Errors

- `CONFIG_001`: Invalid JSON syntax in configuration file
- `CONFIG_002`: Missing required configuration section
- `CONFIG_003`: Environment variable not found
- `CONFIG_004`: Provider not configured
- `CONFIG_005`: Conflicting configuration values

#### Security Errors

- `SEC_001`: File system boundary violation
- `SEC_002`: Dangerous shell command detected
- `SEC_003`: Privilege escalation attempt
- `SEC_004`: Command injection detected
- `SEC_005`: Unauthorized tool access

#### Tool Errors

- `TOOL_001`: Tool not compatible with provider
- `TOOL_002`: Tool execution timeout
- `TOOL_003`: Invalid tool parameters
- `TOOL_004`: Tool permission denied
- `TOOL_005`: Tool execution failed

## 🛠️ Recovery Procedures

### Emergency Recovery

#### Complete System Reset

```bash
# Backup current configuration
cp ~/.gemini/settings.json ~/.gemini/settings.json.backup

# Reset to default configuration
gemini --reset-config

# Test basic functionality
gemini "Hello, world!"

# Restore custom settings incrementally
```

#### Provider-Specific Recovery

```bash
# Disable problematic provider
gemini --disable-provider openai

# Test with working providers
gemini "Test message" --provider gemini

# Re-enable with clean configuration
gemini --enable-provider openai --reset-provider-config
```

### Data Recovery

#### Log Analysis

```bash
# Extract error patterns
grep "ERROR" ~/.gemini/logs/*.log | tail -50

# Find specific provider issues
grep "openai" ~/.gemini/logs/*.log | grep "ERROR"

# Analyze tool execution failures
grep "TOOL_" ~/.gemini/logs/*.log
```

#### Configuration Recovery

```bash
# Find working configuration
gemini --show-config --validate

# Compare with backup
diff ~/.gemini/settings.json.backup ~/.gemini/settings.json

# Merge configurations
gemini --merge-config ~/.gemini/settings.json.backup
```

## 📞 Getting Help

### Self-Service Resources

1. **Documentation**: Complete API and configuration references
2. **Examples**: Working configuration examples for common scenarios
3. **FAQ**: Frequently asked questions and solutions
4. **Community Forum**: Peer support and discussion

### Support Escalation

1. **GitHub Issues**: Bug reports and feature requests
2. **Technical Support**: Direct support for critical issues
3. **Professional Services**: Implementation and optimization assistance

### Information to Include in Support Requests

```bash
# System information
gemini --version
gemini --system-info

# Configuration (sanitized)
gemini --show-config --sanitize

# Recent logs
gemini --export-logs --last 24h

# Error reproduction
gemini "problematic command" --debug 2>&1 | tee error.log
```

---

## 🚀 Prevention and Best Practices

### Proactive Monitoring

- Set up health checks and alerting
- Monitor performance metrics regularly
- Review logs for warning patterns
- Test provider connectivity periodically

### Configuration Management

- Version control configuration files
- Test configuration changes in staging
- Document custom configurations
- Regular configuration audits

### Maintenance Schedule

- **Daily**: Check system health and logs
- **Weekly**: Review performance metrics
- **Monthly**: Update configurations and test providers
- **Quarterly**: Full system assessment and optimization

---

_This troubleshooting guide is continuously updated based on common issues and user feedback. For the latest troubleshooting information, check the online documentation._
