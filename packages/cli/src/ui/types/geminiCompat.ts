/**
 * @license
 * Copyright 2025 Ouroboros Development Team
 * SPDX-License-Identifier: Apache-2.0
 */

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

export interface GeminiFunctionCall {
  id?: string;
  name: string;
  args?: Record<string, unknown>;
}

export interface GeminiPart {
  text?: string;
  functionCall?: GeminiFunctionCall;
  functionResponse?: {
    id?: string;
    name?: string;
    response?: unknown;
  };
  [key: string]: unknown;
}

export type GeminiPartListUnion =
  | string
  | GeminiPart
  | Array<string | GeminiPart>;

export interface GeminiContent {
  role: string;
  parts: GeminiPartListUnion[];
}
