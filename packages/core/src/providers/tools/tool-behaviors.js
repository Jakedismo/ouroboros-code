/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { ApprovalMode } from '../../config/config.js';
import { Kind } from '../../tools/tools.js';
/**
 * Encapsulates tool-specific behaviors and constraints across all providers.
 * This ensures consistent security boundaries and behavior regardless of which
 * LLM provider is being used.
 *
 * Each built-in tool has specific configuration that defines how it should behave,
 * what confirmations it requires, and what security boundaries it respects.
 */
export class ToolBehaviorManager {
    config;
    constructor(config) {
        this.config = config;
    }
    /**
     * Get tool-specific configuration for behavior management.
     * This defines how each of the 11 built-in tools should behave across all providers.
     *
     * @param toolName - Name of the tool
     * @returns Configuration object defining tool behavior
     */
    getToolConfig(toolName) {
        switch (toolName) {
            // File System Tools (7 tools)
            case 'write_file':
                return {
                    requiresConfirmation: this.requiresFileConfirmation(),
                    respectsGitIgnore: true,
                    boundToProjectRoot: true,
                    supportsDiff: true,
                    maxFileSize: 10 * 1024 * 1024, // 10MB limit
                };
            case 'replace':
                return {
                    requiresConfirmation: this.requiresFileConfirmation(),
                    respectsGitIgnore: true,
                    boundToProjectRoot: true,
                    supportsDiff: true,
                    maxFileSize: 10 * 1024 * 1024, // 10MB limit
                };
            case 'read_file':
                return {
                    requiresConfirmation: false,
                    respectsGitIgnore: false, // Reading can access ignored files
                    boundToProjectRoot: true,
                    maxFileSize: 50 * 1024 * 1024, // 50MB limit for reading
                };
            case 'read_many_files':
                return {
                    requiresConfirmation: false,
                    respectsGitIgnore: false,
                    boundToProjectRoot: true,
                    maxItems: 100, // Max 100 files
                    maxFileSize: 10 * 1024 * 1024, // 10MB per file
                };
            case 'list_directory':
                return {
                    requiresConfirmation: false,
                    respectsGitIgnore: false,
                    boundToProjectRoot: true,
                    maxItems: 1000, // Max 1000 entries
                };
            case 'search_file_content':
                return {
                    requiresConfirmation: false,
                    respectsGitIgnore: true,
                    boundToProjectRoot: true,
                    maxResults: 1000,
                };
            case 'glob':
                return {
                    requiresConfirmation: false,
                    respectsGitIgnore: true,
                    boundToProjectRoot: true,
                    maxResults: 1000,
                };
            // System Tools (2 tools)
            case 'run_shell_command':
                return {
                    requiresConfirmation: true,
                    allowlist: this.getShellAllowlist(),
                    timeout: 30000, // 30 second timeout
                    boundToProjectRoot: true,
                };
            case 'save_memory':
                return {
                    requiresConfirmation: this.shouldConfirmMemory(),
                    persistsAcrossSessions: true,
                    hierarchical: true,
                    globalPath: this.getMemoryPath(),
                };
            // Web Tools (2 tools)
            case 'web_fetch':
                return {
                    requiresConfirmation: this.shouldConfirmWebFetch(),
                    maxItems: 20,
                    timeout: 10000, // 10 second timeout
                    blocksPrivateIPs: true,
                };
            case 'google_web_search':
                return {
                    requiresConfirmation: false,
                    requiresGeminiAPI: true,
                    maxResults: 10,
                    timeout: 10000,
                };
            default:
                // Default configuration for unknown tools
                return {
                    requiresConfirmation: false,
                    boundToProjectRoot: true,
                };
        }
    }
    /**
     * Get tool category for permissions and UI organization.
     *
     * @param toolName - Name of the tool
     * @returns Tool kind/category
     */
    getToolKind(toolName) {
        const fileSystemTools = ['write_file', 'replace', 'read_file', 'read_many_files', 'list_directory'];
        const searchTools = ['search_file_content', 'glob'];
        const webTools = ['web_fetch', 'google_web_search'];
        const systemTools = ['run_shell_command'];
        const memoryTools = ['save_memory'];
        if (fileSystemTools.includes(toolName)) {
            if (toolName.startsWith('read') || toolName.startsWith('list')) {
                return Kind.Read;
            }
            return Kind.Edit;
        }
        else if (searchTools.includes(toolName)) {
            return Kind.Search;
        }
        else if (webTools.includes(toolName)) {
            return Kind.Fetch;
        }
        else if (systemTools.includes(toolName)) {
            return Kind.Execute;
        }
        else if (memoryTools.includes(toolName)) {
            return Kind.Think;
        }
        return Kind.Other;
    }
    /**
     * Check if a tool is considered safe for automatic execution.
     * Safe tools don't modify state or access external resources.
     *
     * @param toolName - Name of the tool
     * @returns True if tool is safe for auto-execution
     */
    isToolSafe(toolName) {
        const safeTools = [
            'read_file',
            'read_many_files',
            'list_directory',
            'search_file_content',
            'glob',
            'google_web_search'
        ];
        return safeTools.includes(toolName);
    }
    /**
     * Check if a tool modifies the file system.
     *
     * @param toolName - Name of the tool
     * @returns True if tool modifies files
     */
    isToolDestructive(toolName) {
        const destructiveTools = [
            'write_file',
            'replace',
            'run_shell_command'
        ];
        return destructiveTools.includes(toolName);
    }
    /**
     * Get timeout for tool execution.
     *
     * @param toolName - Name of the tool
     * @returns Timeout in milliseconds
     */
    getToolTimeout(toolName) {
        const config = this.getToolConfig(toolName);
        return config.timeout || 60000; // Default 60 second timeout
    }
    /**
     * Determine if file operations require confirmation.
     *
     * @private
     */
    requiresFileConfirmation() {
        const mode = this.config.getApprovalMode();
        return mode !== ApprovalMode.AUTO_EDIT && mode !== ApprovalMode.YOLO;
    }
    /**
     * Determine if memory operations require confirmation.
     *
     * @private
     */
    shouldConfirmMemory() {
        // Memory operations are generally safe, only confirm in strict mode
        return this.config.getApprovalMode() === ApprovalMode.DEFAULT;
    }
    /**
     * Determine if web fetch operations require confirmation.
     *
     * @private
     */
    shouldConfirmWebFetch() {
        // Web fetches can access external resources, confirm unless in YOLO mode
        return this.config.getApprovalMode() !== ApprovalMode.YOLO;
    }
    /**
     * Get shell command allowlist from configuration.
     *
     * @private
     */
    getShellAllowlist() {
        // For now, return a basic safe set of commands
        // This could be extended to read from config in the future
        const safeCommands = new Set([
            'ls',
            'pwd',
            'whoami',
            'date',
            'npm test',
            'npm run test',
            'npm run build',
            'npm run lint',
            'npm run format',
            'git status',
            'git log --oneline',
            'git branch',
            'git diff --name-only',
        ]);
        return safeCommands;
    }
    /**
     * Get global memory storage path.
     *
     * @private
     */
    getMemoryPath() {
        // Use project root as default memory path
        // Could be extended to support global user memory location
        return this.config.getProjectRoot();
    }
    /**
     * Validate tool parameters for security.
     *
     * @param toolName - Name of the tool
     * @param params - Tool parameters
     * @returns Validation error message or null if valid
     */
    validateToolSecurity(toolName, params) {
        const config = this.getToolConfig(toolName);
        // Check file size limits
        if (config.maxFileSize && params.content && typeof params.content === 'string') {
            const contentSize = Buffer.byteLength(params.content, 'utf8');
            if (contentSize > config.maxFileSize) {
                return `Content size (${contentSize} bytes) exceeds maximum allowed size (${config.maxFileSize} bytes)`;
            }
        }
        // Check item limits
        if (config.maxItems) {
            if (params.paths && Array.isArray(params.paths) && params.paths.length > config.maxItems) {
                return `Number of items (${params.paths.length}) exceeds maximum allowed (${config.maxItems})`;
            }
            if (params.urls && Array.isArray(params.urls) && params.urls.length > config.maxItems) {
                return `Number of URLs (${params.urls.length}) exceeds maximum allowed (${config.maxItems})`;
            }
        }
        // Shell command validation
        if (toolName === 'run_shell_command' && params.command && config.allowlist) {
            const command = params.command;
            const isAllowed = Array.from(config.allowlist).some(allowedCmd => command === allowedCmd || command.startsWith(`${allowedCmd} `));
            if (!isAllowed) {
                return `Shell command "${command}" is not in the allowlist`;
            }
        }
        return null;
    }
}
//# sourceMappingURL=tool-behaviors.js.map