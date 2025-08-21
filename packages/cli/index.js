#!/usr/bin/env node
function _instanceof(left, right) {
    if (right != null && typeof Symbol !== "undefined" && right[Symbol.hasInstance]) {
        return !!right[Symbol.hasInstance](left);
    } else {
        return left instanceof right;
    }
}
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */ import './src/gemini.js';
import { main } from './src/gemini.js';
// --- Global Entry Point ---
main().catch(function(error) {
    console.error('An unexpected critical error occurred:');
    if (_instanceof(error, Error)) {
        console.error(error.stack);
    } else {
        console.error(String(error));
    }
    process.exit(1);
});

