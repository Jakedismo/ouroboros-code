/**
 * Narrator service - orchestrates multi-provider design generation
 */

import type { ProviderInterface } from '@ouroboros/ouroboros-code-core';

export interface ProviderResult {
  provider: string;
  design: string;
  thinking?: string;
  tokensUsed: number;
  duration: number;
  error?: Error;
}

export class NarratorService {
  private readonly topProviders = ['gpt-5', 'claude-opus-4-1', 'gemini-pro-2.5'];
  
  constructor(private providers: Map<string, ProviderInterface>) {}

  async generateDesigns(
    userGoal: string,
    onProviderUpdate: (provider: string, status: any) => void
  ): Promise<Map<string, ProviderResult>> {
    const results = new Map<string, ProviderResult>();
    const designPrompt = this.buildDesignPrompt(userGoal);
    
    // Run providers in parallel
    const promises = this.topProviders
      .filter(name => this.providers.has(name))
      .map(async (providerName) => {
        const startTime = Date.now();
        
        onProviderUpdate(providerName, {
          status: 'running',
          message: 'Analyzing requirements...'
        });

        try {
          const provider = this.providers.get(providerName)!;
          
          // Send design generation request with thinking mode
          const response = await provider.generateCompletion({
            messages: [
              {
                role: 'system',
                content: 'You are a software architect creating a comprehensive design document. Include implementation details, file structure, and technical approach.'
              },
              {
                role: 'user',
                content: designPrompt
              }
            ],
            enableThinking: true,
            maxTokens: 8000,
            temperature: 0.7
          });

          const duration = Date.now() - startTime;
          
          results.set(providerName, {
            provider: providerName,
            design: response.content || '',
            thinking: response.thinking,
            tokensUsed: response.usage?.totalTokens || 0,
            duration
          });

          onProviderUpdate(providerName, {
            status: 'complete',
            message: `Design generated (${(duration / 1000).toFixed(1)}s)`,
            tokensUsed: response.usage?.totalTokens || 0
          });
        } catch (error) {
          const duration = Date.now() - startTime;
          
          results.set(providerName, {
            provider: providerName,
            design: '',
            tokensUsed: 0,
            duration,
            error: error as Error
          });

          onProviderUpdate(providerName, {
            status: 'error',
            message: (error as Error).message,
            duration
          });
        }
      });

    await Promise.allSettled(promises);
    return results;
  }

  private buildDesignPrompt(userGoal: string): string {
    return `
# Software Design Document Request

## User Goal
${userGoal}

## Requirements

Create a comprehensive software design document that includes:

### 1. Executive Summary
- Brief overview of the solution
- Key benefits and features
- Technical approach

### 2. Architecture Design
- System components and their interactions
- Data flow diagrams (describe in text)
- Technology stack recommendations
- Design patterns to use

### 3. Implementation Plan
- File structure and organization
- Module breakdown
- Key classes/functions and their responsibilities
- API endpoints (if applicable)
- Database schema (if applicable)

### 4. Technical Details
- Algorithms and data structures
- Performance considerations
- Security measures
- Error handling strategy
- Testing approach

### 5. Development Milestones
- Implementation phases
- Dependencies between components
- Estimated complexity

### 6. Code Examples
- Provide skeleton code for critical components
- Show key interfaces and contracts
- Include configuration samples

## Context

- Assume a modern development environment
- Prefer established patterns and best practices
- Consider maintainability and scalability
- Include error handling and validation
- Think about testing from the start

## Output Format

Provide a well-structured markdown document with clear sections, code blocks, and implementation details.
Be specific and actionable - this document will be used to implement the solution.
`;
  }
}