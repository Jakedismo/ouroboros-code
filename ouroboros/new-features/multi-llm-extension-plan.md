# Multi-LLM Extension Plan for Gemini CLI

## Executive Summary

This plan outlines how to extend the Gemini CLI to support OpenAI and Anthropic LLMs while maintaining full compatibility with upstream changes from the original repository.

## Architecture Analysis

### Current Structure

- **Core Package** (`packages/core/`): Contains the main logic and abstractions
- **CLI Package** (`packages/cli/`): Contains the CLI interface
- **Key Abstraction**: `ContentGenerator` interface in `packages/core/src/core/contentGenerator.ts`
- **Model Configuration**: Centralized in `packages/core/src/config/models.ts`
- **Dependency**: Uses `@google/genai` package (v1.13.0)

## Extension Strategy

### 1. Fork Management Strategy

#### Initial Setup

```bash
# Fork the repository on GitHub
git clone https://github.com/your-username/gemini-cli.git
cd gemini-cli

# Add upstream remote
git remote add upstream https://github.com/google-gemini/gemini-cli.git

# Create feature branch for multi-LLM support
git checkout -b feature/multi-llm-support
```

#### Sync Strategy

```bash
# Regular sync process (weekly/monthly)
git fetch upstream
git checkout main
git merge upstream/main
git checkout feature/multi-llm-support
git rebase main
```

### 2. Provider Abstraction Layer

#### Create New Provider Interface

**Location**: `packages/core/src/providers/types.ts`

```typescript
export enum LLMProvider {
  GEMINI = 'gemini',
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
}

export interface LLMProviderConfig {
  provider: LLMProvider;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  embeddingModel?: string;
  maxRetries?: number;
  timeout?: number;
}

export interface UnifiedMessage {
  role: 'user' | 'assistant' | 'system' | 'function';
  content: string | Array<TextPart | ImagePart | FunctionCallPart>;
}

export interface UnifiedGenerateRequest {
  messages: UnifiedMessage[];
  systemInstruction?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  tools?: UnifiedTool[];
  toolChoice?: 'auto' | 'none' | 'required';
}

export interface UnifiedGenerateResponse {
  content: string;
  functionCalls?: FunctionCall[];
  finishReason?: string;
  usage?: UsageMetadata;
}
```

### 3. Provider Implementations

#### Directory Structure

```
packages/core/src/providers/
├── types.ts                    # Unified interfaces
├── base.ts                     # Base provider class
├── gemini/
│   ├── provider.ts            # Gemini implementation
│   └── converter.ts           # Convert to/from Gemini format
├── openai/
│   ├── provider.ts            # OpenAI implementation
│   └── converter.ts           # Convert to/from OpenAI format
├── anthropic/
│   ├── provider.ts            # Anthropic implementation
│   └── converter.ts           # Convert to/from Anthropic format
└── factory.ts                 # Provider factory
```

#### Base Provider Class

**Location**: `packages/core/src/providers/base.ts`

```typescript
export abstract class BaseLLMProvider implements ContentGenerator {
  protected config: LLMProviderConfig;

  constructor(config: LLMProviderConfig) {
    this.config = config;
  }

  abstract generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse>;

  abstract generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): AsyncIterable<GenerateContentResponse>;

  abstract countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse>;

  abstract embedContent(
    request: EmbedContentParameters,
  ): Promise<EmbedContentResponse>;
}
```

#### OpenAI Provider Implementation

**Location**: `packages/core/src/providers/openai/provider.ts`

```typescript
import OpenAI from 'openai';
import { BaseLLMProvider } from '../base.js';
import { convertToOpenAIFormat, convertFromOpenAIFormat } from './converter.js';

export class OpenAIProvider extends BaseLLMProvider {
  private client: OpenAI;

  constructor(config: LLMProviderConfig) {
    super(config);
    this.client = new OpenAI({
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
      baseURL: config.baseUrl,
    });
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    const openaiRequest = convertToOpenAIFormat(request, this.config.model);
    const response = await this.client.chat.completions.create(openaiRequest);
    return convertFromOpenAIFormat(response);
  }

  async *generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): AsyncIterable<GenerateContentResponse> {
    const openaiRequest = convertToOpenAIFormat(request, this.config.model);
    const stream = await this.client.chat.completions.create({
      ...openaiRequest,
      stream: true,
    });

    for await (const chunk of stream) {
      yield convertFromOpenAIFormat(chunk);
    }
  }

  // Implement other required methods...
}
```

#### Anthropic Provider Implementation

**Location**: `packages/core/src/providers/anthropic/provider.ts`

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { BaseLLMProvider } from '../base.js';
import {
  convertToAnthropicFormat,
  convertFromAnthropicFormat,
} from './converter.js';

export class AnthropicProvider extends BaseLLMProvider {
  private client: Anthropic;

  constructor(config: LLMProviderConfig) {
    super(config);
    this.client = new Anthropic({
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
      baseURL: config.baseUrl,
    });
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    const anthropicRequest = convertToAnthropicFormat(
      request,
      this.config.model,
    );
    const response = await this.client.messages.create(anthropicRequest);
    return convertFromAnthropicFormat(response);
  }

  // Implement other required methods...
}
```

### 4. Factory Pattern for Provider Selection

**Location**: `packages/core/src/providers/factory.ts`

```typescript
import { GeminiProvider } from './gemini/provider.js';
import { OpenAIProvider } from './openai/provider.js';
import { AnthropicProvider } from './anthropic/provider.js';
import { LLMProvider, LLMProviderConfig } from './types.js';
import { ContentGenerator } from '../core/contentGenerator.js';

export class LLMProviderFactory {
  static create(config: LLMProviderConfig): ContentGenerator {
    switch (config.provider) {
      case LLMProvider.GEMINI:
        return new GeminiProvider(config);
      case LLMProvider.OPENAI:
        return new OpenAIProvider(config);
      case LLMProvider.ANTHROPIC:
        return new AnthropicProvider(config);
      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }
  }
}
```

### 5. Configuration Extension

#### Extended Config Schema

**Location**: `packages/core/src/config/config.ts` (minimal changes)

```typescript
// Add to existing Config class
export class Config {
  // ... existing code ...

  private llmProvider?: LLMProvider;
  private llmProviderConfig?: LLMProviderConfig;

  getLLMProvider(): LLMProvider {
    return this.llmProvider || LLMProvider.GEMINI;
  }

  setLLMProvider(
    provider: LLMProvider,
    config?: Partial<LLMProviderConfig>,
  ): void {
    this.llmProvider = provider;
    this.llmProviderConfig = {
      provider,
      ...config,
      model: config?.model || this.getModelForProvider(provider),
    };
  }

  private getModelForProvider(provider: LLMProvider): string {
    switch (provider) {
      case LLMProvider.GEMINI:
        return DEFAULT_GEMINI_MODEL;
      case LLMProvider.OPENAI:
        return 'gpt-4-turbo-preview';
      case LLMProvider.ANTHROPIC:
        return 'claude-3-opus-20240229';
      default:
        return DEFAULT_GEMINI_MODEL;
    }
  }
}
```

### 6. Integration Points

#### Modify ContentGenerator Creation

**Location**: `packages/core/src/core/contentGenerator.ts`

```typescript
import { LLMProviderFactory } from '../providers/factory.js';

export function createContentGenerator(
  config: ContentGeneratorConfig,
  configInstance?: Config, // Add Config instance parameter
): ContentGenerator {
  // Check if multi-LLM support is enabled
  if (
    configInstance?.getLLMProvider() &&
    configInstance.getLLMProvider() !== LLMProvider.GEMINI
  ) {
    return LLMProviderFactory.create({
      provider: configInstance.getLLMProvider(),
      apiKey: config.apiKey,
      model: configInstance.getModel(),
      ...configInstance.llmProviderConfig,
    });
  }

  // Fall back to original Gemini implementation
  // ... existing code ...
}
```

### 7. CLI Integration

#### Add Provider Selection to CLI

**Location**: `packages/cli/src/config/config.ts`

```typescript
// Add new CLI flags
export interface CLIArguments {
  // ... existing flags ...
  provider?: string;
  'openai-key'?: string;
  'anthropic-key'?: string;
  'provider-base-url'?: string;
}

// Update config loading
export async function loadConfig(argv: CLIArguments): Promise<Config> {
  // ... existing code ...

  // Handle provider selection
  if (argv.provider) {
    const providerConfig: Partial<LLMProviderConfig> = {
      provider: argv.provider as LLMProvider,
    };

    if (argv.provider === 'openai') {
      providerConfig.apiKey = argv['openai-key'] || process.env.OPENAI_API_KEY;
    } else if (argv.provider === 'anthropic') {
      providerConfig.apiKey =
        argv['anthropic-key'] || process.env.ANTHROPIC_API_KEY;
    }

    if (argv['provider-base-url']) {
      providerConfig.baseUrl = argv['provider-base-url'];
    }

    config.setLLMProvider(argv.provider as LLMProvider, providerConfig);
  }

  return config;
}
```

### 8. Package Dependencies

#### Update package.json

**Location**: `packages/core/package.json`

```json
{
  "dependencies": {
    "@google/genai": "1.13.0",
    "openai": "^4.52.0",
    "@anthropic-ai/sdk": "^0.24.0"
    // ... existing dependencies
  }
}
```

### 9. Environment Variables

#### .env.example

```bash
# Gemini (existing)
GEMINI_API_KEY=your_gemini_api_key

# OpenAI
OPENAI_API_KEY=your_openai_api_key
OPENAI_BASE_URL=https://api.openai.com/v1  # Optional

# Anthropic
ANTHROPIC_API_KEY=your_anthropic_api_key
ANTHROPIC_BASE_URL=https://api.anthropic.com  # Optional

# Default provider (gemini, openai, anthropic)
DEFAULT_LLM_PROVIDER=gemini
```

### 10. Testing Strategy

#### Unit Tests Structure

```
packages/core/src/providers/__tests__/
├── gemini.test.ts
├── openai.test.ts
├── anthropic.test.ts
├── factory.test.ts
└── converters.test.ts
```

#### Integration Tests

```typescript
// Test provider switching
describe('Multi-LLM Provider Integration', () => {
  it('should switch between providers seamlessly', async () => {
    const config = new Config({
      /* ... */
    });

    // Test Gemini
    config.setLLMProvider(LLMProvider.GEMINI);
    const geminiResponse = await client.generateContent(/* ... */);

    // Test OpenAI
    config.setLLMProvider(LLMProvider.OPENAI);
    const openaiResponse = await client.generateContent(/* ... */);

    // Test Anthropic
    config.setLLMProvider(LLMProvider.ANTHROPIC);
    const anthropicResponse = await client.generateContent(/* ... */);

    // Verify responses have consistent structure
  });
});
```

### 11. Documentation

#### README.md Addition

````markdown
## Multi-LLM Support

This fork extends Gemini CLI with support for OpenAI and Anthropic models.

### Configuration

Set your API keys:

```bash
export OPENAI_API_KEY=your_key
export ANTHROPIC_API_KEY=your_key
```
````

### Usage

```bash
# Use OpenAI
gemini --provider openai --model gpt-4-turbo-preview "Your prompt"

# Use Anthropic
gemini --provider anthropic --model claude-3-opus-20240229 "Your prompt"

# Use Gemini (default)
gemini "Your prompt"
```

````

### 12. Maintenance Guidelines

#### Keeping Changes Minimal
1. **Never modify existing Gemini code directly** - Always extend through new files
2. **Use dependency injection** - Pass provider instances rather than hardcoding
3. **Maintain backward compatibility** - Ensure Gemini still works as default
4. **Document all integration points** - Mark with comments like `// MULTI_LLM_EXTENSION`

#### Regular Sync Process
1. **Weekly sync from upstream**
   ```bash
   git fetch upstream
   git checkout main
   git merge upstream/main
````

2. **Resolve conflicts prioritizing upstream changes**
   - Keep upstream changes intact
   - Re-apply extensions only where necessary

3. **Run full test suite after sync**
   ```bash
   npm test
   npm run test:integration
   ```

### 13. Rollout Plan

#### Phase 1: Foundation (Week 1-2)

- [ ] Fork repository and setup
- [ ] Create provider abstraction layer
- [ ] Implement base provider class
- [ ] Add factory pattern

#### Phase 2: OpenAI Integration (Week 3-4)

- [ ] Implement OpenAI provider
- [ ] Create OpenAI converters
- [ ] Add OpenAI-specific tests
- [ ] Test with various OpenAI models

#### Phase 3: Anthropic Integration (Week 5-6)

- [ ] Implement Anthropic provider
- [ ] Create Anthropic converters
- [ ] Add Anthropic-specific tests
- [ ] Test with various Anthropic models

#### Phase 4: CLI & Configuration (Week 7)

- [ ] Extend CLI argument parsing
- [ ] Update configuration management
- [ ] Add environment variable support
- [ ] Create user documentation

#### Phase 5: Testing & Polish (Week 8)

- [ ] Comprehensive integration testing
- [ ] Performance benchmarking
- [ ] Documentation completion
- [ ] Create migration guide

### 14. Potential Challenges & Solutions

#### Challenge 1: Tool/Function Calling Differences

**Solution**: Create unified tool interface that maps to each provider's format

#### Challenge 2: Streaming Response Formats

**Solution**: Normalize streaming responses in converters to match Gemini format

#### Challenge 3: Token Counting Variations

**Solution**: Use provider-specific tokenizers or fallback to estimation

#### Challenge 4: Rate Limiting & Error Handling

**Solution**: Implement provider-specific error parsers and retry logic

#### Challenge 5: Feature Parity

**Solution**: Document feature matrix showing which features work with which providers

### 15. Future Enhancements

1. **Plugin System**: Make providers loadable as plugins
2. **Provider Fallback**: Automatic fallback to another provider on failure
3. **Cost Tracking**: Track API usage costs across providers
4. **Model Router**: Route requests to optimal model based on task
5. **Local Model Support**: Add support for Ollama or local models
6. **Caching Layer**: Implement response caching across providers

## Conclusion

This approach maintains maximum compatibility with upstream while adding powerful multi-LLM capabilities. The key is minimal modification of existing code, using extension points and abstraction layers to add new functionality without breaking existing features.
