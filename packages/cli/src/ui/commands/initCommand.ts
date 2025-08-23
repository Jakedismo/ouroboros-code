/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  CommandContext,
  SlashCommand,
  SlashCommandActionReturn,
  CommandKind,
} from './types.js';

// Priority order for instruction files
const INSTRUCTION_FILES = [
  'OUROBOROS.md',
  'CLAUDE.md',
  'GEMINI.md',
  'AGENTS.md',
  'QWEN.md',
  'CRUSH.md'
];

export const initCommand: SlashCommand = {
  name: 'init',
  description: 'Analyzes the project and creates/recreates OUROBOROS.md by consolidating all instruction files.',
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
    _args: string,
  ): Promise<SlashCommandActionReturn> => {
    if (!context.services.config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available.',
      };
    }
    const targetDir = context.services.config.getTargetDir();
    
    // Collect content from existing instruction files (except OUROBOROS.md)
    const existingContents: string[] = [];
    const foundFiles: string[] = [];
    
    for (const filename of INSTRUCTION_FILES) {
      // Skip OUROBOROS.md as we're recreating it
      if (filename === 'OUROBOROS.md') continue;
      
      const filePath = path.join(targetDir, filename);
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf8').trim();
          if (content) {
            existingContents.push(`## Content from ${filename}\n\n${content}`);
            foundFiles.push(filename);
          }
        } catch (error) {
          console.error(`Error reading ${filename}:`, error);
        }
      }
    }
    
    // Always use OUROBOROS.md as the target file
    const instructionFileName = 'OUROBOROS.md';
    const instructionFilePath = path.join(targetDir, instructionFileName);

    // Create an empty instruction file
    fs.writeFileSync(instructionFilePath, '', 'utf8');

    // Build message about what we're doing
    let statusMessage = `Creating/recreating ${instructionFileName}.`;
    if (foundFiles.length > 0) {
      statusMessage += ` Consolidating content from: ${foundFiles.join(', ')}.`;
    }
    statusMessage += ' Now analyzing the project to populate it.';

    context.ui.addItem(
      {
        type: 'info',
        text: statusMessage,
      },
      Date.now(),
    );

    // Build consolidated content string if we have existing files
    let consolidatedContent = '';
    if (existingContents.length > 0) {
      consolidatedContent = `

**Existing Instruction Files Content:**

The following content was found in existing instruction files and should be consolidated into the new OUROBOROS.md:

${existingContents.join('\n\n---\n\n')}

---

Please integrate the above existing content appropriately into the new OUROBOROS.md file.`;
    }

    return {
      type: 'submit_prompt',
      content: `
You are an AI agent assisting with Ouroboros Code. Your task is to analyze the current directory and generate a comprehensive ${instructionFileName} file to be used as instructional context for future interactions.${consolidatedContent}

**Analysis Process:**

1.  **Initial Exploration:**
    *   Start by listing the files and directories to get a high-level overview of the structure.
    *   Read the README file (e.g., \`README.md\`, \`README.txt\`) if it exists. This is often the best place to start.

2.  **Iterative Deep Dive (up to 10 files):**
    *   Based on your initial findings, select a few files that seem most important (e.g., configuration files, main source files, documentation).
    *   Read them. As you learn more, refine your understanding and decide which files to read next. You don't need to decide all 10 files at once. Let your discoveries guide your exploration.

3.  **Identify Project Type:**
    *   **Code Project:** Look for clues like \`package.json\`, \`requirements.txt\`, \`pom.xml\`, \`go.mod\`, \`Cargo.toml\`, \`build.gradle\`, or a \`src\` directory. If you find them, this is likely a software project.
    *   **Non-Code Project:** If you don't find code-related files, this might be a directory for documentation, research papers, notes, or something else.

**${instructionFileName} Content Generation:**

**For a Code Project:**

*   **Project Overview:** Write a clear and concise summary of the project's purpose, main technologies, and architecture.
*   **Building and Running:** Document the key commands for building, running, and testing the project. Infer these from the files you've read (e.g., \`scripts\` in \`package.json\`, \`Makefile\`, etc.). If you can't find explicit commands, provide a placeholder with a TODO.
*   **Development Conventions:** Describe any coding styles, testing practices, or contribution guidelines you can infer from the codebase.

**For a Non-Code Project:**

*   **Directory Overview:** Describe the purpose and contents of the directory. What is it for? What kind of information does it hold?
*   **Key Files:** List the most important files and briefly explain what they contain.
*   **Usage:** Explain how the contents of this directory are intended to be used.

**Final Output:**

Write the complete content to the \`${instructionFileName}\` file. The output must be well-formatted Markdown.
`,
    };
  },
};
