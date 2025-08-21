# Extending the Multi-LLM Provider System

## 🎯 Overview

This guide provides comprehensive instructions for extending the Multi-LLM Provider system with new providers, custom tools, and enhanced functionality. It covers the architecture, implementation patterns, and best practices for contributing to the system.

## 🏗️ Provider Extension Architecture

### Core Extension Points

#### 1. Provider Interface Implementation

All providers must implement the core `LLMProvider` interface:

```typescript
export interface LLMProvider {
  readonly providerId: ProviderType;
  readonly capabilities: ProviderCapabilities;
  readonly configuration: ProviderConfiguration;

  // Core generation methods
  generateContent(
    prompt: UnifiedPrompt,
    options?: GenerationOptions,
  ): Promise<UnifiedResponse>;
  streamContent(
    prompt: UnifiedPrompt,
    options?: GenerationOptions,
  ): AsyncIterable<UnifiedStreamChunk>;

  // Tool execution
  executeToolCall(
    toolCall: UnifiedToolCall,
    context: ToolExecutionContext,
  ): Promise<UnifiedToolResult>;
  getAvailableTools(): Tool[];

  // Configuration and lifecycle
  validateConfiguration(): Promise<ValidationResult>;
  updateConfiguration(config: Partial<ProviderConfiguration>): void;
  initialize(): Promise<void>;
  dispose(): Promise<void>;

  // Health and status
  getHealthStatus(): Promise<HealthStatus>;
  getUsageMetrics(): Promise<UsageMetrics>;
}
```

#### 2. Format Conversion System

Each provider needs converters for translating between the unified format and provider-specific formats:

```typescript
export interface FormatConverter<T, U> {
  toUnified(providerFormat: T): U;
  fromUnified(unifiedFormat: U): T;
  validate(data: T | U): ValidationResult;
}
```

#### 3. Tool Adapter Pattern

Providers implement tool adapters to ensure consistent tool behavior:

```typescript
export interface ToolAdapter {
  adaptToolCall(toolCall: UnifiedToolCall): ProviderSpecificToolCall;
  adaptToolResult(result: ProviderSpecificToolResult): UnifiedToolResult;
  getSupportedTools(): string[];
}
```

## 🚀 Adding a New Provider

### Step 1: Define Provider Types

#### Add Provider to Enum

```typescript
// packages/core/src/providers/types.ts
export enum ProviderType {
  GEMINI = 'gemini',
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  COHERE = 'cohere', // New provider
  HUGGINGFACE = 'huggingface', // Another new provider
}
```

#### Define Provider Configuration

```typescript
// packages/core/src/providers/cohere/types.ts
export interface CohereProviderConfig extends BaseProviderConfig {
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  topK?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
  returnLikelihoods?: 'GENERATION' | 'ALL' | 'NONE';
}

export interface CohereCapabilities extends ProviderCapabilities {
  streaming: true;
  toolExecution: true;
  multimodal: false;
  vision: false;
  maxTokens: 4096;
  contextWindow: 128000;
  supportedFormats: ['text'];
}
```

### Step 2: Implement Format Converters

#### Prompt Converter

```typescript
// packages/core/src/providers/cohere/converter.ts
export class CoherePromptConverter
  implements FormatConverter<CohereMessage[], UnifiedPrompt>
{
  toUnified(cohereMessages: CohereMessage[]): UnifiedPrompt {
    // Convert Cohere message format to unified format
    const lastMessage = cohereMessages[cohereMessages.length - 1];

    return {
      text: lastMessage.message,
      role: this.mapRole(lastMessage.role),
      context: {
        conversationId: 'default',
        messageHistory: cohereMessages.map(this.convertMessage),
        sessionMetadata: {},
      },
    };
  }

  fromUnified(prompt: UnifiedPrompt): CohereMessage[] {
    // Convert unified format to Cohere messages
    const messages: CohereMessage[] = [];

    if (prompt.context?.messageHistory) {
      messages.push(...prompt.context.messageHistory.map(this.convertToCohere));
    }

    messages.push({
      role: this.mapToCohereRole(prompt.role || 'user'),
      message: prompt.text,
    });

    return messages;
  }

  private mapRole(cohereRole: string): 'user' | 'assistant' | 'system' {
    const roleMap: Record<string, 'user' | 'assistant' | 'system'> = {
      USER: 'user',
      CHATBOT: 'assistant',
      SYSTEM: 'system',
    };
    return roleMap[cohereRole] || 'user';
  }

  private mapToCohereRole(unifiedRole: string): string {
    const roleMap: Record<string, string> = {
      user: 'USER',
      assistant: 'CHATBOT',
      system: 'SYSTEM',
    };
    return roleMap[unifiedRole] || 'USER';
  }

  validate(data: CohereMessage[] | UnifiedPrompt): ValidationResult {
    // Implement validation logic
    return { valid: true, errors: [] };
  }
}
```

#### Response Converter

```typescript
export class CohereResponseConverter
  implements FormatConverter<CohereResponse, UnifiedResponse>
{
  toUnified(cohereResponse: CohereResponse): UnifiedResponse {
    return {
      content: cohereResponse.text,
      finishReason: this.mapFinishReason(cohereResponse.finish_reason),
      usage: {
        promptTokens: cohereResponse.meta?.tokens?.input_tokens || 0,
        completionTokens: cohereResponse.meta?.tokens?.output_tokens || 0,
        totalTokens:
          (cohereResponse.meta?.tokens?.input_tokens || 0) +
          (cohereResponse.meta?.tokens?.output_tokens || 0),
      },
      latency: {
        requestTime: 0, // Set by provider
        responseTime: 0, // Set by provider
        processingTime: 0, // Set by provider
      },
      provider: ProviderType.COHERE,
      model: cohereResponse.meta?.model || 'unknown',
      requestId: cohereResponse.generation_id || 'unknown',
    };
  }

  fromUnified(response: UnifiedResponse): CohereResponse {
    // Usually not needed, but can be implemented for testing
    throw new Error('Converting from unified to Cohere response not supported');
  }

  private mapFinishReason(cohereReason?: string): FinishReason {
    const reasonMap: Record<string, FinishReason> = {
      COMPLETE: 'stop',
      MAX_TOKENS: 'length',
      ERROR: 'error',
    };
    return reasonMap[cohereReason || ''] || 'stop';
  }

  validate(data: CohereResponse | UnifiedResponse): ValidationResult {
    return { valid: true, errors: [] };
  }
}
```

### Step 3: Implement Tool Adapter

```typescript
// packages/core/src/providers/cohere/tool-adapter.ts
export class CohereToolAdapter implements ToolAdapter {
  private supportedTools = [
    'read_file',
    'write_file',
    'web_search',
    'shell_command',
  ];

  adaptToolCall(toolCall: UnifiedToolCall): CohereToolCall {
    return {
      name: toolCall.name,
      parameters: this.adaptParameters(toolCall.name, toolCall.parameters),
    };
  }

  adaptToolResult(result: CohereToolResult): UnifiedToolResult {
    return {
      toolCallId: result.call_id || 'unknown',
      success: !result.error,
      content: result.output || '',
      data: result.data,
      error: result.error
        ? {
            code: 'TOOL_ERROR',
            message: result.error,
            details: result,
            recoverable: true,
          }
        : undefined,
      executionTime: 0, // Set by tool manager
      provider: ProviderType.COHERE,
      timestamp: new Date(),
    };
  }

  getSupportedTools(): string[] {
    return [...this.supportedTools];
  }

  private adaptParameters(
    toolName: string,
    parameters: Record<string, any>,
  ): Record<string, any> {
    // Cohere-specific parameter adaptations
    switch (toolName) {
      case 'web_search':
        return {
          query: parameters.query,
          num_results: parameters.num_results || 5,
        };
      case 'read_file':
        return {
          filename: parameters.path || parameters.file_path,
        };
      default:
        return parameters;
    }
  }
}
```

### Step 4: Implement Core Provider

```typescript
// packages/core/src/providers/cohere/provider.ts
export class CohereProvider implements LLMProvider {
  readonly providerId = ProviderType.COHERE;
  readonly capabilities: CohereCapabilities;
  readonly configuration: CohereProviderConfig;

  private client: CohereClient;
  private promptConverter: CoherePromptConverter;
  private responseConverter: CohereResponseConverter;
  private toolAdapter: CohereToolAdapter;

  constructor(config: CohereProviderConfig) {
    this.configuration = config;
    this.capabilities = {
      streaming: true,
      toolExecution: true,
      multimodal: false,
      vision: false,
      maxTokens: 4096,
      contextWindow: 128000,
      supportedFormats: ['text'],
      batchProcessing: false,
      contextPersistence: true,
      audioInput: false,
      audioOutput: false,
      parallelToolExecution: false,
      customTools: true,
      maxRequestsPerMinute: 1000,
      supportedInputFormats: ['text/plain'],
      supportedOutputFormats: ['text/plain'],
      functionCalling: true,
      codeExecution: false,
      webBrowsing: false,
    };

    this.client = new CohereClient({
      apiKey: config.apiKey,
    });

    this.promptConverter = new CoherePromptConverter();
    this.responseConverter = new CohereResponseConverter();
    this.toolAdapter = new CohereToolAdapter();
  }

  async initialize(): Promise<void> {
    // Validate configuration and test connection
    const validation = await this.validateConfiguration();
    if (!validation.valid) {
      throw new Error(
        `Cohere provider initialization failed: ${validation.errors.join(', ')}`,
      );
    }
  }

  async dispose(): Promise<void> {
    // Cleanup resources
    // Cohere client doesn't require explicit disposal
  }

  async generateContent(
    prompt: UnifiedPrompt,
    options?: GenerationOptions,
  ): Promise<UnifiedResponse> {
    const startTime = Date.now();

    try {
      const cohereMessages = this.promptConverter.fromUnified(prompt);
      const tools = this.getToolsForPrompt(prompt);

      const response = await this.client.chat({
        model: this.configuration.model,
        message: prompt.text,
        chat_history: cohereMessages.slice(0, -1),
        max_tokens: options?.maxTokens || this.configuration.maxTokens,
        temperature: options?.temperature || this.configuration.temperature,
        k: this.configuration.topK,
        p: this.configuration.topP,
        frequency_penalty: this.configuration.frequencyPenalty,
        presence_penalty: this.configuration.presencePenalty,
        stop_sequences: this.configuration.stopSequences,
        tools: tools.length > 0 ? tools : undefined,
      });

      const unifiedResponse = this.responseConverter.toUnified(response);

      // Add timing information
      const endTime = Date.now();
      unifiedResponse.latency = {
        requestTime: startTime,
        responseTime: endTime - startTime,
        processingTime: endTime - startTime,
      };

      // Handle tool calls if present
      if (response.tool_calls && response.tool_calls.length > 0) {
        unifiedResponse.toolCalls = response.tool_calls.map((call) => ({
          id: call.call_id,
          name: call.name,
          parameters: call.parameters,
          provider: ProviderType.COHERE,
          timestamp: new Date(),
          requestId: unifiedResponse.requestId,
        }));
      }

      return unifiedResponse;
    } catch (error) {
      throw new ProviderError(
        `Cohere generation failed: ${error.message}`,
        ProviderType.COHERE,
        'GENERATION_ERROR',
        true,
        error,
      );
    }
  }

  async *streamContent(
    prompt: UnifiedPrompt,
    options?: GenerationOptions,
  ): AsyncIterable<UnifiedStreamChunk> {
    const cohereMessages = this.promptConverter.fromUnified(prompt);
    const tools = this.getToolsForPrompt(prompt);

    const stream = await this.client.chatStream({
      model: this.configuration.model,
      message: prompt.text,
      chat_history: cohereMessages.slice(0, -1),
      max_tokens: options?.maxTokens || this.configuration.maxTokens,
      temperature: options?.temperature || this.configuration.temperature,
      tools: tools.length > 0 ? tools : undefined,
    });

    let sequenceNumber = 0;

    for await (const chunk of stream) {
      yield {
        id: chunk.generation_id || 'unknown',
        provider: ProviderType.COHERE,
        type: this.mapStreamChunkType(chunk),
        content: chunk.text,
        delta: chunk.text,
        timestamp: new Date(),
        sequenceNumber: sequenceNumber++,
      };
    }
  }

  async executeToolCall(
    toolCall: UnifiedToolCall,
    context: ToolExecutionContext,
  ): Promise<UnifiedToolResult> {
    // Tool execution is handled by the unified tool manager
    // This method adapts the call for Cohere-specific requirements
    const cohereToolCall = this.toolAdapter.adaptToolCall(toolCall);

    // Execute through tool manager (implementation depends on tool)
    // This is typically handled by the BuiltinToolManager
    throw new Error('Tool execution should be handled by BuiltinToolManager');
  }

  getAvailableTools(): Tool[] {
    return this.toolAdapter.getSupportedTools().map((toolName) => ({
      name: toolName,
      description: `${toolName} tool adapted for Cohere`,
      category: this.getToolCategory(toolName),
      parameters: this.getToolParameters(toolName),
      supportedProviders: [ProviderType.COHERE],
      requiresConfirmation: this.getToolConfirmationRequirement(toolName),
      securityLevel: this.getToolSecurityLevel(toolName),
      execute: async () => {
        throw new Error('Use BuiltinToolManager');
      },
      validateParameters: () => ({ valid: true, errors: [] }),
    }));
  }

  async validateConfiguration(): Promise<ValidationResult> {
    const errors: string[] = [];

    // Validate API key
    if (!this.configuration.apiKey) {
      errors.push('API key is required');
    } else if (!this.configuration.apiKey.startsWith('co-')) {
      errors.push('Invalid Cohere API key format');
    }

    // Validate model
    if (!this.configuration.model) {
      errors.push('Model is required');
    }

    // Test API connection
    try {
      await this.client.chat({
        model: this.configuration.model,
        message: 'Test connection',
        max_tokens: 1,
      });
    } catch (error) {
      errors.push(`API connection test failed: ${error.message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  updateConfiguration(config: Partial<CohereProviderConfig>): void {
    Object.assign(this.configuration, config);

    // Recreate client if API key changed
    if (config.apiKey) {
      this.client = new CohereClient({
        apiKey: config.apiKey,
      });
    }
  }

  async getHealthStatus(): Promise<HealthStatus> {
    try {
      const startTime = Date.now();
      await this.client.chat({
        model: this.configuration.model,
        message: 'Health check',
        max_tokens: 1,
      });
      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        responseTime,
        lastChecked: new Date(),
        details: {
          provider: 'cohere',
          model: this.configuration.model,
          apiEndpoint: 'api.cohere.ai',
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: -1,
        lastChecked: new Date(),
        error: error.message,
        details: {
          provider: 'cohere',
          error: error.message,
        },
      };
    }
  }

  async getUsageMetrics(): Promise<UsageMetrics> {
    // Cohere doesn't provide built-in usage metrics
    // This would typically be tracked externally
    return {
      requestsToday: 0,
      tokensToday: 0,
      costToday: 0,
      quotaRemaining: null,
      resetTime: null,
    };
  }

  // Helper methods
  private getToolsForPrompt(prompt: UnifiedPrompt): CohereToolDefinition[] {
    if (!prompt.availableTools) {
      return [];
    }

    return prompt.availableTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameter_definitions: this.convertParameterSchema(tool.parameters),
    }));
  }

  private convertParameterSchema(schema: any): Record<string, any> {
    // Convert JSON schema to Cohere parameter definitions
    const definitions: Record<string, any> = {};

    if (schema.properties) {
      for (const [name, prop] of Object.entries(schema.properties as any)) {
        definitions[name] = {
          description: (prop as any).description || '',
          type: this.mapJsonSchemaType((prop as any).type),
          required: schema.required?.includes(name) || false,
        };
      }
    }

    return definitions;
  }

  private mapJsonSchemaType(jsonType: string): string {
    const typeMap: Record<string, string> = {
      string: 'str',
      number: 'float',
      integer: 'int',
      boolean: 'bool',
      array: 'list',
      object: 'dict',
    };
    return typeMap[jsonType] || 'str';
  }

  private mapStreamChunkType(chunk: any): StreamChunkType {
    if (chunk.event_type === 'text-generation') {
      return StreamChunkType.CONTENT_DELTA;
    }
    if (chunk.event_type === 'stream-start') {
      return StreamChunkType.CONTENT_START;
    }
    if (chunk.event_type === 'stream-end') {
      return StreamChunkType.CONTENT_END;
    }
    return StreamChunkType.CONTENT_DELTA;
  }

  private getToolCategory(toolName: string): ToolCategory {
    const categoryMap: Record<string, ToolCategory> = {
      read_file: ToolCategory.FILE_SYSTEM,
      write_file: ToolCategory.FILE_SYSTEM,
      web_search: ToolCategory.NETWORK,
      shell_command: ToolCategory.SHELL,
    };
    return categoryMap[toolName] || ToolCategory.CUSTOM;
  }

  private getToolParameters(toolName: string): any {
    // Return appropriate parameter schema for each tool
    return {};
  }

  private getToolConfirmationRequirement(toolName: string): boolean {
    const requiresConfirmation = ['write_file', 'shell_command'];
    return requiresConfirmation.includes(toolName);
  }

  private getToolSecurityLevel(toolName: string): SecurityLevel {
    const securityMap: Record<string, SecurityLevel> = {
      read_file: SecurityLevel.SAFE,
      write_file: SecurityLevel.MODERATE,
      web_search: SecurityLevel.SAFE,
      shell_command: SecurityLevel.DANGEROUS,
    };
    return securityMap[toolName] || SecurityLevel.MODERATE;
  }
}
```

### Step 5: Register Provider

#### Update Provider Factory

```typescript
// packages/core/src/providers/factory.ts
import { CohereProvider } from './cohere/provider';

// Add to factory registration
ProviderFactory.registerProvider(ProviderType.COHERE, CohereProvider);
```

#### Update Configuration Types

```typescript
// packages/core/src/config/types.ts
export type ProviderConfigType<T extends ProviderType> =
  T extends ProviderType.GEMINI
    ? GeminiProviderConfig
    : T extends ProviderType.OPENAI
      ? OpenAIProviderConfig
      : T extends ProviderType.ANTHROPIC
        ? AnthropicProviderConfig
        : T extends ProviderType.COHERE
          ? CohereProviderConfig
          : never;
```

### Step 6: Add Tests

#### Unit Tests

```typescript
// packages/core/src/providers/cohere/__tests__/provider.test.ts
describe('CohereProvider', () => {
  let provider: CohereProvider;
  let mockConfig: CohereProviderConfig;

  beforeEach(() => {
    mockConfig = {
      apiKey: 'co-test-key',
      model: 'command-r-plus',
      maxTokens: 1000,
      temperature: 0.7,
      enabled: true,
    };
    provider = new CohereProvider(mockConfig);
  });

  describe('initialization', () => {
    it('should initialize with valid config', async () => {
      await expect(provider.initialize()).resolves.not.toThrow();
    });

    it('should fail with invalid API key', async () => {
      const invalidConfig = { ...mockConfig, apiKey: 'invalid-key' };
      const invalidProvider = new CohereProvider(invalidConfig);

      await expect(invalidProvider.initialize()).rejects.toThrow();
    });
  });

  describe('content generation', () => {
    it('should generate content successfully', async () => {
      const prompt: UnifiedPrompt = {
        text: 'Hello, world!',
        role: 'user',
      };

      const response = await provider.generateContent(prompt);

      expect(response).toMatchObject({
        content: expect.any(String),
        provider: ProviderType.COHERE,
        usage: expect.objectContaining({
          totalTokens: expect.any(Number),
        }),
      });
    });

    it('should handle streaming', async () => {
      const prompt: UnifiedPrompt = {
        text: 'Generate a short story',
        role: 'user',
      };

      const chunks: UnifiedStreamChunk[] = [];
      for await (const chunk of provider.streamContent(prompt)) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].provider).toBe(ProviderType.COHERE);
    });
  });

  describe('tool integration', () => {
    it('should list available tools', () => {
      const tools = provider.getAvailableTools();

      expect(tools).toContainEqual(
        expect.objectContaining({
          name: 'read_file',
          supportedProviders: expect.arrayContaining([ProviderType.COHERE]),
        }),
      );
    });
  });
});
```

#### Integration Tests

```typescript
// integration-tests/cohere-integration.test.ts
describe('Cohere Integration', () => {
  let testRig: MultiProviderTestRig;

  beforeEach(async () => {
    testRig = await createTestRig({
      providers: [ProviderType.COHERE],
      realProviders: process.env.COHERE_API_KEY ? [ProviderType.COHERE] : [],
    });
  });

  afterEach(async () => {
    await testRig.cleanup();
  });

  it('should work with real Cohere API', async () => {
    if (!process.env.COHERE_API_KEY) {
      test.skip('Cohere API key not available');
      return;
    }

    const response = await testRig.sendMessage('Hello from integration test', {
      provider: ProviderType.COHERE,
    });

    expect(response.success).toBe(true);
    expect(response.provider).toBe(ProviderType.COHERE);
  });

  it('should execute tools correctly', async () => {
    const response = await testRig.sendMessage('Read the package.json file', {
      provider: ProviderType.COHERE,
    });

    expect(response.success).toBe(true);
    expect(response.toolExecutions).toContainEqual(
      expect.objectContaining({
        toolName: 'read_file',
        provider: ProviderType.COHERE,
      }),
    );
  });
});
```

## 🔧 Adding Custom Tools

### Tool Interface Implementation

```typescript
// packages/core/src/tools/custom/my-custom-tool.ts
export class MyCustomTool implements Tool {
  readonly name = 'my_custom_tool';
  readonly description = 'A custom tool for specific functionality';
  readonly category = ToolCategory.CUSTOM;
  readonly supportedProviders = [
    ProviderType.GEMINI,
    ProviderType.OPENAI,
    ProviderType.ANTHROPIC,
  ];
  readonly requiresConfirmation = true;
  readonly securityLevel = SecurityLevel.MODERATE;

  readonly parameters = {
    type: 'object',
    properties: {
      input: {
        type: 'string',
        description: 'Input parameter for the tool',
      },
      options: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            enum: ['json', 'text', 'xml'],
            default: 'json',
          },
        },
      },
    },
    required: ['input'],
  };

  async execute(
    call: UnifiedToolCall,
    context: ToolExecutionContext,
  ): Promise<UnifiedToolResult> {
    const startTime = Date.now();

    try {
      // Validate parameters
      const validation = this.validateParameters(call.parameters);
      if (!validation.valid) {
        throw new ToolExecutionError(
          `Invalid parameters: ${validation.errors.join(', ')}`,
          this.name,
          context.provider,
          false,
        );
      }

      // Perform tool logic
      const result = await this.performCustomLogic(call.parameters, context);

      return {
        toolCallId: call.id,
        success: true,
        content: result.output,
        data: result.data,
        executionTime: Date.now() - startTime,
        provider: context.provider,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        toolCallId: call.id,
        success: false,
        error: {
          code: 'CUSTOM_TOOL_ERROR',
          message: error.message,
          details: error,
          recoverable: true,
        },
        executionTime: Date.now() - startTime,
        provider: context.provider,
        timestamp: new Date(),
      };
    }
  }

  validateParameters(parameters: any): ValidationResult {
    const errors: string[] = [];

    if (!parameters.input || typeof parameters.input !== 'string') {
      errors.push('input parameter is required and must be a string');
    }

    if (
      parameters.options?.format &&
      !['json', 'text', 'xml'].includes(parameters.options.format)
    ) {
      errors.push('format must be one of: json, text, xml');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private async performCustomLogic(
    parameters: any,
    context: ToolExecutionContext,
  ): Promise<{ output: string; data: any }> {
    // Implement your custom tool logic here
    const { input, options = {} } = parameters;
    const format = options.format || 'json';

    // Example: Process input and return formatted result
    const processedData = {
      originalInput: input,
      processedAt: new Date().toISOString(),
      provider: context.provider,
      format,
    };

    let output: string;
    switch (format) {
      case 'json':
        output = JSON.stringify(processedData, null, 2);
        break;
      case 'xml':
        output = this.toXML(processedData);
        break;
      default:
        output = `Processed: ${input}`;
    }

    return { output, data: processedData };
  }

  private toXML(data: any): string {
    // Simple XML conversion (use a proper library in production)
    return `<result>
  <input>${data.originalInput}</input>
  <processed_at>${data.processedAt}</processed_at>
  <provider>${data.provider}</provider>
  <format>${data.format}</format>
</result>`;
  }
}
```

### Tool Registration

```typescript
// packages/core/src/tools/registry.ts
import { MyCustomTool } from './custom/my-custom-tool';

// Register the custom tool
export function registerCustomTools(registry: ToolRegistry): void {
  registry.registerTool(new MyCustomTool());
}
```

## 🔌 MCP Server Integration

### Custom MCP Server

```typescript
// mcp-servers/custom-server/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

class CustomMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'custom-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {
            listChanged: true,
          },
        },
      },
    );

    this.setupToolHandlers();
  }

  private setupToolHandlers(): void {
    // Register custom tool
    this.server.setRequestHandler('tools/list', async () => ({
      tools: [
        {
          name: 'custom_operation',
          description: 'Performs a custom operation',
          inputSchema: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                description: 'The action to perform',
              },
              data: {
                type: 'object',
                description: 'Data for the action',
              },
            },
            required: ['action'],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler('tools/call', async (request) => {
      const { name, arguments: args } = request.params;

      if (name === 'custom_operation') {
        return await this.handleCustomOperation(args);
      }

      throw new Error(`Unknown tool: ${name}`);
    });
  }

  private async handleCustomOperation(args: any): Promise<any> {
    const { action, data } = args;

    switch (action) {
      case 'process':
        return {
          content: [
            {
              type: 'text',
              text: `Processed data: ${JSON.stringify(data)}`,
            },
          ],
        };

      case 'analyze':
        return {
          content: [
            {
              type: 'text',
              text: `Analysis complete for: ${JSON.stringify(data)}`,
            },
          ],
        };

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

// Start the server
const server = new CustomMCPServer();
server.start().catch(console.error);
```

### MCP Server Configuration

```json
{
  "mcpServers": {
    "custom-server": {
      "command": "node",
      "args": ["mcp-servers/custom-server/index.js"],
      "env": {
        "CUSTOM_CONFIG": "value"
      },
      "trust": false,
      "timeout": 10000,
      "supportedProviders": ["gemini", "openai", "anthropic"],
      "providerConfigs": {
        "gemini": {
          "timeout": 8000
        },
        "openai": {
          "timeout": 12000
        },
        "anthropic": {
          "timeout": 15000
        }
      }
    }
  }
}
```

## 🧪 Testing Extension Points

### Provider Testing Framework

```typescript
// packages/core/src/testing/provider-test-framework.ts
export class ProviderTestFramework {
  static async testProviderCompliance(
    provider: LLMProvider,
    config: any,
  ): Promise<ComplianceTestResult> {
    const results: TestResult[] = [];

    // Test interface compliance
    results.push(await this.testInterfaceCompliance(provider));

    // Test configuration validation
    results.push(await this.testConfigurationValidation(provider, config));

    // Test content generation
    results.push(await this.testContentGeneration(provider));

    // Test streaming
    results.push(await this.testStreaming(provider));

    // Test tool integration
    results.push(await this.testToolIntegration(provider));

    // Test error handling
    results.push(await this.testErrorHandling(provider));

    return {
      provider: provider.providerId,
      passed: results.every((r) => r.passed),
      results,
      coverage: this.calculateCoverage(results),
    };
  }

  private static async testInterfaceCompliance(
    provider: LLMProvider,
  ): Promise<TestResult> {
    const requiredMethods = [
      'generateContent',
      'streamContent',
      'executeToolCall',
      'getAvailableTools',
      'validateConfiguration',
      'initialize',
      'dispose',
      'getHealthStatus',
      'getUsageMetrics',
    ];

    const missingMethods = requiredMethods.filter(
      (method) => typeof (provider as any)[method] !== 'function',
    );

    return {
      name: 'Interface Compliance',
      passed: missingMethods.length === 0,
      details:
        missingMethods.length > 0
          ? `Missing methods: ${missingMethods.join(', ')}`
          : 'All required methods implemented',
    };
  }

  private static async testContentGeneration(
    provider: LLMProvider,
  ): Promise<TestResult> {
    try {
      const prompt: UnifiedPrompt = {
        text: 'Hello, world!',
        role: 'user',
      };

      const response = await provider.generateContent(prompt);

      const validResponse =
        response &&
        typeof response.content === 'string' &&
        response.provider === provider.providerId &&
        response.usage &&
        typeof response.usage.totalTokens === 'number';

      return {
        name: 'Content Generation',
        passed: validResponse,
        details: validResponse
          ? 'Content generation successful'
          : 'Invalid response format',
      };
    } catch (error) {
      return {
        name: 'Content Generation',
        passed: false,
        details: `Generation failed: ${error.message}`,
      };
    }
  }

  private static calculateCoverage(results: TestResult[]): number {
    const passed = results.filter((r) => r.passed).length;
    return passed / results.length;
  }
}
```

### Extension Validation

```typescript
// packages/core/src/testing/extension-validator.ts
export class ExtensionValidator {
  static validateProviderExtension(extensionPath: string): ValidationResult {
    const errors: string[] = [];

    // Check file structure
    const requiredFiles = [
      'provider.ts',
      'converter.ts',
      'types.ts',
      '__tests__/provider.test.ts',
    ];

    for (const file of requiredFiles) {
      if (!fs.existsSync(path.join(extensionPath, file))) {
        errors.push(`Missing required file: ${file}`);
      }
    }

    // Validate exports
    try {
      const providerModule = require(path.join(extensionPath, 'provider.ts'));
      if (!providerModule.default || !providerModule.default.prototype) {
        errors.push('Provider must export a default class');
      }
    } catch (error) {
      errors.push(`Invalid provider module: ${error.message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  static async validateToolExtension(tool: Tool): Promise<ValidationResult> {
    const errors: string[] = [];

    // Check required properties
    if (!tool.name || typeof tool.name !== 'string') {
      errors.push('Tool must have a valid name');
    }

    if (!tool.description || typeof tool.description !== 'string') {
      errors.push('Tool must have a description');
    }

    if (!tool.execute || typeof tool.execute !== 'function') {
      errors.push('Tool must have an execute method');
    }

    // Test execution
    try {
      const mockCall: UnifiedToolCall = {
        id: 'test',
        name: tool.name,
        parameters: {},
        provider: ProviderType.GEMINI,
        timestamp: new Date(),
        requestId: 'test',
      };

      const mockContext: ToolExecutionContext = {
        provider: ProviderType.GEMINI,
        toolCall: mockCall,
        userPromptId: 'test',
        sessionId: 'test',
      };

      await tool.execute(mockCall, mockContext);
    } catch (error) {
      // Expected to fail with invalid parameters, but shouldn't crash
      if (!(error instanceof ToolExecutionError)) {
        errors.push(`Tool execution threw unexpected error: ${error.message}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
```

## 📝 Development Guidelines

### Code Standards

1. **TypeScript First**: All code must be written in TypeScript with strict typing
2. **Interface Compliance**: All extensions must implement required interfaces
3. **Error Handling**: Comprehensive error handling with recovery strategies
4. **Testing**: Minimum 80% test coverage for all extensions
5. **Documentation**: Complete JSDoc comments for all public APIs

### Security Considerations

1. **Input Validation**: All inputs must be validated and sanitized
2. **API Key Protection**: Never log or expose API keys
3. **Privilege Isolation**: Tools should run with minimal privileges
4. **Rate Limiting**: Implement appropriate rate limiting
5. **Audit Logging**: Log all significant operations

### Performance Guidelines

1. **Async Operations**: Use async/await for all I/O operations
2. **Connection Pooling**: Reuse connections where possible
3. **Caching**: Implement caching for expensive operations
4. **Memory Management**: Properly dispose of resources
5. **Streaming**: Support streaming for large responses

---

## 🚀 Contribution Process

### Development Workflow

1. **Fork and Branch**: Create feature branch from main
2. **Implement**: Follow architecture patterns and guidelines
3. **Test**: Achieve >80% test coverage
4. **Document**: Update all relevant documentation
5. **Submit**: Create pull request with detailed description

### Review Criteria

- [ ] Interface compliance validated
- [ ] Comprehensive test coverage
- [ ] Security review passed
- [ ] Performance benchmarks met
- [ ] Documentation complete
- [ ] Backward compatibility maintained

---

_This guide provides the foundation for extending the Multi-LLM Provider system while maintaining consistency, security, and performance across all extensions._
