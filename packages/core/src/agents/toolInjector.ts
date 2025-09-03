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

You have access to core file operations plus powerful Ouroboros command tools. Use them strategically:

### 📁 Core File Operations
- **read_file**: Read and analyze files to understand project structure and code
- **write_file**: Create new files when implementing solutions
- **replace**: Modify existing files with precise changes (preferred for edits)
- **read_many_files**: Read multiple files efficiently for broader context
- **list_directory**: List directory contents to understand project structure
- **glob**: Find files using patterns (e.g., "**/*.ts" for TypeScript files)
- **search_file_content**: Search for specific patterns in code or text
- **run_shell_command**: Execute shell commands safely
- **save_memory**: Remember user preferences and project information

### 🔧 Ouroboros Command Tools (Powerful specialized commands!)

These are custom slash commands with advanced capabilities. Use them for professional-grade work:

- **analyze**: Deep analysis of code, architecture, patterns, or any complex topic
  - Use for comprehensive code analysis, architectural reviews, pattern detection
  - More powerful than basic file reading - provides insights and recommendations
  
- **codereview**: Comprehensive code review with detailed feedback  
  - Professional-grade code reviews with security, performance, style analysis
  - Identifies issues, suggests improvements, checks best practices
  
- **debug**: Debug issues, trace problems, analyze error logs
  - Systematic debugging approach with root cause analysis
  - Trace execution paths, analyze stack traces, identify issues
  
- **docgen**: Generate comprehensive documentation for code, APIs, or projects
  - Creates professional documentation with examples, usage guides
  - Supports multiple formats and documentation standards
  
- **testgen**: Generate comprehensive test suites and test cases
  - Creates thorough test coverage including unit, integration, edge cases
  - Follows testing best practices and frameworks
  
- **refactor**: Safely refactor code while preserving functionality
  - Intelligent code restructuring with safety checks
  - Maintains functionality while improving code quality
  
- **secaudit**: Security audit code for vulnerabilities and best practices
  - Comprehensive security analysis covering common vulnerabilities
  - Provides remediation guidance and security recommendations
  
- **precommit**: Run pre-commit checks and validations
  - Automated validation before code commits
  - Runs linting, testing, formatting, and quality checks
  
- **planner**: Create detailed project plans and task breakdowns
  - Strategic planning with timelines, dependencies, resource allocation
  - Breaks complex projects into manageable tasks
  
- **tracer**: Trace code execution paths and dependencies
  - Map code flow, identify dependencies, trace data flow
  - Useful for understanding complex systems
  
- **thinkdeep**: Deep reasoning and analysis for complex problems
  - Advanced reasoning capabilities for difficult problems
  - Multi-perspective analysis with detailed conclusions

## Strategic Usage Patterns

### 🎯 For Code Analysis:
1. **analyze** → **codereview** → **refactor** (comprehensive code improvement)
2. **tracer** → **debug** (understanding and fixing issues)

### 🔍 For Development:
1. **planner** → implementation → **testgen** → **precommit** (full dev cycle)
2. **docgen** for comprehensive documentation

### 🛡️ For Quality Assurance:
1. **secaudit** → **codereview** → **testgen** (security and quality)
2. **debug** → **tracer** (issue resolution)

### 🧠 For Complex Problems:
1. **thinkdeep** → **analyze** → **planner** (deep problem solving)

## Best Practices
1. **Prefer specialized commands** - Use **analyze** instead of just reading files
2. **Combine commands strategically** - **codereview** + **testgen** for quality
3. **Use for professional work** - These commands provide expert-level capabilities
4. **Always validate** - Use **precommit** before finalizing changes
5. **Think systematically** - Use **planner** for complex tasks
6. **Document comprehensively** - Use **docgen** for proper documentation

These Ouroboros commands transform you from a basic assistant into a professional development expert. Use them to provide comprehensive, expert-level assistance!`;

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
    recommendations.push(`- **tracer**: Trace code execution paths and dependencies`);
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
    recommendations.push(`- **precommit**: Automate pre-commit validations and checks`);
    recommendations.push(`- **${ShellTool.Name}**: Execute deployment and build commands`);
    recommendations.push(`- **debug**: Trace deployment and infrastructure issues`);
  }
  
  // Documentation and technical writing
  if (lowerSpecialties.some(s => s.includes('doc') || s.includes('write') || s.includes('technical'))) {
    recommendations.push(`- **docgen**: Generate comprehensive documentation`);
    recommendations.push(`- **analyze**: Deep analysis for documentation insights`);
    recommendations.push(`- **planner**: Plan documentation structure and content`);
  }
  
  // Research and analysis
  if (lowerSpecialties.some(s => s.includes('research') || s.includes('analysis') || s.includes('data'))) {
    recommendations.push(`- **thinkdeep**: Deep reasoning on complex problems`);
    recommendations.push(`- **analyze**: Comprehensive analysis and insights`);
    recommendations.push(`- **tracer**: Trace data flow and dependencies`);
  }
  
  // Project management and planning
  if (lowerSpecialties.some(s => s.includes('manage') || s.includes('plan') || s.includes('project') || s.includes('lead'))) {
    recommendations.push(`- **planner**: Create detailed project plans and breakdowns`);
    recommendations.push(`- **analyze**: Analyze project structure and requirements`);
    recommendations.push(`- **thinkdeep**: Strategic thinking for complex projects`);
  }
  
  // Security and auditing
  if (lowerSpecialties.some(s => s.includes('security') || s.includes('audit') || s.includes('cyber'))) {
    recommendations.push(`- **secaudit**: Comprehensive security audits`);
    recommendations.push(`- **debug**: Trace security issues and vulnerabilities`);
    recommendations.push(`- **analyze**: Deep security analysis`);
    recommendations.push(`- **codereview**: Security-focused code review`);
  }
  
  // Default recommendations if no specific matches
  if (recommendations.length === 0) {
    recommendations.push(`- **analyze**: Deep analysis in your domain of expertise`);
    recommendations.push(`- **thinkdeep**: Apply deep reasoning to complex problems`);
    recommendations.push(`- **codereview**: Professional-grade review and feedback`);
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