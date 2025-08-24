# Transformers.js Local Inference Provider Design

## Overview

This document outlines the design for integrating **Transformers.js** (Hugging Face Transformers for JavaScript/Node.js) as a browser and Node.js compatible local inference provider within the Ouroboros multi-LLM architecture. Transformers.js enables running transformer models directly in JavaScript environments without Python dependencies.

## Architecture Integration

### Provider Implementation

**Location**: `packages/core/src/providers/transformers/`

```typescript
// packages/core/src/providers/transformers/provider.ts
export class TransformersProvider extends BaseLLMProvider {
  private pipeline: Pipeline | null = null;
  private tokenizer: PreTrainedTokenizer | null = null;
  private model: PreTrainedModel | null = null;
  private modelManager: TransformersModelManager;
  private webWorkerPool?: TransformersWorkerPool;
  
  constructor(config: LLMProviderConfig) {
    super(config);
    this.modelManager = new TransformersModelManager(config);
    
    // Use web workers for better performance in browser environments
    if (typeof window !== 'undefined' && config.useWebWorkers) {
      this.webWorkerPool = new TransformersWorkerPool(config);
    }
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
  VLLM = 'vllm',
  TRANSFORMERS = 'transformers',  // JavaScript/Browser compatible provider
}

export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  [LLMProvider.GEMINI]: 'gemini-2.5-pro',
  [LLMProvider.OPENAI]: 'gpt-5',
  [LLMProvider.ANTHROPIC]: 'claude-4-1-opus-20250508',
  [LLMProvider.OLLAMA]: 'llama3.1:latest',
  [LLLProvider.VLLM]: 'meta-llama/Llama-3.1-8B-Instruct',
  [LLMProvider.TRANSFORMERS]: 'Xenova/gpt2',  // Default lightweight model
};

export const PROVIDER_CAPABILITIES: Record<LLMProvider, ProviderCapabilities> = {
  // ... existing providers
  [LLMProvider.TRANSFORMERS]: {
    supportsStreaming: true,        // Custom implementation
    supportsTools: false,          // Limited by model architecture
    supportsFunctionCalling: false, // Not supported in transformers.js
    supportsVision: true,          // Model-dependent (e.g., CLIP, ViT)
    supportsEmbedding: true,       // Feature extraction pipeline
    maxTokens: 1024,              // Limited by browser memory
    maxContextTokens: 2048,       // Model-dependent, browser-constrained
    supportsSystemMessage: false,  // Depends on model training
    supportsToolChoice: false,
    // Transformers.js specific capabilities
    transformersFeatures: {
      supportsBrowserExecution: true,
      supportsWebWorkers: true,
      supportsOffline: true,
      supportsONNX: true,
      supportsQuantization: true,
      supportsProgressiveLoading: true,
    },
    thinking: {
      supportsThinking: false,
      supportsThinkingStream: false,
    },
  },
};
```

## Core Components

### 1. Transformers Client (`transformers-client.ts`)

```typescript
import {
  pipeline,
  Pipeline,
  PreTrainedTokenizer,
  PreTrainedModel,
  env,
} from '@xenova/transformers';

export interface TransformersConfig {
  modelId: string;                    // Hugging Face model ID
  task: TransformersTask;             // Pipeline task type
  device: 'cpu' | 'gpu' | 'auto';    // Execution device
  dtype: 'fp32' | 'fp16' | 'int8';   // Model precision
  useWebWorkers?: boolean;           // Use web workers for inference
  cacheDir?: string;                 // Model cache directory
  progressCallback?: (progress: any) => void;
  quantized?: boolean;               // Use quantized models
  revision?: string;                 // Model revision/branch
}

export type TransformersTask = 
  | 'text-generation'
  | 'text2text-generation'
  | 'feature-extraction'
  | 'question-answering'
  | 'summarization'
  | 'translation'
  | 'fill-mask'
  | 'image-to-text'
  | 'image-classification'
  | 'zero-shot-classification';

export class TransformersClient {
  private config: TransformersConfig;
  private pipeline: Pipeline | null = null;
  private isLoading: boolean = false;
  private loadingPromise: Promise<void> | null = null;

  constructor(config: TransformersConfig) {
    this.config = config;
    
    // Configure transformers.js environment
    this.configureEnvironment();
  }

  async initialize(): Promise<void> {
    if (this.isLoading && this.loadingPromise) {
      return this.loadingPromise;
    }

    if (this.pipeline) {
      return;
    }

    this.isLoading = true;
    this.loadingPromise = this.loadModel();
    
    try {
      await this.loadingPromise;
    } finally {
      this.isLoading = false;
      this.loadingPromise = null;
    }
  }

  async generate(input: string, options?: GenerationOptions): Promise<GenerationResult> {
    await this.initialize();
    
    if (!this.pipeline) {
      throw new Error('Pipeline not initialized');
    }

    const result = await this.pipeline(input, {
      max_new_tokens: options?.maxTokens || 100,
      temperature: options?.temperature || 1.0,
      do_sample: options?.temperature !== undefined && options.temperature > 0,
      top_p: options?.topP,
      top_k: options?.topK,
      repetition_penalty: options?.repetitionPenalty || 1.0,
      ...options,
    });

    return this.processGenerationResult(result);
  }

  async *generateStream(
    input: string, 
    options?: GenerationOptions
  ): AsyncGenerator<GenerationResult> {
    await this.initialize();
    
    // Transformers.js doesn't support native streaming, so we simulate it
    const fullResult = await this.generate(input, options);
    const text = fullResult.generated_text;
    
    // Stream word by word with delays
    const words = text.split(' ');
    let currentText = '';
    
    for (const word of words) {
      currentText += (currentText ? ' ' : '') + word;
      
      yield {
        generated_text: currentText,
        isComplete: false,
      };
      
      // Small delay to simulate streaming
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    yield {
      generated_text: text,
      isComplete: true,
    };
  }

  async embed(input: string | string[]): Promise<EmbeddingResult> {
    // Switch to feature-extraction pipeline for embeddings
    const embedPipeline = await pipeline('feature-extraction', this.config.modelId, {
      quantized: this.config.quantized,
    });

    const embeddings = await embedPipeline(input, {
      pooling: 'mean',
      normalize: true,
    });

    return {
      embeddings: Array.isArray(input) ? embeddings : [embeddings],
      model: this.config.modelId,
      usage: this.estimateTokenUsage(input),
    };
  }

  async classify(input: string, labels: string[]): Promise<ClassificationResult> {
    const classifier = await pipeline('zero-shot-classification', this.config.modelId);
    
    const result = await classifier(input, labels);
    
    return {
      input,
      predictions: result.labels.map((label: string, index: number) => ({
        label,
        score: result.scores[index],
      })),
    };
  }

  async questionAnswer(context: string, question: string): Promise<QAResult> {
    const qa = await pipeline('question-answering', this.config.modelId);
    
    const result = await qa(question, context);
    
    return {
      answer: result.answer,
      score: result.score,
      start: result.start,
      end: result.end,
    };
  }

  private async loadModel(): Promise<void> {
    try {
      this.config.progressCallback?.({ status: 'Loading model...', progress: 0 });
      
      this.pipeline = await pipeline(this.config.task, this.config.modelId, {
        quantized: this.config.quantized,
        revision: this.config.revision,
        progress_callback: this.config.progressCallback,
      });
      
      this.config.progressCallback?.({ status: 'Model loaded', progress: 100 });
    } catch (error) {
      throw new TransformersError(`Failed to load model ${this.config.modelId}: ${error.message}`);
    }
  }

  private configureEnvironment(): void {
    // Set cache directory
    if (this.config.cacheDir) {
      env.cacheDir = this.config.cacheDir;
    }

    // Configure for local execution
    env.allowRemoteModels = true;
    env.allowLocalModels = true;
    
    // Configure backends
    if (typeof window !== 'undefined') {
      // Browser environment
      env.backends.onnx.wasm.numThreads = navigator.hardwareConcurrency || 4;
      env.backends.onnx.wasm.simd = true;
    } else {
      // Node.js environment
      env.backends.onnx.wasm.proxy = false;
    }
  }

  private processGenerationResult(result: any): GenerationResult {
    if (Array.isArray(result)) {
      return result[0]; // Return first result for batch generation
    }
    return result;
  }

  private estimateTokenUsage(input: string | string[]): TokenUsage {
    // Rough token estimation (transformers.js doesn't provide exact counts)
    const text = Array.isArray(input) ? input.join(' ') : input;
    const estimatedTokens = Math.ceil(text.length / 4); // Rough estimate
    
    return {
      promptTokens: estimatedTokens,
      totalTokens: estimatedTokens,
    };
  }

  async dispose(): Promise<void> {
    if (this.pipeline) {
      // Transformers.js doesn't have explicit disposal, but we can clear references
      this.pipeline = null;
    }
  }
}
```

### 2. Model Manager (`model-manager.ts`)

```typescript
export interface TransformersModel {
  id: string;
  name: string;
  task: TransformersTask;
  size: string;
  quantized: boolean;
  onnx: boolean;
  description: string;
  downloadUrl?: string;
}

export class TransformersModelManager {
  private modelCache: Map<string, CachedModel> = new Map();
  private modelRegistry: TransformersModel[] = [];

  constructor(private config: LLMProviderConfig) {
    this.initializeModelRegistry();
  }

  async loadModel(modelId: string, task: TransformersTask): Promise<TransformersClient> {
    const cacheKey = `${modelId}:${task}`;
    
    if (this.modelCache.has(cacheKey)) {
      const cached = this.modelCache.get(cacheKey)!;
      return cached.client;
    }

    const client = new TransformersClient({
      modelId,
      task,
      device: this.detectOptimalDevice(),
      dtype: this.selectOptimalDtype(),
      quantized: this.shouldUseQuantization(modelId),
      cacheDir: this.config.cacheDir,
      progressCallback: this.createProgressCallback(modelId),
    });

    await client.initialize();

    this.modelCache.set(cacheKey, {
      client,
      lastUsed: Date.now(),
      memoryUsage: await this.estimateMemoryUsage(modelId),
    });

    return client;
  }

  async listAvailableModels(): Promise<TransformersModel[]> {
    return this.modelRegistry.filter(model => this.isModelCompatible(model));
  }

  async suggestModels(task: TransformersTask): Promise<TransformersModel[]> {
    return this.modelRegistry.filter(model => 
      model.task === task && this.isModelCompatible(model)
    );
  }

  async downloadModel(modelId: string): Promise<void> {
    // Transformers.js handles downloading automatically, but we can pre-cache
    const tempClient = new TransformersClient({
      modelId,
      task: 'feature-extraction', // Use lightweight task for downloading
      device: 'cpu',
      dtype: 'fp32',
      quantized: false,
    });

    await tempClient.initialize();
    await tempClient.dispose();
  }

  private initializeModelRegistry(): void {
    this.modelRegistry = [
      // Text Generation Models
      {
        id: 'Xenova/gpt2',
        name: 'GPT-2',
        task: 'text-generation',
        size: '500MB',
        quantized: true,
        onnx: true,
        description: 'Small, fast text generation model',
      },
      {
        id: 'Xenova/distilgpt2',
        name: 'DistilGPT-2',
        task: 'text-generation',
        size: '250MB',
        quantized: true,
        onnx: true,
        description: 'Faster, smaller version of GPT-2',
      },
      {
        id: 'Xenova/LaMini-Flan-T5-248M',
        name: 'LaMini-T5-248M',
        task: 'text2text-generation',
        size: '248MB',
        quantized: true,
        onnx: true,
        description: 'Instruction-following model based on T5',
      },
      
      // Embedding Models
      {
        id: 'Xenova/all-MiniLM-L6-v2',
        name: 'all-MiniLM-L6-v2',
        task: 'feature-extraction',
        size: '90MB',
        quantized: true,
        onnx: true,
        description: 'Fast sentence embeddings model',
      },
      {
        id: 'Xenova/bge-small-en-v1.5',
        name: 'BGE Small EN',
        task: 'feature-extraction',
        size: '120MB',
        quantized: true,
        onnx: true,
        description: 'High-quality English embeddings',
      },

      // Vision Models
      {
        id: 'Xenova/vit-base-patch16-224',
        name: 'Vision Transformer Base',
        task: 'image-classification',
        size: '330MB',
        quantized: true,
        onnx: true,
        description: 'Image classification with Vision Transformer',
      },
      {
        id: 'Xenova/clip-vit-base-patch32',
        name: 'CLIP ViT-Base',
        task: 'image-to-text',
        size: '600MB',
        quantized: true,
        onnx: true,
        description: 'Multimodal image and text understanding',
      },

      // Specialized Models
      {
        id: 'Xenova/distilbert-base-cased-distilled-squad',
        name: 'DistilBERT QA',
        task: 'question-answering',
        size: '250MB',
        quantized: true,
        onnx: true,
        description: 'Question answering model',
      },
    ];
  }

  private isModelCompatible(model: TransformersModel): boolean {
    // Check browser memory constraints
    if (typeof window !== 'undefined') {
      const memoryInfo = (performance as any).memory;
      if (memoryInfo && memoryInfo.jsHeapSizeLimit) {
        const availableMemory = memoryInfo.jsHeapSizeLimit - memoryInfo.usedJSHeapSize;
        const modelSizeMB = parseInt(model.size);
        return availableMemory > modelSizeMB * 1024 * 1024 * 2; // 2x safety margin
      }
    }

    return model.onnx; // Prefer ONNX models for better compatibility
  }

  private detectOptimalDevice(): 'cpu' | 'gpu' | 'auto' {
    if (typeof window !== 'undefined') {
      // Browser environment - check for WebGL
      const canvas = document.createElement('canvas');
      const webgl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      return webgl ? 'gpu' : 'cpu';
    }
    
    return 'cpu'; // Node.js environment
  }

  private selectOptimalDtype(): 'fp32' | 'fp16' | 'int8' {
    if (typeof window !== 'undefined') {
      // Browser environment - use quantized models for memory efficiency
      return 'int8';
    }
    
    return 'fp32'; // Node.js environment
  }

  private shouldUseQuantization(modelId: string): boolean {
    // Always prefer quantized models for better performance and memory usage
    return true;
  }

  private createProgressCallback(modelId: string): (progress: any) => void {
    return (progress) => {
      console.log(`Loading ${modelId}: ${progress.status} - ${Math.round(progress.progress || 0)}%`);
    };
  }

  private async estimateMemoryUsage(modelId: string): Promise<number> {
    // Rough estimation based on model size
    const model = this.modelRegistry.find(m => m.id === modelId);
    if (model) {
      return parseInt(model.size) * 1024 * 1024; // Convert MB to bytes
    }
    return 100 * 1024 * 1024; // Default 100MB
  }
}
```

### 3. Web Worker Integration (`worker-pool.ts`)

```typescript
export class TransformersWorkerPool {
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private busyWorkers: Set<Worker> = new Set();
  private requestQueue: QueuedRequest[] = [];

  constructor(private config: TransformersWorkerConfig) {
    this.initializeWorkers();
  }

  async process(request: WorkerRequest): Promise<WorkerResponse> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        request,
        resolve,
        reject,
        timestamp: Date.now(),
      });

      this.processQueue();
    });
  }

  private initializeWorkers(): void {
    const workerCount = this.config.maxWorkers || navigator.hardwareConcurrency || 4;
    
    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(new URL('./transformers-worker.js', import.meta.url));
      
      worker.onmessage = (event) => {
        this.handleWorkerMessage(worker, event);
      };
      
      worker.onerror = (error) => {
        console.error('Worker error:', error);
        this.handleWorkerError(worker, error);
      };

      this.workers.push(worker);
      this.availableWorkers.push(worker);
    }
  }

  private processQueue(): void {
    while (this.requestQueue.length > 0 && this.availableWorkers.length > 0) {
      const queuedRequest = this.requestQueue.shift()!;
      const worker = this.availableWorkers.pop()!;

      this.busyWorkers.add(worker);
      
      // Store the promise resolvers on the worker for later use
      (worker as any)._resolve = queuedRequest.resolve;
      (worker as any)._reject = queuedRequest.reject;

      worker.postMessage(queuedRequest.request);
    }
  }

  private handleWorkerMessage(worker: Worker, event: MessageEvent): void {
    const response = event.data as WorkerResponse;
    
    if (response.error) {
      (worker as any)._reject?.(new Error(response.error));
    } else {
      (worker as any)._resolve?.(response);
    }

    // Return worker to available pool
    this.busyWorkers.delete(worker);
    this.availableWorkers.push(worker);
    
    // Clear promise resolvers
    delete (worker as any)._resolve;
    delete (worker as any)._reject;

    // Process next request if any
    this.processQueue();
  }

  private handleWorkerError(worker: Worker, error: ErrorEvent): void {
    (worker as any)._reject?.(error);
    
    // Remove worker from all pools
    this.busyWorkers.delete(worker);
    const index = this.availableWorkers.indexOf(worker);
    if (index > -1) {
      this.availableWorkers.splice(index, 1);
    }

    // Create new worker to replace the failed one
    const newWorker = new Worker(new URL('./transformers-worker.js', import.meta.url));
    newWorker.onmessage = (event) => this.handleWorkerMessage(newWorker, event);
    newWorker.onerror = (error) => this.handleWorkerError(newWorker, error);
    
    this.workers.push(newWorker);
    this.availableWorkers.push(newWorker);
  }

  async dispose(): Promise<void> {
    // Terminate all workers
    for (const worker of this.workers) {
      worker.terminate();
    }
    
    this.workers.length = 0;
    this.availableWorkers.length = 0;
    this.busyWorkers.clear();
    this.requestQueue.length = 0;
  }
}
```

### 4. Format Converter (`format-converter.ts`)

```typescript
export class TransformersFormatConverter implements FormatConverter {
  fromGeminiFormat(request: GenerateContentParameters): UnifiedGenerateRequest {
    const messages = this.convertGeminiMessages(request.contents || []);
    const prompt = this.messagesToPrompt(messages);

    return {
      messages,
      model: request.model,
      systemInstruction: request.systemInstruction?.parts?.[0]?.text,
      maxTokens: request.generationConfig?.maxOutputTokens || 100,
      temperature: request.generationConfig?.temperature || 1.0,
      topP: request.generationConfig?.topP,
      topK: request.generationConfig?.topK,
      stream: false, // Custom streaming implementation
      // Transformers.js specific
      prompt,
    };
  }

  toProviderFormat(request: UnifiedGenerateRequest): TransformersRequest {
    return {
      input: request.prompt || this.messagesToPrompt(request.messages),
      max_new_tokens: request.maxTokens || 100,
      temperature: request.temperature || 1.0,
      top_p: request.topP,
      top_k: request.topK,
      repetition_penalty: 1.1,
      do_sample: (request.temperature || 1.0) > 0,
    };
  }

  fromProviderResponse(response: TransformersResponse): UnifiedGenerateResponse {
    return {
      content: response.generated_text || response.text || '',
      finishReason: response.isComplete ? 'stop' : 'length',
      usage: {
        promptTokens: response.promptTokens || 0,
        candidatesTokens: response.generatedTokens || 0,
        totalTokens: (response.promptTokens || 0) + (response.generatedTokens || 0),
      },
    };
  }

  toGeminiFormat(response: UnifiedGenerateResponse): GenerateContentResponse {
    return {
      candidates: [{
        content: {
          role: 'model',
          parts: [{ text: response.content }],
        },
        finishReason: response.finishReason,
      }],
      usageMetadata: response.usage,
    };
  }

  private messagesToPrompt(messages: UnifiedMessage[]): string {
    // Convert messages to a single prompt string
    return messages.map(msg => {
      const role = msg.role === 'user' ? 'Human' : 'Assistant';
      const content = typeof msg.content === 'string' ? 
        msg.content : 
        this.flattenContent(msg.content);
      return `${role}: ${content}`;
    }).join('\n\n');
  }

  private flattenContent(content: Array<any>): string {
    return content.map(part => {
      if ('text' in part) return part.text;
      if ('inlineData' in part) return '[Image]';
      return JSON.stringify(part);
    }).join(' ');
  }
}
```

## Configuration

### Provider Configuration

```typescript
interface TransformersProviderConfig extends LLMProviderConfig {
  provider: 'transformers';
  modelId?: string;                   // Hugging Face model ID
  task?: TransformersTask;           // Pipeline task
  cacheDir?: string;                 // Model cache directory
  useWebWorkers?: boolean;           // Use web workers (browser)
  maxWorkers?: number;               // Max web workers
  device?: 'cpu' | 'gpu' | 'auto';  // Execution device
  quantized?: boolean;               // Use quantized models
  offlineMode?: boolean;             // Offline-only mode
}
```

### CLI Integration

```bash
# Use Transformers.js provider
ouroboros-code --provider transformers "Hello"

# Specify model and task
ouroboros-code --provider transformers --model Xenova/gpt2 --transformers-task text-generation "Hello"

# Browser-optimized configuration
ouroboros-code --provider transformers --model Xenova/distilgpt2 --transformers-quantized --transformers-web-workers "Hello"

# Offline mode
ouroboros-code --provider transformers --transformers-offline --model Xenova/LaMini-Flan-T5-248M "Explain quantum computing"
```

### Settings Integration

```yaml
# .ouroboros/settings.yaml
providers:
  transformers:
    defaultModel: "Xenova/gpt2"
    task: "text-generation"
    cacheDir: "./models/transformers"
    useWebWorkers: true
    maxWorkers: 4
    device: "auto"
    quantized: true
    offlineMode: false
    models:
      text: "Xenova/LaMini-Flan-T5-248M"
      embeddings: "Xenova/all-MiniLM-L6-v2"
      vision: "Xenova/vit-base-patch16-224"
```

## Browser Integration

### Progressive Web App Support

```typescript
export class TransformersPWAManager {
  async cacheModelsForOffline(models: string[]): Promise<void> {
    const cache = await caches.open('transformers-models');
    
    for (const modelId of models) {
      const modelUrls = await this.getModelUrls(modelId);
      await cache.addAll(modelUrls);
    }
  }

  async isModelCached(modelId: string): Promise<boolean> {
    const cache = await caches.open('transformers-models');
    const modelUrls = await this.getModelUrls(modelId);
    
    for (const url of modelUrls) {
      const response = await cache.match(url);
      if (!response) return false;
    }
    
    return true;
  }

  private async getModelUrls(modelId: string): Promise<string[]> {
    const baseUrl = `https://huggingface.co/${modelId}/resolve/main`;
    return [
      `${baseUrl}/config.json`,
      `${baseUrl}/tokenizer.json`,
      `${baseUrl}/onnx/model.onnx`,
      `${baseUrl}/onnx/model_quantized.onnx`,
    ];
  }
}
```

### Memory Management

```typescript
export class TransformersMemoryManager {
  private memoryThreshold = 0.8; // 80% of available memory
  private modelCache = new Map<string, { model: any; lastUsed: number; size: number }>();

  async manageMemory(): Promise<void> {
    if (!this.isMemoryPressure()) {
      return;
    }

    // Sort models by last used time
    const sortedModels = Array.from(this.modelCache.entries())
      .sort(([, a], [, b]) => a.lastUsed - b.lastUsed);

    // Remove least recently used models
    for (const [modelId, cached] of sortedModels) {
      await this.unloadModel(modelId);
      
      if (!this.isMemoryPressure()) {
        break;
      }
    }
  }

  private isMemoryPressure(): boolean {
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      const memoryInfo = (performance as any).memory;
      const memoryUsage = memoryInfo.usedJSHeapSize / memoryInfo.jsHeapSizeLimit;
      return memoryUsage > this.memoryThreshold;
    }
    
    return false; // Can't determine, assume no pressure
  }

  private async unloadModel(modelId: string): Promise<void> {
    const cached = this.modelCache.get(modelId);
    if (cached) {
      // Clear model references to allow garbage collection
      cached.model = null;
      this.modelCache.delete(modelId);
      
      // Force garbage collection if available
      if (typeof window !== 'undefined' && (window as any).gc) {
        (window as any).gc();
      }
    }
  }
}
```

## Error Handling

### Transformers.js-Specific Errors

```typescript
export class TransformersError extends ProviderError {
  constructor(message: string, originalError?: Error) {
    super(message, LLMProvider.TRANSFORMERS, originalError);
    this.name = 'TransformersError';
  }
}

export class TransformersModelLoadError extends TransformersError {
  constructor(modelId: string, reason: string) {
    super(`Failed to load model ${modelId}: ${reason}`);
  }
}

export class TransformersMemoryError extends TransformersError {
  constructor(requiredMemory: number, availableMemory: number) {
    super(`Insufficient memory: required ${requiredMemory}MB, available ${availableMemory}MB`);
  }
}

export class TransformersCompatibilityError extends TransformersError {
  constructor(feature: string, environment: string) {
    super(`Feature ${feature} is not supported in ${environment} environment`);
  }
}

export class TransformersOfflineError extends TransformersError {
  constructor(modelId: string) {
    super(`Model ${modelId} is not available offline. Download required.`);
  }
}
```

## Installation and Setup

### Prerequisites Check

```typescript
export class TransformersSetupValidator {
  async validateSetup(): Promise<SetupResult> {
    const result: SetupResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
    };

    // Check Node.js version (if in Node.js environment)
    if (typeof window === 'undefined') {
      const nodeVersion = process.version;
      const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
      
      if (majorVersion < 14) {
        result.errors.push('Node.js 14+ is required');
        result.suggestions.push('Upgrade to Node.js 14 or later');
      }
    }

    // Check browser compatibility (if in browser)
    if (typeof window !== 'undefined') {
      if (!window.WebAssembly) {
        result.errors.push('WebAssembly is not supported');
        result.suggestions.push('Use a modern browser that supports WebAssembly');
      }

      if (!window.Worker) {
        result.warnings.push('Web Workers are not supported');
        result.suggestions.push('Performance may be limited without Web Worker support');
      }
    }

    // Check available memory
    const memoryCheck = this.checkMemory();
    if (!memoryCheck.isValid) {
      result.warnings.push('Limited memory detected');
      result.suggestions.push('Consider using smaller quantized models');
    }

    // Check @xenova/transformers installation
    try {
      await import('@xenova/transformers');
    } catch (error) {
      result.errors.push('@xenova/transformers is not installed');
      result.suggestions.push('Install with: npm install @xenova/transformers');
    }

    return result;
  }

  private checkMemory(): { isValid: boolean; availableMemory?: number } {
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      const memoryInfo = (performance as any).memory;
      const availableMemory = memoryInfo.jsHeapSizeLimit / (1024 * 1024); // MB
      
      return {
        isValid: availableMemory > 512, // At least 512MB
        availableMemory,
      };
    }

    // Can't determine memory, assume it's fine
    return { isValid: true };
  }
}
```

## Performance Considerations

### Optimization Strategies

```typescript
export class TransformersOptimizer {
  optimizeForEnvironment(environment: 'browser' | 'nodejs'): TransformersConfig {
    const baseConfig: TransformersConfig = {
      modelId: 'Xenova/distilgpt2',
      task: 'text-generation',
      device: 'auto',
      dtype: 'int8',
      quantized: true,
    };

    if (environment === 'browser') {
      return {
        ...baseConfig,
        useWebWorkers: true,
        device: 'gpu', // Use WebGL if available
        dtype: 'int8', // Quantized for memory efficiency
      };
    } else {
      return {
        ...baseConfig,
        useWebWorkers: false,
        device: 'cpu',
        dtype: 'fp32', // Better quality in Node.js
      };
    }
  }

  async benchmarkModel(modelId: string): Promise<BenchmarkResult> {
    const startTime = performance.now();
    
    const client = new TransformersClient({
      modelId,
      task: 'text-generation',
      device: 'auto',
      dtype: 'int8',
      quantized: true,
    });

    await client.initialize();
    const loadTime = performance.now() - startTime;

    const inferenceStart = performance.now();
    await client.generate('Hello world', { maxTokens: 50 });
    const inferenceTime = performance.now() - inferenceStart;

    return {
      modelId,
      loadTime,
      inferenceTime,
      memoryUsage: this.getMemoryUsage(),
    };
  }

  private getMemoryUsage(): number {
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      return (performance as any).memory.usedJSHeapSize;
    }
    return 0;
  }
}
```

## Integration Benefits

1. **Zero Dependencies**: No Python or external services required
2. **Browser Native**: Runs directly in browsers without servers
3. **Offline Capable**: Complete offline operation once models are cached
4. **Progressive Loading**: Stream model loading with progress indicators
5. **Memory Efficient**: Quantized models and automatic memory management
6. **Cross-Platform**: Identical code works in browser and Node.js
7. **Privacy-First**: All processing happens locally

## Use Cases

### Browser-Based AI Assistant

```typescript
export class BrowserAIAssistant {
  private provider: TransformersProvider;

  async initialize(): Promise<void> {
    this.provider = new TransformersProvider({
      provider: LLMProvider.TRANSFORMERS,
      model: 'Xenova/LaMini-Flan-T5-248M',
      useWebWorkers: true,
      quantized: true,
    });

    await this.provider.initialize();
  }

  async chat(message: string): Promise<string> {
    const response = await this.provider.generateContent({
      model: 'Xenova/LaMini-Flan-T5-248M',
      contents: [{
        role: 'user',
        parts: [{ text: message }],
      }],
    }, 'browser-chat');

    return response.candidates[0].content.parts[0].text || '';
  }

  async embed(text: string): Promise<number[]> {
    // Switch to embedding model
    const embedProvider = new TransformersProvider({
      provider: LLMProvider.TRANSFORMERS,
      model: 'Xenova/all-MiniLM-L6-v2',
      task: 'feature-extraction',
    });

    await embedProvider.initialize();
    
    const result = await embedProvider.embed(text);
    return result.embeddings[0];
  }
}
```

This design provides a comprehensive integration of Transformers.js as a browser and Node.js compatible local inference provider, enabling privacy-first AI applications that work entirely offline.