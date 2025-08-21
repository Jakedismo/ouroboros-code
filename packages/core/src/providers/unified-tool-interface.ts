/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { UnifiedTool } from './types.js';

/**
 * Categories of built-in tools for organization and filtering
 */
export enum ToolCategory {
  FILE_OPERATIONS = 'file_operations',
  FILE_DISCOVERY = 'file_discovery',
  SYSTEM_OPERATIONS = 'system_operations',
  WEB_OPERATIONS = 'web_operations',
  MEMORY_MANAGEMENT = 'memory_management',
}

/**
 * Security levels for tool operations
 */
export enum ToolSecurityLevel {
  SAFE = 'safe', // Read-only operations, safe for auto-execution
  MODERATE = 'moderate', // File modifications, may require confirmation
  DANGEROUS = 'dangerous', // System operations, always require confirmation
}

/**
 * Metadata for built-in tools describing their capabilities and security implications
 */
export interface BuiltinToolMetadata {
  name: string;
  displayName: string;
  category: ToolCategory;
  securityLevel: ToolSecurityLevel;
  description: string;
  capabilities: string[];
  requiresConfirmation: boolean;
  canModifyFiles: boolean;
  canExecuteCommands: boolean;
  canAccessNetwork: boolean;
  supportedProviders: string[];
  examples?: ToolExample[];
}

export interface ToolExample {
  description: string;
  parameters: Record<string, any>;
  expectedResult: string;
}

/**
 * Unified interface for all built-in tools across providers
 * This interface ensures consistent tool behavior regardless of which LLM provider is used
 */
export class UnifiedToolInterface {
  /**
   * Registry of all built-in tools with their metadata
   */
  static readonly BUILTIN_TOOLS: Record<string, BuiltinToolMetadata> = {
    // File Operations
    read_file: {
      name: 'read_file',
      displayName: 'Read File',
      category: ToolCategory.FILE_OPERATIONS,
      securityLevel: ToolSecurityLevel.SAFE,
      description:
        'Reads and returns the content of a specified file with support for pagination',
      capabilities: [
        'Read text files with line-based pagination',
        'Read binary files (images, PDFs) with content extraction',
        'Handle large files with truncation and offset support',
        'Respect workspace boundaries and .geminiignore patterns',
      ],
      requiresConfirmation: false,
      canModifyFiles: false,
      canExecuteCommands: false,
      canAccessNetwork: false,
      supportedProviders: ['gemini', 'openai', 'anthropic'],
      examples: [
        {
          description: 'Read entire file',
          parameters: { absolute_path: '/path/to/file.txt' },
          expectedResult: 'File content as string',
        },
        {
          description: 'Read with pagination',
          parameters: {
            absolute_path: '/path/to/file.txt',
            offset: 10,
            limit: 20,
          },
          expectedResult: 'Lines 10-29 of the file',
        },
      ],
    },

    write_file: {
      name: 'write_file',
      displayName: 'Write File',
      category: ToolCategory.FILE_OPERATIONS,
      securityLevel: ToolSecurityLevel.MODERATE,
      description: 'Creates or overwrites files with specified content',
      capabilities: [
        'Create new files with content',
        'Overwrite existing files',
        'Respect workspace boundaries',
        'Handle text and binary content',
      ],
      requiresConfirmation: true,
      canModifyFiles: true,
      canExecuteCommands: false,
      canAccessNetwork: false,
      supportedProviders: ['gemini', 'openai', 'anthropic'],
      examples: [
        {
          description: 'Create new file',
          parameters: {
            absolute_path: '/path/to/new-file.txt',
            content: 'Hello, world!',
          },
          expectedResult: 'File created successfully',
        },
      ],
    },

    edit: {
      name: 'edit',
      displayName: 'Edit File',
      category: ToolCategory.FILE_OPERATIONS,
      securityLevel: ToolSecurityLevel.MODERATE,
      description: 'Performs find-and-replace operations on files',
      capabilities: [
        'Find and replace text in files',
        'Support for regular expressions',
        'Multiple replacement operations',
        'Preview changes before applying',
      ],
      requiresConfirmation: true,
      canModifyFiles: true,
      canExecuteCommands: false,
      canAccessNetwork: false,
      supportedProviders: ['gemini', 'openai', 'anthropic'],
      examples: [
        {
          description: 'Simple text replacement',
          parameters: {
            absolute_path: '/path/to/file.txt',
            find_text: 'old value',
            replace_text: 'new value',
          },
          expectedResult: 'Text replaced successfully',
        },
      ],
    },

    read_many_files: {
      name: 'read_many_files',
      displayName: 'Read Multiple Files',
      category: ToolCategory.FILE_OPERATIONS,
      securityLevel: ToolSecurityLevel.SAFE,
      description:
        'Reads multiple files efficiently with batching and filtering',
      capabilities: [
        'Read multiple files in a single operation',
        'Support for glob patterns',
        'Automatic batching for large file sets',
        'Content filtering and summarization',
      ],
      requiresConfirmation: false,
      canModifyFiles: false,
      canExecuteCommands: false,
      canAccessNetwork: false,
      supportedProviders: ['gemini', 'openai', 'anthropic'],
      examples: [
        {
          description: 'Read all TypeScript files',
          parameters: { file_paths: ['/project/**/*.ts'] },
          expectedResult: 'Combined content of all TypeScript files',
        },
      ],
    },

    // File Discovery
    ls: {
      name: 'ls',
      displayName: 'List Files',
      category: ToolCategory.FILE_DISCOVERY,
      securityLevel: ToolSecurityLevel.SAFE,
      description: 'Lists files and directories with detailed metadata',
      capabilities: [
        'List directory contents with metadata',
        'Support for recursive listing',
        'File size, modification time, permissions',
        'Filtering by file types and patterns',
      ],
      requiresConfirmation: false,
      canModifyFiles: false,
      canExecuteCommands: false,
      canAccessNetwork: false,
      supportedProviders: ['gemini', 'openai', 'anthropic'],
      examples: [
        {
          description: 'List current directory',
          parameters: { path: '.' },
          expectedResult: 'List of files and directories with metadata',
        },
      ],
    },

    glob: {
      name: 'glob',
      displayName: 'Find Files by Pattern',
      category: ToolCategory.FILE_DISCOVERY,
      securityLevel: ToolSecurityLevel.SAFE,
      description: 'Finds files matching glob patterns with advanced filtering',
      capabilities: [
        'Pattern-based file matching (*.js, **/*.test.ts)',
        'Recursive directory traversal',
        'Exclude patterns and filtering',
        'Performance-optimized search',
      ],
      requiresConfirmation: false,
      canModifyFiles: false,
      canExecuteCommands: false,
      canAccessNetwork: false,
      supportedProviders: ['gemini', 'openai', 'anthropic'],
      examples: [
        {
          description: 'Find all JavaScript files',
          parameters: { pattern: '**/*.js' },
          expectedResult: 'List of matching file paths',
        },
      ],
    },

    grep: {
      name: 'grep',
      displayName: 'Search File Contents',
      category: ToolCategory.FILE_DISCOVERY,
      securityLevel: ToolSecurityLevel.SAFE,
      description: 'Searches for text patterns within files using ripgrep',
      capabilities: [
        'Fast text search with regex support',
        'Context lines (before/after matches)',
        'File type filtering',
        'Case-sensitive/insensitive search',
        'Multi-line pattern matching',
      ],
      requiresConfirmation: false,
      canModifyFiles: false,
      canExecuteCommands: false,
      canAccessNetwork: false,
      supportedProviders: ['gemini', 'openai', 'anthropic'],
      examples: [
        {
          description: 'Search for function definitions',
          parameters: { pattern: 'function\\s+\\w+', file_pattern: '*.js' },
          expectedResult: 'List of matching lines with context',
        },
      ],
    },

    // System Operations
    shell_command: {
      name: 'shell_command',
      displayName: 'Execute Shell Command',
      category: ToolCategory.SYSTEM_OPERATIONS,
      securityLevel: ToolSecurityLevel.DANGEROUS,
      description:
        'Executes system commands with security controls and monitoring',
      capabilities: [
        'Execute arbitrary shell commands',
        'Real-time output streaming',
        'Working directory control',
        'Environment variable support',
        'Timeout and resource limits',
        'Security boundary enforcement',
      ],
      requiresConfirmation: true,
      canModifyFiles: true,
      canExecuteCommands: true,
      canAccessNetwork: true,
      supportedProviders: ['gemini', 'openai', 'anthropic'],
      examples: [
        {
          description: 'List processes',
          parameters: { command: 'ps aux' },
          expectedResult: 'Process list output',
        },
        {
          description: 'Run tests',
          parameters: { command: 'npm test', working_dir: '/project' },
          expectedResult: 'Test execution output',
        },
      ],
    },

    // Web Operations
    web_fetch: {
      name: 'web_fetch',
      displayName: 'Fetch Web Content',
      category: ToolCategory.WEB_OPERATIONS,
      securityLevel: ToolSecurityLevel.MODERATE,
      description: 'Fetches and processes web content with intelligent parsing',
      capabilities: [
        'HTTP/HTTPS content fetching',
        'HTML to markdown conversion',
        'Content extraction and cleaning',
        'Response caching',
        'Custom headers and authentication',
      ],
      requiresConfirmation: false,
      canModifyFiles: false,
      canExecuteCommands: false,
      canAccessNetwork: true,
      supportedProviders: ['gemini', 'openai', 'anthropic'],
      examples: [
        {
          description: 'Fetch webpage content',
          parameters: { url: 'https://example.com' },
          expectedResult: 'Cleaned webpage content in markdown',
        },
      ],
    },

    web_search: {
      name: 'web_search',
      displayName: 'Web Search',
      category: ToolCategory.WEB_OPERATIONS,
      securityLevel: ToolSecurityLevel.SAFE,
      description: 'Performs web searches with result processing and ranking',
      capabilities: [
        'Web search with multiple search engines',
        'Result ranking and filtering',
        'Content summarization',
        'Safe search enforcement',
        'Rate limiting and caching',
      ],
      requiresConfirmation: false,
      canModifyFiles: false,
      canExecuteCommands: false,
      canAccessNetwork: true,
      supportedProviders: ['gemini', 'openai', 'anthropic'],
      examples: [
        {
          description: 'Search for programming tutorials',
          parameters: { query: 'TypeScript tutorial 2024' },
          expectedResult: 'Ranked list of relevant search results',
        },
      ],
    },

    // Memory Management
    memory: {
      name: 'memory',
      displayName: 'Memory Management',
      category: ToolCategory.MEMORY_MANAGEMENT,
      securityLevel: ToolSecurityLevel.SAFE,
      description: 'Manages conversation memory and context persistence',
      capabilities: [
        'Store and retrieve conversation context',
        'Hierarchical memory organization',
        'Content summarization for long contexts',
        'Memory search and filtering',
        'Automatic context optimization',
      ],
      requiresConfirmation: false,
      canModifyFiles: false,
      canExecuteCommands: false,
      canAccessNetwork: false,
      supportedProviders: ['gemini', 'openai', 'anthropic'],
      examples: [
        {
          description: 'Store important context',
          parameters: {
            operation: 'store',
            content: 'Project uses React with TypeScript',
          },
          expectedResult: 'Context stored successfully',
        },
      ],
    },
  };

  /**
   * Get tool metadata by name
   */
  static getToolMetadata(toolName: string): BuiltinToolMetadata | undefined {
    return this.BUILTIN_TOOLS[toolName];
  }

  /**
   * Get all tools in a specific category
   */
  static getToolsByCategory(category: ToolCategory): BuiltinToolMetadata[] {
    return Object.values(this.BUILTIN_TOOLS).filter(
      (tool) => tool.category === category,
    );
  }

  /**
   * Get tools by security level
   */
  static getToolsBySecurityLevel(
    level: ToolSecurityLevel,
  ): BuiltinToolMetadata[] {
    return Object.values(this.BUILTIN_TOOLS).filter(
      (tool) => tool.securityLevel === level,
    );
  }

  /**
   * Get tools that require confirmation
   */
  static getToolsRequiringConfirmation(): BuiltinToolMetadata[] {
    return Object.values(this.BUILTIN_TOOLS).filter(
      (tool) => tool.requiresConfirmation,
    );
  }

  /**
   * Get tools that can modify files
   */
  static getFileModifyingTools(): BuiltinToolMetadata[] {
    return Object.values(this.BUILTIN_TOOLS).filter(
      (tool) => tool.canModifyFiles,
    );
  }

  /**
   * Get tools that can execute commands
   */
  static getCommandExecutingTools(): BuiltinToolMetadata[] {
    return Object.values(this.BUILTIN_TOOLS).filter(
      (tool) => tool.canExecuteCommands,
    );
  }

  /**
   * Get tools that can access network
   */
  static getNetworkAccessingTools(): BuiltinToolMetadata[] {
    return Object.values(this.BUILTIN_TOOLS).filter(
      (tool) => tool.canAccessNetwork,
    );
  }

  /**
   * Check if a tool is supported by a specific provider
   */
  static isToolSupportedByProvider(
    toolName: string,
    provider: string,
  ): boolean {
    const metadata = this.getToolMetadata(toolName);
    return metadata ? metadata.supportedProviders.includes(provider) : false;
  }

  /**
   * Get all tool names
   */
  static getAllToolNames(): string[] {
    return Object.keys(this.BUILTIN_TOOLS);
  }

  /**
   * Get tool statistics
   */
  static getToolStatistics(): {
    totalTools: number;
    byCategory: Record<ToolCategory, number>;
    bySecurityLevel: Record<ToolSecurityLevel, number>;
    requiresConfirmation: number;
    canModifyFiles: number;
    canExecuteCommands: number;
    canAccessNetwork: number;
  } {
    const tools = Object.values(this.BUILTIN_TOOLS);

    const byCategory = {} as Record<ToolCategory, number>;
    const bySecurityLevel = {} as Record<ToolSecurityLevel, number>;

    // Initialize counters
    Object.values(ToolCategory).forEach(
      (category) => (byCategory[category] = 0),
    );
    Object.values(ToolSecurityLevel).forEach(
      (level) => (bySecurityLevel[level] = 0),
    );

    tools.forEach((tool) => {
      byCategory[tool.category]++;
      bySecurityLevel[tool.securityLevel]++;
    });

    return {
      totalTools: tools.length,
      byCategory,
      bySecurityLevel,
      requiresConfirmation: tools.filter((t) => t.requiresConfirmation).length,
      canModifyFiles: tools.filter((t) => t.canModifyFiles).length,
      canExecuteCommands: tools.filter((t) => t.canExecuteCommands).length,
      canAccessNetwork: tools.filter((t) => t.canAccessNetwork).length,
    };
  }

  /**
   * Convert tool metadata to unified tool format
   */
  static metadataToUnifiedTool(
    metadata: BuiltinToolMetadata,
  ): Partial<UnifiedTool> {
    return {
      name: metadata.name,
      description: metadata.description,
      // Note: parameters schema comes from the actual tool implementation
    };
  }

  /**
   * Validate tool compatibility across providers
   */
  static validateProviderCompatibility(): {
    compatible: boolean;
    issues: string[];
  } {
    const issues: string[] = [];
    const tools = Object.values(this.BUILTIN_TOOLS);

    // Check that all tools support all providers
    const expectedProviders = ['gemini', 'openai', 'anthropic'];
    tools.forEach((tool) => {
      expectedProviders.forEach((provider) => {
        if (!tool.supportedProviders.includes(provider)) {
          issues.push(
            `Tool ${tool.name} does not support provider ${provider}`,
          );
        }
      });
    });

    // Validate that we have tools in all expected categories
    const expectedCategories = Object.values(ToolCategory);
    expectedCategories.forEach((category) => {
      const toolsInCategory = tools.filter((t) => t.category === category);
      if (toolsInCategory.length === 0) {
        issues.push(`No tools found in category ${category}`);
      }
    });

    return {
      compatible: issues.length === 0,
      issues,
    };
  }
}
