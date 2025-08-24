# Ollama Local Inference Provider Design

## Overview

This document outlines the design for integrating **Ollama** as a local inference provider within the Ouroboros multi-LLM architecture. Ollama provides a simple way to run large language models locally with an OpenAI-compatible API.

## Architecture Integration

### Provider Implementation

**Location**: `packages/core/src/providers/ollama/`

```typescript
// packages/core/src/providers/ollama/provider.ts
export class OllamaProvider extends BaseLLMProvider {
  private ollamaClient: OllamaClient;
  private modelManager: OllamaModelManager;
  
  constructor(config: LLMProviderConfig) {
    super(config);
    this.ollamaClient = new OllamaClient(config);
    this.modelManager = new OllamaModelManager(config);
  }
}
```

### Provider Type Extension

**Update**: `packages/core/src/providers/types.ts`

```typescript
export enum LLMProvider {
  GEMINI = 'gemini',
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  OLLAMA = 'ollama',  // New local provider
}

export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  [LLMProvider.GEMINI]: 'gemini-2.5-pro',
  [LLMProvider.OPENAI]: 'gpt-5',
  [LLMProvider.ANTHROPIC]: 'claude-4-1-opus-20250508',
  [LLMProvider.OLLAMA]: 'llama3.1:latest',  // Default Ollama model
};

export const PROVIDER_CAPABILITIES: Record<LLMProvider, ProviderCapabilities> = {
  // ... existing providers
  [LLMProvider.OLLAMA]: {
    supportsStreaming: true,
    supportsTools: true,        // Limited tool support
    supportsFunctionCalling: false,  // Depends on model
    supportsVision: false,      // Model-dependent
    supportsEmbedding: true,    // Via embeddings API
    maxTokens: 8192,           // Model-dependent
    maxContextTokens: 128000,  // Model-dependent
    supportsSystemMessage: true,
    supportsToolChoice: false,
    // Most local models don't have thinking mode
    thinking: {
      supportsThinking: false,
      supportsThinkingStream: false,
    },
  },
};
```

### Factory Integration

**Update**: `packages/core/src/providers/factory.ts`

```typescript
private static async createBasicProvider(config: LLMProviderConfig): Promise<BaseLLMProvider> {
  switch (config.provider) {
    // ... existing cases
    case LLMProvider.OLLAMA:
      const { OllamaProvider } = await import('./ollama/provider.js');
      return new OllamaProvider(config);
    
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}
```

## Core Components

### 1. Ollama Client (`ollama-client.ts`)

```typescript
export interface OllamaConfig {
  baseUrl: string;          // Default: http://localhost:11434
  timeout: number;          // Request timeout
  maxRetries: number;       // Retry attempts
  pullTimeout: number;      // Model pull timeout
}

export class OllamaClient {
  private baseUrl: string;
  private httpClient: AxiosInstance;
  
  constructor(config: LLMProviderConfig) {
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.httpClient = this.createHttpClient();
  }

  async generate(request: OllamaGenerateRequest): Promise<OllamaGenerateResponse> {
    return this.httpClient.post('/api/generate', request);
  }

  async chat(request: OllamaChatRequest): Promise<OllamaChatResponse> {
    return this.httpClient.post('/api/chat', request);
  }

  async *generateStream(request: OllamaGenerateRequest): AsyncGenerator<OllamaGenerateResponse> {
    const response = await this.httpClient.post('/api/generate', {
      ...request,
      stream: true
    }, { responseType: 'stream' });
    
    yield* this.parseStreamResponse(response.data);
  }

  async embeddings(request: OllamaEmbeddingsRequest): Promise<OllamaEmbeddingsResponse> {
    return this.httpClient.post('/api/embeddings', request);
  }

  async listModels(): Promise<OllamaModel[]> {
    const response = await this.httpClient.get('/api/tags');
    return response.data.models;
  }

  async pullModel(name: string, onProgress?: (progress: PullProgress) => void): Promise<void> {
    const response = await this.httpClient.post('/api/pull', 
      { name }, 
      { responseType: 'stream' }
    );
    
    for await (const chunk of this.parseStreamResponse(response.data)) {
      onProgress?.(chunk as PullProgress);
    }
  }

  async deleteModel(name: string): Promise<void> {
    return this.httpClient.delete(`/api/delete`, { data: { name } });
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.httpClient.get('/api/tags');
      return true;
    } catch {
      return false;
    }
  }
}
```

### 2. Model Manager (`model-manager.ts`)

```typescript
export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    families?: string[];
    parameter_size: string;
    quantization_level: string;
  };
  modified_at: string;
}

export class OllamaModelManager {
  private client: OllamaClient;
  private modelCache: Map<string, OllamaModel>;

  constructor(private config: LLMProviderConfig) {
    this.client = new OllamaClient(config);
    this.modelCache = new Map();
  }

  async ensureModelAvailable(modelName: string): Promise<boolean> {
    const availableModels = await this.listModels();
    const model = availableModels.find(m => m.name === modelName);
    
    if (!model) {
      console.log(`Model ${modelName} not found locally. Attempting to pull...`);
      await this.pullModel(modelName);
      return true;
    }
    
    return true;
  }

  async listModels(): Promise<OllamaModel[]> {
    if (this.modelCache.size === 0) {
      const models = await this.client.listModels();
      models.forEach(model => this.modelCache.set(model.name, model));
    }
    return Array.from(this.modelCache.values());
  }

  async pullModel(name: string): Promise<void> {
    return this.client.pullModel(name, (progress) => {
      console.log(`Pulling ${name}: ${progress.status} - ${progress.completed}/${progress.total}`);
    });
  }

  async getModelCapabilities(modelName: string): Promise<ModelCapabilities> {
    const model = await this.getModelInfo(modelName);
    
    return {
      supportsVision: this.isVisionModel(model),
      supportsTools: this.isToolCapableModel(model),
      maxContextTokens: this.getMaxContextTokens(model),
      maxTokens: this.getMaxOutputTokens(model),
    };
  }

  private isVisionModel(model: OllamaModel): boolean {
    return model.details.families?.includes('clip') || 
           model.name.includes('vision') ||
           model.name.includes('llava');
  }

  private isToolCapableModel(model: OllamaModel): boolean {
    // Most modern models support some form of tool usage
    const toolCapablePatterns = [
      'llama3', 'mistral', 'qwen', 'deepseek', 'phi3'
    ];
    return toolCapablePatterns.some(pattern => 
      model.name.toLowerCase().includes(pattern)
    );
  }
}
```

### 3. Format Converter (`format-converter.ts`)

```typescript
export class OllamaFormatConverter implements FormatConverter {
  fromGeminiFormat(request: GenerateContentParameters): UnifiedGenerateRequest {
    return {
      messages: this.convertGeminiMessages(request.contents || []),
      model: request.model,
      systemInstruction: request.systemInstruction?.parts?.[0]?.text,
      maxTokens: request.generationConfig?.maxOutputTokens,
      temperature: request.generationConfig?.temperature,
      topP: request.generationConfig?.topP,
      stream: false,
      tools: this.convertGeminiTools(request.tools || []),
    };
  }

  toProviderFormat(request: UnifiedGenerateRequest): OllamaChatRequest {
    return {
      model: request.model || this.getDefaultModel(),
      messages: this.convertToOllamaMessages(request.messages),
      options: {
        temperature: request.temperature,
        top_p: request.topP,
        top_k: request.topK,
        num_predict: request.maxTokens,
      },
      stream: request.stream || false,
      tools: request.tools ? this.convertToOllamaTools(request.tools) : undefined,
    };
  }

  fromProviderResponse(response: OllamaChatResponse): UnifiedGenerateResponse {
    return {
      content: response.message?.content || '',
      finishReason: this.mapFinishReason(response.done_reason),
      usage: {
        promptTokens: response.prompt_eval_count,
        candidatesTokens: response.eval_count,
        totalTokens: (response.prompt_eval_count || 0) + (response.eval_count || 0),
      },
      functionCalls: this.extractFunctionCalls(response.message),
    };
  }

  toGeminiFormat(response: UnifiedGenerateResponse): GenerateContentResponse {
    return {
      candidates: [{
        content: {
          role: 'model',
          parts: this.createGeminiParts(response.content, response.functionCalls),
        },
        finishReason: response.finishReason,
      }],
      usageMetadata: response.usage,
    };
  }

  private convertToOllamaMessages(messages: UnifiedMessage[]): OllamaMessage[] {
    return messages.map(msg => ({
      role: this.mapRole(msg.role),
      content: typeof msg.content === 'string' ? msg.content : this.flattenContent(msg.content),
      images: this.extractImages(msg.content),
    }));
  }

  private convertToOllamaTools(tools: UnifiedTool[]): OllamaTool[] {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }
}
```

## Configuration

### Provider Configuration

```typescript
interface OllamaProviderConfig extends LLMProviderConfig {
  provider: 'ollama';
  baseUrl?: string;          // Default: http://localhost:11434
  pullOnDemand?: boolean;    // Auto-pull missing models
  pullTimeout?: number;      // Model pull timeout (ms)
  modelPath?: string;        // Custom model storage path
}
```

### CLI Integration

**Update**: CLI arguments to support Ollama

```bash
# Use Ollama provider
ouroboros-code --provider ollama "Hello"

# Specify Ollama URL and model
ouroboros-code --provider ollama --model llama3.1:8b --base-url http://localhost:11434 "Hello"

# Auto-pull missing models
ouroboros-code --provider ollama --model codellama:13b --ollama-pull-on-demand "Write a Python function"
```

### Settings Integration

```yaml
# .ouroboros/settings.yaml
providers:
  ollama:
    baseUrl: "http://localhost:11434"
    defaultModel: "llama3.1:latest"
    pullOnDemand: true
    pullTimeout: 300000  # 5 minutes
    modelPath: "/path/to/models"  # Optional custom path
```

## Model Discovery and Management

### Automatic Model Discovery

```typescript
export class OllamaModelDiscovery {
  async discoverModels(): Promise<DiscoveredModel[]> {
    const models = await this.modelManager.listModels();
    
    return models.map(model => ({
      name: model.name,
      displayName: this.getDisplayName(model.name),
      family: model.details.family,
      parameterSize: model.details.parameter_size,
      capabilities: this.inferCapabilities(model),
      localPath: this.getModelPath(model),
      size: model.size,
      isLoaded: true,  // Already pulled
    }));
  }

  async suggestModels(): Promise<RecommendedModel[]> {
    return [
      {
        name: 'llama3.1:8b',
        description: 'Balanced performance and speed',
        useCase: 'General purpose',
        downloadSize: '4.7GB',
      },
      {
        name: 'codellama:13b',
        description: 'Optimized for code generation',
        useCase: 'Programming tasks',
        downloadSize: '7.4GB',
      },
      {
        name: 'mistral:7b',
        description: 'Fast inference with good quality',
        useCase: 'Quick responses',
        downloadSize: '4.1GB',
      },
    ];
  }
}
```

## Tool Integration

### Builtin Tools Support

```typescript
export class OllamaToolAdapter extends ProviderToolAdapter {
  async executeTools(calls: UnifiedToolCall[]): Promise<UnifiedToolResult[]> {
    // Ollama has basic tool support - convert to function calling format
    const results: UnifiedToolResult[] = [];
    
    for (const call of calls) {
      try {
        const result = await this.executeBuiltinTool(call);
        results.push({
          toolCallId: call.id,
          result: result,
          isError: false,
        });
      } catch (error) {
        results.push({
          toolCallId: call.id,
          result: `Error: ${error.message}`,
          isError: true,
        });
      }
    }
    
    return results;
  }

  private async executeBuiltinTool(call: UnifiedToolCall): Promise<any> {
    const toolManager = this.getBuiltinToolManager();
    return toolManager.executeTool(call.function.name, call.function.arguments);
  }
}
```

## Error Handling

### Ollama-Specific Errors

```typescript
export class OllamaError extends ProviderError {
  constructor(message: string, originalError?: Error) {
    super(message, LLMProvider.OLLAMA, originalError);
    this.name = 'OllamaError';
  }
}

export class OllamaConnectionError extends OllamaError {
  constructor(baseUrl: string) {
    super(`Cannot connect to Ollama server at ${baseUrl}. Is Ollama running?`);
  }
}

export class OllamaModelNotFoundError extends OllamaError {
  constructor(modelName: string) {
    super(`Model ${modelName} not found. Run 'ollama pull ${modelName}' to download it.`);
  }
}

export class OllamaModelPullError extends OllamaError {
  constructor(modelName: string, reason: string) {
    super(`Failed to pull model ${modelName}: ${reason}`);
  }
}
```

## Installation and Setup

### Prerequisites Check

```typescript
export class OllamaSetupValidator {
  async validateSetup(): Promise<SetupResult> {
    const result: SetupResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
    };

    // Check if Ollama is installed
    if (!(await this.isOllamaInstalled())) {
      result.isValid = false;
      result.errors.push('Ollama is not installed');
      result.suggestions.push('Install Ollama from https://ollama.ai');
      return result;
    }

    // Check if Ollama is running
    if (!(await this.isOllamaRunning())) {
      result.isValid = false;
      result.errors.push('Ollama server is not running');
      result.suggestions.push('Start Ollama: `ollama serve`');
      return result;
    }

    // Check if any models are available
    const models = await this.listAvailableModels();
    if (models.length === 0) {
      result.warnings.push('No models found');
      result.suggestions.push('Pull a model: `ollama pull llama3.1`');
    }

    return result;
  }
}
```

## Performance Considerations

### Streaming Optimization

- **Chunked Processing**: Process streaming responses efficiently
- **Memory Management**: Handle large model contexts without memory issues
- **Connection Pooling**: Reuse HTTP connections for better performance

### Model Loading

- **Model Warming**: Keep frequently used models loaded
- **Automatic Unloading**: Unload unused models to free memory
- **Load Balancing**: Distribute requests across multiple model instances

## Integration Benefits

1. **Privacy**: Complete local inference with no data sent to external services
2. **Cost**: No API costs - only local compute resources
3. **Customization**: Use any Ollama-compatible model
4. **Offline**: Works without internet connection
5. **Speed**: Low latency for properly configured hardware
6. **Integration**: Seamless integration with existing builtin tools and MCP

## Migration Path

### From API Providers

```bash
# Easy migration from OpenAI to Ollama
ouroboros-code --provider openai "Hello"        # Before
ouroboros-code --provider ollama "Hello"        # After

# Model equivalence mapping
gpt-4 → llama3.1:8b
gpt-3.5-turbo → mistral:7b
code-davinci-002 → codellama:7b
```

### Configuration Migration

```typescript
export class OllamaMigrationHelper {
  migrateFromOpenAI(openaiConfig: OpenAIConfig): OllamaProviderConfig {
    return {
      provider: 'ollama',
      model: this.mapOpenAIModel(openaiConfig.model),
      baseUrl: 'http://localhost:11434',
      temperature: openaiConfig.temperature,
      maxTokens: openaiConfig.maxTokens,
    };
  }

  private mapOpenAIModel(openaiModel: string): string {
    const modelMap: Record<string, string> = {
      'gpt-4': 'llama3.1:8b',
      'gpt-3.5-turbo': 'mistral:7b',
      'code-davinci-002': 'codellama:7b',
    };
    return modelMap[openaiModel] || 'llama3.1:latest';
  }
}
```

This design provides a comprehensive integration of Ollama as a local inference provider while maintaining compatibility with the existing Ouroboros multi-LLM architecture.