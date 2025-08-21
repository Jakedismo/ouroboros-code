/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
declare global {
    namespace Vi {
        interface AsymmetricMatchersContaining {
            toBeOneOf(expected: unknown[]): unknown;
        }
    }
}
export {};
