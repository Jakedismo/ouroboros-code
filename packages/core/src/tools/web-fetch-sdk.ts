/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { tool } from '@openai/agents';
import { z } from 'zod';
import { fetchWithTimeout } from '../utils/fetch.js';
import { convert } from 'html-to-text';
import type { Config } from '../index.js';

/**
 * SDK-native web-fetch tool for fetching and processing web content
 * Follows OpenAI Agents SDK best practices
 *
 * Gap #2: Tool Definition Patterns
 * - Uses SDK's tool() function instead of BaseDeclarativeTool
 * - Zod schema instead of manual JSON schema
 * - Simple string return instead of ToolResult
 * - Fetches URLs and converts HTML to readable text
 */

const webFetchParametersSchema = z.object({
  url: z.string().describe(
    'Required: The URL to fetch content from. ' +
    'Supports HTTP/HTTPS protocols. GitHub blob URLs are auto-converted to raw URLs.'
  ),
  timeout: z.number().int().positive().nullable().optional().describe(
    'Optional: Timeout in milliseconds for the fetch request (default: 10000ms)'
  ),
  max_length: z.number().int().positive().nullable().optional().describe(
    'Optional: Maximum content length in characters (default: 100000)'
  ),
});

export type WebFetchParameters = z.infer<typeof webFetchParametersSchema>;

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_LENGTH = 100000;

/**
 * Converts GitHub blob URLs to raw URLs for direct content access
 */
function normalizeGitHubUrl(url: string): string {
  if (url.includes('github.com') && url.includes('/blob/')) {
    return url
      .replace('github.com', 'raw.githubusercontent.com')
      .replace('/blob/', '/');
  }
  return url;
}

/**
 * Creates the SDK-native web-fetch tool
 *
 * @param config - Ouroboros configuration
 * @returns SDK Tool instance for web content fetching
 */
export function createWebFetchTool(config: Config) {
  const sdkTool = tool({
    name: 'web_fetch',
    description:
      'Fetches content from a URL and converts it to readable text.\\n\\n' +
      '**Capabilities:**\\n' +
      '- HTTP/HTTPS URL fetching\\n' +
      '- HTML to text conversion\\n' +
      '- GitHub blob URL auto-conversion\\n' +
      '- Configurable timeout and content length\\n' +
      '- Clean, readable text output\\n\\n' +
      '**Usage:**\\n' +
      '- Fetches web pages and extracts text content\\n' +
      '- Converts HTML to markdown-style text\\n' +
      '- Handles GitHub file URLs automatically\\n' +
      '- Respects timeout and size limits\\n\\n' +
      '**Use Cases:**\\n' +
      '- Reading documentation from websites\\n' +
      '- Fetching README files from GitHub\\n' +
      '- Extracting article content\\n' +
      '- Analyzing web page text\\n\\n' +
      '**Examples:**\\n' +
      '- Basic fetch: { "url": "https://example.com/page.html" }\\n' +
      '- GitHub file: { "url": "https://github.com/user/repo/blob/main/README.md" }\\n' +
      '- With timeout: { "url": "https://slow-site.com", "timeout": 15000 }\\n' +
      '- Size limit: { "url": "https://large-page.com", "max_length": 50000 }',

    parameters: webFetchParametersSchema,

    async execute({ url, timeout, max_length }, signal?: AbortSignal) {
      try {
        // Normalize GitHub URLs
        const normalizedUrl = normalizeGitHubUrl(url);

        // Fetch with timeout
        const timeoutMs = timeout ?? DEFAULT_TIMEOUT_MS;
        const response = await fetchWithTimeout(normalizedUrl, timeoutMs, signal);

        if (!response.ok) {
          return `Error: HTTP ${response.status} ${response.statusText}`;
        }

        // Get content
        const html = await response.text();

        // Convert HTML to readable text
        const textContent = convert(html, {
          wordwrap: false,
          selectors: [
            { selector: 'a', options: { ignoreHref: false } },
            { selector: 'img', format: 'skip' },
            { selector: 'script', format: 'skip' },
            { selector: 'style', format: 'skip' },
            { selector: 'nav', format: 'skip' },
            { selector: 'header', format: 'skip' },
            { selector: 'footer', format: 'skip' },
          ],
        });

        // Trim to max length
        const maxLength = max_length ?? DEFAULT_MAX_LENGTH;
        const trimmed = textContent.substring(0, maxLength);
        const isTruncated = textContent.length > maxLength;

        // Build response
        let output = `Successfully fetched content from: ${normalizedUrl}\\n\\n`;

        if (isTruncated) {
          output += `[Content truncated to ${maxLength} characters from ${textContent.length} total]\\n\\n`;
        }

        output += trimmed;

        return output;

      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error fetching URL: ${message}`;
      }
    },
  });

  return sdkTool;
}

/**
 * Factory class for backward compatibility with tool registry
 */
export class WebFetchToolSDK {
  static readonly Name = 'web_fetch';

  constructor(private config: Config) {}

  /**
   * Creates the SDK-native tool instance
   */
  createTool() {
    return createWebFetchTool(this.config);
  }
}
