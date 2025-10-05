/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export default function signalExitShim(handler: () => void) {
  return () => {
    handler();
  };
}
