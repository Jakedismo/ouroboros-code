# Basic Multi-LLM Provider Setup Examples

## 🎯 Overview

This guide provides practical, ready-to-use examples for setting up and using the Multi-LLM Provider system. Examples range from simple configurations to common use cases that demonstrate the power of provider switching.

## 🚀 Quick Start Examples

### Example 1: First-Time Setup

#### Step 1: Install and Configure

```bash
# Install Gemini CLI with multi-provider support
npm install -g @google/gemini-cli

# Verify installation
gemini --version
```

#### Step 2: Basic Configuration

```bash
# Create configuration directory
mkdir -p ~/.gemini

# Create basic configuration file
cat > ~/.gemini/settings.json << 'EOF'
{
  "llm": {
    "defaultProvider": "gemini",
    "providers": {
      "gemini": {
        "apiKey": "${GEMINI_API_KEY}",
        "model": "gemini-1.5-pro"
      }
    }
  }
}
EOF
```

#### Step 3: Set Environment Variables

```bash
# Add to ~/.bashrc or ~/.zshrc
export GEMINI_API_KEY="your-gemini-api-key-here"

# Reload shell
source ~/.bashrc
```

#### Step 4: Test Basic Functionality

```bash
# Test basic operation
gemini "Hello, world!"

# Verify provider
gemini "What AI provider are you?" --verbose
```

### Example 2: Adding OpenAI Provider

#### Step 1: Get OpenAI API Key

1. Visit [OpenAI API Keys](https://platform.openai.com/api-keys)
2. Create new API key
3. Copy the key (starts with `sk-`)

#### Step 2: Update Configuration

```json
{
  "llm": {
    "defaultProvider": "gemini",
    "providers": {
      "gemini": {
        "apiKey": "${GEMINI_API_KEY}",
        "model": "gemini-1.5-pro"
      },
      "openai": {
        "apiKey": "${OPENAI_API_KEY}",
        "model": "gpt-5",
        "maxTokens": 1500,
        "temperature": 0.7
      }
    }
  }
}
```

#### Step 3: Set Environment Variable

```bash
export OPENAI_API_KEY="sk-your-openai-api-key-here"
```

#### Step 4: Test OpenAI Provider

```bash
# Test OpenAI directly
gemini "Write a haiku about coding" --provider openai

# Compare responses
gemini "Explain quantum computing" --provider gemini
gemini "Explain quantum computing" --provider openai
```

### Example 3: Complete Multi-Provider Setup

#### Full Configuration File

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
        "safetySettings": {
          "HARM_CATEGORY_HARASSMENT": "BLOCK_MEDIUM_AND_ABOVE"
        }
      },
      "openai": {
        "apiKey": "${OPENAI_API_KEY}",
        "model": "gpt-5",
        "maxTokens": 1500,
        "temperature": 0.5,
        "timeout": 30000
      },
      "anthropic": {
        "apiKey": "${ANTHROPIC_API_KEY}",
        "model": "claude-4-sonnet-20250514",
        "maxTokens": 2000,
        "temperature": 0.6
      }
    }
  },
  "approval": {
    "mode": "default",
    "providerOverrides": {
      "gemini": "default",
      "openai": "auto",
      "anthropic": "default"
    }
  }
}
```

#### Environment Setup

```bash
# Set all API keys
export GEMINI_API_KEY="your-gemini-api-key"
export OPENAI_API_KEY="sk-your-openai-api-key"
export ANTHROPIC_API_KEY="sk-ant-your-anthropic-key"

# Test all providers
gemini --test-providers
```

## 💼 Common Use Cases

### Use Case 1: Content Creation Workflow

#### Scenario: Blog Post Creation

```bash
# Step 1: Brainstorm with Gemini (fast, creative)
gemini "Generate 10 blog post ideas about sustainable technology" --provider gemini

# Step 2: Outline with Anthropic (detailed, structured)
gemini "Create a detailed outline for: 'Solar Panel Innovation in 2024'" --provider anthropic

# Step 3: Write with OpenAI (creative writing)
gemini "Write the introduction section based on this outline..." --provider openai

# Step 4: Review and edit with Gemini (quick feedback)
gemini "Review this introduction for clarity and engagement..." --provider gemini
```

#### Automation Script

```bash
#!/bin/bash
# blog-creation-workflow.sh

TOPIC="$1"

echo "🧠 Brainstorming ideas..."
IDEAS=$(gemini "Generate 5 creative angles for a blog post about: $TOPIC" --provider gemini --output json)

echo "📋 Creating outline..."
OUTLINE=$(gemini "Create a detailed blog post outline for: $TOPIC" --provider anthropic --output json)

echo "✍️ Writing introduction..."
INTRO=$(gemini "Write an engaging introduction based on this outline: $OUTLINE" --provider openai --output json)

echo "🔍 Final review..."
REVIEW=$(gemini "Review and suggest improvements for this introduction: $INTRO" --provider gemini --output json)

echo "Blog post creation complete!"
```

### Use Case 2: Code Development Assistant

#### Scenario: Full-Stack Development

```bash
# Backend API design with Anthropic (thorough analysis)
gemini "Design a REST API for a task management system" --provider anthropic

# Implementation with OpenAI (code generation)
gemini "Implement the user authentication endpoint in Node.js/Express" --provider openai

# Code review with Gemini (quick feedback)
gemini "Review this authentication code for security issues" --provider gemini

# Documentation with Anthropic (comprehensive docs)
gemini "Create API documentation for these endpoints" --provider anthropic
```

#### Project Setup Script

```bash
#!/bin/bash
# project-setup.sh

PROJECT_NAME="$1"
TECH_STACK="$2"

echo "🏗️ Planning project architecture..."
gemini "Design a $TECH_STACK project structure for: $PROJECT_NAME" \
  --provider anthropic \
  --save-to "architecture-plan.md"

echo "📦 Generating package.json..."
gemini "Create a package.json for a $TECH_STACK project named $PROJECT_NAME" \
  --provider openai \
  --save-to "package.json"

echo "🔧 Creating configuration files..."
gemini "Generate appropriate config files for $TECH_STACK development" \
  --provider gemini \
  --save-to "configs/"

echo "📚 Writing README..."
gemini "Create a comprehensive README.md for this project" \
  --provider anthropic \
  --save-to "README.md"
```

### Use Case 3: Research and Analysis

#### Scenario: Market Research Report

```bash
# Data gathering with Gemini (web search integration)
gemini "Search for latest trends in AI-powered healthcare solutions" --provider gemini

# Analysis with Anthropic (deep analysis)
gemini "Analyze the competitive landscape for AI healthcare startups" --provider anthropic

# Visualization with OpenAI (creative data presentation)
gemini "Create a markdown report with charts showing market trends" --provider openai

# Summary with Gemini (quick synthesis)
gemini "Summarize key findings and recommendations" --provider gemini
```

### Use Case 4: Educational Content

#### Scenario: Tutorial Creation

```bash
# Curriculum design with Anthropic (structured learning)
gemini "Design a Python programming curriculum for beginners" --provider anthropic

# Interactive exercises with OpenAI (engaging content)
gemini "Create 5 hands-on Python exercises for lesson 1" --provider openai

# Code examples with Gemini (practical implementation)
gemini "Generate well-commented Python examples for variables and data types" --provider gemini

# Assessment with Anthropic (comprehensive evaluation)
gemini "Create a quiz to test understanding of Python basics" --provider anthropic
```

## 🔧 Advanced Configuration Examples

### Example 1: Development vs Production

#### Development Configuration

```json
{
  "environment": "development",
  "llm": {
    "defaultProvider": "gemini",
    "providers": {
      "gemini": {
        "model": "gemini-1.5-flash",
        "temperature": 0.8,
        "maxTokens": 1000
      }
    }
  },
  "approval": {
    "mode": "yolo"
  },
  "logging": {
    "level": "debug"
  }
}
```

#### Production Configuration

```json
{
  "environment": "production",
  "llm": {
    "defaultProvider": "gemini",
    "failoverStrategy": {
      "enabled": true,
      "fallbackProviders": ["openai"],
      "retryAttempts": 3
    },
    "providers": {
      "gemini": {
        "model": "gemini-1.5-pro",
        "temperature": 0.5,
        "maxTokens": 2048
      },
      "openai": {
        "model": "gpt-5",
        "temperature": 0.3,
        "maxTokens": 1500
      }
    }
  },
  "approval": {
    "mode": "default"
  },
  "logging": {
    "level": "info",
    "auditMode": true
  },
  "security": {
    "strictMode": true
  }
}
```

### Example 2: Team-Specific Configurations

#### Content Team Configuration

```json
{
  "llm": {
    "defaultProvider": "openai",
    "providers": {
      "openai": {
        "model": "gpt-5",
        "temperature": 0.8,
        "maxTokens": 2000
      },
      "anthropic": {
        "model": "claude-4-sonnet-20250514",
        "temperature": 0.7,
        "maxTokens": 2500
      }
    }
  },
  "tools": {
    "web_search": { "enabled": true },
    "web_fetch": { "enabled": true },
    "write_file": { "enabled": true }
  },
  "approval": {
    "mode": "auto",
    "toolSpecificSettings": {
      "write_file": { "mode": "default" }
    }
  }
}
```

#### Development Team Configuration

```json
{
  "llm": {
    "defaultProvider": "gemini",
    "providers": {
      "gemini": {
        "model": "gemini-1.5-pro",
        "temperature": 0.3,
        "maxTokens": 2048
      },
      "openai": {
        "model": "gpt-5",
        "temperature": 0.2,
        "maxTokens": 1500
      }
    }
  },
  "tools": {
    "shell_command": { "enabled": true },
    "read_file": { "enabled": true },
    "write_file": { "enabled": true },
    "edit_file": { "enabled": true }
  },
  "approval": {
    "mode": "auto",
    "toolSpecificSettings": {
      "shell_command": {
        "mode": "default",
        "trustedCommands": ["git", "npm", "node", "python"]
      }
    }
  }
}
```

## 🚀 Performance Optimization Examples

### Example 1: Speed-Optimized Setup

```json
{
  "llm": {
    "defaultProvider": "gemini",
    "providers": {
      "gemini": {
        "model": "gemini-1.5-flash",
        "maxTokens": 1000,
        "temperature": 0.7
      }
    }
  },
  "performance": {
    "caching": {
      "enabled": true,
      "ttl": 3600,
      "maxSize": "1GB"
    },
    "streaming": {
      "enabled": true,
      "bufferSize": 2048
    }
  }
}
```

### Example 2: Cost-Optimized Setup

```json
{
  "llm": {
    "defaultProvider": "gemini",
    "providers": {
      "gemini": {
        "model": "gemini-1.5-flash",
        "maxTokens": 512,
        "temperature": 0.5
      },
      "openai": {
        "model": "gpt-3.5-turbo",
        "maxTokens": 500,
        "temperature": 0.5
      }
    }
  },
  "approval": {
    "mode": "auto"
  },
  "performance": {
    "caching": {
      "enabled": true,
      "ttl": 7200,
      "maxSize": "2GB"
    }
  }
}
```

## 🔄 Workflow Integration Examples

### Example 1: CI/CD Integration

```yaml
# .github/workflows/ai-code-review.yml
name: AI Code Review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  ai-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Gemini CLI
        run: |
          npm install -g @google/gemini-cli

      - name: Configure Multi-Provider
        run: |
          mkdir -p ~/.gemini
          echo '${{ secrets.GEMINI_CONFIG }}' > ~/.gemini/settings.json

      - name: AI Code Review
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          # Get changed files
          git diff --name-only HEAD~1 HEAD > changed_files.txt

          # Review with multiple providers
          gemini "Review these code changes for bugs and improvements" \
            --file changed_files.txt \
            --provider anthropic \
            --save-to review-anthropic.md
            
          gemini "Suggest performance optimizations for these changes" \
            --file changed_files.txt \
            --provider openai \
            --save-to review-openai.md
            
          # Combine reviews
          gemini "Combine these reviews into a final assessment" \
            --file review-anthropic.md \
            --file review-openai.md \
            --provider gemini \
            --save-to final-review.md
```

### Example 2: Content Publishing Pipeline

```bash
#!/bin/bash
# content-pipeline.sh

CONTENT_DIR="$1"
OUTPUT_DIR="$2"

# Process each markdown file
for file in "$CONTENT_DIR"/*.md; do
  filename=$(basename "$file" .md)

  echo "Processing $filename..."

  # SEO optimization with Anthropic
  gemini "Optimize this content for SEO" \
    --file "$file" \
    --provider anthropic \
    --save-to "$OUTPUT_DIR/${filename}-seo.md"

  # Social media summary with OpenAI
  gemini "Create social media posts from this content" \
    --file "$file" \
    --provider openai \
    --save-to "$OUTPUT_DIR/${filename}-social.md"

  # Final review with Gemini
  gemini "Review this content for publication readiness" \
    --file "$OUTPUT_DIR/${filename}-seo.md" \
    --provider gemini \
    --save-to "$OUTPUT_DIR/${filename}-review.md"
done

echo "Content pipeline complete!"
```

## 🛡️ Security Examples

### Example 1: Secure Enterprise Setup

```json
{
  "llm": {
    "defaultProvider": "gemini",
    "providers": {
      "gemini": {
        "apiKey": "${GEMINI_API_KEY}",
        "model": "gemini-1.5-pro"
      }
    }
  },
  "security": {
    "strictMode": true,
    "auditLogging": true,
    "filesystem": {
      "allowedDirectories": ["./workspace/", "./data/"],
      "blockedDirectories": ["/etc/", "/usr/", "/bin/"],
      "maxFileSize": "50MB"
    },
    "shell": {
      "allowedCommands": ["git", "npm", "node"],
      "blockedCommands": ["rm", "sudo", "chmod"],
      "requireApproval": true
    }
  },
  "approval": {
    "mode": "default",
    "toolSpecificSettings": {
      "shell_command": { "mode": "default" },
      "write_file": { "mode": "default" },
      "web_fetch": { "mode": "auto" }
    }
  }
}
```

### Example 2: Sandbox Configuration

```json
{
  "llm": {
    "defaultProvider": "gemini",
    "providers": {
      "gemini": {
        "sandbox": true,
        "allowedOperations": ["read", "analyze"],
        "maxExecutionTime": 30000
      }
    }
  },
  "security": {
    "sandbox": {
      "enabled": true,
      "networkAccess": false,
      "fileSystemAccess": "readonly",
      "resourceLimits": {
        "memory": "512MB",
        "cpu": "50%"
      }
    }
  }
}
```

## 📱 Mobile and Remote Examples

### Example 1: Remote Team Configuration

```json
{
  "llm": {
    "defaultProvider": "gemini",
    "providers": {
      "gemini": {
        "apiKey": "${GEMINI_API_KEY}",
        "baseURL": "https://your-proxy.company.com/gemini"
      },
      "openai": {
        "apiKey": "${OPENAI_API_KEY}",
        "baseURL": "https://your-proxy.company.com/openai"
      }
    }
  },
  "network": {
    "proxy": {
      "http": "http://proxy.company.com:8080",
      "https": "https://proxy.company.com:8080"
    },
    "timeout": 60000,
    "retries": 5
  }
}
```

### Example 2: Offline-First Configuration

```json
{
  "llm": {
    "defaultProvider": "gemini",
    "offlineMode": {
      "enabled": true,
      "cacheResponses": true,
      "fallbackBehavior": "cache_only"
    }
  },
  "performance": {
    "caching": {
      "enabled": true,
      "ttl": 86400,
      "maxSize": "5GB",
      "persistToDisk": true
    }
  }
}
```

## 🔗 Integration Examples

### Example 1: Slack Bot Integration

```javascript
// slack-bot.js
const { App } = require('@slack/bolt');
const { execSync } = require('child_process');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

app.message(/^ai (.+)/, async ({ message, say }) => {
  const query = message.text.replace(/^ai /, '');

  try {
    // Use different providers based on query type
    let provider = 'gemini';
    if (query.includes('code') || query.includes('program')) {
      provider = 'openai';
    } else if (query.includes('analyze') || query.includes('research')) {
      provider = 'anthropic';
    }

    const response = execSync(
      `gemini "${query}" --provider ${provider} --output text`,
      { encoding: 'utf8' },
    );

    await say(`*${provider.toUpperCase()} Response:*\n${response}`);
  } catch (error) {
    await say(`Error: ${error.message}`);
  }
});

app.start();
```

### Example 2: VS Code Extension

```typescript
// vscode-extension.ts
import * as vscode from 'vscode';
import { exec } from 'child_process';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    'multi-llm.query',
    async () => {
      const query = await vscode.window.showInputBox({
        prompt: 'Enter your query',
      });

      if (!query) return;

      const provider = await vscode.window.showQuickPick(
        ['gemini', 'openai', 'anthropic'],
        { placeHolder: 'Select AI provider' },
      );

      if (!provider) return;

      const command = `gemini "${query}" --provider ${provider}`;

      exec(command, (error, stdout, stderr) => {
        if (error) {
          vscode.window.showErrorMessage(`Error: ${error.message}`);
          return;
        }

        // Show response in new document
        vscode.workspace
          .openTextDocument({
            content: stdout,
            language: 'markdown',
          })
          .then((doc) => {
            vscode.window.showTextDocument(doc);
          });
      });
    },
  );

  context.subscriptions.push(disposable);
}
```

---

## 🎯 Quick Reference

### Common Commands

```bash
# Basic usage
gemini "Your query here"

# Specify provider
gemini "Your query" --provider openai

# Use tools
gemini "Read the README file"
gemini "Search for recent AI news"
gemini "Run npm test"

# Configuration
gemini --test-providers
gemini --validate-config
gemini --show-config

# Performance
gemini --benchmark
gemini --show-metrics
```

### Provider Recommendations

- **Gemini**: General purpose, fast responses, multimodal
- **OpenAI**: Creative writing, code generation
- **Anthropic**: Analysis, research, detailed responses

### Tool Compatibility

- **All Providers**: File operations, web search, memory
- **Gemini + OpenAI**: Shell commands, complex tools
- **Provider-Specific**: Check with `--check-tool-compatibility`

---

_These examples provide a solid foundation for implementing Multi-LLM Provider functionality across various use cases and environments._
