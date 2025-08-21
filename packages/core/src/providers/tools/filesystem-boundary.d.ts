/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Config } from '../../config/config.js';
/**
 * Enforces file system boundaries for all providers to ensure security and consistency.
 * This class ensures that file operations are restricted to appropriate directories
 * and respects git ignore rules when configured.
 *
 * All built-in file system tools should use this boundary enforcement to maintain
 * consistent security across OpenAI, Anthropic, and Gemini providers.
 */
export declare class FileSystemBoundary {
    private config;
    private projectRoot;
    private allowedPaths;
    private gitIgnoreFilter?;
    constructor(config: Config);
    /**
     * Initialize git ignore filtering if configured.
     * This should be called after construction to set up git ignore rules.
     */
    initialize(): Promise<void>;
    /**
     * Check if a path is within allowed boundaries.
     * This is the core security check for file system operations.
     *
     * @param targetPath - Path to validate
     * @returns True if path is within allowed boundaries
     */
    isPathAllowed(targetPath: string): boolean;
    /**
     * Check if a path should be ignored based on git ignore rules.
     * This respects .gitignore patterns to avoid operating on ignored files.
     *
     * @param targetPath - Path to check
     * @returns True if path should be ignored
     */
    shouldIgnorePath(targetPath: string): Promise<boolean>;
    /**
     * Get a safe display path that doesn't expose sensitive information.
     * Shows relative path when within project, absolute path otherwise.
     *
     * @param targetPath - Path to display safely
     * @returns Safe display path
     */
    getSafeDisplayPath(targetPath: string): string;
    /**
     * Validate and normalize a file path for operations.
     * Returns normalized path if valid, throws error if invalid.
     *
     * @param targetPath - Path to validate and normalize
     * @param operation - Description of operation for error messages
     * @returns Normalized, validated path
     * @throws Error if path is not allowed
     */
    validatePath(targetPath: string, operation?: string): Promise<string>;
    /**
     * Validate multiple paths for operations.
     *
     * @param targetPaths - Array of paths to validate
     * @param operation - Description of operation for error messages
     * @returns Array of normalized, validated paths
     */
    validatePaths(targetPaths: string[], operation?: string): Promise<string[]>;
    /**
     * Check if path is safe for read operations.
     * Read operations have less strict boundaries than write operations.
     *
     * @param targetPath - Path to check for reading
     * @returns True if path can be safely read
     */
    isSafeForRead(targetPath: string): boolean;
    /**
     * Check if path is safe for write operations.
     * Write operations require stricter validation.
     *
     * @param targetPath - Path to check for writing
     * @returns True if path can be safely written to
     */
    isSafeForWrite(targetPath: string): Promise<boolean>;
    /**
     * Get the project root directory.
     *
     * @returns Absolute path to project root
     */
    getProjectRoot(): string;
    /**
     * Get all allowed paths.
     *
     * @returns Set of allowed absolute paths
     */
    getAllowedPaths(): Set<string>;
    /**
     * Check if one path is within another path.
     *
     * @private
     */
    private isWithinPath;
    /**
     * Normalize a file path for consistent handling.
     *
     * @private
     */
    private normalizePath;
    /**
     * Get additional allowed paths from configuration.
     * This could be extended to read from config in the future.
     *
     * @private
     */
    private getAdditionalAllowedPaths;
    /**
     * Determine if git ignore rules should be respected.
     *
     * @private
     */
    private shouldRespectGitIgnore;
}
/**
 * Path validation result with detailed information.
 */
export interface PathValidationResult {
    /** Whether the path is valid */
    valid: boolean;
    /** Normalized path if valid */
    normalizedPath?: string;
    /** Error message if invalid */
    error?: string;
    /** Whether path would be ignored by git */
    ignored?: boolean;
    /** Whether path is within project boundaries */
    withinBoundaries?: boolean;
}
/**
 * Advanced path validation with detailed results.
 * Useful for tools that need detailed validation information.
 */
export declare class AdvancedPathValidator {
    private boundary;
    constructor(boundary: FileSystemBoundary);
    /**
     * Validate a path with detailed result information.
     *
     * @param targetPath - Path to validate
     * @param operation - Operation description
     * @returns Detailed validation result
     */
    validateWithDetails(targetPath: string, operation?: string): Promise<PathValidationResult>;
}
