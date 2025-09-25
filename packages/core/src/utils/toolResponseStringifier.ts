/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Converts arbitrary tool response payloads (text, function responses, binary metadata) into
 * a human-readable string. The helper operates strictly on structural conventions so it
 * remains agnostic of legacy provider SDK types.
 */
export function toolResponsePartsToString(content: unknown): string {
  if (!content) {
    return '';
  }

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => toolResponsePartsToString(part))
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .join('\n')
      .trim();
  }

  if (typeof content !== 'object') {
    return String(content);
  }

  const record = content as Record<string, unknown>;

  if (typeof record['text'] === 'string') {
    return record['text'] as string;
  }

  const nestedContent = record['content'];
  if (Array.isArray(nestedContent)) {
    const rendered = toolResponsePartsToString(nestedContent);
    if (rendered) {
      return rendered;
    }
  }

  if ('functionResponse' in record) {
    const functionResponse = record['functionResponse'];
    if (functionResponse && typeof functionResponse === 'object') {
      const response = (functionResponse as Record<string, unknown>)['response'];
      if (typeof response === 'string') {
        return response;
      }
      if (Array.isArray(response)) {
        return toolResponsePartsToString(response);
      }
      if (response && typeof response === 'object') {
        const responseContent = (response as Record<string, unknown>)['content'];
        if (Array.isArray(responseContent)) {
          return toolResponsePartsToString(responseContent);
        }
        try {
          return JSON.stringify(response);
        } catch (_error) {
          return '[functionResponse]';
        }
      }
      try {
        return JSON.stringify(functionResponse);
      } catch (_error) {
        return '[functionResponse]';
      }
    }
    return '[functionResponse]';
  }

  if ('inlineData' in record) {
    const inlineData = record['inlineData'];
    if (inlineData && typeof inlineData === 'object') {
      const mime = (inlineData as Record<string, unknown>)['mimeType'];
      const mimeType = typeof mime === 'string' ? mime : 'unknown-mime-type';
      return `[inline data: ${mimeType}]`;
    }
    return '[inline data]';
  }

  if ('fileData' in record) {
    const fileData = record['fileData'];
    if (fileData && typeof fileData === 'object') {
      const mime = (fileData as Record<string, unknown>)['mimeType'];
      const uri = (fileData as Record<string, unknown>)['fileUri'];
      const mimeType = typeof mime === 'string' ? mime : 'unknown-mime-type';
      if (typeof uri === 'string') {
        return `[file: ${uri} (${mimeType})]`;
      }
      return `[file data: ${mimeType}]`;
    }
    return '[file data]';
  }

  if ('inlineText' in record && typeof record['inlineText'] === 'string') {
    return record['inlineText'] as string;
  }

  try {
    return JSON.stringify(record);
  } catch (_error) {
    return '';
  }
}
