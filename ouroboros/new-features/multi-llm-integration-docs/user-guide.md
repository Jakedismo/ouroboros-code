# Multi-LLM Provider User Guide

## 🎯 Overview

The Gemini CLI now supports multiple LLM providers, allowing you to choose between Gemini, OpenAI, and Anthropic while maintaining full access to all built-in tools and MCP integrations. This guide covers everything you need to know as an end user.

## 🚀 Quick Start

### Default Behavior (No Changes Required)

The CLI continues to use **Gemini as the default provider**. If you're happy with Gemini, no configuration changes are needed:

```bash
# This works exactly as before
gemini "Help me analyze this file" --file README.md
```

### Switching Providers

Use the `--provider` flag to choose a different LLM provider:

```bash
# Use OpenAI
gemini "Analyze this code" --provider openai

# Use Anthropic
gemini "Review this document" --provider anthropic

# Use Gemini (explicit, but same as default)
gemini "Create a summary" --provider gemini
```

## 🔧 Setup and Configuration

### API Key Configuration

#### Method 1: Environment Variables (Recommended)

```bash
# For OpenAI
export OPENAI_API_KEY="your-openai-api-key-here"

# For Anthropic
export ANTHROPIC_API_KEY="your-anthropic-api-key-here"

# Gemini (existing)
export GEMINI_API_KEY="your-gemini-api-key-here"
```

#### Method 2: Command Line Flags

```bash
# OpenAI with inline key
gemini "Test prompt" --provider openai --openai-key "your-key"

# Anthropic with inline key
gemini "Test prompt" --provider anthropic --anthropic-key "your-key"
```

#### Method 3: Configuration File

Create or update `.gemini/settings.json`:

```json
{
  "llm": {
    "provider": "openai",
    "apiKeys": {
      "openai": "your-openai-api-key",
      "anthropic": "your-anthropic-api-key",
      "gemini": "your-gemini-api-key"
    }
  }
}
```

### Provider-Specific Models

#### OpenAI Models

```bash
# Use GPT-5
gemini "Complex analysis" --provider openai --model gpt-5

# Use GPT-5 Mini (faster, cheaper)
gemini "Simple task" --provider openai --model gpt-5-mini

# Use O3 (reasoning optimized)
gemini "Large document analysis" --provider openai --model o3

# Use GPT-5 Nano (ultra-fast)
gemini "Quick task" --provider openai --model gpt-5-nano
```

#### Anthropic Models

```bash
# Use Claude Opus 4.1 (most capable)
gemini "Complex reasoning" --provider anthropic --model claude-opus-4-1-20250805

# Use Claude 4 Sonnet (recommended)
gemini "Creative writing" --provider anthropic --model claude-4-sonnet-20250514
```

#### Gemini Models

```bash
# Use Gemini 1.5 Pro (default)
gemini "Standard task" --model gemini-1.5-pro

# Use Gemini 1.5 Flash (faster)
gemini "Quick response" --model gemini-1.5-flash
```

## 🛠️ Tool Usage Across Providers

All built-in tools work identically across all providers:

### File Operations

```bash
# Read files (works with any provider)
gemini "Read README.md and summarize" --provider openai
gemini "Analyze package.json structure" --provider anthropic

# Write files (works with any provider)
gemini "Create a TODO list in todo.txt" --provider openai
gemini "Generate a config file" --provider anthropic

# Edit files (works with any provider)
gemini "Fix the typo in docs.md" --provider openai
gemini "Update the version in package.json" --provider anthropic
```

### Development Tools

```bash
# Search and analysis (works with any provider)
gemini "Find all TODO comments in the codebase" --provider openai
gemini "List all TypeScript files in src/" --provider anthropic

# Shell commands (works with any provider)
gemini "Run tests and show results" --provider openai
gemini "Check git status and recent commits" --provider anthropic
```

### Web Operations

```bash
# Web fetching (works with any provider)
gemini "Get the latest news from example.com" --provider openai
gemini "Fetch API documentation from docs.api.com" --provider anthropic

# Web search (works with any provider)
gemini "Search for React best practices 2024" --provider openai
gemini "Find Python performance optimization tips" --provider anthropic
```

## 🎛️ Advanced Configuration

### Provider-Specific Settings

Configure different parameters for each provider:

```json
{
  "llm": {
    "gemini": {
      "model": "gemini-1.5-pro",
      "maxTokens": 2048,
      "temperature": 0.7,
      "topK": 40,
      "topP": 0.95
    },
    "openai": {
      "model": "gpt-5",
      "maxTokens": 1500,
      "temperature": 0.5,
      "topP": 0.9
    },
    "anthropic": {
      "model": "claude-4-sonnet-20250514",
      "maxTokens": 2000,
      "temperature": 0.6
    }
  }
}
```

### Default Provider Selection

Set a default provider other than Gemini:

```json
{
  "llm": {
    "defaultProvider": "openai"
  }
}
```

### Tool Approval Settings

Configure approval modes per provider:

```json
{
  "approval": {
    "mode": "default",
    "providerOverrides": {
      "openai": "auto",
      "anthropic": "yolo"
    }
  }
}
```

## 🔄 Switching Between Providers

### Dynamic Switching

Switch providers within the same session:

```bash
# Start with Gemini
gemini "Analyze this file" README.md

# Switch to OpenAI for the next task
gemini "Translate to Spanish" --provider openai

# Switch to Anthropic for creative work
gemini "Write a poem about coding" --provider anthropic
```

### Context Preservation

Provider switches maintain context within the same session:

```bash
# Start analysis with Gemini
gemini "Read and analyze data.csv"

# Continue with OpenAI, referencing previous analysis
gemini "Based on that analysis, create a report" --provider openai
```

## 🎯 Provider Selection Guidelines

### When to Use Gemini

- **Default choice** for most tasks
- **Multimodal capabilities** (images, documents)
- **Long context windows** for large documents
- **Integration with Google services**

### When to Use OpenAI

- **Creative writing** and content generation
- **Code generation** and programming tasks
- **Complex reasoning** and problem-solving
- **Wide ecosystem** and plugin compatibility

### When to Use Anthropic

- **Detailed analysis** and thoughtful responses
- **Ethical reasoning** and careful consideration
- **Long-form content** and research tasks
- **Safety-focused** applications

## 📊 Performance Comparison

### Speed Comparison (Typical Response Times)

- **Gemini**: 2-5 seconds for standard queries
- **OpenAI**: 3-8 seconds for standard queries
- **Anthropic**: 4-10 seconds for standard queries

### Cost Comparison (Approximate)

- **Gemini**: Competitive pricing, free tier available
- **OpenAI**: Variable pricing by model tier
- **Anthropic**: Premium pricing for high-quality responses

### Capability Comparison

| Feature             | Gemini       | OpenAI          | Anthropic       |
| ------------------- | ------------ | --------------- | --------------- |
| Text Generation     | ✅ Excellent | ✅ Excellent    | ✅ Excellent    |
| Code Generation     | ✅ Very Good | ✅ Excellent    | ✅ Good         |
| Image Analysis      | ✅ Excellent | ✅ Good         | ✅ Good         |
| Document Processing | ✅ Excellent | ✅ Good         | ✅ Very Good    |
| Creative Writing    | ✅ Good      | ✅ Excellent    | ✅ Very Good    |
| Reasoning           | ✅ Very Good | ✅ Very Good    | ✅ Excellent    |
| Tool Integration    | ✅ Native    | ✅ Full Support | ✅ Full Support |

## 🛡️ Security and Privacy

### API Key Security

- **Never commit API keys** to version control
- **Use environment variables** for production
- **Rotate keys regularly** following best practices
- **Limit key permissions** where possible

### Data Privacy

- **Gemini**: Google's privacy policies apply
- **OpenAI**: OpenAI's data usage policies apply
- **Anthropic**: Anthropic's privacy policies apply

### Local vs Cloud Processing

All providers use cloud-based processing. For sensitive data:

- **Review provider privacy policies**
- **Consider data residency requirements**
- **Use appropriate approval modes** for sensitive operations

## ❓ Common Questions

### Q: Can I use multiple providers in the same command?

**A:** No, each command uses a single provider. However, you can switch providers between commands in the same session.

### Q: Do all tools work with every provider?

**A:** Yes! All 11 built-in tools and MCP integrations work identically across all providers.

### Q: Will my existing configurations break?

**A:** No! Existing Gemini configurations continue to work unchanged. The system is fully backward compatible.

### Q: How do I know which provider I'm using?

**A:** The provider is shown in verbose output, or you can ask: `gemini "What provider are you?"`

### Q: Can I set different providers for different projects?

**A:** Yes! Use project-specific `.gemini/settings.json` files or environment variables.

### Q: What happens if my API key is invalid?

**A:** The system provides clear error messages and may fall back to other configured providers.

## 🔗 Next Steps

- **Try different providers** with the same prompts to compare results
- **Configure provider-specific settings** for optimal performance
- **Explore the [Configuration Guide](configuration-guide.md)** for advanced setups
- **Check the [Examples](examples/basic-setup.md)** for common use cases
- **Review [Performance Benchmarks](performance-benchmarks.md)** for optimization tips

---

_Ready to explore the power of multiple LLM providers? Start with a simple `--provider` flag and discover which provider works best for your specific use cases!_
