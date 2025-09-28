/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { adaptToolsToAgents, normalizeToolArgumentsForTest } from './toolAdapter.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import { BaseDeclarativeTool, Kind } from '../tools/tools.js';
import type { ToolInvocation, ToolResult } from '../tools/tools.js';
import type { Config } from '../config/config.js';


class TestTool extends BaseDeclarativeTool<Record<string, unknown>, ToolResult> {
  constructor(options?: { strictParameters?: boolean; needsApproval?: boolean }) {
    super(
      'test_tool',
      'Test Tool',
      'A stub tool for adapter tests.',
      Kind.Other,
      {
        type: 'object',
        properties: { value: { type: 'string' } },
      },
      true,
      false,
      options,
    );
  }

  protected createInvocation(): ToolInvocation<Record<string, unknown>, ToolResult> {
    return {
      params: {},
      getDescription: () => 'test',
      toolLocations: () => [],
      shouldConfirmExecute: async () => false,
      execute: async () => ({ llmContent: '', returnDisplay: '' }),
    };
  }
}

describe('toolAdapter argument normalization', () => {
  it('normalizes path aliases for read_file', () => {
    const normalized = normalizeToolArgumentsForTest('read_file', {
      path: '/tmp/demo.txt',
    });

    expect(normalized).toMatchObject({ absolute_path: '/tmp/demo.txt' });
    expect(normalized).not.toHaveProperty('path');
  });

  it('normalizes path aliases for write_file', () => {
    const normalized = normalizeToolArgumentsForTest('write_file', {
      absolute_path: '/tmp/app.ts',
      content: 'console.log(1);',
    });

    expect(normalized).toMatchObject({
      file_path: '/tmp/app.ts',
      content: 'console.log(1);',
    });
    expect(normalized).not.toHaveProperty('absolute_path');
  });

  it('normalizes path aliases for replace tool', () => {
    const normalized = normalizeToolArgumentsForTest('replace', {
      filePath: '/tmp/app.ts',
      old_string: 'foo',
      new_string: 'bar',
    });

    expect(normalized).toMatchObject({
      file_path: '/tmp/app.ts',
      old_string: 'foo',
      new_string: 'bar',
    });
    expect(normalized).not.toHaveProperty('filePath');
  });

  it('coerces relative file paths into workspace absolute paths when possible', () => {
    const normalized = normalizeToolArgumentsForTest(
      'read_file',
      { absolute_path: 'src/index.ts' },
      { workspaceRoots: ['/repo'], targetDir: '/repo' },
    );

    expect(normalized).toMatchObject({
      absolute_path: '/repo/src/index.ts',
    });
  });
});


describe('adaptToolsToAgents metadata', () => {
  function createStubContext(tool: TestTool) {
    const registry = {
      getAllTools: () => [tool],
    } as unknown as ToolRegistry;

    const config = {
      getWorkspaceContext: () => ({ getDirectories: () => ['/repo'] }),
      getTargetDir: () => '/repo',
      executeToolCall: async () => ({}) as any,
    } as unknown as Config;

    return {
      registry,
      config,
      getPromptId: () => 'prompt-id',
    } as const;
  }

  it('sets strict flag based on tool options', () => {
    const laxTool = new TestTool({ strictParameters: false });
    const strictTool = new TestTool();
    const laxContext = createStubContext(laxTool);
    const strictContext = createStubContext(strictTool);

        const [laxAdapted] = adaptToolsToAgents(laxContext);
    const [strictAdapted] = adaptToolsToAgents(strictContext);

    expect((laxAdapted as any).strict).toBe(false);
    expect((strictAdapted as any).strict).toBe(true);
  });

  it('propagates needsApproval metadata', async () => {
    const approvalTool = new TestTool({ needsApproval: true });
    const { registry, config, getPromptId } = createStubContext(approvalTool);
    const [adapted] = adaptToolsToAgents({
      registry,
      config,
      getPromptId,
    });

    await expect((adapted as any).needsApproval({} as any, {} as any)).resolves.toBe(true);
  });
});
