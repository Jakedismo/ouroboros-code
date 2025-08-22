/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';
import { isGitRepository } from '../../utils/gitUtils.js';

/**
 * Get sandbox-specific section based on environment
 */
export function getSandboxSection(): string {
  const isSandboxExec = process.env['SANDBOX'] === 'sandbox-exec';
  const isGenericSandbox = !!process.env['SANDBOX'];

  if (isSandboxExec) {
    return `
# macOS Seatbelt
You are running under macos seatbelt with limited access to files outside the project directory or system temp directory, and with limited access to host system resources such as ports. If you encounter failures that could be due to macOS Seatbelt (e.g. if a command fails with 'Operation not permitted' or similar error), as you report the error to the user, also explain why you think it could be due to macOS Seatbelt, and how the user may need to adjust their Seatbelt profile.
`;
  } else if (isGenericSandbox) {
    return `
# Sandbox
You are running in a sandbox container with limited access to files outside the project directory or system temp directory, and with limited access to host system resources such as ports. If you encounter failures that could be due to sandboxing (e.g. if a command fails with 'Operation not permitted' or similar error), when you report the error to the user, also explain why you think it could be due to sandboxing, and how the user may need to adjust their sandbox configuration.
`;
  } else {
    return `
# Outside of Sandbox
You are running outside of a sandbox container, directly on the user's system. For critical commands that are particularly likely to modify the user's system outside of the project directory or system temp directory, as you explain the command to the user (per the Explain Critical Commands rule above), also remind the user to consider enabling sandboxing.
`;
  }
}

/**
 * Get git-specific section if in a git repository
 */
export function getGitSection(): string {
  if (isGitRepository(process.cwd())) {
    return `
# Git Repository
- The current working (project) directory is being managed by a git repository.
- When asked to commit changes or prepare a commit, always start by gathering information using shell commands:
  - \`git status\` to ensure that all relevant files are tracked and staged, using \`git add ...\` as needed.
  - \`git diff HEAD\` to review all changes (including unstaged changes) to tracked files in work tree since last commit.
    - \`git diff --staged\` to review only staged changes when a partial commit makes sense or was requested by the user.
  - \`git log -n 3\` to review recent commit messages and match their style (verbosity, formatting, signature line, etc.)
- Combine shell commands whenever possible to save time/steps, e.g. \`git status && git diff HEAD && git log -n 3\`.
- Always propose a draft commit message. Never just ask the user to give you the full commit message.
- Prefer commit messages that are clear, concise, and focused more on "why" and less on "what".
- Keep the user informed and ask for clarification or confirmation where needed.
- After each commit, confirm that it was successful by running \`git status\`.
- If a commit fails, never attempt to work around the issues without being asked to do so.
- Never push changes to a remote repository without being asked explicitly by the user.
`;
  }
  return '';
}

/**
 * Apply dynamic sections to a base prompt
 * Supports template markers or appends to end
 */
export function applyDynamicSections(basePrompt: string): string {
  const sandboxSection = getSandboxSection();
  const gitSection = getGitSection();
  
  // Check for template markers
  let result = basePrompt;
  
  // Replace markers if they exist
  if (result.includes('{{SANDBOX_SECTION}}')) {
    result = result.replace('{{SANDBOX_SECTION}}', sandboxSection);
  } else {
    // Append sandbox section if no marker
    result = result + '\n' + sandboxSection;
  }
  
  if (result.includes('{{GIT_SECTION}}')) {
    result = result.replace('{{GIT_SECTION}}', gitSection);
  } else {
    // Append git section if no marker
    result = result + gitSection;
  }
  
  return result;
}

/**
 * Template markers that can be used in custom prompts
 */
export const TEMPLATE_MARKERS = {
  SANDBOX: '{{SANDBOX_SECTION}}',
  GIT: '{{GIT_SECTION}}',
  EXAMPLES: '{{EXAMPLES_SECTION}}',
} as const;