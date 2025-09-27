/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AgentMessage as CoreAgentMessage,
  AgentFunctionCall as CoreAgentFunctionCall,
  Part as CorePart,
  PartListUnion as CorePartListUnion,
} from '@ouroboros/ouroboros-code-core';

export type GeminiFinishReason =
  | 'FINISH_REASON_UNSPECIFIED'
  | 'STOP'
  | 'MAX_TOKENS'
  | 'SAFETY'
  | 'RECITATION'
  | 'LANGUAGE'
  | 'BLOCKLIST'
  | 'PROHIBITED_CONTENT'
  | 'SPII'
  | 'OTHER'
  | 'MALFORMED_FUNCTION_CALL'
  | 'IMAGE_SAFETY'
  | 'UNEXPECTED_TOOL_CALL';

export const GeminiFinishReasons: Record<GeminiFinishReason, GeminiFinishReason> = {
  FINISH_REASON_UNSPECIFIED: 'FINISH_REASON_UNSPECIFIED',
  STOP: 'STOP',
  MAX_TOKENS: 'MAX_TOKENS',
  SAFETY: 'SAFETY',
  RECITATION: 'RECITATION',
  LANGUAGE: 'LANGUAGE',
  BLOCKLIST: 'BLOCKLIST',
  PROHIBITED_CONTENT: 'PROHIBITED_CONTENT',
  SPII: 'SPII',
  OTHER: 'OTHER',
  MALFORMED_FUNCTION_CALL: 'MALFORMED_FUNCTION_CALL',
  IMAGE_SAFETY: 'IMAGE_SAFETY',
  UNEXPECTED_TOOL_CALL: 'UNEXPECTED_TOOL_CALL',
};

export function isGeminiFinishReason(value: unknown): value is GeminiFinishReason {
  return typeof value === 'string' && value in GeminiFinishReasons;
}

export type GeminiPart = CorePart;
export type GeminiPartListUnion = CorePartListUnion;
export type GeminiContent = CoreAgentMessage;
export type GeminiFunctionCall = CoreAgentFunctionCall;
