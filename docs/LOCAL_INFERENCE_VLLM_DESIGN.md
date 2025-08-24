# vLLM Local Inference Provider Design

## Overview

This document outlines the design for integrating **vLLM** (Very Large Language Model inference server) as a high-performance local inference provider within the Ouroboros multi-LLM architecture. vLLM provides optimized inference with advanced features like PagedAttention, continuous batching, and GPU acceleration.

## Architecture Integration

### Provider Implementation

**Location**: `packages/core/src/providers/vllm/`

```typescript
// packages/core/src/providers/vllm/provider.ts
export class VLLMProvider extends BaseLLMProvider {
  private vllmClient: VLLMClient;
  private modelManager: VLLMModelManager;
  private batchManager: VLLMBatchManager;
  
  constructor(config: LLMProviderConfig) {
    super(config);
    this.vllmClient = new VLLMClient(config);
    this.modelManager = new VLLMModelManager(config);
    this.batchManager = new VLLMBatchManager(config);
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
  OLLAMA = 'ollama',
  VLLM = 'vllm',  // High-performance local provider
}

export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  [LLMProvider.GEMINI]: 'gemini-2.5-pro',
  [LLMProvider.OPENAI]: 'gpt-5',
  [LLMProvider.ANTHROPIC]: 'claude-4-1-opus-20250508',
  [LLMProvider.OLLAMA]: 'llama3.1:latest',
  [LLLProvider.VLLM]: 'meta-llama/Llama-3.1-8B-Instruct',  // Default vLLM model
};

export const PROVIDER_CAPABILITIES: Record<LLMProvider, ProviderCapabilities> = {
  // ... existing providers
  [LLLProvider.VLLM]: {
    supportsStreaming: true,
    supportsTools: true,        // Advanced tool support
    supportsFunctionCalling: true,  // Native function calling
    supportsVision: true,       // Model-dependent (e.g., LLaVA)
    supportsEmbedding: false,   // vLLM focuses on generation
    maxTokens: 32768,          // Model-dependent
    maxContextTokens: 131072,   // Up to 128K+ with efficient attention
    supportsSystemMessage: true,
    supportsToolChoice: true,
    // Advanced performance features
    thinking: {
      supportsThinking: false,  // Depends on model
      supportsThinkingStream: false,
    },
    // vLLM-specific capabilities
    vllmFeatures: {
      supportsContinuousBatching: true,
      supportsPagedAttention: true,
      supportsSpeculativeDecoding: true,
      supportsMultiGPU: true,
      supportsQuantization: true,
    },
  },
};
```

## Core Components

### 1. vLLM Client (`vllm-client.ts`)

```typescript
export interface VLLMConfig {
  baseUrl: string;              // Default: http://localhost:8000
  apiKey?: string;              // Optional API key for secured deployments
  timeout: number;              // Request timeout
  maxRetries: number;           // Retry attempts
  batchSize?: number;           // Batch size for requests
  maxConcurrentRequests?: number;  // Concurrent request limit
}

export class VLLMClient {
  private baseUrl: string;
  private httpClient: AxiosInstance;
  private wsClient?: WebSocket;  // For real-time streaming
  
  constructor(config: LLMProviderConfig) {
    this.baseUrl = config.baseUrl || 'http://localhost:8000';
    this.httpClient = this.createHttpClient(config);
  }

  async generate(request: VLLMGenerateRequest): Promise<VLLMGenerateResponse> {
    return this.httpClient.post('/v1/completions', request);
  }

  async chat(request: VLLMChatRequest): Promise<VLLMChatResponse> {
    return this.httpClient.post('/v1/chat/completions', request);
  }

  async *generateStream(request: VLLMGenerateRequest): AsyncGenerator<VLLMGenerateResponse> {
    const response = await this.httpClient.post('/v1/completions', {
      ...request,
      stream: true
    }, { 
      responseType: 'stream',
      headers: { 'Accept': 'text/event-stream' }
    });
    
    yield* this.parseSSEResponse(response.data);
  }

  async *chatStream(request: VLLMChatRequest): AsyncGenerator<VLLMChatResponse> {
    const response = await this.httpClient.post('/v1/chat/completions', {
      ...request,
      stream: true
    }, { 
      responseType: 'stream',
      headers: { 'Accept': 'text/event-stream' }
    });
    
    yield* this.parseSSEResponse(response.data);
  }

  // Advanced vLLM features
  async batchGenerate(requests: VLLMGenerateRequest[]): Promise<VLLMGenerateResponse[]> {
    return this.httpClient.post('/v1/batch/completions', { requests });
  }

  async getModelInfo(): Promise<VLLMModelInfo> {
    const response = await this.httpClient.get('/v1/models');
    return response.data;
  }

  async getEngineStatus(): Promise<VLLMEngineStatus> {
    return this.httpClient.get('/v1/engine/status');
  }

  async getStats(): Promise<VLLMStats> {
    return this.httpClient.get('/v1/metrics');
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.httpClient.get('/health');
      return true;
    } catch {
      return false;
    }
  }

  // Server management
  async startEngine(config: VLLMEngineConfig): Promise<void> {
    return this.httpClient.post('/v1/engine/start', config);
  }

  async stopEngine(): Promise<void> {
    return this.httpClient.post('/v1/engine/stop');
  }

  async reloadModel(modelPath: string): Promise<void> {
    return this.httpClient.post('/v1/engine/reload', { model: modelPath });
  }
}
```

### 2. Model Manager (`model-manager.ts`)

```typescript
export interface VLLMModelInfo {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  max_model_len: number;
  architecture: string;
  dtype: string;
  quantization?: string;
  gpu_memory_utilization: number;
}

export interface VLLMEngineConfig {
  model: string;
  tokenizer?: string;
  tensor_parallel_size?: number;
  pipeline_parallel_size?: number;
  trust_remote_code?: boolean;
  dtype?: 'auto' | 'half' | 'float16' | 'bfloat16' | 'float32';
  quantization?: 'awq' | 'gptq' | 'squeezellm' | 'fp8';
  max_model_len?: number;
  gpu_memory_utilization?: number;
  swap_space?: number;
  enforce_eager?: boolean;
  max_context_len_to_capture?: number;
  disable_custom_all_reduce?: boolean;
}

export class VLLMModelManager {
  private client: VLLMClient;
  private currentModel?: VLLMModelInfo;
  private engineConfig?: VLLMEngineConfig;

  constructor(private config: LLMProviderConfig) {
    this.client = new VLLMClient(config);
  }

  async loadModel(modelPath: string, engineConfig?: Partial<VLLMEngineConfig>): Promise<void> {
    const fullConfig: VLLMEngineConfig = {
      model: modelPath,
      dtype: 'auto',
      gpu_memory_utilization: 0.9,
      tensor_parallel_size: this.detectGPUCount(),
      max_model_len: this.inferMaxModelLength(modelPath),
      trust_remote_code: false,
      ...engineConfig,
    };

    this.engineConfig = fullConfig;
    
    // Start or reload the engine with new model
    if (this.currentModel) {
      await this.client.reloadModel(modelPath);
    } else {
      await this.client.startEngine(fullConfig);
    }

    this.currentModel = await this.client.getModelInfo();
  }

  async unloadModel(): Promise<void> {
    if (this.currentModel) {
      await this.client.stopEngine();
      this.currentModel = undefined;
      this.engineConfig = undefined;
    }
  }

  async getLoadedModel(): Promise<VLLMModelInfo | undefined> {
    return this.currentModel;
  }

  async optimizeForHardware(): Promise<VLLMEngineConfig> {
    const gpuCount = this.detectGPUCount();
    const memoryInfo = await this.getGPUMemoryInfo();
    
    return {
      ...this.engineConfig,
      tensor_parallel_size: gpuCount,
      gpu_memory_utilization: this.calculateOptimalMemoryUtilization(memoryInfo),
      dtype: this.selectOptimalDtype(memoryInfo),
      quantization: this.shouldUseQuantization(memoryInfo) ? 'awq' : undefined,
    };
  }

  private detectGPUCount(): number {
    // Implementation depends on system detection
    // Could use nvidia-ml-py bindings or system calls
    return 1; // Default to single GPU
  }

  private async getGPUMemoryInfo(): Promise<GPUMemoryInfo> {
    // Detect available GPU memory
    return {
      totalMemory: 16 * 1024 * 1024 * 1024, // 16GB default
      availableMemory: 14 * 1024 * 1024 * 1024, // 14GB available
    };
  }

  private calculateOptimalMemoryUtilization(memoryInfo: GPUMemoryInfo): number {
    const ratio = memoryInfo.availableMemory / memoryInfo.totalMemory;
    return Math.min(0.95, ratio * 0.9); // Leave some headroom
  }

  private selectOptimalDtype(memoryInfo: GPUMemoryInfo): string {
    // Use bfloat16 for modern GPUs, float16 for older ones
    return memoryInfo.totalMemory > 8 * 1024 * 1024 * 1024 ? 'bfloat16' : 'float16';
  }

  private shouldUseQuantization(memoryInfo: GPUMemoryInfo): boolean {
    // Use quantization for GPUs with limited memory
    return memoryInfo.totalMemory < 16 * 1024 * 1024 * 1024;
  }

  private inferMaxModelLength(modelPath: string): number {
    // Infer context length from model name/config
    const contextPatterns: Record<string, number> = {
      'llama-3.1': 131072,  // 128K context
      'llama-3': 8192,      // 8K context  
      'mistral': 32768,     // 32K context
      'qwen': 131072,       // 128K context
      'yi': 200000,         // 200K context
    };

    for (const [pattern, length] of Object.entries(contextPatterns)) {
      if (modelPath.toLowerCase().includes(pattern)) {
        return length;
      }
    }

    return 8192; // Default context length
  }
}
```

### 3. Batch Manager (`batch-manager.ts`)

```typescript
export class VLLMBatchManager {
  private pendingRequests: Map<string, PendingRequest>;
  private batchTimer?: NodeJS.Timeout;
  private config: BatchConfig;

  constructor(config: LLMProviderConfig) {
    this.pendingRequests = new Map();
    this.config = {
      maxBatchSize: config.batchSize || 32,
      batchTimeout: config.batchTimeout || 50, // ms
      maxWaitTime: config.maxWaitTime || 1000, // ms
    };
  }

  async addRequest(request: VLLMRequest): Promise<VLLMResponse> {
    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();
      
      this.pendingRequests.set(requestId, {
        request: { ...request, id: requestId },
        resolve,
        reject,
        timestamp: Date.now(),
      });

      // Start batch processing if this is the first request
      if (this.pendingRequests.size === 1) {
        this.scheduleBatch();
      }

      // Force batch processing if we hit the batch size limit
      if (this.pendingRequests.size >= this.config.maxBatchSize) {
        this.processBatch();
      }
    });
  }

  private scheduleBatch(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    this.batchTimer = setTimeout(() => {
      this.processBatch();
    }, this.config.batchTimeout);
  }

  private async processBatch(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = undefined;
    }

    if (this.pendingRequests.size === 0) {
      return;
    }

    const batch = Array.from(this.pendingRequests.values());
    this.pendingRequests.clear();

    try {
      const requests = batch.map(item => item.request);
      const responses = await this.client.batchGenerate(requests);

      // Match responses to original requests
      batch.forEach((item, index) => {
        const response = responses[index];
        if (response.error) {
          item.reject(new Error(response.error));
        } else {
          item.resolve(response);
        }
      });
    } catch (error) {
      // Reject all requests in the batch
      batch.forEach(item => {
        item.reject(error);
      });
    }
  }

  private generateRequestId(): string {
    return `vllm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

### 4. Format Converter (`format-converter.ts`)

```typescript
export class VLLMFormatConverter implements FormatConverter {
  fromGeminiFormat(request: GenerateContentParameters): UnifiedGenerateRequest {
    return {
      messages: this.convertGeminiMessages(request.contents || []),
      model: request.model,
      systemInstruction: request.systemInstruction?.parts?.[0]?.text,
      maxTokens: request.generationConfig?.maxOutputTokens,
      temperature: request.generationConfig?.temperature,
      topP: request.generationConfig?.topP,
      topK: request.generationConfig?.topK,
      stream: false,
      tools: this.convertGeminiTools(request.tools || []),
      toolChoice: this.mapToolChoice(request.toolConfig?.functionCallingConfig?.mode),
    };
  }

  toProviderFormat(request: UnifiedGenerateRequest): VLLMChatRequest {
    return {
      model: request.model || this.getDefaultModel(),
      messages: this.convertToVLLMMessages(request.messages),
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      top_p: request.topP,
      top_k: request.topK,
      stream: request.stream || false,
      tools: request.tools ? this.convertToVLLMTools(request.tools) : undefined,
      tool_choice: this.mapToolChoiceToVLLM(request.toolChoice),
      // vLLM-specific parameters
      frequency_penalty: 0,
      presence_penalty: 0,
      repetition_penalty: 1.0,
      best_of: 1,
      use_beam_search: false,
      early_stopping: false,
      stop_token_ids: [],
      skip_special_tokens: true,
      spaces_between_special_tokens: true,
    };
  }

  fromProviderResponse(response: VLLMChatResponse): UnifiedGenerateResponse {
    const choice = response.choices?.[0];
    if (!choice) {
      throw new Error('No choices in vLLM response');
    }

    return {
      content: choice.message?.content || choice.text || '',
      finishReason: this.mapFinishReason(choice.finish_reason),
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        candidatesTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
      functionCalls: this.extractFunctionCalls(choice.message),
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

  private convertToVLLMMessages(messages: UnifiedMessage[]): VLLMMessage[] {
    return messages.map(msg => ({
      role: this.mapRole(msg.role),
      content: this.convertMessageContent(msg.content),
    }));
  }

  private convertToVLLMTools(tools: UnifiedTool[]): VLLMTool[] {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  private convertMessageContent(content: string | Array<any>): string | VLLMContent[] {
    if (typeof content === 'string') {
      return content;
    }

    // Handle multimodal content (text + images)
    return content.map(part => {
      if ('text' in part) {
        return { type: 'text', text: part.text };
      } else if ('inlineData' in part) {
        return {
          type: 'image_url',
          image_url: {
            url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
          },
        };
      }
      return { type: 'text', text: JSON.stringify(part) };
    });
  }

  private mapToolChoiceToVLLM(toolChoice?: 'auto' | 'none' | 'required'): any {
    switch (toolChoice) {
      case 'none':
        return 'none';
      case 'required':
        return 'auto'; // vLLM doesn't have required mode
      case 'auto':
      default:
        return 'auto';
    }
  }
}
```

## Configuration

### Provider Configuration

```typescript
interface VLLMProviderConfig extends LLMProviderConfig {
  provider: 'vllm';
  baseUrl?: string;                    // Default: http://localhost:8000
  modelPath?: string;                  // Local model path
  engineConfig?: VLLMEngineConfig;     // vLLM engine configuration
  batchSize?: number;                  // Batch size for requests
  batchTimeout?: number;               // Batch timeout in ms
  maxConcurrentRequests?: number;      // Concurrent request limit
  autoOptimize?: boolean;              // Auto-optimize for hardware
  tensorParallelSize?: number;         // Multi-GPU parallelization
  quantization?: 'awq' | 'gptq' | 'fp8';  // Model quantization
}
```

### CLI Integration

```bash
# Use vLLM provider
ouroboros-code --provider vllm "Hello"

# Specify vLLM server and model
ouroboros-code --provider vllm --model meta-llama/Llama-3.1-8B-Instruct --base-url http://localhost:8000 "Hello"

# Advanced vLLM options
ouroboros-code --provider vllm --model codellama/CodeLlama-13b-Instruct-hf \
  --vllm-tensor-parallel-size 2 \
  --vllm-quantization awq \
  --vllm-batch-size 16 "Write a Python function"

# Auto-optimize for current hardware
ouroboros-code --provider vllm --model mistralai/Mistral-7B-Instruct-v0.3 --vllm-auto-optimize "Hello"
```

### Settings Integration

```yaml
# .ouroboros/settings.yaml
providers:
  vllm:
    baseUrl: "http://localhost:8000"
    defaultModel: "meta-llama/Llama-3.1-8B-Instruct"
    modelPath: "/path/to/models"
    autoOptimize: true
    engineConfig:
      dtype: "bfloat16"
      gpu_memory_utilization: 0.9
      tensor_parallel_size: 2
      max_model_len: 32768
      quantization: "awq"
    batchConfig:
      maxBatchSize: 32
      batchTimeout: 50
      maxConcurrentRequests: 100
```

## Advanced Features

### Performance Optimization

```typescript
export class VLLMPerformanceOptimizer {
  async optimizeForWorkload(workloadProfile: WorkloadProfile): Promise<VLLMEngineConfig> {
    const baseConfig = await this.getBaseConfig();
    
    switch (workloadProfile.type) {
      case 'interactive':
        return {
          ...baseConfig,
          gpu_memory_utilization: 0.8, // Leave memory for responsiveness
          max_model_len: 8192,          // Shorter context for speed
          enforce_eager: true,          // Disable CUDA graphs for lower latency
        };
        
      case 'batch':
        return {
          ...baseConfig,
          gpu_memory_utilization: 0.95, // Maximize throughput
          max_model_len: 32768,          // Longer context
          enforce_eager: false,          // Enable CUDA graphs
        };
        
      case 'memory_constrained':
        return {
          ...baseConfig,
          dtype: 'float16',              // Use less memory
          quantization: 'awq',           // Enable quantization
          gpu_memory_utilization: 0.7,
          swap_space: 4,                 // Use CPU memory swap
        };
        
      default:
        return baseConfig;
    }
  }

  async enableSpeculativeDecoding(draftModel: string): Promise<void> {
    // Enable speculative decoding with smaller draft model
    const config = {
      speculative_model: draftModel,
      num_speculative_tokens: 5,
      speculative_draft_tensor_parallel_size: 1,
    };
    
    await this.modelManager.updateEngineConfig(config);
  }

  async configureForMultiGPU(gpuCount: number): Promise<void> {
    const config = {
      tensor_parallel_size: gpuCount,
      pipeline_parallel_size: 1,
      disable_custom_all_reduce: false,
    };
    
    await this.modelManager.updateEngineConfig(config);
  }
}
```

### Model Management

```typescript
export class VLLMModelRepository {
  private modelCache: Map<string, CachedModel>;
  
  async downloadModel(modelId: string, format: 'hf' | 'gguf' | 'awq' | 'gptq'): Promise<string> {
    const localPath = path.join(this.modelsDir, modelId.replace('/', '_'));
    
    if (fs.existsSync(localPath)) {
      return localPath;
    }

    console.log(`Downloading model ${modelId}...`);
    
    switch (format) {
      case 'hf':
        return this.downloadHuggingFaceModel(modelId, localPath);
      case 'awq':
        return this.downloadQuantizedModel(modelId, localPath, 'awq');
      case 'gptq':
        return this.downloadQuantizedModel(modelId, localPath, 'gptq');
      default:
        throw new Error(`Unsupported model format: ${format}`);
    }
  }

  async preloadModel(modelId: string): Promise<void> {
    const modelPath = await this.downloadModel(modelId, 'hf');
    await this.modelManager.loadModel(modelPath);
    
    // Keep model warm
    this.modelCache.set(modelId, {
      path: modelPath,
      lastUsed: Date.now(),
      isLoaded: true,
    });
  }

  async listAvailableModels(): Promise<VLLMModel[]> {
    return [
      {
        id: 'meta-llama/Llama-3.1-8B-Instruct',
        name: 'Llama 3.1 8B',
        size: '16GB',
        capabilities: ['text', 'tools'],
        contextLength: 131072,
      },
      {
        id: 'mistralai/Mistral-7B-Instruct-v0.3',
        name: 'Mistral 7B',
        size: '14GB',
        capabilities: ['text', 'tools'],
        contextLength: 32768,
      },
      {
        id: 'codellama/CodeLlama-13b-Instruct-hf',
        name: 'Code Llama 13B',
        size: '26GB',
        capabilities: ['code', 'text'],
        contextLength: 16384,
      },
    ];
  }
}
```

## Error Handling

### vLLM-Specific Errors

```typescript
export class VLLMError extends ProviderError {
  constructor(message: string, originalError?: Error) {
    super(message, LLMProvider.VLLM, originalError);
    this.name = 'VLLMError';
  }
}

export class VLLMEngineError extends VLLMError {
  constructor(message: string) {
    super(`vLLM engine error: ${message}`);
  }
}

export class VLLMModelLoadError extends VLLMError {
  constructor(modelPath: string, reason: string) {
    super(`Failed to load model ${modelPath}: ${reason}`);
  }
}

export class VLLMMemoryError extends VLLMError {
  constructor(requiredMemory: number, availableMemory: number) {
    super(`Insufficient GPU memory: required ${requiredMemory}GB, available ${availableMemory}GB`);
  }
}

export class VLLMBatchError extends VLLMError {
  constructor(batchSize: number, reason: string) {
    super(`Batch processing failed (size: ${batchSize}): ${reason}`);
  }
}
```

## Installation and Setup

### Prerequisites Check

```typescript
export class VLLMSetupValidator {
  async validateSetup(): Promise<SetupResult> {
    const result: SetupResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
    };

    // Check Python environment
    const pythonCheck = await this.checkPython();
    if (!pythonCheck.isValid) {
      result.errors.push('Python 3.8+ is required');
      result.suggestions.push('Install Python 3.8 or later');
    }

    // Check CUDA/ROCm
    const gpuCheck = await this.checkGPU();
    if (!gpuCheck.isValid) {
      result.warnings.push('No compatible GPU detected');
      result.suggestions.push('vLLM works best with NVIDIA GPUs (CUDA) or AMD GPUs (ROCm)');
    }

    // Check vLLM installation
    if (!(await this.isVLLMInstalled())) {
      result.errors.push('vLLM is not installed');
      result.suggestions.push('Install vLLM: `pip install vllm`');
    }

    // Check if vLLM server is running
    if (!(await this.isVLLMServerRunning())) {
      result.warnings.push('vLLM server is not running');
      result.suggestions.push('Start vLLM server: `python -m vllm.entrypoints.openai.api_server --model <model>`');
    }

    return result;
  }

  private async checkGPU(): Promise<{ isValid: boolean; info?: GPUInfo }> {
    // Check for NVIDIA GPU
    const nvidiaGPU = await this.detectNVIDIAGPU();
    if (nvidiaGPU) {
      return { isValid: true, info: nvidiaGPU };
    }

    // Check for AMD GPU  
    const amdGPU = await this.detectAMDGPU();
    if (amdGPU) {
      return { isValid: true, info: amdGPU };
    }

    return { isValid: false };
  }
}
```

## Integration Benefits

1. **High Performance**: PagedAttention, continuous batching, and GPU optimization
2. **Scalability**: Multi-GPU support and efficient memory management
3. **Flexibility**: Support for various model formats (HF, GGUF, AWQ, GPTQ)
4. **Advanced Features**: Speculative decoding, quantization, beam search
5. **OpenAI Compatibility**: Drop-in replacement for OpenAI API
6. **Production Ready**: Built for high-throughput serving

## Performance Benchmarks

### Throughput Comparison

```typescript
export class VLLMBenchmarks {
  async runThroughputBenchmark(): Promise<BenchmarkResults> {
    const results: BenchmarkResults = {
      provider: 'vllm',
      model: 'meta-llama/Llama-3.1-8B-Instruct',
      metrics: {},
    };

    // Sequential requests
    const sequentialTime = await this.measureSequentialRequests(100);
    results.metrics.sequential_rps = 100 / sequentialTime;

    // Batched requests
    const batchTime = await this.measureBatchRequests(100, 10);
    results.metrics.batch_rps = 100 / batchTime;

    // Concurrent requests
    const concurrentTime = await this.measureConcurrentRequests(100, 10);
    results.metrics.concurrent_rps = 100 / concurrentTime;

    return results;
  }
}
```

This design provides a comprehensive integration of vLLM as a high-performance local inference provider, leveraging its advanced features while maintaining compatibility with the Ouroboros multi-LLM architecture.