# Multi-LLM Provider Migration Guide

## 🎯 Overview

This guide provides step-by-step instructions for migrating from the original Gemini-only setup to the new Multi-LLM Provider system. The migration is designed to be **zero-downtime** and **fully backward compatible**.

## 🔄 Migration Strategies

### Strategy 1: Gradual Migration (Recommended)

- **Timeline**: 1-2 weeks
- **Risk Level**: Low
- **Downtime**: None
- **Best For**: Production environments, teams with existing workflows

### Strategy 2: Direct Migration

- **Timeline**: 1-2 days
- **Risk Level**: Medium
- **Downtime**: Minimal
- **Best For**: Development environments, new projects

### Strategy 3: Parallel Deployment

- **Timeline**: 2-4 weeks
- **Risk Level**: Low
- **Downtime**: None
- **Best For**: Enterprise environments with strict change control

## 📋 Pre-Migration Checklist

### ✅ Assessment Phase

#### Current Configuration Review

```bash
# Check current Gemini CLI version
gemini --version

# Review existing configuration
cat ~/.gemini/settings.json

# Check active MCP servers
gemini --list-mcp-servers

# Verify current tool usage
gemini --list-tools
```

#### Environment Inventory

```bash
# Document current environment variables
env | grep -i gemini
env | grep -i openai
env | grep -i anthropic

# Check project-specific configurations
find . -name ".gemini" -type d
find . -name "settings.json" | grep gemini
```

#### Usage Pattern Analysis

```bash
# Review recent command history (if logging enabled)
grep "gemini" ~/.bash_history | tail -50

# Check tool usage patterns
# Review approval settings and security configurations
```

### ✅ Requirements Verification

#### System Requirements

- **Node.js**: Version 16.0+ (check with `node --version`)
- **NPM/Yarn**: Latest stable version
- **Disk Space**: Additional 50MB for new provider SDKs
- **Network**: Access to provider APIs (api.openai.com, api.anthropic.com)

#### API Access Requirements

- **Existing Gemini API key**: Must remain functional
- **OpenAI API key**: Optional, only if using OpenAI provider
- **Anthropic API key**: Optional, only if using Anthropic provider

## 🚀 Migration Process

### Phase 1: Backup and Preparation

#### 1.1 Create Configuration Backup

```bash
# Create backup directory
mkdir -p ~/.gemini/migration-backup/$(date +%Y%m%d)

# Backup current configuration
cp ~/.gemini/settings.json ~/.gemini/migration-backup/$(date +%Y%m%d)/settings.json.backup

# Backup project-specific configurations
find . -name ".gemini" -exec cp -r {} ~/.gemini/migration-backup/$(date +%Y%m%d)/ \;

# Document current environment
env | grep -E "(GEMINI|OPENAI|ANTHROPIC)" > ~/.gemini/migration-backup/$(date +%Y%m%d)/environment.backup
```

#### 1.2 Update to Multi-Provider Version

```bash
# Update Gemini CLI to multi-provider version
npm update -g @google/gemini-cli

# Verify new version with multi-provider support
gemini --version
gemini --help | grep -i provider
```

### Phase 2: Gradual Migration

#### 2.1 Enable Multi-Provider Support (Backward Compatible)

Create or update `~/.gemini/settings.json` with multi-provider structure while preserving existing functionality:

```json
{
  // Existing settings remain unchanged for backward compatibility
  "model": "gemini-1.5-pro",
  "maxTokens": 2048,
  "temperature": 0.7,
  "apiKey": "${GEMINI_API_KEY}",

  // Add new multi-provider section
  "llm": {
    "defaultProvider": "gemini",
    "providers": {
      "gemini": {
        // Inherits from existing settings above
        "apiKey": "${GEMINI_API_KEY}",
        "model": "${model}",
        "maxTokens": "${maxTokens}",
        "temperature": "${temperature}"
      }
    }
  }
}
```

#### 2.2 Validate Backward Compatibility

```bash
# Test existing commands still work
gemini "Test backward compatibility"

# Verify tools still function
gemini "Read this file" README.md

# Check MCP servers still work
gemini --list-mcp-servers
```

#### 2.3 Add Additional Providers (Optional)

Only add providers you plan to use:

```json
{
  "llm": {
    "defaultProvider": "gemini",
    "providers": {
      "gemini": {
        "apiKey": "${GEMINI_API_KEY}",
        "model": "gemini-1.5-pro",
        "maxTokens": 2048,
        "temperature": 0.7
      },
      "openai": {
        "apiKey": "${OPENAI_API_KEY}",
        "model": "gpt-4",
        "maxTokens": 1500,
        "temperature": 0.5
      },
      "anthropic": {
        "apiKey": "${ANTHROPIC_API_KEY}",
        "model": "claude-3-5-sonnet-20241022",
        "maxTokens": 2000,
        "temperature": 0.6
      }
    }
  }
}
```

#### 2.4 Set Up API Keys

```bash
# Add new environment variables (optional providers)
echo 'export OPENAI_API_KEY="your-openai-key-here"' >> ~/.bashrc
echo 'export ANTHROPIC_API_KEY="your-anthropic-key-here"' >> ~/.bashrc

# Reload environment
source ~/.bashrc

# Verify API keys
gemini --test-providers
```

### Phase 3: Testing and Validation

#### 3.1 Basic Functionality Testing

```bash
# Test default provider (should still be Gemini)
gemini "Test default provider functionality"

# Test provider switching
gemini "Test OpenAI provider" --provider openai
gemini "Test Anthropic provider" --provider anthropic

# Test tool compatibility across providers
gemini "Read and analyze package.json" --provider openai
gemini "List files in current directory" --provider anthropic
```

#### 3.2 Advanced Feature Testing

```bash
# Test MCP tools with different providers
gemini "Use MCP database tool" --provider openai
gemini "Execute MCP web tool" --provider anthropic

# Test approval flows across providers
gemini "Write a test file" --provider openai
gemini "Run shell command: ls -la" --provider anthropic

# Test streaming and performance
gemini "Generate long response" --provider openai --stream
gemini "Create detailed analysis" --provider anthropic --stream
```

#### 3.3 Performance Comparison

```bash
# Benchmark response times
time gemini "Quick test" --provider gemini
time gemini "Quick test" --provider openai
time gemini "Quick test" --provider anthropic

# Compare quality for specific tasks
gemini "Write creative story" --provider openai > openai_story.txt
gemini "Write creative story" --provider anthropic > anthropic_story.txt
gemini "Write creative story" --provider gemini > gemini_story.txt
```

### Phase 4: Configuration Migration

#### 4.1 Migrate Tool Approval Settings

Update approval configurations for multi-provider support:

```json
{
  "approval": {
    "mode": "default",
    "providerOverrides": {
      "gemini": "default", // Keep existing behavior
      "openai": "auto", // Auto-approve safe operations
      "anthropic": "default" // Require confirmations
    },
    "toolSpecificSettings": {
      "shell_command": {
        "mode": "default", // Always require confirmation
        "trustedCommands": ["ls", "pwd", "whoami", "git status"]
      },
      "write_file": {
        "mode": "auto", // Auto-approve in most cases
        "dangerousPatterns": ["rm ", "del ", "DROP TABLE"]
      }
    }
  }
}
```

#### 4.2 Migrate MCP Server Configurations

Update MCP servers to support multiple providers:

```json
{
  "mcpServers": {
    "existing-server": {
      "command": "node",
      "args": ["existing-server/index.js"],
      "trust": false,
      // Add provider support
      "supportedProviders": ["gemini", "openai", "anthropic"],
      "providerConfigs": {
        "gemini": {
          "timeout": 10000
        },
        "openai": {
          "timeout": 15000
        },
        "anthropic": {
          "timeout": 20000
        }
      }
    }
  }
}
```

### Phase 5: Team Migration

#### 5.1 Team Communication Plan

1. **Announcement**: Notify team of upcoming migration
2. **Training**: Provide migration guide and new features overview
3. **Timeline**: Share migration schedule and milestones
4. **Support**: Establish support channels for migration issues

#### 5.2 Gradual Team Rollout

```bash
# Stage 1: Development team (1-2 weeks)
# Stage 2: QA and staging environments (1 week)
# Stage 3: Production deployment (phased)

# Monitor each stage before proceeding
# Collect feedback and address issues
```

#### 5.3 Documentation and Training

- Share updated command references
- Provide provider selection guidelines
- Document new approval workflows
- Create troubleshooting playbooks

## 🔧 Advanced Migration Scenarios

### Enterprise Multi-Environment Migration

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
        "temperature": 0.8
      }
    }
  },
  "approval": {
    "mode": "yolo" // No confirmations in dev
  }
}
```

#### Staging Environment

```json
{
  "environment": "staging",
  "llm": {
    "defaultProvider": "gemini",
    "providers": {
      "gemini": {
        "model": "gemini-1.5-pro",
        "maxTokens": 2048,
        "temperature": 0.7
      },
      "openai": {
        "model": "gpt-4",
        "maxTokens": 1500,
        "temperature": 0.5
      }
    }
  },
  "approval": {
    "mode": "auto" // Auto-approve safe operations
  }
}
```

#### Production Environment

```json
{
  "environment": "production",
  "llm": {
    "defaultProvider": "gemini",
    "failoverStrategy": {
      "enabled": true,
      "fallbackProviders": ["openai"],
      "retryAttempts": 3
    }
  },
  "approval": {
    "mode": "default", // Require confirmations
    "auditMode": true
  },
  "security": {
    "strictMode": true,
    "auditLogging": true
  }
}
```

### Custom Provider Integration Migration

If you have custom integrations or modifications:

#### 1. Assess Custom Code Impact

```bash
# Find custom integrations
grep -r "gemini" your-custom-code/ --include="*.js" --include="*.ts"

# Check for direct API calls
grep -r "generateContent\|streamGenerateContent" your-custom-code/
```

#### 2. Update Custom Integrations

```typescript
// Before: Direct Gemini integration
import { GoogleGenerativeAI } from '@google/generative-ai';

// After: Use provider abstraction
import { ProviderFactory } from '@google/gemini-cli/providers';

// Old approach
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

// New approach
const provider = ProviderFactory.createProvider('gemini', config);
const response = await provider.generateContent(prompt);
```

## 🛠️ Migration Troubleshooting

### Common Migration Issues

#### Issue 1: Configuration Not Found

```bash
# Symptoms
Error: No configuration found for provider 'openai'

# Solution
export OPENAI_API_KEY="your-key"
# Or add to settings.json providers section
```

#### Issue 2: Tool Compatibility Issues

```bash
# Symptoms
Warning: Tool 'custom_tool' not supported by provider 'anthropic'

# Solution
# Check tool compatibility matrix
gemini --check-tool-compatibility

# Update tool to support multiple providers
```

#### Issue 3: Performance Degradation

```bash
# Symptoms
Slower response times after migration

# Diagnosis
gemini --benchmark-providers

# Solution
# Adjust timeout settings
# Optimize model selection
# Review network configuration
```

#### Issue 4: API Key Issues

```bash
# Symptoms
Authentication failed for provider 'openai'

# Diagnosis
gemini --validate-keys

# Solutions
# Check key format and permissions
# Verify environment variable names
# Test keys independently
```

### Migration Rollback Plan

#### Emergency Rollback

```bash
# Restore previous configuration
cp ~/.gemini/migration-backup/$(date +%Y%m%d)/settings.json.backup ~/.gemini/settings.json

# Revert environment variables
source ~/.gemini/migration-backup/$(date +%Y%m%d)/environment.backup

# Verify rollback
gemini "Test rollback functionality"
```

#### Selective Rollback

```json
{
  // Disable multi-provider temporarily
  "llm": {
    "defaultProvider": "gemini",
    "migrationMode": "rollback",
    "preserveLegacyBehavior": true
  }
}
```

## 📊 Migration Success Metrics

### Key Performance Indicators

#### Functional Metrics

- **Backward Compatibility**: 100% of existing commands work unchanged
- **Feature Parity**: All tools work across all providers
- **Configuration Migration**: Existing settings preserved and enhanced

#### Performance Metrics

- **Response Time**: Compare pre/post migration performance
- **Error Rate**: Monitor increased error rates during migration
- **Tool Execution**: Verify consistent tool behavior across providers

#### User Experience Metrics

- **Migration Completion Time**: Track actual vs. planned timeline
- **Support Tickets**: Monitor migration-related issues
- **User Adoption**: Track new provider feature usage

### Success Criteria Checklist

#### ✅ Technical Success

- [ ] All existing functionality preserved
- [ ] New providers functional and accessible
- [ ] Tool compatibility verified across all providers
- [ ] Performance maintained or improved
- [ ] Security policies migrated and enhanced

#### ✅ Operational Success

- [ ] Zero unplanned downtime during migration
- [ ] Team training completed successfully
- [ ] Documentation updated and accessible
- [ ] Support processes updated for multi-provider environment
- [ ] Monitoring and alerting configured

#### ✅ Business Success

- [ ] Migration completed within planned timeline
- [ ] User productivity maintained or improved
- [ ] New capabilities enable enhanced workflows
- [ ] Cost impact within expected parameters
- [ ] Risk mitigation strategies effective

## 🔗 Post-Migration Activities

### Optimization Phase

1. **Performance Tuning**: Optimize provider-specific configurations
2. **Usage Analysis**: Monitor provider usage patterns
3. **Cost Optimization**: Analyze and optimize API usage costs
4. **Security Review**: Validate multi-provider security posture

### Continuous Improvement

1. **Feedback Collection**: Gather user feedback on new capabilities
2. **Process Refinement**: Improve migration procedures for future deployments
3. **Documentation Updates**: Keep migration guide current
4. **Knowledge Sharing**: Share lessons learned with broader community

## 📞 Migration Support

### Support Resources

- **Migration Guide**: This document
- **Configuration Guide**: Detailed setup instructions
- **Troubleshooting Guide**: Common issues and solutions
- **Community Forum**: Peer support and discussion

### Escalation Path

1. **Self-Service**: Documentation and troubleshooting guides
2. **Community Support**: Forums and discussion channels
3. **Technical Support**: Direct support for critical issues
4. **Professional Services**: Dedicated migration assistance

---

## 📈 Migration Timeline Template

| Phase            | Duration  | Activities                           | Dependencies          |
| ---------------- | --------- | ------------------------------------ | --------------------- |
| **Assessment**   | 3-5 days  | Inventory, requirements, planning    | Current system access |
| **Preparation**  | 2-3 days  | Backup, update, initial config       | API keys, permissions |
| **Migration**    | 1-2 weeks | Gradual rollout, testing, validation | Team coordination     |
| **Optimization** | 1-2 weeks | Performance tuning, final config     | Usage data, feedback  |
| **Completion**   | 2-3 days  | Documentation, training, handoff     | User acceptance       |

**Total Timeline: 3-5 weeks** (can be compressed for smaller deployments)

---

_This migration guide ensures a smooth transition to multi-provider capabilities while maintaining full backward compatibility and minimizing disruption to existing workflows._
