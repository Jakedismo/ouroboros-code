/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { tool } from '@openai/agents';
import { z } from 'zod';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Storage } from '../config/storage.js';
import type { Config } from '../index.js';

/**
 * SDK-native memory tool implementation
 * Saves facts to OUROBOROS.md files in .ouroboros directory
 *
 * Gap #2: Tool Definition Patterns
 * - Uses SDK's tool() function instead of BaseDeclarativeTool
 * - Zod schema instead of manual JSON schema
 * - Simple string return instead of ToolResult
 */

export const OUROBOROS_CONFIG_DIR = '.ouroboros';
export const DEFAULT_CONTEXT_FILENAME = 'OUROBOROS.md';
export const MEMORY_SECTION_HEADER = '## Ouroboros Added Memories';

const memoryParametersSchema = z.object({
  fact: z.string().describe(
    'The specific fact or piece of information to remember. ' +
    'Should be a clear, self-contained statement.'
  ),
  modified_by_user: z.boolean().nullable().optional().describe(
    'Optional: Whether the content was modified by the user'
  ),
  modified_content: z.string().nullable().optional().describe(
    'Optional: Modified content if user changed it'
  ),
});

export type MemoryParameters = z.infer<typeof memoryParametersSchema>;

/**
 * Ensures proper newline separation before appending content
 */
function ensureNewlineSeparation(currentContent: string): string {
  if (currentContent.length === 0) return '';
  if (currentContent.endsWith('\n\n') || currentContent.endsWith('\r\n\r\n')) return '';
  if (currentContent.endsWith('\n') || currentContent.endsWith('\r\n')) return '\n';
  return '\n\n';
}

/**
 * Computes the new content that would result from adding a memory entry
 */
function computeNewContent(currentContent: string, fact: string): string {
  let processedText = fact.trim();
  // Remove leading dashes if present (user might include them)
  processedText = processedText.replace(/^(-+\s*)+/, '').trim();
  const newMemoryItem = `- ${processedText}`;

  const headerIndex = currentContent.indexOf(MEMORY_SECTION_HEADER);

  if (headerIndex === -1) {
    // Header not found, append header and then the entry
    const separator = ensureNewlineSeparation(currentContent);
    return currentContent + `${separator}${MEMORY_SECTION_HEADER}\n${newMemoryItem}\n`;
  } else {
    // Header found, find where to insert the new memory entry
    const startOfSectionContent = headerIndex + MEMORY_SECTION_HEADER.length;

    // Find next section header (## ) or end of file
    let endOfSectionIndex = currentContent.indexOf('\n## ', startOfSectionContent);
    if (endOfSectionIndex === -1) {
      endOfSectionIndex = currentContent.length;
    }

    const sectionContent = currentContent.substring(startOfSectionContent, endOfSectionIndex);

    // Find last memory item line to append after it
    const lines = sectionContent.split('\n');
    let lastItemIndex = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim().startsWith('-')) {
        lastItemIndex = i;
        break;
      }
    }

    if (lastItemIndex === -1) {
      // No items yet, insert right after header
      return (
        currentContent.substring(0, startOfSectionContent) +
        `\n${newMemoryItem}\n` +
        currentContent.substring(endOfSectionIndex)
      );
    } else {
      // Insert after last item
      const beforeSection = currentContent.substring(0, startOfSectionContent);
      const afterSection = currentContent.substring(endOfSectionIndex);

      lines.splice(lastItemIndex + 1, 0, newMemoryItem);

      return beforeSection + lines.join('\n') + afterSection;
    }
  }
}

/**
 * Creates the SDK-native memory tool
 *
 * @param config - Ouroboros configuration
 * @returns SDK Tool instance for saving memories
 */
export function createMemoryTool(config: Config) {
  const sdkTool = tool({
    name: 'save_memory',
    description:
      'Saves a specific piece of information or fact to your long-term memory in OUROBOROS.md. ' +
      'Use this when the user explicitly asks you to remember something, or when they state ' +
      'a clear, concise fact that seems important to retain for future interactions.\\n\\n' +
      '**When to Use:**\\n' +
      '- User explicitly asks to remember something\\n' +
      '- User states clear facts about preferences, environment, or important details\\n' +
      '- Information should persist across sessions\\n\\n' +
      '**When NOT to Use:**\\n' +
      '- Conversational context only relevant for current session\\n' +
      '- Long, complex, or rambling text (keep facts concise)\\n' +
      '- Uncertain if worth remembering (ask user first)\\n\\n' +
      '**Storage:**\\n' +
      '- Facts saved to ~/.ouroboros/OUROBOROS.md\\n' +
      '- Organized under "## Ouroboros Added Memories" section\\n' +
      '- Automatically formatted as bullet points\\n\\n' +
      '**Examples:**\\n' +
      '- "My favorite color is blue"\\n' +
      '- "I prefer TypeScript over JavaScript"\\n' +
      '- "Project deadline is next Friday"',

    parameters: memoryParametersSchema,

    async execute({ fact, modified_by_user, modified_content }) {
      try {
        // Use modified content if provided by user
        const finalFact = modified_by_user && modified_content ? modified_content : fact;

        // Ensure global Ouroboros directory exists
        const globalDir = Storage.getGlobalGeminiDir();
        await fs.mkdir(globalDir, { recursive: true });

        // Get memory file path
        const memoryFilePath = path.join(globalDir, DEFAULT_CONTEXT_FILENAME);

        // Read current content or start fresh
        let currentContent = '';
        try {
          currentContent = await fs.readFile(memoryFilePath, 'utf-8');
        } catch (err: any) {
          if (err.code !== 'ENOENT') {
            return `Error: Could not read memory file: ${err.message}`;
          }
          // File doesn't exist yet, will be created
        }

        // Compute new content with the fact added
        const newContent = computeNewContent(currentContent, finalFact);

        // Write updated content
        await fs.writeFile(memoryFilePath, newContent, 'utf-8');

        // Format success message
        const wasNewFile = currentContent.length === 0;
        const action = wasNewFile ? 'created' : 'updated';

        let message = `Successfully ${action} memory file: ${memoryFilePath}\\n`;
        message += `Saved fact: "${finalFact.trim()}"`;

        if (modified_by_user) {
          message += '\\n(Content was modified by user)';
        }

        return message;

      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error saving memory: ${message}`;
      }
    },
  });

  return sdkTool;
}

/**
 * Factory class for backward compatibility with tool registry
 */
export class MemoryToolSDK {
  static readonly Name = 'save_memory';

  constructor(private config: Config) {}

  /**
   * Creates the SDK-native tool instance
   */
  createTool() {
    return createMemoryTool(this.config);
  }
}
