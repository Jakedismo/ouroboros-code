/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';

const toolMocks = vi.hoisted(() => {
  const stubTool = (name: string) => ({ Name: name });
  class StubDeclarativeTool {
    static Name = 'stub_tool';
    constructor(..._args: unknown[]) {}
  }

  return {
    LSTool: stubTool('list_directory'),
    GlobTool: stubTool('glob'),
    GrepTool: stubTool('grep'),
    RipGrepTool: stubTool('ripgrep'),
    ReadFileTool: stubTool('read_file'),
    ReadManyFilesTool: stubTool('read_many_files'),
    EditTool: stubTool('edit'),
    WriteFileTool: stubTool('write_file'),
    ShellTool: class extends StubDeclarativeTool {
      static override Name = 'run_shell_command';
    },
    MemoryTool: stubTool('save_memory'),
    WebFetchTool: stubTool('web_fetch'),
    WebSearchTool: stubTool('google_web_search'),
    UpdatePlanTool: stubTool('update_plan'),
    ImageGenerationTool: stubTool('generate_image'),
  };
});

vi.mock('../tools/ls.js', () => ({ LSTool: toolMocks.LSTool }));
vi.mock('../tools/glob.js', () => ({ GlobTool: toolMocks.GlobTool }));
vi.mock('../tools/grep.js', () => ({ GrepTool: toolMocks.GrepTool }));
vi.mock('../tools/ripGrep.js', () => ({ RipGrepTool: toolMocks.RipGrepTool }));
vi.mock('../tools/read-file.js', () => ({ ReadFileTool: toolMocks.ReadFileTool }));
vi.mock('../tools/read-many-files.js', () => ({ ReadManyFilesTool: toolMocks.ReadManyFilesTool }));
vi.mock('../tools/edit.js', () => ({ EditTool: toolMocks.EditTool }));
vi.mock('../tools/write-file.js', () => ({ WriteFileTool: toolMocks.WriteFileTool }));
vi.mock('../tools/shell.js', () => ({ ShellTool: toolMocks.ShellTool }));
vi.mock('../tools/memoryTool.js', () => ({ MemoryTool: toolMocks.MemoryTool }));
vi.mock('../tools/web-fetch.js', () => ({ WebFetchTool: toolMocks.WebFetchTool }));
vi.mock('../tools/web-search.js', () => ({ WebSearchTool: toolMocks.WebSearchTool }));
vi.mock('../tools/update-plan.js', () => ({ UpdatePlanTool: toolMocks.UpdatePlanTool }));
vi.mock('../tools/local-shell.js', () => ({ LocalShellTool: toolMocks.ShellTool }));
vi.mock('../tools/image-generation.js', () => ({ ImageGenerationTool: toolMocks.ImageGenerationTool }));

import { AgentSelectorService } from './agentSelectorService.js';

const createService = () =>
  Reflect.construct(AgentSelectorService as unknown as Function, []) as AgentSelectorService;

const stubConfig = {
  getProvider: () => 'openai',
  getModel: () => 'gpt-5',
} as const;

const makeRunAgentOnce = (finalOutput: unknown) =>
  async () => ({
    runResult: {
      finalOutput,
    },
  });

describe('AgentSelectorService structured output parsing', () => {
  let service: AgentSelectorService;

  beforeEach(() => {
    service = createService();
    (service as unknown as { config: typeof stubConfig }).config = stubConfig;
    (service as unknown as { selectedModel: string | null }).selectedModel = 'gpt-5';
    (service as unknown as { unifiedClient: { runAgentOnce: ReturnType<typeof makeRunAgentOnce> } }).unifiedClient = {
      runAgentOnce: makeRunAgentOnce(
        '{"agentIds":["systems-architect","api-designer","security-auditor"],"reasoning":"Direct JSON","confidence":0.82}',
      ),
    };
    (service as unknown as { selectionHistory: unknown[] }).selectionHistory = [];
    (service as unknown as { isAutoModeActive: boolean }).isAutoModeActive = true;
  });

  it('parses dispatcher JSON strings into selections', async () => {
    const result = await service.analyzeAndSelectAgents('Design a secure API gateway.');
    expect(result.selectedAgents.map((agent) => agent.id)).toEqual([
      'systems-architect',
      'api-designer',
      'security-auditor',
    ]);
    expect(result.confidence).toBeCloseTo(0.82, 2);
  });

  it('extracts JSON objects embedded in prose output', async () => {
    const runAgentOnce = makeRunAgentOnce(`Here is the best team:


    {
      "agentIds": ["systems-architect", "code-quality-analyst", "ml-engineer"],
      "reasoning": "Dispatcher returned prose wrapped output",
      "confidence": "0.64"
    }
    `);

    (service as unknown as { unifiedClient: { runAgentOnce: ReturnType<typeof makeRunAgentOnce> } }).unifiedClient = {
      runAgentOnce,
    };

    const result = await service.analyzeAndSelectAgents(
      'Improve our ML pipeline and ensure quality gates.',
    );

    expect(result.selectedAgents.map((agent) => agent.id)).toEqual([
      'systems-architect',
      'code-quality-analyst',
      'ml-engineer',
    ]);
    expect(result.confidence).toBeCloseTo(0.64, 2);
  });
});
