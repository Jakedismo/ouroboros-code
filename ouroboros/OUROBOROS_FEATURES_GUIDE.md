# Ouroboros Multi-Agent CLI - Features & Usage Guide

This document provides a comprehensive guide to the new Ouroboros Multi-Agent CLI, covering all integrated features, command-line flags, environment variables, and setup instructions.

## 🌟 Overview

Ouroboros is an open-source multi-agent AI framework that brings advanced AI capabilities directly into your terminal. It features a unified builtin-tools architecture providing identical functionality across multiple LLM providers, with advanced MCP (Model Context Protocol) tools integration, sophisticated connection pooling, webhook callbacks, and comprehensive security validation.

## 🏗️ Architecture Features

### Multi-LLM Provider Support
- **OpenAI**: GPT-5, GPT-5-mini, GPT-5-nano, o3 models
- **Anthropic**: Claude 4 Sonnet,  Claude Opus 4.1
- **Gemini**: Gemini 2.5 Pro, Gemini 2.5 Flash models
- **Unified Interface**: Seamless switching between providers with zero functionality loss

### Advanced MCP Integration
- **Connection Pooling**: Efficient resource management for MCP servers
- **Tool Discovery Sync**: Cross-provider tool synchronization
- **Webhook Callbacks**: Asynchronous tool execution support
- **Performance Optimization**: Intelligent caching and resource pooling

### Builtin Tools (11 Tools Available)
All tools work identically across all providers:

#### File System Operations
- `read_file`: Read file contents
- `write_file`: Create or overwrite files
- `edit_file`: Make targeted edits to existing files
- `ls`: List directory contents
- `glob`: Find files using patterns
- `grep`: Search file contents
- `read_many_files`: Batch read multiple files

#### Web Operations
- `web_fetch`: Fetch content from URLs
- `google_web_search`: Search the web with Google

#### System Operations
- `run_shell_command`: Execute shell commands
- `save_memory`: Store information for future reference

## 🚀 Command Line Interface

### Basic Usage
```bash
# Start with default Gemini provider
ouroboros-code "Analyze my project structure"

# Use specific provider
ouroboros-code --provider openai "Review this code for bugs"
ouroboros-code --provider anthropic "Help me refactor this function"

# Enable advanced MCP features
ouroboros-code --enable-mcp "Search for TODOs and create GitHub issues"
```

### Available Flags

#### Provider Selection
```bash
--provider <provider>          # Set LLM provider: gemini, openai, anthropic
                              # Default: gemini
```

#### MCP Configuration
```bash
--enable-mcp                  # Enable MCP tool support for all providers
--disable-mcp                 # Disable MCP tool support
--mcp-server <spec>          # Add MCP server (format: name:command:args)
                             # Example: --mcp-server "github:gh:api"
```

#### Tool Execution Settings
```bash
--tool-timeout <ms>          # Set tool execution timeout (default: 30000)
--max-concurrent-tools <n>   # Max concurrent tool executions (default: 5)
--confirmation-mode <mode>   # Tool confirmation: always, never, smart
                            # Default: smart
```

#### Output and Behavior
```bash
--sandbox                    # Enable sandboxed execution
--sandbox-image <uri>        # Custom sandbox image
--no-color                   # Disable colored output
--verbose                    # Enable verbose logging
--quiet                      # Suppress non-essential output
```

#### Authentication & Configuration
```bash
--auth <type>                # Authentication method
--config <path>              # Custom configuration file
--model <name>               # Override default model for provider
```

## 🔐 Environment Variables

### Required for External Providers
```bash
# OpenAI Provider
export OPENAI_API_KEY="your_openai_api_key"

# Anthropic Provider  
export ANTHROPIC_API_KEY="your_anthropic_api_key"

# Gemini Provider (if using API key auth)
export GEMINI_API_KEY="your_gemini_api_key"
```

### MCP Configuration
```bash
# Tool execution limits
export MCP_MAX_CONCURRENT_TOOLS=10
export MCP_TOOL_TIMEOUT_MS=60000
export MCP_CONFIRMATION_MODE="smart"

# Debug and performance
export MCP_DEBUG_LOG_TOOL_CALLS=true
export MCP_DEBUG_LOG_TOOL_RESULTS=true
export MCP_ENABLE_PERFORMANCE_METRICS=true
```

### Sandbox Configuration
```bash
# Sandbox settings (preserving GEMINI_ prefix per requirements)
export GEMINI_SANDBOX=docker              # Use Docker for sandboxing
export GEMINI_SANDBOX_IMAGE=custom:latest # Custom sandbox image
export GEMINI_SANDBOX_PROXY_COMMAND="proxy_cmd"

# System settings
export GEMINI_SYSTEM_MD="/path/to/system.md"     # Custom system prompt
export GEMINI_WRITE_SYSTEM_MD=true               # Auto-write system prompt
```

### IDE Integration
```bash
# VS Code integration
export GEMINI_CLI_IDE_WORKSPACE_PATH="/path/to/workspace"
export GEMINI_CLI_IDE_SERVER_PORT=3000

# Development settings
export GEMINI_CLI_DISABLE_AUTOUPDATER=true      # Disable auto-updates
export GEMINI_CLI_NO_RELAUNCH=true              # Prevent auto-relaunch
```

### Google Cloud & Vertex AI
```bash
# Vertex AI configuration
export GOOGLE_GENAI_USE_VERTEXAI=true
export GOOGLE_GENAI_USE_GCA=true
export GOOGLE_VERTEX_BASE_URL="https://your-vertex-endpoint"
export GOOGLE_GEMINI_BASE_URL="https://generativelanguage.googleapis.com"

# Authentication
export GOOGLE_API_KEY="your_google_api_key"
export GEMINI_DEFAULT_AUTH_TYPE="gemini-api-key"
```

## 📦 Installation & Test Drive Setup

### Method 1: NPM Link (Recommended for Testing)

1. **Clone and Setup**:
```bash
# Clone the repository
git clone https://github.com/ouroboros-ai/multi-agent-cli.git
cd multi-agent-cli

# Install dependencies
npm ci

# Build the project
npm run build

# Create global link
npm link
```

2. **Verify Installation**:
```bash
# Check if ouroboros-code is available
which ouroboros-code
# Should output: /usr/local/bin/ouroboros-code (or similar)

# Test basic functionality
ouroboros-code --version
```

3. **Configure Authentication**:
```bash
# For Gemini (default)
export GEMINI_API_KEY="your_api_key"

# For OpenAI
export OPENAI_API_KEY="your_openai_key"

# For Anthropic  
export ANTHROPIC_API_KEY="your_anthropic_key"
```

### Method 2: Development Mode

```bash
# Run directly from source
npm run start -- "Your prompt here"

# With flags
npm run start -- --provider openai --enable-mcp "Analyze this repository"

# Debug mode
npm run debug
```

### Method 3: Using Different Worktrees

If working with the git worktree setup:

```bash
# Navigate to integration worktree
cd /Users/jokkeruokolainen/Documents/Solita/GenAI/IDE/integration

# Link from integration worktree
npm link

# Test the integration
ouroboros-code --provider anthropic "Test the multi-LLM integration"
```

## 🧪 Testing Your Installation

### Basic Functionality Test
```bash
# Test each provider
ouroboros-code --provider gemini "What's 2+2?"
ouroboros-code --provider openai "What's 2+2?" 
ouroboros-code --provider anthropic "What's 2+2?"
```

### File Operations Test
```bash
# Test builtin tools
ouroboros-code "List the files in the current directory and analyze the project structure"

ouroboros-code "Read the package.json file and explain the project dependencies"

ouroboros-code "Search for TODO comments in TypeScript files"
```

### MCP Integration Test
```bash
# Test with MCP enabled
ouroboros-code --enable-mcp "Use web search to find the latest TypeScript features"

ouroboros-code --enable-mcp --mcp-server "github:gh:api" "Check my GitHub repositories"
```

### Advanced Features Test
```bash
# Test with custom settings
ouroboros-code \
  --provider anthropic \
  --enable-mcp \
  --tool-timeout 45000 \
  --max-concurrent-tools 3 \
  --confirmation-mode never \
  "Analyze all TypeScript files for potential improvements"
```

## 🔧 Configuration Examples

### Basic Configuration File (~/.ouroboros/config.json)
```json
{
  "defaultProvider": "anthropic",
  "providers": {
    "openai": {
      "model": "gpt-4",
      "enabled": true,
      "mcpEnabled": true
    },
    "anthropic": {
      "model": "claude-3-5-sonnet-20241022", 
      "enabled": true,
      "mcpEnabled": true
    },
    "gemini": {
      "model": "gemini-2.5-pro",
      "enabled": true,
      "mcpEnabled": true
    }
  },
  "mcpConfig": {
    "mcpServers": {
      "github": {
        "command": "gh",
        "args": ["api"]
      }
    },
    "toolExecution": {
      "confirmationMode": "smart",
      "maxConcurrentTools": 5,
      "timeoutMs": 30000
    }
  }
}
```

### Environment Setup Script
```bash
#!/bin/bash
# setup-ouroboros.sh

# Set up API keys (replace with your actual keys)
export OPENAI_API_KEY="sk-your-openai-key"
export ANTHROPIC_API_KEY="sk-ant-your-anthropic-key"
export GEMINI_API_KEY="your-gemini-key"

# Configure MCP settings
export MCP_MAX_CONCURRENT_TOOLS=8
export MCP_TOOL_TIMEOUT_MS=45000
export MCP_CONFIRMATION_MODE="smart"

# Enable sandbox for security
export GEMINI_SANDBOX=docker

# Development settings
export MCP_DEBUG_LOG_TOOL_CALLS=true

echo "Ouroboros environment configured!"
echo "Test with: ouroboros-code --provider anthropic 'Hello, Ouroboros!'"
```

## 🎯 Usage Examples

### Development Workflows
```bash
# Code analysis
ouroboros-code --provider openai "Review this TypeScript project for best practices"

# Documentation generation
ouroboros-code --provider anthropic "Generate documentation for all exported functions"

# Testing assistance
ouroboros-code --provider gemini --enable-mcp "Find test files and suggest improvements"
```

### Content Creation
```bash
# Technical writing
ouroboros-code "Help me write a technical blog post about MCP integration"

# Project planning
ouroboros-code --enable-mcp "Research competitors and create a feature comparison"
```

### System Administration
```bash
# Log analysis
ouroboros-code --enable-mcp "Analyze system logs and identify potential issues"

# Configuration management
ouroboros-code "Review nginx configuration and suggest optimizations"
```

## 🛠️ Advanced Features

### VS Code Integration
- **Companion Extension**: Install "Ouroboros Multi-Agent CLI Companion"
- **Workspace Integration**: Automatic workspace context sharing
- **File Operations**: Direct file editing through VS Code

### Webhook Support
```bash
# Configure webhook endpoints for async operations
export OUROBOROS_WEBHOOK_URL="https://your-webhook-endpoint.com"
```

### Performance Monitoring
```bash
# Enable telemetry
export MCP_ENABLE_PERFORMANCE_METRICS=true

# Monitor tool execution times
ouroboros-code --verbose "Analyze project performance bottlenecks"
```

## 🐛 Troubleshooting

### Common Issues

**1. Command not found after npm link**
```bash
# Check npm global bin directory
npm bin -g
# Add to PATH if needed
export PATH=$PATH:$(npm bin -g)
```

**2. API key not recognized**
```bash
# Verify environment variables are set
env | grep -E "(OPENAI|ANTHROPIC|GEMINI)_API_KEY"

# Test with explicit key
ouroboros-code --provider openai "test" 
```

**3. MCP servers not connecting**
```bash
# Check MCP server configuration
ouroboros-code --enable-mcp --verbose "test mcp connection"

# Verify server availability
which gh  # for GitHub MCP server
```

### Debug Mode
```bash
# Run with maximum verbosity
DEBUG=1 ouroboros-code --verbose "debug this issue"

# Check logs
tail -f ~/.ouroboros/logs/ouroboros.log
```

## 📚 Additional Resources

- **GitHub Repository**: https://github.com/ouroboros-ai/multi-agent-cli
- **VS Code Extension**: Search "Ouroboros Multi-Agent CLI Companion" in VS Code marketplace
- **MCP Protocol**: https://modelcontextprotocol.io/
- **Documentation**: See `CLAUDE.md` for development guidelines

---

**Happy multi-agent coding with Ouroboros! 🐍✨**