/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

type Model = string;
type TokenCount = number;

const DEFAULT_TOKEN_LIMIT = 1_048_576; // ~1M tokens, matches Gemini 2.5
const OPENAI_GPT5_LIMIT = 282_000;
const ANTHROPIC_OPUS_LIMIT = 200_000;
const ANTHROPIC_SONNET_LIMIT = 1_000_000;

function normalize(model: Model | undefined): string {
  if (!model) return '';
  return model.replace(/^models\//i, '').toLowerCase();
}

export function tokenLimit(model: Model): TokenCount {
  const normalized = normalize(model);

  if (normalized === '') {
    return DEFAULT_TOKEN_LIMIT;
  }

  // Gemini family (default remains 1_048_576 unless explicitly overridden)
  switch (normalized) {
    case 'gemini-1.5-pro':
      return 2_097_152;
    case 'gemini-1.5-flash':
    case 'gemini-2.5-pro-preview-05-06':
    case 'gemini-2.5-pro-preview-06-05':
    case 'gemini-2.5-pro':
    case 'gemini-2.5-flash-preview-05-20':
    case 'gemini-2.5-flash':
    case 'gemini-2.5-flash-lite':
    case 'gemini-2.0-flash':
      return DEFAULT_TOKEN_LIMIT;
    case 'gemini-2.0-flash-preview-image-generation':
      return 32_000;
    default:
      break;
  }

  // OpenAI GPT-5 family (multimodal + coding variants share the same 282k window)
  if (normalized.startsWith('gpt-5') || normalized.startsWith('gpt-5-codex')) {
    return OPENAI_GPT5_LIMIT;
  }

  // Anthropic premium models
  if (normalized.includes('claude-opus-4-1')) {
    return ANTHROPIC_OPUS_LIMIT;
  }
  if (normalized.includes('claude-sonnet-4-20250514')) {
    return ANTHROPIC_SONNET_LIMIT;
  }

  return DEFAULT_TOKEN_LIMIT;
}
