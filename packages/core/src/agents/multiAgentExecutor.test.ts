/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@openai/agents', () => {
  class Agent {
    tools: any[];
    constructor(config: any) {
      Object.assign(this, config);
      this.tools = config.tools ?? [];
    }
  }

  class Runner {
    async run(agent: any) {
      return {
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'run_item_stream_event',
            name: 'message_output_created',
            item: {
              toJSON() {
                return {
                  rawItem: {
                    content: [{ type: 'output_text', text: '' }],
                  },
                };
              },
            },
          };
        },
        completed: Promise.resolve(),
        output: [],
        finalOutput: '',
        state: {
          approve() {},
          reject() {},
        },
      } as any;
    }
  }

  function tool(config: any) {
    return { ...config, invoke: config.execute };
  }

  function user(content: string) {
    return { role: 'user', content };
  }

  function system(content: string) {
    return { role: 'system', content };
  }

  function assistant(content: string) {
    return { role: 'assistant', content };
  }

  return { Agent, Runner, tool, user, system, assistant };
});

vi.mock('@lvce-editor/ripgrep', () => ({
  rgPath: '/tmp/ripgrep',
}));

vi.mock('../tools/shell.ts', () => ({
  ShellTool: class ShellTool {
    static Name = 'shell';
    static displayName = 'Shell';
    static description = 'Stub shell tool.';
    static schema = { parametersJsonSchema: {} };
  },
}));

vi.mock('./toolInjector.js', () => ({
  injectToolExamples: (prompt: string) => `${prompt}\nTool Operations Playbook`,
}));

vi.mock('../runtime/providerConnectors.js', () => ({
  createDefaultConnectorRegistry: () => new Map(),
}));

vi.mock('@openai/agents-openai', () => ({
  OpenAIProvider: class OpenAIProvider {},
}));

vi.mock('@openai/agents-extensions', () => ({
  AiSdkModel: class AiSdkModel {},
}));

import { MultiAgentExecutor } from './multiAgentExecutor.js';
import type { Config } from '../config/config.js';
import type {
  UnifiedAgentMessage,
  UnifiedAgentStreamOptions,
  UnifiedAgentsStreamEvent,
} from '../runtime/types.js';
import { getAgentById } from './personas.js';

describe('MultiAgentExecutor', () => {
  const fakeConfig = {
    getProvider: () => 'openai',
  } as unknown as Config;

  class FakeUnifiedClient {
    promptsByAgent = new Map<string, string[]>();
    delegateOrder: string[] = [];

    async createSession(sessionConfig: {
      systemPrompt?: string;
      metadata?: Record<string, unknown>;
    }): Promise<any> {
      return {
        id: `session-${Math.random()}`,
        systemPrompt: sessionConfig.systemPrompt ?? '',
        providerId: 'openai',
        model: 'test-model',
        metadata: sessionConfig.metadata ?? {},
      };
    }

    async *streamResponse(
      session: any,
      messages: UnifiedAgentMessage[],
      options: UnifiedAgentStreamOptions = {},
    ): AsyncGenerator<UnifiedAgentsStreamEvent> {
      const prompt = [
        session.systemPrompt,
        ...messages.map((m) => m.content),
      ].join('\n');
      const agentId =
        typeof session.metadata?.agentId === 'string'
          ? (session.metadata.agentId as string)
          : undefined;
      if (agentId) {
        const existing = this.promptsByAgent.get(agentId) ?? [];
        existing.push(prompt);
        this.promptsByAgent.set(agentId, existing);
      }

      const isOrchestrator =
        agentId === 'orchestrator' || prompt.includes('SPECIALIST RESPONSES');

      if (isOrchestrator) {
        const delegateTool = options.toolsAugmentation?.find(
          (tool) => tool.name === 'delegate_to_specialist',
        );
        if (delegateTool) {
          for (const targetId of this.delegateOrder) {
            await delegateTool.execute({ agent_id: targetId });
          }
        }

        const finalText =
          'Final consolidated plan:\n\n- Apply service decomposition\n- Harden testing pipeline\n\n---\n\nReasoning: Combined architecture and QA insights to craft rollout.';
        yield {
          type: 'final',
          message: {
            role: 'assistant',
            content: finalText,
          },
        } as UnifiedAgentsStreamEvent;
        return;
      }

      let finalJson = JSON.stringify({
        analysis: 'Generic analysis',
        solution: 'Generic solution',
        confidence: 0.7,
        handoff: [],
      });

      if (prompt.includes('(systems-architect)')) {
        finalJson = JSON.stringify({
          analysis: 'Assessed architecture bottlenecks.',
          solution: 'Introduce service boundaries and async messaging.',
          confidence: 0.85,
          handoff: ['code-quality-analyst'],
        });
      } else if (prompt.includes('(code-quality-analyst)')) {
        finalJson = JSON.stringify({
          analysis: 'Evaluated unit test gaps.',
          solution: 'Add regression tests and static analysis gating.',
          confidence: 0.78,
          handoff: [],
        });
      }

      yield {
        type: 'final',
        message: {
          role: 'assistant',
          content: finalJson,
        },
      } as UnifiedAgentsStreamEvent;
    }
  }

  function createExecutor() {
    const client = new FakeUnifiedClient();
    return {
      executor: new MultiAgentExecutor(fakeConfig, {
        defaultModel: 'test-model',
        client: client as any,
      }),
      client,
    };
  }

  it('runs seed agents and synthesises a master response', async () => {
    const architect = getAgentById('systems-architect');
    const qa = getAgentById('code-quality-analyst');
    expect(architect).toBeTruthy();
    expect(qa).toBeTruthy();

    const { executor, client } = createExecutor();
    client.delegateOrder = ['systems-architect', 'code-quality-analyst'];
    const result = await executor.execute('Improve the system reliability.', [
      architect!,
      qa!,
    ]);

    expect(result.agentResults.length).toBeGreaterThanOrEqual(2);
    expect(result.finalResponse).toContain('Final consolidated plan');
    expect(result.aggregateReasoning).toContain(
      'Combined architecture and QA insights',
    );
    expect(result.totalAgents).toBe(result.agentResults.length);
    expect(result.timeline.length).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    const architectResult = result.agentResults.find(
      (r) => r.agent.id === 'systems-architect',
    );
    expect(architectResult?.handoffAgentIds).toContain('code-quality-analyst');

    const qaPrompts = client.promptsByAgent.get('code-quality-analyst') ?? [];
    expect(qaPrompts[0]).toMatch(/Assessed architecture bottlenecks/);
    expect(qaPrompts[0]).toMatch(/Tool Operations Playbook/);
    expect(qaPrompts[0]).not.toMatch(/\${LSTool.Name}/);
  });

  it('enqueues handoff agents requested by specialists', async () => {
    const architect = getAgentById('systems-architect');
    expect(architect).toBeTruthy();

    const { executor, client } = createExecutor();
    client.delegateOrder = ['systems-architect', 'code-quality-analyst'];
    const result = await executor.execute('Focus on architecture first.', [
      architect!,
    ]);
    const agentIds = result.agentResults.map((res) => res.agent.id);

    expect(agentIds).toContain('systems-architect');
    expect(agentIds).toContain('code-quality-analyst');
    expect(
      result.timeline[0]?.agents.some(
        (agent) => agent.id === 'systems-architect',
      ),
    ).toBe(true);
    expect(result.timeline.every((entry) => entry.agents.length === 1)).toBe(
      true,
    );
  });
});
