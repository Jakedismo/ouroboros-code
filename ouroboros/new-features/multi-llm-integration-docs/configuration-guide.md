# Multi-LLM Provider Configuration Guide

## 🎯 Overview

This guide provides comprehensive configuration instructions for the Multi-LLM Provider system, covering everything from basic setup to advanced enterprise deployments.

## 🔧 Basic Configuration

### Environment Variables (Recommended)

#### Required API Keys

```bash
# Gemini (existing, required for default provider)
export GEMINI_API_KEY="your-gemini-api-key"

# OpenAI (optional, required only if using OpenAI)
export OPENAI_API_KEY="your-openai-api-key"

# Anthropic (optional, required only if using Anthropic)
export ANTHROPIC_API_KEY="your-anthropic-api-key"
```

#### Optional Environment Variables

```bash
# Set default provider (if not Gemini)
export GEMINI_DEFAULT_PROVIDER="openai"

# Provider-specific base URLs (for enterprise/custom endpoints)
export OPENAI_BASE_URL="https://your-custom-openai-endpoint.com"
export ANTHROPIC_BASE_URL="https://your-custom-anthropic-endpoint.com"

# Default models per provider
export GEMINI_DEFAULT_MODEL="gemini-1.5-pro"
export OPENAI_DEFAULT_MODEL="gpt-5"
export ANTHROPIC_DEFAULT_MODEL="claude-4-sonnet-20250514"
```

### Configuration File Setup

#### Location Hierarchy

The system looks for configuration files in this order:

1. `./gemini/settings.json` (project-specific)
2. `~/.gemini/settings.json` (user-specific)
3. Environment variables
4. Default values

#### Basic Configuration File

Create `.gemini/settings.json`:

```json
{
  "llm": {
    "defaultProvider": "gemini",
    "apiKeys": {
      "gemini": "${GEMINI_API_KEY}",
      "openai": "${OPENAI_API_KEY}",
      "anthropic": "${ANTHROPIC_API_KEY}"
    },
    "models": {
      "gemini": "gemini-1.5-pro",
      "openai": "gpt-5",
      "anthropic": "claude-4-sonnet-20250514"
    }
  }
}
```

## ⚙️ Advanced Configuration

### Provider-Specific Settings

#### Complete Provider Configuration

```json
{
  "llm": {
    "defaultProvider": "gemini",
    "providers": {
      "gemini": {
        "apiKey": "${GEMINI_API_KEY}",
        "model": "gemini-1.5-pro",
        "maxTokens": 2048,
        "temperature": 0.7,
        "topK": 40,
        "topP": 0.95,
        "safetySettings": {
          "HARM_CATEGORY_HARASSMENT": "BLOCK_MEDIUM_AND_ABOVE",
          "HARM_CATEGORY_HATE_SPEECH": "BLOCK_MEDIUM_AND_ABOVE"
        }
      },
      "openai": {
        "apiKey": "${OPENAI_API_KEY}",
        "baseUrl": "https://api.openai.com/v1",
        "model": "gpt-5",
        "maxTokens": 1500,
        "temperature": 0.5,
        "topP": 0.9,
        "frequencyPenalty": 0.0,
        "presencePenalty": 0.0,
        "timeout": 30000,
        "maxRetries": 3
      },
      "anthropic": {
        "apiKey": "${ANTHROPIC_API_KEY}",
        "baseUrl": "https://api.anthropic.com",
        "model": "claude-4-sonnet-20250514",
        "maxTokens": 2000,
        "temperature": 0.6,
        "timeout": 45000,
        "maxRetries": 3
      }
    }
  }
}
```

### Model Configuration Options

#### Available Models by Provider

**Gemini Models:**

```json
{
  "llm": {
    "providers": {
      "gemini": {
        "availableModels": [
          "gemini-1.5-pro", // Best balance of quality and speed
          "gemini-1.5-flash", // Fastest responses
          "gemini-1.0-pro", // Legacy stable version
          "gemini-pro-vision" // Vision capabilities
        ]
      }
    }
  }
}
```

**OpenAI Models:**

```json
{
  "llm": {
    "providers": {
      "openai": {
        "availableModels": [
          "gpt-5",                    // Most capable
          "o3",                       // Reasoning optimized
          "gpt-5-mini",              // Fast and efficient
          "gpt-5-nano"               // Ultra-fast responses
        ]
      }
    }
  }
}
```

**Anthropic Models:**

```json
{
  "llm": {
    "providers": {
      "anthropic": {
        "availableModels": [
          "claude-opus-4-1-20250805",   // Most powerful reasoning
          "claude-4-sonnet-20250514"     // Balanced capabilities
        ]
      }
    }
  }
}
```

### Tool Integration Configuration

#### Tool Approval Settings

```json
{
  "approval": {
    "mode": "default", // default, auto, yolo
    "providerOverrides": {
      "gemini": "default",
      "openai": "auto", // Auto-approve file operations
      "anthropic": "yolo" // No confirmations
    },
    "toolSpecificSettings": {
      "shell_command": {
        "mode": "default", // Always require confirmation
        "trustedCommands": ["ls", "pwd", "whoami"]
      },
      "write_file": {
        "mode": "auto", // Auto-approve in most cases
        "dangerousPatterns": ["rm ", "del ", "DROP TABLE"]
      }
    }
  }
}
```

#### Security Configuration

```json
{
  "security": {
    "toolValidation": {
      "enabled": true,
      "strictMode": false,
      "allowedFilePatterns": ["**/*.txt", "**/*.md", "**/*.json"],
      "blockedFilePatterns": ["**/.env", "**/secrets/**"],
      "maxFileSize": "10MB"
    },
    "networkAccess": {
      "enabled": true,
      "allowedDomains": ["*.example.com", "api.trusted-service.com"],
      "blockedDomains": ["*.malicious.com"],
      "timeout": 30000
    }
  }
}
```

### MCP Integration Configuration

#### MCP Servers with Multi-Provider Support

```json
{
  "mcpServers": {
    "database-tools": {
      "command": "node",
      "args": ["mcp-servers/database/index.js"],
      "env": {
        "DB_CONNECTION": "postgresql://localhost:5432/mydb"
      },
      "trust": false,
      "timeout": 10000,
      "supportedProviders": ["gemini", "openai", "anthropic"]
    },
    "file-operations": {
      "command": "python",
      "args": ["-m", "mcp_servers.file_ops"],
      "trust": true,
      "supportedProviders": ["gemini", "openai"]
    }
  }
}
```

## 🏢 Enterprise Configuration

### Multi-Environment Setup

#### Development Environment

```json
{
  "environment": "development",
  "llm": {
    "defaultProvider": "gemini",
    "providers": {
      "gemini": {
        "model": "gemini-1.5-flash", // Faster for development
        "maxTokens": 1000,
        "temperature": 0.8 // More creative
      },
      "openai": {
        "model": "gpt-3.5-turbo", // Cheaper for testing
        "maxTokens": 800
      }
    }
  },
  "approval": {
    "mode": "yolo" // No confirmations in dev
  }
}
```

#### Production Environment

```json
{
  "environment": "production",
  "llm": {
    "defaultProvider": "gemini",
    "providers": {
      "gemini": {
        "model": "gemini-1.5-pro", // Best quality
        "maxTokens": 2048,
        "temperature": 0.5 // More deterministic
      },
      "openai": {
        "model": "gpt-5",               // High quality
        "maxTokens": 1500,
        "timeout": 60000 // Longer timeout
      }
    }
  },
  "approval": {
    "mode": "default" // Require confirmations
  },
  "logging": {
    "level": "info",
    "auditMode": true
  }
}
```

### Load Balancing and Failover

#### Provider Failover Configuration

```json
{
  "llm": {
    "failoverStrategy": {
      "enabled": true,
      "primaryProvider": "gemini",
      "fallbackProviders": ["openai", "anthropic"],
      "retryAttempts": 2,
      "fallbackDelay": 1000,
      "healthCheckInterval": 300000
    },
    "loadBalancing": {
      "enabled": false,
      "strategy": "round_robin", // round_robin, least_used, random
      "weights": {
        "gemini": 0.5,
        "openai": 0.3,
        "anthropic": 0.2
      }
    }
  }
}
```

### Enterprise Security Configuration

#### Advanced Security Settings

```json
{
  "security": {
    "authentication": {
      "required": true,
      "method": "oauth2",
      "providers": {
        "google": {
          "clientId": "${GOOGLE_CLIENT_ID}",
          "clientSecret": "${GOOGLE_CLIENT_SECRET}"
        }
      }
    },
    "authorization": {
      "enabled": true,
      "roles": {
        "admin": {
          "providers": ["gemini", "openai", "anthropic"],
          "tools": ["*"],
          "approvalOverride": true
        },
        "developer": {
          "providers": ["gemini", "openai"],
          "tools": ["read_file", "write_file", "shell_command"],
          "approvalRequired": true
        },
        "analyst": {
          "providers": ["gemini"],
          "tools": ["read_file", "web_search", "web_fetch"],
          "approvalRequired": false
        }
      }
    },
    "audit": {
      "enabled": true,
      "logLevel": "detailed",
      "includeContent": false,
      "retention": "90d"
    }
  }
}
```

## 🔄 Migration and Compatibility

### Migrating from Gemini-Only Configuration

#### Step 1: Backup Existing Configuration

```bash
cp ~/.gemini/settings.json ~/.gemini/settings.json.backup
```

#### Step 2: Add Multi-Provider Support

```json
{
  // Existing settings remain unchanged
  "model": "gemini-1.5-pro",
  "maxTokens": 2048,
  "temperature": 0.7,

  // Add new multi-provider section
  "llm": {
    "defaultProvider": "gemini",
    "providers": {
      "gemini": {
        // Inherit from existing settings
        "model": "${model}",
        "maxTokens": "${maxTokens}",
        "temperature": "${temperature}"
      }
    }
  }
}
```

#### Step 3: Test Configuration

```bash
# Test that existing functionality still works
gemini "Test existing configuration"

# Test new provider functionality
gemini "Test new provider" --provider openai
```

### Legacy Compatibility Settings

```json
{
  "compatibility": {
    "legacyMode": true,
    "preserveOldSettings": true,
    "warnOnDeprecated": true,
    "autoMigrate": {
      "enabled": true,
      "backupOriginal": true
    }
  }
}
```

## 📊 Performance Configuration

### Optimization Settings

#### Response Time Optimization

```json
{
  "performance": {
    "caching": {
      "enabled": true,
      "ttl": 3600,
      "maxSize": "100MB",
      "strategy": "lru"
    },
    "streaming": {
      "enabled": true,
      "bufferSize": 1024,
      "flushInterval": 100
    },
    "concurrency": {
      "maxConcurrentRequests": 5,
      "queueTimeout": 30000
    }
  }
}
```

#### Resource Management

```json
{
  "resources": {
    "memory": {
      "maxHeapSize": "512MB",
      "gcOptimization": true
    },
    "network": {
      "connectionPoolSize": 10,
      "keepAliveTimeout": 60000,
      "retryStrategy": "exponential_backoff"
    },
    "disk": {
      "tempDirectory": "/tmp/gemini",
      "maxTempSize": "1GB",
      "cleanupInterval": 3600
    }
  }
}
```

## 🔍 Monitoring and Debugging

### Logging Configuration

```json
{
  "logging": {
    "level": "info", // debug, info, warn, error
    "format": "json", // json, text
    "outputs": ["console", "file"],
    "file": {
      "path": "~/.gemini/logs/app.log",
      "maxSize": "100MB",
      "maxFiles": 10,
      "rotate": true
    },
    "providers": {
      "logRequests": true,
      "logResponses": false, // Set to true for debugging
      "logErrors": true,
      "logPerformance": true
    }
  }
}
```

### Telemetry Configuration

```json
{
  "telemetry": {
    "enabled": true,
    "endpoint": "https://telemetry.example.com",
    "batchSize": 100,
    "flushInterval": 30000,
    "metrics": {
      "requestLatency": true,
      "tokenUsage": true,
      "errorRates": true,
      "providerHealth": true
    }
  }
}
```

## ✅ Configuration Validation

### Validation Commands

```bash
# Validate configuration file
gemini --validate-config

# Test provider connectivity
gemini --test-providers

# Check API key validity
gemini --check-keys

# Run configuration diagnostics
gemini --config-health
```

### Common Configuration Issues

#### Invalid API Keys

```json
{
  "errors": [
    {
      "provider": "openai",
      "error": "Invalid API key",
      "solution": "Check OPENAI_API_KEY environment variable"
    }
  ]
}
```

#### Model Availability

```json
{
  "warnings": [
    {
      "provider": "anthropic",
      "model": "claude-opus-4-1-20250805",
      "warning": "Model requires special access",
      "solution": "Request access from Anthropic or use claude-3-sonnet-20240229"
    }
  ]
}
```

## 🔗 Next Steps

- **Review [Migration Guide](migration-guide.md)** for upgrading existing deployments
- **Explore [Advanced Examples](examples/advanced-configurations.md)** for complex setups
- **Check [Security Guide](security-and-validation.md)** for enterprise security
- **Monitor [Performance Benchmarks](performance-benchmarks.md)** for optimization

---

_This configuration guide provides the foundation for a robust multi-provider setup. Start with basic configuration and gradually add advanced features as needed._
