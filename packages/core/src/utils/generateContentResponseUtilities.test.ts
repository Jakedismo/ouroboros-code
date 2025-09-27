/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  getResponseTextFromParts,
  getFunctionCalls,
  getFunctionCallsFromParts,
  getFunctionCallsAsJson,
  getFunctionCallsFromPartsAsJson,
  getStructuredResponse,
  getStructuredResponseFromParts,
} from './generateContentResponseUtilities.js';
import type { AgentContentFragment, AgentMessage, AgentFunctionCall } from '../runtime/agentsTypes.js';

const mockTextFragment = (text: string): AgentContentFragment => ({ text });
const mockFunctionCallFragment = (
  name: string,
  args?: Record<string, unknown>,
): AgentContentFragment => ({
  functionCall: { name, args: args ?? {} },
});

const mockResponse = (parts: AgentContentFragment[]) => ({
  candidates: [
    {
      content: {
        parts,
        role: 'assistant',
      },
      index: 0,
    },
  ],
});

const minimalMockResponse = (candidates: unknown) => ({
  candidates,
});

describe('generateContentResponseUtilities', () => {
  describe('getResponseTextFromParts', () => {
    it('should return undefined for no parts', () => {
      expect(getResponseTextFromParts([])).toBeUndefined();
    });
    it('should extract text from a single text part', () => {
      expect(getResponseTextFromParts([mockTextFragment('Hello')])).toBe('Hello');
    });
    it('should concatenate text from multiple text parts', () => {
      expect(
        getResponseTextFromParts([
          mockTextFragment('Hello '),
          mockTextFragment('World'),
        ]),
      ).toBe('Hello World');
    });
    it('should ignore function call parts', () => {
      expect(
        getResponseTextFromParts([
          mockTextFragment('Hello '),
          mockFunctionCallFragment('testFunc'),
          mockTextFragment('World'),
        ]),
      ).toBe('Hello World');
    });
    it('should return undefined if only function call parts exist', () => {
      expect(
        getResponseTextFromParts([
          mockFunctionCallFragment('testFunc'),
          mockFunctionCallFragment('anotherFunc'),
        ]),
      ).toBeUndefined();
    });
  });

  describe('getFunctionCalls', () => {
    it('should return undefined for no candidates', () => {
      expect(getFunctionCalls(minimalMockResponse(undefined))).toBeUndefined();
    });
    it('should return undefined for empty candidates array', () => {
      expect(getFunctionCalls(minimalMockResponse([]))).toBeUndefined();
    });
    it('should return undefined for no parts', () => {
      const response = mockResponse([]);
      expect(getFunctionCalls(response)).toBeUndefined();
    });
    it('should extract a single function call', () => {
      const func: AgentFunctionCall = { name: 'testFunc', args: { a: 1 } };
      const response = mockResponse([
        mockFunctionCallFragment(func.name!, func.args),
      ]);
      expect(getFunctionCalls(response)).toEqual([func]);
    });
    it('should extract multiple function calls', () => {
      const func1: AgentFunctionCall = { name: 'testFunc1', args: { a: 1 } };
      const func2: AgentFunctionCall = { name: 'testFunc2', args: { b: 2 } };
      const response = mockResponse([
        mockFunctionCallFragment(func1.name!, func1.args),
        mockFunctionCallFragment(func2.name!, func2.args),
      ]);
      expect(getFunctionCalls(response)).toEqual([func1, func2]);
    });
    it('should ignore text parts', () => {
      const func: AgentFunctionCall = { name: 'testFunc', args: { a: 1 } };
      const response = mockResponse([
        mockTextFragment('Some text'),
        mockFunctionCallFragment(func.name!, func.args),
        mockTextFragment('More text'),
      ]);
      expect(getFunctionCalls(response)).toEqual([func]);
    });
    it('should return undefined if only text parts exist', () => {
      const response = mockResponse([
        mockTextFragment('Some text'),
        mockTextFragment('More text'),
      ]);
      expect(getFunctionCalls(response)).toBeUndefined();
    });
    it('should read function calls from agent messages', () => {
      const func: AgentFunctionCall = { name: 'msgFunc', args: { x: 42 } };
      const message: AgentMessage = {
        role: 'assistant',
        parts: [mockFunctionCallFragment(func.name!, func.args)],
      };
      expect(getFunctionCalls({ message })).toEqual([func]);
    });
  });

  describe('getFunctionCallsFromParts', () => {
    it('should return undefined for no parts', () => {
      expect(getFunctionCallsFromParts([])).toBeUndefined();
    });
    it('should extract a single function call', () => {
      const func: AgentFunctionCall = { name: 'testFunc', args: { a: 1 } };
      expect(
        getFunctionCallsFromParts([
          mockFunctionCallFragment(func.name!, func.args),
        ]),
      ).toEqual([func]);
    });
    it('should extract multiple function calls', () => {
      const func1: AgentFunctionCall = { name: 'testFunc1', args: { a: 1 } };
      const func2: AgentFunctionCall = { name: 'testFunc2', args: { b: 2 } };
      expect(
        getFunctionCallsFromParts([
          mockFunctionCallFragment(func1.name!, func1.args),
          mockFunctionCallFragment(func2.name!, func2.args),
        ]),
      ).toEqual([func1, func2]);
    });
    it('should ignore text parts', () => {
      const func: AgentFunctionCall = { name: 'testFunc', args: { a: 1 } };
      expect(
        getFunctionCallsFromParts([
          mockTextFragment('Some text'),
          mockFunctionCallFragment(func.name!, func.args),
          mockTextFragment('More text'),
        ]),
      ).toEqual([func]);
    });
    it('should return undefined if only text parts exist', () => {
      expect(
        getFunctionCallsFromParts([
          mockTextFragment('Some text'),
          mockTextFragment('More text'),
        ]),
      ).toBeUndefined();
    });
  });

  describe('getFunctionCallsAsJson', () => {
    it('should return JSON string of function calls', () => {
      const func1: AgentFunctionCall = { name: 'testFunc1', args: { a: 1 } };
      const func2: AgentFunctionCall = { name: 'testFunc2', args: { b: 2 } };
      const response = mockResponse([
        mockFunctionCallFragment(func1.name!, func1.args),
        mockTextFragment('text in between'),
        mockFunctionCallFragment(func2.name!, func2.args),
      ]);
      const expectedJson = JSON.stringify([func1, func2], null, 2);
      expect(getFunctionCallsAsJson(response)).toBe(expectedJson);
    });
    it('should return undefined when there are no function calls', () => {
      const response = mockResponse([mockTextFragment('Only text')]);
      expect(getFunctionCallsAsJson(response)).toBeUndefined();
    });
  });

  describe('getFunctionCallsFromPartsAsJson', () => {
    it('should return JSON string of function calls from parts', () => {
      const func1: AgentFunctionCall = { name: 'testFunc1', args: { a: 1 } };
      const func2: AgentFunctionCall = { name: 'testFunc2', args: { b: 2 } };
      const parts = [
        mockFunctionCallFragment(func1.name!, func1.args),
        mockFunctionCallFragment(func2.name!, func2.args),
      ];
      const expectedJson = JSON.stringify([func1, func2], null, 2);
      expect(getFunctionCallsFromPartsAsJson(parts)).toBe(expectedJson);
    });
    it('should return undefined when there are no function calls in parts', () => {
      const parts = [mockTextFragment('Only text')];
      expect(getFunctionCallsFromPartsAsJson(parts)).toBeUndefined();
    });
  });

  describe('getStructuredResponse', () => {
    it('should return only text if only text exists', () => {
      const response = mockResponse([
        mockTextFragment('Hello '),
        mockTextFragment('World'),
      ]);
      expect(getStructuredResponse(response)).toBe('Hello World');
    });
    it('should return only function call JSON if only function calls exist', () => {
      const func: AgentFunctionCall = { name: 'testFunc', args: { a: 1 } };
      const response = mockResponse([
        mockFunctionCallFragment(func.name!, func.args),
      ]);
      const expectedJson = JSON.stringify([func], null, 2);
      expect(getStructuredResponse(response)).toBe(expectedJson);
    });
    it('should return text and function call JSON if both exist', () => {
      const func: AgentFunctionCall = { name: 'testFunc', args: { a: 1 } };
      const parts = [
        mockTextFragment('Hello World'),
        mockFunctionCallFragment(func.name!, func.args),
      ];
      const expectedJson = JSON.stringify([func], null, 2);
      expect(getStructuredResponse(mockResponse(parts))).toBe(
        `Hello World\n${expectedJson}`,
      );
    });
    it('should return undefined if neither text nor function calls exist', () => {
      const response = minimalMockResponse([]);
      expect(getStructuredResponse(response)).toBeUndefined();
    });
  });

  describe('getStructuredResponseFromParts', () => {
    it('should return only text if only text exists in parts', () => {
      const parts = [mockTextFragment('Hello '), mockTextFragment('World')];
      expect(getStructuredResponseFromParts(parts)).toBe('Hello World');
    });
    it('should return only function call JSON if only function calls exist in parts', () => {
      const func: AgentFunctionCall = { name: 'testFunc', args: { a: 1 } };
      const parts = [mockFunctionCallFragment(func.name!, func.args)];
      const expectedJson = JSON.stringify([func], null, 2);
      expect(getStructuredResponseFromParts(parts)).toBe(expectedJson);
    });
    it('should return text and function call JSON if both exist in parts', () => {
      const func: AgentFunctionCall = { name: 'testFunc', args: { a: 1 } };
      const parts = [
        mockTextFragment('Hello World'),
        mockFunctionCallFragment(func.name!, func.args),
      ];
      const expectedJson = JSON.stringify([func], null, 2);
      expect(getStructuredResponseFromParts(parts)).toBe(
        `Hello World\n${expectedJson}`,
      );
    });
    it('should return undefined if neither text nor function calls exist in parts', () => {
      const parts: AgentContentFragment[] = [];
      expect(getStructuredResponseFromParts(parts)).toBeUndefined();
    });
  });
});
