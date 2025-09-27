/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  partToString,
  getResponseText,
  flatMapTextParts,
  appendToLastTextPart,
} from './partUtils.js';
import type { AgentContentFragment, AgentMessage } from '../runtime/agentsTypes.js';

type MockResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<Record<string, unknown> | string>;
    };
  }>;
};

const mockResponse = (
  parts?: Array<{ text?: string; functionCall?: unknown } | string>,
): MockResponse => ({
  candidates: parts ? [{ content: { parts } }] : [],
});

describe('partUtils', () => {
  describe('partToString (default behavior)', () => {
    it('should return empty string for undefined or null', () => {
      // @ts-expect-error Testing invalid input
      expect(partToString(undefined)).toBe('');
      // @ts-expect-error Testing invalid input
      expect(partToString(null)).toBe('');
    });

    it('should return string input unchanged', () => {
      expect(partToString('hello')).toBe('hello');
    });

    it('should concatenate strings from an array', () => {
      expect(partToString(['a', 'b'])).toBe('ab');
    });

    it('should return text property when provided a text part', () => {
      expect(partToString({ text: 'hi' })).toBe('hi');
    });

    it('should return empty string for non-text parts', () => {
      const part = { inlineData: { mimeType: 'image/png' } };
      expect(partToString(part)).toBe('');
      const part2 = { functionCall: { name: 'test' } };
      expect(partToString(part2)).toBe('');
    });
  });

  describe('partToString (verbose)', () => {
    const verboseOptions = { verbose: true };

    it('should return empty string for undefined or null', () => {
      // @ts-expect-error Testing invalid input
      expect(partToString(undefined, verboseOptions)).toBe('');
      // @ts-expect-error Testing invalid input
      expect(partToString(null, verboseOptions)).toBe('');
    });

    it('should return string input unchanged', () => {
      expect(partToString('hello', verboseOptions)).toBe('hello');
    });

    it('should join parts if the value is an array', () => {
      const parts = ['hello', { text: ' world' }];
      expect(partToString(parts, verboseOptions)).toBe('hello world');
    });

    it('should return the text property if the part is an object with text', () => {
      const part = { text: 'hello world' };
      expect(partToString(part, verboseOptions)).toBe('hello world');
    });

    it('should return descriptive string for videoMetadata part', () => {
      const part = { videoMetadata: {} };
      expect(partToString(part, verboseOptions)).toBe('[Video Metadata]');
    });

    it('should return descriptive string for thought part', () => {
      const part = { thought: 'thinking' };
      expect(partToString(part, verboseOptions)).toBe('[Thought: thinking]');
    });

    it('should return descriptive string for codeExecutionResult part', () => {
      const part = { codeExecutionResult: {} };
      expect(partToString(part, verboseOptions)).toBe('[Code Execution Result]');
    });

    it('should return descriptive string for executableCode part', () => {
      const part = { executableCode: {} };
      expect(partToString(part, verboseOptions)).toBe('[Executable Code]');
    });

    it('should return descriptive string for fileData part', () => {
      const part = { fileData: {} };
      expect(partToString(part, verboseOptions)).toBe('[File Data]');
    });

    it('should return descriptive string for functionCall part', () => {
      const part = { functionCall: { name: 'myFunction' } };
      expect(partToString(part, verboseOptions)).toBe('[Function Call: myFunction]');
    });

    it('should return descriptive string for functionResponse part', () => {
      const part = { functionResponse: { name: 'myFunction' } };
      expect(partToString(part, verboseOptions)).toBe('[Function Response: myFunction]');
    });

    it('should return descriptive string for inlineData part', () => {
      const part = { inlineData: { mimeType: 'image/png' } };
      expect(partToString(part, verboseOptions)).toBe('<image/png>');
    });

    it('should return an empty string for an unknown part type', () => {
      const part = {};
      expect(partToString(part, verboseOptions)).toBe('');
    });

    it('should handle complex nested arrays with various part types', () => {
      const parts = [
        'start ',
        { text: 'middle' },
        [
          { functionCall: { name: 'func1' } },
          ' end',
          { inlineData: { mimeType: 'audio/mp3' } },
        ],
      ];
      expect(partToString(parts as unknown as AgentContentFragment[], verboseOptions)).toBe(
        'start middle[Function Call: func1] end<audio/mp3>',
      );
    });
  });

  describe('getResponseText', () => {
    it('should return null when no candidates exist', () => {
      const response = mockResponse(undefined);
      expect(getResponseText(response)).toBeNull();
    });

    it('should return concatenated text from first candidate', () => {
      const result = mockResponse([{ text: 'a' }, { text: 'b' }]);
      expect(getResponseText(result)).toBe('ab');
    });

    it('should ignore parts without text', () => {
      const result = mockResponse([{ functionCall: {} }, { text: 'hello' }]);
      expect(getResponseText(result)).toBe('hello');
    });

    it('should return null when candidate has no parts', () => {
      const result = mockResponse([]);
      expect(getResponseText(result)).toBeNull();
    });

    it('should return null if the first candidate has no content property', () => {
      const response: MockResponse = {
        candidates: [
          {
            // no content
          },
        ],
      };
      expect(getResponseText(response)).toBeNull();
    });

    it('should handle agent message payloads', () => {
      const message: AgentMessage = {
        role: 'assistant',
        parts: ['Hello', { text: ' world' }],
      };
      expect(getResponseText(message)).toBe('Hello world');
    });

    it('should handle wrapper objects containing message property', () => {
      const payload = {
        message: {
          role: 'assistant',
          parts: ['Hi'],
        },
      };
      expect(getResponseText(payload)).toBe('Hi');
    });
  });

  describe('flatMapTextParts', () => {
    const splitCharsTransform = async (
      text: string,
    ): Promise<AgentContentFragment[]> =>
      text.split('').map((char) => ({ text: char }));

    it('should return an empty array for empty input', async () => {
      const result = await flatMapTextParts([], splitCharsTransform);
      expect(result).toEqual([]);
    });

    it('should transform a simple string input', async () => {
      const result = await flatMapTextParts('hi', splitCharsTransform);
      expect(result).toEqual([{ text: 'h' }, { text: 'i' }]);
    });

    it('should transform an array of strings and objects', async () => {
      const result = await flatMapTextParts(
        ['hi', { text: '!' }],
        splitCharsTransform,
      );
      expect(result).toEqual([{ text: 'h' }, { text: 'i' }, { text: '!' }]);
    });

    it('should preserve non-text parts', async () => {
      const nonTextPart = { inlineData: { mimeType: 'image/png' } };
      const result = await flatMapTextParts(
        ['go', nonTextPart],
        splitCharsTransform,
      );
      expect(result).toEqual([
        { text: 'g' },
        { text: 'o' },
        nonTextPart,
      ]);
    });

    it('should handle nested arrays', async () => {
      const parts: AgentContentFragment[] = [
        'hi',
        [' there', { text: '!' }],
      ] as unknown as AgentContentFragment[];
      const result = await flatMapTextParts(parts, splitCharsTransform);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should allow transforms to remove parts entirely', async () => {
      const removeTransform = async (): Promise<AgentContentFragment[]> => [];
      const parts: AgentContentFragment[] = ['keep', 'drop'];
      const result = await flatMapTextParts(parts, removeTransform);
      expect(result).toEqual([]);
    });
  });

  describe('appendToLastTextPart', () => {
    it('should append to an empty prompt', () => {
      const prompt: AgentContentFragment[] = [];
      expect(appendToLastTextPart(prompt, 'hello')).toEqual([
        { text: 'hello' },
      ]);
    });

    it('should append to a prompt with a string as the last part', () => {
      const prompt: AgentContentFragment[] = ['first part'];
      expect(appendToLastTextPart(prompt, 'second')).toEqual([
        'first part\n\nsecond',
      ]);
    });

    it('should append to a prompt with a text object as the last part', () => {
      const prompt: AgentContentFragment[] = [{ text: 'first part' }];
      expect(appendToLastTextPart(prompt, 'second')).toEqual([
        { text: 'first part\n\nsecond' },
      ]);
    });

    it('should add a new text part if the last part is non-text', () => {
      const nonTextPart = { inlineData: { mimeType: 'image/png' } };
      const prompt: AgentContentFragment[] = [nonTextPart];
      expect(appendToLastTextPart(prompt, 'second')).toEqual([
        nonTextPart,
        { text: 'second' },
      ]);
    });

    it('should respect custom separator', () => {
      const prompt: AgentContentFragment[] = ['first part'];
      expect(appendToLastTextPart(prompt, 'second', '---')).toEqual([
        'first part---second',
      ]);
    });
  });
});
