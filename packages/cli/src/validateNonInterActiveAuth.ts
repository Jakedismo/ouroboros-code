/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '@ouroboros/ouroboros-code-core';
import { AuthType } from '@ouroboros/ouroboros-code-core';
import { USER_SETTINGS_PATH } from './config/settings.js';
import { validateAuthMethod } from './config/auth.js';

function getAuthTypeFromEnv(): AuthType | undefined {
  if (process.env['GOOGLE_GENAI_USE_GCA'] === 'true') {
    return AuthType.LOGIN_WITH_GOOGLE;
  }
  if (process.env['GOOGLE_GENAI_USE_VERTEXAI'] === 'true') {
    return AuthType.USE_VERTEX_AI;
  }
  if (process.env['GEMINI_API_KEY']) {
    return AuthType.USE_GEMINI;
  }
  return undefined;
}

export async function validateNonInteractiveAuth(
  configuredAuthType: AuthType | undefined,
  useExternalAuth: boolean | undefined,
  nonInteractiveConfig: Config,
) {
  let effectiveAuthType = configuredAuthType || getAuthTypeFromEnv();

  // For non-Gemini providers, handle authentication separately
  const currentProvider = nonInteractiveConfig.getProvider();
  if (currentProvider !== 'gemini') {
    // Check if API key is available for the current provider
    const apiKey = nonInteractiveConfig.getProviderApiKey();
    if (!apiKey) {
      const envVarName = currentProvider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
      console.error(
        `Please set ${envVarName} environment variable or use --${currentProvider}-api-key flag for ${currentProvider} provider authentication.`
      );
      process.exit(1);
    }
    
    // For non-Gemini providers, use API key authentication but still initialize GeminiClient
    // The GeminiClient acts as a universal interface that can work with all providers
    effectiveAuthType = AuthType.USE_GEMINI; // This represents API key authentication for all providers
  }

  if (!effectiveAuthType) {
    console.error(
      `Please set an Auth method in your ${USER_SETTINGS_PATH} or specify one of the following environment variables before running: GEMINI_API_KEY, GOOGLE_GENAI_USE_VERTEXAI, GOOGLE_GENAI_USE_GCA`,
    );
    process.exit(1);
  }

  if (!useExternalAuth) {
    // For non-Gemini providers, skip traditional auth validation since we already verified API keys above
    if (currentProvider === 'gemini') {
      const err = validateAuthMethod(effectiveAuthType);
      if (err != null) {
        console.error(err);
        process.exit(1);
      }
    }
  }

  await nonInteractiveConfig.refreshAuth(effectiveAuthType);
  return nonInteractiveConfig;
}
