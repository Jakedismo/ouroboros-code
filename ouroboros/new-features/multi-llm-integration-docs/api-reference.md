# Multi-LLM Provider API Reference

## 🎯 Overview

This document provides complete API reference for the Multi-LLM Provider system, including interfaces, types, classes, and methods for integrating and extending the multi-provider functionality.

## 📚 Table of Contents

- [Core Interfaces](#core-interfaces)
- [Provider Types](#provider-types)
- [Configuration API](#configuration-api)
- [Tool Execution API](#tool-execution-api)
- [Security API](#security-api)
- [Streaming API](#streaming-api)
- [Factory and Registry](#factory-and-registry)
- [Error Handling](#error-handling)
- [Extension Points](#extension-points)

## 🔧 Core Interfaces

### LLMProvider Interface

The foundational interface that all providers must implement.

```typescript
export interface LLMProvider {
  readonly providerId: ProviderType;
  readonly capabilities: ProviderCapabilities;
  readonly configuration: ProviderConfiguration;

  // Core content generation
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

### ProviderCapabilities

Describes what a provider can do.

```typescript
export interface ProviderCapabilities {
  // Content generation capabilities
  streaming: boolean;
  batchProcessing: boolean;
  contextPersistence: boolean;

  // Modality support
  multimodal: boolean;
  vision: boolean;
  audioInput: boolean;
  audioOutput: boolean;

  // Tool execution
  toolExecution: boolean;
  parallelToolExecution: boolean;
  customTools: boolean;

  // Technical limits
  maxTokens: number;
  contextWindow: number;
  maxRequestsPerMinute: number;

  // Supported formats
  supportedInputFormats: string[];
  supportedOutputFormats: string[];

  // Advanced features
  functionCalling: boolean;
  codeExecution: boolean;
  webBrowsing: boolean;
}
```

### UnifiedPrompt

Standardized prompt format across all providers.

```typescript
export interface UnifiedPrompt {
  // Primary content
  text: string;
  role?: 'user' | 'assistant' | 'system';

  // Multimodal content
  images?: ImageContent[];
  files?: FileContent[];

  // Context and metadata
  context?: ConversationContext;
  metadata?: PromptMetadata;

  // Tool-related
  availableTools?: Tool[];
  toolExecutionContext?: ToolExecutionContext;

  // Provider-specific customizations
  providerSpecific?: {
    [provider in ProviderType]?: any;
  };
}

export interface ImageContent {
  data: Buffer | string; // Buffer for binary, string for base64
  mimeType: string;
  description?: string;
}

export interface FileContent {
  name: string;
  content: Buffer | string;
  mimeType: string;
  size: number;
}

export interface ConversationContext {
  conversationId: string;
  messageHistory: Message[];
  sessionMetadata: SessionMetadata;
}
```

### UnifiedResponse

Standardized response format from all providers.

```typescript
export interface UnifiedResponse {
  // Generated content
  content: string;
  finishReason: FinishReason;

  // Tool execution results
  toolCalls?: UnifiedToolCall[];
  toolResults?: UnifiedToolResult[];

  // Metadata
  usage: TokenUsage;
  latency: LatencyMetrics;
  provider: ProviderType;
  model: string;
  requestId: string;

  // Quality and safety
  safetyAssessment?: SafetyAssessment;
  qualityMetrics?: QualityMetrics;

  // Raw provider response (for debugging)
  raw?: any;
}

export type FinishReason =
  | 'stop'
  | 'length'
  | 'tool_calls'
  | 'content_filter'
  | 'error';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number; // USD cost estimation
}

export interface LatencyMetrics {
  requestTime: number; // Time to first token
  responseTime: number; // Total response time
  processingTime: number; // Provider processing time
}
```

## 🏷️ Provider Types

### ProviderType Enum

```typescript
export enum ProviderType {
  GEMINI = 'gemini',
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
}
```

### Provider-Specific Configuration Types

#### Gemini Configuration

```typescript
export interface GeminiProviderConfig extends BaseProviderConfig {
  apiKey: string;
  model: string;

  // Generation parameters
  temperature?: number;
  topK?: number;
  topP?: number;
  maxOutputTokens?: number;

  // Safety settings
  safetySettings?: {
    [category: string]:
      | 'BLOCK_NONE'
      | 'BLOCK_ONLY_HIGH'
      | 'BLOCK_MEDIUM_AND_ABOVE'
      | 'BLOCK_LOW_AND_ABOVE';
  };

  // Advanced options
  candidateCount?: number;
  stopSequences?: string[];
}
```

#### OpenAI Configuration

```typescript
export interface OpenAIProviderConfig extends BaseProviderConfig {
  apiKey: string;
  baseURL?: string;
  organization?: string;
  model: string;

  // Generation parameters
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;

  // Advanced options
  responseFormat?: 'text' | 'json_object';
  seed?: number;
  stop?: string | string[];
  user?: string;

  // Timeouts and retries
  timeout?: number;
  maxRetries?: number;
}
```

#### Anthropic Configuration

```typescript
export interface AnthropicProviderConfig extends BaseProviderConfig {
  apiKey: string;
  baseURL?: string;
  model: string;

  // Generation parameters
  temperature?: number;
  maxTokens?: number;
  topK?: number;
  topP?: number;

  // Advanced options
  stopSequences?: string[];
  metadata?: Record<string, any>;

  // Timeouts and retries
  timeout?: number;
  maxRetries?: number;
}
```

#### Base Provider Configuration

```typescript
export interface BaseProviderConfig {
  enabled: boolean;
  priority?: number;

  // Rate limiting
  requestsPerMinute?: number;
  tokensPerMinute?: number;

  // Caching
  enableCaching?: boolean;
  cacheTimeout?: number;

  // Monitoring
  enableMetrics?: boolean;
  enableLogging?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}
```

## ⚙️ Configuration API

### Config Class

Main configuration management class.

```typescript
export class Config {
  // Provider management
  setDefaultProvider(provider: ProviderType): void;
  getDefaultProvider(): ProviderType;
  getProviderConfig<T extends ProviderType>(provider: T): ProviderConfigType<T>;
  setProviderConfig<T extends ProviderType>(
    provider: T,
    config: ProviderConfigType<T>,
  ): void;

  // Multi-provider settings
  getMultiProviderConfig(): MultiProviderConfig;
  setMultiProviderConfig(config: MultiProviderConfig): void;

  // Tool and security configuration
  getApprovalConfig(): ApprovalConfig;
  setApprovalConfig(config: ApprovalConfig): void;
  getSecurityConfig(): SecurityConfig;
  setSecurityConfig(config: SecurityConfig): void;

  // Configuration validation
  validateConfiguration(): ValidationResult;

  // Configuration persistence
  loadConfiguration(source?: ConfigSource): Promise<void>;
  saveConfiguration(target?: ConfigTarget): Promise<void>;
}

export interface MultiProviderConfig {
  defaultProvider: ProviderType;
  providers: {
    [K in ProviderType]?: ProviderConfigType<K>;
  };
  failoverStrategy?: FailoverStrategy;
  loadBalancing?: LoadBalancingConfig;
}

export interface FailoverStrategy {
  enabled: boolean;
  fallbackProviders: ProviderType[];
  retryAttempts: number;
  fallbackDelay: number;
  healthCheckInterval: number;
}
```

### Configuration Loading

```typescript
export interface ConfigManager {
  // Configuration sources
  loadFromEnvironment(): Promise<Partial<MultiProviderConfig>>;
  loadFromFile(path: string): Promise<Partial<MultiProviderConfig>>;
  loadFromCommandLine(args: string[]): Partial<MultiProviderConfig>;

  // Configuration merging
  mergeConfigurations(
    configs: Partial<MultiProviderConfig>[],
  ): MultiProviderConfig;

  // Configuration validation
  validateProviderConfig(provider: ProviderType, config: any): ValidationResult;
  validateSecurityConfig(config: SecurityConfig): ValidationResult;
  validateToolConfig(config: ToolConfig): ValidationResult;
}
```

## 🛠️ Tool Execution API

### UnifiedToolCall

Standardized tool call format.

```typescript
export interface UnifiedToolCall {
  id: string;
  name: string;
  parameters: Record<string, any>;

  // Execution metadata
  provider: ProviderType;
  timestamp: Date;
  requestId: string;

  // Security context
  securityContext?: SecurityContext;

  // Execution options
  options?: ToolExecutionOptions;
}

export interface ToolExecutionOptions {
  timeout?: number;
  retries?: number;
  async?: boolean;
  priority?: 'low' | 'normal' | 'high';
}

export interface SecurityContext {
  userId?: string;
  sessionId: string;
  permissions: Permission[];
  riskLevel: SecurityLevel;
}
```

### UnifiedToolResult

Standardized tool execution result.

```typescript
export interface UnifiedToolResult {
  toolCallId: string;
  success: boolean;

  // Result data
  content?: string;
  data?: any;

  // Error information
  error?: ToolExecutionError;

  // Execution metadata
  executionTime: number;
  provider: ProviderType;
  timestamp: Date;

  // Security and audit
  securityEvents?: SecurityEvent[];
  auditLog?: AuditLogEntry[];
}

export interface ToolExecutionError {
  code: string;
  message: string;
  details?: any;
  recoverable: boolean;
  suggestedAction?: string;
}
```

### BuiltinToolManager

Manager for built-in tool execution across providers.

```typescript
export class BuiltinToolManager {
  constructor(
    private toolRegistry: ToolRegistry,
    private confirmationManager: UnifiedConfirmationManager,
    private securityManager: SecurityManager
  );

  // Tool execution
  async executeToolCall(
    context: ToolExecutionContext,
    abortSignal: AbortSignal
  ): Promise<UnifiedToolResult>;

  // Tool management
  getAvailableTools(provider?: ProviderType): Tool[];
  getToolCompatibility(toolName: string): ProviderCompatibility;

  // Tool registration
  registerTool(tool: Tool): void;
  unregisterTool(toolName: string): void;

  // Validation
  validateToolExecution(context: ToolExecutionContext): Promise<ValidationResult>;
}

export interface ToolExecutionContext {
  provider: ProviderType;
  toolCall: UnifiedToolCall;
  userPromptId: string;
  sessionId: string;

  // Callbacks
  requiresConfirmation?: (toolCall: UnifiedToolCall) => Promise<boolean>;
  onToolUse?: (toolCall: UnifiedToolCall) => void;
  onToolResult?: (result: UnifiedToolResult) => void;
  onConfirmationRequired?: (
    context: ProviderConfirmationContext,
    abortSignal: AbortSignal
  ) => Promise<ConfirmationResult>;
}
```

## 🔒 Security API

### UnifiedConfirmationManager

Manages tool confirmation flows across all providers.

```typescript
export class UnifiedConfirmationManager {
  // Confirmation processing
  async processConfirmation(
    context: ProviderConfirmationContext,
    abortSignal: AbortSignal,
  ): Promise<ConfirmationResult>;

  // Allowlist management
  addToAllowlist(toolName: string, scope: AllowlistScope): void;
  removeFromAllowlist(toolName: string, scope: AllowlistScope): void;
  isInAllowlist(toolName: string, scope: AllowlistScope): boolean;

  // Risk assessment
  assessSecurityRisk(toolCall: UnifiedToolCall): SecurityAssessment;

  // Configuration
  updateApprovalMode(mode: ApprovalMode, provider?: ProviderType): void;
  getApprovalMode(provider: ProviderType): ApprovalMode;
}

export interface ProviderConfirmationContext {
  provider: ProviderType;
  toolCall: UnifiedToolCall;
  userPromptId: string;
  sessionId: string;
  securityAssessment: SecurityAssessment;
  riskFactors: RiskFactor[];
}

export interface ConfirmationResult {
  outcome: ToolConfirmationOutcome;
  skipFutureConfirmations: boolean;
  addToAllowlist?: AllowlistScope;
  reasoning?: string;
}

export enum ToolConfirmationOutcome {
  ProceedOnce = 'proceed_once',
  ProceedAlways = 'proceed_always',
  Deny = 'deny',
}

export type AllowlistScope = 'global' | 'provider' | 'session';
```

### Security Assessment

```typescript
export interface SecurityAssessment {
  riskLevel: SecurityLevel;
  riskFactors: RiskFactor[];
  securityChecks: SecurityCheck[];
  recommendations: SecurityRecommendation[];
  allowExecution: boolean;
}

export enum SecurityLevel {
  SAFE = 'safe',
  MODERATE = 'moderate',
  DANGEROUS = 'dangerous',
  CRITICAL = 'critical',
}

export interface RiskFactor {
  type: RiskType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  mitigation?: string;
}

export enum RiskType {
  FILE_SYSTEM_ACCESS = 'file_system_access',
  COMMAND_EXECUTION = 'command_execution',
  NETWORK_ACCESS = 'network_access',
  DATA_EXPOSURE = 'data_exposure',
  PRIVILEGE_ESCALATION = 'privilege_escalation',
}

export interface SecurityCheck {
  name: string;
  passed: boolean;
  details: string;
  evidence?: any;
}
```

## 🌊 Streaming API

### Streaming Interfaces

```typescript
export interface UnifiedStreamChunk {
  id: string;
  provider: ProviderType;
  type: StreamChunkType;

  // Content
  content?: string;
  delta?: string;

  // Tool-related
  toolCall?: Partial<UnifiedToolCall>;
  toolResult?: Partial<UnifiedToolResult>;

  // Metadata
  usage?: Partial<TokenUsage>;
  finishReason?: FinishReason;

  // Timing
  timestamp: Date;
  sequenceNumber: number;
}

export enum StreamChunkType {
  CONTENT_START = 'content_start',
  CONTENT_DELTA = 'content_delta',
  CONTENT_END = 'content_end',
  TOOL_CALL_START = 'tool_call_start',
  TOOL_CALL_DELTA = 'tool_call_delta',
  TOOL_CALL_END = 'tool_call_end',
  TOOL_RESULT = 'tool_result',
  ERROR = 'error',
  METADATA = 'metadata',
}

export interface StreamingOptions {
  // Buffer management
  bufferSize?: number;
  flushInterval?: number;

  // Error handling
  retryOnError?: boolean;
  maxRetries?: number;

  // Filtering
  includeMetadata?: boolean;
  includeUsage?: boolean;
  chunkTypes?: StreamChunkType[];
}
```

### StreamingManager

```typescript
export class StreamingManager {
  // Stream creation
  createStream<T>(
    provider: LLMProvider,
    prompt: UnifiedPrompt,
    options?: StreamingOptions,
  ): AsyncIterable<UnifiedStreamChunk>;

  // Stream processing
  async processStreamChunk(
    chunk: UnifiedStreamChunk,
    context: StreamingContext,
  ): Promise<ProcessedStreamChunk>;

  // Stream aggregation
  aggregateStreamChunks(chunks: UnifiedStreamChunk[]): UnifiedResponse;

  // Error handling
  handleStreamError(
    error: StreamError,
    context: StreamingContext,
  ): Promise<StreamRecoveryAction>;
}

export interface StreamingContext {
  provider: ProviderType;
  requestId: string;
  startTime: Date;
  options: StreamingOptions;
}
```

## 🏭 Factory and Registry

### ProviderFactory

```typescript
export class ProviderFactory {
  // Provider registration
  static registerProvider(
    type: ProviderType,
    providerClass: new (config: any) => LLMProvider,
  ): void;

  // Provider creation
  static createProvider(
    type: ProviderType,
    config: ProviderConfiguration,
  ): LLMProvider;

  // Provider enumeration
  static getAvailableProviders(): ProviderType[];
  static getProviderCapabilities(type: ProviderType): ProviderCapabilities;

  // Validation
  static validateProviderRegistration(
    type: ProviderType,
    providerClass: any,
  ): ValidationResult;
}
```

### ToolRegistry

```typescript
export class ToolRegistry {
  // Tool registration
  registerTool(tool: Tool): void;
  unregisterTool(toolName: string): void;

  // Tool access
  getTool(toolName: string): Tool;
  getAllTools(): Tool[];
  getToolsByCategory(category: ToolCategory): Tool[];

  // Tool compatibility
  getCompatibleTools(provider: ProviderType): Tool[];
  isToolCompatible(toolName: string, provider: ProviderType): boolean;

  // Tool validation
  validateTool(tool: Tool): ValidationResult;
  validateToolCall(toolCall: UnifiedToolCall): ValidationResult;
}

export interface Tool {
  name: string;
  description: string;
  category: ToolCategory;
  parameters: ToolParameterSchema;

  // Compatibility
  supportedProviders: ProviderType[];
  requiresConfirmation: boolean;
  securityLevel: SecurityLevel;

  // Execution
  execute(
    call: UnifiedToolCall,
    context: ToolExecutionContext,
  ): Promise<UnifiedToolResult>;

  // Validation
  validateParameters(parameters: any): ValidationResult;
}

export enum ToolCategory {
  FILE_SYSTEM = 'file_system',
  NETWORK = 'network',
  SHELL = 'shell',
  MEMORY = 'memory',
  MCP = 'mcp',
  CUSTOM = 'custom',
}
```

## ❌ Error Handling

### Error Types

```typescript
export class ProviderError extends Error {
  constructor(
    message: string,
    public provider: ProviderType,
    public code: string,
    public recoverable: boolean = false,
    public details?: any,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export class ConfigurationError extends Error {
  constructor(
    message: string,
    public configPath: string,
    public validation?: ValidationResult,
  ) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class ToolExecutionError extends Error {
  constructor(
    message: string,
    public toolName: string,
    public provider: ProviderType,
    public recoverable: boolean = false,
    public details?: any,
  ) {
    super(message);
    this.name = 'ToolExecutionError';
  }
}

export class SecurityError extends Error {
  constructor(
    message: string,
    public securityLevel: SecurityLevel,
    public riskFactors: RiskFactor[],
    public mitigation?: string,
  ) {
    super(message);
    this.name = 'SecurityError';
  }
}
```

### Error Recovery

```typescript
export interface ErrorRecoveryStrategy {
  canRecover(error: Error): boolean;
  recover(error: Error, context: ExecutionContext): Promise<RecoveryResult>;
}

export interface RecoveryResult {
  success: boolean;
  alternativeAction?: () => Promise<any>;
  fallbackProvider?: ProviderType;
  retryDelay?: number;
}

export class ErrorRecoveryManager {
  registerRecoveryStrategy(
    errorType: new (...args: any[]) => Error,
    strategy: ErrorRecoveryStrategy,
  ): void;

  async recoverFromError(
    error: Error,
    context: ExecutionContext,
  ): Promise<RecoveryResult>;
}
```

## 🔌 Extension Points

### Provider Extension Interface

```typescript
export interface ProviderExtension {
  readonly providerId: string;
  readonly version: string;
  readonly capabilities: ProviderCapabilities;

  createProvider(config: any): LLMProvider;
  validateConfiguration(config: any): ValidationResult;
  getDefaultConfiguration(): any;
  getConfigurationSchema(): JSONSchema;
  getRequiredPermissions(): Permission[];

  // Lifecycle hooks
  onRegister?(): Promise<void>;
  onUnregister?(): Promise<void>;
  onConfigurationChange?(config: any): Promise<void>;
}

export class ProviderExtensionManager {
  // Extension management
  registerExtension(extension: ProviderExtension): Promise<void>;
  unregisterExtension(providerId: string): Promise<void>;

  // Extension discovery
  getRegisteredExtensions(): ProviderExtension[];
  getExtension(providerId: string): ProviderExtension | undefined;

  // Extension validation
  validateExtension(extension: ProviderExtension): ValidationResult;
}
```

### Tool Extension Interface

```typescript
export interface ToolExtension {
  readonly toolId: string;
  readonly version: string;
  readonly category: ToolCategory;

  createTool(): Tool;
  getToolSchema(): ToolSchema;
  getSupportedProviders(): ProviderType[];
  getSecurityRequirements(): SecurityRequirement[];
}

export class ToolExtensionManager {
  registerToolExtension(extension: ToolExtension): void;
  unregisterToolExtension(toolId: string): void;
  getRegisteredToolExtensions(): ToolExtension[];
}
```

## 📊 Metrics and Monitoring

### Metrics API

```typescript
export interface MetricsCollector {
  // Provider metrics
  recordProviderLatency(provider: ProviderType, latency: number): void;
  recordProviderError(provider: ProviderType, error: Error): void;
  recordTokenUsage(provider: ProviderType, usage: TokenUsage): void;

  // Tool metrics
  recordToolExecution(
    toolName: string,
    provider: ProviderType,
    duration: number,
  ): void;
  recordToolError(toolName: string, provider: ProviderType, error: Error): void;

  // Security metrics
  recordSecurityEvent(event: SecurityEvent): void;
  recordConfirmationAction(
    action: ToolConfirmationOutcome,
    provider: ProviderType,
  ): void;

  // System metrics
  recordSystemPerformance(metrics: SystemMetrics): void;
}

export interface MetricsAggregator {
  getProviderMetrics(
    provider: ProviderType,
    timeRange: TimeRange,
  ): ProviderMetrics;
  getToolMetrics(toolName: string, timeRange: TimeRange): ToolMetrics;
  getSecurityMetrics(timeRange: TimeRange): SecurityMetrics;
  getSystemMetrics(timeRange: TimeRange): SystemMetrics;

  // Comparisons
  compareProviderPerformance(
    timeRange: TimeRange,
  ): ProviderPerformanceComparison;
  generatePerformanceReport(timeRange: TimeRange): PerformanceReport;
}
```

## 🧪 Testing API

### Test Utilities

```typescript
export class MultiProviderTestUtils {
  // Provider testing
  static createMockProvider(
    type: ProviderType,
    config?: Partial<ProviderConfiguration>,
  ): LLMProvider;
  static createTestEnvironment(providers: ProviderType[]): TestEnvironment;

  // Cross-provider testing
  static async testCrossProviderCompatibility(
    testCase: TestCase,
    providers: ProviderType[],
  ): Promise<CompatibilityTestResult>;

  // Performance testing
  static async benchmarkProviders(
    prompt: UnifiedPrompt,
    providers: ProviderType[],
    iterations: number,
  ): Promise<BenchmarkResult>;

  // Tool testing
  static async testToolExecution(
    toolCall: UnifiedToolCall,
    providers: ProviderType[],
  ): Promise<ToolTestResult>;
}

export interface TestEnvironment {
  providers: Map<ProviderType, LLMProvider>;
  config: MultiProviderConfig;
  cleanup(): Promise<void>;
}
```

---

## 📖 Usage Examples

### Basic Provider Usage

```typescript
// Create and configure a provider
const factory = new ProviderFactory();
const provider = factory.createProvider(ProviderType.OPENAI, {
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4',
  temperature: 0.7,
});

// Generate content
const response = await provider.generateContent({
  text: 'Explain quantum computing',
  role: 'user',
});

console.log(response.content);
```

### Tool Execution

```typescript
// Execute a tool across multiple providers
const toolManager = new BuiltinToolManager(toolRegistry, confirmationManager);

const toolCall: UnifiedToolCall = {
  id: '123',
  name: 'read_file',
  parameters: { path: 'README.md' },
  provider: ProviderType.ANTHROPIC,
};

const context: ToolExecutionContext = {
  provider: ProviderType.ANTHROPIC,
  toolCall,
  userPromptId: 'prompt-123',
  sessionId: 'session-456',
};

const result = await toolManager.executeToolCall(
  context,
  new AbortController().signal,
);
```

### Streaming Example

```typescript
// Stream content from a provider
const streamingManager = new StreamingManager();

const stream = streamingManager.createStream(provider, {
  text: 'Write a long story about AI',
  role: 'user',
});

for await (const chunk of stream) {
  if (chunk.type === StreamChunkType.CONTENT_DELTA) {
    process.stdout.write(chunk.delta || '');
  }
}
```

---

_This API reference provides comprehensive documentation for integrating with and extending the Multi-LLM Provider system._
