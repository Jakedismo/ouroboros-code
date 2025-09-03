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

## Comprehensive Tool Usage Guidelines for Agents

You have access to 60+ specialized tools across multiple categories. Use them strategically based on your expertise:

### 📁 Core File Operations
- **read_file**: Read and analyze files to understand project structure and code
- **write_file**: Create new files when implementing solutions
- **replace**: Modify existing files with precise changes (preferred for edits)
- **read_many_files**: Read multiple files efficiently for broader context
- **list_directory**: List directory contents to understand project structure
- **glob**: Find files using patterns (e.g., "**/*.ts" for TypeScript files)
- **search_file_content**: Search for specific patterns in code or text

### 🔧 Ouroboros Command Tools (Use these for specialized tasks!)
- **analyze**: Deep analysis of code, architecture, or patterns
- **codereview**: Comprehensive code review with detailed feedback
- **debug**: Debug issues, trace problems, analyze error logs
- **docgen**: Generate documentation for code, APIs, or projects
- **testgen**: Generate comprehensive test suites and test cases
- **refactor**: Refactor code while preserving functionality
- **secaudit**: Security audit code for vulnerabilities and best practices
- **precommit**: Run pre-commit checks and validations
- **planner**: Create detailed project plans and task breakdowns
- **tracer**: Trace code execution paths and dependencies
- **thinkdeep**: Deep reasoning and analysis for complex problems

### 🌐 External Integration Tools
- **web_fetch**: Fetch content from URLs for research and analysis
- **google_web_search**: Search the web for current information
- **get-library-docs**: Get up-to-date documentation for libraries
- **resolve-library-id**: Find correct library identifiers
- **searchGitHub**: Search GitHub for code examples and repositories

### 🤖 Swarm & Collaboration Tools
- **swarm_agent**: Spawn and manage other AI agents for parallel work
- **swarm_orchestrate**: Coordinate multiple agents on complex tasks
- **swarm_notify**: Send notifications between agents
- **swarm_task**: Create and manage distributed tasks
- **swarm_memory**: Share memory between swarm agents
- **swarm_persona**: Manage agent personalities and capabilities
- **swarm_pipeline**: Create processing pipelines with multiple agents

### 🏗️ Worktree & Git Management
- **worktree_manager**: Manage Git worktrees for parallel development
- **worktree_sync**: Synchronize changes across worktrees
- **worktree_workflow**: Automate worktree-based development workflows
- **worktree**: Basic worktree operations

### 🧠 Memory & Evolution Tools
- **save_memory**: Remember user preferences and project information
- **file_memory_read**: Read from persistent memory storage
- **file_memory_write**: Write to persistent memory storage
- **file_memory_search**: Search through stored memories
- **request_evolution**: Request system evolution and improvements
- **persona_evolution_load**: Load evolved agent personalities
- **persona_evolution_save**: Save agent personality improvements
- **evolution_system_status**: Check system evolution status

### 🔗 A2A (Agent-to-Agent) Communication
- **a2a_network**: Manage agent network connections
- **a2a_registry**: Register and discover other agents
- **a2a_coordinate**: Coordinate with external agent systems

### 📊 Project & Progress Management
- **project_metadata**: Access and update project metadata
- **progress_create**: Create progress tracking instances
- **progress_update**: Update progress on tasks
- **progress_complete**: Mark tasks as completed
- **notification_create**: Create system notifications
- **notifications_list**: List active notifications
- **notifications_stats**: Get notification statistics

### 🛠️ System & Execution
- **run_shell_command**: Execute shell commands safely
- **resource_discover**: Discover available system resources

## Strategic Tool Usage Patterns

### 🎯 For Code Analysis Tasks:
1. **analyze** - Deep code analysis and patterns
2. **read_file** / **read_many_files** - Understand codebase
3. **search_file_content** - Find specific implementations
4. **codereview** - Comprehensive review with feedback

### 🔍 For Research & Documentation:
1. **get-library-docs** - Get current library documentation  
2. **google_web_search** - Research latest practices
3. **docgen** - Generate comprehensive documentation
4. **web_fetch** - Fetch additional resources

### ⚡ For Development & Testing:
1. **testgen** - Generate test suites
2. **run_shell_command** - Build, test, validate
3. **precommit** - Run pre-commit checks
4. **debug** - Trace and fix issues

### 🤝 For Complex Multi-Agent Tasks:
1. **planner** - Create detailed task plans
2. **swarm_agent** - Spawn specialized agents
3. **swarm_orchestrate** - Coordinate parallel work
4. **a2a_coordinate** - Connect with external systems

### 🧠 For Learning & Evolution:
1. **thinkdeep** - Deep reasoning on complex problems
2. **persona_evolution_save** - Improve capabilities
3. **file_memory_write** - Remember insights
4. **request_evolution** - Request system improvements

## Tool Usage Best Practices
1. **Use specialized tools** - Prefer **analyze** over basic file reading for code analysis
2. **Leverage documentation tools** - Use **get-library-docs** for accurate, current info
3. **Generate comprehensive outputs** - Use **docgen**, **testgen** for complete solutions
4. **Coordinate intelligently** - Use swarm tools for complex, parallel tasks
5. **Remember and evolve** - Use memory and evolution tools to improve over time
6. **Always validate** - Use **run_shell_command** to test changes
7. **Think deeply** - Use **thinkdeep** for complex problem-solving

Choose tools that match your expertise and the task complexity. These specialized tools make you far more effective than basic file operations alone!`;

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
  
  // Code analysis and development
  if (lowerSpecialties.some(s => s.includes('code') || s.includes('develop') || s.includes('architect') || s.includes('engineer'))) {
    recommendations.push(`- **analyze**: Deep code analysis and architectural insights`);
    recommendations.push(`- **codereview**: Comprehensive code review and quality assessment`);
    recommendations.push(`- **refactor**: Safely refactor code while preserving functionality`);
    recommendations.push(`- **${ReadFileTool.Name}** & **replace**: Read and modify code files`);
  }
  
  // Testing and quality assurance
  if (lowerSpecialties.some(s => s.includes('test') || s.includes('qa') || s.includes('quality'))) {
    recommendations.push(`- **testgen**: Generate comprehensive test suites`);
    recommendations.push(`- **debug**: Debug issues and trace problems`);
    recommendations.push(`- **secaudit**: Security audit for vulnerabilities`);
    recommendations.push(`- **precommit**: Run pre-commit validation checks`);
  }
  
  // DevOps, deployment, and automation
  if (lowerSpecialties.some(s => s.includes('devops') || s.includes('deploy') || s.includes('build') || s.includes('ci/cd') || s.includes('infra'))) {
    recommendations.push(`- **${ShellTool.Name}**: Execute deployment and build commands`);
    recommendations.push(`- **worktree_manager**: Manage parallel development workflows`);
    recommendations.push(`- **precommit**: Automate pre-commit validations`);
    recommendations.push(`- **resource_discover**: Discover system resources`);
  }
  
  // Documentation and technical writing
  if (lowerSpecialties.some(s => s.includes('doc') || s.includes('write') || s.includes('technical'))) {
    recommendations.push(`- **docgen**: Generate comprehensive documentation`);
    recommendations.push(`- **get-library-docs**: Get current library documentation`);
    recommendations.push(`- **analyze**: Deep analysis for documentation insights`);
    recommendations.push(`- **google_web_search**: Research current practices`);
  }
  
  // Research and analysis
  if (lowerSpecialties.some(s => s.includes('research') || s.includes('analysis') || s.includes('data'))) {
    recommendations.push(`- **thinkdeep**: Deep reasoning on complex problems`);
    recommendations.push(`- **google_web_search**: Research latest information`);
    recommendations.push(`- **web_fetch**: Fetch external resources for analysis`);
    recommendations.push(`- **searchGitHub**: Find code examples and patterns`);
  }
  
  // Project management and planning
  if (lowerSpecialties.some(s => s.includes('manage') || s.includes('plan') || s.includes('project') || s.includes('lead'))) {
    recommendations.push(`- **planner**: Create detailed project plans and breakdowns`);
    recommendations.push(`- **project_metadata**: Access and manage project information`);
    recommendations.push(`- **progress_create**: Track task progress`);
    recommendations.push(`- **swarm_orchestrate**: Coordinate multi-agent workflows`);
  }
  
  // AI/ML and system evolution
  if (lowerSpecialties.some(s => s.includes('ai') || s.includes('ml') || s.includes('machine') || s.includes('intelligence'))) {
    recommendations.push(`- **swarm_agent**: Spawn and coordinate AI agents`);
    recommendations.push(`- **persona_evolution_save**: Improve agent capabilities`);
    recommendations.push(`- **request_evolution**: Request system improvements`);
    recommendations.push(`- **thinkdeep**: Apply deep reasoning capabilities`);
  }
  
  // Security and auditing
  if (lowerSpecialties.some(s => s.includes('security') || s.includes('audit') || s.includes('cyber'))) {
    recommendations.push(`- **secaudit**: Comprehensive security audits`);
    recommendations.push(`- **debug**: Trace security issues and vulnerabilities`);
    recommendations.push(`- **analyze**: Deep security analysis`);
    recommendations.push(`- **search_file_content**: Find security-related code patterns`);
  }
  
  // Default recommendations if no specific matches
  if (recommendations.length === 0) {
    recommendations.push(`- **analyze**: Deep analysis in your domain of expertise`);
    recommendations.push(`- **thinkdeep**: Apply deep reasoning to complex problems`);
    recommendations.push(`- **${ReadFileTool.Name}**: Understand the current state`);
    recommendations.push(`- **docgen**: Generate comprehensive documentation`);
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