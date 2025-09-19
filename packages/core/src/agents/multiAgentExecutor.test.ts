/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type {
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';
import type { ContentGenerator } from '../core/contentGenerator.js';
import { MultiAgentExecutor } from './multiAgentExecutor.js';
import { getAgentById } from './personas.js';

class FakeContentGenerator implements ContentGenerator {
  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    if (userPromptId === 'multi-agent-systems-architect') {
      return this.buildJsonResponse({
        analysis: 'Assessed architecture bottlenecks.',
        solution: 'Introduce service boundaries and async messaging.',
        confidence: 0.85,
        handoff: ['code-quality-analyst'],
      });
    }

    if (userPromptId === 'multi-agent-code-quality-analyst') {
      return this.buildJsonResponse({
        analysis: 'Evaluated unit test gaps.',
        solution: 'Add regression tests and static analysis gating.',
        confidence: 0.78,
        handoff: [],
      });
    }

    if (userPromptId === 'multi-agent-synthesis') {
      return this.buildTextResponse(
        'Final consolidated plan:\n\n- Apply service decomposition\n- Harden testing pipeline\n\n---\n\nReasoning: Combined architecture and QA insights to craft rollout.',
      );
    }

    return this.buildJsonResponse({
      analysis: 'No opinion.',
      solution: '',
      confidence: 0,
      handoff: [],
    });
  }

  async generateContentStream(): Promise<AsyncGenerator<GenerateContentResponse>> {
    async function* empty() {}
    return empty();
  }

  async countTokens(_request: CountTokensParameters): Promise<CountTokensResponse> {
    return { totalTokens: 0, totalBillableCharacters: 0 } as CountTokensResponse;
  }

  async embedContent(_request: EmbedContentParameters): Promise<EmbedContentResponse> {
    throw new Error('Not implemented in fake generator');
  }

  private buildJsonResponse(obj: Record<string, unknown>): GenerateContentResponse {
    return {
      candidates: [
        {
          content: {
            role: 'model',
            parts: [{ text: JSON.stringify(obj) }],
          },
        },
      ],
    } as GenerateContentResponse;
  }

  private buildTextResponse(text: string): GenerateContentResponse {
    return {
      candidates: [
        {
          content: {
            role: 'model',
            parts: [{ text }],
          },
        },
      ],
    } as GenerateContentResponse;
  }
}

describe('MultiAgentExecutor', () => {
  const fakeGenerator = new FakeContentGenerator();
  const executor = new MultiAgentExecutor(fakeGenerator as unknown as ContentGenerator, {
    defaultModel: 'test-model',
  });

  it('runs seed agents and synthesises a master response', async () => {
    const architect = getAgentById('systems-architect');
    const qa = getAgentById('code-quality-analyst');
    expect(architect).toBeTruthy();
    expect(qa).toBeTruthy();

    const result = await executor.execute('Improve the system reliability.', [architect!, qa!]);

    expect(result.agentResults.length).toBeGreaterThanOrEqual(2);
    expect(result.finalResponse).toContain('Final consolidated plan');
    expect(result.aggregateReasoning).toContain('Combined architecture and QA insights');
    expect(result.totalAgents).toBe(result.agentResults.length);
    expect(result.timeline.length).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    const architectResult = result.agentResults.find((r) => r.agent.id === 'systems-architect');
    expect(architectResult?.handoffAgentIds).toContain('code-quality-analyst');
  });

  it('enqueues handoff agents requested by specialists', async () => {
    const architect = getAgentById('systems-architect');
    expect(architect).toBeTruthy();

    const result = await executor.execute('Focus on architecture first.', [architect!]);
    const agentIds = result.agentResults.map((res) => res.agent.id);

    expect(agentIds).toContain('systems-architect');
    expect(agentIds).toContain('code-quality-analyst');
    expect(result.timeline[0]?.agents.some(agent => agent.id === 'systems-architect')).toBe(true);
  });
});
