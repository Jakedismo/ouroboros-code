/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import process from 'node:process';
import type { ContentGeneratorConfig } from '../core/contentGenerator.js';
import {
  AuthType,
  createContentGeneratorConfig,
} from '../core/contentGenerator.js';
import { PromptRegistry } from '../prompts/prompt-registry.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { LSTool } from '../tools/ls.js';
import { ReadFileTool } from '../tools/read-file.js';
import { GrepTool } from '../tools/grep.js';
import { RipGrepTool } from '../tools/ripGrep.js';
import { GlobTool } from '../tools/glob.js';
import { EditTool } from '../tools/edit.js';
import { ShellTool } from '../tools/shell.js';
import { LocalShellTool } from '../tools/local-shell.js';
import { WriteFileTool } from '../tools/write-file.js';
import { WebFetchTool } from '../tools/web-fetch.js';
import { ReadManyFilesTool } from '../tools/read-many-files.js';
import type { PlanState } from '../core/planTypes.js';
import { clonePlanState } from '../core/planTypes.js';
import { MemoryTool, setGeminiMdFilename } from '../tools/memoryTool.js';
import { UpdatePlanTool } from '../tools/update-plan.js';
import { WebSearchTool } from '../tools/web-search.js';
import { ImageGenerationTool } from '../tools/image-generation.js';
import { AgentsClient } from '../core/agentsClient.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { GitService } from '../services/gitService.js';
import type { TelemetryTarget } from '../telemetry/index.js';
import {
  initializeTelemetry,
  DEFAULT_TELEMETRY_TARGET,
  DEFAULT_OTLP_ENDPOINT,
} from '../telemetry/index.js';
import { StartSessionEvent } from '../telemetry/index.js';
import {
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
} from './models.js';
import { shouldAttemptBrowserLaunch } from '../utils/browser.js';
import type { MCPOAuthConfig } from '../mcp/oauth-provider.js';
import { IdeClient } from '../ide/ide-client.js';
import type { Content } from '../runtime/genaiCompat.js';
import type { FileSystemService } from '../services/fileSystemService.js';
import { StandardFileSystemService } from '../services/fileSystemService.js';
import type {
  ToolCallRequestInfo,
  ToolCallResponseInfo,
} from '../core/turn.js';
import { logCliConfiguration, logIdeConnection } from '../telemetry/loggers.js';
import { IdeConnectionEvent, IdeConnectionType } from '../telemetry/types.js';

// Re-export OAuth config type
export type { MCPOAuthConfig, AnyToolInvocation };
import type { AnyToolInvocation } from '../tools/tools.js';
import { WorkspaceContext } from '../utils/workspaceContext.js';
import { Storage } from './storage.js';
import { FileExclusions } from '../utils/ignorePatterns.js';
import type { EventEmitter } from 'node:events';

export enum ApprovalMode {
  DEFAULT = 'default',
  AUTO_EDIT = 'autoEdit',
  YOLO = 'yolo',
}

export interface AccessibilitySettings {
  disableLoadingPhrases?: boolean;
  screenReader?: boolean;
}

export interface BugCommandSettings {
  urlTemplate: string;
}

export interface ChatCompressionSettings {
  contextPercentageThreshold?: number;
}

export interface SummarizeToolOutputSettings {
  tokenBudget?: number;
}

export interface TelemetrySettings {
  enabled?: boolean;
  target?: TelemetryTarget;
  otlpEndpoint?: string;
  otlpProtocol?: 'grpc' | 'http';
  logPrompts?: boolean;
  outfile?: string;
}

export interface GeminiCLIExtension {
  name: string;
  version: string;
  isActive: boolean;
  path: string;
}
export interface FileFilteringOptions {
  respectGitIgnore: boolean;
  respectGeminiIgnore: boolean;
}
// For memory files
export const DEFAULT_MEMORY_FILE_FILTERING_OPTIONS: FileFilteringOptions = {
  respectGitIgnore: false,
  respectGeminiIgnore: true,
};
// For all other files
export const DEFAULT_FILE_FILTERING_OPTIONS: FileFilteringOptions = {
  respectGitIgnore: true,
  respectGeminiIgnore: true,
};
export class MCPServerConfig {
  constructor(
    // For stdio transport
    readonly command?: string,
    readonly args?: string[],
    readonly env?: Record<string, string>,
    readonly cwd?: string,
    // For sse transport
    readonly url?: string,
    // For streamable http transport
    readonly httpUrl?: string,
    readonly headers?: Record<string, string>,
    // For websocket transport
    readonly tcp?: string,
    // Common
    readonly timeout?: number,
    readonly trust?: boolean,
    // Metadata
    readonly description?: string,
    readonly includeTools?: string[],
    readonly excludeTools?: string[],
    readonly extensionName?: string,
    // OAuth configuration
    readonly oauth?: MCPOAuthConfig,
    readonly authProviderType?: AuthProviderType,
  ) {}
}

export enum AuthProviderType {
  DYNAMIC_DISCOVERY = 'dynamic_discovery',
  GOOGLE_CREDENTIALS = 'google_credentials',
}

export interface SandboxConfig {
  command: 'docker' | 'podman' | 'sandbox-exec';
  image: string;
}

export type FlashFallbackHandler = (
  currentModel: string,
  fallbackModel: string,
  error?: unknown,
) => Promise<boolean | string | null>;

export interface ToolExecutionMetadata {
  agentId?: string;
  agentName?: string;
  agentEmoji?: string;
}

export type ToolExecutionBridge = (
  request: ToolCallRequestInfo,
  abortSignal: AbortSignal,
  metadata?: ToolExecutionMetadata,
) => Promise<ToolCallResponseInfo>;

export interface ConfigParameters {
  sessionId: string;
  embeddingModel?: string;
  sandbox?: SandboxConfig;
  targetDir: string;
  debugMode: boolean;
  question?: string;
  fullContext?: boolean;
  coreTools?: string[];
  allowedTools?: string[];
  excludeTools?: string[];
  toolDiscoveryCommand?: string;
  toolCallCommand?: string;
  mcpServerCommand?: string;
  mcpServers?: Record<string, MCPServerConfig>;
  userMemory?: string;
  geminiMdFileCount?: number;
  approvalMode?: ApprovalMode;
  showMemoryUsage?: boolean;
  contextFileName?: string | string[];
  accessibility?: AccessibilitySettings;
  telemetry?: TelemetrySettings;
  usageStatisticsEnabled?: boolean;
  fileFiltering?: {
    respectGitIgnore?: boolean;
    respectGeminiIgnore?: boolean;
    enableRecursiveFileSearch?: boolean;
    disableFuzzySearch?: boolean;
  };
  checkpointing?: boolean;
  proxy?: string;
  cwd: string;
  fileDiscoveryService?: FileDiscoveryService;
  includeDirectories?: string[];
  bugCommand?: BugCommandSettings;
  model: string;
  // Provider configuration
  provider?: 'openai' | 'anthropic' | 'gemini';
  providerApiKey?: string;
  providerUseOauth?: boolean;
  extensionContextFilePaths?: string[];
  maxSessionTurns?: number;
  experimentalZedIntegration?: boolean;
  listExtensions?: boolean;
  extensions?: GeminiCLIExtension[];
  blockedMcpServers?: Array<{ name: string; extensionName: string }>;
  noBrowser?: boolean;
  summarizeToolOutput?: Record<string, SummarizeToolOutputSettings>;
  folderTrustFeature?: boolean;
  folderTrust?: boolean;
  ideMode?: boolean;
  loadMemoryFromIncludeDirectories?: boolean;
  chatCompression?: ChatCompressionSettings;
  interactive?: boolean;
  trustedFolder?: boolean;
  useRipgrep?: boolean;
  shouldUseNodePtyShell?: boolean;
  skipNextSpeakerCheck?: boolean;
  extensionManagement?: boolean;
  enablePromptCompletion?: boolean;
  autonomousMode?: boolean;
  enableContinuousInput?: boolean;
  eventEmitter?: EventEmitter;
}

export class Config {
  private toolRegistry!: ToolRegistry;
  private promptRegistry!: PromptRegistry;
  private readonly sessionId: string;
  private fileSystemService: FileSystemService;
  private contentGeneratorConfig!: ContentGeneratorConfig;
  private readonly embeddingModel: string;
  private readonly sandbox: SandboxConfig | undefined;
  private readonly targetDir: string;
  private workspaceContext: WorkspaceContext;
  private readonly debugMode: boolean;
  private readonly question: string | undefined;
  private readonly fullContext: boolean;
  private readonly coreTools: string[] | undefined;
  private readonly allowedTools: string[] | undefined;
  private readonly excludeTools: string[] | undefined;
  private readonly toolDiscoveryCommand: string | undefined;
  private readonly toolCallCommand: string | undefined;
  private readonly mcpServerCommand: string | undefined;
  private readonly mcpServers: Record<string, MCPServerConfig> | undefined;
  private userMemory: string;
  private geminiMdFileCount: number;
  private approvalMode: ApprovalMode;
  private readonly showMemoryUsage: boolean;
  private readonly accessibility: AccessibilitySettings;
  private readonly telemetrySettings: TelemetrySettings;
  private readonly usageStatisticsEnabled: boolean;
  private agentsClient!: AgentsClient;
  private readonly fileFiltering: {
    respectGitIgnore: boolean;
    respectGeminiIgnore: boolean;
    enableRecursiveFileSearch: boolean;
    disableFuzzySearch: boolean;
  };
  private fileDiscoveryService: FileDiscoveryService | null = null;
  private gitService: GitService | undefined = undefined;
  private readonly checkpointing: boolean;
  private readonly proxy: string | undefined;
  private readonly cwd: string;
  private readonly bugCommand: BugCommandSettings | undefined;
  private readonly model: string;
  // Provider configuration
  private readonly provider: 'openai' | 'anthropic' | 'gemini';
  private readonly providerApiKey: string | undefined;
  private readonly providerUseOauth: boolean;
  private readonly extensionContextFilePaths: string[];
  private readonly noBrowser: boolean;
  private readonly folderTrustFeature: boolean;
  private readonly folderTrust: boolean;
  private ideMode: boolean;
  private ideClient!: IdeClient;
  private inFallbackMode = false;
  private readonly maxSessionTurns: number;
  private readonly listExtensions: boolean;
  private readonly _extensions: GeminiCLIExtension[];
  private readonly _blockedMcpServers: Array<{
    name: string;
    extensionName: string;
  }>;
  flashFallbackHandler?: FlashFallbackHandler;
  private quotaErrorOccurred: boolean = false;
  private readonly summarizeToolOutput:
    | Record<string, SummarizeToolOutputSettings>
    | undefined;
  private readonly experimentalZedIntegration: boolean = false;
  private readonly loadMemoryFromIncludeDirectories: boolean = false;
  private readonly chatCompression: ChatCompressionSettings | undefined;
  private readonly interactive: boolean;
  private readonly trustedFolder: boolean | undefined;
  private readonly useRipgrep: boolean;
  private readonly shouldUseNodePtyShell: boolean;
  private readonly skipNextSpeakerCheck: boolean;
  private readonly extensionManagement: boolean;
  private readonly enablePromptCompletion: boolean = false;
  private readonly autonomousMode: boolean;
  private readonly enableContinuousInput: boolean;
  private initialized: boolean = false;
  readonly storage: Storage;
  private readonly fileExclusions: FileExclusions;
  private readonly eventEmitter?: EventEmitter;
  private toolExecutionBridge?: ToolExecutionBridge;
  private planState: PlanState = { entries: [] };
  private toolApprovalHandlers?: {
    approve(callId: string, options?: { alwaysApprove?: boolean }): void;
    reject(callId: string, options?: { alwaysReject?: boolean }): void;
  };

  constructor(params: ConfigParameters) {
    this.sessionId = params.sessionId;
    this.embeddingModel =
      params.embeddingModel ?? DEFAULT_GEMINI_EMBEDDING_MODEL;
    this.fileSystemService = new StandardFileSystemService();
    this.sandbox = params.sandbox;
    this.targetDir = path.resolve(params.targetDir);
    this.workspaceContext = new WorkspaceContext(
      this.targetDir,
      params.includeDirectories ?? [],
    );
    this.debugMode = params.debugMode;
    this.question = params.question;
    this.fullContext = params.fullContext ?? false;
    this.coreTools = params.coreTools;
    this.allowedTools = params.allowedTools;
    this.excludeTools = params.excludeTools;
    this.toolDiscoveryCommand = params.toolDiscoveryCommand;
    this.toolCallCommand = params.toolCallCommand;
    this.mcpServerCommand = params.mcpServerCommand;
    this.mcpServers = params.mcpServers;
    this.userMemory = params.userMemory ?? '';
    this.geminiMdFileCount = params.geminiMdFileCount ?? 0;
    this.approvalMode = params.approvalMode ?? ApprovalMode.DEFAULT;
    this.showMemoryUsage = params.showMemoryUsage ?? false;
    this.accessibility = params.accessibility ?? {};
    this.telemetrySettings = {
      enabled: params.telemetry?.enabled ?? false,
      target: params.telemetry?.target ?? DEFAULT_TELEMETRY_TARGET,
      otlpEndpoint: params.telemetry?.otlpEndpoint ?? DEFAULT_OTLP_ENDPOINT,
      otlpProtocol: params.telemetry?.otlpProtocol,
      logPrompts: params.telemetry?.logPrompts ?? true,
      outfile: params.telemetry?.outfile,
    };
    this.usageStatisticsEnabled = params.usageStatisticsEnabled ?? true;

    this.fileFiltering = {
      respectGitIgnore: params.fileFiltering?.respectGitIgnore ?? true,
      respectGeminiIgnore: params.fileFiltering?.respectGeminiIgnore ?? true,
      enableRecursiveFileSearch:
        params.fileFiltering?.enableRecursiveFileSearch ?? true,
      disableFuzzySearch: params.fileFiltering?.disableFuzzySearch ?? false,
    };
    this.checkpointing = params.checkpointing ?? false;
    this.proxy = params.proxy;
    this.cwd = params.cwd ?? process.cwd();
    this.fileDiscoveryService = params.fileDiscoveryService ?? null;
    this.bugCommand = params.bugCommand;
    this.model = params.model;
    // Provider configuration
    this.provider = params.provider ?? 'gemini';
    this.providerApiKey = params.providerApiKey;
    this.providerUseOauth = params.providerUseOauth ?? false;
    this.extensionContextFilePaths = params.extensionContextFilePaths ?? [];
    this.maxSessionTurns = params.maxSessionTurns ?? -1;
    this.experimentalZedIntegration =
      params.experimentalZedIntegration ?? false;
    this.listExtensions = params.listExtensions ?? false;
    this._extensions = params.extensions ?? [];
    this._blockedMcpServers = params.blockedMcpServers ?? [];
    this.noBrowser = params.noBrowser ?? false;
    this.summarizeToolOutput = params.summarizeToolOutput;
    this.folderTrustFeature = params.folderTrustFeature ?? false;
    this.folderTrust = params.folderTrust ?? false;
    this.ideMode = params.ideMode ?? false;
    this.loadMemoryFromIncludeDirectories =
      params.loadMemoryFromIncludeDirectories ?? false;
    this.chatCompression = params.chatCompression;
    this.interactive = params.interactive ?? false;
    this.trustedFolder = params.trustedFolder;
    this.useRipgrep = params.useRipgrep ?? false;
    this.shouldUseNodePtyShell = params.shouldUseNodePtyShell ?? false;
    this.skipNextSpeakerCheck = params.skipNextSpeakerCheck ?? false;
    this.extensionManagement = params.extensionManagement ?? false;
    this.storage = new Storage(this.targetDir);
    this.enablePromptCompletion = params.enablePromptCompletion ?? false;
    this.autonomousMode = params.autonomousMode ?? false;
    this.enableContinuousInput = params.enableContinuousInput ?? false;
    this.fileExclusions = new FileExclusions(this);
    this.eventEmitter = params.eventEmitter;

    if (params.contextFileName) {
      setGeminiMdFilename(params.contextFileName);
    }

    if (this.telemetrySettings.enabled) {
      initializeTelemetry(this);
    }
  }

  /**
   * Must only be called once, throws if called again.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      throw Error('Config was already initialized');
    }
    this.initialized = true;
    this.ideClient = await IdeClient.getInstance();
    // Initialize centralized FileDiscoveryService
    this.getFileService();
    if (this.getCheckpointingEnabled()) {
      await this.getGitService();
    }
    this.promptRegistry = new PromptRegistry();
    this.toolRegistry = await this.createToolRegistry();
    logCliConfiguration(this, new StartSessionEvent(this, this.toolRegistry));
  }

  async refreshAuth(authMethod: AuthType) {
    console.log(`[Config.refreshAuth] Called with authMethod: ${authMethod}, provider: ${this.getProvider()}`);
    
    // Validate auth method for non-Gemini providers
    const currentProvider = this.getProvider();
    if (currentProvider !== 'gemini') {
      // Non-Gemini providers don't support OAuth
      if (authMethod === AuthType.LOGIN_WITH_GOOGLE || authMethod === AuthType.CLOUD_SHELL) {
        throw new Error(
          `OAuth authentication is not supported for ${currentProvider} provider. ` +
          `Please use API key authentication instead. ` +
          `Set ${currentProvider.toUpperCase()}_API_KEY environment variable or use --${currentProvider}-api-key flag. ` +
          `You can switch to ${currentProvider} using: /provider ${currentProvider}`
        );
      }
    }

    // Save the current conversation history and system prompt before creating a new client
    let existingHistory: Content[] = [];
    let previousSystemInstruction: string | undefined;
    if (this.agentsClient?.isInitialized()) {
      existingHistory = this.agentsClient.getHistory();
      previousSystemInstruction = this.agentsClient.getSystemInstruction();
    }

    // Create new content generator config (provider-aware logic is now in createContentGenerator)
    console.log(`[Config.refreshAuth] Creating content generator config`);
    const newContentGeneratorConfig = createContentGeneratorConfig(
      this,
      authMethod,
    );
    console.log(`[Config.refreshAuth] Content generator config created`);

    const newAgentsClient = new AgentsClient(this);
    console.log(`[Config.refreshAuth] Initializing AgentsClient`);
    await newAgentsClient.initialize(newContentGeneratorConfig);
    console.log(`[Config.refreshAuth] AgentsClient initialized`);

    // Vertex and Genai have incompatible encryption and sending history with
    // thoughtSignature from Genai to Vertex will fail, we need to strip them
    const fromGenaiToVertex =
      this.contentGeneratorConfig?.authType === AuthType.USE_GEMINI &&
      authMethod === AuthType.LOGIN_WITH_GOOGLE;

    // Only assign to instance properties after successful initialization
    this.contentGeneratorConfig = newContentGeneratorConfig;
    this.agentsClient = newAgentsClient;

    if (previousSystemInstruction) {
      newAgentsClient.setSystemInstruction(previousSystemInstruction);
    }

    if (existingHistory.length > 0) {
      newAgentsClient.setHistory(existingHistory, {
        stripThoughts: fromGenaiToVertex,
      });
    }

    // Reset the session flag since we're explicitly changing auth and using default model
    this.inFallbackMode = false;
    console.log(`[Config.refreshAuth] Completed successfully`);
  }

  getSessionId(): string {
    return this.sessionId;
  }

  shouldLoadMemoryFromIncludeDirectories(): boolean {
    return this.loadMemoryFromIncludeDirectories;
  }

  getContentGeneratorConfig(): ContentGeneratorConfig {
    return this.contentGeneratorConfig;
  }

  getModel(): string {
    return this.contentGeneratorConfig?.model || this.model;
  }

  setModel(newModel: string): void {
    if (this.contentGeneratorConfig) {
      this.contentGeneratorConfig.model = newModel;
    }
  }

  getProvider(): 'openai' | 'anthropic' | 'gemini' {
    return this.provider;
  }

  getProviderApiKey(): string | undefined {
    return this.providerApiKey;
  }

  getProviderUseOauth(): boolean {
    return this.providerUseOauth;
  }

  /**
   * Get OpenAI API key specifically for agent selection service
   */
  getOpenAIApiKey(): string | undefined {
    return process.env['OPENAI_API_KEY'];
  }

  setToolExecutionBridge(handler?: ToolExecutionBridge): void {
    this.toolExecutionBridge = handler;
  }

  getPlanState(): PlanState {
    return clonePlanState(this.planState);
  }

  setPlanState(plan: PlanState): void {
    this.planState = clonePlanState(plan);
  }

  setToolApprovalHandlers(handlers?: {
    approve(callId: string, options?: { alwaysApprove?: boolean }): void;
    reject(callId: string, options?: { alwaysReject?: boolean }): void;
  }): void {
    this.toolApprovalHandlers = handlers;
  }

  approveToolCall(callId: string, options?: { alwaysApprove?: boolean }): void {
    this.toolApprovalHandlers?.approve(callId, options);
  }

  rejectToolCall(callId: string, options?: { alwaysReject?: boolean }): void {
    this.toolApprovalHandlers?.reject(callId, options);
  }


  async executeToolCall(
    request: ToolCallRequestInfo,
    abortSignal: AbortSignal,
    metadata?: ToolExecutionMetadata,
  ): Promise<ToolCallResponseInfo> {
    if (this.toolExecutionBridge) {
      return this.toolExecutionBridge(request, abortSignal, metadata);
    }

    const { executeToolCall } = await import(
      '../core/nonInteractiveToolExecutor.js'
    );
    return executeToolCall(this, request, abortSignal);
  }

  /**
   * Switch to a different provider
   */
  async setProvider(newProvider: 'openai' | 'anthropic' | 'gemini'): Promise<void> {
    if (this.provider === newProvider) {
      return; // Already using this provider
    }

    // Update the provider configuration
    (this as any).provider = newProvider;
    
    // Determine appropriate auth type for the new provider
    let authType = this.contentGeneratorConfig?.authType || AuthType.USE_GEMINI;
    
    // For non-Gemini providers, force API key authentication
    if (newProvider !== 'gemini') {
      // OAuth methods are not supported for OpenAI/Anthropic, use API key instead
      if (authType === AuthType.LOGIN_WITH_GOOGLE || authType === AuthType.CLOUD_SHELL || authType === AuthType.USE_VERTEX_AI) {
        authType = AuthType.USE_GEMINI; // This represents API key authentication
      }
    }

    // Reinitialize the AgentsClient with the new provider
    await this.refreshAuth(authType);
  }

  /**
   * Get the current system prompt
   */
  getSystemPrompt(): string {
    return (this as any).agentSystemPrompt || '';
  }

  /**
   * Set a custom system prompt (used by AgentManager)
   */
  async setSystemPrompt(prompt: string): Promise<void> {
    (this as any).agentSystemPrompt = prompt;
    
    // CRITICAL: DON'T refresh the client - that would lose conversation history!
    // Instead, update the system instruction in the EXISTING chat if one exists
    // This preserves all conversation context for long-running multi-agent tasks
    
    // Update the active AgentsClient so the new system instruction is applied on subsequent turns
    if (this.agentsClient) {
      this.agentsClient.setSystemInstruction(prompt);
      console.log('[Config] Updated system instruction for AgentsClient - conversation history preserved');
    }
  }

  /**
   * Clear the custom system prompt and restore default
   */
  async clearSystemPrompt(): Promise<void> {
    (this as any).agentSystemPrompt = undefined;
    
    // CRITICAL: DON'T refresh the client - preserve conversation history
    // When agentSystemPrompt is undefined, the system will use the base prompt
    // The base prompt will be applied on the next message automatically
    
    // If there's an active chat, clear its custom system instruction
    // Note: We can't easily get the base system prompt here without complex logic,
    // so we'll let it be applied naturally on the next turn
    if (this.agentsClient) {
      this.agentsClient.clearSystemInstruction();
      console.log('[Config] Cleared agent system instruction - base prompt will be restored on next turn');
    }
  }

  /**
   * Initialize the agent manager
   */
  initializeAgentManager(): void {
    const { AgentManager } = require('../agents/agentManager.js');
    const agentManager = AgentManager.getInstance();
    agentManager.initialize(this);
  }

  isInFallbackMode(): boolean {
    return this.inFallbackMode;
  }

  setFallbackMode(active: boolean): void {
    this.inFallbackMode = active;
  }

  setFlashFallbackHandler(handler: FlashFallbackHandler): void {
    this.flashFallbackHandler = handler;
  }

  getMaxSessionTurns(): number {
    return this.maxSessionTurns;
  }

  setQuotaErrorOccurred(value: boolean): void {
    this.quotaErrorOccurred = value;
  }

  getQuotaErrorOccurred(): boolean {
    return this.quotaErrorOccurred;
  }

  getEmbeddingModel(): string {
    return this.embeddingModel;
  }

  getSandbox(): SandboxConfig | undefined {
    return this.sandbox;
  }

  isRestrictiveSandbox(): boolean {
    const sandboxConfig = this.getSandbox();
    const seatbeltProfile = process.env['SEATBELT_PROFILE'];
    return (
      !!sandboxConfig &&
      sandboxConfig.command === 'sandbox-exec' &&
      !!seatbeltProfile &&
      seatbeltProfile.startsWith('restrictive-')
    );
  }

  getTargetDir(): string {
    return this.targetDir;
  }

  getProjectRoot(): string {
    return this.targetDir;
  }

  getWorkspaceContext(): WorkspaceContext {
    return this.workspaceContext;
  }

  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  getPromptRegistry(): PromptRegistry {
    return this.promptRegistry;
  }

  getDebugMode(): boolean {
    return this.debugMode;
  }
  getQuestion(): string | undefined {
    return this.question;
  }

  getFullContext(): boolean {
    return this.fullContext;
  }

  getCoreTools(): string[] | undefined {
    return this.coreTools;
  }

  getAllowedTools(): string[] | undefined {
    return this.allowedTools;
  }

  getExcludeTools(): string[] | undefined {
    return this.excludeTools;
  }

  getToolDiscoveryCommand(): string | undefined {
    return this.toolDiscoveryCommand;
  }

  getToolCallCommand(): string | undefined {
    return this.toolCallCommand;
  }

  getMcpServerCommand(): string | undefined {
    return this.mcpServerCommand;
  }

  getMcpServers(): Record<string, MCPServerConfig> | undefined {
    return this.mcpServers;
  }

  getUserMemory(): string {
    return this.userMemory;
  }

  setUserMemory(newUserMemory: string): void {
    this.userMemory = newUserMemory;
  }

  getGeminiMdFileCount(): number {
    return this.geminiMdFileCount;
  }

  setGeminiMdFileCount(count: number): void {
    this.geminiMdFileCount = count;
  }

  getApprovalMode(): ApprovalMode {
    return this.approvalMode;
  }

  setApprovalMode(mode: ApprovalMode): void {
    if (!this.isTrustedFolder() && mode !== ApprovalMode.DEFAULT) {
      throw new Error(
        'Cannot enable privileged approval modes in an untrusted folder.',
      );
    }
    this.approvalMode = mode;
  }

  getShowMemoryUsage(): boolean {
    return this.showMemoryUsage;
  }

  getAccessibility(): AccessibilitySettings {
    return this.accessibility;
  }

  getTelemetryEnabled(): boolean {
    return this.telemetrySettings.enabled ?? false;
  }

  getTelemetryLogPromptsEnabled(): boolean {
    return this.telemetrySettings.logPrompts ?? true;
  }

  getTelemetryOtlpEndpoint(): string {
    return this.telemetrySettings.otlpEndpoint ?? DEFAULT_OTLP_ENDPOINT;
  }

  getTelemetryOtlpProtocol(): 'grpc' | 'http' {
    return this.telemetrySettings.otlpProtocol ?? 'grpc';
  }

  getTelemetryTarget(): TelemetryTarget {
    return this.telemetrySettings.target ?? DEFAULT_TELEMETRY_TARGET;
  }

  getTelemetryOutfile(): string | undefined {
    return this.telemetrySettings.outfile;
  }

  getConversationClient(): AgentsClient {
    return this.agentsClient;
  }

  getAgentsClient(): AgentsClient {
    return this.getConversationClient();
  }

  getEnableRecursiveFileSearch(): boolean {
    return this.fileFiltering.enableRecursiveFileSearch;
  }

  getFileFilteringDisableFuzzySearch(): boolean {
    return this.fileFiltering.disableFuzzySearch;
  }

  getFileFilteringRespectGitIgnore(): boolean {
    return this.fileFiltering.respectGitIgnore;
  }
  getFileFilteringRespectGeminiIgnore(): boolean {
    return this.fileFiltering.respectGeminiIgnore;
  }

  getFileFilteringOptions(): FileFilteringOptions {
    return {
      respectGitIgnore: this.fileFiltering.respectGitIgnore,
      respectGeminiIgnore: this.fileFiltering.respectGeminiIgnore,
    };
  }

  /**
   * Gets custom file exclusion patterns from configuration.
   * TODO: This is a placeholder implementation. In the future, this could
   * read from settings files, CLI arguments, or environment variables.
   */
  getCustomExcludes(): string[] {
    // Placeholder implementation - returns empty array for now
    // Future implementation could read from:
    // - User settings file
    // - Project-specific configuration
    // - Environment variables
    // - CLI arguments
    return [];
  }

  getCheckpointingEnabled(): boolean {
    return this.checkpointing;
  }

  getProxy(): string | undefined {
    return this.proxy;
  }

  getWorkingDir(): string {
    return this.cwd;
  }

  getBugCommand(): BugCommandSettings | undefined {
    return this.bugCommand;
  }

  getFileService(): FileDiscoveryService {
    if (!this.fileDiscoveryService) {
      this.fileDiscoveryService = new FileDiscoveryService(this.targetDir);
    }
    return this.fileDiscoveryService;
  }

  getUsageStatisticsEnabled(): boolean {
    return this.usageStatisticsEnabled;
  }

  getExtensionContextFilePaths(): string[] {
    return this.extensionContextFilePaths;
  }

  getExperimentalZedIntegration(): boolean {
    return this.experimentalZedIntegration;
  }

  getListExtensions(): boolean {
    return this.listExtensions;
  }

  getExtensionManagement(): boolean {
    return this.extensionManagement;
  }

  getExtensions(): GeminiCLIExtension[] {
    return this._extensions;
  }

  getBlockedMcpServers(): Array<{ name: string; extensionName: string }> {
    return this._blockedMcpServers;
  }

  getNoBrowser(): boolean {
    return this.noBrowser;
  }

  isBrowserLaunchSuppressed(): boolean {
    return this.getNoBrowser() || !shouldAttemptBrowserLaunch();
  }

  getSummarizeToolOutputConfig():
    | Record<string, SummarizeToolOutputSettings>
    | undefined {
    return this.summarizeToolOutput;
  }

  getIdeMode(): boolean {
    return this.ideMode;
  }

  getFolderTrustFeature(): boolean {
    return this.folderTrustFeature;
  }

  getFolderTrust(): boolean {
    return this.folderTrust;
  }

  isTrustedFolder(): boolean {
    // isWorkspaceTrusted in cli/src/config/trustedFolder.js returns undefined
    // when the file based trust value is unavailable, since it is mainly used
    // in the initialization for trust dialogs, etc. Here we return true since
    // config.isTrustedFolder() is used for the main business logic of blocking
    // tool calls etc in the rest of the application.
    //
    // Default value is true since we load with trusted settings to avoid
    // restarts in the more common path. If the user chooses to mark the folder
    // as untrusted, the CLI will restart and we will have the trust value
    // reloaded.
    return this.trustedFolder ?? true;
  }

  setIdeMode(value: boolean): void {
    this.ideMode = value;
  }

  async setIdeModeAndSyncConnection(value: boolean): Promise<void> {
    this.ideMode = value;
    if (value) {
      await this.ideClient.connect();
      logIdeConnection(this, new IdeConnectionEvent(IdeConnectionType.SESSION));
    } else {
      await this.ideClient.disconnect();
    }
  }

  getIdeClient(): IdeClient {
    return this.ideClient;
  }

  /**
   * Get the current FileSystemService
   */
  getFileSystemService(): FileSystemService {
    return this.fileSystemService;
  }

  /**
   * Set a custom FileSystemService
   */
  setFileSystemService(fileSystemService: FileSystemService): void {
    this.fileSystemService = fileSystemService;
  }

  getChatCompression(): ChatCompressionSettings | undefined {
    return this.chatCompression;
  }

  isInteractive(): boolean {
    return this.interactive;
  }

  getUseRipgrep(): boolean {
    return this.useRipgrep;
  }

  getShouldUseNodePtyShell(): boolean {
    return this.shouldUseNodePtyShell;
  }

  getSkipNextSpeakerCheck(): boolean {
    return this.skipNextSpeakerCheck;
  }

  getScreenReader(): boolean {
    return this.accessibility.screenReader ?? false;
  }

  getEnablePromptCompletion(): boolean {
    return this.enablePromptCompletion;
  }

  isAutonomousMode(): boolean {
    return this.autonomousMode;
  }

  isContinuousInputEnabled(): boolean {
    return this.enableContinuousInput;
  }

  async getGitService(): Promise<GitService> {
    if (!this.gitService) {
      this.gitService = new GitService(this.targetDir, this.storage);
      await this.gitService.initialize();
    }
    return this.gitService;
  }

  getFileExclusions(): FileExclusions {
    return this.fileExclusions;
  }

  async createToolRegistry(): Promise<ToolRegistry> {
    const registry = new ToolRegistry(this, this.eventEmitter);

    // helper to create & register core tools that are enabled
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const registerCoreTool = (ToolClass: any, ...args: unknown[]) => {
      const className = ToolClass.name;
      const toolName = ToolClass.Name || className;
      const coreTools = this.getCoreTools();
      const excludeTools = this.getExcludeTools() || [];

      let isEnabled = true; // Enabled by default if coreTools is not set.
      if (coreTools) {
        isEnabled = coreTools.some(
          (tool) =>
            tool === className ||
            tool === toolName ||
            tool.startsWith(`${className}(`) ||
            tool.startsWith(`${toolName}(`),
        );
      }

      const isExcluded = excludeTools.some(
        (tool) => tool === className || tool === toolName,
      );

      if (isExcluded) {
        isEnabled = false;
      }

      if (isEnabled) {
        registry.registerTool(new ToolClass(...args));
      }
    };

    registerCoreTool(LSTool, this);
    registerCoreTool(ReadFileTool, this);

    if (this.getUseRipgrep()) {
      registerCoreTool(RipGrepTool, this);
    } else {
      registerCoreTool(GrepTool, this);
    }

    registerCoreTool(GlobTool, this);
    registerCoreTool(EditTool, this);
    registerCoreTool(WriteFileTool, this);
    registerCoreTool(WebFetchTool, this);
    registerCoreTool(ReadManyFilesTool, this);
    registerCoreTool(ShellTool, this);
    registerCoreTool(LocalShellTool, this);
    registerCoreTool(MemoryTool);
    registerCoreTool(UpdatePlanTool, this);
    registerCoreTool(WebSearchTool, this);
    registerCoreTool(ImageGenerationTool, this);

    await registry.discoverAllTools();
    return registry;
  }
}
// Export model constants for use in CLI
export { DEFAULT_GEMINI_FLASH_MODEL };
