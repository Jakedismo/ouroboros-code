---
pdf-engine: lualatex
mainfont: "DejaVu Serif"
monofont: "DejaVu Sans Mono"
header-includes: |
  \usepackage{fontspec}
  \directlua{
    luaotfload.add_fallback("emojifallback", {"NotoColorEmoji:mode=harf;"})
  }
  \setmainfont[
    RawFeature={fallback=emojifallback}
  ]{DejaVu Serif}
---

# 🦙 Ollama Provider Extension

**Local LLM inference provider for Ouroboros Code** - Run LLMs locally with complete privacy and control.

## Overview

The Ollama Provider extension enables Ouroboros Code to use [Ollama](https://ollama.ai) for local LLM inference. This gives you:

- **🔒 Complete Privacy**: All processing happens locally on your machine  
- **⚡ Fast Inference**: No network calls, optimized for local hardware
- **🎛️ Full Control**: Configure models, parameters, and behavior exactly as needed
- **💰 Zero Cost**: No API fees or usage limits
- **🔧 Easy Setup**: Simple installation with automatic model management

## Installation

### 1. Install Ollama

First, install Ollama on your system:

**macOS:**
```bash
brew install ollama
# OR download from https://ollama.ai/download
```

**Linux:**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

**Windows:**
Download from https://ollama.ai/download

### 2. Start Ollama Server

```bash
ollama serve
```

### 3. Install the Ollama Provider Extension

```bash
ouroboros-code extension install @ouroboros/ollama-provider
```

### 4. Pull Some Models

```bash
ollama pull llama3.1:8b      # Good general purpose model (4.7GB)
ollama pull codellama:7b     # Code-focused model (3.8GB)  
ollama pull phi3:mini        # Lightweight model (2.3GB)
```

## Usage

### Basic Usage

Use Ollama as the provider:

```bash
ouroboros-code "Explain quantum computing" --provider ollama
```

### Configuration

The extension supports extensive configuration through environment variables or configuration files:

```bash
# Use a specific model
ouroboros-code "Write a Python function" --provider ollama --model llama3.1:13b

# Configure base URL (if Ollama is on different port/host)
OLLAMA_BASE_URL=http://localhost:11434 ouroboros-code "Hello" --provider ollama

# Enable auto-pulling of models
OLLAMA_PULL_ON_DEMAND=true ouroboros-code "Help me" --provider ollama --model mistral:7b
```

### Available Configuration Options

| Option | Environment Variable | Default | Description |
|--------|---------------------|---------|-------------|
| `baseUrl` | `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `pullOnDemand` | `OLLAMA_PULL_ON_DEMAND` | `true` | Auto-download models if not available |
| `temperature` | `OLLAMA_TEMPERATURE` | `0.7` | Creativity level (0.0-2.0) |
| `topP` | `OLLAMA_TOP_P` | `0.9` | Nucleus sampling threshold |
| `topK` | `OLLAMA_TOP_K` | `40` | Top-K sampling |
| `repeatPenalty` | `OLLAMA_REPEAT_PENALTY` | `1.1` | Repetition penalty |
| `numCtx` | `OLLAMA_NUM_CTX` | `2048` | Context window size |
| `requestTimeout` | `OLLAMA_REQUEST_TIMEOUT` | `120000` | Request timeout (ms) |

### Advanced Usage

**Streaming Responses:**
```bash
ouroboros-code "Write a long story" --provider ollama --stream
```

**Tool Usage:**
```bash
ouroboros-code "Read package.json and summarize dependencies" --provider ollama --enable-tools
```

**Custom Model Parameters:**
```bash
ouroboros-code "Creative writing task" --provider ollama \
  --temperature 1.2 --top-p 0.8 --repeat-penalty 1.0
```

## Supported Models

The provider works with any Ollama-compatible model. Popular choices:

### General Purpose
- `llama3.1:8b` - Meta's Llama 3.1, good balance of performance and size
- `llama3.1:13b` - Larger version with better capabilities  
- `llama3.1:70b` - Highest quality (requires significant RAM)

### Code-Focused
- `codellama:7b` - Meta's specialized coding model
- `codellama:13b` - Larger coding model with better performance
- `deepseek-coder:6.7b` - Alternative coding-focused model

### Lightweight Options
- `phi3:mini` - Microsoft's compact model (3.8B parameters)
- `qwen2:0.5b` - Ultra-lightweight for basic tasks
- `gemma2:2b` - Google's compact model

### Specialized Models  
- `nomic-embed-text` - Text embeddings (for semantic search)
- `llava:7b` - Vision-language model (multimodal)
- `mistral:7b` - High-performance general purpose

See [Ollama Library](https://ollama.ai/library) for the full catalog.

## Provider Capabilities

✅ **Chat Completion** - Full conversational AI support  
✅ **Streaming** - Real-time response streaming  
✅ **Tool Calling** - Function calling and tool usage  
✅ **Embeddings** - Text embedding generation  
✅ **Model Management** - Automatic model downloading  
✅ **Error Recovery** - Robust error handling and retries  

## Troubleshooting

### Ollama Server Not Running

**Error:** `Failed to connect to Ollama server`

**Solution:**
```bash
ollama serve
```

### Model Not Found

**Error:** `Model 'llama3.1:8b' not found locally`

**Solutions:**
1. Pull the model: `ollama pull llama3.1:8b`
2. Enable auto-download: `OLLAMA_PULL_ON_DEMAND=true`
3. Use a different model: `--model codellama:7b`

### Out of Memory

**Error:** `insufficient memory to load model`

**Solutions:**
1. Use a smaller model (e.g., `phi3:mini` instead of `llama3.1:70b`)
2. Close other applications to free RAM
3. Configure Ollama with lower memory usage:
   ```bash
   OLLAMA_NUM_GPU=0  # Disable GPU usage
   ```

### Slow Performance

**Performance Tips:**
1. Use GPU acceleration if available
2. Choose appropriately sized models for your hardware
3. Adjust context window: `--num-ctx 1024` (smaller = faster)
4. Use quantized models (most Ollama models are pre-quantized)

### Connection Issues

**Error:** `Connection refused`

**Check:**
1. Ollama is running: `ollama list`
2. Port is correct: default is `11434`
3. Firewall allows connections
4. If using custom host: `OLLAMA_BASE_URL=http://your-host:11434`

## Verification

Verify your installation:

```bash
cd path/to/ollama-provider
npm run verify-install
```

This will:
- ✅ Check Ollama server connection
- ✅ Verify available models  
- ✅ Test basic chat functionality
- ✅ Validate provider registration

## Development

### Building from Source

```bash
git clone https://github.com/ouroboros-ai/ollama-provider
cd ollama-provider
npm install
npm run build
npm test
```

### Running Tests

```bash
npm test                    # Unit tests
npm run test:integration    # Integration tests  
npm run test:watch         # Watch mode
```

### Configuration Schema

The extension follows the standard Ouroboros extension format with provider-specific capabilities:

```json
{
  "providers": {
    "ollama": {
      "displayName": "Ollama (Local)",
      "entryPoint": "./dist/provider.js",
      "defaultModel": "llama3.1:8b",
      "capabilities": {
        "supportsStreaming": true,
        "supportsTools": true,
        "supportsEmbeddings": true,
        "supportsVision": false
      },
      "requirements": {
        "platform": ["darwin", "linux", "win32"],
        "arch": ["x64", "arm64"],
        "memory": "8GB",
        "dependencies": ["ollama"]
      }
    }
  }
}
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Run tests: `npm test`
5. Commit: `git commit -am 'Add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Create a Pull Request

## License

Apache License 2.0 - see [LICENSE](LICENSE) for details.

## Support

- 📚 **Documentation**: https://docs.ouroboros.dev/extensions/ollama
- 🐛 **Issues**: https://github.com/ouroboros-ai/ollama-provider/issues  
- 💬 **Discussions**: https://github.com/ouroboros-ai/ollama-provider/discussions
- 🦙 **Ollama Docs**: https://ollama.ai/docs

---

**Happy local LLM inference! 🦙✨**