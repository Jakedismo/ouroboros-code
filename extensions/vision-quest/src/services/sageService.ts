/**
 * Sage service - automated implementation from design document
 */

import type { ProviderInterface, ToolInterface } from '@ouroboros/ouroboros-code-core';
import type { ValidationService } from './validationService';
import type { ImplementationResult, FileChange } from './sagaService';

export interface SageOptions {
  maxIterations: number;
  onIteration?: (iteration: number, status: string) => void;
  onTask?: (task: string) => void;
}

export interface WorkspaceInfo {
  path: string;
  isEphemeral: boolean;
}

export class SageService {
  private preferredProviders = ['gpt-5', 'claude-sonnet-4', 'gemini-pro-2.5'];
  
  constructor(
    private providers: Map<string, ProviderInterface>,
    private tools: ToolInterface,
    private validationService: ValidationService
  ) {}

  async implement(
    designDocument: string,
    workspace: WorkspaceInfo,
    options: SageOptions
  ): Promise<ImplementationResult> {
    const startTime = Date.now();
    let tokensUsed = 0;
    let iteration = 0;
    let lastError: Error | undefined;
    const fileChanges: FileChange[] = [];

    // Select implementation provider
    const provider = this.selectImplementationProvider();
    if (!provider) {
      throw new Error('No provider available for implementation');
    }

    // Implementation loop with validation gates
    while (iteration < options.maxIterations) {
      iteration++;
      options.onIteration?.(iteration, 'Starting implementation iteration');

      try {
        // Build implementation prompt
        const prompt = this.buildImplementationPrompt(
          designDocument,
          workspace,
          iteration,
          lastError
        );

        options.onTask?.('Generating implementation code...');

        // Request implementation with tool access
        const response = await provider.generateCompletion({
          messages: [
            {
              role: 'system',
              content: this.getSystemPrompt(workspace)
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          tools: this.tools.getAvailableTools(),
          enableThinking: true,
          maxTokens: 15000,
          temperature: 0.2 // Low temperature for precise implementation
        });

        tokensUsed += response.usage?.totalTokens || 0;

        // Extract file changes from tool calls
        const changes = this.extractFileChanges(response.toolCalls || []);
        fileChanges.push(...changes);

        options.onTask?.('Running validation gates...');

        // Run validation
        const validationResults = await this.validationService.validate(workspace);
        
        // Check if all gates pass
        const allPassed = validationResults.every(r => r.passed);
        
        if (allPassed) {
          options.onIteration?.(iteration, 'All validation gates passed!');
          
          // Generate patch
          const patch = await this.generatePatch(workspace, fileChanges);
          
          return {
            files: fileChanges,
            patch,
            validationResults,
            stats: {
              iterations: iteration,
              duration: Date.now() - startTime,
              tokensUsed
            }
          };
        } else {
          // Capture validation errors for next iteration
          const failedGates = validationResults
            .filter(r => !r.passed)
            .map(r => `${r.gate}: ${r.error || 'failed'}`)
            .join(', ');
          
          lastError = new Error(`Validation failed: ${failedGates}`);
          options.onIteration?.(iteration, `Validation failed, retrying... (${failedGates})`);
        }
      } catch (error) {
        lastError = error as Error;
        options.onIteration?.(iteration, `Error: ${lastError.message}`);
      }
    }

    // Max iterations reached
    throw new Error(`Failed to implement after ${options.maxIterations} iterations. Last error: ${lastError?.message}`);
  }

  private selectImplementationProvider(): ProviderInterface | null {
    for (const providerName of this.preferredProviders) {
      const provider = this.providers.get(providerName);
      if (provider) {
        return provider;
      }
    }
    
    // Fallback to any available provider with tool support
    return Array.from(this.providers.values())[0] || null;
  }

  private getSystemPrompt(workspace: WorkspaceInfo): string {
    return `You are an expert software engineer implementing a design document.

WORKSPACE: ${workspace.path}
TYPE: ${workspace.isEphemeral ? 'Ephemeral (safe for experimentation)' : 'Main workspace'}

Your task is to:
1. Implement the design document precisely
2. Create all necessary files and directories
3. Write production-quality code
4. Include error handling and validation
5. Ensure the code compiles/runs without errors
6. Follow best practices for the chosen technology

Available tools:
- read_file: Read existing files
- write_file: Create new files
- edit_file: Modify existing files
- run_shell_command: Execute commands (npm install, tests, etc.)
- ls: List directory contents
- grep: Search for patterns in files

IMPORTANT:
- Implement everything specified in the design
- Ensure all imports and dependencies are correct
- Add necessary configuration files
- Make the implementation complete and runnable`;
  }

  private buildImplementationPrompt(
    designDocument: string,
    workspace: WorkspaceInfo,
    iteration: number,
    lastError?: Error
  ): string {
    let prompt = `# Implementation Request - Iteration ${iteration}

## Design Document

${designDocument}

## Task

Implement the above design document completely. Create all necessary files, write all code, and ensure everything works.

## Current Workspace
Path: ${workspace.path}
`;

    if (iteration > 1 && lastError) {
      prompt += `
## Previous Attempt Failed

Error: ${lastError.message}

Please fix the issues and try again. Common issues:
- Missing imports or dependencies
- Syntax errors
- Type errors (if TypeScript)
- Missing configuration files
- Incorrect file paths

Analyze what went wrong and correct it in this iteration.
`;
    }

    prompt += `
## Implementation Checklist

- [ ] Create directory structure
- [ ] Write main implementation files
- [ ] Add configuration files (package.json, tsconfig.json, etc.)
- [ ] Install dependencies
- [ ] Add error handling
- [ ] Ensure code compiles/runs
- [ ] Add basic tests if specified

Start implementing now. Use the available tools to create and modify files.`;

    return prompt;
  }

  private extractFileChanges(toolCalls: any[]): FileChange[] {
    const changes: FileChange[] = [];
    const fileStats = new Map<string, { added: number; removed: number }>();

    for (const call of toolCalls) {
      if (!call.name || !call.arguments) continue;

      const args = typeof call.arguments === 'string' 
        ? JSON.parse(call.arguments) 
        : call.arguments;

      switch (call.name) {
        case 'write_file':
          const writePath = args.file_path || args.path;
          const content = args.content || '';
          const lines = content.split('\n').length;
          
          changes.push({
            path: writePath,
            action: 'added',
            lines: { added: lines, removed: 0 }
          });
          break;

        case 'edit_file':
          const editPath = args.file_path || args.path;
          const oldLines = (args.old_string || '').split('\n').length;
          const newLines = (args.new_string || '').split('\n').length;
          
          if (!fileStats.has(editPath)) {
            fileStats.set(editPath, { added: 0, removed: 0 });
          }
          
          const stats = fileStats.get(editPath)!;
          stats.added += newLines;
          stats.removed += oldLines;
          
          // Update or add change entry
          let existingChange = changes.find(c => c.path === editPath);
          if (!existingChange) {
            existingChange = {
              path: editPath,
              action: 'modified',
              lines: { added: 0, removed: 0 }
            };
            changes.push(existingChange);
          }
          
          existingChange.lines.added = stats.added;
          existingChange.lines.removed = stats.removed;
          break;
      }
    }

    return changes;
  }

  private async generatePatch(
    workspace: WorkspaceInfo,
    fileChanges: FileChange[]
  ): Promise<string> {
    // Run git diff to generate patch
    try {
      const result = await this.tools.executeCommand({
        command: 'git diff',
        cwd: workspace.path
      });
      
      if (result.stdout) {
        return result.stdout;
      }
    } catch (error) {
      // Fallback to simple patch representation
    }

    // Generate simple patch representation
    return fileChanges.map(change => {
      return `
--- ${change.action === 'added' ? '/dev/null' : `a/${change.path}`}
+++ ${change.action === 'deleted' ? '/dev/null' : `b/${change.path}`}
@@ ${change.action} @@
${change.action === 'added' ? `+${change.lines.added} lines added` : ''}
${change.action === 'modified' ? `+${change.lines.added}/-${change.lines.removed} lines changed` : ''}
${change.action === 'deleted' ? `-${change.lines.removed} lines removed` : ''}
`;
    }).join('\n');
  }
}