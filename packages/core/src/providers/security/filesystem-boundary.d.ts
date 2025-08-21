/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { ProviderType } from '../types.js';
import { SecurityLevel, SecurityViolation, SecurityContext } from './types.js';
import { ToolExecutionContext, UnifiedToolCall } from '../builtin-tool-manager.js';
export interface FileSystemBoundaryConfig {
    allowedDirectories: string[];
    blockedDirectories: string[];
    safeDirectories: string[];
    allowHomeDirectory: boolean;
    allowTempDirectory: boolean;
    allowCurrentWorkingDirectory: boolean;
    allowRelativePaths: boolean;
    allowedExtensions: string[];
    blockedExtensions: string[];
    maxFileSize: number;
    providerOverrides: {
        [K in ProviderType]?: Partial<FileSystemBoundaryConfig>;
    };
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
export declare enum FileOperation {
    READ = "read",
    WRITE = "write",
    APPEND = "append",
    DELETE = "delete",
    CREATE = "create",
    MOVE = "move",
    COPY = "copy",
    LIST = "list",
    STAT = "stat"
}
export declare class FileSystemBoundary {
    private config;
    private safeDirectoryCache;
    private violationLog;
    constructor(config: FileSystemBoundaryConfig);
    /**
     * Validate a file path for a specific provider and operation
     */
    validatePath(context: FileOperationContext): Promise<PathValidationResult>;
    /**
     * Enforce filesystem boundary for tool execution
     */
    enforceFileSystemBoundary(context: ToolExecutionContext): Promise<PathValidationResult[]>;
    /**
     * Get provider-specific configuration
     */
    private getProviderConfig;
    /**
     * Perform basic path validation
     */
    private performBasicValidation;
    /**
     * Validate directory boundary restrictions
     */
    private validateDirectoryBoundary;
    /**
     * Validate file type restrictions
     */
    private validateFileType;
    /**
     * Validate file size restrictions
     */
    private validateFileSize;
    /**
     * Assess overall security level for a path
     */
    private assessSecurityLevel;
    /**
     * Handle security violations based on enforcement level
     */
    private handleSecurityViolation;
    /**
     * Utility methods
     */
    private resolvePath;
    private detectPathTraversal;
    private containsDangerousCharacters;
    private isPathWithinDirectory;
    private isWithinCurrentWorkingDirectory;
    private isWithinHomeDirectory;
    private isWithinTempDirectory;
    private getFileExtension;
    private isExecutableFile;
    private isSystemPath;
    private isConfigurationFile;
    private extractFilePathsFromToolCall;
    private inferFileOperation;
    private determineSecurityLevel;
    private suggestAlternativePaths;
    private normalizeConfig;
    private initializeSafeDirectories;
    private createDefaultSecurityContext;
    private recordAuditEvent;
    private isAllowedAbsolutePath;
}
export declare class SecurityError extends Error {
    securityLevel: SecurityLevel;
    violations: SecurityViolation[];
    constructor(message: string, securityLevel: SecurityLevel, violations: SecurityViolation[]);
}
export declare const DEFAULT_FILESYSTEM_BOUNDARY_CONFIG: FileSystemBoundaryConfig;
