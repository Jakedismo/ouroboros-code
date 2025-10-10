/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  getAvailableToolNames,
  injectToolExamples,
  buildSharedToolingAppendix,
} from './toolInjector.js';
import type { Config } from '../config/config.js';

const BUILT_IN_TOOL_NAMES = [
  'list_directory',
  'glob',
  'search_file_content',
  'ripgrep_search',
  'read_file',
  'read_many_files',
  'replace',
  'write_file',
  'run_shell_command',
  'save_memory',
  'web_fetch',
  'google_web_search',
];

describe('toolInjector', () => {
  it('exposes all built-in tools through getAvailableToolNames', () => {
    const names = getAvailableToolNames();
    const uniqueNames = new Set(names);
    const duplicates = names.filter(
      (name, index) => names.indexOf(name) !== index,
    );

    expect(duplicates, `duplicate tool names detected: ${duplicates.join(', ')}`)
      .toHaveLength(0);

    for (const toolName of BUILT_IN_TOOL_NAMES) {
      expect(uniqueNames.has(toolName)).toBe(true);
    }
  });

  it('injects the legacy shared appendix once when no config is provided', () => {
    const basePrompt = '# Specialist Prompt\n\nDo something smart.';
    const enhanced = injectToolExamples(basePrompt);

    const playbookOccurrences = enhanced.match(/# Tool Operations Playbook/g) ?? [];
    expect(playbookOccurrences.length).toBe(1);
    expect(enhanced).toContain('Remember: you are expected to take action');
  });

  it('buildSharedToolingAppendix filters unavailable tools', () => {
    const availableTools = new Set([
      'list_directory',
      'glob',
      'replace',
      'write_file',
      'run_shell_command',
    ]);

    const stubRegistry = {
      getTool(name: string) {
        return availableTools.has(name) ? ({ name } as unknown) : undefined;
      },
      getAllTools() {
        return [];
      },
    };

    const config = {
      isToolEnabled(identifiers: string[]) {
        return identifiers.some((identifier) => availableTools.has(identifier));
      },
      getToolRegistry() {
        return stubRegistry;
      },
    } as unknown as Config;

    const appendix = buildSharedToolingAppendix(config);

    expect(appendix).toContain('Tool Operations Playbook');
    expect(appendix).toContain('list_directory');
    expect(appendix).not.toContain('google_web_search');
  });
});
