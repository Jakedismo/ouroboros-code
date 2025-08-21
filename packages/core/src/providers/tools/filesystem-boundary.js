/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as path from 'path';
import { GitIgnoreParser } from '../../utils/gitIgnoreParser.js';
/**
 * Enforces file system boundaries for all providers to ensure security and consistency.
 * This class ensures that file operations are restricted to appropriate directories
 * and respects git ignore rules when configured.
 *
 * All built-in file system tools should use this boundary enforcement to maintain
 * consistent security across OpenAI, Anthropic, and Gemini providers.
 */
export class FileSystemBoundary {
    config;
    projectRoot;
    allowedPaths;
    gitIgnoreFilter;
    constructor(config) {
        this.config = config;
        this.projectRoot = config.getProjectRoot() || process.cwd();
        this.allowedPaths = new Set([
            this.projectRoot,
            // Add any additional allowed paths from config
            ...this.getAdditionalAllowedPaths(),
        ]);
    }
    /**
     * Initialize git ignore filtering if configured.
     * This should be called after construction to set up git ignore rules.
     */
    async initialize() {
        if (this.shouldRespectGitIgnore()) {
            this.gitIgnoreFilter = new GitIgnoreParser(this.projectRoot);
            this.gitIgnoreFilter.loadGitRepoPatterns();
        }
    }
    /**
     * Check if a path is within allowed boundaries.
     * This is the core security check for file system operations.
     *
     * @param targetPath - Path to validate
     * @returns True if path is within allowed boundaries
     */
    isPathAllowed(targetPath) {
        const resolvedPath = path.resolve(targetPath);
        // Check if path is within project root
        if (this.isWithinPath(resolvedPath, this.projectRoot)) {
            return true;
        }
        // Check additional allowed paths
        for (const allowedPath of this.allowedPaths) {
            if (this.isWithinPath(resolvedPath, allowedPath)) {
                return true;
            }
        }
        return false;
    }
    /**
     * Check if a path should be ignored based on git ignore rules.
     * This respects .gitignore patterns to avoid operating on ignored files.
     *
     * @param targetPath - Path to check
     * @returns True if path should be ignored
     */
    async shouldIgnorePath(targetPath) {
        if (!this.gitIgnoreFilter) {
            return false;
        }
        // Convert to relative path from project root for git ignore checking
        const relativePath = path.relative(this.projectRoot, path.resolve(targetPath));
        // Don't ignore if the path is outside the project
        if (relativePath.startsWith('..')) {
            return false;
        }
        return this.gitIgnoreFilter.isIgnored(relativePath);
    }
    /**
     * Get a safe display path that doesn't expose sensitive information.
     * Shows relative path when within project, absolute path otherwise.
     *
     * @param targetPath - Path to display safely
     * @returns Safe display path
     */
    getSafeDisplayPath(targetPath) {
        const resolvedPath = path.resolve(targetPath);
        if (this.isWithinPath(resolvedPath, this.projectRoot)) {
            const relativePath = path.relative(this.projectRoot, resolvedPath);
            // Return './' prefix for clarity when in project root
            return relativePath === '' ? './' : relativePath;
        }
        return resolvedPath;
    }
    /**
     * Validate and normalize a file path for operations.
     * Returns normalized path if valid, throws error if invalid.
     *
     * @param targetPath - Path to validate and normalize
     * @param operation - Description of operation for error messages
     * @returns Normalized, validated path
     * @throws Error if path is not allowed
     */
    async validatePath(targetPath, operation = 'access') {
        if (!targetPath) {
            throw new Error(`Invalid path: path is required for ${operation}`);
        }
        const normalizedPath = this.normalizePath(targetPath);
        if (!this.isPathAllowed(normalizedPath)) {
            throw new Error(`Access denied: Cannot ${operation} path outside project boundaries: ${this.getSafeDisplayPath(normalizedPath)}`);
        }
        if (await this.shouldIgnorePath(normalizedPath)) {
            throw new Error(`Path ignored: Cannot ${operation} ignored path: ${this.getSafeDisplayPath(normalizedPath)}`);
        }
        return normalizedPath;
    }
    /**
     * Validate multiple paths for operations.
     *
     * @param targetPaths - Array of paths to validate
     * @param operation - Description of operation for error messages
     * @returns Array of normalized, validated paths
     */
    async validatePaths(targetPaths, operation = 'access') {
        if (!Array.isArray(targetPaths)) {
            throw new Error(`Invalid paths: array is required for ${operation}`);
        }
        const validatedPaths = [];
        for (const targetPath of targetPaths) {
            validatedPaths.push(await this.validatePath(targetPath, operation));
        }
        return validatedPaths;
    }
    /**
     * Check if path is safe for read operations.
     * Read operations have less strict boundaries than write operations.
     *
     * @param targetPath - Path to check for reading
     * @returns True if path can be safely read
     */
    isSafeForRead(targetPath) {
        // Reading is generally safer, allow if within project bounds
        return this.isPathAllowed(targetPath);
    }
    /**
     * Check if path is safe for write operations.
     * Write operations require stricter validation.
     *
     * @param targetPath - Path to check for writing
     * @returns True if path can be safely written to
     */
    async isSafeForWrite(targetPath) {
        if (!this.isPathAllowed(targetPath)) {
            return false;
        }
        // Don't write to ignored paths unless specifically configured to allow it
        if (await this.shouldIgnorePath(targetPath)) {
            return false;
        }
        // Additional write safety checks could be added here
        // e.g., checking for system files, read-only directories, etc.
        return true;
    }
    /**
     * Get the project root directory.
     *
     * @returns Absolute path to project root
     */
    getProjectRoot() {
        return this.projectRoot;
    }
    /**
     * Get all allowed paths.
     *
     * @returns Set of allowed absolute paths
     */
    getAllowedPaths() {
        return new Set(this.allowedPaths);
    }
    /**
     * Check if one path is within another path.
     *
     * @private
     */
    isWithinPath(targetPath, basePath) {
        const relative = path.relative(basePath, targetPath);
        return !relative.startsWith('..') && !path.isAbsolute(relative);
    }
    /**
     * Normalize a file path for consistent handling.
     *
     * @private
     */
    normalizePath(targetPath) {
        // Resolve path to handle relative paths and symbolic links
        return path.resolve(targetPath);
    }
    /**
     * Get additional allowed paths from configuration.
     * This could be extended to read from config in the future.
     *
     * @private
     */
    getAdditionalAllowedPaths() {
        // For now, return empty array
        // Could be extended to support user-configured additional paths
        return [];
    }
    /**
     * Determine if git ignore rules should be respected.
     *
     * @private
     */
    shouldRespectGitIgnore() {
        // This would ideally come from configuration
        // For now, default to respecting git ignore rules
        return true;
    }
}
/**
 * Advanced path validation with detailed results.
 * Useful for tools that need detailed validation information.
 */
export class AdvancedPathValidator {
    boundary;
    constructor(boundary) {
        this.boundary = boundary;
    }
    /**
     * Validate a path with detailed result information.
     *
     * @param targetPath - Path to validate
     * @param operation - Operation description
     * @returns Detailed validation result
     */
    async validateWithDetails(targetPath, operation = 'access') {
        try {
            if (!targetPath) {
                return {
                    valid: false,
                    error: `Invalid path: path is required for ${operation}`,
                };
            }
            const normalizedPath = path.resolve(targetPath);
            const withinBoundaries = this.boundary.isPathAllowed(normalizedPath);
            const ignored = await this.boundary.shouldIgnorePath(normalizedPath);
            if (!withinBoundaries) {
                return {
                    valid: false,
                    normalizedPath,
                    error: `Access denied: Cannot ${operation} path outside project boundaries`,
                    ignored,
                    withinBoundaries: false,
                };
            }
            if (ignored) {
                return {
                    valid: false,
                    normalizedPath,
                    error: `Path ignored: Cannot ${operation} ignored path`,
                    ignored: true,
                    withinBoundaries: true,
                };
            }
            return {
                valid: true,
                normalizedPath,
                ignored: false,
                withinBoundaries: true,
            };
        }
        catch (error) {
            return {
                valid: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
}
//# sourceMappingURL=filesystem-boundary.js.map