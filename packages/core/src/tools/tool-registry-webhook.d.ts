/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { ToolRegistry } from './tool-registry.js';
import { Config } from '../config/config.js';
import { WebhookConfiguration } from '../config/webhook-config.js';
import { AnyDeclarativeTool } from './tools.js';
export declare class WebhookEnabledToolRegistry extends ToolRegistry {
    private webhookConfig;
    constructor(config: Config, webhookConfig?: WebhookConfiguration);
    /**
     * Override tool registration to use webhook-enabled tools when appropriate
     */
    registerTool(tool: AnyDeclarativeTool): void;
}
