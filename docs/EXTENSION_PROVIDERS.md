# Extension Provider System

## Overview

The Ouroboros Extension Provider System enables seamless integration of third-party LLM providers through a plug-and-play extension mechanism. This allows users to install, configure, and use local inference providers like Ollama, vLLM, and Transformers.js without modifying the core codebase.

## Features

- **🔌 Plug & Play**: Install and use providers immediately without restarts
- **📦 Self-Contained**: Each extension is a complete package with its own dependencies
- **🔄 Dynamic Loading**: Providers are discovered and loaded automatically
- **🗑️ Clean Uninstall**: Remove extensions completely when no longer needed
- **🛡️ Type-Safe**: Full TypeScript support with proper interfaces
- **🧪 Well-Tested**: Each extension includes comprehensive unit and integration tests

## Available Provider Extensions

### 1. Ollama Provider
- **Package**: `ollama-provider`
- **Description**: High-quality local LLM inference with Ollama's optimized runtime
- **Features**:
  - Auto-pull models on demand
  - Streaming support
  - Embeddings generation
  - Multiple model support (Llama, Mistral, Gemma, etc.)
- **Requirements**: Ollama installed and running locally

### 2. vLLM Provider  
- **Package**: `@ouroboros/vllm-provider`
- **Description**: High-performance inference server with OpenAI-compatible API
- **Features**:
  - OpenAI API compatibility
  - High-throughput batch processing
  - Tensor parallelism support
  - Continuous batching
- **Requirements**: vLLM server running locally

### 3. Transformers.js Provider
- **Package**: `@ouroboros/transformersjs-provider`  
- **Description**: Ultra-private client-side AI inference via WebAssembly
- **Features**:
  - 100% client-side processing
  - No network requests after model download
  - Multi-task support (text generation, classification, Q&A, etc.)
  - WebAssembly performance
- **Requirements**: Node.js with WebAssembly support

## Installation Guide

### Installing Provider Extensions

```bash
# Install from local path (for development)
ouroboros-code extension install ./extensions/ollama-provider

# Install Ollama provider
ouroboros-code extension install extensions/ollama-provider/

# Install vLLM provider  
ouroboros-code extension install extensions/vllm-provider/

# Install Transformers.js provider
ouroboros-code extension install extensions/transformersjs-provider/
```

### Listing Installed Extensions

```bash
# List all installed extensions
ouroboros-code extension list

# Show detailed information
ouroboros-code extension list --verbose

# Show only provider extensions
ouroboros-code extension list --providers
```

### Uninstalling Extensions

```bash
# Uninstall an extension
ouroboros-code extension uninstall ollama-provider

# Force uninstall without confirmation
ouroboros-code extension uninstall ollama-provider --force
```

## Using Provider Extensions

Once installed, provider extensions are immediately available:

```bash
# Use Ollama for local inference
ouroboros-code --provider ollama "Explain quantum computing"

# Use vLLM for high-performance inference
ouroboros-code --provider vllm "Write a Python function for sorting"

# Use Transformers.js for client-side inference
ouroboros-code --provider transformersjs "Analyze the sentiment: I love this!"
```

### Provider-Specific Configuration

#### Ollama Configuration
```bash
# Specify model
ouroboros-code --provider ollama --model llama2 "Your prompt"

# With custom endpoint
ouroboros-code --provider ollama \
  --ollama-base-url http://localhost:11434 \
  "Your prompt"
```

#### vLLM Configuration  
```bash
# With custom server URL
ouroboros-code --provider vllm \
  --vllm-base-url http://localhost:8000 \
  "Your prompt"

# Specify model
ouroboros-code --provider vllm --model meta-llama/Llama-2-7b-hf "Your prompt"
```

#### Transformers.js Configuration
```bash
# Specify task type
ouroboros-code --provider transformersjs \
  --task text-generation \
  --model Xenova/gpt2 \
  "Complete this sentence: The future of AI is"

# Question answering task
ouroboros-code --provider transformersjs \
  --task question-answering \
  "What is machine learning?"
```

## Creating Your Own Provider Extension

### Extension Structure

```
my-provider-extension/
├── gemini-extension.json    # Extension manifest
├── package.json             # NPM package configuration
├── src/
│   └── provider.ts         # Provider implementation
├── dist/                   # Built JavaScript files
└── tests/
    └── provider.test.ts    # Unit tests
```

### Extension Manifest (gemini-extension.json)

```json
{
  "name": "my-provider",
  "version": "1.0.0",
  "description": "My custom LLM provider",
  "providers": {
    "myprovider": {
      "displayName": "My Provider",
      "description": "Custom LLM provider implementation",
      "entryPoint": "./dist/provider.js",
      "className": "MyProvider",
      "defaultModel": "my-model",
      "capabilities": {
        "streaming": true,
        "embeddings": true,
        "tools": false
      }
    }
  }
}
```

### Provider Implementation

```typescript
import { BaseLLMProvider } from '@ouroboros/code-cli-core';

export class MyProvider extends BaseLLMProvider {
  async initialize(): Promise<void> {
    // Initialize your provider
  }

  async chat(messages: ChatMessage[]): Promise<ChatResponse> {
    // Implement chat functionality
  }

  async streamChat(messages: ChatMessage[]): AsyncGenerator<StreamResponse> {
    // Implement streaming
  }

  async getAvailableModels(): Promise<string[]> {
    // Return available models
  }

  async dispose(): Promise<void> {
    // Cleanup resources
  }
}
```

### Building and Testing

```bash
# In your extension directory
npm install
npm run build
npm test

# Install locally for testing
ouroboros-code extension install .
```

## Technical Details

### Extension Loading Process

1. **Discovery**: Extensions are discovered in `~/.ouroboros-code/extensions/`
2. **Validation**: Extension manifest is validated for required fields
3. **Registration**: Provider is registered with `ExtensionProviderRegistry`
4. **Dynamic Import**: Provider module is loaded on-demand when selected
5. **Instantiation**: Provider class is instantiated with user configuration

### File Locations

- **Extensions Directory**: `~/.ouroboros-code/extensions/`
- **Extension Config**: `[extension-dir]/gemini-extension.json`
- **Provider Module**: `[extension-dir]/dist/provider.js`

### Security Considerations

- Extensions run with the same permissions as the main CLI
- Only install extensions from trusted sources
- Review extension code before installation
- Extensions can access the file system and network

## Troubleshooting

### Extension Not Loading

1. Check extension is properly installed:
   ```bash
   ouroboros-code extension list --verbose
   ```

2. Verify extension is built:
   ```bash
   ls ~/.ouroboros-code/extensions/[extension-name]/dist/
   ```

3. Check for errors in extension manifest:
   ```bash
   cat ~/.ouroboros-code/extensions/[extension-name]/gemini-extension.json
   ```

### Provider Not Available

1. Ensure extension is installed:
   ```bash
   ouroboros-code extension list --providers
   ```

2. Check provider name matches exactly:
   ```bash
   ouroboros-code --provider [exact-provider-name] "test"
   ```

3. Verify provider service is running (for Ollama/vLLM):
   ```bash
   # For Ollama
   ollama list
   
   # For vLLM
   curl http://localhost:8000/v1/models
   ```

### Build Errors

1. Ensure TypeScript is installed:
   ```bash
   npm install -D typescript
   ```

2. Check for type definition files:
   ```bash
   npm install -D @types/node
   ```

3. Verify tsconfig.json configuration:
   ```json
   {
     "compilerOptions": {
       "target": "ES2020",
       "module": "commonjs",
       "outDir": "./dist"
     }
   }
   ```

## Best Practices

1. **Version Management**: Use semantic versioning for extensions
2. **Documentation**: Include README with usage examples
3. **Error Handling**: Implement comprehensive error messages
4. **Testing**: Write unit and integration tests
5. **Dependencies**: Minimize external dependencies
6. **Performance**: Implement efficient streaming and caching
7. **Security**: Never expose API keys or sensitive data

## Contributing

To contribute a new provider extension:

1. Fork the repository
2. Create your extension in `extensions/` directory
3. Follow the extension structure and naming conventions
4. Include comprehensive tests and documentation
5. Submit a pull request with description of the provider

## Support

For issues or questions:
- GitHub Issues: [Report bugs or request features]
- Documentation: Check this guide and provider READMEs
- Community: Join discussions in GitHub Discussions

## License

The extension system and all official provider extensions are licensed under Apache-2.0.