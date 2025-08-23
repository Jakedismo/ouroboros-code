# Multi-Provider Support Guide

## Overview

Ouroboros CLI now supports multiple LLM providers, allowing you to seamlessly switch between Gemini, OpenAI, and Anthropic models with full feature parity.

## Supported Providers

### 1. **Google Gemini** (Default)
- **Models**: gemini-2.0-flash-exp, gemini-exp-1206, gemini-1.5-pro, etc.
- **API Key**: `GEMINI_API_KEY` or `GOOGLE_API_KEY`
- **Thinking Mode**: Standard reasoning

### 2. **OpenAI**
- **Models**: gpt-5, gpt-5-mini, gpt-5-nano, o3
- **API Key**: `OPENAI_API_KEY`
- **Thinking Mode**: High-effort reasoning mode

### 3. **Anthropic**
- **Models**: claude-opus-4-1-20250805, claude-3-opus, claude-3-sonnet
- **API Key**: `ANTHROPIC_API_KEY`
- **Thinking Mode**: Extended thinking (64k tokens)

## Usage

### Basic Provider Selection

```bash
# Use OpenAI provider
ouroboros-code --prompt "Your prompt here" --provider openai

# Use Anthropic provider
ouroboros-code --prompt "Your prompt here" --provider anthropic

# Use Gemini (default, no flag needed)
ouroboros-code --prompt "Your prompt here"
```

### With Thinking Mode

```bash
# OpenAI with thinking mode (high-effort reasoning)
ouroboros-code --prompt "Complex problem" --provider openai --enable-thinking

# Anthropic with thinking mode (extended 64k token thinking)
ouroboros-code --prompt "Complex problem" --provider anthropic --enable-thinking
```

### Model Selection

```bash
# Use specific OpenAI model
ouroboros-code --prompt "Test" --provider openai --model gpt-5-mini

# Use specific Anthropic model
ouroboros-code --prompt "Test" --provider anthropic --model claude-3-sonnet
```

## Configuration

### API Keys

Set your API keys as environment variables:

```bash
# OpenAI
export OPENAI_API_KEY="your-openai-api-key"

# Anthropic
export ANTHROPIC_API_KEY="your-anthropic-api-key"

# Gemini
export GEMINI_API_KEY="your-gemini-api-key"
```

### Provider Configuration in Settings

You can configure default providers in your settings file:

```json
{
  "provider": "openai",
  "model": "gpt-5",
  "enableThinking": true
}
```

## Feature Parity

All providers support the same core features:

### ✅ Supported Across All Providers

- **Builtin Tools**: All 11 builtin tools work identically
  - File operations: `read_file`, `write_file`, `edit_file`, `ls`, `glob`, `grep`
  - Web operations: `web_fetch`, `google_web_search`
  - System operations: `run_shell_command`, `save_memory`
- **Thinking Mode**: Each provider has optimized thinking implementations
- **Streaming**: Real-time response streaming
- **Tool Execution**: Unified tool interface
- **Memory Management**: Consistent memory handling
- **Error Handling**: Standardized error responses

### Provider-Specific Features

#### OpenAI
- **Reasoning Effort**: Configurable via `reasoning_effort` parameter
- **GPT-5 Models**: Latest models with enhanced capabilities
- **Thinking Indicators**: Progress updates during reasoning

#### Anthropic
- **Extended Thinking**: Up to 64k tokens for complex reasoning
- **Claude 4 Series**: Access to Opus, Sonnet, and Haiku models
- **Thinking Progress**: Detailed thinking status updates

#### Gemini
- **Flash Models**: Fast response times with flash variants
- **OAuth Support**: Can use OAuth authentication
- **Default Provider**: Works out-of-box without configuration

## UI Provider Indicator

The CLI now displays the active provider in the header:

```
╔══════════════════════════════════════╗
║         OUROBOROS CLI                ║
║  Provider: OPENAI (gpt-5)            ║
╚══════════════════════════════════════╝
```

## Troubleshooting

### Provider Not Working

1. **Check API Key**: Ensure the correct environment variable is set
2. **Verify Model**: Some models may require specific access
3. **Network Issues**: Check your internet connection
4. **Rate Limits**: You may have hit provider rate limits

### Thinking Mode Issues

- **OpenAI**: Requires GPT-5 models for thinking mode
- **Anthropic**: Requires Claude 4 models for extended thinking
- **Gemini**: Standard thinking available on all models

### Debug Mode

Use `--debug` flag to see detailed provider selection logs:

```bash
ouroboros-code --prompt "test" --provider openai --debug
```

## Migration Guide

### From Gemini-Only to Multi-Provider

1. **No Code Changes**: Existing prompts work with all providers
2. **Tool Compatibility**: All tools work identically
3. **Seamless Switching**: Change providers with a single flag

### Example Migration

```bash
# Before (Gemini only)
ouroboros-code --prompt "Analyze this code"

# After (choose any provider)
ouroboros-code --prompt "Analyze this code" --provider openai
ouroboros-code --prompt "Analyze this code" --provider anthropic
```

## Performance Comparison

| Provider | Speed | Thinking Depth | Token Limits |
|----------|-------|----------------|--------------|
| Gemini Flash | Fastest | Standard | 32k |
| OpenAI GPT-5 | Fast | High-effort | 128k |
| Anthropic Opus | Moderate | Extended (64k) | 200k |

## Best Practices

1. **Provider Selection**:
   - Use Gemini Flash for quick responses
   - Use OpenAI GPT-5 for complex reasoning
   - Use Anthropic Opus for extended analysis

2. **API Key Management**:
   - Store keys in `.env` files
   - Never commit API keys to version control
   - Use separate keys for development/production

3. **Cost Optimization**:
   - Start with cheaper models (mini, flash)
   - Use premium models for complex tasks only
   - Monitor usage with provider dashboards

## Future Enhancements

- [ ] Provider fallback chains
- [ ] Automatic provider selection based on task
- [ ] Cost tracking and optimization
- [ ] Provider performance benchmarking
- [ ] Custom provider configurations

## Support

For issues or questions about multi-provider support:
- Check debug logs with `--debug` flag
- Review provider-specific documentation
- File issues on GitHub with provider details