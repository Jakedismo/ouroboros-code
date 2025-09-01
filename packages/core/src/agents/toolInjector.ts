/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tool Usage Injection for Agent Prompts
 * 
 * This module provides functionality to inject tool usage examples and references
 * into agent system prompts, similar to how the main system prompt includes tool examples.
 */

import { LSTool } from '../tools/ls.js';
import { EditTool } from '../tools/edit.js';
import { GlobTool } from '../tools/glob.js';
import { GrepTool } from '../tools/grep.js';
import { ReadFileTool } from '../tools/read-file.js';
import { ReadManyFilesTool } from '../tools/read-many-files.js';
import { ShellTool } from '../tools/shell.js';
import { WriteFileTool } from '../tools/write-file.js';
import { MemoryTool } from '../tools/memoryTool.js';

/**
 * Map of tool placeholders to actual tool names for injection
 */
const TOOL_NAME_MAP = {
  '${LSTool.Name}': LSTool.Name,
  '${EditTool.Name}': EditTool.Name,
  '${GlobTool.Name}': GlobTool.Name,
  '${GrepTool.Name}': GrepTool.Name,
  '${ReadFileTool.Name}': ReadFileTool.Name,
  '${ReadManyFilesTool.Name}': ReadManyFilesTool.Name,
  '${ShellTool.Name}': ShellTool.Name,
  '${WriteFileTool.Name}': WriteFileTool.Name,
  '${MemoryTool.Name}': MemoryTool.Name,
} as const;

/**
 * Tool usage examples that should be appended to agent prompts
 */
const TOOL_USAGE_EXAMPLES = `

## Tool Usage Guidelines for Agents

When providing assistance, you have access to the following tools. Use them appropriately based on your expertise:

### Core File Operations
- **${ReadFileTool.Name}**: Read and analyze files to understand project structure and code
- **${WriteFileTool.Name}**: Create new files when implementing solutions
- **${EditTool.Name}**: Modify existing files with precise changes
- **${ReadManyFilesTool.Name}**: Read multiple files efficiently for broader context

### Discovery and Search
- **${GlobTool.Name}**: Find files using patterns (e.g., "**/*.ts" for TypeScript files)
- **${GrepTool.Name}**: Search for specific patterns in code or text
- **${LSTool.Name}**: List directory contents to understand project structure

### Execution and Validation
- **${ShellTool.Name}**: Execute commands to build, test, lint, or validate changes
- **${MemoryTool.Name}**: Remember important user preferences and project-specific information

### Tool Usage Best Practices
1. **Always use absolute paths** when referencing files
2. **Read before writing** - understand existing code patterns and conventions
3. **Validate changes** by running appropriate build/test commands
4. **Search efficiently** using parallel tool calls when gathering information
5. **Follow security guidelines** by explaining potentially destructive commands

### Example Workflow Pattern:
1. Use ${GrepTool.Name} or ${GlobTool.Name} to find relevant files
2. Use ${ReadFileTool.Name} or ${ReadManyFilesTool.Name} to understand current implementation
3. Use ${EditTool.Name} or ${WriteFileTool.Name} to implement changes
4. Use ${ShellTool.Name} to validate changes (build, test, lint)

Apply these tools strategically within your domain of expertise to provide comprehensive assistance.`;

/**
 * Injects tool usage examples and resolves tool name placeholders in an agent prompt
 * 
 * @param agentPrompt The raw agent system prompt from markdown file
 * @param agentSpecialties List of agent specialties to customize tool recommendations
 * @returns Enhanced prompt with tool injection and resolved tool names
 */
export function injectToolExamples(agentPrompt: string, agentSpecialties: string[] = []): string {
  // First, resolve any tool name placeholders in the original prompt
  let enhancedPrompt = agentPrompt;
  
  // Replace tool name placeholders with actual tool names
  for (const [placeholder, actualName] of Object.entries(TOOL_NAME_MAP)) {
    enhancedPrompt = enhancedPrompt.replace(new RegExp(escapeRegExp(placeholder), 'g'), actualName);
  }
  
  // Add tool usage guidelines at the end
  enhancedPrompt += TOOL_USAGE_EXAMPLES;
  
  // Customize tool recommendations based on agent specialties
  if (agentSpecialties.length > 0) {
    enhancedPrompt += `\n\n### Recommended Tools for ${agentSpecialties.slice(0, 3).join(', ')}:`;
    enhancedPrompt += getRecommendedToolsForSpecialties(agentSpecialties);
  }
  
  return enhancedPrompt;
}

/**
 * Get recommended tools based on agent specialties
 */
function getRecommendedToolsForSpecialties(specialties: string[]): string {
  const recommendations: string[] = [];
  
  // Convert specialties to lowercase for matching
  const lowerSpecialties = specialties.map(s => s.toLowerCase());
  
  // File system and code analysis tools for most agents
  if (lowerSpecialties.some(s => s.includes('code') || s.includes('develop') || s.includes('architect') || s.includes('engineer'))) {
    recommendations.push(`- **${ReadFileTool.Name}** & **${EditTool.Name}**: Essential for code analysis and modification`);
    recommendations.push(`- **${GrepTool.Name}** & **${GlobTool.Name}**: Crucial for understanding codebase patterns`);
  }
  
  // Shell commands for DevOps, testing, and build-related specialties
  if (lowerSpecialties.some(s => s.includes('devops') || s.includes('deploy') || s.includes('test') || s.includes('build') || s.includes('ci/cd'))) {
    recommendations.push(`- **${ShellTool.Name}**: Critical for deployment, testing, and automation tasks`);
  }
  
  // Memory tool for configuration and preferences
  if (lowerSpecialties.some(s => s.includes('config') || s.includes('setup') || s.includes('manage'))) {
    recommendations.push(`- **${MemoryTool.Name}**: Useful for remembering project-specific configurations`);
  }
  
  // Default recommendations if no specific matches
  if (recommendations.length === 0) {
    recommendations.push(`- **${ReadFileTool.Name}**: Start by understanding the current state`);
    recommendations.push(`- **${GrepTool.Name}**: Search for relevant patterns in your domain`);
    recommendations.push(`- **${EditTool.Name}**: Apply changes based on your expertise`);
  }
  
  return '\n' + recommendations.join('\n');
}

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get available tool names for reference
 */
export function getAvailableToolNames(): string[] {
  return Object.values(TOOL_NAME_MAP);
}