/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { getAvailableToolNames, injectToolExamples } from './toolInjector.js';

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

  it('injects the tool operations playbook exactly once', () => {
    const basePrompt = '# Specialist Prompt\n\nDo something smart.';
    const enhanced = injectToolExamples(basePrompt);

    const playbookOccurrences = enhanced.match(/# Tool Operations Playbook/g) ?? [];
    expect(playbookOccurrences.length).toBe(1);

    // Ensure the reminder about using all tools is present.
    expect(enhanced).toContain('you have access to ALL tools');
  });
});
