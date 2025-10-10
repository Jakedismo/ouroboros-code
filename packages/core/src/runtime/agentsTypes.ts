/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generic JSON Schema definition covering the properties we need across the
 * runtime. The structure intentionally mirrors the portions of the draft-07
 * specification exercised by our tools and prompts.
 */
export type SchemaType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null'
  | string;

export interface JsonSchema {
  type?: SchemaType | SchemaType[];
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  const?: unknown;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema | JsonSchema[];
  minItems?: number;
  maxItems?: number;
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  format?: string;
  examples?: unknown[];
  [key: string]: unknown;
}

export type SchemaUnion = JsonSchema;

export enum Type {
  STRING = 'string',
  NUMBER = 'number',
  INTEGER = 'integer',
  BOOLEAN = 'boolean',
  OBJECT = 'object',
  ARRAY = 'array',
  NULL = 'null',
}

/**
 * Provider-agnostic content fragments used throughout the unified runtime.
 */
export type AgentContentFragment = string | Part | Part[] | Record<string, unknown>;

export type AgentContent = AgentContentFragment | AgentContentFragment[];

export interface AgentMessage {
  role: string;
  parts: AgentContentFragment[];
  metadata?: Record<string, unknown>;
}

export interface AgentToolInvocation {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AgentToolResult {
  id: string;
  name: string;
  output?: string;
  resultDisplay?: unknown;
  metadata?: Record<string, unknown>;
}

export interface AgentTextDeltaEvent {
  type: 'text-delta';
  delta: string;
}

export interface AgentToolCallEvent {
  type: 'tool-call';
  toolCall: AgentToolInvocation;
}

export interface AgentToolResultEvent {
  type: 'tool-result';
  toolResult: AgentToolResult;
}

export interface AgentFinalEvent {
  type: 'final';
  message: AgentMessage;
}

export interface AgentErrorEvent {
  type: 'error';
  error: Error;
}

export interface AgentUsageEvent {
  type: 'usage';
  usage: Record<string, unknown>;
}

export type AgentStreamEvent =
  | AgentTextDeltaEvent
  | AgentToolCallEvent
  | AgentToolResultEvent
  | AgentFinalEvent
  | AgentErrorEvent
  | AgentUsageEvent;

export interface AgentFunctionCall {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface FunctionCall {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
  thought?: string | boolean;
  [key: string]: unknown;
}

export interface FunctionResponse {
  name?: string;
  response?: unknown;
  state?: unknown;
  [key: string]: unknown;
}

export interface InlineData {
  mimeType?: string;
  data?: string;
  [key: string]: unknown;
}

export interface FileData {
  mimeType?: string;
  fileUri?: string;
  [key: string]: unknown;
}

export interface Part {
  text?: string;
  thought?: string | boolean;
  inlineData?: InlineData;
  fileData?: FileData;
  functionCall?: FunctionCall;
  functionResponse?: FunctionResponse;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export type PartUnion = Part | string;

export type PartListUnion = PartUnion | PartUnion[];

export interface Content {
  role?: string;
  parts?: Part[];
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export type ContentListUnion = Content | Content[] | PartListUnion | string;

export type ContentUnion = Content | PartListUnion | string;

export interface ToolFunctionDeclaration {
  name?: string;
  description?: string;
  parameters?: JsonSchema;
  parametersJsonSchema?: JsonSchema;
  responseSchema?: JsonSchema;
  [key: string]: unknown;
}

export type ToolToolFunctionDeclaration = ToolFunctionDeclaration;

export interface Tool {
  functionDeclarations: ToolFunctionDeclaration[];
  [key: string]: unknown;
}

export type ToolListUnion = Tool[] | Tool;

export type ToolConfig = Record<string, unknown>;

export type GenerationConfigRoutingConfig = Record<string, unknown>;

export type ModelSelectionConfig = Record<string, unknown>;

export type MediaResolution = string;

export type SpeechConfigUnion = Record<string, unknown>;

export type ThinkingConfig = Record<string, unknown>;

export interface GenerateContentConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  candidateCount?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
  responseLogprobs?: boolean;
  logprobs?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  seed?: number;
  responseMimeType?: string;
  responseSchema?: JsonSchema;
  responseJsonSchema?: JsonSchema;
  systemInstruction?: string | Content;
  tools?: Tool[];
  abortSignal?: AbortSignal;
  thinkingConfig?: ThinkingConfig;
  reasoningConfig?: Record<string, unknown>;
  cachedContent?: string;
  toolConfig?: ToolConfig;
  labels?: Record<string, string>;
  safetySettings?: SafetySetting[];
  routingConfig?: GenerationConfigRoutingConfig;
  modelSelectionConfig?: ModelSelectionConfig;
  responseModalities?: string[];
  mediaResolution?: MediaResolution;
  speechConfig?: SpeechConfigUnion;
  audioTimestamp?: boolean;
  parallelToolCalls?: boolean;
}

export interface GenerateContentParameters {
  model?: string;
  contents: ContentListUnion;
  config?: GenerateContentConfig;
}

export interface SendMessageParameters {
  message: PartListUnion;
  config?: GenerateContentConfig;
}

export type FinishReason =
  | 'STOP'
  | 'MAX_TOKENS'
  | 'SAFETY'
  | 'RECITATION'
  | 'CONTENT_FILTER'
  | 'UNKNOWN'
  | string;

export type BlockedReason = string;

export interface GenerateContentResponseUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  cachedContentTokenCount?: number;
  thoughtsTokenCount?: number;
  toolUsePromptTokenCount?: number;
  [key: string]: unknown;
}

export interface GroundingMetadata {
  groundingChunks?: Array<Record<string, unknown>>;
  groundingSupports?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface GenerateContentResponseCandidate {
  index?: number;
  content?: Content;
  finishReason?: FinishReason;
  stopReason?: string;
  functionCalls?: FunctionCall[];
  groundingMetadata?: GroundingMetadata;
  citationMetadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export type Candidate = GenerateContentResponseCandidate;

export type GenerateContentResponsePromptFeedback = Record<string, unknown>;

export type SafetySetting = Record<string, unknown>;

export interface GenerateContentResponse {
  candidates?: GenerateContentResponseCandidate[];
  usageMetadata?: GenerateContentResponseUsageMetadata;
  automaticFunctionCallingHistory?: Content[];
  promptFeedback?: GenerateContentResponsePromptFeedback;
  [key: string]: unknown;
}

export interface CountTokensParameters {
  model?: string;
  contents: ContentListUnion;
  config?: Record<string, unknown>;
}

export interface CountTokensResponse {
  totalTokens: number;
  totalBillableCharacters?: number;
  [key: string]: unknown;
}

export interface EmbedContentParameters {
  model?: string;
  content: ContentListUnion;
  taskType?: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface EmbeddingVector {
  values: number[];
  outputDimensionality?: number;
  [key: string]: unknown;
}

export interface EmbedContentResponse {
  embeddings: EmbeddingVector[];
}

export type AgentStreamUsage = AgentUsageEvent['usage'];
