/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolCallRequestInfo, ToolCallResponseInfo, Config } from '../index.js';
import { CoreToolScheduler, ToolCall } from './coreToolScheduler.js';

/**
 * Executes a single tool call non-interactively by leveraging the CoreToolScheduler.
 */
export async function executeToolCall(
  config: Config,
  toolCallRequest: ToolCallRequestInfo,
  abortSignal: AbortSignal,
  options?: {
    onToolCallsUpdate?: (calls: ToolCall[]) => void;
    onToolOutput?: (callId: string, chunk: string) => void;
  },
): Promise<ToolCallResponseInfo> {
  return new Promise<ToolCallResponseInfo>((resolve, reject) => {
    new CoreToolScheduler({
      config,
      getPreferredEditor: () => undefined,
      onEditorClose: () => {},
      onAllToolCallsComplete: async (completedToolCalls) => {
        resolve(completedToolCalls[0].response);
      },
      onToolCallsUpdate: options?.onToolCallsUpdate,
      outputUpdateHandler: options?.onToolOutput,
    })
      .schedule(toolCallRequest, abortSignal)
      .catch(reject);
  });
}
