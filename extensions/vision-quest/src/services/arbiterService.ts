/**
 * Arbiter service - synthesizes multiple design documents into a unified design
 */

import type { ProviderInterface } from '@ouroboros/ouroboros-code-core';
import type { ProviderResult } from './narratorService';

export class ArbiterService {
  private preferredProviders = ['claude-opus-4-1', 'gpt-5', 'gemini-pro-2.5'];
  
  constructor(private providers: Map<string, ProviderInterface>) {}

  async synthesize(
    userGoal: string,
    providerResults: Map<string, ProviderResult>
  ): Promise<string> {
    // Select the best available provider for synthesis
    const synthesisProvider = this.selectSynthesisProvider();
    if (!synthesisProvider) {
      throw new Error('No provider available for design synthesis');
    }

    // Extract successful designs
    const successfulDesigns = Array.from(providerResults.values())
      .filter(result => !result.error && result.design)
      .map(result => ({
        provider: result.provider,
        design: result.design,
        thinking: result.thinking
      }));

    if (successfulDesigns.length === 0) {
      throw new Error('No successful designs to synthesize');
    }

    // Build synthesis prompt
    const synthesisPrompt = this.buildSynthesisPrompt(userGoal, successfulDesigns);

    // Request synthesis
    const response = await synthesisProvider.generateCompletion({
      messages: [
        {
          role: 'system',
          content: 'You are an expert software architect synthesizing multiple design proposals into a single, coherent implementation plan. Combine the best aspects of each design while ensuring consistency and completeness.'
        },
        {
          role: 'user',
          content: synthesisPrompt
        }
      ],
      enableThinking: true,
      maxTokens: 10000,
      temperature: 0.3 // Lower temperature for more deterministic synthesis
    });

    if (!response.content) {
      throw new Error('Failed to synthesize design document');
    }

    return this.formatFinalDesign(response.content, successfulDesigns);
  }

  private selectSynthesisProvider(): ProviderInterface | null {
    for (const providerName of this.preferredProviders) {
      const provider = this.providers.get(providerName);
      if (provider) {
        return provider;
      }
    }
    
    // Fallback to any available provider
    const availableProvider = Array.from(this.providers.values())[0];
    return availableProvider || null;
  }

  private buildSynthesisPrompt(
    userGoal: string,
    designs: Array<{ provider: string; design: string; thinking?: string }>
  ): string {
    const designSections = designs.map((d, index) => `
## Design ${index + 1} (from ${d.provider})

${d.design}

${d.thinking ? `### Provider Thinking Process\n${d.thinking}` : ''}
`).join('\n---\n');

    return `
# Design Synthesis Request

## Original User Goal
${userGoal}

## Multiple Design Proposals

The following are design proposals from different AI providers. Each has unique strengths and perspectives.

${designSections}

## Synthesis Requirements

Create a unified design document that:

1. **Combines Best Ideas**: Identify and integrate the strongest elements from each design
2. **Resolves Conflicts**: Where designs disagree, choose the most appropriate approach with justification
3. **Fills Gaps**: Add any missing components that none of the designs addressed
4. **Maintains Consistency**: Ensure all parts work together coherently
5. **Preserves Innovation**: Keep creative solutions that appear in any design

## Output Structure

Provide a final, comprehensive design document with:

### 1. Unified Architecture
- Consolidated system design
- Clear component boundaries
- Integration points

### 2. Implementation Roadmap
- Step-by-step implementation plan
- File structure
- Key modules and their responsibilities

### 3. Technical Specifications
- Detailed requirements for each component
- Data models
- API contracts
- Configuration

### 4. Code Scaffolding
- Starter code for main components
- Interface definitions
- Example usage

### 5. Validation Criteria
- Success metrics
- Testing requirements
- Performance targets

### 6. Design Decisions Log
- Key decisions made during synthesis
- Rationale for choosing specific approaches
- Trade-offs considered

Be specific and implementation-ready. This document will be used by an automated system to generate code.
`;
  }

  private formatFinalDesign(
    synthesizedDesign: string,
    originalDesigns: Array<{ provider: string; design: string; thinking?: string }>
  ): string {
    const timestamp = new Date().toISOString();
    const providerList = originalDesigns.map(d => d.provider).join(', ');
    
    return `# Vision Quest Design Document

> Generated: ${timestamp}
> Synthesized from: ${providerList}
> Status: Ready for Implementation

---

${synthesizedDesign}

---

## Appendix: Provider Contributions

This design was synthesized from ${originalDesigns.length} provider(s):
${originalDesigns.map(d => `- **${d.provider}**: Contributed design proposal`).join('\n')}

## Metadata

- Session Type: Vision Quest Multi-Provider Synthesis
- Synthesis Method: Best-of-breed combination
- Confidence Level: High (multiple perspectives aligned)

---

*This document is ready for automated implementation by the Sage phase.*
`;
  }
}