/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * FileSystemBoundary - Cross-provider filesystem security enforcement
 *
 * Ensures file operations are restricted to safe directories across all LLM providers,
 * preventing path traversal attacks and unauthorized file access.
 */

import { join, resolve, relative, isAbsolute, sep } from 'path';
import { existsSync, statSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { LLMProvider } from '../types.js';
import { SecurityLevel, SecurityViolation, SecurityContext } from './types.js';
import { ToolExecutionContext, UnifiedToolCall } from '../tools/unified-tool-interface.js';

// Type alias for backward compatibility
type ProviderType = LLMProvider;

export interface FileSystemBoundaryConfig {
  // Allowed directories
  allowedDirectories: string[];

  // Blocked directories (takes precedence over allowed)
  blockedDirectories: string[];

  // Safe directories (always allowed)
  safeDirectories: string[];

  // Directory restrictions
  allowHomeDirectory: boolean;
  allowTempDirectory: boolean;
  allowCurrentWorkingDirectory: boolean;
  allowRelativePaths: boolean;

  // File type restrictions
  allowedExtensions: string[];
  blockedExtensions: string[];
  maxFileSize: number; // bytes

  // Provider-specific overrides
  providerOverrides: {
    [K in ProviderType]?: Partial<FileSystemBoundaryConfig>;
  };

  // Security settings
  strictMode: boolean;
  enforcementLevel: 'warn' | 'block' | 'audit';
  logViolations: boolean;
}

export interface PathValidationResult {
  allowed: boolean;
  resolvedPath: string;
  securityLevel: SecurityLevel;
  violations: SecurityViolation[];
  reasoning: string;
  alternativePaths?: string[];
}

export interface FileOperationContext {
  operation: FileOperation;
  requestedPath: string;
  provider: ProviderType;
  toolCall: UnifiedToolCall;
  securityContext: SecurityContext;
  workingDirectory?: string;
}

export enum FileOperation {
  READ = 'read',
  WRITE = 'write',
  APPEND = 'append',
  DELETE = 'delete',
  CREATE = 'create',
  MOVE = 'move',
  COPY = 'copy',
  LIST = 'list',
  STAT = 'stat',
}

export class FileSystemBoundary {
  private config: FileSystemBoundaryConfig;
  private safeDirectoryCache = new Map<string, boolean>();
  private violationLog: SecurityViolation[] = [];

  constructor(config: FileSystemBoundaryConfig) {
    this.config = this.normalizeConfig(config);
    this.initializeSafeDirectories();
  }

  /**
   * Validate a file path for a specific provider and operation
   */
  async validatePath(
    context: FileOperationContext,
  ): Promise<PathValidationResult> {
    const providerConfig = this.getProviderConfig(context.provider);
    const resolvedPath = this.resolvePath(
      context.requestedPath,
      context.workingDirectory,
    );

    // Initial validation
    const basicValidation = this.performBasicValidation(resolvedPath, context);
    if (!basicValidation.allowed) {
      return basicValidation;
    }

    // Directory boundary validation
    const boundaryValidation = this.validateDirectoryBoundary(
      resolvedPath,
      providerConfig,
    );
    if (!boundaryValidation.allowed) {
      return boundaryValidation;
    }

    // File type validation
    const fileTypeValidation = this.validateFileType(
      resolvedPath,
      context.operation,
      providerConfig,
    );
    if (!fileTypeValidation.allowed) {
      return fileTypeValidation;
    }

    // Size validation (for existing files)
    const sizeValidation = await this.validateFileSize(
      resolvedPath,
      providerConfig,
    );
    if (!sizeValidation.allowed) {
      return sizeValidation;
    }

    // Security level assessment
    const securityLevel = this.assessSecurityLevel(resolvedPath, context);

    return {
      allowed: true,
      resolvedPath,
      securityLevel,
      violations: [],
      reasoning: `Path validated successfully for ${context.operation} operation`,
      alternativePaths: this.suggestAlternativePaths(resolvedPath, context),
    };
  }

  /**
   * Enforce filesystem boundary for tool execution
   */
  async enforceFileSystemBoundary(
    context: ToolExecutionContext,
  ): Promise<PathValidationResult[]> {
    const results: PathValidationResult[] = [];

    // Extract file paths from tool parameters
    if (!context.toolCall) {
      return results;
    }
    const filePaths = this.extractFilePathsFromToolCall(context.toolCall);

    for (const filePath of filePaths) {
      const fileContext: FileOperationContext = {
        operation: this.inferFileOperation(context.toolCall!.name),
        requestedPath: filePath,
        provider: context.provider as LLMProvider,
        toolCall: context.toolCall!,
        securityContext:
          context.securityContext || this.createDefaultSecurityContext(),
        workingDirectory: process.cwd(),
      };

      const result = await this.validatePath(fileContext);
      results.push(result);

      // Handle violations
      if (!result.allowed) {
        await this.handleSecurityViolation(result, fileContext);

        if (this.config.enforcementLevel === 'block') {
          throw new SecurityError(
            `File system boundary violation: ${result.reasoning}`,
            SecurityLevel.DANGEROUS,
            result.violations,
          );
        }
      }
    }

    return results;
  }

  /**
   * Get provider-specific configuration
   */
  private getProviderConfig(provider: ProviderType): FileSystemBoundaryConfig {
    const baseConfig = { ...this.config };
    const providerOverrides = this.config.providerOverrides[provider] || {};

    return {
      ...baseConfig,
      ...providerOverrides,
    };
  }

  /**
   * Perform basic path validation
   */
  private performBasicValidation(
    resolvedPath: string,
    context: FileOperationContext,
  ): PathValidationResult {
    const violations: SecurityViolation[] = [];

    // Check for path traversal attempts
    if (this.detectPathTraversal(context.requestedPath)) {
      violations.push({
        type: 'path_traversal',
        severity: 'high',
        description: 'Potential path traversal attack detected',
        path: context.requestedPath,
        provider: context.provider,
      });
    }

    // Check for null bytes and other dangerous characters
    if (this.containsDangerousCharacters(context.requestedPath)) {
      violations.push({
        type: 'dangerous_characters',
        severity: 'high',
        description: 'Dangerous characters detected in path',
        path: context.requestedPath,
        provider: context.provider,
      });
    }

    // Check absolute path restrictions
    if (isAbsolute(context.requestedPath) && this.config.strictMode) {
      if (!this.isAllowedAbsolutePath(resolvedPath)) {
        violations.push({
          type: 'absolute_path_restriction',
          severity: 'medium',
          description: 'Absolute paths restricted in strict mode',
          path: resolvedPath,
          provider: context.provider,
        });
      }
    }

    const allowed = violations.length === 0;

    return {
      allowed,
      resolvedPath,
      securityLevel: allowed ? SecurityLevel.SAFE : SecurityLevel.DANGEROUS,
      violations,
      reasoning: allowed
        ? 'Basic validation passed'
        : `Basic validation failed: ${violations.map((v) => v.description).join(', ')}`,
    };
  }

  /**
   * Validate directory boundary restrictions
   */
  private validateDirectoryBoundary(
    resolvedPath: string,
    config: FileSystemBoundaryConfig,
  ): PathValidationResult {
    const violations: SecurityViolation[] = [];

    // Check blocked directories first (highest priority)
    for (const blockedDir of config.blockedDirectories) {
      if (this.isPathWithinDirectory(resolvedPath, blockedDir)) {
        violations.push({
          type: 'blocked_directory',
          severity: 'critical',
          description: `Path is within blocked directory: ${blockedDir}`,
          path: resolvedPath,
          provider: null,
        });
        break;
      }
    }

    // If not blocked, check if explicitly allowed
    let explicitlyAllowed = false;

    // Check safe directories
    for (const safeDir of config.safeDirectories) {
      if (this.isPathWithinDirectory(resolvedPath, safeDir)) {
        explicitlyAllowed = true;
        break;
      }
    }

    // Check allowed directories
    if (!explicitlyAllowed) {
      for (const allowedDir of config.allowedDirectories) {
        if (this.isPathWithinDirectory(resolvedPath, allowedDir)) {
          explicitlyAllowed = true;
          break;
        }
      }
    }

    // Check standard directory permissions
    if (!explicitlyAllowed) {
      if (
        config.allowCurrentWorkingDirectory &&
        this.isWithinCurrentWorkingDirectory(resolvedPath)
      ) {
        explicitlyAllowed = true;
      } else if (
        config.allowHomeDirectory &&
        this.isWithinHomeDirectory(resolvedPath)
      ) {
        explicitlyAllowed = true;
      } else if (
        config.allowTempDirectory &&
        this.isWithinTempDirectory(resolvedPath)
      ) {
        explicitlyAllowed = true;
      }
    }

    if (!explicitlyAllowed && violations.length === 0) {
      violations.push({
        type: 'directory_not_allowed',
        severity: 'medium',
        description: 'Path is not within any allowed directory',
        path: resolvedPath,
        provider: null,
      });
    }

    const allowed =
      violations.length === 0 ||
      violations.every((v) => v.severity !== 'critical');

    return {
      allowed,
      resolvedPath,
      securityLevel: this.determineSecurityLevel(violations),
      violations,
      reasoning: allowed
        ? 'Directory boundary validation passed'
        : `Directory boundary violation: ${violations.map((v) => v.description).join(', ')}`,
    };
  }

  /**
   * Validate file type restrictions
   */
  private validateFileType(
    resolvedPath: string,
    operation: FileOperation,
    config: FileSystemBoundaryConfig,
  ): PathValidationResult {
    const violations: SecurityViolation[] = [];
    const extension = this.getFileExtension(resolvedPath);

    // Check blocked extensions
    if (config.blockedExtensions.includes(extension)) {
      violations.push({
        type: 'blocked_file_type',
        severity: 'high',
        description: `File extension '${extension}' is blocked`,
        path: resolvedPath,
        provider: null,
      });
    }

    // Check allowed extensions (if specified)
    if (
      config.allowedExtensions.length > 0 &&
      !config.allowedExtensions.includes(extension)
    ) {
      violations.push({
        type: 'file_type_not_allowed',
        severity: 'medium',
        description: `File extension '${extension}' is not in allowed list`,
        path: resolvedPath,
        provider: null,
      });
    }

    // Check for executable files
    if (
      this.isExecutableFile(resolvedPath) &&
      ['write', 'create', 'move', 'copy'].includes(operation)
    ) {
      violations.push({
        type: 'executable_file_creation',
        severity: 'high',
        description: 'Creating or modifying executable files is restricted',
        path: resolvedPath,
        provider: null,
      });
    }

    const allowed = violations.length === 0;

    return {
      allowed,
      resolvedPath,
      securityLevel: this.determineSecurityLevel(violations),
      violations,
      reasoning: allowed
        ? 'File type validation passed'
        : `File type violation: ${violations.map((v) => v.description).join(', ')}`,
    };
  }

  /**
   * Validate file size restrictions
   */
  private async validateFileSize(
    resolvedPath: string,
    config: FileSystemBoundaryConfig,
  ): Promise<PathValidationResult> {
    const violations: SecurityViolation[] = [];

    try {
      if (existsSync(resolvedPath)) {
        const stats = statSync(resolvedPath);

        if (stats.size > config.maxFileSize) {
          violations.push({
            type: 'file_size_exceeded',
            severity: 'medium',
            description: `File size (${stats.size}) exceeds maximum allowed (${config.maxFileSize})`,
            path: resolvedPath,
            provider: null,
          });
        }
      }
    } catch (error) {
      // File doesn't exist or can't be accessed - not a size violation
    }

    const allowed = violations.length === 0;

    return {
      allowed,
      resolvedPath,
      securityLevel: this.determineSecurityLevel(violations),
      violations,
      reasoning: allowed
        ? 'File size validation passed'
        : `File size violation: ${violations.map((v) => v.description).join(', ')}`,
    };
  }

  /**
   * Assess overall security level for a path
   */
  private assessSecurityLevel(
    resolvedPath: string,
    context: FileOperationContext,
  ): SecurityLevel {
    // System directories are dangerous
    if (this.isSystemPath(resolvedPath)) {
      return SecurityLevel.DANGEROUS;
    }

    // Executable files are moderate risk
    if (this.isExecutableFile(resolvedPath)) {
      return SecurityLevel.MODERATE;
    }

    // Configuration files are moderate risk
    if (this.isConfigurationFile(resolvedPath)) {
      return SecurityLevel.MODERATE;
    }

    // Write operations to safe directories are moderate
    if (['write', 'create', 'delete', 'move'].includes(context.operation)) {
      return SecurityLevel.MODERATE;
    }

    // Read operations to allowed directories are safe
    return SecurityLevel.SAFE;
  }

  /**
   * Handle security violations based on enforcement level
   */
  private async handleSecurityViolation(
    result: PathValidationResult,
    context: FileOperationContext,
  ): Promise<void> {
    // Log violation
    if (this.config.logViolations) {
      this.violationLog.push(...result.violations);
      console.warn(`FileSystem Boundary Violation: ${result.reasoning}`, {
        path: result.resolvedPath,
        provider: context.provider,
        operation: context.operation,
        violations: result.violations,
      });
    }

    // Audit mode - record for analysis
    if (this.config.enforcementLevel === 'audit') {
      await this.recordAuditEvent(result, context);
    }

    // Warn mode - notify but allow
    if (this.config.enforcementLevel === 'warn') {
      console.warn(`FileSystem Security Warning: ${result.reasoning}`);
    }

    // Block mode handled by caller throwing SecurityError
  }

  /**
   * Utility methods
   */
  private resolvePath(
    requestedPath: string,
    workingDirectory?: string,
  ): string {
    if (isAbsolute(requestedPath)) {
      return resolve(requestedPath);
    }

    const baseDir = workingDirectory || process.cwd();
    return resolve(baseDir, requestedPath);
  }

  private detectPathTraversal(path: string): boolean {
    return path.includes('..') || path.includes('/..');
  }

  private containsDangerousCharacters(path: string): boolean {
    // Check for null bytes, control characters, etc.
    return /[\x00-\x1f\x7f-\x9f]/.test(path) || path.includes('\0');
  }

  private isPathWithinDirectory(path: string, directory: string): boolean {
    const resolvedDir = resolve(directory);
    const resolvedPath = resolve(path);
    const relativePath = relative(resolvedDir, resolvedPath);

    return !relativePath.startsWith('..') && !isAbsolute(relativePath);
  }

  private isWithinCurrentWorkingDirectory(path: string): boolean {
    return this.isPathWithinDirectory(path, process.cwd());
  }

  private isWithinHomeDirectory(path: string): boolean {
    return this.isPathWithinDirectory(path, homedir());
  }

  private isWithinTempDirectory(path: string): boolean {
    return this.isPathWithinDirectory(path, tmpdir());
  }

  private getFileExtension(path: string): string {
    const lastDot = path.lastIndexOf('.');
    const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));

    if (lastDot > lastSlash) {
      return path.substring(lastDot + 1).toLowerCase();
    }

    return '';
  }

  private isExecutableFile(path: string): boolean {
    const extension = this.getFileExtension(path);
    const executableExtensions = [
      'exe',
      'bat',
      'cmd',
      'sh',
      'bash',
      'zsh',
      'ps1',
      'py',
      'pl',
      'rb',
    ];
    return executableExtensions.includes(extension);
  }

  private isSystemPath(path: string): boolean {
    const systemPaths = [
      '/etc',
      '/bin',
      '/sbin',
      '/usr/bin',
      '/usr/sbin',
      '/root',
      'C:\\Windows',
      'C:\\System32',
    ];
    return systemPaths.some((sysPath) =>
      this.isPathWithinDirectory(path, sysPath),
    );
  }

  private isConfigurationFile(path: string): boolean {
    const configExtensions = [
      'conf',
      'config',
      'cfg',
      'ini',
      'yml',
      'yaml',
      'json',
    ];
    const extension = this.getFileExtension(path);
    return configExtensions.includes(extension) || path.includes('.env');
  }

  private extractFilePathsFromToolCall(toolCall: UnifiedToolCall): string[] {
    const paths: string[] = [];

    // Common file path parameter names
    const pathParams = [
      'path',
      'file',
      'filename',
      'filepath',
      'source',
      'destination',
      'output',
    ];

    for (const param of pathParams) {
      if (toolCall.parameters && toolCall.parameters[param]) {
        paths.push(String(toolCall.parameters[param]));
      }
    }

    // Tool-specific parameter extraction
    switch (toolCall.name) {
      case 'write_file':
      case 'read_file':
      case 'edit_file':
        if (toolCall.parameters && toolCall.parameters['file_path']) {
          paths.push(String(toolCall.parameters['file_path']));
        }
        break;
      case 'glob':
        if (toolCall.parameters && toolCall.parameters['pattern']) {
          // Extract directory from glob pattern
          const dir = String(toolCall.parameters['pattern']).split('*')[0];
          if (dir) paths.push(dir);
        }
        break;
    }

    return paths.filter((p) => typeof p === 'string' && p.length > 0);
  }

  private inferFileOperation(toolName: string): FileOperation {
    const operationMap: Record<string, FileOperation> = {
      read_file: FileOperation.READ,
      write_file: FileOperation.WRITE,
      edit_file: FileOperation.WRITE,
      delete_file: FileOperation.DELETE,
      move_file: FileOperation.MOVE,
      copy_file: FileOperation.COPY,
      list_files: FileOperation.LIST,
      glob: FileOperation.LIST,
      stat_file: FileOperation.STAT,
    };

    return operationMap[toolName] || FileOperation.READ;
  }

  private determineSecurityLevel(
    violations: SecurityViolation[],
  ): SecurityLevel {
    if (violations.some((v) => v.severity === 'critical')) {
      return SecurityLevel.DANGEROUS;
    }
    if (violations.some((v) => v.severity === 'high')) {
      return SecurityLevel.DANGEROUS;
    }
    if (violations.some((v) => v.severity === 'medium')) {
      return SecurityLevel.MODERATE;
    }
    return SecurityLevel.SAFE;
  }

  private suggestAlternativePaths(
    resolvedPath: string,
    context: FileOperationContext,
  ): string[] {
    const alternatives: string[] = [];

    // Suggest current working directory alternative
    const filename = resolvedPath.split(sep).pop();
    if (filename && this.config.allowCurrentWorkingDirectory) {
      alternatives.push(join(process.cwd(), filename));
    }

    // Suggest temp directory alternative
    if (filename && this.config.allowTempDirectory) {
      alternatives.push(join(tmpdir(), filename));
    }

    return alternatives;
  }

  private normalizeConfig(
    config: FileSystemBoundaryConfig,
  ): FileSystemBoundaryConfig {
    return {
      ...config,
      allowedDirectories: config.allowedDirectories.map((dir) => resolve(dir)),
      blockedDirectories: config.blockedDirectories.map((dir) => resolve(dir)),
      safeDirectories: config.safeDirectories.map((dir) => resolve(dir)),
    };
  }

  private initializeSafeDirectories(): void {
    // Initialize commonly safe directories
    const commonSafeDirs = [
      join(process.cwd(), 'data'),
      join(process.cwd(), 'output'),
      join(process.cwd(), 'temp'),
      join(tmpdir(), 'gemini-cli'),
    ];

    for (const dir of commonSafeDirs) {
      this.safeDirectoryCache.set(dir, true);
    }
  }

  private createDefaultSecurityContext(): SecurityContext {
    return {
      sessionId: 'default',
      permissions: [],
      riskLevel: SecurityLevel.MODERATE,
    };
  }

  private async recordAuditEvent(
    result: PathValidationResult,
    context: FileOperationContext,
  ): Promise<void> {
    // Implementation for audit logging
    const auditEvent = {
      timestamp: new Date().toISOString(),
      type: 'filesystem_boundary_violation',
      path: result.resolvedPath,
      provider: context.provider,
      operation: context.operation,
      violations: result.violations,
      securityLevel: result.securityLevel,
      reasoning: result.reasoning,
    };

    // In production, this would write to audit log
    console.log('AUDIT:', JSON.stringify(auditEvent, null, 2));
  }

  private isAllowedAbsolutePath(path: string): boolean {
    // Check if absolute path is in allowed directories
    return (
      this.config.allowedDirectories.some((allowed) =>
        this.isPathWithinDirectory(path, allowed),
      ) ||
      this.config.safeDirectories.some((safe) =>
        this.isPathWithinDirectory(path, safe),
      )
    );
  }
}

// Security error class
export class SecurityError extends Error {
  constructor(
    message: string,
    public securityLevel: SecurityLevel,
    public violations: SecurityViolation[],
  ) {
    super(message);
    this.name = 'SecurityError';
  }
}

// Default configuration
export const DEFAULT_FILESYSTEM_BOUNDARY_CONFIG: FileSystemBoundaryConfig = {
  allowedDirectories: [
    process.cwd(),
    join(process.cwd(), 'data'),
    join(process.cwd(), 'output'),
    join(process.cwd(), 'docs'),
  ],
  blockedDirectories: [
    '/etc',
    '/bin',
    '/sbin',
    '/usr/bin',
    '/usr/sbin',
    '/root',
    join(homedir(), '.ssh'),
    join(homedir(), '.aws'),
    join(homedir(), '.config'),
  ],
  safeDirectories: [join(process.cwd(), 'temp'), join(tmpdir(), 'gemini-cli')],
  allowHomeDirectory: false,
  allowTempDirectory: true,
  allowCurrentWorkingDirectory: true,
  allowRelativePaths: true,
  allowedExtensions: [], // Empty means all allowed
  blockedExtensions: ['exe', 'bat', 'cmd', 'sh', 'bash', 'ps1'],
  maxFileSize: 100 * 1024 * 1024, // 100MB
  providerOverrides: {
    [LLMProvider.GEMINI]: {
      strictMode: false,
    },
    [LLMProvider.OPENAI]: {
      strictMode: true,
      allowHomeDirectory: false,
    },
    [LLMProvider.ANTHROPIC]: {
      strictMode: true,
      allowHomeDirectory: false,
    },
  },
  strictMode: false,
  enforcementLevel: 'warn',
  logViolations: true,
};
