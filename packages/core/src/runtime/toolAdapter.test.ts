/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { normalizeToolArgumentsForTest } from './toolAdapter.js';

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
